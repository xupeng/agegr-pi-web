// Evidence-only installed package smoke. Run in env-i/bwrap unshare-net before any SDK/Web import.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const [tree, external, expectedRef] = process.argv.slice(2);
const root = process.env.PI_TASK_TMPDIR;
assert.ok(root && !root.startsWith("/tmp/"));
assert.equal(process.env.HOME, join(root, "home"));
const agentDir = join(root, "agent");
assert.equal(process.env.PI_CODING_AGENT_DIR, agentDir);
assert.equal(process.env.PI_OFFLINE, "1");
assert.equal(process.env.JITI_FS_CACHE, "false");
assert.equal(process.env.NODE_OPTIONS, undefined, "mock-only test preload must not reach actual runtime smoke");
assert.equal(process.env.PI_TEST_MOCK_UPDATE_CHECKS, undefined);
assert.deepEqual(Object.keys(networkInterfaces()), ["lo"]);
const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
assert.equal(git(tree, "rev-parse", "HEAD"), expectedRef);
assert.equal(git(tree, "status", "--short"), "");
const hash = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const sourceHead = git(external, "rev-parse", "HEAD");
assert.equal(git(external, "status", "--short"), "");
const packageDir = join(root, "actual-installed-package-copy");
const cwd = join(root, "project");
for (const dir of [root, agentDir, process.env.HOME, packageDir, cwd]) mkdirSync(dir, { recursive: true });
const copiedHashes = {};
for (const file of ["package.json", "index.ts", "bridge.ts", "tool.ts", "types.ts", "validation.ts", "format.ts",
  "tui-state.ts", "tui-form.ts", "tui-host.ts", "LICENSE"]) {
  const path = join(external, file);
  assert.equal(lstatSync(path).isSymbolicLink(), false);
  copyFileSync(path, join(packageDir, file));
  assert.equal(hash(path), hash(join(packageDir, file)));
  copiedHashes[file] = hash(path);
}
assert.equal(realpathSync(packageDir), packageDir);
for (const name of ["node_modules", ".git"]) assert.equal(existsSync(join(packageDir, name)), false);
const copiedRequire = createRequire(join(packageDir, "index.ts"));
const resolveHost = name => fileURLToPath(import.meta.resolve(name, pathToFileURL(join(tree, "package.json")).href));
const lock = JSON.parse(readFileSync(join(tree, "package-lock.json"), "utf8"));
const sdkIdentity = {};
for (const suffix of ["pi-agent-core", "pi-ai", "pi-coding-agent", "pi-tui"]) {
  const name = `@earendil-works/${suffix}`;
  const manifest = join(tree, "node_modules", name, "package.json");
  const version = JSON.parse(readFileSync(manifest, "utf8")).version;
  assert.equal(version, "1.0.0");
  assert.equal(lock.packages[`node_modules/${name}`].version, version);
  sdkIdentity[name] = { version, entry: resolveHost(name), manifestSha256: hash(manifest),
    integrity: lock.packages[`node_modules/${name}`].integrity };
  assert.throws(() => copiedRequire.resolve(name), { code: "MODULE_NOT_FOUND" });
}
// Everything above precedes SDK/Web import and touches only explicit source evidence or owned scratch.
process.env.PI_WEB_ASK_USER = "0";
process.env.PI_WEB_IDLE_TIMEOUT_MS = "0";
process.env.PI_WEB_DISABLE_MCP = "1";
writeFileSync(join(agentDir, "pi-web-settings.json"), '{"askUser":false}');
const sdk = await import(pathToFileURL(resolveHost("@earendil-works/pi-coding-agent")).href);
const ai = await import(pathToFileURL(resolveHost("@earendil-works/pi-ai")).href);
const { createJiti } = await import(pathToFileURL(resolveHost("jiti")).href);
const jiti = createJiti(join(tree, "package.json"), { tsconfigPaths: true, moduleCache: false, fsCache: false });
const { createAskUserExtension } = await jiti.import(join(tree, "lib/ask-user/extension.ts"));
const { projectAskUserTools } = await jiti.import(join(tree, "lib/ask-user/extension-policy.ts"));
const { AgentSessionWrapper, getRpcSession } = await jiti.import(join(tree, "lib/rpc-manager.ts"));
const questions = [
  { id: "scope", question: "Actual package: choose scope?", options: [{ value: "small", label: "Small" }] },
  { id: "regions", question: "Choose regions?", multiple: true, options: [{ value: "eu", label: "Europe" }, { value: "us", label: "US" }] },
  { id: "custom", question: "Custom input?", options: [] },
  { id: "skipped", question: "Leave unanswered?", options: [] },
];
let providerCalls = 0;
const callRecords = [];
const faux = ai.fauxProvider({ provider: "actual-installed-probe", models: [{ id: "offline" }] });
faux.setResponses(Array.from({ length: 32 }, () => context => {
  providerCalls++;
  const last = [...context.messages].reverse().find(message => message.role !== "system");
  const text = JSON.stringify(last);
  callRecords.push({ number: providerCalls, role: last?.role, text });
  assert.notEqual(last?.role, "toolResult", "a posted ask must terminate before an automatic extra provider request");
  if (/The user submitted answers|The question set was closed/.test(text)) {
    return ai.fauxAssistantMessage([ai.fauxText("ACTUAL PACKAGE CONTINUED: " + text)]);
  }
  return ai.fauxAssistantMessage([ai.fauxToolCall("ask_user", { questions })]);
}));
const runtime = await sdk.ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null,
  modelsStorePath: join(agentDir, "models-store.json"), refreshOnCreate: false, allowModelNetwork: false });
runtime.registerNativeProvider(faux.provider);
const manager = sdk.SessionManager.create(cwd, join(agentDir, "sessions"));
const id = manager.getSessionId();
// Probe-owned registry only; never register in or consult a main/live session registry.
const localRegistry = new Map();
const settings = sdk.SettingsManager.inMemory({ packages: [packageDir], extensions: [], defaultTools: [],
  compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off" });
let originalTool;
const services = await sdk.createAgentSessionServices({ cwd, agentDir, modelRuntime: runtime, settingsManager: settings,
  resourceLoaderOptions: { noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true,
    extensionFactories: [createAskUserExtension(sid => localRegistry.get(sid), () => manager.getSessionId())],
    extensionsOverride: base => {
      originalTool = base.extensions.flatMap(ext => [...ext.tools.values()]).find(tool => tool.definition.name === "ask_user");
      const projected = projectAskUserTools(base);
      const policyTool = projected.extensions.flatMap(ext => [...ext.tools.values()]).find(tool => tool.definition.name === "ask_user");
      assert.equal(policyTool.sourceInfo, originalTool.sourceInfo, "policy preserves source metadata before SDK annotates it");
      return projected;
    },
  },
});
const { session: inner } = await sdk.createAgentSessionFromServices({ services, sessionManager: manager, model: faux.getModel(), noTools: "builtin" });
const wrapper = new AgentSessionWrapper(inner, { suppressCompletionNotifications: true });
localRegistry.set(id, wrapper);
wrapper.onDestroy(() => localRegistry.delete(id));
const events = [];
const rawResults = [];
wrapper.onEvent(event => events.push(event));
const unsubscribe = inner.subscribe(event => {
  if (event.type === "tool_execution_end" && event.toolName === "ask_user") rawResults.push(event.result);
});
wrapper.start();
wrapper.beginExtensionBinding();
const until = async predicate => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { const value = predicate(); if (value) return value; await delay(10); }
  throw new Error("actual installed package smoke timed out");
};
const mirror = join(agentDir, "pi-web-open-asks.json");
const mirrorAsk = () => JSON.parse(readFileSync(mirror, "utf8")).asks[id];
let sourceInfo;
let sourcePath;
let uiCustom = 0;
const observations = [];
const checkDiscovery = async () => {
  const loaded = services.resourceLoader.getExtensions();
  assert.deepEqual(loaded.errors, []);
  const owners = loaded.extensions.filter(ext => ext.tools.has("ask_user"));
  assert.equal(owners.length, 1);
  assert.equal(owners[0].path, join(packageDir, "index.ts"));
  const projected = owners[0].tools.get("ask_user");
  assert.equal(projected.definition.execute, originalTool.definition.execute, "preserve installed execute identity");
  assert.equal(projected.definition.parameters, originalTool.definition.parameters, "preserve installed schema identity");
  assert.equal(projected.definition.description, originalTool.definition.description);
  // SDK annotates package/user source metadata after extensionsOverride. Do not
  // compare the retained pre-annotation RegisteredTool against final metadata.
  assert.equal(projected.sourceInfo.source, packageDir);
  assert.equal(projected.sourceInfo.origin, "package");
  assert.equal(projected.sourceInfo.scope, "user");
  assert.equal(projected.definition.exposure, "model-only");
  assert.equal(loaded.extensions.find(ext => ext.path === "<inline:pi-web-ask-user-host>").tools.size, 0);
  const tools = (await wrapper.send({ type: "get_tools" })).filter(tool => tool.name === "ask_user");
  assert.equal(tools.length, 1);
  assert.equal(tools[0].exposure, "model-only");
  assert.equal(tools[0].sourceInfo.source, packageDir);
  assert.equal(inner.getActiveToolNames().includes("ask_user"), true);
  assert.equal(getRpcSession(id), undefined, "probe must not reuse production/global RPC registry");
  sourceInfo = tools[0].sourceInfo; sourcePath = owners[0].path;
  return projected.definition;
};
try {
  await checkDiscovery();
  await wrapper.send({ type: "prompt", message: "Post actual installed ask" });
  const first = await until(() => wrapper.pendingAsk);
  await until(() => !wrapper.isRunning());
  assert.equal(providerCalls, 1);
  assert.equal(events.filter(e => e.type === "ask.opened").length, 1);
  assert.equal(mirrorAsk().askId, first.askId);
  assert.ok(inner.messages.some(m => m.role === "toolResult" && !m.isError && /Posted 4 questions/.test(JSON.stringify(m.content))));
  observations.push({ stage: "initial", providerCalls, opens: 1, persistedAskId: first.askId });
  const submitted = await wrapper.send({ type: "ask_submit", askId: first.askId, answers: [
    { id: "scope", values: ["small"] }, { id: "regions", values: ["eu", "us"] },
    { id: "custom", values: [], otherText: "Actual custom answer" },
  ], supplement: "Actual supplement" });
  assert.equal(submitted.result, "closed");
  assert.deepEqual(submitted.outcome.unansweredIds, ["skipped"]);
  assert.equal(wrapper.pendingAsk, undefined);
  await until(() => providerCalls === 2 && !wrapper.isRunning());
  assert.equal(wrapper.sessionId, id);
  assert.equal(mirrorAsk(), undefined);
  assert.ok(inner.messages.some(m => m.role === "custom" && m.customType === "pi-web.ask.answers")
    || inner.messages.some(m => m.role === "custom" && /Actual supplement/.test(JSON.stringify(m))));
  observations.push({ stage: "submit-follow-up", providerCalls, sessionId: id, unansweredIds: submitted.outcome.unansweredIds });
  for (let round = 1; round <= 3; round++) {
    await wrapper.send({ type: "reload" });
    await checkDiscovery();
    const before = providerCalls;
    const openedBefore = events.filter(e => e.type === "ask.opened").length;
    await wrapper.send({ type: "prompt", message: `Actual installed ask after reload ${round}` });
    const pending = await until(() => wrapper.pendingAsk);
    await until(() => !wrapper.isRunning());
    assert.equal(providerCalls, before + 1);
    assert.equal(events.filter(e => e.type === "ask.opened").length, openedBefore + 1);
    assert.equal(mirrorAsk().askId, pending.askId);
    const cancelled = await wrapper.send({ type: "ask_cancel", askId: pending.askId });
    assert.equal(cancelled.result, "closed");
    assert.equal(cancelled.outcome.reason, "cancelled");
    await until(() => providerCalls === before + 2 && !wrapper.isRunning());
    assert.equal(wrapper.sessionId, id);
    assert.equal(wrapper.pendingAsk, undefined);
    assert.equal(mirrorAsk(), undefined);
    observations.push({ stage: `reload-${round}-cancel-follow-up`, providerCalls, sessionId: id, askId: pending.askId });
  }
  // Explicit execute proves the actual external result contains terminate:true and never calls native UI.
  const definition = await checkDiscovery();
  const direct = await definition.execute("actual-package-direct", { questions }, undefined, undefined,
    { mode: "rpc", hasUI: true, cwd, sessionManager: manager,
      ui: { custom() { uiCustom++; throw new Error("RPC must not open native TUI"); } } });
  assert.equal(direct.terminate, true);
  assert.match(direct.content[0].text, /Posted 4 questions/);
  assert.equal(providerCalls, 8, "direct execute is not a provider request");
  assert.equal(uiCustom, 0);
  const cancelled = await wrapper.send({ type: "ask_cancel", askId: wrapper.pendingAsk.askId });
  assert.equal(cancelled.result, "closed");
  await until(() => providerCalls === 9 && !wrapper.isRunning());
  assert.equal(events.filter(e => e.type === "ask.opened").length, 5);
  assert.equal(events.filter(e => e.type === "ask.closed").length, 5);
  assert.equal(events.filter(e => e.type === "extension_ui_request" && ["custom", "custom_ui"].includes(e.method)).length, 0);
  assert.equal(wrapper.pendingAsk, undefined);
  assert.equal(mirrorAsk(), undefined);
  assert.ok(existsSync(wrapper.sessionFile));
  assert.equal(git(tree, "rev-parse", "HEAD"), expectedRef);
  assert.equal(git(external, "rev-parse", "HEAD"), sourceHead);
  for (const [file, value] of Object.entries(copiedHashes)) assert.equal(hash(join(external, file)), value);
  console.log(JSON.stringify({ candidateRef: expectedRef, candidateTree: git(tree, "rev-parse", "HEAD^{tree}"),
    sdkIdentity, external: { source: external, gitHead: sourceHead, copiedPackage: packageDir, copiedHashes },
    effective: { sourcePath, sourceInfo, exposure: "model-only", executeSchemaSourceIdentityPreserved: true },
    wrapperRegistration: "isolated probe-owned Map; real SDK services/AgentSession + real AgentSessionWrapper.start/bind/commands",
    sessionId: id, observations, providerCalls, directTerminate: direct.terminate,
    opened: 5, closed: 5, uiCustom, rawToolResultCount: rawResults.length,
    persistedMirrorCleared: true, sessionFile: wrapper.sessionFile,
    oldAskUserFalseAndEnv0: true, runtimeOffline: process.env.PI_OFFLINE,
    networkInterfaces: Object.keys(networkInterfaces()), callRecords }, null, 2));
} finally {
  unsubscribe();
  await wrapper.shutdown();
  localRegistry.clear();
}
assert.equal(wrapper.isAlive(), false);
assert.equal(git(tree, "status", "--short"), "");
