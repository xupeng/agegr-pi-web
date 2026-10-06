import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, tsconfigPaths: true });
const {
  EMPTY_NOTIFICATION_HISTORY, isCommittedNotificationResult, bindNotificationHistoryProof, NotificationViewAckGate,
  notificationResultTextIndexes, notificationVisibleIntersection,
} = await jiti.import("./viewed-result.ts");
const answer = { type: "text", text: "Persisted answer" };
const message = { role: "assistant", content: [answer] };
const history = {
  sessionId: "session-a", leafId: "later-descendant", viewGeneration: 3,
  ready: true, entryIds: ["answer-entry"], messages: [message],
};

test("empty, pending, wrong-session and sibling history cannot authorize a view", () => {
  assert.equal(isCommittedNotificationResult(EMPTY_NOTIFICATION_HISTORY, "session-a", "answer-entry", message), false);
  assert.equal(isCommittedNotificationResult({ ...history, ready: false }, "session-a", "answer-entry", message), false);
  assert.equal(isCommittedNotificationResult(history, "session-b", "answer-entry", message), false);
  assert.equal(isCommittedNotificationResult({ ...history, entryIds: ["sibling"] }, "session-a", "answer-entry", message), false);
});

test("the committed source is evidence; identical optimistic text is not", () => {
  assert.equal(isCommittedNotificationResult(history, "session-a", "answer-entry", message), true);
  assert.equal(isCommittedNotificationResult(history, "session-a", "answer-entry", { ...message }), false);
  assert.equal(isCommittedNotificationResult(history, "session-a", undefined, message), false);
});

test("retained renders are rebound only to an authoritative matching entry, not a shifted index", () => {
  const clone = { ...message, content: [{ ...answer }] };
  assert.deepEqual(bindNotificationHistoryProof(["answer-entry"], [clone], ["answer-entry"], [message]), {
    entryIds: ["answer-entry"], messages: [clone],
  });
  assert.deepEqual(bindNotificationHistoryProof(["answer-entry"], [{ ...message, content: [{ type: "text", text: "Optimistic wrong result" }] }], ["answer-entry"], [message]), {
    entryIds: [], messages: [],
  });
  assert.deepEqual(bindNotificationHistoryProof(["answer-entry"], [clone], ["different-entry"], [message]), {
    entryIds: [], messages: [],
  });
});

test("paged canonical references can survive a tail refresh but a cached optimistic replacement cannot", () => {
  assert.deepEqual(bindNotificationHistoryProof(["answer-entry"], [message], [], [], history), {
    entryIds: ["answer-entry"], messages: [message],
  });
  assert.deepEqual(bindNotificationHistoryProof(["answer-entry"], [{ ...message }], [], [], history), {
    entryIds: [], messages: [],
  });
});

test("descendant leaf does not invalidate an ancestor result present in committed history", () => {
  assert.equal(isCommittedNotificationResult(history, "session-a", "answer-entry", message), true);
});

test("rendered answer text qualifies but its process-only copy does not", () => {
  const process = { type: "text", text: "Working on it" };
  const tool = { type: "toolCall", toolCallId: "tool-a", toolName: "read", input: {} };
  const original = { role: "assistant", content: [process, tool, answer] };
  assert.deepEqual(notificationResultTextIndexes(original, original), [1]);
  assert.deepEqual(notificationResultTextIndexes(original, { ...original, content: [process, tool] }), []);
  assert.deepEqual(notificationResultTextIndexes(original, { ...original, content: [answer] }), [0]);
});

test("blank, thinking, image-only and user content do not impersonate visible answer text", () => {
  for (const content of [[{ type: "text", text: " " }], [{ type: "thinking", thinking: "secret" }], [{ type: "image", data: "a", mimeType: "image/png" }]]) {
    const original = { role: "assistant", content };
    assert.deepEqual(notificationResultTextIndexes(original, original), []);
  }
  assert.deepEqual(notificationResultTextIndexes({ role: "user", content: "Hi" }, message), []);
});

test("long result partly visible in the scroller qualifies", () => {
  assert.deepEqual(notificationVisibleIntersection(
    { left: 20, right: 300, top: -1000, bottom: 1000 },
    { left: 10, right: 350, top: 100, bottom: 500 },
    { left: 0, right: 390, top: 0, bottom: 844 },
  ), { left: 20, right: 300, top: 100, bottom: 500 });
});

test("offscreen, clipped, zero-area and nonfinite rectangles cannot count as seen", () => {
  const viewport = { left: 0, right: 390, top: 0, bottom: 844 };
  const root = { left: 10, right: 350, top: 100, bottom: 500 };
  for (const rect of [
    { left: 20, right: 300, top: 501, bottom: 600 },
    { left: 20, right: 20, top: 100, bottom: 200 },
    { left: 400, right: 500, top: 100, bottom: 200 },
    { left: 20, right: 300, top: NaN, bottom: 200 },
  ]) assert.equal(notificationVisibleIntersection(rect, root, viewport), null);
});

test("storage-failure snapshot/observer rebinds retain revision-specific ack backoff", () => {
  const gate = new NotificationViewAckGate();
  assert.equal(gate.begin("R1", 100), true);
  assert.equal(gate.begin("R1", 200), false, "a rebound observer cannot duplicate an in-flight ack");
  gate.failed("R1", 300);
  assert.equal(gate.delay("R1", 400), 1900);
  assert.equal(gate.begin("R1", 500), false, "health invalidation does not reset backoff");
  assert.equal(gate.begin("R1", 2300), true);
  assert.equal(gate.begin("R2", 2400), true, "new completion is independent");
  gate.failed("R1", 2500);
  assert.equal(gate.begin("R2", 2600), false, "an old failure cannot release the new in-flight ack");
  gate.sent("R2");
  assert.equal(gate.delay("R2", 5000), Infinity);
});
