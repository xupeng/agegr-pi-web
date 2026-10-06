import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { createNotificationClient, decodeNotificationSnapshot, notificationSessionIds, notificationProjectCounts } = await jiti.import("./client.ts");
const completion = (id = "a", revision = "r1") => ({
  kind: "completion", id: `completion:${id}`, sessionId: id, revision, runIdentity: `run:${revision}`,
  resultEntryId: "entry", completionLeafId: "leaf", timestamp: "2026-10-06T10:00:00Z", summary: "Done",
  origin: "live", projectKey: "project", projectName: "Project", sessionName: id,
});
const snapshot = (sequence = 1, items = [completion()], epoch = "epoch", instanceId = "instance") => ({ instanceId, epoch, sequence, items, storageHealth: "ok" });
const response = (value, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => value });
const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

function fixture(handler = () => response(snapshot())) {
  const sources = [];
  const requests = [];
  const storage = new Map();
  const doc = new EventTarget(); doc.visibilityState = "visible";
  const win = new EventTarget();
  const env = {
    document: doc, window: win,
    storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    fetch: async (url, options) => { const request = { url, ...options, body: options.body ? JSON.parse(options.body) : undefined }; requests.push(request); return handler(request, requests.length); },
    createEventSource(url) {
      const source = new EventTarget(); source.url = url; source.closed = false;
      source.close = () => { source.closed = true; };
      sources.push(source); return source;
    },
  };
  const client = createNotificationClient(() => env);
  return { client, requests, sources, storage, doc, win };
}

test("validates all discriminated DTO fields; counts deduplicate sessions but not the bell items", () => {
  const ask = { kind: "ask", id: "ask:a", sessionId: "a", requestId: "q", timestamp: "2026-10-06T12:00:00Z", summary: "Input", projectKey: "project", projectName: "Project", sessionName: "a" };
  const data = snapshot(1, [completion(), ask, completion("b")]);
  assert.equal(decodeNotificationSnapshot(data), data);
  assert.deepEqual([...notificationSessionIds(data.items)], ["a", "b"]);
  assert.equal(notificationProjectCounts(data.items).get("project"), 2);
  for (const bad of [{}, { ...data, sequence: -1 }, { ...data, items: [{ ...completion(), timestamp: "bad" }] }, { ...data, items: [{ ...ask, requestId: null }] }, { ...data, storageHealth: "unknown" }]) {
    assert.throws(() => decodeNotificationSnapshot(bad));
  }
});

test("subscriptions and SSR are stable and side-effect free; only owner starts one connection", async () => {
  const f = fixture();
  const server = f.client.getServerSnapshot();
  assert.equal(f.client.getServerSnapshot(), server);
  assert.equal(f.client.getSnapshot(), server);
  assert.ok(Object.isFrozen(server));
  assert.ok(Object.isFrozen(server.snapshot));
  assert.ok(Object.isFrozen(server.snapshot.items));
  const unsubscribe = f.client.subscribe(() => {});
  assert.equal(f.requests.length, 0);
  const stop1 = f.client.start(); const stop2 = f.client.start();
  await f.client.refresh();
  assert.equal(f.sources.length, 1);
  assert.equal(f.sources[0].url, "/api/notifications/events");
  assert.equal(f.requests.length, 1);
  assert.equal(f.client.getServerSnapshot(), server);
  const committed = f.client.getSnapshot().snapshot;
  await f.client.refresh();
  assert.equal(f.client.getSnapshot().snapshot, committed);
  stop1(); assert.equal(f.sources[0].closed, false);
  stop1(); stop2(); assert.equal(f.sources[0].closed, true);
  unsubscribe();
});

test("GET is single-flight and SSE invalidation during it reconciles once more", async (t) => {
  const waiting = deferred();
  const f = fixture((_, count) => count === 1 ? waiting.promise : response(snapshot(2)));
  t.after(f.client.start());
  const first = f.client.refresh();
  assert.equal(first, f.client.refresh());
  f.sources[0].dispatchEvent(new Event("invalidation"));
  assert.equal(f.requests.length, 1);
  waiting.resolve(response(snapshot(1)));
  await first;
  assert.equal(f.requests.length, 2);
  assert.equal(f.client.getSnapshot().snapshot.sequence, 2);
});

test("sequence, epoch and connection generation prevent stale response regression", async (t) => {
  let mode = "initial"; const oldAck = deferred(); const oldGet = deferred();
  const f = fixture((req) => {
    if (req.body) return oldAck.promise;
    if (mode === "old-get") return oldGet.promise;
    return response(snapshot(mode === "initial" ? 4 : 1, [completion("a", mode)], mode === "initial" ? "old" : "new"));
  });
  const stop = f.client.start(); t.after(stop);
  await f.client.refresh();
  const ack = f.client.acknowledge(completion()); await tick();
  mode = "new"; await f.client.refresh();
  oldAck.resolve(response({ snapshot: snapshot(99, [], "old") })); await ack;
  assert.equal(f.client.getSnapshot().snapshot.epoch, "new");
  mode = "old-get"; const pending = f.client.refresh(); stop();
  mode = "new"; const stop2 = f.client.start(); t.after(stop2); await f.client.refresh();
  oldGet.resolve(response(snapshot(100, [], "old"))); await pending;
  assert.equal(f.client.getSnapshot().snapshot.epoch, "new");
});

test("same epoch lower sequences cannot overwrite a newer command response", async (t) => {
  const get = deferred(); let count = 0;
  const f = fixture((req) => req.body ? response({ snapshot: snapshot(3, []) }) : ++count === 1 ? response(snapshot(2)) : get.promise);
  t.after(f.client.start()); await f.client.refresh();
  const refresh = f.client.refresh();
  await f.client.acknowledge(completion());
  get.resolve(response(snapshot(2))); await refresh;
  assert.equal(f.client.getSnapshot().snapshot.sequence, 3);
  assert.deepEqual(f.client.getSnapshot().snapshot.items, []);
});

test("failed ack retains authoritative items and a retryable error without optimistic clearing", async (t) => {
  const fail = deferred(); let succeed = false;
  const f = fixture((req) => req.body ? succeed ? response({ snapshot: snapshot(2, []) }) : fail.promise : response(snapshot()));
  t.after(f.client.start()); await f.client.refresh();
  const operation = f.client.acknowledge(completion()); await tick();
  assert.equal(f.client.getSnapshot().snapshot.items.length, 1);
  fail.resolve(response({}, false)); await assert.rejects(operation);
  assert.equal(f.client.getSnapshot().error, "ack-failed");
  await f.client.refresh(); assert.equal(f.client.getSnapshot().error, "ack-failed");
  succeed = true; await f.client.acknowledge(completion());
  assert.equal(f.client.getSnapshot().error, null);
  assert.equal(f.client.getSnapshot().snapshot.items.length, 0);
});

test("batch freezes observed versions, skips pending, and retries only remaining failed chunks", async (t) => {
  const entries = Array.from({ length: 102 }, (_, i) => completion(String(i)));
  const pending = { ...entries[0], kind: "ask", id: "ask", requestId: "q" };
  let posts = 0;
  const f = fixture((req) => {
    if (!req.body) return response(snapshot(1, [...entries, pending]));
    posts += 1;
    if (posts === 2) return response({}, false);
    return response({ snapshot: snapshot(posts + 1, [completion("101", "NEW"), pending]) });
  });
  t.after(f.client.start()); await f.client.refresh();
  await assert.rejects(f.client.acknowledgeAll());
  assert.equal(f.requests[1].body.items.length, 100);
  assert.deepEqual(f.requests[2].body.items, [{ id: "completion:100", revision: "r1" }, { id: "completion:101", revision: "r1" }]);
  await f.client.acknowledgeAll();
  assert.deepEqual(f.requests[3].body, f.requests[2].body);
  assert.equal(f.client.getSnapshot().snapshot.items[0].revision, "NEW");
  assert.equal(f.client.getSnapshot().snapshot.items[1].kind, "ask");
});

test("visible fallback and online reconcile; hidden documents do not poll", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(); const stop = f.client.start(); t.after(stop);
  await f.client.refresh(); const count = f.requests.length;
  t.mock.timers.tick(2000); await tick(); assert.equal(f.requests.length, count + 1);
  f.doc.visibilityState = "hidden"; f.doc.dispatchEvent(new Event("visibilitychange"));
  t.mock.timers.tick(4000); await tick(); assert.equal(f.requests.length, count + 1);
  f.doc.visibilityState = "visible"; f.doc.dispatchEvent(new Event("visibilitychange")); await tick();
  f.win.dispatchEvent(new Event("online")); await tick(); assert.equal(f.requests.length, count + 3);
  f.sources[0].onopen(); await tick(); assert.equal(f.client.getSnapshot().connected, true);
  f.sources[0].onerror(); assert.equal(f.client.getSnapshot().connected, false);
  assert.equal(f.client.getSnapshot().snapshot.items.length, 1);
  stop(); const finalCount = f.requests.length;
  t.mock.timers.tick(6000); f.win.dispatchEvent(new Event("online")); await tick();
  assert.equal(f.requests.length, finalCount);
});

test("legacy import is instance scoped, bounded, and removes input only after success", async (t) => {
  let fail = true;
  const f = fixture((req) => req.body ? fail ? response({}, false) : response({ snapshot: snapshot(2) }) : response(snapshot()));
  const key = "pi-web:unread-session-ids"; const raw = JSON.stringify(["a", "a", "b"]); f.storage.set(key, raw);
  t.after(f.client.start()); await f.client.refresh();
  assert.equal(f.storage.get(key), raw);
  assert.equal(f.client.getSnapshot().error, "legacy-import-failed");
  fail = false; await f.client.refresh();
  assert.equal(f.storage.has(key), false);
  assert.equal(f.storage.get("pi-web:notifications:legacy-import:instance"), "done");
  f.storage.set(key, raw); const posts = f.requests.filter((req) => req.body).length;
  await f.client.refresh(); assert.equal(f.requests.filter((req) => req.body).length, posts);
  assert.deepEqual(f.requests[1].body, { type: "import_legacy", instanceId: "instance", sessionIds: ["a", "b"] });
});

test("invalid legacy input remains intact and never sends an import", async (t) => {
  const f = fixture(); f.storage.set("pi-web:unread-session-ids", "[null]");
  t.after(f.client.start()); await f.client.refresh();
  assert.equal(f.requests.length, 1);
  assert.equal(f.storage.get("pi-web:unread-session-ids"), "[null]");
  assert.equal(f.client.getSnapshot().error, "legacy-import-failed");
});


test("equal-version metadata/health can update while unchanged polling stays reference-stable", async (t) => {
  let data = snapshot();
  const f = fixture(() => response(data)); t.after(f.client.start()); await f.client.refresh();
  const original = f.client.getSnapshot().snapshot;
  data = { ...data, items: [{ ...completion(), sessionName: "Renamed" }], storageHealth: "degraded" };
  await f.client.refresh();
  assert.notEqual(f.client.getSnapshot().snapshot, original);
  assert.equal(f.client.getSnapshot().snapshot.items[0].sessionName, "Renamed");
  assert.equal(f.client.getSnapshot().snapshot.storageHealth, "degraded");
  const updated = f.client.getSnapshot().snapshot; await f.client.refresh();
  assert.equal(f.client.getSnapshot().snapshot, updated);
});

test("HTTP/malformed GET errors retain the list and recover on a valid snapshot", async (t) => {
  let mode = "ok";
  const f = fixture(() => mode === "http" ? response({}, false) : response(mode === "malformed" ? { items: [] } : snapshot()));
  t.after(f.client.start()); await f.client.refresh();
  const original = f.client.getSnapshot().snapshot;
  for (mode of ["http", "malformed"]) {
    await f.client.refresh(); assert.equal(f.client.getSnapshot().snapshot, original);
    assert.equal(f.client.getSnapshot().error, "sync-failed");
  }
  mode = "ok"; await f.client.refresh(); assert.equal(f.client.getSnapshot().error, null);
});

test("legacy input changed during import is retained, without an instance completion marker", async (t) => {
  const post = deferred();
  const f = fixture((req) => req.body ? post.promise : response(snapshot()));
  const key = "pi-web:unread-session-ids"; f.storage.set(key, '["a"]');
  t.after(f.client.start()); const refresh = f.client.refresh(); await tick();
  f.storage.set(key, '["a","b"]');
  post.resolve(response({ snapshot: snapshot(2) })); await refresh;
  assert.equal(f.storage.get(key), '["a","b"]');
  assert.equal(f.storage.has("pi-web:notifications:legacy-import:instance"), false);
  assert.equal(f.client.getSnapshot().error, "legacy-import-failed");
});

test("legacy import batches stay bounded and a later batch failure preserves the entire raw input", async (t) => {
  let posts = 0;
  const f = fixture((req) => req.body ? ++posts === 2 ? response({}, false) : response({ snapshot: snapshot(posts + 1) }) : response(snapshot()));
  const raw = JSON.stringify(Array.from({ length: 101 }, (_, i) => `session-${i}`));
  f.storage.set("pi-web:unread-session-ids", raw);
  t.after(f.client.start()); await f.client.refresh();
  assert.equal(posts, 2);
  assert.equal(f.requests[1].body.sessionIds.length, 100);
  assert.equal(f.requests[2].body.sessionIds.length, 1);
  assert.equal(f.storage.get("pi-web:unread-session-ids"), raw);
  assert.equal(f.storage.has("pi-web:notifications:legacy-import:instance"), false);
});
