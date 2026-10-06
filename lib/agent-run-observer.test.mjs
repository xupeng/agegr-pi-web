import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { AgentRunTracker } = await jiti.import("./agent-run-tracker.ts");
const { createAgentRunObserver } = await jiti.import("./agent-run-observer.ts");

test("observer registers only read-only public boundaries synchronously", () => {
  const tracker = new AgentRunTracker("s", "g");
  const observer = createAgentRunObserver(tracker);
  assert.equal(observer.hidden, true);
  const handlers = new Map();
  assert.equal(observer.factory({ on: (kind, handler) => handlers.set(kind, handler) }), undefined);
  assert.deepEqual([...handlers.keys()], ["turn_end", "agent_before_settle"]);
  tracker.agentStart();
  const event = { outcome: "completed", messageEntryId: "durable", entries: [], continue: false,
    message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "Answer" }, { type: "thinking", thinking: "private" }] } };
  assert.equal(handlers.get("turn_end")(event), undefined);
  assert.equal(handlers.get("agent_before_settle")(event), undefined);
  assert.deepEqual(event.entries, []); assert.equal(event.continue, false);
  const [candidate] = tracker.settle("leaf", "now");
  assert.equal(candidate.resultEntryId, "durable"); assert.equal(candidate.summary, "Answer");
});

test("non-assistant messages never become result witnesses", () => {
  const tracker = new AgentRunTracker("s", "g"); const handlers = new Map();
  createAgentRunObserver(tracker).factory({ on: (kind, handler) => handlers.set(kind, handler) });
  tracker.agentStart();
  handlers.get("turn_end")({ outcome: "completed", messageEntryId: "tool", message: { role: "toolResult", content: [] } });
  handlers.get("agent_before_settle")({ outcome: "completed" });
  assert.deepEqual(tracker.settle(null, "now"), []);
});
