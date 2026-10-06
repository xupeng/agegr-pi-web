import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const { decodeNotificationCommand, notificationSummary } = await createJiti(import.meta.url).import("./types.ts");
test("unknown API input validates discriminant, ids, revisions, fields and batch limits", () => {
  const ack = { type: "ack", id: "completion:s1", revision: "opaque" };
  assert.deepEqual(decodeNotificationCommand(ack), ack);
  assert.deepEqual(decodeNotificationCommand({ type: "ack_many", items: [ack].map(({ id, revision }) => ({ id, revision })) }),
    { type: "ack_many", items: [{ id: ack.id, revision: ack.revision }] });
  for (const invalid of [null, [], "x", { type: "clear_all" }, { ...ack, sessionId: "s1" },
    { ...ack, id: "ask:s1:ask1" }, { ...ack, revision: "" }, { type: "ack_many", items: Array(201).fill({ id: ack.id, revision: ack.revision }) },
    { type: "import_legacy", instanceId: "instance", sessionIds: ["../file"] }]) {
    assert.equal(decodeNotificationCommand(invalid), null);
  }
});
test("plain text summaries strip control characters and are bounded", () => {
  assert.equal(notificationSummary("a\u0000b\n c"), "a b c");
  assert.equal(notificationSummary("x".repeat(1000)).length, 500);
});
