import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "pi-web-unsaved-recovery-"));
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
mkdirSync(join(process.env.PI_CODING_AGENT_DIR, "sessions"), { recursive: true });
test.after(() => rmSync(root, { recursive: true, force: true }));
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { SessionManager } = await jiti.import("@earendil-works/pi-coding-agent");
const { startRpcSession, setRpcSessionTools, getRpcSession } = await jiti.import("./rpc-manager.ts");
const { cacheSessionPath, resolveSessionPath, readSessionById, openPersistedSessionManager, openSessionManager, invalidateSessionListCache } = await jiti.import("./session-reader.ts");
const { POST } = await jiti.import("../app/api/agent/[id]/route.ts");
const { GET: events } = await jiti.import("../app/api/agent/[id]/events/route.ts");
const { GET: detail, PATCH: rename } = await jiti.import("../app/api/sessions/[id]/route.ts");

function unsavedManager() {
  return SessionManager.create(root, join(process.env.PI_CODING_AGENT_DIR, "sessions", "project"));
}

test("SDK missing-file open demonstrates the identity/cwd drift guarded by Web restore", () => {
  const original = unsavedManager();
  const file = original.getSessionFile();
  assert.equal(existsSync(file), false);
  const reopened = SessionManager.open(file, undefined);
  assert.notEqual(reopened.getSessionId(), original.getSessionId());
  assert.equal(reopened.getSessionFile(), file);
  assert.equal(reopened.getCwd(), process.cwd());
  assert.notEqual(reopened.getCwd(), original.getCwd());
  assert.equal(existsSync(file), false);
});

test("a cached planned filename is not a saved session", async () => {
  const original = unsavedManager();
  const id = original.getSessionId();
  cacheSessionPath(id, original.getSessionFile());
  assert.equal(await resolveSessionPath(id), null);
  assert.equal(globalThis.__piSessionPathCache.has(id), false);
  assert.equal(await readSessionById(id), null);
});

test("cold startup and tool restoration never open an unsaved or empty path in the SDK", async (t) => {
  const original = unsavedManager();
  const id = original.getSessionId();
  const file = original.getSessionFile();
  const open = t.mock.method(SessionManager, "open", () => { throw new Error("SDK must not be reached"); });
  await assert.rejects(startRpcSession(id, file, undefined), { code: "session_unavailable" });
  await assert.rejects(setRpcSessionTools(id, file, ["read"]), { code: "session_unavailable" });
  assert.throws(() => openSessionManager(file), { code: "session_unavailable" });
  writeFileSync(file, "");
  assert.throws(() => openPersistedSessionManager(file, id), { code: "session_unavailable" });
  assert.equal(open.mock.callCount(), 0);
  assert.equal(getRpcSession(id), undefined);
});

test("saved identity comes from the header, not the filename or a stale cache key", async () => {
  const manager = unsavedManager();
  const id = manager.getSessionId();
  const file = join(process.env.PI_CODING_AGENT_DIR, "sessions", "project", "renamed.jsonl");
  writeFileSync(file, `${JSON.stringify(manager.getHeader())}\n`);
  invalidateSessionListCache();
  const restored = openPersistedSessionManager(file, id);
  assert.equal(restored.getSessionId(), id);
  assert.equal(restored.getCwd(), root);
  assert.throws(() => openPersistedSessionManager(file, "wrong-identity"), { code: "session_unavailable" });
  cacheSessionPath("wrong-identity", file);
  assert.equal(await readSessionById("wrong-identity"), null);
  assert.equal(await readSessionById(id).then((info) => info.id), id);
});

test("cached ownership checks preserve valid saved headers beyond the bounded fast read", async () => {
  const manager = unsavedManager();
  const file = manager.getSessionFile();
  writeFileSync(file, `${JSON.stringify({ ...manager.getHeader(), legacyMetadata: "x".repeat(70 * 1024) })}\n`);
  cacheSessionPath(manager.getSessionId(), file);
  assert.equal(await resolveSessionPath(manager.getSessionId()), file);
  assert.equal(openPersistedSessionManager(file, manager.getSessionId()).getCwd(), root);
});

test("fresh stale-identity caches cannot expose or rename another header's session", async () => {
  const manager = unsavedManager();
  const file = manager.getSessionFile();
  const content = `${JSON.stringify(manager.getHeader())}\n`;
  writeFileSync(file, content);
  invalidateSessionListCache();
  const oldId = "expired-identity";
  const params = Promise.resolve({ id: oldId });
  cacheSessionPath(oldId, file);
  const readResponse = await detail(new Request("http://localhost/sessions/expired-identity"), { params });
  assert.equal(readResponse.status, 404);
  cacheSessionPath(oldId, file); // do not depend on GET clearing the wrong cache
  const renameResponse = await rename(new Request("http://localhost/sessions/expired-identity", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "must not rename" }),
  }), { params });
  assert.equal(renameResponse.status, 404);
  assert.equal(readFileSync(file, "utf8"), content);
});

test("alive unsaved wrappers are reused without a file restore", async (t) => {
  const original = unsavedManager();
  const id = original.getSessionId();
  const wrapper = { isAlive: () => true };
  const previousRegistry = globalThis.__piSessions;
  globalThis.__piSessions = new Map([[id, wrapper]]);
  t.after(() => { globalThis.__piSessions = previousRegistry; });
  const open = t.mock.method(SessionManager, "open", () => { throw new Error("SDK must not be reached"); });
  assert.deepEqual(await startRpcSession(id, original.getSessionFile(), undefined), { session: wrapper, realSessionId: id });
  assert.equal(open.mock.callCount(), 0);
});

test("missing prompt keeps negative admission and readiness sends a terminal path-free refusal", async () => {
  const id = unsavedManager().getSessionId();
  const params = Promise.resolve({ id });
  const response = await POST(new Request("http://localhost/agent", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "prompt", message: "must remain unsent" }),
  }), { params });
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.code, "prompt_rejected");
  assert.equal(body.accepted, false);
  assert.equal(body.reason, "session_unavailable");
  assert.doesNotMatch(JSON.stringify(body), /\.jsonl|\/home\//);
  const stream = await events(new Request("http://localhost/events"), { params });
  assert.equal(stream.status, 200);
  const text = await stream.text();
  const event = text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)))[0];
  assert.equal(event.type, "startup_error");
  assert.equal(event.code, "session_unavailable");
  assert.equal(event.prePromptRejected, true);
  assert.equal(getRpcSession(id), undefined);
});

test("identity replacement after path resolution maps a cold startup refusal without loading resources", async (t) => {
  const manager = unsavedManager();
  const replacement = unsavedManager();
  const id = manager.getSessionId();
  const file = manager.getSessionFile();
  const initial = `${JSON.stringify(manager.getHeader())}\n`;
  const switched = `${JSON.stringify(replacement.getHeader())}\n`;
  const originalOpen = SessionManager.open.bind(SessionManager);
  const open = t.mock.method(SessionManager, "open", (path, ...args) => {
    // Simulate another writer replacing the header after resolver validation.
    assert.equal(path, file);
    writeFileSync(file, switched);
    return originalOpen(path, ...args);
  });
  const params = Promise.resolve({ id });
  writeFileSync(file, initial);
  cacheSessionPath(id, file);
  const response = await POST(new Request("http://localhost/agent", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "prompt", message: "never admitted" }),
  }), { params });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Session is no longer available. Please try again.", code: "prompt_rejected", accepted: false, reason: "session_unavailable" });
  assert.equal(readFileSync(file, "utf8"), switched);
  writeFileSync(file, initial);
  cacheSessionPath(id, file);
  const stream = await events(new Request("http://localhost/events"), { params });
  assert.match(await stream.text(), /"code":"session_unavailable","prePromptRejected":true/);
  assert.equal(open.mock.callCount(), 2);
  assert.equal(readFileSync(file, "utf8"), switched);
  assert.equal(getRpcSession(id), undefined);
  assert.equal(getRpcSession(replacement.getSessionId()), undefined);
});
