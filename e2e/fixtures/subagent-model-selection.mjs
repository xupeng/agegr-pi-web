// Test-only native provider, late search extension, and SDK-backed history fixtures.
// This module is also the isolated Next process network preloader (--import).
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { Socket } from "node:net";
import { join } from "node:path";
import { Agent } from "undici";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";

export const TARGET = { provider: "gateway", modelId: "fixture-gpt", name: "Fixture GPT" };
export const REPLACEMENT = { provider: "gateway", modelId: "fixture-replacement", name: "Fixture replacement" };
export const SEARCH_MARKER = "LOCAL-SEARCH-RESULT";
export const toolPolicy = {
  version: 1,
  builtinTools: ["read", "grep", "find", "ls"],
  extensionAllow: ["ext:*"],
  extensionDeny: [],
};

function record(kind, data = {}) {
  const path = process.env.SUBAGENT_MODEL_FIXTURE_LOG;
  if (path) appendFileSync(path, JSON.stringify({ kind, pid: process.pid, ...data }) + "\n");
}

function loopback(url) {
  const parsed = new URL(url);
  assert.ok(["http:", "https:"].includes(parsed.protocol));
  assert.ok(["127.0.0.1", "[::1]"].includes(parsed.hostname), `Non-loopback URL: ${url}`);
  return parsed;
}

// Next 16 dev HMR has no public offline/version-check switch. Isolate ONLY its
// exact npm metadata dispatch, identified by both URL and framework caller. Reject
// locally (Next handles this as staleness:unknown); do not fabricate a model,
// search, API or SSE response. Next replaces global fetch with its bundled
// polyfill, so isolate at the existing Undici Agent's public dispatch method.
// All other dispatches still hit the strict TCP guard.
if (process.env.SUBAGENT_MODEL_NEXT_DEV_OFFLINE === "1") {
  const dispatch = Agent.prototype.dispatch;
  Agent.prototype.dispatch = function (options, handler) {
    const url = new URL(options.path, String(options.origin)).href;
    const stack = new Error("dev-only update attempt").stack;
    if (url === "https://registry.npmjs.org/-/package/next/dist-tags"
      && stack.includes("next/dist/server/dev/hot-reloader-shared-utils.js")
      && stack.includes("getVersionInfo")) {
      record("dev-only-update-suppressed", { url, stack });
      throw new Error("Test-only Next HMR metadata check suppressed offline");
    }
    return dispatch.call(this, options, handler);
  };
}

// Fail before a non-loopback TCP connection is established, even if a regression
// selects a built-in provider instead of one of our faux sentinels. This is a test
// tripwire, not a product sandbox. No credentials/proxies enter the server env.
if (process.env.SUBAGENT_MODEL_NETWORK_GUARD === "1" && !Socket.prototype.__subagentModelGuard) {
  const connect = Socket.prototype.connect;
  Socket.prototype.connect = function (...args) {
    const normalized = Array.isArray(args[0]) ? args[0] : args;
    const first = normalized[0];
    const options = typeof first === "object" && first !== null ? first : {};
    const unix = options.path || (typeof first === "string" && !/^\d+$/.test(first));
    const host = options.host ?? (typeof normalized[1] === "string" ? normalized[1] : "127.0.0.1");
    if (!unix && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(host)) {
      record("blocked-network", { host: String(host), stack: new Error("network tripwire").stack });
      throw new Error(`Offline fixture blocked non-loopback TCP: ${host}`);
    }
    return connect.apply(this, args);
  };
  Object.defineProperty(Socket.prototype, "__subagentModelGuard", { value: true });
}

export default function subagentModelSelectionExtension(pi) {
  record("factory", { cwd: process.cwd() });
  const backend = loopback(process.env.SUBAGENT_MODEL_BACKEND).origin;
  const gateway = fauxProvider({
    provider: TARGET.provider,
    api: "subagent-model-faux",
    models: [
      { id: TARGET.modelId, name: TARGET.name },
      { id: REPLACEMENT.modelId, name: REPLACEMENT.name },
    ],
  });
  gateway.setResponses(Array.from({ length: 512 }, () => async (context, _options, _state, model) => {
    // Receive the actual session transcript, never canned SDK usage or a live gateway URL.
    record("model-request", { provider: model.provider, modelId: model.id });
    const response = await fetch(`${backend}/model`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: model.provider, modelId: model.id, context }),
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    const reply = await response.json();
    return reply.tool
      ? fauxAssistantMessage([fauxToolCall(reply.tool, reply.arguments)], { stopReason: "toolUse" })
      : fauxAssistantMessage([fauxText(reply.text)]);
  }));
  pi.registerProvider(gateway.provider); // Factory-ready native provider (not models.json).

  // Replace the real OpenRouter entry with a native faux sentinel, so even a
  // silent Kimi fallback records an attempted request and cannot spend money.
  const sentinel = fauxProvider({ provider: "openrouter", api: "subagent-model-sentinel",
    models: [{ id: "moonshotai/kimi-k2.6", name: "Kimi forbidden sentinel" }] });
  sentinel.setResponses(Array.from({ length: 64 }, () => () => {
    record("sentinel-request", { provider: "openrouter", modelId: "moonshotai/kimi-k2.6" });
    throw new Error("Forbidden OpenRouter/Kimi fixture request");
  }));
  pi.registerProvider(sentinel.provider);

  // Deliberately no factory-time web_search. A real awaited lifecycle must
  // finish before the session request can declare/call this tool.
  pi.on("session_start", async (_event, ctx) => {
    assert.equal(ctx.cwd, process.env.SUBAGENT_MODEL_PROJECT, "SDK services must use the isolated fixture project");
    record("session-start", { sessionId: ctx.sessionManager.getSessionId(), cwd: ctx.cwd, processCwd: process.cwd() });
    await new Promise((resolve) => setTimeout(resolve, 100));
    pi.registerTool({
      name: "web_search", label: "web_search", description: "Search the loopback fixture only",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      async execute(_callId, params) {
        const response = await fetch(`${backend}/search`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params), signal: AbortSignal.timeout(10000),
        });
        assert.equal(response.status, 200);
        const result = await response.json();
        record("search-executed", { marker: result.marker });
        return { content: [{ type: "text", text: result.marker }] };
      },
    });
    record("session-ready", { sessionId: ctx.sessionManager.getSessionId() });
  });
}

/** Only the test runner owns this backend. All destinations are literal loopback. */
export async function startBackend() {
  const calls = [];
  const searches = [];
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, "POST");
      let text = "";
      for await (const chunk of request) { text += chunk; assert.ok(text.length < 2_000_000); }
      const body = JSON.parse(text);
      let reply;
      if (request.url === "/search") {
        assert.equal(typeof body.query, "string");
        const marker = `${SEARCH_MARKER}:${body.query}`;
        searches.push({ ...body, marker });
        reply = { marker };
      } else {
        assert.equal(request.url, "/model");
        calls.push(body);
        const last = [...body.context.messages].reverse().find((message) => message.role !== "system");
        const input = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content);
        if (last?.role === "toolResult") {
          reply = { text: `FIXTURE-ANSWER:${body.modelId}:${input}` };
        } else if (input.includes("E2E_DELEGATE_NEW")) {
          reply = { tool: "Agent", arguments: { subagent_type: "explore", description: "E2E inherited child",
            prompt: "E2E_SEARCH:new", run_in_background: false } };
        } else if (/E2E_RESUME:([^:\s]+):([^\s"]+)/.test(input)) {
          const [, id, phase] = input.match(/E2E_RESUME:([^:\s]+):([^\s"]+)/);
          reply = { tool: "Agent", arguments: { resume: id, description: `E2E resume ${phase}`,
            prompt: `E2E_SEARCH:${phase}`, run_in_background: false } };
        } else {
          const match = input.match(/E2E_SEARCH:([a-z0-9-]+)/i);
          reply = match ? { tool: "web_search", arguments: { query: match[1] } }
            : { text: `FIXTURE-ANSWER:${body.modelId}:${input}` };
        }
      }
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(reply));
    } catch (error) {
      response.writeHead(500, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: String(error) }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { url: `http://127.0.0.1:${server.address().port}`, calls, searches,
    async close() { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}

/** SDK append APIs own ids/branches/format; fauxAssistantMessage owns complete usage. */
export function createHistoryFixtures(agentDir, project) {
  const dir = join(agentDir, "sessions", "subagent-model-selection");
  mkdirSync(dir, { recursive: true });
  const parent = SessionManager.create(project, dir);
  parent.appendModelChange(TARGET.provider, TARGET.modelId);
  parent.appendMessage({ role: "user", content: "E2E seed parent history", timestamp: Date.now() });
  parent.appendMessage(fauxAssistantMessage("E2E seed parent answer"));
  const fixtures = {};
  for (const [name, loadExtensions, modelId] of [
    ["unavailable", true, "retired-gpt"], ["legacyFalse", false, TARGET.modelId],
  ]) {
    const session = SessionManager.create(project, dir, { parentSession: parent.getSessionFile() });
    session.appendModelChange(TARGET.provider, modelId);
    session.appendCustomEntry("pi-web:subagent", {
      version: 1, parentSessionId: parent.getSessionId(), parentSessionPath: parent.getSessionFile(),
      parentToolCallId: `fixture-${name}`, profile: "explore", description: `E2E ${name} child`,
      task: `E2E ${name} history`, runInBackground: false, createdAt: new Date().toISOString(),
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: ["read"], loadSkills: false,
        loadExtensions, ...(loadExtensions ? { toolPolicy } : {}) },
    });
    session.appendMessage({ role: "user", content: `E2E ${name} history`, timestamp: Date.now() });
    // A physical Kimi response is history, NOT an explicit selected model.
    session.appendMessage({ ...fauxAssistantMessage(`E2E ${name} old answer`),
      provider: "openrouter", model: "moonshotai/kimi-k2.6" });
    session.appendCustomEntry("pi-web:subagent-result", { version: 1, status: "completed",
      completedAt: new Date().toISOString(), result: `E2E ${name} old answer` });
    fixtures[name] = { id: session.getSessionId(), path: session.getSessionFile(), leaf: session.getLeafId() };
  }
  writeFileSync(join(dir, "fixture-manifest.json"), JSON.stringify(fixtures, null, 2));
  return fixtures;
}
