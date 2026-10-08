import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createJiti } from "jiti";

// Same callback-execution pattern as mcp-slash-command.test.mjs, not a browser or React mount.
// The real HTTP decoder and formatter feed the hook's actual callbacks; only hook state/IO are stubbed.
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { AgentCommandError, isPromptRejectedError, isUnavailableAgentSessionError, readAgentCommandError, sendAgentCommand } = await jiti.import("../lib/agent-client.ts");
const { AgentEventConnection, AgentEventConnectionError } = await jiti.import("../lib/agent-event-connection.ts");
const { createAgentEventStream } = await jiti.import("../lib/agent-event-stream.ts");
const { ModelSelectionError } = await jiti.import("../lib/subagent-model-selection.ts");
const { formatModelSelectionError } = await jiti.import("../lib/model-selection-error-display.ts");
const { translateMessage } = await jiti.import("../lib/i18n/format.ts");
const { getLocalePlugin } = await jiti.import("../lib/i18n/registry.ts");
const messages = Object.fromEntries(["en", "zh-CN", "zh-TW"].map((locale) => [locale, getLocalePlugin(locale).messages]));
const translate = (locale) => (key, params) => translateMessage(locale, key, messages, params);
const text = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");
const file = ts.createSourceFile("useAgentSession.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function compile(name) {
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name
      && node.initializer && ts.isCallExpression(node.initializer)
      && node.initializer.expression.getText(file) === "useCallback") callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(callback, name);
  const js = ts.transpileModule(`(${callback.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.trim().replace(/;$/, "");
  return new Function("scope", `with (scope) { return ${js}; }`);
}
const names = ["handleAgentEvent", "handleSend", "sendStreamingPrompt", "handleModelChange", "ensureNewSession", "reconcileAgentState", "finishPromptWithoutStream", "settleUiStage", "notifyPromptStage"];
const callbacks = Object.fromEntries(names.map((name) => [name, compile(name)]));
const ref = (current) => ({ current });
const noop = () => {};
const oldModel = { provider: "gateway", modelId: "retired-gpt" };
const dto = (reason = "model-unavailable", target = oldModel) => ({
  code: "model_selection_failed", reason, message: "RAW_AUTH_SECRET_LOADER_MESSAGE", ...target,
});
function response(body, status = 409) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function hook(t, { locale = "en", isNew = false, busy = false, fail = true, failure = dto(), creationFailure = false } = {}) {
  const oldFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = oldFetch; });
  const ask = { askId: "old-ask", questions: [], askedAt: "2026-10-06T00:00:00Z" };
  const result = { role: "assistant", content: "old result" };
  const state = { messages: [result], pendingAsk: ask, branch: "old-leaf", notices: [], requests: [], restores: [], ends: 0, promotions: 0, wait: 0, reloads: 0, running: false, model: oldModel, override: null, switching: false };
  globalThis.fetch = async (url, options) => {
    const command = options?.body ? JSON.parse(options.body) : null;
    state.requests.push({ url, command });
    if (!command) return response({ running: busy, state: { isStreaming: busy, isPromptRunning: busy, pendingAsk: ask } }, 200);
    if (url === "/api/agent/new") {
      if (creationFailure) return response({ error: "RAW_LOADER_SECRET", modelSelection: failure });
      return response({ sessionId: "new-id", model: oldModel }, 200);
    }
    if (fail) return response({ error: "RAW_LOADER_SECRET", code: command.type === "prompt" ? "prompt_rejected" : undefined,
      ...(command.type === "prompt" ? { accepted: false } : {}), modelSelection: failure });
    if (command.type === "set_model") return response({ success: true, data: { provider: command.provider, id: command.modelId } }, 200);
    return response({ success: true, data: null }, 200);
  };
  const scope = {
    AgentEventConnectionError, AgentCommandError, isPromptRejectedError, isUnavailableAgentSessionError, readAgentCommandError, sendAgentCommand, formatModelSelectionError,
    translate: translate(locale), console: { error: noop },
    isNew, newSessionCwd: isNew ? "/fixture/project" : null, session: isNew ? null : { id: "child-id" },
    sessionIdRef: ref(isNew ? null : "child-id"), ensuringNewSessionRef: ref(null), sessionHookMountedRef: ref(true),
    newSessionRetiredRef: ref(false),
    newSessionModel: null, pendingModel: oldModel, newSessionDefaultThinkingLevel: "medium",
    newSessionModelOverrideRef: ref(null), thinkingLevelOverrideRef: ref(null), thinkingLevelPinsRef: ref({}), defaultThinkingLevelRef: ref("medium"),
    toolPreset: "configured", sessionToolsPinnedRef: ref(false), getToolNamesForPreset: () => undefined,
    setPendingModel: (model) => { scope.pendingModel = model; }, setNewSessionModel: (model) => { scope.newSessionModel = model; },
    setNewSessionDefaultThinkingLevel: noop, setNewSessionDefaultModel: noop, setLiveThinkingLevel: noop,
    asConcreteThinkingLevel: (value) => value, currentModelOverride: null, modelSwitchPendingRef: ref(false),
    setCurrentModelOverride: (model) => { state.override = model; }, setLiveModel: (model) => { state.model = model; },
    setModelSwitching: (value) => { state.switching = value; }, loadSession: async () => { state.reloads++; },
    editEntryId: null, agentRunningRef: ref(false), bashRunningRef: ref(false), promptRunIdRef: ref(0), notifiedPromptRunIdRef: ref(-1),
    sdkAgentActiveRef: ref(false), rpcPromptPendingRef: ref(false), trellisPromptViewGenerationRef: ref(null), trellisViewGenerationRef: ref(1),
    optimisticUserMessageKeyRef: ref(null), pendingScrollToUserRef: ref(false), composerDraftKey: "draft-key",
    setMessages: (write) => { state.messages = write(state.messages); }, userMessageKey: () => "optimistic",
    setAgentRunning: (value) => { state.running = value; }, setAgentPhase: noop, setPromptAnchorActive: noop, dispatch: noop,
    restoreSubmission: (...args) => { state.restores.push(args); }, addNotice: (notice) => { state.notices.push(notice); },
    promoteNewSession: () => { state.promotions++; }, ensureEventsConnected: async () => {}, cancelEventStreamGrace: noop, closeEvents: noop,
    waitForPromptSettlement: async () => { state.wait++; }, refreshViewedSession: async () => {}, scheduleEventStreamClose: noop,
    onAgentEnd: () => { state.ends++; }, syncLiveModel: noop, setRetryInfo: noop, setActiveToolResults: noop,
    setIsCompacting: noop, setAutoCompactionEnabled: noop, normalizeQueuedMessages: (value) => value, setQueuedMessages: noop,
    setContextUsage: noop, setSystemPrompt: noop, setExtensionStatuses: noop, setExtensionWidgets: noop,
    setPendingAsk: (value) => { state.pendingAsk = value; },
  };
  for (const name of names) scope[name] = callbacks[name](scope);
  return { scope, state, ask, result };
}
const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); };

for (const locale of ["en", "zh-CN", "zh-TW"]) {
  test(`${locale}: real HTTP typed rejection keeps draft/images, old ask/branch/result and never completes`, async (t) => {
    const { scope, state, ask, result } = hook(t, { locale });
    const images = [{ data: "image-data", mimeType: "image/png" }];
    await scope.handleSend("unsent draft", images);
    await flush();
    assert.deepEqual(state.messages, [result]);
    assert.deepEqual(state.pendingAsk, ask);
    assert.equal(state.branch, "old-leaf");
    assert.deepEqual(state.restores, [["unsent draft", images, "draft-key"]]);
    assert.equal(state.ends, 0);
    assert.equal(state.promotions, 0);
    assert.equal(state.wait, 0, "typed failure must not take the ambiguous network path");
    assert.equal(state.running, false);
    assert.match(state.notices[0].message, /gateway\/retired-gpt/);
    assert.doesNotMatch(state.notices[0].message, /RAW_|HTTP|Model selection failed/);
    if (locale === "en") assert.match(state.notices[0].message, /No model request was sent/);
  });
}

test("new-session selection failure uses the same decoder/formatter and does not promote", async (t) => {
  const { scope, state } = hook(t, { isNew: true, creationFailure: true });
  await scope.handleSend("new draft");
  assert.equal(state.promotions, 0);
  assert.equal(state.ends, 0);
  assert.deepEqual(state.restores, [["new draft", undefined, "draft-key"]]);
  assert.match(state.notices[0].message, /No model request was sent for gateway\/retired-gpt/);
  assert.equal(state.requests.length, 1);
  assert.equal(scope.ensuringNewSessionRef.current, null, "creation remains retryable");
});

test("pre-admission rejection does not settle another tab's actual run", async (t) => {
  const { scope, state } = hook(t, { busy: true });
  await scope.handleSend("rejected draft");
  await flush();
  assert.equal(state.running, true);
  assert.equal(scope.sdkAgentActiveRef.current, true);
  assert.equal(state.ends, 0);
  assert.equal(state.restores.length, 1);
});

test("set_model 409 preserves original selection, does not reload branch or send draft", async (t) => {
  const { scope, state, ask, result } = hook(t);
  await scope.handleModelChange("gateway", "retired-gpt");
  assert.equal(state.override, null);
  assert.equal(state.model, oldModel);
  assert.equal(state.switching, false);
  assert.equal(state.reloads, 0);
  assert.equal(state.pendingAsk, ask);
  assert.deepEqual(state.messages, [result]);
  assert.deepEqual(state.requests.map(({ command }) => command.type), ["set_model"]);
  assert.equal(state.restores.length, 0, "the composer is untouched, not submitted");
  assert.match(state.notices[0].message, /previous selection and draft are unchanged/);
});

test("provisional set_model failure rolls back the local selection", async (t) => {
  const { scope, state } = hook(t, { isNew: true });
  scope.sessionIdRef.current = "provisional-id";
  await scope.handleModelChange("gateway", "retired-gpt");
  assert.equal(scope.newSessionModel, null);
  assert.equal(scope.newSessionModelOverrideRef.current, null);
  assert.equal(scope.pendingModel, oldModel);
  assert.match(state.notices[0].message, /previous selection and draft are unchanged/);
});

test("failed set_model while sending a provisional draft never falls through to prompt", async (t) => {
  const { scope, state } = hook(t, { isNew: true });
  scope.sessionIdRef.current = "provisional-id";
  scope.newSessionModel = oldModel;
  await scope.handleSend("keep this draft");
  await flush();
  assert.deepEqual(state.requests.filter(({ command }) => command).map(({ command }) => command.type), ["set_model"]);
  assert.equal(state.restores[0][0], "keep this draft");
  assert.equal(state.ends, 0);
  assert.match(state.notices[0].message, /previous selection and draft are unchanged/);
});

test("queued typed rejection restores input without affecting an existing run or ask", async (t) => {
  const { scope, state, ask } = hook(t);
  scope.agentRunningRef.current = true;
  state.running = true;
  await scope.sendStreamingPrompt("queued draft", "followUp");
  assert.deepEqual(state.restores, [["queued draft", undefined, "draft-key"]]);
  assert.equal(state.pendingAsk, ask);
  assert.equal(state.running, true);
  assert.equal(state.ends, 0);
  assert.match(state.notices[0].message, /No model request was sent/);
});

test("an ambiguous transport error is not treated as pre-admission rejection", async (t) => {
  const { scope, state } = hook(t);
  globalThis.fetch = async () => { throw new TypeError("network error"); };
  await scope.handleSend("possibly accepted");
  assert.equal(state.restores.length, 0);
  assert.equal(state.wait, 1);
  assert.equal(state.running, true);
  assert.equal(state.ends, 0);
});

test("a legal explicit model pick completes without automatically resending the rejected draft", async (t) => {
  const { scope, state } = hook(t, { fail: false });
  await scope.handleModelChange("gateway", "gpt");
  assert.deepEqual(state.model, { provider: "gateway", modelId: "gpt" });
  assert.equal(state.reloads, 1);
  assert.deepEqual(state.requests.map(({ command }) => command.type), ["set_model"]);
  assert.equal(state.notices.length, 0);
  assert.equal(state.ends, 0);
});

test("an unsafe selection DTO still restores a definitively rejected draft with local generic copy", async (t) => {
  const { scope, state } = hook(t, { failure: { reason: "unknown", message: "RAW_LOADER_SECRET" } });
  await scope.handleSend("keep unsafe rejection draft");
  await flush();
  assert.equal(state.restores[0][0], "keep unsafe rejection draft");
  assert.match(state.notices[0].message, /could not be verified safely/);
  assert.doesNotMatch(state.notices[0].message, /RAW_|HTTP|retired-gpt/);
  assert.equal(state.ends, 0);
});

test("a typed selection DTO without accepted:false cannot bypass prompt admission guards", async (t) => {
  const { scope, state } = hook(t);
  globalThis.fetch = async () => response({ error: "RAW_LOADER_SECRET", code: "model_selection_failed", modelSelection: dto() });
  await scope.handleSend("possibly accepted");
  assert.equal(state.restores.length, 0);
  assert.equal(state.wait, 1);
  assert.equal(state.ends, 0);
});

test("a late provisional selection refusal cannot roll back a newer explicit pick", async (t) => {
  const { scope, state } = hook(t, { isNew: true });
  scope.sessionIdRef.current = "provisional-id";
  let rejectFirst;
  globalThis.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    state.requests.push({ command });
    if (command.modelId === "retired-gpt") return new Promise((resolve) => { rejectFirst = () => resolve(response({ modelSelection: dto() })); });
    return response({ success: true, data: { provider: command.provider, id: command.modelId } }, 200);
  };
  const first = scope.handleModelChange("gateway", "retired-gpt");
  await scope.handleModelChange("gateway", "gpt");
  rejectFirst();
  await first;
  assert.deepEqual(scope.newSessionModel, { provider: "gateway", modelId: "gpt" });
  assert.deepEqual(scope.newSessionModelOverrideRef.current, { provider: "gateway", modelId: "gpt" });
  assert.deepEqual(scope.pendingModel, { provider: "gateway", modelId: "gpt" });
  assert.equal(state.requests.length, 2);
  assert.equal(state.ends, 0);
});

test("after rejection, explicit legal selection waits for the user to retry the kept draft", async (t) => {
  const { scope, state, ask } = hook(t);
  await scope.handleSend("retry me");
  await flush();
  const priorRequests = state.requests.length;
  globalThis.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    state.requests.push({ command });
    return response({ success: true, data: command.type === "set_model" ? { provider: command.provider, id: command.modelId } : null }, 200);
  };
  await scope.handleModelChange("gateway", "gpt");
  assert.deepEqual(state.requests.slice(priorRequests).map(({ command }) => command.type), ["set_model"]);
  assert.deepEqual(state.pendingAsk, ask);
  assert.equal(state.restores.length, 1);
  await scope.handleSend("retry me");
  assert.deepEqual(state.requests.slice(priorRequests).map(({ command }) => command.type), ["set_model", "prompt"]);
  assert.equal(state.restores.length, 1, "the accepted retry is not restored again");
  assert.equal(state.ends, 0, "HTTP admission is not completion");
});

test("queued selection DTO without negative ack does not claim not-sent or restore ambiguously accepted input", async (t) => {
  const { scope, state } = hook(t);
  globalThis.fetch = async () => response({ code: "model_selection_failed", modelSelection: dto() });
  await scope.sendStreamingPrompt("possibly queued", "followUp");
  assert.equal(state.restores.length, 0);
  assert.match(state.notices[0].message, /Could not confirm whether the queued input was accepted/);
  assert.doesNotMatch(state.notices[0].message, /No model request was sent|RAW_/);
  assert.equal(state.ends, 0);
});

// Real server bytes -> an in-memory EventSource transport -> real connection -> actual hook callback.
// No model runtime, auth/config/session files, provider requests or network are involved.
function startupConnection(t, sessionPromise, project = (event) => event) {
  const sources = [];
  const wireEvents = [];
  const events = [];
  const pumps = [];
  const connection = new AgentEventConnection({
    createSource(sessionId) {
      const abort = new AbortController();
      const reader = createAgentEventStream(
        new Request("http://localhost/events", { signal: abort.signal }), sessionId, sessionPromise,
      ).getReader();
      const source = {
        readyState: 1, onmessage: null, onerror: null, closeCount: 0,
        close() { this.readyState = 2; this.closeCount++; abort.abort(); },
      };
      sources.push(source);
      pumps.push((async () => {
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) return;
          buffer += decoder.decode(chunk.value, { stream: true });
          let end;
          while ((end = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (!frame.startsWith("data: ")) continue;
            const event = JSON.parse(frame.slice(6));
            wireEvents.push(event);
            if (source.readyState !== 2) {
              source.onmessage?.(new MessageEvent("message", { data: JSON.stringify(project(event)) }));
            }
          }
        }
      })());
      return source;
    },
    onEvent: (event) => events.push(event),
    shouldMaintain: () => true,
    readinessTimeoutMs: 1_000, reconnectDelayMs: 1,
  });
  t.after(async () => { connection.close(); await Promise.all(pumps); });
  return { connection, sources, wireEvents, events, drained: () => Promise.all(pumps) };
}

for (const locale of ["en", "zh-CN", "zh-TW"]) {
  test(`${locale}: real stream startup rejection reaches hook before POST, with target/not-sent and no completion`, async (t) => {
    const { scope, state, ask, result } = hook(t, { locale });
    const startup = startupConnection(
      t, Promise.reject(new ModelSelectionError("model-unavailable", "RAW_AUTH_SECRET", oldModel)),
    );
    scope.ensureEventsConnected = (sid) => startup.connection.ensureConnected(sid);
    const images = [{ data: "image-data", mimeType: "image/png" }];
    await scope.handleSend("unsent SSE draft", images);
    await startup.drained();
    await flush();
    assert.deepEqual(startup.wireEvents.map((event) => event.type), ["startup_error"]);
    assert.equal(startup.wireEvents[0].prePromptRejected, true);
    assert.deepEqual(startup.events, [], "startup failure is not completion or an agent event");
    assert.equal(startup.sources.length, 1, "terminal refusal must not retry");
    assert.equal(startup.sources[0].closeCount, 1);
    assert.equal(state.requests.filter(({ command }) => command).length, 0, "zero POST commands");
    assert.deepEqual(state.messages, [result]);
    assert.deepEqual(state.pendingAsk, ask);
    assert.equal(state.branch, "old-leaf");
    assert.deepEqual(state.restores, [["unsent SSE draft", images, "draft-key"]]);
    assert.equal(state.ends, 0);
    assert.equal(state.promotions, 0);
    assert.equal(state.wait, 0);
    assert.equal(state.running, false);
    assert.equal(state.notices.length, 1);
    const notice = state.notices[0].message;
    assert.match(notice, /gateway\/retired-gpt/);
    assert.match(notice, locale === "en"
      ? /No model request was sent/
      : locale === "zh-CN" ? /未向 .* 发送模型请求/ : /未向 .* 傳送模型請求/);
    assert.doesNotMatch(notice + JSON.stringify(startup.wireEvents), /RAW_|HTTP/);
  });
}

test("pre-POST startup DTO without explicit ack keeps legacy connection notice, not a not-sent claim", async (t) => {
  const { scope, state } = hook(t);
  const startup = startupConnection(
    t, Promise.reject(new ModelSelectionError("model-unavailable", "RAW_SECRET", oldModel)),
    (event) => {
      const withoutAck = { ...event };
      delete withoutAck.prePromptRejected;
      return withoutAck;
    },
  );
  scope.ensureEventsConnected = (sid) => startup.connection.ensureConnected(sid);
  await scope.handleSend("pre-POST draft");
  await startup.drained();
  await flush();
  assert.equal(state.requests.filter(({ command }) => command).length, 0);
  assert.deepEqual(state.restores, [["pre-POST draft", undefined, "draft-key"]],
    "local pre-POST knowledge still restores the draft");
  assert.equal(state.notices[0].message, "Failed to start agent: Model selection failed");
  assert.doesNotMatch(state.notices[0].message, /No model request was sent|RAW_/);
  assert.equal(state.ends, 0);
});

test("accepted queued input followed by unacknowledged startup/error never becomes a not-sent claim", async (t) => {
  const { scope, state, ask, result } = hook(t, { fail: false });
  scope.agentRunningRef.current = true;
  state.running = true;
  await scope.sendStreamingPrompt("already accepted queued input", "followUp");
  const startup = startupConnection(
    t, Promise.reject(new ModelSelectionError("model-unavailable", "RAW_SECRET", oldModel)),
    (event) => {
      const withoutAck = { ...event };
      delete withoutAck.prePromptRejected;
      return withoutAck;
    },
  );
  await assert.rejects(startup.connection.ensureConnected("child-id"), (error) => (
    error.status === "startup_error" && error.prePromptRejection === undefined
  ));
  await startup.drained();
  scope.handleAgentEvent({
    type: "prompt_error",
    errorMessage: "Accepted queued input later failed",
    modelSelection: dto(),
  });
  assert.deepEqual(state.requests.map(({ command }) => command?.type), ["prompt"]);
  assert.equal(state.restores.length, 0);
  assert.deepEqual(state.messages, [result]);
  assert.equal(state.pendingAsk, ask);
  assert.equal(state.branch, "old-leaf");
  assert.equal(state.running, true);
  assert.equal(state.ends, 0);
  assert.equal(state.notices.length, 1);
  assert.equal(state.notices[0].message, "Accepted queued input later failed");
  assert.doesNotMatch(state.notices[0].message, /No model request was sent|RAW_/);
});
