import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const route = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("projects route is a lightweight per-project summary endpoint", () => {
  assert.match(route, /listAllSessions\(\{ force \}\)/);
  assert.match(route, /session\.projectKey \?\? session\.projectRoot \?\? session\.cwd/);
  assert.match(route, /runningCount: entry\.ids\.filter\(\(id\) => running\.has\(id\)\)\.length/);
  assert.match(route, /\.sort\(\(a, b\) => b\.modified\.localeCompare\(a\.modified\)\)/);
  assert.match(route, /"Cache-Control": "no-store"/);
});

test("projects endpoint groups sessions by stable project identity", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "projects-route-"));
  const sessionsDir = path.join(dir, "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = dir;

  const cwdA = "/tmp/proj-a";
  const cwdB = "/tmp/proj-b";
  const dirA = path.join(sessionsDir, "--tmp--proj-a");
  const dirB = path.join(sessionsDir, "--tmp--proj-b");
  mkdirSync(dirA, { recursive: true });
  mkdirSync(dirB, { recursive: true });

  const sessionFile = (dir, fileName, id, timestamp, cwd) => {
    writeFileSync(path.join(dir, fileName),
      JSON.stringify({ type: "session", version: 3, id, timestamp, cwd }) + "\n" +
      JSON.stringify({ type: "message", id: "m1", parentId: null, message: { role: "user", content: "hi" }, timestamp }) + "\n");
  };
  sessionFile(dirA, "2026-01-01T00-00-00-000Z_a1.jsonl", "a1", "2026-01-01T00:00:00.000Z", cwdA);
  sessionFile(dirA, "2026-01-01T00-00-01-000Z_a2.jsonl", "a2", "2026-01-01T00:01:00.000Z", cwdA);
  sessionFile(dirB, "2026-01-01T00-00-02-000Z_b1.jsonl", "b1", "2026-01-01T00:02:00.000Z", cwdB);

  try {
    globalThis.__piSessionListCache = undefined;
    globalThis.__piSessionListPromise = undefined;
    globalThis.__piSessionListGeneration = (globalThis.__piSessionListGeneration ?? 0) + 1;
    const jiti = createJiti(import.meta.url, { tsconfigPaths: true, moduleCache: false });
    const { GET } = await jiti.import("./route.ts");
    const res = await GET(new Request("http://localhost/api/projects"));
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.projects.length, 2);
    // Sorted by most recent activity: proj-b touched later.
    assert.equal(data.projects[0].root, cwdB);
    assert.equal(data.projects[0].sessionCount, 1);
    assert.deepEqual(data.projects[0].sessionIds, ["b1"]);
    assert.equal(data.projects[0].runningCount, 0);
    assert.equal(data.projects[1].root, cwdA);
    assert.equal(data.projects[1].sessionCount, 2);
    assert.deepEqual(data.projects[1].sessionIds, ["a1", "a2"]);
    assert.equal(data.projects[1].modified, "2026-01-01T00:01:00.000Z");
    assert.ok(Array.isArray(data.runningSessionIds));
  } finally {
    delete process.env.PI_CODING_AGENT_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});
