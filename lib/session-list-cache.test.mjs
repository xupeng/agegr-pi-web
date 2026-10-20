import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true, moduleCache: false });

function makeTempDir(prefix = "session-list-cache-test") {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

const projectInfo = { projectRoot: "/p", branch: "main", isWorktree: false, isTopLevel: true };

test("cache file round-trips and survives reload", async () => {
  const { loadProjectCacheFile, saveProjectCacheFile } = await jiti.import("./session-list-cache.ts");
  const dir = makeTempDir();
  const cachePath = path.join(dir, "cache.json");
  const cache = { version: 1, projects: { "/p": { ts: 1000, info: projectInfo } } };
  saveProjectCacheFile(cache, cachePath);

  assert.deepEqual(loadProjectCacheFile(cachePath), cache);
  rmSync(dir, { recursive: true, force: true });
});

test("corrupt or wrong-version cache files degrade to null", async () => {
  const { loadProjectCacheFile } = await jiti.import("./session-list-cache.ts");
  const dir = makeTempDir();
  const corrupt = path.join(dir, "corrupt.json");
  writeFileSync(corrupt, "{ not json");
  assert.equal(loadProjectCacheFile(corrupt), null);

  const wrongVersion = path.join(dir, "wrong.json");
  writeFileSync(wrongVersion, JSON.stringify({ version: 99, projects: {} }));
  assert.equal(loadProjectCacheFile(wrongVersion), null);

  const missingProjects = path.join(dir, "no-projects.json");
  writeFileSync(missingProjects, JSON.stringify({ version: 1, sessions: {} }));
  assert.equal(loadProjectCacheFile(missingProjects), null);

  const missing = path.join(dir, "missing.json");
  assert.equal(loadProjectCacheFile(missing), null);
  rmSync(dir, { recursive: true, force: true });
});

test("cached projects respect the TTL", async () => {
  const { getCachedProjects, setCachedProjects } = await jiti.import("./session-list-cache.ts");
  const cache = { version: 1, projects: {} };
  setCachedProjects(cache, new Map([["/p", projectInfo]]), 1000);

  const fresh = getCachedProjects(cache, ["/p"], 1500, 600_000);
  assert.equal(fresh.get("/p").branch, "main");
  assert.equal(fresh.has("/missing"), false);

  const expired = getCachedProjects(cache, ["/p"], 1000 + 600_001, 600_000);
  assert.equal(expired.has("/p"), false);
});

test("clearCachedProjectsOnDisk drops project entries from the file", async () => {
  const { clearCachedProjectsOnDisk, loadProjectCacheFile, saveProjectCacheFile } =
    await jiti.import("./session-list-cache.ts");
  const dir = makeTempDir();
  const cachePath = path.join(dir, "cache.json");
  saveProjectCacheFile(
    { version: 1, projects: { "/p": { ts: 1000, info: projectInfo }, "/q": { ts: 1000, info: projectInfo } } },
    cachePath,
  );

  clearCachedProjectsOnDisk(cachePath);
  assert.deepEqual(loadProjectCacheFile(cachePath).projects, {});
  rmSync(dir, { recursive: true, force: true });
});

test("session list cache path lives under the agent dir", async () => {
  const dir = makeTempDir();
  process.env.PI_CODING_AGENT_DIR = dir;
  try {
    const { sessionListCachePath } = await jiti.import("./session-list-cache.ts");
    assert.equal(sessionListCachePath(), path.join(dir, "pi-web-session-list-cache.json"));
  } finally {
    delete process.env.PI_CODING_AGENT_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});
