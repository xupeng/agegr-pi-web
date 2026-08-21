import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { createReadStream } from "fs";
import { readFileSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";
import { writePrivateFileAtomicSync } from "./atomic-file";

// ============================================================================
// Persistent incremental cache for the session list.
//
// `SessionManager.listAll()` re-parses *every* session .jsonl on every cold
// scan (measured: ~3.4s for 2991 files / 846 MB). The UI only needs the
// computed summary per file, so we cache it on disk keyed by file mtime:
//   - unchanged file  -> reuse cached summary (stat-only, ~46ms for 2991)
//   - new/changed file -> re-read just that file via readSessionInfoFast()
//   - deleted file     -> dropped because the scan iterates live files only
// Project info (git-backed) is cached alongside with a TTL that mirrors the
// in-memory cache in worktree.ts; worktree add/remove clears it eagerly.
// ============================================================================

export interface CachedSessionEntry {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  /** ISO timestamp of the first session header line */
  created: string;
  /** ISO timestamp: last message activity, else header time, else file mtime */
  modified: string;
  messageCount: number;
  firstMessage: string;
  /** Raw parentSession path from the header; caller resolves it to an id */
  parentSessionPath?: string;
}

/** Structural twin of ProjectInfo in worktree.ts (kept local to avoid a
 *  dependency cycle: worktree.ts needs to clear this cache). */
export interface CachedProjectInfo {
  projectRoot: string;
  branch: string | null;
  isWorktree: boolean;
  isTopLevel: boolean;
}

export interface SessionListCacheFile {
  version: 1;
  sessions: Record<string, { mtimeMs: number; info: CachedSessionEntry }>;
  projects: Record<string, { ts: number; info: CachedProjectInfo }>;
}

const CACHE_VERSION = 1;
const CACHE_PATH = join(getAgentDir(), "pi-web-session-list-cache.json");

export function sessionListCachePath(): string {
  return CACHE_PATH;
}

/** Read the cache file; null when missing, corrupt, or from a future version. */
export function loadSessionListCacheFile(cachePath: string = CACHE_PATH): SessionListCacheFile | null {
  try {
    const raw = readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw) as SessionListCacheFile;
    if (parsed?.version !== CACHE_VERSION) return null;
    if (!parsed.sessions || typeof parsed.sessions !== "object") return null;
    if (!parsed.projects || typeof parsed.projects !== "object") parsed.projects = {};
    return parsed;
  } catch {
    return null;
  }
}

/** Best-effort atomic write; failures never propagate to the caller. */
export function saveSessionListCacheFile(
  cache: SessionListCacheFile,
  cachePath: string = CACHE_PATH,
): void {
  try {
    writePrivateFileAtomicSync(cachePath, JSON.stringify(cache));
  } catch {
    // cache is a performance optimization; never fail the request over it
  }
}

function parseSessionEntryLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isMessageWithContent(message: unknown): message is Record<string, unknown> {
  return typeof message === "object" && message !== null && typeof (message as { role?: unknown }).role === "string" && "content" in (message as Record<string, unknown>);
}

function extractTextContent(message: Record<string, unknown>): string | undefined {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .filter((block): block is Record<string, unknown> => typeof block === "object" && block !== null && (block as { type?: unknown }).type === "text")
    .map((block) => String(block.text ?? ""))
    .join(" ");
}

function getMessageActivityTime(entry: Record<string, unknown>): number | undefined {
  const message = entry.message;
  if (!isMessageWithContent(message)) return undefined;
  const role = message.role;
  if (role !== "user" && role !== "assistant") return undefined;
  const msgTimestamp = message.timestamp;
  if (typeof msgTimestamp === "number") return msgTimestamp;
  const t = new Date(String(entry.timestamp ?? "")).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/**
 * Compute the session summary for a single .jsonl file — same semantics as
 * pi's SessionManager.buildSessionInfo (header validation, messageCount,
 * firstMessage, lastActivityTime, name, modified priority) but without the
 * unused allMessagesText accumulation. Returns null for malformed files.
 */
export async function readSessionInfoFast(
  filePath: string,
  mtimeMs: number,
): Promise<CachedSessionEntry | null> {
  try {
    let header: { id: string; cwd?: string; timestamp?: string; parentSession?: string } | null = null;
    let messageCount = 0;
    let firstMessage = "";
    let name: string | undefined;
    let lastActivityTime: number | undefined;

    const rl = createInterface({
      input: createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      const entry = parseSessionEntryLine(line);
      if (!entry) continue;
      if (!header) {
        if (entry.type !== "session" || typeof entry.id !== "string") return null;
        header = { id: entry.id, cwd: typeof entry.cwd === "string" ? entry.cwd : undefined, timestamp: typeof entry.timestamp === "string" ? entry.timestamp : undefined, parentSession: typeof entry.parentSession === "string" ? entry.parentSession : undefined };
        continue;
      }
      if (entry.type === "session_info") {
        name = typeof entry.name === "string" ? entry.name.trim() || undefined : undefined;
        continue;
      }
      if (entry.type !== "message") continue;
      messageCount++;
      const activityTime = getMessageActivityTime(entry);
      if (typeof activityTime === "number") lastActivityTime = Math.max(lastActivityTime ?? 0, activityTime);
      const message = entry.message;
      if (!isMessageWithContent(message)) continue;
      if (message.role !== "user" && message.role !== "assistant") continue;
      const textContent = extractTextContent(message);
      if (!textContent) continue;
      if (!firstMessage && message.role === "user") firstMessage = textContent;
    }
    if (!header) return null;

    const headerTime = header.timestamp !== undefined ? new Date(header.timestamp).getTime() : NaN;
    const modified =
      typeof lastActivityTime === "number" && lastActivityTime > 0
        ? new Date(lastActivityTime)
        : !Number.isNaN(headerTime)
          ? new Date(headerTime)
          : new Date(mtimeMs);
    return {
      path: filePath,
      id: header.id,
      cwd: header.cwd ?? "",
      name,
      created: new Date(header.timestamp ?? mtimeMs).toISOString(),
      modified: modified.toISOString(),
      messageCount,
      firstMessage: firstMessage || "(no messages)",
      parentSessionPath: header.parentSession,
    };
  } catch {
    return null;
  }
}

/** Project infos whose TTL has not expired, keyed by cwd. */
export function getCachedProjects(
  cache: SessionListCacheFile | null,
  cwds: readonly string[],
  now: number,
  ttlMs: number,
): Map<string, CachedProjectInfo> {
  const result = new Map<string, CachedProjectInfo>();
  if (!cache) return result;
  for (const cwd of cwds) {
    const entry = cache.projects[cwd];
    if (entry && now - entry.ts < ttlMs) result.set(cwd, entry.info);
  }
  return result;
}

export function setCachedProjects(
  cache: SessionListCacheFile,
  projects: ReadonlyMap<string, CachedProjectInfo>,
  now: number,
): void {
  for (const [cwd, info] of projects) cache.projects[cwd] = { ts: now, info };
}

/** Drop all cached project entries (called when worktrees are added/removed). */
export function clearCachedProjects(cache: SessionListCacheFile | null): SessionListCacheFile | null {
  if (!cache) return null;
  cache.projects = {};
  return cache;
}

/** Best-effort on-disk equivalent of clearCachedProjects; safe to call from
 *  modules that must not import session-reader (avoids dependency cycles). */
export function clearCachedProjectsOnDisk(cachePath: string = CACHE_PATH): void {
  const cache = loadSessionListCacheFile(cachePath);
  if (!cache) return;
  cache.projects = {};
  saveSessionListCacheFile(cache, cachePath);
}
