import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

/**
 * Pi Web's inline adapter keeps its own settings gate and session lookup and
 * injects `open` directly; it does not use the portable host bridge. These
 * tests lock that visibility/lifecycle behavior so sharing the portable core
 * cannot silently change it.
 */

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { createAskUserExtension } = await jiti.import("./extension.ts");
const { PendingAskStore } = await jiti.import("./store.ts");

function withEnv(value, fn) {
  const previous = process.env.PI_WEB_ASK_USER;
  process.env.PI_WEB_ASK_USER = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.PI_WEB_ASK_USER;
    else process.env.PI_WEB_ASK_USER = previous;
  }
}

/** Invoke the adapter factory under a fixed setting; `isAskUserEnabled` is read at factory time. */
function registerExtension(getSession, envValue = "1") {
  const registered = [];
  const extension = createAskUserExtension(getSession);
  withEnv(envValue, () => extension.factory({ registerTool: (tool) => registered.push(tool) }));
  return registered;
}

const questions = [{ id: "q1", question: "Which database?", options: [] }];

test("the adapter registers ask_user only while the setting is enabled", () => {
  const enabled = registerExtension(() => undefined);
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].name, "ask_user");

  const disabled = registerExtension(() => undefined, "0");
  assert.equal(disabled.length, 0);
});

test("the adapter injects the live session's openAsk without a bridge", async () => {
  const opened = [];
  const [tool] = registerExtension(() => ({
    openAsk: async (input) => {
      opened.push(input);
      return { ask: { askId: "ask-1", askedAt: "2026-09-25T00:00:00.000Z", questions: input.questions } };
    },
  }));
  const result = await tool.execute("call", { questions }, undefined, undefined, {
    sessionManager: { getSessionId: () => "web-session" },
  });
  assert.equal(result.terminate, true);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].sessionId, "web-session");
  assert.equal(opened[0].questions[0].id, "q1");
});

test("the adapter fails when the session runtime is gone", async () => {
  const [tool] = registerExtension(() => undefined);
  await assert.rejects(
    () => tool.execute("call", { questions }, undefined, undefined, {
      sessionManager: { getSessionId: () => "gone" },
    }),
    /no live session for this call/,
  );
});

test("the adapter does not register or terminate a malformed ask on the live store", async () => {
  let askIds = 0;
  const store = new PendingAskStore({
    now: () => new Date("2026-09-25T00:00:00.000Z"),
    createAskId: () => `ask-${++askIds}`,
  });
  const [tool] = registerExtension(() => ({
    openAsk: (input) => Promise.resolve(store.open(input)),
  }));
  await assert.rejects(
    () => tool.execute("call", { questions: [{ id: "", question: "bad" }] }, undefined, undefined, {
      sessionManager: { getSessionId: () => "web-session" },
    }),
    /question id must not be empty/,
  );
  assert.equal(store.pendingAsk("web-session"), undefined);
});
