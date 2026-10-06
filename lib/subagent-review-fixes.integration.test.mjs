import { scratch } from "./subagent-gate-support.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { fauxProvider, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";
import { ModelRuntime, SettingsManager, SessionManager, createAgentSessionFromServices } from "@earendil-works/pi-coding-agent";

const jiti = createJiti(import.meta.url, { moduleCache: true });
const { createSubagentController } = await jiti.import("./subagent-runtime.ts");
const { resolveConcreteModel, resolveSubagentModelSelection } = await jiti.import("./subagent-model-selection.ts");
const { createSubagentSessionServices } = await jiti.import("./subagent-session-services.ts");
const { buildSubagentExcludeTools, initializeSubagentBuiltinTools } = await jiti.import("./subagent-tool-policy.ts");
const { resolveShellTools } = await jiti.import("./powershell-settings.ts");
const { decodeSubagentSessionResources, SUBAGENT_META_TYPE } = await jiti.import("./subagents.ts");
const agentDir = process.env.PI_CODING_AGENT_DIR;
const cwd = join(scratch, "review-project");
mkdirSync(cwd, { recursive: true });
const settingsManager = SettingsManager.inMemory({});

async function fresh(ids = ["gpt"]) {
  const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null, refreshOnCreate: false, allowModelNetwork: false });
  const faux = fauxProvider({ provider: "review-fixture", models: ids.map((id) => ({ id })) });
  modelRuntime.registerNativeProvider(faux.provider);
  await modelRuntime.refresh({ allowNetwork: false });
  return { modelRuntime, faux };
}
const select = (modelRuntime, extra) => resolveSubagentModelSelection({ modelRuntime, settingsManager, ...extra });
const refuses = (promise, reason) => assert.rejects(promise, (error) => error.reason === reason);

test("real memory runtime: retired :free / invalid suffix exact references never downshift to gpt", async () => {
  const { modelRuntime, faux } = await fresh(["gpt", "review-alias-20260606"]);
  for (const modelId of ["gpt:free", "gpt:invalid", "gpt@retired", "gpt:high"]) {
    await refuses(select(modelRuntime, { requestedReference: { provider: "review-fixture", modelId }, requestedModel: "review-fixture/gpt" }), "model-unavailable");
    await refuses(select(modelRuntime, { parentModel: { provider: "review-fixture", modelId } }), "model-unavailable");
    await refuses(resolveConcreteModel(modelRuntime, { provider: "review-fixture", modelId }), "model-unavailable");
  }
  for (const suffix of ["free", "invalid", "invalid:high"]) {
    await refuses(resolveConcreteModel(modelRuntime, `review-fixture/gpt:${suffix}`), "model-unavailable");
  }
  assert.equal((await resolveConcreteModel(modelRuntime, "review-fixture/gpt:high")).thinkingLevel, "high", "valid SDK thinking syntax remains available to patterns");
  assert.equal((await resolveConcreteModel(modelRuntime, "review-alias")).model.id, "review-alias-20260606", "SDK alias/fuzzy pattern still supported");
  assert.equal(faux.state.callCount, 0);
});

test("exact full :free and @ suffix ids beat thinking parsing, including exact parent", async () => {
  const { modelRuntime, faux } = await fresh(["gpt", "gpt:free", "gpt@001", "gpt:high"]);
  for (const modelId of ["gpt:free", "gpt@001", "gpt:high"]) {
    const object = await select(modelRuntime, { requestedReference: { provider: "review-fixture", modelId }, requestedModel: "review-fixture/gpt" });
    assert.equal(object.model.id, modelId);
    assert.equal((await resolveConcreteModel(modelRuntime, `review-fixture/${modelId}`)).model.id, modelId);
    assert.equal((await select(modelRuntime, { parentModel: { provider: "review-fixture", modelId } })).model.id, modelId);
  }
  assert.equal(faux.state.callCount, 0);
});

const legacyConfig = {
  name: "review legacy", baseUrl: "http://127.0.0.1:1/v1", apiKey: "fixture-secret-not-real", api: "openai-completions",
  models: [{ id: "gpt", name: "review GPT", input: ["text"], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 4096, maxTokens: 1024 }],
};
async function services(modelRuntime, factory) {
  return createSubagentSessionServices({ cwd, agentDir, modelRuntime, settingsManager, resourceLoader: {
    loadExtensions: true, explicitExtensions: [], extensionFactories: [{ name: "review-registration", factory }],
    noSkills: true, noContextFiles: true, noThemes: true, noPromptTemplates: true,
  } });
}
const legacyRef = { provider: "review-legacy", modelId: "gpt" };

test("inherit pending legacy valid then invalid registration refuses stale target and not an unrelated provider", async () => {
  const { modelRuntime, faux } = await fresh();
  const loaded = await services(modelRuntime, (pi) => {
    pi.registerProvider("review-legacy", legacyConfig);
    pi.registerProvider("review-legacy", { models: [{ id: "gpt", name: "broken" }] });
  });
  assert.ok(modelRuntime.getModel("review-legacy", "gpt"), "SDK retains the old valid definition");
  assert.ok(loaded.diagnostics.some((d) => d.type === "error"));
  await assert.rejects(select(modelRuntime, { requestedReference: legacyRef }), (error) => {
    assert.equal(error.reason, "provider-context-unavailable");
    assert.doesNotMatch(JSON.stringify(error.toSafeDTO()), /fixture-secret|127\.0\.0\.1|registration/i);
    return true;
  });
  assert.equal((await select(modelRuntime, { requestedReference: { provider: "review-fixture", modelId: "gpt" } })).model.id, "gpt");
  assert.equal(faux.state.callCount, 0, "refusal before any enqueue/prompt");
});

test("inherit session_start public registration failure remains sticky until a new loader generation", async () => {
  const { modelRuntime, faux } = await fresh();
  const loaded = await services(modelRuntime, (pi) => {
    pi.registerProvider("review-legacy", legacyConfig);
    pi.on("session_start", () => pi.registerProvider("review-legacy", { models: [{ id: "gpt", name: "broken" }] }));
  });
  const before = await select(modelRuntime, { requestedReference: legacyRef });
  const { session } = await createAgentSessionFromServices({ services: loaded, model: before.model, sessionManager: SessionManager.inMemory(cwd) });
  try {
    await session.bindExtensions({});
    assert.ok(modelRuntime.getModel("review-legacy", "gpt"));
    await refuses(select(modelRuntime, { requestedReference: legacyRef }), "provider-context-unavailable");
    await loaded.resourceLoader.reload();
    assert.equal((await select(modelRuntime, { requestedReference: legacyRef })).model.id, "gpt", "new successful factory generation clears the old failure");
    assert.equal(faux.state.callCount, 0);
    assert.equal(session.messages.length, 0, "no model prompt was admitted");
  } finally { session.dispose(); }
});

test("inherit pending native registration failure does not let a retained model pass admission", async () => {
  const { modelRuntime, faux } = await fresh();
  await services(modelRuntime, (pi) => {
    pi.registerProvider(faux.provider);
    pi.registerProvider({ id: "review-fixture" });
  });
  await refuses(select(modelRuntime, { requestedReference: { provider: "review-fixture", modelId: "gpt" } }), "provider-context-unavailable");
  assert.equal(faux.state.callCount, 0);
});

test("failed extension factory is not masked by existing builtin/old provider context", async () => {
  const { modelRuntime, faux } = await fresh();
  const loaded = await services(modelRuntime, () => { throw new Error("fixture-secret-factory"); });
  assert.ok(loaded.resourceLoader.getExtensions().errors.length);
  await refuses(select(modelRuntime, { requestedReference: { provider: "review-fixture", modelId: "gpt" } }), "provider-context-unavailable");
  assert.equal(faux.state.callCount, 0);
});

async function codingSession(builtinTools, factory = () => {}) {
  const { modelRuntime, faux } = await fresh();
  const loaded = await services(modelRuntime, factory);
  const { session } = await createAgentSessionFromServices({ services: loaded, model: faux.getModel("gpt"), excludeTools: buildSubagentExcludeTools(builtinTools), sessionManager: SessionManager.inMemory(cwd) });
  await session.bindExtensions({});
  return { session, loaded, faux };
}

test("real SDK explore/general-purpose initialized coding tools are active and declared", async () => {
  for (const builtinTools of [["read", "grep", "find", "ls"], ["read", "bash", "edit", "write", "grep", "find", "ls"]]) {
    const { session, loaded, faux } = await codingSession(builtinTools);
    try {
      initializeSubagentBuiltinTools(session, builtinTools, loaded.resourceLoader.getExtensions());
      assert.deepEqual(session.getActiveToolNames().sort(), [...builtinTools].sort());
      for (const name of builtinTools) assert.ok(session.getToolDefinition(name));
      let request;
      faux.setResponses([(context) => { request = context; return fauxAssistantMessage(fauxText("local fixture only")); }]);
      await session.prompt("inspect declarations");
      assert.deepEqual(request.messages.filter((message) => message.role === "system").flatMap((message) => message.toolsAdded ?? []).map((tool) => tool.name).sort(), [...builtinTools].sort());
      assert.equal(faux.state.callCount, 1);
    } finally { session.dispose(); }
  }
});

test("cold builtin pins activate only registered licensed coding tools and preserve extension/manual-off/overrides", async () => {
  const tool = (name, extra = {}) => ({ name, label: name, description: name, parameters: { type: "object", properties: {} }, execute: async () => ({ content: [{ type: "text", text: name }] }), ...extra });
  const { session, loaded } = await codingSession(["read", "grep", "find", "ls"], (pi) => {
    pi.registerTool(tool("ext_keep"));
    pi.registerTool(tool("ext_off"));
    pi.registerTool(tool("ext_hidden", { exposure: "hidden" }));
    pi.registerTool(tool("ext_inactive", { defaultActive: false }));
    pi.registerTool(tool("grep", { defaultActive: false }));
    pi.on("session_start", () => pi.setActiveTools(["ext_keep"]));
  });
  try {
    initializeSubagentBuiltinTools(session, ["read", "grep", "find", "ls"], loaded.resourceLoader.getExtensions(), ["read", "grep", "find", "bash", "unknown", "ext_off"]);
    assert.deepEqual(session.getActiveToolNames().sort(), ["ext_keep", "read", "find"].sort());
    assert.ok(!session.getActiveToolNames().includes("grep"), "coding-name extension override stays inactive");
    initializeSubagentBuiltinTools(session, ["read", "grep", "find", "ls"], loaded.resourceLoader.getExtensions(), []);
    assert.deepEqual(session.getActiveToolNames(), ["ext_keep"], "empty persisted coding pins keep extension active but do not resurrect coding tools");
  } finally { session.dispose(); }
});

test("win32 shell mapping snapshot round-trip licenses powershell (mapping execution on Linux, not Windows)", async () => {
  const mapped = resolveShellTools(["read", "bash", "write"], ["powershell"], "win32");
  assert.deepEqual(mapped, ["read", "powershell", "write"]);
  const snapshot = { version: 1, appendSystemPrompt: [], tools: mapped, loadSkills: false, loadExtensions: false, toolPolicy: { version: 1, builtinTools: mapped, extensionAllow: [], extensionDeny: [] } };
  const entries = [{ type: "custom", customType: SUBAGENT_META_TYPE, data: { version: 1, parentSessionId: "parent", parentSessionPath: join(scratch, "parent.jsonl"), resourceSnapshot: JSON.parse(JSON.stringify(snapshot)) } }];
  const decoded = decodeSubagentSessionResources(entries);
  assert.equal(decoded.kind, "valid");
  assert.deepEqual(decoded.resources.toolPolicy.builtinTools, mapped);
  assert.deepEqual(decoded.resources.tools, mapped);
  const { session, loaded } = await codingSession(mapped);
  try {
    initializeSubagentBuiltinTools(session, mapped, loaded.resourceLoader.getExtensions());
    assert.ok(session.getActiveToolNames().includes("powershell"), "actual SDK registered mapped tool can be initialized");
    assert.ok(!session.getActiveToolNames().includes("bash"));
  } finally { session.dispose(); }
});


test("real inherited Agent start valid-then-invalid legacy registration rejects before wrapper/queue/request", async () => {
  const { modelRuntime, faux } = await fresh();
  const manager = SessionManager.inMemory(cwd);
  const parentInner = { model: { ...faux.getModel("gpt"), provider: "review-legacy" }, modelRuntime, agent: { state: { thinkingLevel: "off" } }, sessionManager: manager };
  const parent = { inner: parentInner, sessionFile: join(scratch, "parent.jsonl"), cwd, isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  const extensionsDir = join(agentDir, "extensions");
  mkdirSync(extensionsDir, { recursive: true });
  const fixture = join(extensionsDir, "review-a-start.js");
  globalThis.__reviewAFactories = 0;
  writeFileSync(fixture, `export default function(pi) { globalThis.__reviewAFactories++; pi.registerProvider("review-legacy", ${JSON.stringify(legacyConfig)}); pi.registerProvider("review-legacy", {models:[{id:"gpt",name:"broken"}]}); }`);
  let registered = 0;
  const beforeRuns = globalThis.__piSubagentRuns?.size ?? 0;
  const controller = createSubagentController({
    getSession: (id) => id === manager.getSessionId() ? parent : undefined,
    registerSession: () => { registered++; },
    reopenSession: async () => { throw new Error("unexpected reopen"); },
    resolveSessionPath: async () => null,
    invalidateSessionList: () => {},
    isBuiltInSubagentsEnabled: () => true,
  });
  try {
    await refuses(controller.extensionRuntime.start({ parentContext: parentInner, parentToolCallId: "review-failure", profile: "explore", task: "must not send", description: "review fixture" }), "provider-context-unavailable");
    assert.equal(globalThis.__reviewAFactories, 1, "real inherited extension factory ran before refusal");
    assert.equal(registered, 0, "no unpublished wrapper even registered");
    assert.equal(globalThis.__piSubagentRuns?.size ?? 0, beforeRuns, "no queued/running result created");
    assert.equal(faux.state.callCount, 0);
    assert.ok(modelRuntime.getModel("review-fixture", "gpt"), "independent child did not mutate parent catalog");
  } finally { rmSync(fixture, { force: true }); delete globalThis.__reviewAFactories; }
});


test("real controller new explore/general-purpose await ready and declare initialized builtins plus late extension", async () => {
  const { modelRuntime, faux } = await fresh();
  const manager = SessionManager.inMemory(cwd);
  const parentInner = { model: faux.getModel("gpt"), modelRuntime, settingsManager: { getDefaultTools: () => { throw new Error("parent settings must not decide child shell"); } }, agent: { state: { thinkingLevel: "off" } }, sessionManager: manager };
  const parent = { inner: parentInner, sessionFile: join(scratch, "parent.jsonl"), cwd, isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  const fixture = join(agentDir, "extensions", "review-a-start-active.js");
  const oldRuns = globalThis.__piSubagentRuns;
  const oldEvidence = globalThis.__reviewARequests;
  globalThis.__piSubagentRuns = new Map();
  globalThis.__reviewARequests = [];
  writeFileSync(fixture, `import { fauxProvider, fauxAssistantMessage, fauxText } from ${JSON.stringify(import.meta.resolve("@earendil-works/pi-ai"))};
export default function(pi) {
  const local = fauxProvider({provider:"review-fixture", models:[{id:"gpt"}]});
  pi.registerProvider(local.provider);
  local.setResponses([(context) => { globalThis.__reviewARequests.push(context); return fauxAssistantMessage(fauxText("controller local completion")); }]);
  pi.on("session_start", () => pi.registerTool({name:"late_search",label:"late_search",description:"local fixture",parameters:{type:"object",properties:{}},execute:async()=>({content:[{type:"text",text:"local"}]})}));
}`);
  let child;
  const controller = createSubagentController({
    getSession: (id) => id === manager.getSessionId() ? parent : undefined,
    registerSession: (inner) => {
      child = inner;
      const ready = inner.bindExtensions({});
      return { inner, sessionFile: inner.sessionFile, cwd, isAlive: () => true, isRunning: () => false, waitUntilReady: () => ready };
    },
    reopenSession: async () => { throw new Error("unexpected reopen"); }, resolveSessionPath: async () => null,
    invalidateSessionList: () => {}, isBuiltInSubagentsEnabled: () => true,
  });
  try {
    for (const [profile, coding] of [["explore", ["read", "grep", "find", "ls"]], ["general-purpose", ["read", "bash", "edit", "write", "grep", "find", "ls"]]]) {
      const execution = await controller.extensionRuntime.start({ parentContext: parentInner, parentToolCallId: `review-active-${profile}`, profile, task: "local declaration fixture", description: "review active" });
      const result = await execution.completion;
      assert.equal(result.status, "completed");
      assert.deepEqual(child.getActiveToolNames().sort(), [...coding, "late_search"].sort());
      const context = globalThis.__reviewARequests.at(-1);
      assert.ok(context);
      assert.deepEqual(context.messages.filter((m) => m.role === "system").flatMap((m) => m.toolsAdded ?? []).map((t) => t.name).sort(), [...coding, "late_search"].sort());
      const metadata = child.sessionManager.getBranch().find((entry) => entry.type === "custom" && entry.customType === SUBAGENT_META_TYPE).data;
      assert.equal(metadata.resourceSnapshot.loadExtensions, true);
      assert.equal(metadata.resourceSnapshot.providerSources, undefined, "ordinary inheritance does not persist mandatory C provenance");
      child.dispose();
    }
    assert.equal(globalThis.__reviewARequests.length, 2, "only two local child requests");
    assert.equal(faux.state.callCount, 0, "parent never prompted");
  } finally {
    child?.dispose();
    rmSync(fixture, { force: true });
    globalThis.__piSubagentRuns = oldRuns;
    globalThis.__reviewARequests = oldEvidence;
  }
});


test("shell permission mapping uses independent child cwd settings after final trust reload", async () => {
  const childAgentDir = join(scratch, "review-shell-agent");
  const childCwd = join(scratch, "review-shell-cwd");
  mkdirSync(childAgentDir, { recursive: true });
  mkdirSync(join(childCwd, ".pi"), { recursive: true });
  writeFileSync(join(childAgentDir, "settings.json"), JSON.stringify({ defaultTools: ["bash"] }));
  writeFileSync(join(childCwd, ".pi", "settings.json"), JSON.stringify({ defaultTools: ["powershell"] }));
  for (const trusted of [false, true]) {
    const { modelRuntime } = await fresh();
    const childSettings = SettingsManager.create(childCwd, childAgentDir, { projectTrusted: !trusted });
    const before = resolveShellTools(["bash"], childSettings.getDefaultTools(), "win32");
    const loaded = await createSubagentSessionServices({
      cwd: childCwd, agentDir: childAgentDir, modelRuntime, settingsManager: childSettings,
      resourceLoader: { explicitExtensions: [] },
      resourceLoaderReloadOptions: { resolveProjectTrust: async () => trusted },
    });
    const mapped = resolveShellTools(["bash"], loaded.settingsManager.getDefaultTools(), "win32");
    assert.deepEqual(mapped, trusted ? ["powershell"] : ["bash"]);
    assert.notDeepEqual(mapped, before, "pre-trust shell permission would be incorrect");
  }
});
