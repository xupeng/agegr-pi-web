import { scratch } from "./subagent-gate-support.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";
import { createJiti } from "jiti";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

process.env.PI_WEB_IDLE_TIMEOUT_MS = "0";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } });
const { startRpcSession, getRpcSession } = await jiti.import("./rpc-manager.ts");
const { readCapturedProviderSources } = await jiti.import("./subagent-provider-sources.ts");
const { createSubagentSessionServices } = await jiti.import("./subagent-session-services.ts");
const { createSubagentController } = await jiti.import("./subagent-runtime.ts");
const { AgentSessionWrapper } = await jiti.import("./rpc-manager.ts");
const { SUBAGENT_META_TYPE, SUBAGENT_RESULT_TYPE } = await jiti.import("./subagents.ts");
const { cacheSessionPath } = await jiti.import("./session-reader.ts");
const { POST } = await jiti.import("../app/api/agent/[id]/route.ts");
const agentDir = process.env.PI_CODING_AGENT_DIR;
const cwd = join(scratch, "restore-project");
const extensions = join(agentDir, "extensions");
mkdirSync(cwd, { recursive: true });
mkdirSync(extensions, { recursive: true });
const providerFile = join(extensions, "gateway.js");
const searchFile = join(extensions, "search.js");
const providerCode = `import { fauxProvider, fauxAssistantMessage, fauxText } from ${JSON.stringify(import.meta.resolve("@earendil-works/pi-ai"))};
export default function(pi) {
  globalThis.__restoreFixtures ??= { loads: 0, lifecycle: 0, searches: 0, targets: [], kimis: [] };
  const s = globalThis.__restoreFixtures; s.loads++;
  const gpt = fauxProvider({ provider: 'restore-gateway', api: 'restore-gateway-faux', models: [{ id: 'gpt' }, { id: 'new-gpt' }] });
  gpt.setResponses(Array.from({ length: 20 }, () => fauxAssistantMessage(fauxText('GPT FIXTURE'))));
  const kimi = fauxProvider({ provider: 'restore-kimi', models: [{ id: 'kimi' }] });
  s.targets.push(gpt); s.kimis.push(kimi);
  pi.registerProvider(gpt.provider); pi.registerProvider(kimi.provider);
  pi.registerVirtualModel({provider:'restore-virtual', id:'chosen', name:'chosen', route:()=>({model:gpt.getModel('gpt'),thinkingLevel:'off'})});
  pi.registerTool({ name: 'host_only_tool', label: 'host', description: 'host', parameters: {type:'object',properties:{}}, execute:async()=>({content:[]}) });
  pi.registerTool({ name:'default_inactive', label:'inactive', description:'inactive', defaultActive:false, parameters:{type:'object',properties:{}}, execute:async()=>({content:[]}) });
  pi.registerTool({ name:'hidden_fixture', label:'hidden', description:'hidden', exposure:'hidden', parameters:{type:'object',properties:{}}, execute:async()=>({content:[]}) });
  pi.on('session_start', () => { s.lifecycle++; });
  pi.on('turn_start', () => { if(globalThis.__restoreCloseTool) { pi.setActiveTools(pi.getActiveTools().filter(n=>n!=='host_only_tool')); globalThis.__restoreCloseTool=false; } pi.registerTool({ name:'host_only_tool',label:'host',description:'host',parameters:{type:'object',properties:{}},execute:async()=>({content:[]}) }); });
}`;
writeFileSync(providerFile, providerCode);
writeFileSync(searchFile, `export default function(pi) { globalThis.__restoreSearchLoads = (globalThis.__restoreSearchLoads ?? 0) + 1; pi.on('session_start', () => { pi.registerTool({name:'web_search',label:'search',description:'local search',parameters:{type:'object',properties:{}},execute:async()=>{globalThis.__restoreFixtures.searches++;return {content:[{type:'text',text:'LOCAL SEARCH'}]}}}); }); }`);
const settingsFile = join(agentDir, "settings.json");
function settings(extra = {}) { writeFileSync(settingsFile, JSON.stringify({ defaultProvider: "restore-gateway", defaultModel: "gpt", enabledModels: ["restore-gateway/*"], ...extra })); }
settings();
const resources = { version: 1, appendSystemPrompt: [], tools: ["read"], loadSkills: false, loadExtensions: true,
  toolPolicy: { version: 1, builtinTools: ["read"], extensionAllow: ["ext:*"], extensionDeny: [] } };
function child(snapshot = resources, selected = { provider: "restore-gateway", modelId: "gpt" }, parentId = "absent") {
  const manager = SessionManager.create(cwd, join(scratch, "sessions"));
  manager.appendCustomEntry(SUBAGENT_META_TYPE, { version: 1, parentSessionId: parentId, parentSessionPath: "fixture-only", parentToolCallId: "tool", profile: "general-purpose", description: "fixture", task: "fixture", runInBackground: false, createdAt: new Date().toISOString(), resourceSnapshot: snapshot });
  manager.appendModelChange(selected.provider, selected.modelId);
  manager.appendThinkingLevelChange("off");
  manager.appendMessage({ role: "user", content: "history", timestamp: Date.now() });
  manager.appendMessage({ ...fauxAssistantMessage(fauxText("historical physical Kimi")), provider: "restore-kimi", model: "kimi", timestamp: Date.now() });
  manager.appendCustomEntry(SUBAGENT_RESULT_TYPE, { version: 1, status: "completed", completedAt: new Date().toISOString(), result: "previous result" });
  return manager;
}
async function reopen(manager, options) { return (await startRpcSession(manager.getSessionId(), manager.getSessionFile(), undefined, options)).session; }
async function prompt(wrapper) {
  await wrapper.send({ type: "prompt", message: "local fixture request" });
  await wrapper.inner.waitForIdle();
}
function counts() {
  return { target: globalThis.__restoreFixtures?.targets.reduce((sum, p) => sum + p.state.callCount, 0) ?? 0,
    kimi: globalThis.__restoreFixtures?.kimis.reduce((sum, p) => sum + p.state.callCount, 0) ?? 0 };
}
afterEach(async () => {
  await Promise.all([...globalThis.__piSessions?.values() ?? []].map((wrapper) => wrapper.shutdown()));
  settings();
  writeFileSync(providerFile, providerCode);
  assert.equal(counts().kimi, 0, "zero backup Kimi provider requests");
});

test("real RPC warm resume, idle reopen and browser startup restore latest explicit GPT after physical Kimi", async () => {
  const manager = child();
  const branch = manager.getLeafId();
  const warm = await reopen(manager);
  assert.equal(warm.inner.model.provider, "restore-gateway");
  assert.equal(warm.inner.model.id, "gpt");
  assert.ok(warm.inner.getActiveToolNames().includes("web_search"), "ready included session_start registration");
  await prompt(warm);
  await prompt(warm);
  await warm.shutdown(); // exactly the replacement path invoked by the idle timer
  const idle = await reopen(manager);
  assert.equal(idle.sessionId, manager.getSessionId());
  assert.equal(idle.inner.model.id, "gpt");
  await prompt(idle);
  await idle.shutdown();
  const browser = await reopen(manager);
  assert.equal((await browser.send({ type: "get_state" })).model.id, "gpt");
  assert.ok(branch && browser.inner.sessionManager.getEntry(branch));
  await prompt(browser);
});

test("fresh process cold restore and actual idle-timer reopen use GPT without parent or source snapshot", async () => {
  const manager = child();
  const script = `import {createJiti} from 'jiti'; const j=createJiti(import.meta.url); const {startRpcSession}=await j.import('./lib/rpc-manager.ts'); const {session:s}=await startRpcSession(${JSON.stringify(manager.getSessionId())},${JSON.stringify(manager.getSessionFile())},undefined); if(s.inner.model.id!=='gpt')throw Error('wrong model'); await s.send({type:'prompt',message:'cold'});await s.inner.waitForIdle();if(globalThis.__restoreFixtures.kimis.some(p=>p.state.callCount))throw Error('Kimi requested');console.log('COLD_GPT_OK'); const deadline=Date.now()+10000;while(s.isAlive()&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));if(s.isAlive())throw Error('idle timer did not close');const {session:idle}=await startRpcSession(s.sessionId,s.sessionFile,undefined);if(idle.inner.model.id!=='gpt')throw Error('idle wrong model');await idle.send({type:'prompt',message:'actual idle reopen'});await idle.inner.waitForIdle();if(globalThis.__restoreFixtures.kimis.some(p=>p.state.callCount))throw Error('idle Kimi request');console.log('IDLE_GPT_OK');await idle.shutdown();`;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: process.cwd(), env: { ...process.env, PI_WEB_IDLE_TIMEOUT_MS: "100" }, encoding: "utf8", timeout: 30000 });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  assert.match(run.stdout, /COLD_GPT_OK/);
  assert.match(run.stdout, /IDLE_GPT_OK/);
});

test("cold set_model prepares new target despite unavailable history, persists via SDK and concurrent intents all apply", async () => {
  const manager = child(resources, { provider: "gone-provider", modelId: "gone" });
  const before = manager.getBranch().filter((e) => e.type === "model_change").length;
  await assert.rejects(reopen(manager), (e) => e.reason === "provider-context-unavailable");
  assert.equal(getRpcSession(manager.getSessionId()), undefined);
  const wrapper = await reopen(manager, { initialModel: { provider: "restore-gateway", modelId: "new-gpt" } });
  assert.equal(wrapper.inner.sessionManager.getBranch().filter((e) => e.type === "model_change").length, before, "constructor is not persistence");
  const requestsBefore = counts().target;
  await assert.rejects(wrapper.send({ type: "prompt", message: "not yet persisted" }), (e) => e.reason === "selection-mismatch");
  assert.equal(counts().target, requestsBefore);
  await wrapper.send({ type: "set_model", provider: "restore-gateway", modelId: "new-gpt" });
  await prompt(wrapper);
  const recordCount = wrapper.inner.sessionManager.getBranch().filter((e) => e.type === "model_change").length;
  await assert.rejects(wrapper.send({ type: "set_model", provider: "restore-kimi", modelId: "kimi" }), (e) => e.reason === "outside-scope");
  assert.equal(wrapper.inner.sessionManager.getBranch().filter((e) => e.type === "model_change").length, recordCount);
  await Promise.all([wrapper.send({ type: "set_model", provider: "restore-gateway", modelId: "gpt" }), wrapper.send({ type: "set_model", provider: "restore-gateway", modelId: "new-gpt" })]);
  assert.deepEqual(wrapper.inner.sessionManager.getBranch().filter((e) => e.type === "model_change").slice(-2).map((e) => e.modelId), ["gpt", "new-gpt"]);
  await wrapper.shutdown();
  assert.equal((await reopen(manager)).inner.model.id, "new-gpt");
});

test("new controller child owns runtime, obeys explicit model, and warm Agent resume stays GPT", async () => {
  const parentManager = SessionManager.create(cwd, join(scratch, "parents"));
  parentManager.appendModelChange("restore-gateway", "gpt");
  parentManager.appendMessage({ role: "user", content: "parent", timestamp: Date.now() });
  parentManager.appendMessage({ ...fauxAssistantMessage(fauxText("parent")), provider: "restore-gateway", model: "gpt", timestamp: Date.now() });
  const parent = await reopen(parentManager);
  const sessions = new Map([[parent.sessionId, parent]]);
  const controller = createSubagentController({ getSession: (id) => sessions.get(id), isBuiltInSubagentsEnabled: () => true,
    registerSession: (inner, options) => { const wrapper = new AgentSessionWrapper(inner, { ...options, suppressCompletionNotifications: true }); wrapper.start(); wrapper.beginExtensionBinding(); sessions.set(inner.sessionId, wrapper); return wrapper; },
    reopenSession: async (id, file) => (await startRpcSession(id, file, undefined)).session,
    resolveSessionPath: async (id) => sessions.get(id)?.sessionFile ?? null, invalidateSessionList: () => {} });
  const execution = await controller.extensionRuntime.start({ profile: "general-purpose", task: "fixture", description: "fixture", model: "restore-gateway/new-gpt", parentToolCallId: "start", parentContext: { sessionManager: parentManager }, runInBackground: false });
  const result = await execution.completion;
  assert.equal(result.status, "completed", result.error);
  const wrapper = sessions.get(result.sessionId);
  assert.equal(wrapper.inner.model.id, "new-gpt");
  assert.notEqual(wrapper.inner.modelRuntime, parent.inner.modelRuntime);
  const resumed = await controller.extensionRuntime.resume({ sessionId: result.sessionId, task: "again", description: "resume", parentToolCallId: "resume", parentContext: { sessionManager: parentManager }, runInBackground: false });
  assert.equal((await resumed.completion).status, "completed");
  await wrapper.shutdown();
});

test("provider-only alive parent补全 and saved refs replay one necessary file, no search/lifecycle/tools", async () => {
  const parentManager = SessionManager.create(cwd, join(scratch, "parent-sources"));
  parentManager.appendModelChange("restore-gateway", "gpt");
  parentManager.appendMessage({ role: "user", content: "parent", timestamp: Date.now() });
  parentManager.appendMessage({ ...fauxAssistantMessage(fauxText("parent")), provider: "restore-gateway", model: "gpt", timestamp: Date.now() });
  const parent = await reopen(parentManager);
  const refs = readCapturedProviderSources(parent.inner.resourceLoader.getExtensions(), "restore-gateway");
  assert.ok(refs, "normal services captured successful native identity and final sourceInfo");
  const snapshot = { ...resources, loadExtensions: false, toolPolicy: { ...resources.toolPolicy, extensionAllow: [] } };
  const manager = child(snapshot, undefined, parent.sessionId);
  const loads = globalThis.__restoreFixtures.loads;
  const lifecycle = globalThis.__restoreFixtures.lifecycle;
  const searchLoads = globalThis.__restoreSearchLoads;
  const wrapper = await reopen(manager);
  assert.equal(globalThis.__restoreFixtures.loads, loads + 1);
  assert.equal(globalThis.__restoreFixtures.lifecycle, lifecycle);
  assert.equal(globalThis.__restoreSearchLoads, searchLoads);
  assert.deepEqual(wrapper.inner.getAllTools().map((t) => t.name), ["read"]);
  assert.ok(wrapper.inner.sessionManager.getBranch().some((e) => e.customType === "pi-web:subagent-provider-sources"));
  await prompt(wrapper);
  await wrapper.shutdown(); await parent.shutdown();
  await prompt(await reopen(manager));
  const orphan = child(snapshot);
  await assert.rejects(reopen(orphan), (e) => e.reason === "provider-context-unavailable");
});

test("saved source disabled, missing, forged, unknown version and swapped symlink refuse before any request", async () => {
  const inherited = await createSubagentSessionServices({ cwd, agentDir });
  const refs = readCapturedProviderSources(inherited.resourceLoader.getExtensions(), "restore-gateway");
  assert.ok(refs);
  const snapshot = { ...resources, loadExtensions: false, toolPolicy: { ...resources.toolPolicy, extensionAllow: [] }, providerSources: refs };
  const count = counts().target;
  settings({ extensions: ["-extensions/gateway.js"] });
  await assert.rejects(reopen(child(snapshot)), (e) => e.reason === "provider-source-invalid");
  settings();
  await assert.rejects(reopen(child({ ...snapshot, providerSources: { version: 2, refs: refs.refs } })), (e) => e.reason === "resource-policy-invalid");
  await assert.rejects(reopen(child({ ...snapshot, providerSources: { version: 1, refs: [{ ...refs.refs[0], file: searchFile }] } })), (e) => e.reason === "provider-replay-unsupported");
  rmSync(providerFile);
  await assert.rejects(reopen(child(snapshot)), (e) => e.reason === "provider-source-invalid");
  const outside = join(scratch, "outside.mjs"); writeFileSync(outside, providerCode); symlinkSync(outside, providerFile);
  await assert.rejects(reopen(child(snapshot)), (e) => e.reason === "provider-source-invalid");
  rmSync(providerFile);
  assert.equal(counts().target, count);
});

test("child wrapper reload withdraws extension-manually-off Map entries and does not activate new hidden/inactive tools", async () => {
  const wrapper = await reopen(child());
  globalThis.__restoreCloseTool = true;
  await prompt(wrapper);
  assert.ok(!wrapper.inner.getActiveToolNames().includes("host_only_tool"));
  await wrapper.send({ type: "reload" });
  assert.equal(wrapper.inner.getToolDefinition("host_only_tool"), undefined);
  assert.ok(wrapper.inner.resourceLoader.getExtensions().extensions.every((ext) => !ext.tools.has("host_only_tool")), "real Map withdraw blocks nested execution");
  assert.ok(!wrapper.inner.getActiveToolNames().includes("default_inactive"));
  assert.ok(!wrapper.inner.getActiveToolNames().includes("hidden_fixture"));
  await prompt(wrapper); // turn_start re-registers off tool again
  assert.equal(wrapper.inner.getToolDefinition("host_only_tool"), undefined);
});

test("legacy v1 exact tools and explicit false stay narrow; legal virtual choice survives physical response", async () => {
  const legacy = { ...resources }; delete legacy.toolPolicy;
  const wrapper = await reopen(child(legacy));
  assert.deepEqual(wrapper.inner.getAllTools().map((tool) => tool.name), ["read"]);
  await prompt(wrapper);
  await wrapper.shutdown();
  settings({ enabledModels: ["restore-gateway/*", "restore-virtual/*"] });
  const virtualManager = child(resources, {provider:"restore-virtual",modelId:"chosen"});
  const virtual = await reopen(virtualManager);
  await prompt(virtual);
  assert.equal(virtual.inner.model.provider, "restore-virtual");
  assert.equal(virtual.inner.sessionManager.getBranch().filter((e) => e.type === "model_change").at(-1).provider, "restore-virtual");
  await virtual.shutdown();
  assert.equal((await reopen(virtualManager)).inner.model.provider, "restore-virtual");
});

test("active branch latest explicit model, not abandoned branch or physical response, controls cold startup", async () => {
  const manager=child();
  const forkPoint=manager.getLeafId();
  manager.appendModelChange("restore-kimi","kimi");
  manager.appendMessage({...fauxAssistantMessage(fauxText("abandoned")),provider:"restore-kimi",model:"kimi",timestamp:Date.now()});
  manager.branch(forkPoint);
  manager.appendModelChange("restore-gateway","new-gpt");
  manager.appendMessage({...fauxAssistantMessage(fauxText("physical response")),provider:"restore-kimi",model:"kimi",timestamp:Date.now()});
  const leaf=manager.getLeafId();
  const wrapper=await reopen(manager);
  assert.equal(wrapper.inner.model.id,"new-gpt");
  assert.equal(wrapper.inner.sessionManager.getLeafId(),leaf,"startup preserves active branch leaf");
  await prompt(wrapper);
});

test("cold target intent survives single-flight competitor failure and each successful command persists", async () => {
  const manager=child(resources,{provider:"missing-old",modelId:"unavailable"});
  const [stale,target]=await Promise.allSettled([reopen(manager),reopen(manager,{initialModel:{provider:"restore-gateway",modelId:"gpt"}})]);
  assert.equal(stale.status,"rejected");
  assert.equal(target.status,"fulfilled",target.reason?.message);
  const wrapper=target.value;
  await wrapper.send({type:"set_model",provider:"restore-gateway",modelId:"gpt"});
  const [first,second]=await Promise.all([reopen(manager,{initialModel:{provider:"restore-gateway",modelId:"gpt"}}),reopen(manager,{initialModel:{provider:"restore-gateway",modelId:"new-gpt"}})]);
  assert.equal(first,second,"one winning wrapper");
  await Promise.all([first.send({type:"set_model",provider:"restore-gateway",modelId:"gpt"}),second.send({type:"set_model",provider:"restore-gateway",modelId:"new-gpt"})]);
  assert.deepEqual(wrapper.inner.sessionManager.getBranch().filter(e=>e.type==="model_change").slice(-2).map(e=>e.modelId),["gpt","new-gpt"]);
  await prompt(wrapper);
});

test("actual HTTP route returns typed 409 prompt refusal and permits cold standard set_model recovery", async () => {
  async function post(manager, body) {
    cacheSessionPath(manager.getSessionId(),manager.getSessionFile());
    return POST(new Request("http://127.0.0.1/api/agent/fixture",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),{params:Promise.resolve({id:manager.getSessionId()})});
  }
  const missing=child(resources,{provider:"no-provider",modelId:"no-model"});
  const before=counts().target;
  let response=await post(missing,{type:"prompt",message:"keep draft"});
  let body=await response.json();
  assert.equal(response.status,409);assert.equal(body.code,"prompt_rejected");assert.equal(body.accepted,false);
  assert.equal(body.modelSelection.reason,"provider-context-unavailable");
  assert.equal(counts().target,before);
  response=await post(missing,{type:"set_model",provider:"restore-gateway",modelId:"new-gpt"});
  assert.equal(response.status,200,JSON.stringify(await response.json()));
  const saved=SessionManager.open(missing.getSessionFile());
  assert.equal(saved.getBranch().filter(e=>e.type==="model_change").at(-1).modelId,"new-gpt");
  const disabled=child(resources,{provider:"restore-kimi",modelId:"kimi"});
  response=await post(disabled,{type:"prompt",message:"not authorized"});body=await response.json();
  assert.equal(response.status,409);assert.equal(body.modelSelection.reason,"outside-scope");assert.equal(body.accepted,false);
  const builtins=await createSubagentSessionServices({cwd,agentDir,resourceLoader:{loadExtensions:false}});
  const noAuthModel=builtins.modelRuntime.getModels("openai")[0];assert.ok(noAuthModel);
  const noAuth=child({...resources,loadExtensions:false,toolPolicy:{...resources.toolPolicy,extensionAllow:[]}},{provider:"openai",modelId:noAuthModel.id});
  settings({enabledModels:["openai/*"]});
  response=await post(noAuth,{type:"prompt",message:"no auth"});body=await response.json();
  assert.equal(response.status,409);assert.equal(body.modelSelection.reason,"auth-unavailable");assert.equal(body.accepted,false);
  settings();
  const unavailable=child(resources,{provider:"restore-gateway",modelId:"missing-explicit-model"});
  response=await post(unavailable,{type:"prompt",message:"unavailable"});body=await response.json();
  assert.equal(response.status,409);assert.equal(body.modelSelection.reason,"model-unavailable");assert.equal(body.accepted,false);
  const inherited=await createSubagentSessionServices({cwd,agentDir});
  const refs=readCapturedProviderSources(inherited.resourceLoader.getExtensions(),"restore-gateway");
  const badSource=child({...resources,loadExtensions:false,toolPolicy:{...resources.toolPolicy,extensionAllow:[]},providerSources:refs});
  const loads=globalThis.__restoreFixtures.loads;
  settings({extensions:["-extensions/gateway.js"]});
  response=await post(badSource,{type:"prompt",message:"source disabled"});body=await response.json();
  assert.equal(response.status,409);assert.equal(body.modelSelection.reason,"provider-source-invalid");assert.equal(body.accepted,false);
  assert.equal(globalThis.__restoreFixtures.loads,loads,"source refusal executes no provider file");
  assert.doesNotMatch(JSON.stringify(body),/baseUrl|apiKey|auth\.json|https:\/\/|token=/);
  settings();
  const malformed=child({...resources,toolPolicy:{version:99}});
  response=await post(malformed,{type:"prompt",message:"bad policy"});body=await response.json();
  assert.equal(response.status,409);assert.equal(body.modelSelection.reason,"resource-policy-invalid");assert.equal(body.accepted,false);
  assert.equal(counts().target,before,"HTTP refusals and model selection make no request");
});
