import { scratch } from "./subagent-gate-support.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";
import { createJiti } from "jiti";
import { ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

process.env.PI_WEB_IDLE_TIMEOUT_MS = "0";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("../", import.meta.url)) } });
const { startRpcSession, getRpcSession } = await jiti.import("./rpc-manager.ts");
const { cacheSessionPath } = await jiti.import("./session-reader.ts");
const { createSubagentSessionServices } = await jiti.import("./subagent-session-services.ts");
const { readCapturedProviderSources, authorizeProviderSourceRefs } = await jiti.import("./subagent-provider-sources.ts");
const { SUBAGENT_META_TYPE } = await jiti.import("./subagents.ts");
const { POST } = await jiti.import("../app/api/agent/[id]/route.ts");
const { PendingAskStore } = await jiti.import("./ask-user/store.ts");
const { persistOpenAsk, readPersistedAsk } = await jiti.import("./ask-user/persist.ts");
const cwd = join(scratch, "review-b-project");
const agentDir = process.env.PI_CODING_AGENT_DIR;
// Intentionally OUTSIDE agentDir, just like the actual browser's absolute enabled file.
const declaredRoot = join(scratch, "global-configured-extension");
mkdirSync(cwd, { recursive: true });
mkdirSync(declaredRoot, { recursive: true });
const providerFile = join(declaredRoot, "provider.mjs");
const searchFile = join(declaredRoot, "search.mjs");
const providerCode = `import { fauxProvider, fauxAssistantMessage, fauxText } from ${JSON.stringify(import.meta.resolve("@earendil-works/pi-ai"))};
export default function(pi) {
 const state = globalThis.__reviewB ??= { factories:0, starts:0, hooks:0, searches:0, providers:[] };
 state.factories++;
 const faux = fauxProvider({provider:'review-b',models:[{id:'gpt'},{id:'winner'},{id:'family:high'},{id:'nested/gpt'}]});
 faux.setResponses(Array.from({length:20},()=>fauxAssistantMessage(fauxText('LOCAL REVIEW B'))));
 state.providers.push(faux);
 pi.registerProvider(faux.provider);
 pi.registerTool({name:'allowed_ext',label:'ext',description:'ext',parameters:{type:'object',properties:{}},execute:async()=>({content:[]})});
 pi.registerTool({name:'inactive_ext',label:'inactive',description:'inactive',defaultActive:false,parameters:{type:'object',properties:{}},execute:async()=>({content:[]})});
 pi.on('session_start',()=>{state.starts++;});
 pi.on('before_provider_request',()=>{state.hooks++;});
}`;
writeFileSync(providerFile, providerCode);
writeFileSync(searchFile, `export default function(pi) { globalThis.__reviewBSearchFactories=(globalThis.__reviewBSearchFactories??0)+1; pi.on('session_start',()=>pi.registerTool({name:'web_search',label:'search',description:'search',parameters:{type:'object',properties:{}},execute:async()=>{globalThis.__reviewB.searches++;return {content:[]}}})); }`);
const settingsFile = join(agentDir, "settings.json");
function settings(extra = {}) { writeFileSync(settingsFile, JSON.stringify({ extensions: [providerFile, searchFile], enabledModels: ["review-b/**"], ...extra })); }
settings();
const resources = { version:1, appendSystemPrompt:[], tools:["read","grep","find","ls"], loadSkills:false, loadExtensions:true,
 toolPolicy:{version:1,builtinTools:["read","grep","find","ls"],extensionAllow:["ext:*"],extensionDeny:[]} };
function child(snapshot = resources, modelId = "gpt", loadout) {
 const manager = SessionManager.create(cwd, join(scratch, "review-b-sessions"));
 manager.appendCustomEntry(SUBAGENT_META_TYPE, {version:1,parentSessionId:"absent",parentSessionPath:"fixture-only",parentToolCallId:"fixture",profile:"explore",description:"review b",task:"local only",runInBackground:false,createdAt:new Date().toISOString(),resourceSnapshot:snapshot});
 manager.appendModelChange("review-b", modelId);
 manager.appendThinkingLevelChange("off");
 if (loadout !== undefined) manager.appendMessage({role:"system",content:"fixture native loadout",toolsAdded:loadout.map(name=>({name,description:name,parameters:{type:"object",properties:{}}})),timestamp:Date.now()});
 manager.appendMessage({role:"user",content:"history",timestamp:Date.now()});
 manager.appendMessage({...fauxAssistantMessage(fauxText("history")),provider:"review-b",model:modelId,timestamp:Date.now()});
 cacheSessionPath(manager.getSessionId(), manager.getSessionFile());
 return manager;
}
async function reopen(manager, options) { return (await startRpcSession(manager.getSessionId(), manager.getSessionFile(), undefined, options)).session; }
async function httpModel(manager, modelId) {
 return POST(new Request("http://localhost/api/agent/fixture", {method:"POST",body:JSON.stringify({type:"set_model",provider:"review-b",modelId})}), {params:Promise.resolve({id:manager.getSessionId()})});
}
function models(manager) { return SessionManager.open(manager.getSessionFile()).getBranch().filter(e=>e.type==="model_change").map(e=>e.modelId); }
function calls() { return globalThis.__reviewB?.providers.reduce((n,p)=>n+p.state.callCount,0) ?? 0; }
const originalCheckAuth = ModelRuntime.prototype.checkAuth;
afterEach(async () => {
 ModelRuntime.prototype.checkAuth = originalCheckAuth;
 await Promise.all([...globalThis.__piSessions?.values() ?? []].map(wrapper=>wrapper.shutdown()));
 settings();
});

test("DEFAULT inherited absolute configured file admits without refs, and ignores legacy true-snapshot leads", async () => {
 const inherited = await createSubagentSessionServices({cwd,agentDir});
 const refs = readCapturedProviderSources(inherited.resourceLoader.getExtensions(), "review-b");
 assert.ok(refs);
 for (const snapshot of [resources, {...resources,providerSources:{version:1,refs:refs.refs.map(ref=>({...ref,source:"forged-old-lead",file:join(scratch,"missing.mjs")}))}}]) {
  const manager = child(snapshot);
  const wrapper = await reopen(manager);
  assert.equal(wrapper.inner.model.id,"gpt");
  assert.ok(wrapper.inner.getActiveToolNames().includes("web_search"));
  assert.ok(wrapper.inner.getActiveToolNames().includes("grep"));
  assert.ok(!wrapper.inner.getActiveToolNames().includes("inactive_ext"));
  const before = calls();
  await wrapper.send({type:"prompt",message:"LOCAL"}); await wrapper.inner.waitForIdle();
  assert.equal(calls(),before+1);
  await wrapper.shutdown();
 }
});

test("SDK false provider-only absolute configured file succeeds with zero session hooks/tools/search", async () => {
 const inherited = await createSubagentSessionServices({cwd,agentDir});
 const refs = readCapturedProviderSources(inherited.resourceLoader.getExtensions(),"review-b");
 const before = {starts:globalThis.__reviewB.starts,hooks:globalThis.__reviewB.hooks,searches:globalThis.__reviewB.searches,searchFactories:globalThis.__reviewBSearchFactories};
 const manager = child({...resources,loadExtensions:false,providerSources:refs,toolPolicy:{...resources.toolPolicy,extensionAllow:[]}});
 const wrapper = await reopen(manager);
 assert.deepEqual(wrapper.inner.resourceLoader.getExtensions().extensions,[]);
 assert.deepEqual(wrapper.inner.getAllTools().map(t=>t.name).sort(),["find","grep","ls","read"]);
 await wrapper.send({type:"prompt",message:"LOCAL FALSE"}); await wrapper.inner.waitForIdle();
 assert.deepEqual({starts:globalThis.__reviewB.starts,hooks:globalThis.__reviewB.hooks,searches:globalThis.__reviewB.searches,searchFactories:globalThis.__reviewBSearchFactories},before);
});

test("configured absolute source rejects forged/symlink-escape/swapped/missing/disabled/version leads before factory", async () => {
 const inherited = await createSubagentSessionServices({cwd,agentDir});
 const refs = readCapturedProviderSources(inherited.resourceLoader.getExtensions(),"review-b");
 const authorize = sources => authorizeProviderSourceRefs({refs:sources,providerId:"review-b",cwd,agentDir,settingsManager:inherited.settingsManager});
 const before = globalThis.__reviewB.factories;
 await authorize(refs);
 await assert.rejects(authorize({...refs,version:2}),e=>e.reason==="provider-source-invalid");
 const unconfigured = join(declaredRoot,"unconfigured.mjs"); writeFileSync(unconfigured,providerCode);
 await assert.rejects(authorize({...refs,refs:refs.refs.map(ref=>({...ref,file:unconfigured}))}),e=>e.reason==="provider-source-invalid");
 settings({extensions:[providerFile,`-${providerFile}`]}); await inherited.settingsManager.reload();
 await assert.rejects(authorize(refs),e=>e.reason==="provider-source-invalid");
 settings(); await inherited.settingsManager.reload();
 rmSync(providerFile);
 await assert.rejects(authorize(refs),e=>e.reason==="provider-source-invalid");
 const escaped = join(scratch,"escaped.mjs"); writeFileSync(escaped,providerCode); symlinkSync(escaped,providerFile);
 await assert.rejects(authorize(refs),e=>e.reason==="provider-source-invalid");
 await assert.rejects(authorize({...refs,refs:refs.refs.map(ref=>({...ref,file:escaped}))}),e=>e.reason==="provider-source-invalid");
 rmSync(providerFile); writeFileSync(providerFile,providerCode);
 assert.equal(globalThis.__reviewB.factories,before);
});

test("cold native coding pins, explicit empty pins and legacy hard permissions remain separate from licence", async () => {
 for (const pins of [["read"],[]]) {
  const wrapper = await reopen(child(resources,"gpt",pins));
  assert.deepEqual(wrapper.inner.getActiveToolNames().filter(n=>resources.tools.includes(n)),pins);
  assert.ok(wrapper.inner.getActiveToolNames().includes("allowed_ext"));
  assert.ok(!wrapper.inner.getActiveToolNames().includes("inactive_ext"));
  await wrapper.shutdown();
 }
 const {toolPolicy: _policy, ...legacy} = resources; void _policy;
 const wrapper = await reopen(child({...legacy,tools:["read"]}));
 assert.deepEqual(wrapper.inner.getAllTools().map(t=>t.name),["read"]);
 await wrapper.shutdown();
 const inherited = await createSubagentSessionServices({cwd,agentDir});
 const refs = readCapturedProviderSources(inherited.resourceLoader.getExtensions(),"review-b");
 const chat = await reopen(child({...resources,tools:[],loadExtensions:false,providerSources:refs,toolPolicy:{...resources.toolPolicy,builtinTools:[],extensionAllow:[]}},"gpt",[]));
 assert.equal(chat.isChatOnly(),true);
 assert.deepEqual(chat.inner.getActiveToolNames(),[]);
 assert.deepEqual(chat.inner.getAllTools(),[]);
});

test("cold constructor is not persistence; HTTP target commits exactly once with exact colon/nested ids", async () => {
 const manager = child(resources,"gone");
 const wrapper = await reopen(manager,{initialModel:{provider:"review-b",modelId:"family:high"}});
 assert.deepEqual(models(manager),["gone"]);
 await assert.rejects(wrapper.send({type:"prompt",message:"UNCOMMITTED"}),e=>e.reason==="selection-mismatch");
 await wrapper.shutdown();
 for (const id of ["family:high","nested/gpt"]) {
  const response = await httpModel(manager,id);
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  assert.equal(getRpcSession(manager.getSessionId()).inner.model.id,id);
  assert.deepEqual(models(manager),id==="family:high" ? ["gone",id] : ["gone","family:high",id]);
  await getRpcSession(manager.getSessionId()).shutdown();
 }
});

test("scope passes but SDK setModel auth fails: no published target/history/lock orphan; retry commits", async () => {
 const manager = child(); const before = calls(); let checked = 0; let authBoundary;
 const store = globalThis.__piAskUserStore ??= new PendingAskStore();
 const {ask} = store.open({sessionId:manager.getSessionId(),questions:[{id:"old",question:"Keep this ask?",options:[]}]});
 persistOpenAsk(manager.getSessionId(),ask);
 const historyBefore = readFileSync(manager.getSessionFile(),"utf8");
 const settingsBefore = readFileSync(settingsFile,"utf8");
 // Real scope/auth-config discovery still passes. Only SDK's standard setModel checkAuth fails.
 ModelRuntime.prototype.checkAuth = async function(id,options) {
  if(id==="review-b") {
   checked++;
   authBoundary = {configured:this.hasConfiguredAuth(id),known:Boolean(this.getModel(id,"winner")),published:getRpcSession(manager.getSessionId()) !== undefined,lockHeld:globalThis.__piStartLocks.has(manager.getSessionId())};
   return false;
  }
  return originalCheckAuth.call(this,id,options);
 };
 const response = await httpModel(manager,"winner");
 assert.equal(response.status,409);
 assert.equal((await response.json()).modelSelection.reason,"auth-unavailable");
 assert.ok(checked>0,"SDK standard checkAuth was executed");
 assert.deepEqual(authBoundary,{configured:true,known:true,published:false,lockHeld:true},"scope passes; standard SDK switch is locked and unpublished");
 assert.equal(getRpcSession(manager.getSessionId()),undefined);
 assert.equal(globalThis.__piStartLocks?.has(manager.getSessionId()),false);
 assert.deepEqual(models(manager),["gpt"]);
 assert.equal(calls(),before);
 assert.deepEqual(store.pendingAsk(manager.getSessionId()),ask);
 assert.deepEqual(readPersistedAsk(manager.getSessionId()),ask);
 assert.equal(readFileSync(manager.getSessionFile(),"utf8"),historyBefore,"failed SDK checkAuth appended nothing");
 assert.equal(readFileSync(settingsFile,"utf8"),settingsBefore,"no global default write");
 ModelRuntime.prototype.checkAuth = originalCheckAuth;
 assert.equal((await httpModel(manager,"winner")).status,200);
 assert.deepEqual(models(manager),["gpt","winner"]);
 assert.deepEqual(getRpcSession(manager.getSessionId()).pendingAsk,ask);
});

test("failed cold intent cannot clean a competing successful winner and no concurrent valid intent is lost", async () => {
 const manager = child(); let enter; let release;
 const entered = new Promise(resolve=>{enter=resolve;});
 const gate = new Promise(resolve=>{release=resolve;});
 let first = true;
 ModelRuntime.prototype.checkAuth = async function(id,options) {
  if(id==="review-b" && first) { first=false; enter(); await gate; return false; }
  return originalCheckAuth.call(this,id,options);
 };
 const failing = httpModel(manager,"gpt"); await entered;
 const winning = httpModel(manager,"winner");
 release();
 const [failed,won] = await Promise.all([failing,winning]);
 assert.equal(failed.status,409); assert.equal(won.status,200,JSON.stringify(await won.clone().json()));
 const winner = getRpcSession(manager.getSessionId());
 assert.ok(winner.isAlive()); assert.equal(winner.inner.model.id,"winner");
 assert.deepEqual(models(manager),["gpt","winner"]);
 const [a,b] = await Promise.all([httpModel(manager,"gpt"),httpModel(manager,"nested/gpt")]);
 assert.equal(a.status,200); assert.equal(b.status,200);
 assert.equal(getRpcSession(manager.getSessionId()),winner);
 assert.deepEqual(models(manager),["gpt","winner","gpt","nested/gpt"]);
});

test("failed waiting intent leaves an already committed winner alive, without retry or duplicate record", async () => {
 const manager = child(); let enter; let release;
 const entered = new Promise(resolve=>{enter=resolve;}); const gate = new Promise(resolve=>{release=resolve;});
 let checks = 0;
 ModelRuntime.prototype.checkAuth = async function(id,options) {
  if(id==="review-b") { checks++; if(checks===1) {enter();await gate;} else return false; }
  return originalCheckAuth.call(this,id,options);
 };
 const winning = httpModel(manager,"winner"); await entered;
 const failing = httpModel(manager,"gpt"); release();
 const [won,failed] = await Promise.all([winning,failing]);
 assert.equal(won.status,200); assert.equal(failed.status,409);
 assert.equal(checks,2);
 assert.equal(getRpcSession(manager.getSessionId()).inner.model.id,"winner");
 assert.ok(getRpcSession(manager.getSessionId()).isAlive());
 assert.deepEqual(models(manager),["gpt","winner"]);
});
