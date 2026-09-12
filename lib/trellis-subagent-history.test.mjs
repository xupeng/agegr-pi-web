import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const history = await jiti.import("./trellis-subagent-history.ts");
const { projectTrellisSubagentHistory, collectBranchPath } = history;
const { MAX_RECORDS_PER_VIEW, MAX_TEXT_BUDGET } = await jiti.import("./trellis-subagent-records.ts");

const PARENT = "parent-session";

function details(runId, overrides = {}) {
  return {
    kind: "trellis-subagent-progress",
    agent: "trellis-implement",
    mode: "single",
    startedAt: 1,
    updatedAt: 2,
    final: true,
    runs: [
      {
        id: runId,
        agent: "trellis-implement",
        prompt: "p",
        status: "succeeded",
        finalText: `output ${runId}`,
        textTail: "",
        thinkingTail: "",
        stderrTail: "",
        tools: [],
        ...overrides,
      },
    ],
  };
}

function assistantEntry(id, parentId, callId) {
  return {
    type: "message",
    id,
    parentId,
    timestamp: "2025-01-01T00:00:00.000Z",
    message: {
      role: "assistant",
      content: [
        { type: "text", text: "working" },
        { type: "toolCall", id: callId, name: "trellis_subagent", arguments: {} },
      ],
    },
  };
}

function toolResultEntry(id, parentId, callId, runId, toolName = "trellis_subagent") {
  return {
    type: "message",
    id,
    parentId,
    timestamp: "2025-01-01T00:00:00.000Z",
    message: {
      role: "toolResult",
      toolCallId: callId,
      toolName,
      content: [{ type: "text", text: "done" }],
      details: details(runId),
    },
  };
}

function userEntry(id, parentId, text = "hi") {
  return {
    type: "message",
    id,
    parentId,
    timestamp: "2025-01-01T00:00:00.000Z",
    message: { role: "user", content: text },
  };
}

test("projects records older than 50 chat entries from the requested branch", () => {
  const entries = [];
  let parentId = null;
  // 60 filler entries, with the only Trellis result near the root.
  entries.push(userEntry("e0", null));
  parentId = "e0";
  entries.push(assistantEntry("a0", parentId, "call-old"));
  parentId = "a0";
  entries.push(toolResultEntry("t0", parentId, "call-old", "run-old"));
  parentId = "t0";
  for (let i = 0; i < 60; i += 1) {
    const id = `f${i}`;
    entries.push(userEntry(id, parentId));
    parentId = id;
  }

  const projection = projectTrellisSubagentHistory(entries, parentId, PARENT);
  assert.equal(projection.leafValid, true);
  assert.equal(projection.records.length, 1);
  assert.equal(projection.records[0].runId, "run-old");
  assert.equal(projection.records[0].evidence, "history");
  assert.equal(projection.records[0].entryId, "t0");
  assert.deepEqual(projection.branchToolCallIds, ["call-old"]);
});

test("only walks the requested ancestor path, never sibling branches", () => {
  const entries = [
    userEntry("root", null),
    assistantEntry("a-main", "root", "call-main"),
    toolResultEntry("t-main", "a-main", "call-main", "run-main"),
    userEntry("root2", "root"),
    assistantEntry("a-side", "root", "call-side"),
    toolResultEntry("t-side", "a-side", "call-side", "run-side"),
  ];
  const main = projectTrellisSubagentHistory(entries, "t-main", PARENT);
  assert.deepEqual(main.records.map((r) => r.runId), ["run-main"]);
  const side = projectTrellisSubagentHistory(entries, "t-side", PARENT);
  assert.deepEqual(side.records.map((r) => r.runId), ["run-side"]);
});

test("chain failed before later steps only exposes recorded steps", () => {
  const entries = [
    userEntry("root", null),
    assistantEntry("a", "root", "call-chain"),
    {
      ...toolResultEntry("t", "a", "call-chain", "step-1"),
      message: {
        role: "toolResult",
        toolCallId: "call-chain",
        toolName: "trellis_subagent",
        content: [{ type: "text", text: "failed" }],
        details: {
          kind: "trellis-subagent-progress",
          agent: "trellis-implement",
          mode: "chain",
          startedAt: 1,
          updatedAt: 2,
          final: true,
          runs: [
            { id: "chain-1", agent: "a", prompt: "p1", status: "failed", step: 1, finalText: "", textTail: "", thinkingTail: "", stderrTail: "", tools: [] },
          ],
        },
      },
    },
  ];
  const projection = projectTrellisSubagentHistory(entries, "t", PARENT);
  assert.equal(projection.records.length, 1);
  assert.equal(projection.records[0].status, "failed");
  assert.equal(projection.records[0].step, 1);
});

test("branch X/Y reuse of tool call and run ids does not collide", () => {
  const entries = [
    userEntry("root", null),
    assistantEntry("ax", "root", "shared-call"),
    toolResultEntry("tx", "ax", "shared-call", "shared-run"),
    assistantEntry("ay", "root", "shared-call"),
    toolResultEntry("ty", "ay", "shared-call", "shared-run"),
  ];
  const x = projectTrellisSubagentHistory(entries, "tx", PARENT);
  const y = projectTrellisSubagentHistory(entries, "ty", PARENT);
  assert.equal(x.records.length, 1);
  assert.equal(y.records.length, 1);
  // Same tuple identity but different entry provenance; both are separate views.
  assert.equal(x.records[0].id, y.records[0].id);
  assert.equal(x.records[0].entryId, "tx");
  assert.equal(y.records[0].entryId, "ty");
});

test("explicit root and unknown or cyclic leaves project nothing", () => {
  const entries = [userEntry("root", null)];
  assert.deepEqual(projectTrellisSubagentHistory(entries, null, PARENT).records, []);
  const unknown = projectTrellisSubagentHistory(entries, "missing", PARENT);
  assert.equal(unknown.leafValid, false);
  assert.deepEqual(unknown.records, []);

  // A cyclic parent chain containing an otherwise valid result is rejected.
  const cyclic = [
    assistantEntry("c1", "c2", "cycle-call"),
    toolResultEntry("c2", "c1", "cycle-call", "cycle-run"),
  ];
  const path = collectBranchPath(cyclic, "c1");
  assert.deepEqual(path, []);
  const projected = projectTrellisSubagentHistory(cyclic, "c1", PARENT);
  assert.equal(projected.leafValid, false);
  assert.deepEqual(projected.records, []);
});

test("fork re-scoping scopes copied results to the new parent id", () => {
  const entries = [
    userEntry("root", null),
    assistantEntry("a", "root", "call-fork"),
    toolResultEntry("t", "a", "call-fork", "run-fork"),
  ];
  const original = projectTrellisSubagentHistory(entries, "t", "parent-original");
  const fork = projectTrellisSubagentHistory(entries, "t", "parent-fork");
  assert.equal(original.records[0].parentSessionId, "parent-original");
  assert.equal(fork.records[0].parentSessionId, "parent-fork");
  assert.notEqual(original.records[0].id, fork.records[0].id);
});

test("ignores wrong tool names and malformed details", () => {
  const entries = [
    userEntry("root", null),
    assistantEntry("a", "root", "call-other"),
    toolResultEntry("t1", "a", "call-other", "run-1", "bash"),
    {
      ...toolResultEntry("t2", "a", "call-bad", "run-2"),
      message: {
        role: "toolResult",
        toolCallId: "call-bad",
        toolName: "trellis_subagent",
        content: [{ type: "text", text: "generic" }],
        details: { kind: "something-else" },
      },
    },
  ];
  const projection = projectTrellisSubagentHistory(entries, "t2", PARENT);
  assert.deepEqual(projection.records, []);
});

test("caps retained records newest-first with truncation flag", () => {
  const entries = [userEntry("root", null)];
  let parentId = "root";
  for (let i = 0; i < MAX_RECORDS_PER_VIEW + 5; i += 1) {
    const a = `a${i}`;
    const t = `t${i}`;
    entries.push(assistantEntry(a, parentId, `call-${i}`));
    entries.push(toolResultEntry(t, a, `call-${i}`, `run-${i}`));
    parentId = t;
  }
  const leaf = `t${MAX_RECORDS_PER_VIEW + 4}`;
  const projection = projectTrellisSubagentHistory(entries, leaf, PARENT);
  assert.equal(projection.records.length, MAX_RECORDS_PER_VIEW);
  assert.equal(projection.truncated, true);
  // Newest source entries win the retention budget.
  assert.equal(projection.records[0].runId, `run-${MAX_RECORDS_PER_VIEW + 4}`);
  assert.equal(projection.records.at(-1).runId, "run-5");
  assert.equal(projection.branchToolCallIds.length, MAX_RECORDS_PER_VIEW);
  assert.equal(projection.branchToolCallIds[0], "call-5");
  assert.equal(projection.branchToolCallIds.at(-1), `call-${MAX_RECORDS_PER_VIEW + 4}`);
});

test("applies the aggregate text budget before the API envelope is serialized", () => {
  const entries = [userEntry("root", null)];
  let parentId = "root";
  for (let i = 0; i < 40; i += 1) {
    const assistantId = `budget-a-${i}`;
    const resultId = `budget-t-${i}`;
    entries.push(assistantEntry(assistantId, parentId, `budget-call-${i}`));
    entries.push(toolResultEntry(resultId, assistantId, `budget-call-${i}`, `budget-run-${i}`, "trellis_subagent"));
    entries.at(-1).message.details.runs[0].finalText = "x".repeat(20_000);
    entries.at(-1).message.details.runs[0].tools = Array.from({ length: 32 }, (_, j) => ({
      id: `tool-${i}-${j}`,
      name: "bash",
      args: "y".repeat(2_048),
      status: "succeeded",
    }));
    parentId = resultId;
  }
  const projection = projectTrellisSubagentHistory(entries, parentId, PARENT);
  const displayedText = projection.records.reduce((total, record) => total
    + record.agent.length
    + (record.model?.length ?? 0)
    + (record.thinking?.length ?? 0)
    + record.promptExcerpt.length
    + record.finalText.length
    + record.textTail.length
    + record.thinkingTail.length
    + record.stderrTail.length
    + (record.errorExcerpt?.length ?? 0)
    + record.tools.reduce((sum, tool) => sum + tool.id.length + tool.name.length + tool.argsExcerpt.length, 0), 0);
  assert.ok(displayedText <= MAX_TEXT_BUDGET);
  assert.ok(projection.records.some((record) => record.omittedByBudget));
});

test("invalid ids in tool results are skipped, valid siblings survive", () => {
  const entries = [
    userEntry("root", null),
    assistantEntry("a", "root", "call-ok"),
    {
      ...toolResultEntry("t-bad", "a", "call-bad", "run-bad"),
      message: {
        role: "toolResult",
        toolCallId: "",
        toolName: "trellis_subagent",
        content: [],
        details: details("run-bad"),
      },
    },
    toolResultEntry("t-ok", "t-bad", "call-ok", "run-ok"),
  ];
  const projection = projectTrellisSubagentHistory(entries, "t-ok", PARENT);
  assert.deepEqual(projection.records.map((r) => r.runId), ["run-ok"]);
});
