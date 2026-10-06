import { scratch } from "./subagent-gate-support.mjs";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { Socket } from "node:net";
import { createJiti } from "jiti";
import { fauxProvider } from "@earendil-works/pi-ai";
import { ModelRuntime, SettingsManager, SessionManager, createAgentSessionFromServices } from "@earendil-works/pi-coding-agent";

// No backend is needed for this native faux contract. Deny all TCP, including accidental
// ambient/cloud auth access, and restore only this worker's exact public-method wrapper.
const connect = Socket.prototype.connect;
let tcpAttempts = 0;
Socket.prototype.connect = function () { tcpAttempts++; throw new Error("Auth-readiness test forbids TCP"); };
after(() => { Socket.prototype.connect = connect; assert.equal(tcpAttempts, 0); });

const jiti = createJiti(import.meta.url, { moduleCache: true });
const { createSubagentSessionServices } = await jiti.import("./subagent-session-services.ts");
const { resolveSubagentModelSelection, resolveExecutionModelScope, resolveConcreteModel } = await jiti.import("./subagent-model-selection.ts");
const { readCapturedProviderSources } = await jiti.import("./subagent-provider-sources.ts");
const fixtureFile = fileURLToPath(new URL("./__fixtures__/subagent-native-auth-readiness/provider.mjs", import.meta.url));
const reference = { provider: "gateway", modelId: "fixture-gpt" };
const defer = () => Promise.withResolvers();
const select = (runtime, settingsManager = SettingsManager.inMemory({ enabledModels: ["gateway/**"] })) =>
  resolveSubagentModelSelection({ modelRuntime: runtime, settingsManager, parentModel: reference });

function localProvider(resolve) {
  const faux = fauxProvider({ provider: reference.provider, models: [{ id: reference.modelId }] });
  const provider = { ...faux.provider, auth: { apiKey: { resolve } } };
  return { faux, provider };
}
async function runtime(name) {
  const agentDir = join(scratch, name, "agent");
  const cwd = join(scratch, name, "project");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(agentDir, "auth.json"), "{}");
  writeFileSync(join(agentDir, "models.json"), '{"providers":{}}');
  return { agentDir, cwd, modelRuntime: await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"), refreshOnCreate: false, allowModelNetwork: false }) };
}

// Real SDK, with only public refresh instrumentation and a native local async resolver.
// An older registration-triggered refresh starts its availability pass AFTER the
// explicitly awaited pass. The SDK intentionally discards the earlier pass's publication.
test("SDK public barrier proves awaited offline refresh may return before auth snapshot commits", async () => {
  const { modelRuntime, agentDir } = await runtime("raw-race");
  const context = new AsyncLocalStorage();
  const autoStart = defer();
  const explicitEntered = defer();
  const explicitRelease = defer();
  const autoEntered = defer();
  const autoRelease = defer();
  const passes = [];
  const { provider, faux } = localProvider(async () => {
    const pass = context.getStore();
    passes.push(pass);
    if (pass === "explicit") { explicitEntered.resolve(); await explicitRelease.promise; }
    if (pass === "registration") { autoEntered.resolve(); await autoRelease.promise; }
    return { auth: {}, source: "local keyless resolver" };
  });
  const refresh = modelRuntime.refresh.bind(modelRuntime);
  const pending = [];
  let calls = 0;
  modelRuntime.refresh = (options) => {
    assert.equal(options.allowNetwork, false);
    const pass = ++calls === 1 ? "registration" : "explicit";
    const task = context.run(pass, async () => {
      if (pass === "registration") await autoStart.promise;
      return refresh(options);
    });
    pending.push(task);
    return task;
  };
  try {
    modelRuntime.registerNativeProvider(provider);
    const explicit = modelRuntime.refresh({ allowNetwork: false });
    await explicitEntered.promise;
    autoStart.resolve();
    await autoEntered.promise;
    explicitRelease.resolve();
    await explicit;
    assert.ok(modelRuntime.getModel(reference.provider, reference.modelId));
    assert.equal(modelRuntime.hasConfiguredAuth(reference.provider), false, "explicit refresh was superseded, not missing credentials");
    assert.deepEqual(modelRuntime.getAvailableSnapshot().filter((m) => m.provider === reference.provider), []);
    assert.deepEqual((await modelRuntime.getAuth(modelRuntime.getModel(reference.provider, reference.modelId))).auth, { headers: undefined });
    await assert.rejects(select(modelRuntime), (error) => error.reason === "auth-unavailable");
    autoRelease.resolve();
    await Promise.all(pending);
    assert.equal(modelRuntime.hasConfiguredAuth(reference.provider), true);
    assert.equal((await select(modelRuntime)).model.id, reference.modelId);
    assert.ok(passes.includes("explicit") && passes.includes("registration"));
    assert.equal(faux.state.callCount, 0);
    assert.equal(readFileSync(join(agentDir, "auth.json"), "utf8"), "{}");
  } finally {
    autoStart.resolve(); explicitRelease.resolve(); autoRelease.resolve();
    await Promise.allSettled(pending);
  }
});

// Force the same *public* scheduling inversion through the actual child-services
// factory path. A queue must execute only one refresh at a time, irrespective of
// the async native auth resolver. No sleeps, dummy key, retry or private SDK field.
test("owned child services serialize registration and explicit offline refreshes", async () => {
  const { agentDir, cwd } = await runtime("owned-initial");
  const entered = defer();
  const release = defer();
  const { provider, faux } = localProvider(async () => {
    entered.resolve(); await release.promise;
    return { auth: {}, source: "local keyless resolver" };
  });
  const sentinel = fauxProvider({ provider: "openrouter", models: [{ id: "moonshotai/kimi-k2.6" }] });
  const original = ModelRuntime.prototype.refresh;
  let active = 0;
  let maximum = 0;
  const refreshes = [];
  ModelRuntime.prototype.refresh = async function (options) {
    assert.equal(options.allowNetwork, false);
    active++; maximum = Math.max(maximum, active);
    refreshes.push(options);
    try { return await original.call(this, options); }
    finally { active--; }
  };
  try {
    const building = createSubagentSessionServices({ cwd, agentDir, resourceLoader: { loadExtensions: true, explicitExtensions: [], extensionFactories: [(pi) => {
      pi.registerProvider(provider); pi.registerProvider(sentinel.provider);
    }] } });
    await entered.promise;
    release.resolve();
    const services = await building;
    assert.equal(maximum, 1, "SDK background registration refreshes must not overlap the awaited child readiness pass");
    assert.equal(refreshes.length, 3);
    assert.equal(services.modelRuntime.hasConfiguredAuth(reference.provider), true);
    const selection = await select(services.modelRuntime);
    assert.deepEqual(selection.reference, reference);
    assert.equal(selection.model, services.modelRuntime.getModel(reference.provider, reference.modelId));
    assert.equal(faux.state.callCount, 0);
    assert.equal(sentinel.state.callCount, 0);
  } finally { release.resolve(); ModelRuntime.prototype.refresh = original; }
});

async function fixtureServices(name, resolve = async () => ({ auth: {}, source: "keyless local" })) {
  const { cwd, agentDir, modelRuntime: parentRuntime } = await runtime(name);
  const { provider, faux } = localProvider(resolve);
  const sentinel = fauxProvider({ provider: "openrouter", models: [{ id: "moonshotai/kimi-k2.6" }] });
  const fixture = { provider, faux, sentinel, factories: 0, starts: 0, failBinding: false };
  globalThis.__subagentNativeAuthReadiness = fixture;
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ extensions: [fixtureFile], packages: [], enabledModels: ["gateway/**"] }));
  const services = await createSubagentSessionServices({ cwd, agentDir, resourceLoader: { loadExtensions: true } });
  return { services, fixture, parentRuntime };
}

async function request(services, selection) {
  const { session } = await createAgentSessionFromServices({ services, model: selection.model, noTools: true,
    sessionManager: SessionManager.inMemory(services.cwd) });
  try {
    await session.bindExtensions({});
    const ready = await select(services.modelRuntime);
    assert.equal(ready.model, session.model);
    await session.prompt("local auth-readiness completion");
    assert.equal(session.model.provider, reference.provider);
    assert.equal(session.model.id, reference.modelId);
  } finally { session.dispose(); }
}

test("fresh owned native keyless services loops keep exact parent reference, independent runtime and Kimi zero", async () => {
  try {
    for (let i = 0; i < 20; i++) {
      const { services, fixture, parentRuntime } = await fixtureServices(`loop-${i}`);
      const parentRefresh = parentRuntime.refresh;
      const parentModels = parentRuntime.getModels();
      assert.notEqual(services.modelRuntime, parentRuntime);
      const selection = await select(services.modelRuntime);
      assert.deepEqual(selection.reference, reference);
      assert.equal(selection.model, services.modelRuntime.getModel(reference.provider, reference.modelId));
      await request(services, selection);
      assert.equal(fixture.faux.state.callCount, 1);
      assert.equal(fixture.sentinel.state.callCount, 0);
      assert.equal(fixture.starts, 1);
      assert.equal(parentRuntime.refresh, parentRefresh);
      assert.deepEqual(parentRuntime.getModels(), parentModels);
      assert.equal(readFileSync(join(services.agentDir, "auth.json"), "utf8"), "{}");
    }
  } finally { delete globalThis.__subagentNativeAuthReadiness; }
});

test("already-bound gate drains native re-registration and simultaneous scope/catalog queries instead of stale auth", async () => {
  let authenticated = false;
  let blocker;
  let entered;
  const resolve = async () => {
    if (blocker) { entered.resolve(); await blocker.promise; }
    return authenticated ? { auth: {}, source: "keyless local" } : undefined;
  };
  let services;
  try {
    const loaded = await fixtureServices("revalidate", resolve);
    services = loaded.services;
    const { fixture } = loaded;
    await assert.rejects(select(services.modelRuntime), (error) => error.reason === "auth-unavailable");
    authenticated = true;
    blocker = defer(); entered = defer();
    services.modelRuntime.registerNativeProvider(fixture.provider);
    await entered.promise;
    assert.equal(services.modelRuntime.hasConfiguredAuth(reference.provider), false);
    const selectionPromise = select(services.modelRuntime);
    const scopePromise = resolveExecutionModelScope(services.modelRuntime, services.settingsManager);
    const availablePromise = services.modelRuntime.getAvailable();
    const concretePromise = resolveConcreteModel(services.modelRuntime, reference);
    blocker.resolve();
    const [selection, scope, available, concrete] = await Promise.all([selectionPromise, scopePromise, availablePromise, concretePromise]);
    assert.deepEqual(selection.reference, reference);
    assert.ok(scope.models.some((m) => m.provider === reference.provider && m.id === reference.modelId));
    assert.ok(available.some((m) => m.provider === reference.provider && m.id === reference.modelId));
    assert.equal(concrete.model.id, reference.modelId);
    blocker = undefined;
    await request(services, selection);
    assert.equal(fixture.faux.state.callCount, 1);
    assert.equal(fixture.sentinel.state.callCount, 0);
    authenticated = false;
    await services.modelRuntime.refresh({ allowNetwork: false });
    await assert.rejects(select(services.modelRuntime), (error) => error.reason === "auth-unavailable");
    assert.equal(fixture.faux.state.callCount, 1, "credential loss adds zero requests");
  } finally { blocker?.resolve(); delete globalThis.__subagentNativeAuthReadiness; }
});

test("public mutation during the final availability query cannot authorize a superseded model or clear failure", async () => {
  for (const mutation of ["filtered", "registration-failed"]) {
    let queries = 0;
    let armed = false;
    const entered = defer();
    const release = defer();
    const resolve = async () => {
      if (armed && ++queries >= 3) { entered.resolve(); await release.promise; }
      return { auth: {}, source: "keyless local" };
    };
    try {
      const { services, fixture } = await fixtureServices(`query-${mutation}`, resolve);
      armed = true;
      const selection = select(services.modelRuntime);
      // scope's global query performs two local auth checks; the final query is held here.
      await entered.promise;
      if (mutation === "filtered") {
        services.modelRuntime.registerNativeProvider({ ...fixture.provider, filterModels: () => [] });
      } else {
        assert.throws(() => services.modelRuntime.registerProvider(reference.provider, { models: [{ id: reference.modelId, name: "broken" }] }));
      }
      const proof = readCapturedProviderSources(services.resourceLoader.getExtensions(), reference.provider);
      if (mutation === "filtered") {
        assert.equal(proof, undefined, "a different native definition invalidates source proof");
      } else {
        // Failed legacy validation leaves the original native identity unchanged. Its source
        // lead may remain, but it must never override the sticky failure ledger below.
        assert.equal(proof?.refs[0]?.providerId, reference.provider);
      }
      armed = false;
      release.resolve();
      await assert.rejects(selection, (error) => error.reason === (mutation === "filtered" ? "model-unavailable" : "provider-context-unavailable"));
      assert.equal(fixture.faux.state.callCount, 0);
      assert.equal(fixture.sentinel.state.callCount, 0);
    } finally { release.resolve(); delete globalThis.__subagentNativeAuthReadiness; }
  }
});

test("same-id catalog change during final query cannot return stale scope, thinking pin or endpoint", async () => {
  const { cwd, agentDir } = await runtime("same-id-stale-scope");
  const entered = defer(), release = defer();
  let armed = false, queries = 0;
  const resolve = async () => {
    if (armed && ++queries >= 3) { entered.resolve(); await release.promise; }
    return { auth: {}, source: "local keyless resolver" };
  };
  const definition = (faux, baseUrl) => {
    const provider = { ...faux.provider, auth: { apiKey: { resolve } } };
    for (const method of ["getModels", "getAllModels"]) {
      const list = provider[method].bind(provider);
      provider[method] = (...args) => list(...args).map((model) => ({ ...model, baseUrl }));
    }
    return provider;
  };
  const original = fauxProvider({ provider: reference.provider, api: "stale-scope-faux",
    models: [{ id: reference.modelId, name: "allowed-route", reasoning: true }] });
  const replacement = fauxProvider({ provider: reference.provider, api: "stale-scope-faux",
    models: [{ id: reference.modelId, name: "excluded-route", reasoning: true },
      { id: "fixture-other", name: "allowed-route", reasoning: true }] });
  const settings = SettingsManager.inMemory({ enabledModels: ["allowed-route:high"] });
  const services = await createSubagentSessionServices({ cwd, agentDir, resourceLoader: {
    explicitExtensions: [], extensionFactories: [(pi) => pi.registerProvider(definition(original, "https://old.invalid/v1"))],
  } });
  assert.equal((await select(services.modelRuntime, settings)).thinkingLevel, "high");
  try {
    armed = true;
    const selection = select(services.modelRuntime, settings);
    await entered.promise;
    services.modelRuntime.registerNativeProvider(definition(replacement, "https://new.invalid/v1"));
    armed = false;
    release.resolve();
    await assert.rejects(selection, (error) => error.reason === "model-unavailable");
    assert.equal(services.modelRuntime.getModel(reference.provider, reference.modelId).baseUrl, "https://new.invalid/v1");
    assert.ok(services.modelRuntime.getAvailableSnapshot().some((model) => model.id === reference.modelId), "same-id target remains available");
    assert.deepEqual((await resolveExecutionModelScope(services.modelRuntime, settings)).models.map((model) => model.id), ["fixture-other"]);
    await assert.rejects(select(services.modelRuntime, settings), (error) => error.reason === "outside-scope");
    assert.equal(original.state.callCount, 0); assert.equal(replacement.state.callCount, 0);
  } finally { release.resolve(); }
});

test("live RPC admission refuses same-id endpoint drift instead of dispatching the session's stale model", async () => {
  const { AgentSessionWrapper } = await jiti.import("./rpc-manager.ts");
  let session;
  try {
    const { services, fixture } = await fixtureServices("live-model-drift");
    const selection = await select(services.modelRuntime);
    const manager = SessionManager.inMemory(services.cwd);
    const created = await createAgentSessionFromServices({ services, model: selection.model, noTools: true, sessionManager: manager });
    session = created.session;
    manager.appendCustomEntry("pi-web:subagent", {
      version: 1, parentSessionId: "parent", parentSessionPath: "/controlled-parent.jsonl",
      parentToolCallId: "controlled-call", profile: "explore", description: "controlled child",
      task: "controlled task", runInBackground: false, createdAt: "2026-10-06T00:00:00Z",
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: true,
        toolPolicy: { version: 1, builtinTools: [], extensionAllow: ["ext:*"], extensionDeny: [] } },
    });
    await session.bindExtensions({});
    const wrapper = new AgentSessionWrapper(session, { suppressCompletionNotifications: true });
    await wrapper.validateModelSelection();
    const updated = { ...fixture.provider };
    for (const method of ["getModels", "getAllModels"]) {
      const list = fixture.provider[method].bind(fixture.provider);
      updated[method] = (...args) => list(...args).map((model) => ({ ...model, baseUrl: "https://new.invalid/v1" }));
    }
    services.modelRuntime.registerNativeProvider(updated);
    await services.modelRuntime.refresh({ allowNetwork: false });
    const current = await select(services.modelRuntime);
    assert.equal(current.reference.modelId, session.model.id, "the explicit provider/id remains unchanged");
    assert.notEqual(current.model.baseUrl, session.model.baseUrl, "the session still holds the old public model data");
    await assert.rejects(wrapper.validateModelSelection(), (error) => error.reason === "selection-mismatch");
    assert.equal(fixture.faux.state.callCount, 0); assert.equal(fixture.sentinel.state.callCount, 0);
    assert.deepEqual(session.messages, []); assert.equal(session.sessionFile, undefined);
  } finally { session?.dispose(); delete globalThis.__subagentNativeAuthReadiness; }
});

test("offline readiness never refreshes OAuth or logs in, even for expired isolated stored credentials", async () => {
  const { cwd, agentDir } = await runtime("oauth-offline");
  let oauthRefreshes = 0;
  let logins = 0;
  const { provider, faux } = localProvider(async () => undefined);
  const oauthProvider = { ...provider, auth: { oauth: {
    name: "isolated offline OAuth fixture",
    login: async () => { logins++; throw new Error("Offline gate must not log in"); },
    refresh: async () => { oauthRefreshes++; throw new Error("Offline gate must not refresh OAuth"); },
    toAuth: async () => { throw new Error("Offline gate must use configuration check, not request auth"); },
  } } };
  writeFileSync(join(agentDir, "auth.json"), JSON.stringify({ gateway: { type: "oauth", access: "isolated-test-token", refresh: "isolated-test-token", expires: 0 } }));
  const before = readFileSync(join(agentDir, "auth.json"), "utf8");
  const services = await createSubagentSessionServices({ cwd, agentDir, resourceLoader: { loadExtensions: true, explicitExtensions: [], extensionFactories: [(pi) => pi.registerProvider(oauthProvider)] } });
  assert.deepEqual((await select(services.modelRuntime)).reference, reference);
  assert.equal(oauthRefreshes, 0);
  assert.equal(logins, 0);
  assert.equal(faux.state.callCount, 0);
  assert.equal(readFileSync(join(agentDir, "auth.json"), "utf8"), before);
});

test("scope remains strict for outside/zero-match/partial patterns with keyless native auth", async () => {
  try {
    const { services, fixture } = await fixtureServices("scope");
    await assert.rejects(select(services.modelRuntime, SettingsManager.inMemory({ enabledModels: ["openrouter/**"] })), (error) => error.reason === "outside-scope");
    await assert.rejects(select(services.modelRuntime, SettingsManager.inMemory({ enabledModels: ["retired/**"] })), (error) => error.reason === "scope-unresolved");
    for (const enabledModels of [[], ["gateway/**", "retired/**"], ["gateway/fixture-gpt:high"]]) {
      const selected = await select(services.modelRuntime, SettingsManager.inMemory({ enabledModels }));
      assert.deepEqual(selected.reference, reference);
      if (enabledModels[0]?.endsWith(":high")) assert.equal(selected.thinkingLevel, "high");
    }
    assert.equal(fixture.faux.state.callCount, 0);
    assert.equal(fixture.sentinel.state.callCount, 0);
  } finally { delete globalThis.__subagentNativeAuthReadiness; }
});

test("real missing native auth remains typed refusal with no session_start or requests", async () => {
  try {
    const { services, fixture } = await fixtureServices("missing", async () => undefined);
    await assert.rejects(select(services.modelRuntime), (error) => error.reason === "auth-unavailable");
    assert.equal(fixture.factories, 1);
    assert.equal(fixture.starts, 0);
    assert.equal(fixture.faux.state.callCount, 0);
    assert.equal(fixture.sentinel.state.callCount, 0);
  } finally { delete globalThis.__subagentNativeAuthReadiness; }
});

test("binding registration failure cannot borrow the now-ready old native catalog; only a new generation clears it", async () => {
  let session;
  try {
    const { services, fixture } = await fixtureServices("binding-failure");
    const selected = await select(services.modelRuntime);
    fixture.failBinding = true;
    ({ session } = await createAgentSessionFromServices({ services, model: selected.model, noTools: true, sessionManager: SessionManager.inMemory(services.cwd) }));
    await session.bindExtensions({});
    assert.ok(services.modelRuntime.getModel(reference.provider, reference.modelId));
    await assert.rejects(select(services.modelRuntime), (error) => error.reason === "provider-context-unavailable");
    // A successful public mutation in the same generation must not erase failure/provenance.
    services.modelRuntime.registerNativeProvider(fixture.provider);
    await services.modelRuntime.refresh({ allowNetwork: false });
    await assert.rejects(select(services.modelRuntime), (error) => error.reason === "provider-context-unavailable");
    assert.equal(readCapturedProviderSources(services.resourceLoader.getExtensions(), reference.provider), undefined, "dynamic mutation invalidates source proof");
    fixture.failBinding = false;
    await services.resourceLoader.reload();
    assert.deepEqual((await select(services.modelRuntime)).reference, reference);
    assert.equal(fixture.faux.state.callCount, 0);
    assert.equal(fixture.sentinel.state.callCount, 0);
  } finally { session?.dispose(); delete globalThis.__subagentNativeAuthReadiness; }
});

test("false provider-only replay has offline auth readiness without lifecycle/tool widening or parent mutation", async () => {
  try {
    const { services: inherited, fixture } = await fixtureServices("false-host");
    const sources = readCapturedProviderSources(inherited.resourceLoader.getExtensions(), reference.provider);
    assert.ok(sources);
    const parentIds = inherited.modelRuntime.getRegisteredProviderIds();
    const refresh = inherited.modelRuntime.refresh;
    const child = await createSubagentSessionServices({ cwd: inherited.cwd, agentDir: inherited.agentDir,
      resourceLoader: { loadExtensions: false }, providerOnly: { providerId: reference.provider, sources } });
    const selected = await select(child.modelRuntime);
    assert.deepEqual(selected.reference, reference);
    assert.notEqual(child.modelRuntime, inherited.modelRuntime);
    assert.equal(child.resourceLoader.getExtensions().extensions.length, 0);
    assert.equal(fixture.starts, 0, "host does not bind a hidden session");
    await request(child, selected);
    assert.equal(fixture.starts, 0, "provider host lifecycle never handed to false child");
    assert.equal(fixture.faux.state.callCount, 1);
    assert.equal(fixture.sentinel.state.callCount, 0);
    assert.deepEqual(inherited.modelRuntime.getRegisteredProviderIds(), parentIds);
    assert.equal(inherited.modelRuntime.refresh, refresh);
  } finally { delete globalThis.__subagentNativeAuthReadiness; }
});
