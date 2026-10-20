import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "fs";
import { join } from "path";
import { writePrivateFileAtomicSync } from "./atomic-file";

// ============================================================================
// Persistent cache for the git-backed project info of the session catalogue.
//
// Session-file scanning lives in ./session-list-scanner.ts (upstream #1259):
// it keeps its own index in `pi-web-session-index.json` and resumes a growing
// file from where its last scan stopped. What upstream does not cache is the
// per-cwd project info: `resolveProject()` shells out to git, and the sidebar
// asks for the same few dozen cwds on every cold start. This file memoizes
// those results with the same 10-minute TTL as worktree.ts's in-memory cache;
// worktree add/remove clears it eagerly through `clearCachedProjectsOnDisk()`.
// ============================================================================

/** Structural twin of ProjectInfo in worktree.ts (kept local to avoid a
 *  dependency cycle: worktree.ts needs to clear this cache). */
export interface CachedProjectInfo {
  projectRoot: string;
  branch: string | null;
  isWorktree: boolean;
  isTopLevel: boolean;
}

export interface ProjectInfoCacheFile {
  version: 1;
  projects: Record<string, { ts: number; info: CachedProjectInfo }>;
}

const CACHE_VERSION = 1;
const CACHE_PATH = join(getAgentDir(), "pi-web-session-list-cache.json");

export function sessionListCachePath(): string {
  return CACHE_PATH;
}

/** Read the cache file; null when missing, corrupt, or from a future version. */
export function loadProjectCacheFile(cachePath: string = CACHE_PATH): ProjectInfoCacheFile | null {
  try {
    const raw = readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw) as ProjectInfoCacheFile;
    if (parsed?.version !== CACHE_VERSION) return null;
    if (!parsed.projects || typeof parsed.projects !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Best-effort atomic write; failures never propagate to the caller. */
export function saveProjectCacheFile(
  cache: ProjectInfoCacheFile,
  cachePath: string = CACHE_PATH,
): void {
  try {
    writePrivateFileAtomicSync(cachePath, JSON.stringify(cache));
  } catch {
    // cache is a performance optimization; never fail the request over it
  }
}

export function emptyProjectCacheFile(): ProjectInfoCacheFile {
  return { version: CACHE_VERSION, projects: {} };
}

/** Entries for `cwds` that are still within `ttlMs` of `now` (ms epoch). */
export function getCachedProjects(
  cache: ProjectInfoCacheFile | null,
  cwds: readonly string[],
  now: number,
  ttlMs: number,
): Map<string, CachedProjectInfo> {
  const hits = new Map<string, CachedProjectInfo>();
  if (!cache) return hits;
  for (const cwd of cwds) {
    const entry = cache.projects[cwd];
    if (entry && now - entry.ts < ttlMs) hits.set(cwd, entry.info);
  }
  return hits;
}

/** Store freshly resolved project info in `cache`, keeping other entries. */
export function setCachedProjects(
  cache: ProjectInfoCacheFile,
  projectByCwd: Map<string, CachedProjectInfo>,
  now: number,
): ProjectInfoCacheFile {
  for (const [cwd, info] of projectByCwd) {
    cache.projects[cwd] = { ts: now, info };
  }
  return cache;
}

/** Drop every cached project entry (worktree add/remove invalidates all of them). */
export function clearCachedProjects(cache: ProjectInfoCacheFile | null): ProjectInfoCacheFile | null {
  if (!cache) return null;
  cache.projects = {};
  return cache;
}

export function clearCachedProjectsOnDisk(cachePath: string = CACHE_PATH): void {
  const cache = loadProjectCacheFile(cachePath);
  if (!cache) return;
  cache.projects = {};
  saveProjectCacheFile(cache, cachePath);
}
