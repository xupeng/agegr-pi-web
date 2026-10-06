import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
const root = mkdtempSync(join(tmpdir(), "notification-runtime-"));
const previous = { HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR, PI_WEB_DISABLE_MCP: process.env.PI_WEB_DISABLE_MCP };
process.env.HOME = join(root, "home");
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
process.env.PI_WEB_DISABLE_MCP = "1";
mkdirSync(process.env.HOME);
test.after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
});
const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() }, moduleCache: false });
const { NotificationRuntime, readNotificationMetadata } = await jiti.import("./runtime.ts");
const { NotificationStore } = await jiti.import("./store.ts");
const ask = (askId = "ask1") => ({ askId, askedAt: "2026-10-06T01:00:00Z", questions: [{ id: "q", question: "Choose next step", options: [] }] });
const info = (id) => ({ id, cwd: root, path: "", name: `Session ${id}`, firstMessage: "", projectKey: "project" });
const completion = (sessionId = "s1", runIdentity = "run1") => ({ sessionId, runIdentity, resultEntryId: "entry", completionLeafId: "leaf", completedAt: "2026-10-06T00:00:00Z", summary: "Done" });
function setup(options = {}) {
  const store = new NotificationStore({ load: () => null, save: () => {} });
  let sessions = [];
  let mirrorReads = 0;
  const runtime = new NotificationRuntime({ store, sessions: () => sessions,
    loadAsks: () => { mirrorReads++; return new Map([["s1", ask()]]); }, readMetadata: async (id) => info(id), ...options });
  return { store, runtime, setSessions: (value) => { sessions = value; store.invalidate(); }, mirrorReads: () => mirrorReads };
}
test("pending is a read-only projection; live null veto persists when wrapper disappears", async () => {
  const f = setup();
  assert.equal((await f.runtime.snapshot()).items[0].kind, "ask");
  f.store.record(completion());
  assert.deepEqual((await f.runtime.snapshot()).items.map((i) => i.kind), ["ask", "completion"]);
  f.store.acknowledge(f.store.completions());
  assert.equal((await f.runtime.snapshot()).items[0].kind, "ask", "ack never closes pending");
  f.setSessions([{ sessionId: "s1", cwd: root, pendingAsk: null, extensionRequests: [] }]);
  assert.deepEqual((await f.runtime.snapshot()).items, []);
  f.setSessions([]);
  assert.deepEqual((await f.runtime.snapshot()).items, [], "stale disk ask must not resurrect after destroy");
  assert.equal(f.mirrorReads(), 1);
});
test("live ask is retained for mirror fallback without rebuilding wrappers", async () => {
  const f = setup();
  f.setSessions([{ sessionId: "s2", cwd: root, pendingAsk: ask("new"), extensionRequests: [] }]);
  f.setSessions([]);
  assert.ok((await f.runtime.snapshot()).items.some((i) => i.requestId === "new"));
  assert.equal(f.mirrorReads(), 1);
});
test("ordinary extension/custom DTO is compact, stable across redraw, and not persisted", async () => {
  const f = setup({ loadAsks: () => new Map() });
  const request = { type: "extension_ui_request", id: "custom1", method: "custom", lines: ["private full render"] };
  f.setSessions([{ sessionId: "s1", cwd: root, pendingAsk: null, extensionRequests: [{ request, requestedAt: "2026-10-06T02:00:00Z" }] }]);
  const first = (await f.runtime.snapshot()).items[0];
  assert.equal(first.kind, "extension");
  assert.doesNotMatch(JSON.stringify(first), /private full render|lines/);
  request.lines = ["redraw"];
  f.store.invalidate();
  const second = (await f.runtime.snapshot()).items[0];
  assert.equal(second.id, first.id);
  assert.equal(second.timestamp, first.timestamp);
  assert.deepEqual(f.store.completions(), []);
  f.setSessions([]);
  assert.deepEqual((await f.runtime.snapshot()).items, []);
});
test("metadata reads are targeted, cached, single-flight and globally bounded to four", async () => {
  let active = 0;
  let max = 0;
  const reads = [];
  const f = setup({ loadAsks: () => new Map(), readMetadata: async (id) => {
    reads.push(id); active++; max = Math.max(max, active);
    await new Promise((resolve) => setTimeout(resolve, 5)); active--;
    return info(id);
  } });
  for (let i = 0; i < 15; i++) f.store.record(completion(`s${i}`));
  await Promise.all([f.runtime.snapshot(), f.runtime.snapshot(), f.runtime.snapshot()]);
  assert.equal(max, 4);
  assert.equal(reads.length, 15);
  await f.runtime.snapshot();
  assert.equal(reads.length, 15);
});
test("missing/error metadata keeps completion with a visible placeholder, never deletes", async () => {
  const f = setup({ loadAsks: () => new Map(), readMetadata: async (id) => {
    if (id === "error") throw Error("EACCES"); return null;
  } });
  f.store.record(completion("missing")); f.store.record(completion("error"));
  const snapshot = await f.runtime.snapshot();
  assert.equal(snapshot.items.length, 2);
  assert.ok(snapshot.items.every((i) => i.sessionName === "Unavailable session"));
  assert.equal(f.store.completions().length, 2);
  await assert.rejects(f.runtime.importLegacy(snapshot.instanceId, ["error"]), /metadata unavailable/);
});
test("legacy validation filters missing/subagents and live/watermark wins", async () => {
  const f = setup({ loadAsks: () => new Map(), readMetadata: async (id) => id === "missing" ? null
    : { ...info(id), ...(id === "subagent" ? { relation: { kind: "subagent" } } : {}) } });
  f.store.record(completion("live"));
  const instance = f.store.version().instanceId;
  await f.runtime.importLegacy(instance, ["legacy", "live", "missing", "subagent"]);
  assert.deepEqual(f.store.completions().map((i) => i.sessionId).sort(), ["legacy", "live"]);
  assert.equal(f.store.completions().find((i) => i.sessionId === "live").origin, "live");
  f.store.acknowledge(f.store.completions());
  await f.runtime.importLegacy(instance, ["legacy"]);
  assert.deepEqual(f.store.completions(), []);
});
test("async metadata never stamps a later version on an earlier completion snapshot", async () => {
  let release;
  const f = setup({ loadAsks: () => new Map(), readMetadata: () => new Promise((resolve) => { release = () => resolve(info("s1")); }) });
  f.store.record(completion());
  const observed = f.store.version().sequence;
  const pending = f.runtime.snapshot();
  f.store.record(completion("s1", "run2"));
  release();
  const snapshot = await pending;
  assert.equal(snapshot.sequence, observed);
  assert.equal(snapshot.items[0].runIdentity, "run1");
});
test("failed deletion release restores mirrored ask; actual deletion and late events stay hidden", async () => {
  const f = setup();
  const release = f.store.beginDeletion(["s1"]);
  assert.deepEqual((await f.runtime.snapshot()).items, []);
  release();
  assert.equal((await f.runtime.snapshot()).items[0].kind, "ask");
  f.store.forget("s1");
  f.store.record(completion());
  assert.deepEqual((await f.runtime.snapshot()).items, []);
});
test("default missing metadata lookup never takes the session catalogue fallback", async () => {
  assert.equal(await readNotificationMetadata("no-such-session"), null);
  assert.equal(globalThis.__piSessionListCache, undefined);
  assert.equal(globalThis.__piSessionListPromise, undefined);
  assert.equal(existsSync(join(process.env.PI_CODING_AGENT_DIR, "pi-web-session-list-cache.json")), false);
});
test("confirmed missing mirrored asks are hidden, but lookup errors do not pretend they were deleted", async () => {
  const missing = setup({ readMetadata: async () => null });
  assert.deepEqual((await missing.runtime.snapshot()).items, []);
  const unavailable = setup({ readMetadata: async () => { throw Error("EACCES"); } });
  assert.equal((await unavailable.runtime.snapshot()).items[0].kind, "ask");
});
test("default cold lookup indexes filenames but reads only matching bounded session metadata", async () => {
  const dir = join(process.env.PI_CODING_AGENT_DIR, "sessions", "project");
  mkdirSync(dir, { recursive: true });
  const id = "targeted-id";
  writeFileSync(join(dir, `2026-10-06T00-00-00_${id}.jsonl`), [
    { type: "session", version: 3, id, cwd: root, timestamp: "2026-10-06T00:00:00Z" },
    { type: "message", id: "m1", parentId: null, timestamp: "2026-10-06T00:00:00Z", message: { role: "user", content: "Targeted fixture", timestamp: 0 } },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  writeFileSync(join(dir, "2026-10-06T00-00-00_unrelated.jsonl"), "not valid JSON\n");
  globalThis.__piSessionListGeneration = (globalThis.__piSessionListGeneration ?? 0) + 1;
  const metadata = await readNotificationMetadata(id);
  assert.equal(metadata.id, id);
  assert.equal(metadata.firstMessage, "Targeted fixture");
  assert.equal(globalThis.__piSessionListCache, undefined);
  assert.equal(existsSync(join(process.env.PI_CODING_AGENT_DIR, "pi-web-session-list-cache.json")), false);
});
