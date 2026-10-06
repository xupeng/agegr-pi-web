import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const { AgentRunTracker, completionResultText } = await createJiti(import.meta.url).import("./agent-run-tracker.ts");
const good = { outcome: "completed", stopReason: "stop", resultEntryId: "result", summary: "Visible answer" };
function end(tracker, turn = good) {
  tracker.turnEnd(turn); tracker.beforeSettle(turn.outcome);
  return tracker.settle("leaf", "2026-10-06T00:00:00.000Z");
}
test("actual run, not admission/agent_end/idle, supplies a frozen entry-bound completion", () => {
  const tracker = new AgentRunTracker("session", "generation");
  assert.deepEqual(end(tracker), []);
  tracker.agentStart(); const [candidate] = end(tracker);
  assert.deepEqual(candidate, { sessionId: "session", runIdentity: "generation:1", resultEntryId: "result",
    completionLeafId: "leaf", completedAt: "2026-10-06T00:00:00.000Z", summary: "Visible answer" });
  assert.ok(Object.isFrozen(candidate)); assert.deepEqual(end(tracker), []);
});
test("retry, compaction and queued continuation starts are one logical run with final witness", () => {
  const tracker = new AgentRunTracker("s", "g");
  tracker.agentStart(); tracker.turnEnd({ ...good, outcome: "error", stopReason: "error" });
  tracker.agentStart(); tracker.beforeSettle("error"); tracker.agentStart();
  assert.equal(end(tracker)[0].runIdentity, "g:1");
  tracker.agentStart(); assert.equal(end(tracker)[0].runIdentity, "g:2");
});
for (const reason of ["error", "aborted", "length", "deferred", "unknown"]) test(`final ${reason} never completes`, () => {
  const tracker = new AgentRunTracker("s", "g"); tracker.agentStart();
  assert.deepEqual(end(tracker, { ...good, stopReason: reason }), []);
});
for (const mark of ["markStopped", "markAskPaused"]) test(`${mark} survives quick resume and later successful turn`, () => {
  const tracker = new AgentRunTracker("s", "g"); tracker.agentStart(); tracker[mark]();
  tracker.agentStart(); assert.deepEqual(end(tracker), []);
  tracker.agentStart(); assert.equal(end(tracker).length, 1);
});
test("entry id and final before-settle witness are required", () => {
  const tracker = new AgentRunTracker("s", "g"); tracker.agentStart();
  assert.deepEqual(end(tracker, { ...good, resultEntryId: "" }), []);
  tracker.agentStart(); tracker.beforeSettle("completed"); tracker.turnEnd(good);
  assert.deepEqual(tracker.settle(null, "now"), []);
});
for (const disposition of ["handled", "queued"]) test(`${disposition} without an actual run cannot complete`, () => {
  const tracker = new AgentRunTracker("s", "g"); const ticket = tracker.beginPrompt();
  tracker.acceptPrompt(ticket, disposition); assert.deepEqual(tracker.finishPrompt(ticket), []);
});
test("direct promise rejection vetoes its settled candidate before releasing it", () => {
  const tracker = new AgentRunTracker("s", "g"); const ticket = tracker.beginPrompt();
  tracker.acceptPrompt(ticket, "started"); tracker.agentStart(); assert.deepEqual(end(tracker), []);
  assert.deepEqual(tracker.finishPrompt(ticket, true), []); assert.deepEqual(tracker.finishPrompt(ticket), []);
});
test("early direct rejection leaves an active-run veto", () => {
  const tracker = new AgentRunTracker("s", "g"); const ticket = tracker.beginPrompt();
  tracker.acceptPrompt(ticket, "started"); tracker.agentStart(); tracker.finishPrompt(ticket, true);
  assert.deepEqual(end(tracker), []);
});
test("deferred run owns new identity while outer direct promise is pending", () => {
  const tracker = new AgentRunTracker("s", "g"); const ticket = tracker.beginPrompt();
  tracker.acceptPrompt(ticket, "started"); tracker.agentStart(); assert.deepEqual(end(tracker), []);
  tracker.agentStart(); assert.deepEqual(end(tracker, { ...good, resultEntryId: "deferred" }), []);
  const [direct, deferred] = tracker.finishPrompt(ticket);
  assert.equal(deferred.runIdentity, "g:2"); assert.equal(deferred.resultEntryId, "deferred");
  assert.equal(direct.runIdentity, "g:1");
});
test("dispose rejects late events and releases all pending candidates", () => {
  const tracker = new AgentRunTracker("s", "g"); const ticket = tracker.beginPrompt();
  tracker.acceptPrompt(ticket, "started"); tracker.agentStart(); end(tracker); tracker.dispose();
  assert.deepEqual(tracker.finishPrompt(ticket), []); tracker.agentStart(); assert.deepEqual(end(tracker), []);
});
test("Stop during preflight marks an eventual actual run, but not the next submission", () => {
  const tracker = new AgentRunTracker("s", "g"); const ticket = tracker.beginPrompt();
  tracker.markStopped(); tracker.acceptPrompt(ticket, "started"); tracker.agentStart(); end(tracker);
  assert.deepEqual(tracker.finishPrompt(ticket), []);
  tracker.agentStart(); assert.equal(end(tracker).length, 1);
});
test("queued prompt rejection is not an attributable fatal error of the already active run", () => {
  const tracker = new AgentRunTracker("s", "g"); tracker.agentStart();
  const queued = tracker.beginPrompt(); tracker.acceptPrompt(queued, "queued"); tracker.finishPrompt(queued, true);
  assert.equal(end(tracker).length, 1);
});
test("direct veto does not discard the independent deferred success", () => {
  const tracker = new AgentRunTracker("s", "g"); const ticket = tracker.beginPrompt();
  tracker.acceptPrompt(ticket, "started"); tracker.agentStart(); end(tracker);
  tracker.agentStart(); end(tracker, { ...good, resultEntryId: "deferred" });
  const candidates = tracker.finishPrompt(ticket, true);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].runIdentity, "g:2");
});
test("summary projection excludes thinking, tool, system and private details", () => {
  const content = [{ type: "thinking", thinking: "secret" }, { type: "text", text: " Visible\nanswer " },
    { type: "toolCall", name: "secret", arguments: { password: "hidden" } }];
  assert.equal(completionResultText({ role: "assistant", content, details: "hidden" }), "Visible answer");
  for (const role of ["system", "toolResult", "custom", "user"]) assert.equal(completionResultText({ role, content }), "");
  assert.equal(completionResultText({ role: "assistant", content: [{ type: "text", text: "x".repeat(1000) }] }).length, 280);
});
