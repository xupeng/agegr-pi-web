import { network, scratch } from "./__fixtures__/subagent-native-search-hooks/isolation.mjs";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";
import { fauxProvider } from "@earendil-works/pi-ai";
import { createAgentSessionFromServices, SessionManager } from "@earendil-works/pi-coding-agent";

const jiti = createJiti(import.meta.url);
const { createSubagentSessionServices } = await jiti.import("./subagent-session-services.ts");
const { readCapturedProviderSources } = await jiti.import("./subagent-provider-sources.ts");
const {
  buildSubagentExcludeTools, initializeSubagentBuiltinTools,
  preserveSubagentManualOffTools, projectRegistrationAwareExtensionTools,
} = await jiti.import("./subagent-tool-policy.ts");
let sequence = 0, servers = 0, totalRequests = 0, totalKimi = 0;
const SIGNED_THINKING = { id: "rs_controlled", type: "reasoning", summary: [{ type: "summary_text", text: "controlled thinking" }], encrypted_content: "SIGNED-DUMMY-DO-NOT-EDIT" };
const SOURCE = { title: "Controlled citation", url: "https://native-hooks.invalid/source" };

async function backend() {
  const state = { requests: [], failNext: false, errors: [], frames: [], expectedPath: "/v1/responses" };
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, "POST");
      assert.equal(request.url, state.expectedPath);
      let bytes = "";
      for await (const chunk of request) bytes += chunk;
      const body = JSON.parse(bytes);
      assert.equal(body.stream, true);
      assert.equal(request.headers.authorization, "Bearer owned-dummy-native-hooks");
      state.requests.push(body); totalRequests += 1;
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      const send = (data) => {
        const event = { ...data, sequence_number: state.frames.length };
        state.frames.push(event);
        response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };
      const id = `resp_controlled_${state.requests.length}`;
      send({ type: "response.created", response: { id, status: "in_progress" } });
      send({ type: "response.output_item.added", output_index: 0, item: { id: SIGNED_THINKING.id, type: "reasoning", summary: [] } });
      send({ type: "response.reasoning_summary_text.delta", output_index: 0, delta: "controlled thinking" });
      send({ type: "response.output_item.done", output_index: 0, item: SIGNED_THINKING });
      // The SDK adapter does not turn web_search_call into a toolCall or citation text.
      // Even negative controls receive these frames: only a bound, eligible hook may attribute them.
      const search = { id: "ws_controlled", type: "web_search_call", status: "completed", action: { type: "search", query: "local fixture", sources: [SOURCE] } };
      send({ type: "response.output_item.added", output_index: 1, item: search });
      send({ type: "response.output_item.done", output_index: 1, item: search });
      const answer = { id: "msg_controlled", type: "message", role: "assistant", status: "completed", phase: "final_answer", content: [{ type: "output_text", text: "CONTROLLED ANSWER", annotations: [{ type: "url_citation", ...SOURCE, start_index: 0, end_index: 10 }] }] };
      send({ type: "response.output_item.added", output_index: 2, item: { ...answer, content: [] } });
      send({ type: "response.output_text.delta", output_index: 2, delta: "CONTROLLED ANSWER" });
      send({ type: "response.output_item.done", output_index: 2, item: answer });
      if (state.failNext) {
        state.failNext = false;
        send({ type: "response.failed", response: { id, status: "failed", error: { code: "fixture_failure", message: "controlled terminal failure" } } });
      } else {
        send({ type: "response.completed", response: { id, status: "completed", output: [SIGNED_THINKING, search, answer], usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 } } });
      }
      response.end();
    } catch (error) {
      state.errors.push(error.message);
      response.writeHead(500); response.end("controlled backend assertion failed");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening"); servers += 1;
  const origin = `http://127.0.0.1:${server.address().port}`;
  network.origins.add(origin);
  return { state, baseUrl: `${origin}/v1`, close: async () => {
    network.origins.delete(origin);
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    servers -= 1;
    assert.deepEqual(state.errors, []);
  } };
}

async function fixture(options = {}) {
  const http = await backend();
  const root = join(scratch, "home", `case-${++sequence}`);
  const agentDir = join(root, "agent"), cwd = join(root, "project");
  mkdirSync(join(agentDir, "extensions"), { recursive: true }); mkdirSync(cwd, { recursive: true });
  process.env.PI_CODING_AGENT_DIR = agentDir;
  const configPath = join(agentDir, "native-hooks.json");
  const config = {
    kind: "native", enabled: true, baseUrl: http.baseUrl, searchBaseUrl: http.baseUrl,
    dummyKey: "owned-dummy-native-hooks", ...options,
  };
  writeFileSync(configPath, JSON.stringify(config));
  for (const [name, file] of [["a-provider.js", "provider.mjs"], ["b-search.js", "search.mjs"]]) {
    let source = readFileSync(new URL(`./__fixtures__/subagent-native-search-hooks/${file}`, import.meta.url), "utf8");
    for (const specifier of ["@earendil-works/pi-ai", "@earendil-works/pi-ai/api/openai-responses"]) {
      source = source.replaceAll(JSON.stringify(specifier), JSON.stringify(import.meta.resolve(specifier)));
    }
    writeFileSync(join(agentDir, "extensions", name), source);
  }
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({
    defaultProvider: "kimi", defaultModel: "kimi-sentinel", retry: { enabled: false },
    providerRetry: { maxRetries: 0 }, compaction: { enabled: false }, cacheWarming: { mode: "off" },
  }));
  const policy = { extensionAllow: ["ext:*"], extensionDeny: options.deny ? ["ext:b-search/web_search"] : [] };
  const manualOffNames = new Set();
  const projectExtensions = (base) => projectRegistrationAwareExtensionTools(base, { policy, manualOffNames });
  let services, session, kimi;
  const extensionErrors = [];
  const observations = () => {
    try { return readFileSync(join(agentDir, "observed.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  };
  const open = async (targetServices) => {
    services = targetServices;
    kimi = fauxProvider({ provider: "kimi", models: [{ id: "kimi-sentinel" }] });
    services.modelRuntime.registerNativeProvider(kimi.provider);
    const model = services.modelRuntime.getModel("hooks-target", "gpt-hooks");
    assert.ok(model, "provider is factory-ready before binding");
    assert.ok((await services.modelRuntime.getAuth(model))?.auth.apiKey);
    const result = await createAgentSessionFromServices({ services, model,
      excludeTools: buildSubagentExcludeTools([]), sessionManager: SessionManager.inMemory(cwd), thinkingLevel: "low" });
    session = result.session;
    assert.equal(result.modelFallbackMessage, undefined);
    assert.equal(session.model.provider, "hooks-target");
    return result;
  };
  const close = async () => {
    try {
      if (kimi) { totalKimi += kimi.state.callCount; assert.equal(kimi.state.callCount, 0, "Kimi sentinel untouched"); }
      session?.dispose();
      assert.deepEqual(extensionErrors, [], "no swallowed extension hook errors");
    } finally { await http.close(); }
  };
  try {
    services = await createSubagentSessionServices({ cwd, agentDir, resourceLoader: { projectExtensions } });
    assert.deepEqual(services.diagnostics.filter((d) => d.type === "error"), []);
    return { http, cwd, agentDir, config, observations, projectExtensions,
      patchConfig: (patch) => { Object.assign(config, patch); writeFileSync(configPath, JSON.stringify(config)); },
      get services() { return services; }, get session() { return session; },
      open: async (target = services) => open(target), close,
      ready: async () => {
        await session.bindExtensions({ onError: (error) => extensionErrors.push(error) });
        initializeSubagentBuiltinTools(session, [], services.resourceLoader.getExtensions());
      },
      preserveOff: () => preserveSubagentManualOffTools(services.resourceLoader.getExtensions(), session.getActiveToolNames()),
    };
  } catch (error) { await close(); throw error; }
}

function lastAssistant(f) { return f.session.messages.filter((m) => m.role === "assistant").at(-1); }
function assertSigned(message) {
  const thinking = message.content.find((block) => block.type === "thinking");
  assert.equal(thinking.thinking, SIGNED_THINKING.summary[0].text);
  assert.equal(thinking.thinkingSignature, JSON.stringify(SIGNED_THINKING));
  const answer = message.content.find((block) => block.type === "text");
  assert.equal(answer.text, "CONTROLLED ANSWER");
  assert.equal(answer.textSignature, JSON.stringify({ v: 1, id: "msg_controlled", phase: "final_answer" }));
}
function assertNative(body, enabled) {
  assert.equal(body.model, "gpt-hooks");
  assert.equal(body.nativeSearch, enabled ? true : undefined);
  assert.equal(body.tools?.filter((tool) => tool.type === "web_search").length ?? 0, enabled ? 1 : 0);
  assert.ok(!body.tools?.some((tool) => tool.name === "web_search"), "no direct-search function declaration");
}

for (const kind of ["native", "legacy"]) {
  test(`${kind} factory-ready Responses: late ready, real payload/stream hooks and unsigned citation append`, async (t) => {
    const f = await fixture({ kind }); t.after(f.close);
    assert.equal(f.observations().filter((e) => e.type === "search_factory").length, 1);
    assert.equal(f.observations().filter((e) => e.type === "late_registered").length, 0);
    await f.open();
    assert.equal(f.session.getToolDefinition("web_search"), undefined, "no factory-time search tool");
    assert.equal(f.http.state.requests.length, 0, "zero requests before ready");
    await f.ready();
    assert.ok(f.session.getToolDefinition("web_search"), "session_start late registration survives live policy");
    assert.ok(!f.session.getActiveToolNames().includes("web_search"), "native route does not activate direct search");
    assert.equal(f.http.state.requests.length, 0, "ready alone sends zero requests");
    await f.session.prompt("search only the controlled fixture");
    assert.equal(f.http.state.requests.length, 1);
    assertNative(f.http.state.requests[0], true);
    const message = lastAssistant(f); assert.equal(message.stopReason, "stop"); assertSigned(message);
    const before = f.observations().find((e) => e.type === "assistant_hook").before;
    assert.deepEqual(message.content.slice(0, -1), before, "signed SDK blocks remain byte-for-byte unchanged");
    assert.deepEqual(message.content.at(-1), { type: "text", text: `\nSources (controlled hook):\n${SOURCE.title}: ${SOURCE.url}` });
    assert.ok(!JSON.stringify(before).includes(SOURCE.url), "citation text did not come from the adapter answer");
    const events = f.observations().filter((e) => e.type === "stream_hook");
    assert.deepEqual(events.map((e) => e.eventType), f.http.state.frames.map((e) => e.type));
    assert.ok(events.every((e) => e.provider === "hooks-target" && e.api === "openai-responses" && e.model === "gpt-hooks"));
    assert.equal(f.observations().filter((e) => e.type === "direct_execute").length, 0);
  });
}

test("SDK reload/model_select/turn_start clear stale pending and target switches cannot attribute old sources", async (t) => {
  const f = await fixture(); t.after(f.close); await f.open(); await f.ready();
  const seed = async () => f.session.prompt("/fixture-stale");
  await seed();
  await f.session.setModel(f.services.modelRuntime.getModel("hooks-target", "other-hooks"));
  assert.ok(f.observations().some((e) => e.type === "clear" && e.reason === "model_select" && e.hadPending));
  await f.session.prompt("alternate selected target");
  assert.equal(f.http.state.requests.at(-1).nativeSearch, undefined);
  assert.ok(f.observations().filter((e) => e.type === "stream_hook").every((e) => e.model === "other-hooks"));
  assert.equal(lastAssistant(f).content.length, 2);
  await f.session.setModel(f.services.modelRuntime.getModel("hooks-target", "gpt-hooks"));
  await seed(); await f.session.prompt("next real turn");
  assert.ok(f.observations().some((e) => e.type === "clear" && e.reason === "turn_start" && e.hadPending));
  assertNative(f.http.state.requests.at(-1), true); assertSigned(lastAssistant(f));
  await seed();
  const requestsBefore = f.http.state.requests.length;
  await f.session.reload();
  assert.ok(f.observations().some((e) => e.type === "clear" && e.reason === "session_shutdown" && e.hadPending));
  assert.equal(f.http.state.requests.length, requestsBefore, "reload itself sends zero requests");
  assert.equal(f.observations().filter((e) => e.type === "late_registered").length, 2);
  await f.session.prompt("post reload hook binding");
  assertNative(f.http.state.requests.at(-1), true); assertSigned(lastAssistant(f));
  assert.equal(lastAssistant(f).content.length, 3, "fresh collector appends exactly once");
});

for (const [label, config] of [
  ["hidden", { hidden: true }], ["defaultActive false", { defaultActive: false }],
  ["configuration off", { enabled: false }], ["explicit manual off", { manualOff: true }],
  ["registration-policy deny", { deny: true }], ["endpoint mismatch", { searchBaseUrl: "http://127.0.0.1:1/v1" }],
]) {
  test(`${label}: no automatic native enablement, no sources even with raw search frames`, async (t) => {
    const f = await fixture(config); t.after(f.close); await f.open(); await f.ready();
    if (config.manualOff) {
      // Reload the actual live registration after host-owned manual-off carry, not a fake activation flag.
      f.session.setActiveToolsByName([]); f.preserveOff(); await f.session.reload();
    }
    await f.session.prompt("negative native control");
    assertNative(f.http.state.requests.at(-1), false);
    const message = lastAssistant(f); assert.equal(message.stopReason, "stop"); assertSigned(message);
    assert.equal(message.content.length, 2);
    assert.ok(!JSON.stringify(message.content).includes(SOURCE.url));
    if (config.hidden || config.defaultActive === false || config.manualOff || config.deny) {
      assert.ok(!f.session.getActiveToolNames().includes("web_search"));
    }
  });
}

test("effective auth endpoint override is independently checked before native injection", async (t) => {
  const f = await fixture(); t.after(f.close);
  // Declared model/config endpoint matches, but resolved auth overrides the physical path.
  f.patchConfig({ authBaseUrl: f.http.baseUrl + "/auth" });
  f.http.state.expectedPath = "/v1/auth/responses";
  await f.services.resourceLoader.reload(); await f.open(); await f.ready();
  await f.session.prompt("endpoint refusal");
  assertNative(f.http.state.requests.at(-1), false); assert.equal(lastAssistant(f).content.length, 2);
});

test("terminal provider failure cannot append collected sources or carry them to the next real request", async (t) => {
  const f = await fixture(); t.after(f.close); await f.open(); await f.ready();
  f.http.state.failNext = true;
  await f.session.prompt("controlled failed response");
  assert.equal(lastAssistant(f).stopReason, "error");
  assert.equal(lastAssistant(f).content.length, 2);
  f.patchConfig({ enabled: false });
  await f.session.prompt("next request disabled");
  assertNative(f.http.state.requests.at(-1), false);
  assert.equal(lastAssistant(f).stopReason, "stop"); assert.equal(lastAssistant(f).content.length, 2);
});

for (const kind of ["native", "legacy"]) {
  test(`${kind} explicit false provider-only replay: no search/lifecycle/request hooks transferred`, async (t) => {
    const f = await fixture({ kind }); t.after(f.close);
    const sources = readCapturedProviderSources(f.services.resourceLoader.getExtensions(), "hooks-target");
    assert.equal(sources.refs.length, 1); assert.equal(sources.refs[0].kind, kind);
    const falseServices = await createSubagentSessionServices({ cwd: f.cwd, agentDir: f.agentDir,
      resourceLoader: { loadExtensions: false, projectExtensions: f.projectExtensions },
      providerOnly: { providerId: "hooks-target", sources } });
    assert.deepEqual(falseServices.resourceLoader.getExtensions().extensions, []);
    assert.equal(f.observations().filter((e) => e.type === "search_factory").length, 1, "only discovery loaded search; false host did not");
    const before = f.observations().length;
    await f.open(falseServices); await f.ready();
    await f.session.prompt("plain provider-only request");
    assertNative(f.http.state.requests.at(-1), false);
    const message = lastAssistant(f); assertSigned(message); assert.equal(message.content.length, 2);
    assert.deepEqual(f.observations().slice(before), [], "neither search nor co-located provider hooks/lifecycle ran");
    assert.equal(f.session.getToolDefinition("web_search"), undefined);
  });
}

after(() => {
  assert.equal(servers, 0); assert.equal(totalKimi, 0); assert.equal(network.blockedExternal, 0);
  assert.equal(network.loopbackRequests, totalRequests);
  console.log(JSON.stringify({ nativeSearchHooksEvidence: { tests: 13, localResponsesRequests: totalRequests,
    realModelRequests: 0, realSearchRequests: 0, blockedExternalAttempts: network.blockedExternal,
    kimiRequests: totalKimi, listeningServers: servers, serverPid: process.pid } }));
});
