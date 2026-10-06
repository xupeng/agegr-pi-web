import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { createJiti } from "jiti";

// A local pi-tmp-run scratch root wins; a standard npm test / GitHub runner has
// none, so fall back to an exclusive small fixture under the platform temp API
// (TMPDIR respected) instead of requiring personal tooling.
const scratch = mkdtempSync(join(process.env.PI_TASK_TMPDIR ?? tmpdir(), "rpc-notifications-"));
process.env.HOME = join(scratch, "home"); process.env.PI_CODING_AGENT_DIR = join(scratch, "agent");
process.env.PI_OFFLINE = "1"; process.env.PI_WEB_DISABLE_MCP = "1";
process.env.PI_WEB_IDLE_TIMEOUT_MS = "0"; process.env.PI_WEB_STALL_TIMEOUT_MS = "0";
process.env.JITI_FS_CACHE = "false";
mkdirSync(process.env.HOME); mkdirSync(process.env.PI_CODING_AGENT_DIR);
after(() => rmSync(scratch, { recursive: true, force: true }));
const jiti = createJiti(import.meta.url);
const { AgentRunTracker } = await jiti.import("./agent-run-tracker.ts");
const { AgentSessionWrapper, getRpcNotificationSnapshots } = await jiti.import("./rpc-manager.ts");
const { NotificationStore } = await jiti.import("./notifications/store.ts");
const turn = { outcome: "completed", stopReason: "stop", resultEntryId: "result", summary: "Boundary answer" };
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t, { suppressed = false } = {}) {
  const sessionId = randomUUID(); let sdkListener = () => {};
  const tracker = new AgentRunTracker(sessionId, randomUUID());
  const store = new NotificationStore({ load: () => null, save: () => {} });
  globalThis[Symbol.for("pi-web.notifications.store.v1")] = store;
  let invalidations = 0; store.subscribe(() => { invalidations++; });
  const records = []; const originalRecord = store.record.bind(store);
  store.record = (input) => { records.push(input); originalRecord(input); };
  const persisted = { type: "message", id: "result", message: { role: "assistant", content: [
    { type: "text", text: "Persisted public answer" }, { type: "thinking", thinking: "secret" },
  ], stopReason: "stop", details: { password: "secret" } } };
  const inner = { sessionId, isStreaming: false, isBashRunning: false, isCompacting: false, agent: { state: {} },
    extensionRunner: {}, sessionManager: { getCwd: () => scratch, getLeafId: () => "leaf", getEntry: () => persisted },
    subscribe: (listener) => { sdkListener = listener; return () => { sdkListener = () => {}; }; },
    sendCustomMessage: async () => {}, abort: async () => { inner.isStreaming = false; sdkListener({ type: "agent_settled" }); },
    prompt: async (_text, options) => { options.preflightResult("handled"); }, dispose() {},
  };
  let externalDeliveries = 0;
  const wrapper = new AgentSessionWrapper(inner, { runTracker: tracker, suppressCompletionNotifications: suppressed,
    onAgentRunComplete: () => { externalDeliveries++; } });
  globalThis.__piSessions = new Map([[sessionId, wrapper]]); wrapper.start();
  t.after(() => { wrapper.destroy(); globalThis.__piSessions.delete(sessionId); });
  const start = () => { inner.isStreaming = true; sdkListener({ type: "agent_start" }); };
  const end = () => { tracker.turnEnd(turn); tracker.beforeSettle("completed"); inner.isStreaming = false; sdkListener({ type: "agent_settled" }); };
  return { sessionId, tracker, store, records, persisted, inner, wrapper, start, end,
    invalidations: () => invalidations, externalDeliveries: () => externalDeliveries };
}

test("collection maps only validated durable assistant text and does not redeliver external notifications", (t) => {
  const f = fixture(t); f.start(); f.end();
  assert.equal(f.records.length, 1); assert.equal(f.records[0].summary, "Persisted public answer");
  assert.equal(f.externalDeliveries(), 1); f.end();
  assert.equal(f.records.length, 1); assert.equal(f.externalDeliveries(), 1);
});

for (const veto of ["missing-entry", "wrong-role", "suppressed", "deleting", "replacement", "closing", "destroyed"]) {
  test(`completion commit guard rejects ${veto}`, async (t) => {
    const f = fixture(t, { suppressed: veto === "suppressed" }); f.start();
    if (veto === "missing-entry") f.inner.sessionManager.getEntry = () => undefined;
    if (veto === "wrong-role") f.persisted.message.role = "system";
    if (veto === "deleting") { const release = f.store.beginDeletion([f.sessionId]); t.after(release); }
    if (veto === "replacement") globalThis.__piSessions.set(f.sessionId, { isAlive: () => true });
    if (veto === "closing") await f.wrapper.shutdown();
    if (veto === "destroyed") f.wrapper.destroy();
    f.end(); assert.equal(f.records.length, 0);
  });
}

test("direct rejection veto runs before pending counts release and record", async (t) => {
  const f = fixture(t); let rejectPrompt;
  f.inner.prompt = (_text, options) => {
    options.preflightResult("started"); f.start();
    return new Promise((_resolve, reject) => { rejectPrompt = reject; });
  };
  await f.wrapper.send({ type: "prompt", message: "offline" }); f.end();
  assert.equal(f.records.length, 0); assert.equal(f.wrapper.isRunning(), true);
  rejectPrompt(new Error("attributable finalization failure")); await flush();
  assert.equal(f.records.length, 0); assert.equal(f.wrapper.isRunning(), false);
});

test("watchdog uses the Stop marking path before abort settles a successful witness", async (t) => {
  const f = fixture(t); f.start(); f.tracker.turnEnd(turn); f.tracker.beforeSettle("completed");
  t.mock.method(console, "warn", () => {});
  f.wrapper.handleStall({ toolName: null, toolCallId: null, timeoutMs: 1000, timeoutSource: "default",
    toolOverride: false, silentMs: 1000, elapsedMs: 1000, toolElapsedMs: null });
  await flush(); assert.equal(f.records.length, 0);
});

test("snapshots include alive negative ask state without construction or liveness side effects", (t) => {
  const f = fixture(t); const before = f.invalidations();
  const snapshot = getRpcNotificationSnapshots();
  assert.deepEqual(snapshot, [{ sessionId: f.sessionId, cwd: scratch, pendingAsk: null, extensionRequests: [] }]);
  assert.equal(f.invalidations(), before); assert.equal(globalThis.__piSessions.size, 1);
});

test("ask open, replacement and actual close invalidate; reading leaves pending intact", async (t) => {
  const f = fixture(t); const before = f.invalidations();
  const a = await f.wrapper.openAsk({ sessionId: f.sessionId, questions: [{ id: "q", question: "First?", options: [] }] });
  assert.ok(f.invalidations() > before);
  assert.equal(getRpcNotificationSnapshots()[0].pendingAsk.askId, a.ask.askId);
  const b = await f.wrapper.openAsk({ sessionId: f.sessionId, questions: [{ id: "q", question: "Second?", options: [] }] });
  assert.equal(getRpcNotificationSnapshots()[0].pendingAsk.askId, b.ask.askId);
  assert.equal((await f.wrapper.submitAsk(a.ask.askId, { answers: [] })).result, "stale");
  assert.equal(getRpcNotificationSnapshots()[0].pendingAsk.askId, b.ask.askId);
  const openedVersion = f.invalidations(); await f.wrapper.cancelAsk(b.ask.askId);
  assert.ok(f.invalidations() > openedVersion); assert.equal(getRpcNotificationSnapshots()[0].pendingAsk, null);
});

test("blocking dialog open and close have first requestedAt, detached snapshots and invalidations", async (t) => {
  const f = fixture(t); const ui = f.wrapper.createExtensionUiContext();
  const before = f.invalidations(); const pending = ui.input("Title", "Placeholder");
  const [item] = getRpcNotificationSnapshots()[0].extensionRequests;
  assert.ok(f.invalidations() > before); assert.equal(item.request.method, "input"); assert.ok(Date.parse(item.requestedAt));
  item.request.title = "mutated by reader";
  assert.equal(getRpcNotificationSnapshots()[0].extensionRequests[0].request.title, "Title");
  const openedVersion = f.invalidations();
  await f.wrapper.send({ type: "extension_ui_response", id: item.request.id, value: "answer" });
  assert.equal(await pending, "answer"); assert.ok(f.invalidations() > openedVersion);
  assert.deepEqual(getRpcNotificationSnapshots()[0].extensionRequests, []);
});

test("dialog timeout and signal cancellation invalidate without inventing a second request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = fixture(t); const ui = f.wrapper.createExtensionUiContext();
  const pending = ui.confirm("Timeout", "Message", { timeout: 50 }); const version = f.invalidations();
  t.mock.timers.tick(50); assert.equal(await pending, false); assert.ok(f.invalidations() > version);
  assert.deepEqual(getRpcNotificationSnapshots()[0].extensionRequests, []);
  const controller = new AbortController(); const aborting = ui.select("Abort", ["a"], { signal: controller.signal });
  const opened = f.invalidations(); controller.abort(); assert.equal(await aborting, undefined);
  assert.ok(f.invalidations() > opened); assert.deepEqual(getRpcNotificationSnapshots()[0].extensionRequests, []);
});

test("custom redraw retains identity/first requestedAt; actual close invalidates and removes it", async (t) => {
  const f = fixture(t); const ui = f.wrapper.createExtensionUiContext(); let tui; let done; let lines = ["First"];
  const pending = ui.custom((terminal, _theme, _keys, finish) => { tui = terminal; done = finish; return { render: () => lines }; });
  await flush(); const [first] = getRpcNotificationSnapshots()[0].extensionRequests; const opened = f.invalidations();
  lines = ["Redrawn"]; tui.requestRender(); await flush();
  const [redrawn] = getRpcNotificationSnapshots()[0].extensionRequests;
  assert.equal(redrawn.request.id, first.request.id); assert.equal(redrawn.requestedAt, first.requestedAt);
  assert.deepEqual(redrawn.request.lines, ["Redrawn"]); assert.ok(f.invalidations() > opened);
  const version = f.invalidations(); done("finished"); assert.equal(await pending, "finished");
  assert.ok(f.invalidations() > version); assert.deepEqual(getRpcNotificationSnapshots()[0].extensionRequests, []);
});

test("shutdown/destroy invalidate pending snapshot and do not retain an actionable request", async (t) => {
  const f = fixture(t); const pending = f.wrapper.createExtensionUiContext().editor("Editor", "Initial");
  const version = f.invalidations(); await f.wrapper.shutdown();
  assert.ok(f.invalidations() > version); assert.deepEqual(getRpcNotificationSnapshots(), []);
  assert.equal(await pending, undefined);
});

test("factory wiring precedes SDK loader, is normal/Chat-only only, and leaves external owner untouched", () => {
  const source = readFileSync(new URL("./rpc-manager.ts", import.meta.url), "utf8");
  const startup = source.slice(source.indexOf("export async function startRpcSession("));
  assert.ok(startup.indexOf("const runTracker = new AgentRunTracker") < startup.indexOf("await createAgentSessionServices"));
  assert.ok(startup.includes("CHAT_ONLY_RESOURCE_LOADER_OPTIONS, extensionFactories: [runObserver, exactSystemPromptExtension]"));
  assert.ok(startup.includes("extensionFactories: [\n              runObserver,"));
  const subagentBranch = startup.slice(startup.indexOf("resourceLoaderOptions: subagentResources"), startup.indexOf(": chatOnly\n"));
  assert.ok(!subagentBranch.includes("runObserver"));
  assert.equal((source.match(/void notifySessionComplete\(/g) ?? []).length, 1);
  const snapshots = source.slice(source.indexOf("export function getRpcNotificationSnapshots"), source.indexOf("export interface SetRpcSessionToolsResult"));
  assert.ok(!snapshots.includes("startRpcSession")); assert.ok(!snapshots.includes("getRegistry()"));
  assert.ok(!source.includes("_findPersistedMessageEntryId")); assert.ok(!source.includes("_runAgentPrompt"));
});
