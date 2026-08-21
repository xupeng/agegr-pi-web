import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

// Integration tests for the incremental scan in listAllSessions(). Each test
// gets a throwaway agent dir (PI_CODING_AGENT_DIR) so the scan reads real
// session files without touching ~/.pi/agent. Each test file runs in its own
// process under `npm test`, so the environment variable is safe to set here.

const jiti = createJiti(import.meta.url, { tsconfigPaths: true, moduleCache: false });

let tempRoot;
let sessionsDir;

test.beforeEach(() => {
  tempRoot = mkdtempSync(path.join(os.tmpdir(), "session-reader-incr-"));
  sessionsDir = path.join(tempRoot, "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = tempRoot;
  // Purge shared globalThis caches so a previous test's 30s in-memory list or
  // path cache cannot leak into the fresh agent dir.
  globalThis.__piSessionListCache = undefined;
  globalThis.__piSessionListPromise = undefined;
  globalThis.__piSessionListPromiseGeneration = undefined;
  globalThis.__piSessionListGeneration = (globalThis.__piSessionListGeneration ?? 0) + 1;
  globalThis.__piSessionPathCache = undefined;
  globalThis.__piPathToSessionIdCache = undefined;
  globalThis.__piProjectCache = undefined;
});

test.afterEach(() => {
  delete process.env.PI_CODING_AGENT_DIR;
  rmSync(tempRoot, { recursive: true, force: true });
});

function writeSession(encodedCwd, fileName, opts = {}) {
  const dir = path.join(sessionsDir, encodedCwd);
  mkdirSync(dir, { recursive: true });
  const lines = [
    JSON.stringify({
      type: "session",
      version: 3,
      id: opts.id ?? `s-${fileName}`,
      timestamp: opts.timestamp ?? "2026-01-01T00:00:00.000Z",
      cwd: opts.cwd ?? "/tmp/non-git-project",
      ...(opts.parentSession ? { parentSession: opts.parentSession } : {}),
    }),
    JSON.stringify({
      type: "message",
      id: "m1",
      parentId: null,
      message: { role: "user", content: opts.firstMessage ?? "hello" },
      timestamp: "2026-01-01T00:01:00.000Z",
    }),
  ];
  const file = path.join(dir, fileName);
  writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

async function loadSessionReader() {
  return jiti.import("./session-reader.ts");
}

test("cold scan lists sessions with project info, then warm scan reuses cache", async () => {
  writeSession("--tmp--", "2026-01-01T00-00-00-000Z_a.jsonl", { id: "a", cwd: "/tmp/non-git-project" });
  writeSession("--tmp--", "2026-01-01T00-00-01-000Z_b.jsonl", { id: "b", cwd: "/tmp/non-git-project" });
  const { listAllSessions } = await loadSessionReader();

  const first = await listAllSessions();
  assert.equal(first.length, 2);
  const a = first.find((s) => s.id === "a");
  assert.equal(a.cwd, "/tmp/non-git-project");
  assert.equal(a.firstMessage, "hello");
  assert.equal(a.projectRoot, "/tmp/non-git-project");
  assert.equal(a.projectKey, "/tmp/non-git-project");
  assert.equal(a.transient, false);

  // Warm scan: same results without re-reading every file.
  const second = await listAllSessions();
  assert.equal(second.length, 2);
  assert.deepEqual(second.map((s) => s.id).sort(), ["a", "b"]);
});

test("new and modified files are picked up incrementally; deleted files drop out", async () => {
  writeSession("--tmp--", "2026-01-01T00-00-00-000Z_a.jsonl", { id: "a", cwd: "/tmp/non-git-project" });
  const { invalidateSessionListCache, listAllSessions } = await loadSessionReader();
  await listAllSessions();

  // New file appears after an invalidation.
  const cFile = writeSession("--tmp--", "2026-01-01T00-00-02-000Z_c.jsonl", { id: "c", cwd: "/tmp/non-git-project" });
  invalidateSessionListCache();
  let sessions = await listAllSessions();
  assert.deepEqual(sessions.map((s) => s.id).sort(), ["a", "c"]);

  // Existing file modified (new message appended) -> messageCount/modified update.
  const aFile = path.join(sessionsDir, "--tmp--", "2026-01-01T00-00-00-000Z_a.jsonl");
  appendFileSync(aFile, JSON.stringify({
    type: "message",
    id: "m2",
    parentId: "m1",
    message: { role: "assistant", content: "updated" },
    timestamp: "2026-01-01T00:03:00.000Z",
  }) + "\n");
  invalidateSessionListCache();
  sessions = await listAllSessions();
  const a = sessions.find((s) => s.id === "a");
  assert.equal(a.messageCount, 2);
  assert.equal(a.firstMessage, "hello"); // firstMessage unchanged
  assert.equal(a.modified, "2026-01-01T00:03:00.000Z");

  // Deleted file disappears.
  rmSync(cFile);
  invalidateSessionListCache();
  sessions = await listAllSessions();
  assert.deepEqual(sessions.map((s) => s.id), ["a"]);
});

test("parentSession path resolves to the child's id", async () => {
  const parentFile = writeSession("--tmp--", "2026-01-01T00-00-00-000Z_parent.jsonl", { id: "parent", cwd: "/tmp/non-git-project" });
  writeSession("--tmp--", "2026-01-01T00-00-01-000Z_child.jsonl", { id: "child", cwd: "/tmp/non-git-project", parentSession: parentFile });
  const { listAllSessions } = await loadSessionReader();

  const sessions = await listAllSessions();
  const child = sessions.find((s) => s.id === "child");
  assert.equal(child.parentSessionId, "parent");
});

test("force refresh waits for the in-flight scan and still returns fresh data", async () => {
  writeSession("--tmp--", "2026-01-01T00-00-00-000Z_a.jsonl", { id: "a", cwd: "/tmp/non-git-project" });
  const { listAllSessions } = await loadSessionReader();

  const [plain, forced] = await Promise.all([listAllSessions(), listAllSessions({ force: true })]);
  assert.equal(plain.length, 1);
  assert.equal(forced.length, 1);
  assert.equal(forced[0].id, "a");
});
