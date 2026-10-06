import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
const root = mkdtempSync(join(tmpdir(), "notification-route-"));
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
const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { GET, POST } = await jiti.import("./route.ts");
const { GET: events } = await jiti.import("./events/route.ts");
const { recordNotificationCompletion, getNotificationStore, invalidateNotifications } = await jiti.import("../../../lib/notifications/store.ts");
const record = (sessionId, runIdentity = "run1") => recordNotificationCompletion({ sessionId, runIdentity,
  resultEntryId: "entry", completionLeafId: "leaf", completedAt: "2026-10-06T00:00:00Z", summary: "Done" });
const req = (body, headers = {}) => new Request("http://localhost/api/notifications", {
  method: "POST", headers: { host: "localhost", "Content-Type": "application/json", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body),
});

test("GET returns snapshot directly, POST wraps snapshot, and stale ack protects new completion", async () => {
  record("api");
  const response = await GET(new Request("http://localhost/api/notifications", { headers: { host: "localhost" } }));
  assert.equal(response.headers.get("cache-control"), "no-store");
  const snapshot = await response.json();
  assert.ok(snapshot.epoch);
  assert.equal(snapshot.snapshot, undefined);
  const old = snapshot.items.find((i) => i.sessionId === "api");
  record("api", "run2");
  const stale = await POST(req({ type: "ack", id: old.id, revision: old.revision }));
  assert.equal(stale.status, 200);
  assert.equal((await stale.json()).snapshot.items.find((i) => i.sessionId === "api").runIdentity, "run2");
  const current = getNotificationStore().completions().find((i) => i.sessionId === "api");
  assert.equal((await POST(req({ type: "ack_many", items: [{ id: current.id, revision: current.revision }] }))).status, 200);
  assert.equal(getNotificationStore().completions().some((i) => i.sessionId === "api"), false);
});
test("route checks host/origin/content type/unknown fields and streamed body size", async () => {
  assert.equal((await POST(req({ type: "ack_many", items: [] }, { host: "evil.example" }))).status, 403);
  assert.equal((await POST(req({ type: "ack_many", items: [] }, { origin: "http://evil.example" }))).status, 403);
  assert.equal((await GET(new Request("http://localhost/api/notifications", { headers: { host: "localhost", "sec-fetch-site": "cross-site" } }))).status, 403);
  assert.equal((await POST(req({}, { "Content-Type": "text/plain" }))).status, 415);
  assert.equal((await POST(req("{"))).status, 400);
  assert.equal((await POST(req({ type: "ack_many", items: [], unexpected: true }))).status, 400);
  assert.equal((await POST(req(" ".repeat(128 * 1024 + 1)))).status, 413);
  assert.equal((await POST(req("{}", { "Content-Length": "131073" }))).status, 413);
});
test("migration validates persisted session existence and rejects a different instance", async () => {
  const { SessionManager } = await jiti.import("@earendil-works/pi-coding-agent");
  const { cacheSessionPath } = await jiti.import("../../../lib/session-reader.ts");
  const manager = SessionManager.create(root);
  manager.appendMessage({ role: "user", content: "Migration fixture", timestamp: Date.now() });
  manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "Old result" }], timestamp: Date.now() });
  const id = manager.getSessionId();
  cacheSessionPath(id, manager.getSessionFile());
  const instanceId = getNotificationStore().version().instanceId;
  assert.equal((await POST(req({ type: "import_legacy", instanceId: "wrong", sessionIds: [id] }))).status, 409);
  const first = await POST(req({ type: "import_legacy", instanceId, sessionIds: [id, "missing"] }));
  assert.equal(first.status, 200);
  const imported = (await first.json()).snapshot.items.find((i) => i.sessionId === id);
  assert.equal(imported.origin, "legacy-import");
  assert.equal(imported.resultEntryId, null, "migration does not fabricate transcript evidence");
  await POST(req({ type: "ack", id: imported.id, revision: imported.revision }));
  const again = await POST(req({ type: "import_legacy", instanceId, sessionIds: [id] }));
  assert.equal((await again.json()).snapshot.items.some((i) => i.sessionId === id), false);
});
test("storage failure never returns a successful ack or clears memory", async () => {
  record("failed-ack");
  const store = getNotificationStore();
  const item = store.completions().find((c) => c.sessionId === "failed-ack");
  const file = join(process.env.PI_CODING_AGENT_DIR, "pi-web-notifications.json");
  rmSync(file);
  mkdirSync(file); // Atomic rename cannot replace a directory.
  try {
    const result = await POST(req({ type: "ack", id: item.id, revision: item.revision }));
    assert.equal(result.status, 503);
    assert.equal(store.completions().find((c) => c.sessionId === "failed-ack").revision, item.revision);
    assert.equal(store.version().storageHealth, "degraded");
  } finally { rmSync(file, { recursive: true }); }
  assert.equal((await POST(req({ type: "ack", id: item.id, revision: item.revision }))).status, 200);
});
test("SSE provides lightweight versions, coalesces burst and releases on abort/cancel", async () => {
  const controller = new AbortController();
  const response = await events(new Request("http://localhost/api/notifications/events", { headers: { host: "localhost" }, signal: controller.signal }));
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const reader = response.body.getReader();
  const connected = new TextDecoder().decode((await reader.read()).value);
  assert.match(connected, /event: connected/);
  assert.doesNotMatch(connected, /items|transcript|summary/);
  for (let i = 0; i < 10; i++) invalidateNotifications();
  const update = new TextDecoder().decode((await reader.read()).value);
  assert.match(update, /event: invalidation/);
  assert.doesNotMatch(update, /items|transcript|summary/);
  const data = JSON.parse(update.split("data: ")[1].trim());
  assert.equal(data.sequence, getNotificationStore().version().sequence);
  controller.abort();
  assert.equal((await reader.read()).done, true);
  const cancel = await events(new Request("http://localhost/api/notifications/events", { headers: { host: "localhost" } }));
  await cancel.body.cancel();
});
