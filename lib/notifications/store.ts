import { randomUUID } from "node:crypto";
import { loadNotifications, saveNotifications, type NotificationsFile, type PersistedNotificationCompletion } from "./persist";
import {
  isNotificationCompletionInput, notificationSummary, NOTIFICATION_SESSION_LIMIT, NOTIFICATION_WATERMARK_LIMIT,
  type NotificationAcknowledgement, type NotificationCompletionInput, type NotificationVersion,
} from "./types";

export class NotificationStorageError extends Error {
  constructor() { super("Notification storage is unavailable; state has not been acknowledged"); }
}
export interface NotificationStoreOptions {
  load?: () => NotificationsFile | null;
  save?: (data: NotificationsFile) => void;
  retryDelays?: number[];
}

/** Synchronous transactions serialize on the event loop; no registry dependency. */
export class NotificationStore {
  private data: NotificationsFile;
  private readonly save: (data: NotificationsFile) => void;
  private readonly epoch = randomUUID();
  private sequence = 0;
  private health: "ok" | "degraded" = "ok";
  private blocked = false;
  private dirty = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly delays: number[];
  private readonly listeners = new Set<() => void>();
  private readonly deleting = new Map<string, number>();
  private readonly forgotten = new Set<string>();

  constructor(options: NotificationStoreOptions = {}) {
    this.save = options.save ?? saveNotifications;
    this.delays = options.retryDelays ?? [250, 1000, 3000, 10_000, 30_000];
    this.data = { version: 1, instanceId: randomUUID(), completions: [], watermarks: [] };
    try {
      const loaded = (options.load ?? loadNotifications)();
      if (loaded) this.data = loaded;
      else this.persist(this.data);
    } catch {
      // Never replace the only copy of corrupt/unknown data, even on retry.
      this.blocked = true;
      this.health = "degraded";
    }
  }
  version(): NotificationVersion {
    return { instanceId: this.data.instanceId, epoch: this.epoch, sequence: this.sequence, storageHealth: this.health };
  }
  completions(): PersistedNotificationCompletion[] { return this.data.completions.map((item) => ({ ...item })); }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  invalidate(): void {
    this.sequence += 1;
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* A broken subscriber cannot block another. */ }
    }
  }
  isDeleting(sessionId: string): boolean { return this.deleting.has(sessionId) || this.forgotten.has(sessionId); }
  beginDeletion(ids: string[]): () => void {
    const frozen = [...new Set(ids)];
    for (const id of frozen) this.deleting.set(id, (this.deleting.get(id) ?? 0) + 1);
    this.invalidate();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const id of frozen) {
        const count = (this.deleting.get(id) ?? 1) - 1;
        if (count) this.deleting.set(id, count); else this.deleting.delete(id);
      }
      this.invalidate();
    };
  }
  record(input: NotificationCompletionInput): void {
    if (!isNotificationCompletionInput(input) || this.isDeleting(input.sessionId)) return;
    const watermark = this.data.watermarks.find((w) => w.sessionId === input.sessionId);
    if (watermark?.runIdentity === input.runIdentity) return;
    if (!this.canAdd(input.sessionId)) { this.health = "degraded"; this.invalidate(); return; }
    const item: PersistedNotificationCompletion = {
      kind: "completion", id: `completion:${input.sessionId}`, sessionId: input.sessionId, revision: randomUUID(),
      runIdentity: input.runIdentity, resultEntryId: input.resultEntryId, completionLeafId: input.completionLeafId,
      timestamp: input.completedAt, summary: notificationSummary(input.summary), origin: "live",
    };
    this.data = this.withCompletion(this.data, item);
    this.retry = 0;
    this.persist(this.data);
    this.invalidate();
  }
  acknowledge(items: NotificationAcknowledgement[]): void {
    const frozen = new Map(items.map(({ id, revision }) => [id, revision]));
    const next = { ...this.data, completions: this.data.completions.filter((item) => frozen.get(item.id) !== item.revision) };
    this.commit(next);
  }
  importLegacy(instanceId: string, validatedSessionIds: string[]): void {
    if (instanceId !== this.data.instanceId) throw new Error("Notification instance mismatch");
    let next = this.data;
    for (const sessionId of new Set(validatedSessionIds)) {
      if (this.isDeleting(sessionId) || next.watermarks.some((w) => w.sessionId === sessionId)) continue;
      if (next.completions.length >= NOTIFICATION_SESSION_LIMIT || next.watermarks.length >= NOTIFICATION_WATERMARK_LIMIT) {
        throw new NotificationStorageError();
      }
      next = this.withCompletion(next, {
        kind: "completion", id: `completion:${sessionId}`, sessionId, revision: randomUUID(),
        runIdentity: `legacy:${randomUUID()}`, resultEntryId: null, completionLeafId: null,
        timestamp: new Date().toISOString(), summary: "Imported unread result", origin: "legacy-import",
      });
    }
    this.commit(next);
  }
  forget(sessionId: string): void {
    this.forgotten.add(sessionId);
    this.data = { ...this.data, completions: this.data.completions.filter((c) => c.sessionId !== sessionId),
      watermarks: this.data.watermarks.filter((w) => w.sessionId !== sessionId) };
    this.retry = 0;
    this.persist(this.data);
    this.invalidate();
  }
  private canAdd(id: string): boolean {
    return (this.data.completions.length < NOTIFICATION_SESSION_LIMIT || this.data.completions.some((c) => c.sessionId === id))
      && (this.data.watermarks.length < NOTIFICATION_WATERMARK_LIMIT || this.data.watermarks.some((w) => w.sessionId === id));
  }
  private withCompletion(data: NotificationsFile, item: PersistedNotificationCompletion): NotificationsFile {
    return { ...data, completions: [...data.completions.filter((c) => c.sessionId !== item.sessionId), item],
      watermarks: [...data.watermarks.filter((w) => w.sessionId !== item.sessionId), { sessionId: item.sessionId, runIdentity: item.runIdentity }] };
  }
  private commit(next: NotificationsFile): void {
    if (this.blocked) throw new NotificationStorageError();
    try { this.save(next); } catch {
      this.health = "degraded";
      this.invalidate();
      throw new NotificationStorageError();
    }
    this.data = next;
    this.dirty = false;
    this.health = "ok";
    this.cancelRetry();
    this.invalidate();
  }
  private persist(data: NotificationsFile): void {
    this.dirty = true;
    if (!this.blocked) {
      try {
        this.save(data);
        this.dirty = false;
        this.health = "ok";
        this.cancelRetry();
        return;
      } catch { /* Keep the latest completion in bounded memory. */ }
    }
    this.health = "degraded";
    if (!this.blocked && !this.timer && this.retry < this.delays.length) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (this.dirty) { this.persist(this.data); this.invalidate(); }
      }, this.delays[this.retry++]);
      this.timer.unref?.();
    }
  }
  private cancelRetry(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.retry = 0;
  }
}

const KEY = Symbol.for("pi-web.notifications.store.v1");
export function getNotificationStore(): NotificationStore {
  const root = globalThis as typeof globalThis & { [KEY]?: NotificationStore };
  return root[KEY] ??= new NotificationStore();
}
export function recordNotificationCompletion(input: NotificationCompletionInput): void { getNotificationStore().record(input); }
export function invalidateNotifications(): void { getNotificationStore().invalidate(); }
export function isNotificationSessionDeleting(sessionId: string): boolean { return getNotificationStore().isDeleting(sessionId); }
export function forgetNotificationSession(sessionId: string): void { getNotificationStore().forget(sessionId); }
export function beginNotificationSessionDeletion(ids: string[]): () => void { return getNotificationStore().beginDeletion(ids); }
export function getNotificationVersion(): NotificationVersion { return getNotificationStore().version(); }
export function subscribeNotifications(listener: () => void): () => void { return getNotificationStore().subscribe(listener); }
