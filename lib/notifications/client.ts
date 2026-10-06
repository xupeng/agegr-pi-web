"use client";

import type { NotificationCommand, NotificationCompletionItem, NotificationItem, NotificationSnapshot } from "./types";

export interface NotificationClientState {
  snapshot: NotificationSnapshot;
  loading: boolean;
  error: string | null;
  connected: boolean;
}

const EMPTY_SNAPSHOT: NotificationSnapshot = {
  instanceId: "", epoch: "", sequence: 0, items: [], storageHealth: "ok",
};
Object.freeze(EMPTY_SNAPSHOT.items);
Object.freeze(EMPTY_SNAPSHOT);
const SERVER_STATE: NotificationClientState = Object.freeze({
  snapshot: EMPTY_SNAPSHOT, loading: false, error: null, connected: false,
});
export const NOTIFICATION_RECONCILE_MS = 2_000;
const BATCH_SIZE = 100;
const LEGACY_KEY = "pi-web:unread-session-ids";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, max = 4096): value is string {
  return typeof value === "string" && value.length <= max;
}
function item(value: unknown): value is NotificationItem {
  if (!record(value) || !text(value.id) || !text(value.sessionId)
    || !text(value.projectKey) || !text(value.projectName) || !text(value.sessionName)
    || !text(value.summary) || !text(value.timestamp) || !Number.isFinite(Date.parse(value.timestamp))) return false;
  if (value.kind === "completion") {
    return text(value.revision) && text(value.runIdentity)
      && (value.resultEntryId === null || text(value.resultEntryId))
      && (value.completionLeafId === null || text(value.completionLeafId))
      && (value.origin === "live" || value.origin === "legacy-import");
  }
  return (value.kind === "ask" || value.kind === "extension") && text(value.requestId)
    && (value.method === undefined || (typeof value.method === "string" && ["select", "confirm", "input", "editor", "custom"].includes(value.method)));
}

/** One JSON boundary for all consumers; invalid data never becomes an empty success. */
export function decodeNotificationSnapshot(value: unknown): NotificationSnapshot {
  if (!record(value) || !text(value.instanceId) || !value.instanceId || !text(value.epoch) || !value.epoch
    || !Number.isSafeInteger(value.sequence) || typeof value.sequence !== "number" || value.sequence < 0
    || (value.storageHealth !== "ok" && value.storageHealth !== "degraded")
    || !Array.isArray(value.items) || value.items.length > 50_000 || !value.items.every(item)) {
    throw new Error("invalid-snapshot");
  }
  return value as unknown as NotificationSnapshot; // All DTO fields checked above.
}

export function notificationSessionIds(items: readonly NotificationItem[]): Set<string> {
  return new Set(items.map((entry) => entry.sessionId));
}

export function notificationProjectCounts(items: readonly NotificationItem[]): Map<string, number> {
  const projects = new Map<string, Set<string>>();
  for (const entry of items) {
    const sessions = projects.get(entry.projectKey) ?? new Set<string>();
    sessions.add(entry.sessionId);
    projects.set(entry.projectKey, sessions);
  }
  return new Map([...projects].map(([key, sessions]) => [key, sessions.size]));
}

interface ClientEnvironment {
  fetch: typeof fetch;
  createEventSource: (url: string) => EventSource;
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
}

function browserEnvironment(): ClientEnvironment | null {
  if (typeof window === "undefined") return null;
  let storage: ClientEnvironment["storage"] = null;
  try { storage = window.localStorage; } catch { /* Privacy mode. */ }
  return { fetch: window.fetch.bind(window), createEventSource: (url) => new EventSource(url), window, document, storage };
}

/** Factory is injectable for offline tests. The application uses only the singleton below. */
export function createNotificationClient(getEnvironment: () => ClientEnvironment | null = browserEnvironment) {
  let state = SERVER_STATE;
  const listeners = new Set<() => void>();
  let env: ClientEnvironment | null = null;
  let owners = 0;
  let generation = 0;
  let ticket = 0;
  let acceptedTicket = 0;
  const retiredEpochs = new Set<string>();
  const controllers = new Set<AbortController>();
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let refreshing: Promise<void> | null = null;
  let refreshAgain = false;
  let migrating: Promise<void> | null = null;
  let commandQueue: Promise<void> = Promise.resolve();
  let batch: Array<{ id: string; revision: string }> | null = null;
  let batchInstance = "";
  let syncError: string | null = null;
  let commandError: string | null = null;
  let migrationError: string | null = null;

  const publish = (changes: Partial<NotificationClientState>) => {
    const next = { ...state, ...changes, error: commandError ?? migrationError ?? syncError };
    if (Object.keys(next).every((key) => next[key as keyof NotificationClientState] === state[key as keyof NotificationClientState])) return;
    state = next;
    for (const listener of listeners) listener();
  };
  const visible = () => env?.document.visibilityState === "visible";
  const accept = (snapshot: NotificationSnapshot, requestTicket: number) => {
    const current = state.snapshot;
    const identity = `${snapshot.instanceId}:${snapshot.epoch}`;
    if (retiredEpochs.has(identity)) return;
    const sameEpoch = current.instanceId === snapshot.instanceId && current.epoch === snapshot.epoch;
    if (sameEpoch && (snapshot.sequence < current.sequence
      || (snapshot.sequence === current.sequence && requestTicket < acceptedTicket))) return;
    if (!sameEpoch && requestTicket < acceptedTicket) return;
    if (!sameEpoch && current.epoch) retiredEpochs.add(`${current.instanceId}:${current.epoch}`);
    acceptedTicket = Math.max(acceptedTicket, requestTicket);
    // Metadata can refresh without changing completion revisions. Preserve identity
    // for unchanged polls, but accept fresh labels/health even at an equal version.
    const unchanged = sameEpoch && snapshot.sequence === current.sequence
      && snapshot.storageHealth === current.storageHealth && snapshot.items.length === current.items.length
      && snapshot.items.every((entry, index) => {
        const previous = current.items[index];
        return Object.keys(entry).length === Object.keys(previous).length
          && Object.entries(entry).every(([key, value]) => previous[key as keyof NotificationItem] === value);
      });
    if (!unchanged) publish({ snapshot });
  };

  const request = async (body?: NotificationCommand): Promise<NotificationSnapshot> => {
    const currentEnv = env;
    if (!currentEnv || !owners) throw new Error("not-connected");
    const scope = generation;
    const requestTicket = ++ticket;
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await currentEnv.fetch("/api/notifications", {
        method: body ? "POST" : "GET", cache: "no-store", signal: controller.signal,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error(`notification-http-${response.status}`);
      const payload: unknown = await response.json();
      const snapshot = decodeNotificationSnapshot(body && record(payload) ? payload.snapshot : payload);
      if (scope !== generation || !owners) throw new Error("obsolete-request");
      accept(snapshot, requestTicket);
      return snapshot;
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
    }
  };

  const importLegacy = async () => {
    if (migrating || !env?.storage || !state.snapshot.instanceId) return;
    const storage = env.storage;
    const instanceId = state.snapshot.instanceId;
    const scope = generation;
    migrating = Promise.resolve().then(async () => {
      try {
        const marker = `pi-web:notifications:legacy-import:${instanceId}`;
        if (storage.getItem(marker) === "done") return;
        const raw = storage.getItem(LEGACY_KEY);
        if (!raw) return;
        if (raw.length > 1_000_000) throw new Error("invalid-legacy");
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length > 10_000
          || !parsed.every((id) => text(id, 256) && id.length > 0)) throw new Error("invalid-legacy");
        const ids = [...new Set<string>(parsed)];
        for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
          if (scope !== generation || state.snapshot.instanceId !== instanceId) throw new Error("obsolete-import");
          await request({ type: "import_legacy", instanceId, sessionIds: ids.slice(offset, offset + BATCH_SIZE) });
        }
        if (scope !== generation || state.snapshot.instanceId !== instanceId) throw new Error("obsolete-import");
        // Never erase input changed by an old tab during the import.
        if (storage.getItem(LEGACY_KEY) !== raw) throw new Error("changed-legacy");
        storage.setItem(marker, "done");
        storage.removeItem(LEGACY_KEY);
        migrationError = null;
      } catch {
        if (scope === generation) migrationError = "legacy-import-failed";
      } finally {
        if (scope === generation) { migrating = null; publish({}); }
      }
    });
    await migrating;
  };

  const refresh = (): Promise<void> => {
    if (refreshing) return refreshing;
    if (!owners || !env) return Promise.resolve();
    const scope = generation;
    publish({ loading: !state.snapshot.instanceId });
    refreshing = (async () => {
      let succeeded = false;
      try {
        do {
          refreshAgain = false;
          await request();
          succeeded = true;
          syncError = null;
        } while (refreshAgain && scope === generation);
      } catch {
        if (scope === generation) syncError = "sync-failed";
      } finally {
        if (scope === generation) { refreshing = null; publish({ loading: false }); }
      }
      if (scope === generation && succeeded) await importLegacy();
    })();
    return refreshing;
  };
  const reconcile = () => {
    if (refreshing) refreshAgain = true;
    void refresh();
  };
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
  const poll = () => {
    clearTimer();
    if (!owners || !visible()) return;
    timer = setTimeout(() => { reconcile(); poll(); }, NOTIFICATION_RECONCILE_MS);
  };
  const visibility = () => { if (visible()) { reconcile(); poll(); } else clearTimer(); };
  const online = () => { reconcile(); poll(); };
  const offline = () => { syncError = "offline"; publish({ connected: false }); };

  const start = (): (() => void) => {
    const nextEnv = env ?? getEnvironment();
    if (!nextEnv) return () => {};
    owners += 1;
    if (owners === 1) {
      env = nextEnv;
      generation += 1;
      const scope = generation;
      env.document.addEventListener("visibilitychange", visibility);
      env.window.addEventListener("online", online);
      env.window.addEventListener("offline", offline);
      try {
        const connection = env.createEventSource("/api/notifications/events");
        source = connection;
        const current = () => scope === generation && source === connection;
        connection.onopen = () => { if (current()) { publish({ connected: true }); reconcile(); } };
        connection.onerror = () => { if (current()) { syncError = "disconnected"; publish({ connected: false }); } };
        const invalidation = () => { if (current()) reconcile(); };
        connection.onmessage = invalidation;
        connection.addEventListener("connected", invalidation);
        connection.addEventListener("invalidation", invalidation);
        connection.addEventListener("health", invalidation);
      } catch { syncError = "disconnected"; publish({ connected: false }); }
      reconcile();
      poll();
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      owners -= 1;
      if (owners) return;
      generation += 1;
      clearTimer();
      source?.close(); source = null;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      env?.document.removeEventListener("visibilitychange", visibility);
      env?.window.removeEventListener("online", online);
      env?.window.removeEventListener("offline", offline);
      env = null; refreshing = null; migrating = null; refreshAgain = false;
      publish({ connected: false, loading: false });
    };
  };

  const enqueue = (action: () => Promise<void>): Promise<void> => {
    const scope = generation;
    const operation = commandQueue.catch(() => {}).then(async () => {
      try {
        if (scope !== generation) throw new Error("obsolete-command");
        await action();
        if (scope === generation) { commandError = null; publish({}); }
      } catch {
        if (scope === generation) { commandError = "ack-failed"; publish({}); }
        throw new Error("ack-failed");
      }
    });
    commandQueue = operation;
    return operation;
  };
  const acknowledge = (entry: NotificationCompletionItem): Promise<void> => {
    const observed: NotificationCommand = { type: "ack", id: entry.id, revision: entry.revision };
    return enqueue(async () => { await request(observed); });
  };
  const acknowledgeAll = (): Promise<void> => {
    // On a partial failure the next explicit retry uses ONLY the remaining frozen versions.
    if (!batch || batchInstance !== state.snapshot.instanceId) {
      batchInstance = state.snapshot.instanceId;
      batch = state.snapshot.items.filter((entry): entry is NotificationCompletionItem => entry.kind === "completion")
        .map(({ id, revision }) => ({ id, revision }));
    }
    const frozen = batch;
    const instance = batchInstance;
    return enqueue(async () => {
      while (frozen.length) {
        if (state.snapshot.instanceId !== instance) throw new Error("instance-changed");
        const chunk = frozen.slice(0, BATCH_SIZE);
        await request({ type: "ack_many", items: chunk });
        frozen.splice(0, chunk.length);
      }
      if (batch === frozen) batch = null;
    });
  };

  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    getServerSnapshot: () => SERVER_STATE,
    start, refresh, acknowledge, acknowledgeAll,
  };
}

const client = createNotificationClient();
export const subscribeNotifications = client.subscribe;
export const getNotificationClientSnapshot = client.getSnapshot;
export const getNotificationServerSnapshot = client.getServerSnapshot;
export const startNotificationClient = client.start;
export const refreshNotifications = client.refresh;
export const acknowledgeNotification = client.acknowledge;
export const acknowledgeAllNotifications = client.acknowledgeAll;
