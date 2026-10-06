import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadOpenAsks, type PersistedOpenAsk } from "../ask-user/persist";
import { getRpcNotificationSnapshots, getRpcSession } from "../rpc-manager";
import { attachSessionProjectInfo, cacheSessionPath, getAgentDir, readSessionById, readSessionHeader } from "../session-reader";
import type { SessionInfo } from "../types";
import { getNotificationStore, type NotificationStore } from "./store";
import {
  notificationSummary, type NotificationAttentionItem, type NotificationDisplayMetadata,
  type NotificationItem, type NotificationRuntimeSession, type NotificationSnapshot,
} from "./types";

interface RuntimeOptions {
  store: NotificationStore;
  sessions: () => NotificationRuntimeSession[];
  loadAsks: () => Map<string, PersistedOpenAsk>;
  readMetadata: (id: string) => Promise<SessionInfo | null>;
  metadataGeneration?: () => number;
}
type Metadata = { display: NotificationDisplayMetadata; exists: boolean; suppressed: boolean; missing?: boolean };

/** Read-only projection. Never rebuilds sessions, renews leases, or reads transcript trees. */
export class NotificationRuntime {
  private readonly asks: Map<string, PersistedOpenAsk>;
  private readonly metadata = new Map<string, { value: Metadata; expires: number; generation: number }>();
  private readonly inflight = new Map<string, Promise<Metadata>>();
  private activeReads = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly options: RuntimeOptions) {
    this.asks = options.loadAsks(); // One mirror load per process, not per poll.
    this.captureSessions();
    options.store.subscribe(() => { this.captureSessions(); });
  }
  private captureSessions(): NotificationRuntimeSession[] {
    const sessions = this.options.sessions();
    for (const session of sessions) {
      if (session.pendingAsk) this.asks.set(session.sessionId, session.pendingAsk);
      else this.asks.delete(session.sessionId); // Live null vetoes a stale disk mirror.
    }
    return sessions;
  }
  async snapshot(): Promise<NotificationSnapshot> {
    const version = this.options.store.version();
    const sessions = this.captureSessions();
    const pending: Array<Omit<NotificationAttentionItem, keyof NotificationDisplayMetadata>> = [];
    for (const [sessionId, ask] of this.asks) {
      if (this.options.store.isDeleting(sessionId)) continue;
      pending.push({ kind: "ask", id: `ask:${sessionId}:${ask.askId}`, sessionId, timestamp: ask.askedAt,
        summary: notificationSummary(ask.questions.map((q) => q.question).join(" ")), requestId: ask.askId });
    }
    for (const session of sessions) {
      if (this.options.store.isDeleting(session.sessionId)) continue;
      for (const { request, requestedAt } of session.extensionRequests) {
        if (request.method === "custom" && request.closed) continue;
        // Do not send editor prefill, answer drafts, or a full custom render.
        pending.push({ kind: "extension", id: `extension:${session.sessionId}:${request.id}`, sessionId: session.sessionId,
          timestamp: requestedAt, summary: notificationSummary(request.method === "custom" ? "Custom interaction" : request.title),
          requestId: request.id, method: request.method });
      }
    }
    const raw = [...pending, ...this.options.store.completions()];
    const byId = new Map<string, Metadata>();
    const ids = [...new Set(raw.map((item) => item.sessionId))];
    // Only notification-related ids; bounded concurrency also across overlapping requests.
    await Promise.all(ids.map(async (id) => {
      try { byId.set(id, await this.lookup(id)); }
      catch {
        const previous = this.metadata.get(id)?.value ?? { exists: false, suppressed: false, display: {
          projectKey: `unknown:${id}`, projectName: "Unknown project", sessionName: "Unavailable session",
        } };
        byId.set(id, { ...previous, missing: false });
      }
    }));
    const items: NotificationItem[] = [];
    for (const item of raw) {
      const meta = byId.get(item.sessionId);
      if (!meta || meta.suppressed || this.options.store.isDeleting(item.sessionId)) continue;
      // A successfully confirmed missing session cannot process a mirrored ask.
      // Errors use an unavailable placeholder instead; they are never "deleted".
      if (item.kind !== "completion" && meta.missing) continue;
      items.push({ ...item, ...meta.display });
    }
    items.sort((a, b) => Number(a.kind === "completion") - Number(b.kind === "completion")
      || b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id));
    // Stamp the version observed BEFORE awaits, never a newer version onto older content.
    return { ...version, items };
  }
  async importLegacy(instanceId: string, sessionIds: string[]): Promise<void> {
    if (instanceId !== this.options.store.version().instanceId) throw new Error("Notification instance mismatch");
    const valid: string[] = [];
    await Promise.all([...new Set(sessionIds)].map(async (id) => {
      const meta = await this.lookup(id, true);
      if (meta.exists && !meta.suppressed) valid.push(id);
    }));
    this.options.store.importLegacy(instanceId, valid);
  }
  private async lookup(id: string, fresh = false): Promise<Metadata> {
    const generation = this.options.metadataGeneration?.() ?? 0;
    const cached = this.metadata.get(id);
    if (!fresh && cached && cached.expires > Date.now() && cached.generation === generation) return cached.value;
    const current = this.inflight.get(id);
    if (current) return current;
    const read = this.readMetadata(id).then((value) => {
      if (this.metadata.size >= 10_000) {
        const oldest = this.metadata.keys().next().value;
        if (oldest !== undefined) this.metadata.delete(oldest);
      }
      this.metadata.set(id, { value, generation, expires: Date.now() + (value.exists ? 5000 : 1000) });
      return value;
    }).finally(() => { this.inflight.delete(id); });
    this.inflight.set(id, read);
    return read;
  }
  private async readMetadata(id: string): Promise<Metadata> {
    if (this.activeReads >= 4) await new Promise<void>((resolve) => { this.waiting.push(resolve); });
    else this.activeReads += 1;
    try {
      const info = await this.options.readMetadata(id);
      if (info) {
        const root = info.projectRoot || info.cwd;
        return { exists: true, suppressed: info.relation?.kind === "subagent", display: {
          projectKey: info.projectKey || root || `unknown:${id}`,
          projectName: notificationSummary(basename(root) || root || "Unknown project"),
          sessionName: notificationSummary(info.name || info.firstMessage || "Untitled session"),
        } };
      }
    } catch {
      // Lookup errors and malformed/missing metadata are NOT evidence of deletion.
      // Migration must fail, rather than mark the old browser key imported.
      throw new Error("Notification session metadata unavailable");
    } finally {
      const next = this.waiting.shift();
      if (next) next(); else this.activeReads -= 1;
    }
    return { exists: false, suppressed: false, missing: true, display: {
      projectKey: `unknown:${id}`, projectName: "Unknown project", sessionName: "Unavailable session",
    } };
  }
}

interface NotificationPathIndex {
  paths: Map<string, string[]>;
  expires: number;
  generation: number;
  inflight?: Promise<Map<string, string[]>>;
}
const PATH_KEY = Symbol.for("pi-web.notifications.paths.v1");
async function notificationPathCandidates(id: string): Promise<string[]> {
  const root = globalThis as typeof globalThis & { [PATH_KEY]?: NotificationPathIndex };
  const index: NotificationPathIndex = root[PATH_KEY] ??= { paths: new Map(), expires: 0, generation: -1 };
  const generation = globalThis.__piSessionListGeneration ?? 0;
  if (index.expires > Date.now() && index.generation === generation) return index.paths.get(id) ?? [];
  if (!index.inflight) {
    index.inflight = (async () => {
      const paths = new Map<string, string[]>();
      const dir = join(getAgentDir(), "sessions");
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return paths;
        throw error;
      }
      let count = 0;
      // Filename index only: no catalogue metadata scan, force refresh or SDK listAll.
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        const project = join(dir, entry.name);
        let files: string[];
        try { files = await readdir(project); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw error;
        }
        for (const file of files) {
          if (!file.endsWith(".jsonl")) continue;
          if (++count > 100_000) throw new Error("Notification path index exceeds limit");
          const separator = file.indexOf("_");
          if (separator < 0) continue;
          const sessionId = file.slice(separator + 1, -6);
          const candidates = paths.get(sessionId) ?? [];
          candidates.push(join(project, file));
          paths.set(sessionId, candidates);
        }
      }
      return paths;
    })().then((paths) => {
      index.paths = paths;
      index.generation = generation;
      index.expires = Date.now() + 5000;
      return paths;
    }).finally(() => { index.inflight = undefined; });
  }
  return (await index.inflight).get(id) ?? [];
}

function validateNotificationPaths(id: string, candidates: string[]): string | undefined {
  let found: string | undefined;
  for (const path of candidates) {
    try {
      if (readSessionHeader(path)?.id !== id) continue;
      if (found && found !== path) throw new Error("Ambiguous notification session");
      found = path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
  return found;
}

export async function readNotificationMetadata(id: string): Promise<SessionInfo | null> {
  const rpc = getRpcSession(id);
  if (rpc?.isAlive()) {
    if (rpc.hasSuppressedCompletionNotifications()) {
      // A filtered runtime is not eligible for migration/projection.
      return { id, path: "", cwd: rpc.cwd, created: "", modified: "", messageCount: 0, firstMessage: "",
        relation: { kind: "subagent", parentSessionId: "", profile: "", description: "", status: "running" } };
    }
    const header = rpc.inner.sessionManager.getHeader();
    const [info] = await attachSessionProjectInfo([{ id, path: rpc.sessionFile ?? "", cwd: header?.cwd ?? rpc.cwd,
      name: rpc.inner.sessionManager.getSessionName(), created: header?.timestamp ?? "", modified: "",
      messageCount: 0, firstMessage: "Untitled session" }]);
    return info;
  }
  // readSessionById falls back to listAllSessions on an unknown id. Avoid that
  // path: resolve filename candidates and validate only their bounded headers.
  const cached = globalThis.__piSessionPathCache?.get(id);
  const found = (cached ? validateNotificationPaths(id, [cached]) : undefined)
    ?? validateNotificationPaths(id, await notificationPathCandidates(id));
  if (!found) return null;
  cacheSessionPath(id, found);
  const info = await readSessionById(id);
  if (!info) throw new Error("Notification session metadata unavailable");
  return info;
}
const KEY = Symbol.for("pi-web.notifications.runtime.v1");
export function getNotificationRuntime(): NotificationRuntime {
  const root = globalThis as typeof globalThis & { [KEY]?: NotificationRuntime };
  return root[KEY] ??= new NotificationRuntime({ store: getNotificationStore(), sessions: getRpcNotificationSnapshots,
    loadAsks: loadOpenAsks, readMetadata: readNotificationMetadata,
    metadataGeneration: () => globalThis.__piSessionListGeneration ?? 0 });
}
export function getNotificationSnapshot(): Promise<NotificationSnapshot> { return getNotificationRuntime().snapshot(); }
