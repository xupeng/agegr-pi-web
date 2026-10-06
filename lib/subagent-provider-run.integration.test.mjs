import { scratch } from "./subagent-gate-support.mjs";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const { projectRegistrationAwareExtensionTools } = await jiti.import("./subagent-tool-policy.ts");
const { createNoInstallResourceLoader } = await jiti.import("./subagent-resource-loader.ts");

const agentDir = process.env.PI_CODING_AGENT_DIR;
const cwd = join(scratch, "provider-run");
mkdirSync(cwd, { recursive: true });

/**
 * The execution gate: a real `AgentSession` bound to a local faux backend must run one target
 * turn after ready, reach a tool registered at `session_start`, return its fixture result to
 * the model, and never touch the fallback provider or the network.
 */
test("a bound session runs one target-provider turn through the delayed search tool", async () => {
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  const target = fauxProvider({ provider: "gate-target", models: [{ id: "gpt-gate" }] });
  const fallback = fauxProvider({ provider: "kimi", models: [{ id: "kimi-gate" }] });
  modelRuntime.registerNativeProvider(target.provider);
  modelRuntime.registerNativeProvider(fallback.provider);

  let searchExecutions = 0;
  const factory = (pi) => {
    pi.on("session_start", () => {
      pi.registerTool({
        name: "web_search",
        label: "web_search",
        description: "delayed search tool",
        parameters: { type: "object", properties: { query: { type: "string" } } },
        execute: async () => {
          searchExecutions += 1;
          return { content: [{ type: "text", text: "SEARCH-FIXTURE-RESULT" }] };
        },
      });
    });
  };
  const settingsManager = SettingsManager.inMemory({});
  const adapter = createNoInstallResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    explicitExtensions: [],
    extensionFactories: [{ name: "gate-run", factory }],
    projectExtensions: (base) => projectRegistrationAwareExtensionTools(base, {
      policy: { extensionAllow: ["ext:*"], extensionDeny: [] },
    }),
  });
  await adapter.resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    settingsManager,
    resourceLoader: adapter.resourceLoader,
    model: target.getModel("gpt-gate"),
    sessionManager: SessionManager.inMemory(cwd),
  });
  assert.equal(target.state.callCount, 0, "no provider request before the session is ready");

  await session.bindExtensions({});
  assert.ok(session.getActiveToolNames().includes("web_search"), "the session_start tool is bound to the session");
  assert.equal(target.state.callCount, 0, "binding alone makes no provider request");
  assert.equal(fallback.state.callCount, 0);

  let secondRequest;
  target.setResponses([
    fauxAssistantMessage(fauxToolCall("web_search", { query: "gate" })),
    (context) => {
      secondRequest = context;
      return fauxAssistantMessage(fauxText("search done"));
    },
  ]);
  await session.prompt("please search");

  assert.equal(searchExecutions, 1, "the model tool call reached the registered fixture tool");
  assert.equal(target.state.callCount, 2, "one tool turn and one follow-up request");
  const toolResults = secondRequest.messages.filter((message) => message.role === "toolResult");
  assert.ok(toolResults.length >= 1, "the tool result was sent back to the model");
  assert.ok(JSON.stringify(toolResults).includes("SEARCH-FIXTURE-RESULT"), "the fixture result is bound into the transcript");
  assert.equal(fallback.state.callCount, 0, "the fallback provider is never requested");
});
