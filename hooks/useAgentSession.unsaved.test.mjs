import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { AgentCommandError, isPromptRejectedError, isUnavailableAgentSessionError, readAgentCommandError } = await jiti.import("../lib/agent-client.ts");
const { AgentEventConnectionError } = await jiti.import("../lib/agent-event-connection.ts");
const { getToolNamesForPreset, CONFIGURED_TOOL_PRESET } = await jiti.import("../lib/tool-presets.ts");
const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("useAgentSession.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

// Execute the production callbacks, not a second implementation of recovery.
// This proves callback behavior, not React mounting or browser URL rendering.
function callbackSource(name) {
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === name) callback = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.ok(callback && ts.isCallExpression(callback));
  return `const ${name} = ${callback.arguments[0].getText(parsed)};`;
}
const code = ts.transpileModule([
  callbackSource("promoteNewSession"), callbackSource("ensureNewSession"),
  callbackSource("clearSlashCommands"), callbackSource("handleSend"),
  callbackSource("requestSlashCommands"), callbackSource("loadSlashCommands"),
  "globalThis.send = handleSend; globalThis.loadCommands = loadSlashCommands;",
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ isNew = true, toolPreset = CONFIGURED_TOOL_PRESET, readinessError, promptError } = {}) {
  const ref = (current) => ({ current });
  const chosen = { provider: "synthetic", modelId: "chosen-model" };
  const calls = { prompts: [], commands: [], ensures: [], restored: [], promoted: [], notices: [], reconciled: [], settled: [], closed: 0, clearedCommands: 0 };
  const state = { messages: [] };
  const context = {
    console: { error() {} }, Date, Map, JSON, Response,
    isNew, newSessionCwd: "/intended-project", newSessionDraftKey: "draft-key", composerDraftKey: "draft-key",
    newSessionModel: chosen, toolPreset, editEntryId: null,
    session: isNew ? null : { id: "old-id" }, opts: { chatInputRef: null },
    sessionIdRef: ref("old-id"), sessionPropIdRef: ref(isNew ? null : "old-id"), sessionHookMountedRef: ref(true),
    newSessionPromotedRef: ref(false), ensuringNewSessionRef: ref(null), draftKeyAliasesRef: ref(new Map()),
    newSessionRetiredRef: ref(false),
    newSessionModelOverrideRef: ref(chosen), thinkingLevelOverrideRef: ref("high"), sessionToolsPinnedRef: ref(false),
    agentRunningRef: ref(false), bashRunningRef: ref(false), sdkAgentActiveRef: ref(false), rpcPromptPendingRef: ref(false),
    promptRunIdRef: ref(0), trellisPromptViewGenerationRef: ref(null), trellisViewGenerationRef: ref(1),
    pendingScrollToUserRef: ref(false), optimisticUserMessageKeyRef: ref(null), handleNavigateRef: ref(null), executeBashRef: ref(null),
    slashCommandsGenerationRef: ref(0), slashCommandsLoadRef: ref(null),
    getToolNamesForPreset, isPromptRejectedError, isUnavailableAgentSessionError, readAgentCommandError, AgentEventConnectionError,
    userMessageKey: (m) => m.content, asConcreteThinkingLevel: (v) => v,
    getChatInput: () => null, rekeyDraft() {}, replaceSlashCommands() { calls.clearedCommands++; }, setSlashCommandsLoading() {},
    formatModelSelectionError: () => null, translate: (key) => key,
    setMessages(update) { state.messages = update(state.messages); },
    setAgentRunning(value) { state.running = value; }, setAgentPhase(value) { state.phase = value; },
    dispatch() {}, setPromptAnchorActive() {}, setPendingModel() {}, setNewSessionDefaultModel() {},
    setLiveThinkingLevel() {}, setNewSessionDefaultThinkingLevel() {}, setSystemPrompt() {}, onSystemToolsChange() {}, setLiveModel() {},
    cancelEventStreamGrace() {}, closeEvents() { calls.closed++; }, setEdit() {},
    addNotice(notice) { calls.notices.push(notice); },
    restoreSubmission(...args) { calls.restored.push(args); },
    onSessionCreated(info) { calls.promoted.push(info); },
    reconcileAgentState(id) { calls.reconciled.push(id); },
    waitForPromptSettlement(...args) { calls.settled.push(args); },
    async ensureEventsConnected() {
      if (readinessError) { const error = readinessError; readinessError = null; throw error; }
    },
    async sendAgentCommand(id, command) {
      calls.commands.push({ id, command });
      if (command.type === "prompt") {
        calls.prompts.push({ id, command });
        if (promptError) throw promptError;
      }
    },
    async fetch(_url, request) {
      calls.ensures.push(JSON.parse(request.body));
      return new Response(JSON.stringify({ sessionId: "fresh-id", model: chosen, thinkingLevel: "high" }), { status: 200 });
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, calls, state, chosen };
}

function unavailableReadiness() {
  return new AgentEventConnectionError("startup_error", "expired", new AgentCommandError("expired", 404, "session_unavailable", false));
}

test("expired unsent identity preserves the draft; only the next explicit send ensures the original choices", async () => {
  const { context, calls, state, chosen } = harness({ toolPreset: "read-only", readinessError: unavailableReadiness() });
  await context.send("original message");
  assert.equal(context.sessionIdRef.current, null);
  assert.equal(state.running, false);
  assert.equal(state.phase, null);
  assert.equal(state.messages.length, 0);
  assert.equal(calls.prompts.length, 0);
  assert.equal(calls.ensures.length, 0, "no automatic recreation or resubmission");
  assert.equal(calls.closed, 2); // retire the connection, then settle the UI
  assert.equal(calls.clearedCommands, 1);
  assert.equal(calls.reconciled.length, 0);
  assert.deepEqual(calls.restored, [["original message", undefined, "draft-key"]]);
  assert.equal(calls.notices[0].message, "chat.sessionUnavailable");
  assert.equal(context.newSessionModelOverrideRef.current, chosen);
  assert.equal(context.thinkingLevelOverrideRef.current, "high");
  assert.equal(context.toolPreset, "read-only");

  await context.send("original message");
  assert.equal(calls.ensures.length, 1);
  assert.deepEqual(calls.ensures[0], { cwd: "/intended-project", type: "ensure_session", toolNames: ["read", "grep", "find", "ls"], provider: "synthetic", modelId: "chosen-model", thinkingLevel: "high" });
  assert.equal(context.sessionIdRef.current, "fresh-id");
  assert.equal(calls.prompts.length, 1);
  assert.equal(calls.prompts[0].id, "fresh-id");
  assert.equal(calls.promoted[0].id, "fresh-id");
  assert.equal(calls.promoted[0].cwd, "/intended-project");
});

test("a negative prompt HTTP acknowledgement may retire an unsent new identity", async () => {
  const promptError = readAgentCommandError({ code: "prompt_rejected", accepted: false, reason: "session_unavailable" }, 404);
  const { context, calls, state } = harness({ promptError });
  await context.send("keep this draft");
  assert.equal(context.sessionIdRef.current, null);
  assert.equal(calls.prompts.length, 1);
  assert.equal(calls.ensures.length, 0);
  assert.equal(calls.restored.length, 1);
  assert.equal(state.running, false);
});

test("ambiguous transport failure after dispatch never recreates or resends a possibly accepted prompt", async () => {
  const { context, calls, state } = harness({ promptError: new TypeError("connection reset") });
  await context.send("possibly accepted");
  assert.equal(context.sessionIdRef.current, "old-id");
  assert.equal(calls.prompts.length, 1);
  assert.equal(calls.ensures.length, 0);
  assert.equal(calls.restored.length, 0);
  assert.equal(calls.settled.length, 1);
  assert.equal(state.running, true);
});

test("an explicit saved-session selection is never replaced by the new-composer recovery", async () => {
  const { context, calls } = harness({ isNew: false, readinessError: unavailableReadiness() });
  await context.send("unsent deep-link draft");
  assert.equal(context.sessionIdRef.current, "old-id");
  assert.equal(calls.ensures.length, 0);
  assert.equal(calls.promoted.length, 0);
  assert.equal(calls.restored.length, 1);
  assert.deepEqual(calls.reconciled, ["old-id"]);
});

test("a readiness timeout without a negative acknowledgement does not retire an identity", async () => {
  const { context, calls } = harness({ readinessError: new AgentEventConnectionError("timeout", "unproven failure") });
  await context.send("keep my draft");
  assert.equal(context.sessionIdRef.current, "old-id");
  assert.equal(calls.prompts.length, 0);
  assert.equal(calls.ensures.length, 0);
  assert.equal(calls.restored.length, 1);
  assert.equal(calls.clearedCommands, 0);
});

test("a restored slash draft cannot passively recreate a retired runtime", async () => {
  const { context, calls } = harness({ readinessError: unavailableReadiness() });
  await context.send("/my-extension");
  assert.equal(context.newSessionRetiredRef.current, true);
  assert.equal(context.sessionIdRef.current, null);
  await context.loadCommands(); // ChatInput palette effect after draft restoration
  assert.equal(calls.ensures.length, 0);
  assert.equal(calls.prompts.length, 0);
  assert.equal(context.sessionIdRef.current, null);
  await context.send("/my-extension");
  assert.equal(calls.ensures.length, 1);
  assert.equal(calls.prompts.length, 1);
  assert.equal(calls.promoted[0].id, "fresh-id");
});
