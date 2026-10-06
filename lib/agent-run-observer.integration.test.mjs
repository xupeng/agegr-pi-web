import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

// Run this finite offline suite under pi-tmp-run. Never discover real packages,
// credentials, project context, MCP configuration or a chargeable provider.
// A local pi-tmp-run scratch root wins; a standard npm test / GitHub runner has
// none, so fall back to an exclusive small fixture under the platform temp API
// (TMPDIR respected) instead of requiring personal tooling.
const scratch = mkdtempSync(join(process.env.PI_TASK_TMPDIR ?? tmpdir(), "run-observer-"));
process.env.HOME = join(scratch, "home");
process.env.PI_CODING_AGENT_DIR = join(scratch, "agent");
process.env.PI_OFFLINE = "1";
process.env.PI_WEB_DISABLE_MCP = "1";
process.env.PI_WEB_IDLE_TIMEOUT_MS = "0";
process.env.PI_WEB_STALL_TIMEOUT_MS = "0";
process.env.JITI_FS_CACHE = "false";
mkdirSync(process.env.HOME); mkdirSync(process.env.PI_CODING_AGENT_DIR);
after(() => rmSync(scratch, { recursive: true, force: true }));
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import("@earendil-works/pi-coding-agent");
const { fauxProvider, fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall, Type } = await import("@earendil-works/pi-ai");
const jiti = createJiti(import.meta.url);
const { AgentRunTracker } = await jiti.import("./agent-run-tracker.ts");
const { createAgentRunObserver } = await jiti.import("./agent-run-observer.ts");
const { AgentSessionWrapper, getRpcNotificationSnapshots } = await jiti.import("./rpc-manager.ts");
const { NotificationStore } = await jiti.import("./notifications/store.ts");
const { CHAT_ONLY_RESOURCE_LOADER_OPTIONS } = await jiti.import("./chat-only.ts");
const { createExactSystemPromptExtension } = await jiti.import("./exact-system-prompt.ts");
const { SUBAGENT_META_TYPE } = await jiti.import("./subagents.ts");
const { initializeChildCatalogReadiness } = await jiti.import("./subagent-model-selection.ts");

let sequence = 0;
async function fixture(t, { extensions = [], chatOnly = false, suppressed = false, invalidChildPolicy = false, settings = {}, observe = true, tools = [] } = {}) {
  const dir = join(scratch, `fixture-${++sequence}`); mkdirSync(dir);
  const manager = SessionManager.create(dir, join(dir, "sessions"));
  const tracker = new AgentRunTracker(manager.getSessionId(), `fixture-${sequence}`);
  const settingsManager = SettingsManager.inMemory({ packages: [], extensions: [], retry: { enabled: false }, compaction: { enabled: false }, ...settings });
  const loader = new DefaultResourceLoader({ cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR, settingsManager,
    noExtensions: true, noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true,
    ...(chatOnly ? CHAT_ONLY_RESOURCE_LOADER_OPTIONS : {}),
    extensionFactories: [...(observe ? [createAgentRunObserver(tracker)] : []),
      ...(chatOnly ? [createExactSystemPromptExtension(() => "Exact chat-only context")] : []), ...extensions] });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const faux = fauxProvider({ models: [{ id: "offline-run", contextWindow: 20000 }] });
  const runtime = await ModelRuntime.create({ authPath: join(dir, "auth.json"), modelsPath: null, refreshOnCreate: false });
  if (suppressed) initializeChildCatalogReadiness(runtime);
  runtime.registerNativeProvider(faux.provider);
  const { session } = await createAgentSession({ cwd: dir, agentDir: process.env.PI_CODING_AGENT_DIR,
    settingsManager, resourceLoader: loader, modelRuntime: runtime, model: faux.getModel(), sessionManager: manager, tools });
  if (suppressed) {
    await runtime.getAvailable(); // Await this fixture's native keyless auth publication, not a dummy key or sleep.
    // A suppressed child now needs its persisted resource policy even in this
    // notification-only fixture; missing policy must not bypass admission.
    manager.appendCustomEntry(SUBAGENT_META_TYPE, {
      version: 1, parentSessionId: "fixture-parent", parentSessionPath: "fixture-only",
      parentToolCallId: "fixture-tool", profile: "general-purpose", description: "notification fixture",
      task: "notification suppression", runInBackground: false, createdAt: new Date().toISOString(),
      resourceSnapshot: { version: invalidChildPolicy ? 99 : 1, tools, loadExtensions: true, loadSkills: false, appendSystemPrompt: [] },
    });
  }
  const store = new NotificationStore({ load: () => null, save: () => {} });
  globalThis[Symbol.for("pi-web.notifications.store.v1")] = store;
  const records = [];
  const originalRecord = store.record.bind(store);
  store.record = (input) => { records.push(input); originalRecord(input); };
  const wrapper = new AgentSessionWrapper(session, { runTracker: tracker, chatOnly, suppressCompletionNotifications: suppressed });
  globalThis.__piSessions ??= new Map(); globalThis.__piSessions.set(session.sessionId, wrapper);
  const events = []; wrapper.onEvent((event) => events.push(event)); wrapper.start();
  wrapper.beginExtensionBinding(); await wrapper.waitUntilReady();
  t.after(async () => {
    await wrapper.shutdown();
    if (globalThis.__piSessions.get(session.sessionId) === wrapper) globalThis.__piSessions.delete(session.sessionId);
  });
  assert.ok(!isAbsolute(relative(scratch, dir)) && !relative(scratch, dir).startsWith(".."));
  return { session, wrapper, manager, tracker, store, records, faux, loader, events };
}

async function prompt(f, text = "offline test") {
  await f.wrapper.send({ type: "prompt", message: text });
  await f.session.waitForIdle();
  // The wrapper's direct promise completion handler is not the SDK idle barrier.
  await new Promise((resolve) => setImmediate(resolve));
}

test("real normal run uses persisted turn entry, never latest leaf or message_end, with visible text only", async (t) => {
  const f = await fixture(t, { extensions: [(pi) => pi.on("agent_before_settle", () => ({ entries: [{ type: "custom", customType: "after-answer", data: { secret: "private" } }] }))] });
  f.faux.setResponses([fauxAssistantMessage([fauxThinking("private thinking"), fauxText("Public answer")])]);
  await prompt(f);
  assert.equal(f.records.length, 1);
  const candidate = f.records[0];
  assert.equal(candidate.summary, "Public answer"); assert.notEqual(candidate.resultEntryId, candidate.completionLeafId);
  assert.equal(f.manager.getEntry(candidate.resultEntryId).message.role, "assistant");
  assert.equal(f.manager.getEntry(candidate.completionLeafId).type, "custom");
  assert.equal(f.events.filter((e) => e.type === "agent_settled").length, 1);
});

test("Chat-only keeps exact prompt, empty tools and no discovered resources with observer", async (t) => {
  const f = await fixture(t, { chatOnly: true });
  f.faux.setResponses([(context) => {
    assert.equal(context.messages[0].role, "system"); assert.equal(context.messages[0].content, "Exact chat-only context");
    return fauxAssistantMessage("Chat result");
  }]);
  assert.deepEqual(f.session.getAllTools(), []); assert.deepEqual(f.session.getActiveToolNames(), []);
  assert.deepEqual(f.loader.getSkills().skills, []); assert.deepEqual(f.loader.getPrompts().prompts, []);
  await prompt(f); assert.equal(f.records.length, 1);
});

test("retry error then success shares one identity and one completion", async (t) => {
  const f = await fixture(t, { settings: { retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 } } });
  f.faux.setResponses([fauxAssistantMessage("", { stopReason: "error", errorMessage: "429 rate limit exceeded" }), fauxAssistantMessage("Retried successfully")]);
  await prompt(f); assert.equal(f.faux.state.callCount, 2); assert.equal(f.records.length, 1);
  assert.equal(f.records[0].summary, "Retried successfully");
  assert.equal(f.events.filter((e) => e.type === "agent_start").length, 2);
});

for (const stopReason of ["error", "aborted", "length"]) test(`real final ${stopReason} produces no completion`, async (t) => {
  const f = await fixture(t); f.faux.setResponses([fauxAssistantMessage("Incomplete", { stopReason })]);
  await prompt(f); assert.equal(f.records.length, 0);
});

test("before-settle continuation and agent_end queued follow-up notify once after the final turn", async (t) => {
  let continued = false; let queued = false;
  const f = await fixture(t, { extensions: [(pi) => {
    pi.on("agent_end", () => { if (!queued) { queued = true; pi.sendUserMessage("queued follow-up", { deliverAs: "followUp" }); } });
    pi.on("agent_before_settle", () => {
      if (continued) return; continued = true;
      return { entries: [{ type: "custom_message", customType: "continue", content: "Continue once", display: false }], continue: true };
    });
  }] });
  f.faux.setResponses([fauxAssistantMessage("First"), fauxAssistantMessage("Queued"), fauxAssistantMessage("Final")]);
  await prompt(f); assert.equal(f.faux.state.callCount, 3); assert.equal(f.records.length, 1); assert.equal(f.records[0].summary, "Final");
});

test("settled deferred injection freezes separate identities and delivers in run order", async (t) => {
  let injected = false;
  const f = await fixture(t, { extensions: [(pi) => pi.on("agent_settled", () => {
    if (!injected) { injected = true; pi.sendUserMessage("deferred user message", { deliverAs: "followUp" }); }
  })] });
  f.faux.setResponses([fauxAssistantMessage("Original"), fauxAssistantMessage("Deferred")]);
  await prompt(f);
  assert.equal(f.records.length, 2); assert.deepEqual(f.records.map((c) => c.summary), ["Original", "Deferred"]);
  assert.notEqual(f.records[0].runIdentity, f.records[1].runIdentity);
  assert.equal(f.store.completions()[0].summary, "Deferred");
});

test("ordinary extension injection without a wrapper prompt is collected", async (t) => {
  let send;
  const f = await fixture(t, { extensions: [(pi) => { send = () => pi.sendUserMessage("extension input"); }] });
  f.faux.setResponses([fauxAssistantMessage("Extension result")]);
  const settled = new Promise((resolve) => {
    const unsubscribe = f.wrapper.onEvent((event) => {
      if (event.type === "agent_settled") { unsubscribe(); resolve(); }
    });
  });
  send(); await settled; await f.session.waitForIdle();
  assert.equal(f.records.length, 1); assert.equal(f.records[0].summary, "Extension result");
});

test("handled command/input without actual runs cannot complete", async (t) => {
  const f = await fixture(t, { extensions: [(pi) => {
    pi.registerCommand("handled", { handler: async () => {} });
    pi.on("input", (event) => event.text === "handled input" ? { action: "handled" } : undefined);
  }] });
  await prompt(f, "/handled"); await prompt(f, "handled input");
  assert.equal(f.faux.state.callCount, 0); assert.equal(f.records.length, 0);
  assert.equal(f.events.some((e) => e.type === "agent_start"), false);
});

test("openAsk pause survives a quick close before settled", async (t) => {
  let wrapper;
  const f = await fixture(t, { tools: ["ask-fixture"], extensions: [(pi) => pi.registerTool({ name: "ask-fixture", label: "Ask", description: "Offline ask",
    parameters: Type.Object({}), execute: async () => {
      await wrapper.openAsk({ sessionId: wrapper.sessionId, questions: [{ id: "q", question: "Choose?", options: [] }] });
      wrapper.voidOpenAskForUserMessage();
      return { content: [{ type: "text", text: "Question opened" }], details: {}, terminate: true };
    } })] });
  wrapper = f.wrapper; f.session.setActiveToolsByName(["ask-fixture"]);
  assert.deepEqual(f.session.getActiveToolNames(), ["ask-fixture"], "SDK allow-list must admit the test tool");
  f.faux.setResponses([fauxAssistantMessage([fauxToolCall("ask-fixture", {})]), fauxAssistantMessage("Quick-close continuation succeeded")]);
  await prompt(f); assert.equal(f.records.length, 0); assert.equal(f.wrapper.pendingAsk, undefined);
  assert.equal(f.faux.state.callCount, 1, "the actual ask tool terminates its turn without a second model request");
  assert.equal(f.events.filter((event) => event.type === "ask.opened").length, 1);
  assert.equal(f.events.filter((event) => event.type === "ask.closed").length, 1);
});

test("public ctx.abort before-settle marks Stop even after a successful model stop", async (t) => {
  const f = await fixture(t, { extensions: [(pi) => pi.on("agent_before_settle", (_event, ctx) => { ctx.abort(); })] });
  f.faux.setResponses([fauxAssistantMessage("Would have completed")]);
  await prompt(f); assert.equal(f.records.length, 0);
});

test("subagent suppression excludes completions and runtime pending snapshots", async (t) => {
  const f = await fixture(t, { suppressed: true }); f.faux.setResponses([fauxAssistantMessage("Child")]);
  await prompt(f); assert.equal(f.records.length, 0);
  assert.equal(getRpcNotificationSnapshots().some((s) => s.sessionId === f.session.sessionId), false);
});

test("invalid child policy rejects before tracking or notification and preserves the old ask and history", async (t) => {
  const f = await fixture(t, { suppressed: true, invalidChildPolicy: true });
  await f.wrapper.openAsk({ sessionId: f.wrapper.sessionId,
    questions: [{ id: "q", question: "Keep this old ask?", options: [] }] });
  const previousAsk = f.wrapper.pendingAsk;
  const previousHistory = JSON.stringify(f.manager.getEntries());
  f.faux.setResponses([fauxAssistantMessage("Must never be requested")]);
  await assert.rejects(prompt(f), (error) => error.reason === "resource-policy-invalid");
  assert.equal(f.faux.state.callCount, 0);
  assert.equal(f.wrapper.isRunning(), false);
  assert.deepEqual(f.wrapper.pendingAsk, previousAsk);
  assert.equal(JSON.stringify(f.manager.getEntries()), previousHistory);
  assert.equal(f.records.length, 0);
  assert.equal(f.events.some((event) => ["agent_start", "agent_settled", "prompt_done"].includes(event.type)), false);
});

test("real reload replaces observers rather than accumulating registrations", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 3; i++) {
    f.faux.setResponses([fauxAssistantMessage(`Round ${i}`)]);
    await prompt(f); assert.equal(f.records.length, i + 1);
    await f.session.reload();
  }
  assert.equal(new Set(f.records.map((c) => c.runIdentity)).size, 3);
});

test("auto-compaction recovery continues the same run and completes only the successful retry", async (t) => {
  const reasons = [];
  const f = await fixture(t, { settings: { compaction: { enabled: true, reserveTokens: 100, keepRecentTokens: 0 } },
    extensions: [(pi) => pi.on("session_before_compact", (event) => {
      reasons.push(event.reason);
      return { compaction: { summary: "Offline compacted context", firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore } };
    })] });
  f.manager.appendMessage({ role: "user", content: "Old context ".repeat(200), timestamp: Date.now() - 2000 });
  f.manager.appendMessage(fauxAssistantMessage("Old answer", { timestamp: Date.now() - 1000 }));
  f.faux.setResponses([fauxAssistantMessage("", { stopReason: "error", errorMessage: "maximum context length exceeded" }),
    fauxAssistantMessage("Recovered after compaction")]);
  await prompt(f);
  assert.deepEqual(reasons, ["overflow"]); assert.equal(f.faux.state.callCount, 2);
  assert.equal(f.records.length, 1); assert.equal(f.records[0].summary, "Recovered after compaction");
  assert.equal(f.events.filter((event) => event.type === "agent_settled").length, 1);
});

test("manual compaction without actual agent_start cannot create completion", async (t) => {
  const f = await fixture(t, { settings: { compaction: { enabled: true, reserveTokens: 100, keepRecentTokens: 0 } },
    extensions: [(pi) => pi.on("session_before_compact", (event) => ({ compaction: {
    summary: "Manual offline summary", firstKeptEntryId: event.preparation.firstKeptEntryId,
    tokensBefore: event.preparation.tokensBefore,
  } }))] });
  f.manager.appendMessage({ role: "user", content: "Old context ".repeat(200), timestamp: Date.now() - 2000 });
  f.manager.appendMessage(fauxAssistantMessage("Old answer", { timestamp: Date.now() - 1000 }));
  await f.wrapper.send({ type: "compact" });
  assert.equal(f.faux.state.callCount, 0); assert.equal(f.records.length, 0);
  assert.equal(f.events.some((event) => event.type === "agent_start"), false);
});

test("standalone real SDK bash execution creates no agent completion", async (t) => {
  const f = await fixture(t);
  const result = await f.wrapper.send({ type: "bash", command: "printf 'offline shell result\\n'" });
  assert.equal(result.exitCode, 0); assert.match(result.output, /offline shell result/);
  assert.equal(f.faux.state.callCount, 0); assert.equal(f.records.length, 0);
  assert.equal(f.events.some((event) => event.type === "agent_start"), false);
});

test("Stop during held before-settle vetoes a normally stopped model result", async (t) => {
  let release; let entered;
  const boundaryEntered = new Promise((resolve) => { entered = resolve; });
  const f = await fixture(t, { extensions: [(pi) => pi.on("agent_before_settle", async () => {
    entered(); await new Promise((resolve) => { release = resolve; });
  })] });
  f.faux.setResponses([fauxAssistantMessage("Model already said stop")]);
  const running = prompt(f); await boundaryEntered;
  const stopping = f.wrapper.send({ type: "abort" }); release();
  await Promise.all([stopping, running]); assert.equal(f.records.length, 0);
});

test("direct SDK promise rejection after turn boundary and settled is vetoed", async (t) => {
  let sessionFile;
  const f = await fixture(t, { extensions: [(pi) => pi.on("agent_before_settle", () => {
    // A genuine isolated append failure after the model result is durable. Do
    // not patch SDK private methods (nor touch any real session directory).
    renameSync(sessionFile, `${sessionFile}.saved`); mkdirSync(sessionFile);
    return { entries: [{ type: "custom", customType: "append-fails", data: {} }] };
  })] });
  sessionFile = f.session.sessionFile;
  f.faux.setResponses([fauxAssistantMessage("Successful model, failed finalization")]);
  try {
    await prompt(f);
    assert.equal(f.events.filter((event) => event.type === "agent_settled").length, 1);
    assert.ok(f.events.some((event) => event.type === "prompt_error"));
    assert.equal(f.records.length, 0);
  } finally { rmSync(sessionFile, { recursive: true }); renameSync(`${sessionFile}.saved`, sessionFile); }
});

test("a caught auxiliary extension handler error does not veto a successful model run", async (t) => {
  const f = await fixture(t, { extensions: [(pi) => pi.on("turn_end", () => { throw new Error("auxiliary fixture failure"); })] });
  f.faux.setResponses([fauxAssistantMessage("Visible success")]);
  await prompt(f); assert.ok(f.events.some((event) => event.type === "extension_error"));
  assert.equal(f.records.length, 1);
});

test("native SDK and observed normal session have identical provider prompt and tool/resource loadout", async (t) => {
  const tool = (pi) => pi.registerTool({ name: "offline-tool", label: "Offline", description: "Original description",
    parameters: Type.Object({}), execute: async () => ({ content: [{ type: "text", text: "Unused" }], details: {} }) });
  const native = await fixture(t, { observe: false, tools: ["offline-tool"], extensions: [tool] });
  const observed = await fixture(t, { tools: ["offline-tool"], extensions: [tool] });
  const capture = async (f) => {
    let input;
    f.faux.setResponses([(context) => {
      input = JSON.stringify(context.messages.filter((message) => message.role === "system").map((message) => {
        const copy = { ...message }; delete copy.timestamp; return copy;
      })).replaceAll(f.manager.getCwd(), "<isolated-cwd>");
      return fauxAssistantMessage("Result");
    }]);
    // The two wrappers are both in the existing registry; collection is not a
    // reason to construct either session or revive any registered tools.
    globalThis.__piSessions.set(f.session.sessionId, f.wrapper);
    await prompt(f); return input;
  };
  assert.equal(await capture(observed), await capture(native));
  assert.deepEqual(observed.session.getActiveToolNames(), native.session.getActiveToolNames());
  assert.deepEqual(observed.session.getAllTools().map(({ name, description, parameters, exposure }) => ({ name, description, parameters, exposure })),
    native.session.getAllTools().map(({ name, description, parameters, exposure }) => ({ name, description, parameters, exposure })));
  assert.deepEqual(observed.loader.getSkills().skills, native.loader.getSkills().skills);
  assert.deepEqual(observed.loader.getPrompts().prompts, native.loader.getPrompts().prompts);
});

test("real blocking extension command pending is projected, closes normally, and handled creates no run", async (t) => {
  let entered;
  const called = new Promise((resolve) => { entered = resolve; });
  const f = await fixture(t, { extensions: [(pi) => pi.registerCommand("dialog", { handler: async (_args, ctx) => {
    const response = ctx.ui.confirm("Offline confirm", "Proceed?"); entered(); assert.equal(await response, true);
  } })] });
  const sending = f.wrapper.send({ type: "prompt", message: "/dialog" }); await called;
  const [pending] = getRpcNotificationSnapshots().find((s) => s.sessionId === f.session.sessionId).extensionRequests;
  assert.equal(pending.request.method, "confirm"); assert.ok(Date.parse(pending.requestedAt));
  await f.wrapper.send({ type: "extension_ui_response", id: pending.request.id, confirmed: true });
  await sending;
  assert.deepEqual(getRpcNotificationSnapshots().find((s) => s.sessionId === f.session.sessionId).extensionRequests, []);
  assert.equal(f.faux.state.callCount, 0); assert.equal(f.records.length, 0);
});

test("exhausted retry final error cannot replace an earlier successful completion", async (t) => {
  const f = await fixture(t, { settings: { retry: { enabled: true, maxRetries: 1, baseDelayMs: 1, maxDelayMs: 1 } } });
  f.faux.setResponses([fauxAssistantMessage("Earlier success")]); await prompt(f);
  const revision = f.store.completions()[0].revision;
  f.faux.setResponses([fauxAssistantMessage("", { stopReason: "error", errorMessage: "429 rate limit exceeded" }),
    fauxAssistantMessage("", { stopReason: "error", errorMessage: "429 rate limit exceeded" })]);
  await prompt(f);
  assert.equal(f.records.length, 1); assert.equal(f.store.completions()[0].revision, revision);
  assert.equal(f.events.filter((event) => event.type === "auto_retry_end" && event.success === false).length, 1);
});
