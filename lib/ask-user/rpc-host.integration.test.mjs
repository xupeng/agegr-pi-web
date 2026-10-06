import { scratch, copyProtocolPackage } from "./test-support.mjs";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createJiti } from "jiti";

const agentDir = process.env.PI_CODING_AGENT_DIR;
const project = join(scratch, "rpc-project");
mkdirSync(project);
mkdirSync(join(agentDir, "extensions"));
cpSync(new URL("../../e2e/fixtures/ask-user-faux-provider.ts", import.meta.url), join(agentDir, "extensions/faux.ts"));
const pkg = copyProtocolPackage();
writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: [pkg], defaultProvider: "ask-host-faux", defaultModel: "ask-host",
  extensions: ["-builtin:mcp", "-builtin:codemode", "-builtin:tool-search"],
  compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off" }));
writeFileSync(join(agentDir, "pi-web-settings.json"), '{"askUser":false}');
process.env.PI_WEB_ASK_USER = "0";
process.env.PI_WEB_DISABLE_MCP = "1";
process.env.PI_WEB_IDLE_TIMEOUT_MS = "0";
process.env.ASK_USER_HOST_CALL_LOG = join(scratch, "rpc-faux-calls.jsonl");
const jiti = createJiti(import.meta.url, { tsconfigPaths: true, moduleCache: false });
const { startRpcSession, getRpcSession } = await jiti.import("../rpc-manager.ts");
async function until(fn) {
  const end = Date.now() + 10000;
  while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(10); }
  throw new Error("RPC fixture timed out");
}
const calls = () => readFileSync(process.env.ASK_USER_HOST_CALL_LOG, "utf8").trim().split("\n").length;

test("actual RPC startup discovers a single system peer; posts/persists once and submits/cancels on the same session", async () => {
  const { session: wrapper, realSessionId: id } = await startRpcSession("__rpc_host_test__", "", project,
    { initialModel: { provider: "ask-host-faux", modelId: "ask-host" } });
  const events = [];
  wrapper.onEvent((event) => events.push(event));
  try {
    assert.equal(getRpcSession(id), wrapper);
    const tools = await wrapper.send({ type: "get_tools" });
    const askTools = tools.filter((tool) => tool.name === "ask_user");
    assert.equal(askTools.length, 1); assert.equal(askTools[0].exposure, "model-only");
    assert.equal(askTools[0].sourceInfo.source, pkg);
    await wrapper.send({ type: "prompt", message: "HOST ask now" });
    const pending = await until(() => wrapper.pendingAsk);
    await until(() => !wrapper.isRunning());
    assert.equal(calls(), 1, readFileSync(process.env.ASK_USER_HOST_CALL_LOG, "utf8"));
    assert.equal(events.filter((e) => e.type === "ask.opened").length, 1);
    const mirror = join(agentDir, "pi-web-open-asks.json");
    assert.equal(JSON.parse(readFileSync(mirror, "utf8")).asks[id].askId, pending.askId);
    // Stop/start the wrapper, exercising actual mirror hydration and the new loader identity.
    const file = wrapper.sessionFile;
    assert.ok(existsSync(file));
    await wrapper.shutdown();
    const { session: replacement } = await startRpcSession(id, file, project);
    try {
      assert.equal(replacement.pendingAsk.askId, pending.askId);
      const result = await replacement.send({ type: "ask_submit", askId: pending.askId,
        answers: [{ id: "scope", values: ["small"] }, { id: "regions", values: ["eu", "us"] }, { id: "custom", values: [], otherText: "HOST custom" }], supplement: "HOST supplement" });
      assert.equal(result.result, "closed"); assert.equal(result.outcome.unansweredIds.includes("skipped"), true);
      assert.equal(replacement.pendingAsk, undefined);
      await until(() => calls() === 2 && !replacement.isRunning());
      assert.equal(replacement.sessionId, id);
      assert.ok(!JSON.parse(readFileSync(mirror, "utf8")).asks[id]);
      await replacement.send({ type: "reload" });
      await replacement.send({ type: "prompt", message: "HOST ask again" });
      const next = await until(() => replacement.pendingAsk);
      await until(() => !replacement.isRunning());
      assert.notEqual(next.askId, pending.askId);
      const cancelled = await replacement.send({ type: "ask_cancel", askId: next.askId });
      assert.equal(cancelled.result, "closed"); assert.equal(cancelled.outcome.reason, "cancelled");
      await until(() => calls() === 4 && !replacement.isRunning());
      assert.equal(replacement.sessionId, id);
    } finally { await replacement.shutdown(); }
  } finally { await wrapper.shutdown(); }
});
