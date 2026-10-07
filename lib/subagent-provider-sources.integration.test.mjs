import { scratch } from "./subagent-gate-support.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { createAgentSessionFromServices, ProjectTrustStore, SessionManager } from "@earendil-works/pi-coding-agent";
const jiti = createJiti(import.meta.url);
const { createSubagentSessionServices } = await jiti.import("./subagent-session-services.ts");
const { readCapturedProviderSources } = await jiti.import("./subagent-provider-sources.ts");
const { projectTrustReloadOptions } = await jiti.import("./project-trust.ts");
let fixtureId = 0;
const piAi = JSON.stringify(import.meta.resolve("@earendil-works/pi-ai"));
const native = (id = "source-native", model = "gpt") => `import { fauxProvider } from ${piAi}; export default function(pi) { globalThis.__sourceFactories=(globalThis.__sourceFactories??0)+1; pi.registerProvider(fauxProvider({provider:${JSON.stringify(id)},models:[{id:${JSON.stringify(model)}}]}).provider); }`;
const legacy = (model = "gpt") => `export default function(pi) { pi.registerProvider('source-legacy', {name:'legacy',baseUrl:'http://127.0.0.1:1/v1',apiKey:'fixture-key-only',api:'openai-completions', models:[{id:${JSON.stringify(model)},name:'fixture',input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},reasoning:false,contextWindow:4096,maxTokens:1024}]}); }`;
function setup(files, project = false) {
  const root = join(scratch, `source-case-${++fixtureId}`);
  const cwd = join(root, "project"), agentDir = join(root, "agent");
  const dir = project ? join(cwd, ".pi", "extensions") : join(agentDir, "extensions");
  mkdirSync(cwd, { recursive: true }); mkdirSync(dir, { recursive: true }); mkdirSync(agentDir, { recursive: true });
  const paths = Object.entries(files).map(([name, code]) => { const path = join(dir, name); writeFileSync(path, code); return path; });
  return { cwd, agentDir, paths };
}
async function services(fixture, extra = {}) {
  return createSubagentSessionServices({ cwd: fixture.cwd, agentDir: fixture.agentDir,
    resourceLoaderReloadOptions: projectTrustReloadOptions(fixture.cwd, fixture.agentDir), ...extra });
}
async function replay(fixture, providerId, sources) {
  return services(fixture, { resourceLoader: { loadExtensions: false }, providerOnly: { providerId, sources } });
}

test("native override captures effective getter identity, not the first or failed last contributor", async () => {
  const fixture = setup({ "a.js": native("source-native", "first"), "b.js": native("source-native", "winner") });
  const loaded = await services(fixture);
  const refs = readCapturedProviderSources(loaded.resourceLoader.getExtensions(), "source-native");
  assert.equal(refs.refs[0].file, fixture.paths[1]);
  const child = await replay(fixture, "source-native", refs);
  assert.ok(child.modelRuntime.getModel("source-native", "winner"));
  assert.equal(child.modelRuntime.getModel("source-native", "first"), undefined);
  assert.deepEqual(child.resourceLoader.getExtensions().extensions, []);
  writeFileSync(join(fixture.agentDir, "extensions", "c.js"), "export default function(pi) { pi.registerProvider({id:'source-native'}); }");
  const broken = await services(fixture);
  assert.equal(readCapturedProviderSources(broken.resourceLoader.getExtensions(), "source-native"), undefined, "failed native registration cannot turn getter existence into confirmed provenance");
});

test("single-file legacy is replayable; legacy multiple contributions and virtual context-dependent sources have no lead", async () => {
  const fixture = setup({ "legacy.js": legacy() });
  const loaded = await services(fixture);
  const refs = readCapturedProviderSources(loaded.resourceLoader.getExtensions(), "source-legacy");
  assert.equal(refs.refs[0].kind, "legacy");
  assert.ok((await replay(fixture, "source-legacy", refs)).modelRuntime.getModel("source-legacy", "gpt"));
  loaded.modelRuntime.registerProvider("source-legacy", { baseUrl: "http://127.0.0.1:2/v1" });
  assert.equal(readCapturedProviderSources(loaded.resourceLoader.getExtensions(), "source-legacy"), undefined, "direct public runtime mutation changes stable final getter identity");
  const baseFixture = setup({ "legacy.js": legacy() });
  writeFileSync(join(baseFixture.agentDir, "models.json"), JSON.stringify({ providers: { "source-legacy": { baseUrl: "http://127.0.0.1:3/v1", apiKey: "fixture-base-only", api: "openai-completions", models: [{id:"base",name:"base",input:["text"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},reasoning:false,contextWindow:4096,maxTokens:1024}] } } }));
  const based = await services(baseFixture);
  assert.equal(readCapturedProviderSources(based.resourceLoader.getExtensions(), "source-legacy"), undefined, "models.json plus extension contributions cannot be attributed to one file");
  await assert.rejects(replay(baseFixture, "source-legacy", {version:1,refs:refs.refs.map((ref)=>({...ref,file:baseFixture.paths[0],cwd:baseFixture.cwd}))}), (e) => e.reason === "provider-replay-unsupported");
  // No real provider request: legacy backend port 1 is deliberately never contacted.
  const mergedFixture = setup({ "a.js": legacy("first"), "b.js": legacy("second") });
  const merged = await services(mergedFixture);
  assert.equal(readCapturedProviderSources(merged.resourceLoader.getExtensions(), "source-legacy"), undefined);
  await assert.rejects(replay(mergedFixture, "source-legacy"), (e) => e.reason === "provider-context-unavailable");
  const virtualFixture = setup({ "virtual.js": "export default function(pi) { pi.registerVirtualModel({provider:'source-virtual',id:'chosen',name:'chosen',route:()=>{throw Error('context required')}}); }" });
  const virtual = await services(virtualFixture);
  assert.ok(virtual.modelRuntime.getModel("source-virtual", "chosen"));
  assert.equal(readCapturedProviderSources(virtual.resourceLoader.getExtensions(), "source-virtual"), undefined);
  await assert.rejects(replay(virtualFixture, "source-virtual"), (e) => e.reason === "provider-context-unavailable");
});

test("reload binds provenance to a new generation and dynamic provider registration invalidates even same identity", async () => {
  const fixture = setup({ "native.js": native() });
  const loaded = await services(fixture);
  const old = loaded.resourceLoader.getExtensions();
  assert.ok(readCapturedProviderSources(old, "source-native"));
  await loaded.resourceLoader.reload();
  const fresh = loaded.resourceLoader.getExtensions();
  assert.notEqual(fresh, old);
  assert.equal(readCapturedProviderSources(old, "source-native"), undefined, "old native getter identity is no longer valid");
  assert.ok(readCapturedProviderSources(fresh, "source-native"));
  const { session } = await createAgentSessionFromServices({ services: loaded, model: loaded.modelRuntime.getModel("source-native", "gpt"), sessionManager: SessionManager.inMemory(fixture.cwd) });
  await session.bindExtensions({});
  const provider = loaded.modelRuntime.getRegisteredNativeProvider("source-native");
  fresh.runtime.registerNativeProvider(provider); // public dynamic callback installed by binding
  assert.equal(readCapturedProviderSources(fresh, "source-native"), undefined, "dynamic provenance is not guessed from a getter");
  session.dispose();
});

test("current project trust revocation and changed source identity reject before any provider factory is replayed", async () => {
  const fixture = setup({ "native.js": native() }, true);
  const trust = new ProjectTrustStore(fixture.agentDir);
  trust.set(fixture.cwd, true);
  const loaded = await services(fixture);
  const refs = readCapturedProviderSources(loaded.resourceLoader.getExtensions(), "source-native");
  assert.equal(refs.refs[0].scope, "project");
  await replay(fixture, "source-native", refs);
  const before = globalThis.__sourceFactories;
  trust.set(fixture.cwd, false);
  await assert.rejects(replay(fixture, "source-native", refs), (e) => e.reason === "provider-source-invalid");
  assert.equal(globalThis.__sourceFactories, before);
  trust.set(fixture.cwd, true);
  const forgedVersion = { version: 1, refs: [{ ...refs.refs[0], source: refs.refs[0].source + "@wrong-version" }] };
  await assert.rejects(replay(fixture, "source-native", forgedVersion), (e) => e.reason === "provider-source-invalid");
  assert.equal(globalThis.__sourceFactories, before);
});

test("linked package root canonical containment accepts valid provider and rejects swapped root or escaped file", async () => {
  const fixture = setup({});
  const installedRoot = join(scratch, `linked-package-${fixtureId}`);
  mkdirSync(join(installedRoot, "extensions"), {recursive:true});
  writeFileSync(join(installedRoot, "package.json"), JSON.stringify({ name:"source-linked-fixture",version:"1.0.0",pi:{extensions:["extensions/index.js"]} }));
  const realFile = join(installedRoot, "extensions", "index.js");
  writeFileSync(realFile, native());
  const linkedRoot = join(fixture.agentDir, "linked-provider");
  symlinkSync(installedRoot, linkedRoot, "dir");
  writeFileSync(join(fixture.agentDir, "settings.json"), JSON.stringify({packages:[linkedRoot]}));
  const loaded = await services(fixture);
  const refs = readCapturedProviderSources(loaded.resourceLoader.getExtensions(), "source-native");
  assert.equal(refs.refs[0].file, realFile);
  assert.ok((await replay(fixture,"source-native",refs)).modelRuntime.getModel("source-native","gpt"));
  const before = globalThis.__sourceFactories;
  const swappedRoot = join(scratch, `swapped-package-${fixtureId}`);
  mkdirSync(join(swappedRoot,"extensions"), {recursive:true});
  writeFileSync(join(swappedRoot,"package.json"),JSON.stringify({name:"source-linked-fixture",version:"1.0.0",pi:{extensions:["extensions/index.js"]}}));
  writeFileSync(join(swappedRoot,"extensions","index.js"),native());
  rmSync(linkedRoot);symlinkSync(swappedRoot,linkedRoot,"dir");
  await assert.rejects(replay(fixture,"source-native",refs),(e)=>e.reason==="provider-source-invalid");
  rmSync(linkedRoot);symlinkSync(installedRoot,linkedRoot,"dir");
  rmSync(realFile);const escaped=join(scratch,`escaped-provider-${fixtureId}.js`);writeFileSync(escaped,native());symlinkSync(escaped,realFile);
  const forged={version:1,refs:[{...refs.refs[0],file:escaped}]};
  await assert.rejects(replay(fixture,"source-native",forged),(e)=>e.reason==="provider-source-invalid");
  assert.equal(globalThis.__sourceFactories,before);
});

test("source metadata URLs are stored only as opaque identity, never credentials/config", async () => {
  const fixture=setup({"native.js":native()});
  const loaded=await services(fixture,{resourceLoader:{explicitExtensions:[{path:fixture.paths[0],metadata:{source:"git:https://user:fixture-secret@host.invalid/project.git",scope:"user",origin:"package",packageRoot:fixture.agentDir}}]}});
  const refs=readCapturedProviderSources(loaded.resourceLoader.getExtensions(),"source-native");
  assert.match(refs.refs[0].source,/^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(refs),/fixture-secret|https:|user:|host\.invalid/);
});

test("current installed npm version mismatch refuses saved source without installation or factory execution", async () => {
  const fixture=setup({});
  const root=join(fixture.agentDir,"npm","node_modules","pi-source-version-fixture");
  mkdirSync(join(root,"extensions"),{recursive:true});
  const manifest={name:"pi-source-version-fixture",version:"1.0.0",pi:{extensions:["extensions/index.js"]}};
  writeFileSync(join(root,"package.json"),JSON.stringify(manifest));
  writeFileSync(join(root,"extensions","index.js"),native());
  writeFileSync(join(fixture.agentDir,"settings.json"),JSON.stringify({packages:["npm:pi-source-version-fixture@1.0.0"]}));
  const loaded=await services(fixture);
  const refs=readCapturedProviderSources(loaded.resourceLoader.getExtensions(),"source-native");
  assert.ok(refs);
  const before=globalThis.__sourceFactories;
  writeFileSync(join(root,"package.json"),JSON.stringify({...manifest,version:"2.0.0"}));
  await assert.rejects(replay(fixture,"source-native",refs),(e)=>e.reason==="provider-source-invalid");
  assert.equal(globalThis.__sourceFactories,before);
});
