import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, getCurrentTools } from "@earendil-works/pi-ai";
import { createAgentSession, createCodemodeExtension, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { createAskUserToolDefinition } = await jiti.import("./portable/tool.ts");
const { PendingAskStore } = await jiti.import("./store.ts");

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-ask-codemode-"));
  const store = new PendingAskStore();
  const faux = fauxProvider({ models: [{ id: "ask-fixture" }] });
  const modelRuntime = await ModelRuntime.create({ authPath: join(dir, "auth.json"), modelsPath: null, refreshOnCreate: false });
  modelRuntime.registerNativeProvider(faux.provider);
  const settingsManager = SettingsManager.inMemory({ defaultTools: ["+codemode"], codemode: { mode: "only" } });
  const resourceLoader = new DefaultResourceLoader({
    cwd: dir, agentDir: dir, settingsManager,
    noExtensions: true, noSkills: true, noContextFiles: true, noThemes: true, noPromptTemplates: true,
    extensionFactories: [createCodemodeExtension({ models: false }), (pi) => {
      pi.registerTool(createAskUserToolDefinition({ open: async (input) => store.open(input) }));
    }],
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({ cwd: dir, agentDir: dir, modelRuntime, model: faux.getModel(), settingsManager, resourceLoader, sessionManager: SessionManager.inMemory(dir) });
  return { session, faux, store, dispose: async () => { session.dispose(); await rm(dir, { recursive: true, force: true }); } };
}

const questions = [{ id: "q", question: "Which scope?" }];

test("portable ask stays directly declared in Code mode only and terminates its model turn", async () => {
  const { session, faux, store, dispose } = await fixture();
  try {
    assert.equal(session.getAllTools().find((tool) => tool.name === "ask_user").exposure, "model-only");
    faux.setResponses([(context) => {
      assert.ok(getCurrentTools(context.messages).some((tool) => tool.name === "ask_user"));
      return fauxAssistantMessage([fauxToolCall("ask_user", { questions })]);
    }]);
    await session.prompt("Ask the required scope");
    assert.equal(faux.state.callCount, 1, "ask terminates without a follow-on model request");
    assert.ok(store.pendingAsk(session.sessionId));
    assert.equal(session.messages.find((message) => message.role === "toolResult").isError, false);
  } finally { await dispose(); }
});

test("a Code mode script cannot list or execute ask_user and never opens a persistent ask", async () => {
  const { session, faux, store, dispose } = await fixture();
  try {
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall("codemode", { code: `text(ALL_TOOLS.includes("ask_user")); await tools.ask_user(${JSON.stringify({ questions })})` })]),
      fauxAssistantMessage([fauxText("Nested ask is unavailable.")]),
    ]);
    await session.prompt("Try a nested ask");
    assert.equal(store.pendingAsk(session.sessionId), undefined);
    assert.equal(faux.state.callCount, 2, "failed script does not swallow model-turn termination");
    const result = session.messages.find((message) => message.role === "toolResult" && message.toolName === "codemode");
    assert.equal(result.isError, true);
    assert.match(result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n"), /false/);
  } finally { await dispose(); }
});
