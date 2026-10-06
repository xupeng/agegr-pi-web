import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "notification-store-"));
const previous = { HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
process.env.HOME = join(root, "home");
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
mkdirSync(process.env.HOME);
test.after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
});
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { NotificationStore, NotificationStorageError, getNotificationStore } = await jiti.import("./store.ts");
const input = (sessionId = "s1", runIdentity = "run1") => ({ sessionId, runIdentity,
  resultEntryId: "entry1", completionLeafId: "leaf1", completedAt: "2026-10-06T00:00:00.000Z", summary: "Done\nresult" });
function fixture(extra = {}) {
  let disk;
  const store = new NotificationStore({ load: () => disk ?? null,
    save: (value) => { disk = structuredClone(value); }, retryDelays: [], ...extra });
  return { store, disk: () => disk };
}

test("lazy global store is stable across fresh module imports", async () => {
  const second = await createJiti(import.meta.url, { moduleCache: false }).import("./store.ts");
  assert.equal(getNotificationStore(), second.getNotificationStore());
});
test("revision ack freezes observed completions; stale ack cannot clear a newer run", () => {
  const { store, disk } = fixture();
  store.record(input());
  const old = store.completions()[0];
  assert.equal(old.summary, "Done result");
  store.invalidate(); // A new run/pending invalidation does not clear anything.
  assert.equal(store.completions()[0].revision, old.revision);
  store.record(input("s2"));
  const observed = store.completions().map(({ id, revision }) => ({ id, revision }));
  store.record(input("s1", "run2"));
  assert.notEqual(store.completions().find((c) => c.sessionId === "s1").revision, old.revision);
  store.acknowledge(observed);
  assert.deepEqual(store.completions().map((c) => c.sessionId), ["s1"]);
  assert.equal(disk().completions[0].runIdentity, "run2");
  store.acknowledge(store.completions());
  store.record(input("s1", "run2"));
  assert.deepEqual(store.completions(), [], "ack watermark blocks duplicate completion");
});
test("durable ack failure retains the item and exposes degraded health", () => {
  let fail = false;
  const { store } = fixture({ save: () => { if (fail) throw Error("offline"); } });
  store.record(input());
  const old = store.completions()[0];
  fail = true;
  assert.throws(() => store.acknowledge([old]), NotificationStorageError);
  assert.equal(store.completions()[0].revision, old.revision);
  assert.equal(store.version().storageHealth, "degraded");
  fail = false;
  store.acknowledge([old]);
  assert.equal(store.version().storageHealth, "ok");
  assert.deepEqual(store.completions(), []);
});
test("completion write failures retry only a bounded number using the latest state", async () => {
  let calls = 0;
  let fail = false;
  let disk;
  const store = new NotificationStore({ load: () => null, retryDelays: [5, 10], save: (value) => {
    calls++;
    if (fail) throw Error("disk full");
    disk = structuredClone(value);
  } });
  fail = true;
  assert.doesNotThrow(() => store.record(input()));
  assert.equal(store.version().storageHealth, "degraded");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(calls, 4, "initialization + record + two bounded retries");
  fail = false;
  store.record(input("s1", "run2"));
  assert.equal(disk.completions[0].runIdentity, "run2");
  assert.equal(store.version().storageHealth, "ok");
});
test("bad/unknown original blocks all replacement writes and commands", () => {
  let writes = 0;
  const store = new NotificationStore({ load: () => { throw Error("unknown version"); }, save: () => { writes++; } });
  store.record(input());
  assert.equal(store.completions().length, 1);
  assert.equal(store.version().storageHealth, "degraded");
  assert.throws(() => store.acknowledge(store.completions()), NotificationStorageError);
  assert.equal(writes, 0);
});
test("successful retry writes the newest dirty completion, never a frozen older attempt", async () => {
  let fail = false;
  let disk;
  const store = new NotificationStore({ load: () => null, retryDelays: [10], save: (value) => {
    if (fail) throw Error("temporary failure");
    disk = structuredClone(value);
  } });
  fail = true;
  store.record(input());
  store.record(input("s1", "run2"));
  fail = false;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(disk.completions[0].runIdentity, "run2");
  assert.equal(store.version().storageHealth, "ok");
});
test("legacy import is idempotent across ack and restart, live records win", () => {
  const { store, disk } = fixture();
  store.record(input("live"));
  const instanceId = store.version().instanceId;
  store.importLegacy(instanceId, ["legacy", "live"]);
  assert.equal(store.completions().find((c) => c.sessionId === "live").origin, "live");
  store.acknowledge(store.completions());
  const restored = new NotificationStore({ load: disk, save: () => {} });
  restored.importLegacy(instanceId, ["legacy", "live"]);
  assert.deepEqual(restored.completions(), []);
  assert.equal(restored.version().instanceId, instanceId);
  assert.notEqual(restored.version().epoch, store.version().epoch);
  assert.throws(() => restored.importLegacy("other", ["new"]), /instance mismatch/);
});
test("deletion guard is nested and release preserves failed/unremoved sessions", () => {
  const { store } = fixture();
  store.record(input());
  store.record(input("child"));
  store.record(input("fork"));
  const release = store.beginDeletion(["s1", "child"]);
  const nested = store.beginDeletion(["s1"]);
  store.record(input("s1", "late"));
  assert.equal(store.completions().find((c) => c.sessionId === "s1").runIdentity, "run1");
  store.forget("child");
  release(); release();
  assert.equal(store.isDeleting("s1"), true);
  nested();
  assert.equal(store.isDeleting("s1"), false);
  assert.equal(store.isDeleting("child"), true, "actual deleted id rejects late events even after release");
  assert.deepEqual(store.completions().map((c) => c.sessionId).sort(), ["fork", "s1"]);
});
test("subscriber exceptions do not block other listeners or agent recording", () => {
  const { store } = fixture();
  let called = 0;
  store.subscribe(() => { throw Error("bad listener"); });
  const off = store.subscribe(() => { called++; });
  store.record(input());
  off();
  store.invalidate();
  assert.equal(called, 1);
  assert.equal(store.version().sequence, 2);
});
