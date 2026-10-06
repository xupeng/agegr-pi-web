import "./test-support.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { createAskUserExtension } = await jiti.import("./extension.ts");
const { ASK_USER_BRIDGE_CHANNEL } = await jiti.import("./protocol.ts");
const { PendingAskStore } = await jiti.import("./store.ts");
const questions = [{ id: "q", question: "Which scope?", options: [] }];

function host(getSession, identity = "web-session") {
  let listener;
  const extension = createAskUserExtension(getSession, () => identity);
  extension.factory({
    registerTool() { assert.fail("Web host must not register a tool"); },
    events: { on(channel, fn) { assert.equal(channel, ASK_USER_BRIDGE_CHANNEL); listener = fn; } },
  });
  let open;
  listener({ register(fn) { assert.equal(open, undefined); open = fn; } });
  assert.equal(typeof open, "function", "register must run synchronously");
  return (input = {}) => open({ version: 1, conversationId: identity, questions, ...input });
}

test("bridge-only host opens through the alive registry, not a captured wrapper", async () => {
  const store = new PendingAskStore();
  let current;
  const open = host(() => current);
  await assert.rejects(open, /no live session/);
  current = { sessionId: "web-session", isAlive: () => true, openAsk: async (input) => store.open(input) };
  const result = await open();
  assert.equal(result.ask.askId, store.pendingAsk("web-session").askId);
  current = { ...current, isAlive: () => false };
  await assert.rejects(open, /no live session/);
});

test("version, loader identity, wrapper identity and bounded questions fail closed", async () => {
  let opens = 0;
  let current = { sessionId: "web-session", isAlive: () => true, openAsk: async () => { opens++; } };
  const open = host(() => current);
  await assert.rejects(() => open({ version: 2 }), /unsupported.*version/);
  await assert.rejects(() => open({ conversationId: "other" }), /identity/);
  await assert.rejects(() => open({ conversationId: "x".repeat(129) }), /length limit/);
  await assert.rejects(() => open({ questions: [] }), /at least one/);
  await assert.rejects(() => open({ questions: Array(21).fill(questions[0]) }), /more than 20/);
  await assert.rejects(() => open({ questions: [{ ...questions[0], multiple: "yes" }] }), /boolean/);
  current = { ...current, sessionId: "wrong-wrapper" };
  await assert.rejects(open, /no live session/);
  assert.equal(opens, 0);
});
