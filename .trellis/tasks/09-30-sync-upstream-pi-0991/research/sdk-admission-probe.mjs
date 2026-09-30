import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

const root = await mkdtemp(join(tmpdir(), "pi-web-independent-admission-"));
process.env.PI_CODING_AGENT_DIR = root;
process.env.PI_OFFLINE = "1";
const originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("Network forbidden by independent probe"); };
let wrapper;
let session;
try {
  const { AgentSessionWrapper } = await createJiti(import.meta.url, {
    alias: { "@": process.cwd() }, moduleCache: false,
  }).import(join(process.cwd(), "lib/rpc-manager.ts"));
  const runtime = await ModelRuntime.create({
    authPath: join(root, "auth.json"), modelsPath: join(root, "models.json"),
    modelsStorePath: join(root, "models-store.json"), refreshOnCreate: false,
  });
  await runtime.setRuntimeApiKey("openai", "offline-test-key");
  const model = runtime.getModels("openai")[0];
  assert.ok(model);
  const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const inputs = [];
  const loader = new DefaultResourceLoader({
    cwd: root, agentDir: root, settingsManager: settings,
    noExtensions: true, noSkills: true, noThemes: true, noPromptTemplates: true, noContextFiles: true,
    extensionFactories: [(pi) => pi.on("input", (event) => {
      inputs.push(event);
      if (event.text === "consume") return { action: "handled" };
      if (event.text.startsWith("transform")) return { action: "transform", text: `changed:${event.text}` };
      return { action: "continue" };
    })],
  });
  await loader.reload();
  ({ session } = await createAgentSession({
    cwd: root, agentDir: root, settingsManager: settings, sessionManager: SessionManager.inMemory(root),
    resourceLoader: loader, modelRuntime: runtime, model, tools: [], thinkingLevel: "off",
  }));
  await session.bindExtensions({});
  let releaseStream;
  let holdNext = true;
  let streams = 0;
  const contexts = [];
  session.agent.streamFunction = (_model, context) => {
    streams += 1;
    contexts.push(context.messages.map((m) => ({ role: m.role, content: m.content })));
    const stream = createAssistantMessageEventStream();
    const finish = () => stream.push({ type: "done", reason: "stop", message: {
      role: "assistant", content: [{ type: "text", text: "offline response" }],
      api: model.api, provider: model.provider, model: model.id, stopReason: "stop", timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    } });
    if (holdNext) { holdNext = false; releaseStream = finish; }
    else queueMicrotask(finish);
    return stream;
  };
  const dispositions = [];
  await session.prompt("consume", { preflightResult: (d) => dispositions.push(d), source: "rpc" });
  assert.deepEqual(dispositions, ["handled"]);
  assert.equal(streams, 0);
  console.log("PASS: real SDK handled input has disposition handled and no agent run");

  const events = [];
  const notifications = [];
  wrapper = new AgentSessionWrapper(session, { onAgentRunComplete: (id) => notifications.push(id) });
  wrapper.start();
  wrapper.onEvent((event) => events.push(event));
  await wrapper.send({ type: "prompt", message: "first" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(wrapper.isRunning(), true);
  assert.equal(events.some((e) => e.type === "prompt_done"), false);
  assert.equal(notifications.length, 0);
  assert.equal(typeof releaseStream, "function");
  console.log("PASS: real started prompt acknowledges while provider stream remains pending");

  await assert.rejects(session.prompt("rejected", { preflightResult: (d) => dispositions.push(d) }), /already processing/);
  assert.deepEqual(dispositions, ["handled"]);
  console.log("PASS: real rejection does not invoke preflight callback");
  await wrapper.send({ type: "prompt", message: "transform follow", streamingBehavior: "followUp" });
  assert.deepEqual(session.getFollowUpMessages(), ["changed:transform follow"]);
  assert.equal(notifications.length, 0);
  assert.equal(await session.steer("consume"), "handled");
  assert.equal(await session.steer("transform steer"), "queued");
  assert.deepEqual(session.getSteeringMessages(), ["changed:transform steer"]);
  assert.equal(await session.followUp("consume"), "handled");
  assert.equal(await session.followUp("direct follow"), "queued");
  console.log("PASS: wrapper queues transformed follow-up; real steer/followUp return handled or queued");

  const persistedNotice = { customType: "probe.notice", content: "deferred notice", display: true };
  await session.sendCustomMessage(persistedNotice, { triggerTurn: false });
  assert.equal(session.messages.some((m) => m.customType === "probe.notice"), false);
  releaseStream();
  await session.waitForIdle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(wrapper.isRunning(), false);
  assert.equal(notifications.length, 1);
  assert.equal(events.filter((e) => e.type === "prompt_done").length, 1);
  assert.equal(session.pendingMessageCount, 0);
  assert.ok(session.messages.some((m) => m.customType === "probe.notice"));
  assert.ok(JSON.stringify(contexts).includes("changed:transform steer"));
  assert.ok(JSON.stringify(contexts).includes("changed:transform follow"));
  console.log("PASS: drain/settlement emits one completion notification and one prompt_done; pending custom notice persists");

  await wrapper.send({ type: "prompt", message: "idle follow", streamingBehavior: "followUp" });
  await session.waitForIdle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(notifications.length, 2);
  assert.equal(events.filter((e) => e.type === "prompt_done").length, 1);
  assert.equal(wrapper.isRunning(), false);
  console.log("PASS: streamingBehavior prompt reaching idle starts and settles a new run without a stranded queue");

  const ask = await wrapper.openAsk({ sessionId: session.sessionId, questions: [{ id: "q", question: "Choose", options: [] }] });
  holdNext = true;
  const answer = await wrapper.send({ type: "ask_submit", askId: ask.ask.askId, answers: [{ id: "q", values: [], otherText: "answer" }] });
  assert.equal(answer.result, "closed");
  assert.equal(wrapper.pendingAsk, undefined);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(wrapper.isRunning(), true);
  releaseStream();
  await session.waitForIdle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(notifications.length, 3);
  console.log("PASS: ask answers close immediately and trigger an extension-injected SDK run, notifying once on idle");
  assert.ok(inputs.some((event) => event.source === "rpc"));
  console.log(`PASS: ${streams} simulated provider calls, zero network requests, no real credentials or settings`);
} finally {
  wrapper?.destroy();
  if (!wrapper) session?.dispose();
  globalThis.fetch = originalFetch;
  await rm(root, { recursive: true, force: true });
}
