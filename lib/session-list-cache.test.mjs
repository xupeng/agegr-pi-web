import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true, moduleCache: false });

function makeTempDir(prefix = "session-list-cache-test") {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sessionJsonl(opts = {}) {
  const lines = [
    JSON.stringify({
      type: "session",
      version: 3,
      id: opts.id ?? "sess-1",
      timestamp: opts.timestamp ?? "2026-01-01T00:00:00.000Z",
      cwd: opts.cwd ?? "/tmp/proj",
      ...(opts.parentSession ? { parentSession: opts.parentSession } : {}),
    }),
    JSON.stringify({
      type: "model_change",
      id: "m1",
      parentId: null,
      provider: "x",
      modelId: "y",
      timestamp: "2026-01-01T00:00:30.000Z",
    }),
    JSON.stringify({
      type: "message",
      id: "m2",
      parentId: null,
      message: { role: "user", content: "hello world" },
      timestamp: "2026-01-01T00:01:00.000Z",
    }),
    JSON.stringify({
      type: "message",
      id: "m3",
      parentId: "m2",
      message: { role: "assistant", content: [{ type: "text", text: "hi there" }] },
      timestamp: "2026-01-01T00:02:00.000Z",
    }),
    ...(opts.name !== undefined
      ? [JSON.stringify({ type: "session_info", id: "si1", parentId: null, name: opts.name })]
      : []),
  ];
  return lines.join("\n") + "\n";
}

test("readSessionInfoFast parses a session file with the same semantics as pi", async () => {
  const { readSessionInfoFast } = await jiti.import("./session-list-cache.ts");
  const dir = makeTempDir();
  const file = path.join(dir, "s.jsonl");
  writeFileSync(file, sessionJsonl({ name: "  My Session  " }));
  const mtime = statSync(file).mtimeMs;

  const info = await readSessionInfoFast(file, mtime);
  assert.equal(info.id, "sess-1");
  assert.equal(info.cwd, "/tmp/proj");
  assert.equal(info.name, "My Session"); // trimmed
  assert.equal(info.messageCount, 2);
  assert.equal(info.firstMessage, "hello world");
  assert.equal(info.created, "2026-01-01T00:00:00.000Z");
  assert.equal(info.modified, "2026-01-01T00:02:00.000Z"); // latest message activity
  assert.equal(info.parentSessionPath, undefined);
  rmSync(dir, { recursive: true, force: true });
});

test("readSessionInfoFast falls back to header time / mtime when no messages", async () => {
  const { readSessionInfoFast } = await jiti.import("./session-list-cache.ts");
  const dir = makeTempDir();
  const file = path.join(dir, "empty.jsonl");
  writeFileSync(file, JSON.stringify({ type: "session", version: 3, id: "s0", timestamp: "2026-02-01T00:00:00.000Z", cwd: "/p" }) + "\n");
  const mtime = statSync(file).mtimeMs;

  const info = await readSessionInfoFast(file, mtime);
  assert.equal(info.id, "s0");
  assert.equal(info.messageCount, 0);
  assert.equal(info.firstMessage, "(no messages)");
  assert.equal(info.modified, "2026-02-01T00:00:00.000Z");
  rmSync(dir, { recursive: true, force: true });
});

test("readSessionInfoFast returns null for malformed files", async () => {
  const { readSessionInfoFast } = await jiti.import("./session-list-cache.ts");
  const dir = makeTempDir();
  const file = path.join(dir, "bad.jsonl");
  writeFileSync(file, '{"type":"message","id":"x"}\n');

  const info = await readSessionInfoFast(file, statSync(file).mtimeMs);
  assert.equal(info, null);
  rmSync(dir, { recursive: true, force: true });
});

test("cache file round-trips and survives reload", async () => {
  const { loadSessionListCacheFile, saveSessionListCacheFile } = await jiti.import("./session-list-cache.ts");
  const dir = makeTempDir();
  const cachePath = path.join(dir, "cache.json");
  const cache = {
    version: 1,
    sessions: {
      "/s/a.jsonl": {
        mtimeMs: 123.5,
        info: { path: "/s/a.jsonl", id: "a", cwd: "/p", created: "t", modified: "t", messageCount: 1, firstMessage: "x" },
      },
    },
    projects: { "/p": { ts: 1000, info: { projectRoot: "/p", branch: "main", isWorktree: false, isTopLevel: true } } },
  };
  saveSessionListCacheFile(cache, cachePath);

  const loaded = loadSessionListCacheFile(cachePath);
  assert.deepEqual(loaded, cache);
  assert.equal(loaded.sessions["/s/a.jsonl"].mtimeMs, 123.5);
  rmSync(dir, { recursive: true, force: true });
});

test("corrupt or wrong-version cache files degrade to null", async () => {
  const { loadSessionListCacheFile } = await jiti.import("./session-list-cache.ts");
  const dir = makeTempDir();
  const corrupt = path.join(dir, "corrupt.json");
  writeFileSync(corrupt, "{ not json");
  assert.equal(loadSessionListCacheFile(corrupt), null);

  const wrongVersion = path.join(dir, "wrong.json");
  writeFileSync(wrongVersion, JSON.stringify({ version: 99, sessions: {} }));
  assert.equal(loadSessionListCacheFile(wrongVersion), null);

  const missing = path.join(dir, "missing.json");
  assert.equal(loadSessionListCacheFile(missing), null);
  rmSync(dir, { recursive: true, force: true });
});

test("cached projects respect the TTL", async () => {
  const { getCachedProjects, setCachedProjects } = await jiti.import("./session-list-cache.ts");
  const cache = { version: 1, sessions: {}, projects: {} };
  setCachedProjects(cache, new Map([["/p", { projectRoot: "/p", branch: "main", isWorktree: false, isTopLevel: true }]]), 1000);

  const fresh = getCachedProjects(cache, ["/p"], 1500, 600_000);
  assert.equal(fresh.get("/p").branch, "main");
  assert.equal(fresh.has("/missing"), false);

  const expired = getCachedProjects(cache, ["/p"], 1000 + 600_001, 600_000);
  assert.equal(expired.has("/p"), false);
});

test("clearCachedProjectsOnDisk drops project entries from the file", async () => {
  const { clearCachedProjectsOnDisk, loadSessionListCacheFile, saveSessionListCacheFile } =
    await jiti.import("./session-list-cache.ts");
  const dir = makeTempDir();
  const cachePath = path.join(dir, "cache.json");
  saveSessionListCacheFile(
    {
      version: 1,
      sessions: { "/s/a.jsonl": { mtimeMs: 1, info: { path: "/s/a.jsonl", id: "a", cwd: "/p", created: "t", modified: "t", messageCount: 0, firstMessage: "" } } },
      projects: { "/p": { ts: 1000, info: { projectRoot: "/p", branch: "main", isWorktree: false, isTopLevel: true } } },
    },
    cachePath,
  );

  clearCachedProjectsOnDisk(cachePath);
  const loaded = loadSessionListCacheFile(cachePath);
  assert.deepEqual(loaded.projects, {});
  assert.ok(loaded.sessions["/s/a.jsonl"]); // sessions untouched
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
