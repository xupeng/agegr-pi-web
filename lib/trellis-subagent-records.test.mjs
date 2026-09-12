import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const records = await jiti.import("./trellis-subagent-records.ts");

const {
  createTrellisStore,
  decodeTrellisProgressDetails,
  enforceTextBudget,
  isTrellisSubagentDetails,
  projectTrellisSubagentRecords,
  reduceTrellisStore,
  selectTrellisRecords,
  shouldAcceptTrellisSnapshot,
  shouldFollowTrellisHeadRefresh,
  trellisRecordId,
  MAX_RETAINED_TOOL_TRACES,
  MAX_RUNS_PER_SNAPSHOT,
  MAX_RECORDS_PER_VIEW,
  MAX_FINAL_TEXT_LENGTH,
  MAX_EXCERPT_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_TAIL_LENGTH,
  MAX_TEXT_BUDGET,
} = records;

const PARENT = "parent-1";
const CALL = "call-1";

function run(overrides = {}) {
  return {
    id: "agent-1",
    agent: "trellis-implement",
    prompt: "do the thing",
    status: "running",
    finalText: "",
    textTail: "",
    thinkingTail: "",
    stderrTail: "",
    tools: [],
    usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0.01, ctxTokens: 10, turns: 1 },
    startedAt: 1_000,
    ...overrides,
  };
}

function envelope(overrides = {}) {
  return {
    kind: "trellis-subagent-progress",
    agent: "trellis-implement",
    mode: "single",
    startedAt: 1_000,
    updatedAt: 1_100,
    final: false,
    runs: [run()],
    ...overrides,
  };
}

function project(details, options = {}) {
  return projectTrellisSubagentRecords({
    parentSessionId: PARENT,
    toolCallId: CALL,
    toolName: "trellis_subagent",
    evidence: "partial",
    details,
    ...options,
  });
}

test("gate accepts only the exact tool and details kind", () => {
  assert.equal(isTrellisSubagentDetails(envelope()), true);
  assert.equal(isTrellisSubagentDetails({ kind: "other", runs: [] }), false);
  assert.equal(isTrellisSubagentDetails(null), false);
  assert.equal(isTrellisSubagentDetails([]), false);
  assert.equal(isTrellisSubagentDetails({ runs: [] }), false);
  assert.equal(decodeTrellisProgressDetails(null), null);
  assert.equal(decodeTrellisProgressDetails({ kind: "trellis-subagent-progress" }), null);
  assert.equal(decodeTrellisProgressDetails({ kind: "trellis-subagent-progress", runs: "x" }), null);
  assert.equal(project(envelope(), { toolName: "bash" }), null);
  assert.equal(project(envelope(), { toolName: undefined }), null);
});

test("decodes single, parallel and chain mode snapshots", () => {
  const single = decodeTrellisProgressDetails(envelope());
  assert.equal(single.envelope.mode, "single");
  assert.equal(single.runs.length, 1);
  assert.equal(single.runs[0].runId, "agent-1");

  const parallel = decodeTrellisProgressDetails(envelope({
    mode: "parallel",
    runs: [run({ id: "a-1" }), run({ id: "a-2" }), run({ id: "a-3" })],
  }));
  assert.equal(parallel.envelope.mode, "parallel");
  assert.deepEqual(parallel.runs.map((r) => r.runId), ["a-1", "a-2", "a-3"]);

  const chain = decodeTrellisProgressDetails(envelope({
    mode: "chain",
    runs: [run({ id: "a-1", step: 1, status: "succeeded" }), run({ id: "a-2", step: 2 })],
  }));
  assert.equal(chain.envelope.mode, "chain");
  assert.deepEqual(chain.runs.map((r) => r.step), [1, 2]);
});

test("maps failed, cancelled and unknown statuses without inferring success", () => {
  const decoded = decodeTrellisProgressDetails(envelope({
    runs: [
      run({ id: "a", status: "failed" }),
      run({ id: "b", status: "cancelled" }),
      run({ id: "c", status: "weird" }),
      run({ id: "d", status: undefined }),
    ],
  }));
  assert.deepEqual(decoded.runs.map((r) => r.status), ["failed", "cancelled", "unknown", "unknown"]);
});

test("unknown mode is preserved as unknown without reinterpreting semantics", () => {
  const decoded = decodeTrellisProgressDetails(envelope({ mode: "broadcast" }));
  assert.equal(decoded.envelope.mode, "unknown");
});

test("identity is a collision-free tuple of parent, call and run", () => {
  const a = trellisRecordId("p|1", "c", "r");
  const b = trellisRecordId("p", "1|c", "r");
  assert.notEqual(a, b);
  assert.equal(a, trellisRecordId("p|1", "c", "r"));
  assert.equal(
    trellisRecordId("parent", "call", "run"),
    JSON.stringify(["parent", "call", "run"]),
  );
});

test("same run id in distinct parents/calls does not collide", () => {
  const one = project(envelope(), { parentSessionId: "parent-a", toolCallId: "call-1" });
  const two = project(envelope(), { parentSessionId: "parent-b", toolCallId: "call-1" });
  const three = project(envelope(), { parentSessionId: "parent-a", toolCallId: "call-2" });
  assert.notEqual(one.records[0].id, two.records[0].id);
  assert.notEqual(one.records[0].id, three.records[0].id);
});

test("oversized and missing identities are rejected, never truncated", () => {
  assert.equal(project(envelope(), { parentSessionId: "x".repeat(257) }), null);
  assert.equal(project(envelope(), { toolCallId: "" }), null);
  const decoded = decodeTrellisProgressDetails(envelope({
    runs: [run({ id: "y".repeat(257) }), run({ id: "" }), run({ id: "ok" })],
  }));
  assert.deepEqual(decoded.runs.map((r) => r.runId), ["ok"]);
  assert.equal(decoded.envelope.malformedRuns, 2);
  assert.equal(project(envelope(), { entryId: "e".repeat(257) }).records[0].entryId, undefined);
});

test("duplicate run ids in one snapshot keep the first valid instance", () => {
  const decoded = decodeTrellisProgressDetails(envelope({
    runs: [run({ id: "dup", finalText: "first" }), run({ id: "dup", finalText: "second" })],
  }));
  assert.equal(decoded.runs.length, 1);
  assert.equal(decoded.runs[0].finalText, "first");
  assert.equal(decoded.envelope.malformedRuns, 1);
});

test("missing optional fields decode without fabricating usage or timestamps", () => {
  const decoded = decodeTrellisProgressDetails(envelope({
    runs: [{ id: "bare" }],
  }));
  const payload = decoded.runs[0];
  assert.equal(payload.usage, undefined);
  assert.equal(payload.step, undefined);
  assert.equal(payload.startedAt, undefined);
  assert.equal(payload.model, undefined);
  assert.equal(payload.errorExcerpt, undefined);
  assert.equal(payload.incomplete, true);
});

test("numeric fields are bounded and malformed numbers fail soft", () => {
  const decoded = decodeTrellisProgressDetails(envelope({
    runs: [run({
      step: -3,
      startedAt: -1,
      finishedAt: Number.POSITIVE_INFINITY,
      usage: { input: -5, output: Number.NaN, cost: 1, turns: 2 },
    })],
  }));
  const payload = decoded.runs[0];
  assert.equal(payload.step, undefined);
  assert.equal(payload.startedAt, undefined);
  assert.equal(payload.finishedAt, undefined);
  assert.equal(payload.usage.input, undefined);
  assert.equal(payload.usage.output, undefined);
  assert.equal(payload.usage.cost, 1);
  assert.equal(payload.usage.turns, 2);
});

test("fractional usage counts are rejected while a finite cost survives", () => {
  const decoded = decodeTrellisProgressDetails(envelope({
    runs: [run({ usage: { input: 1.5, output: 2, turns: Number.MAX_SAFE_INTEGER + 1, cost: 0.25 } })],
  }));
  assert.equal(decoded.runs[0].usage.input, undefined);
  assert.equal(decoded.runs[0].usage.output, 2);
  assert.equal(decoded.runs[0].usage.turns, undefined);
  assert.equal(decoded.runs[0].usage.cost, 0.25);
});

test("all-zero usage is unavailable rather than a fabricated object", () => {
  const decoded = decodeTrellisProgressDetails(envelope({
    runs: [run({ usage: { input: "x", output: null, cost: -1 } })],
  }));
  assert.equal(decoded.runs[0].usage, undefined);
});

test("inspects at most 100 runs per snapshot and reports omissions", () => {
  const many = Array.from({ length: MAX_RUNS_PER_SNAPSHOT + 7 }, (_, i) => run({ id: `r-${i}` }));
  const decoded = decodeTrellisProgressDetails(envelope({ runs: many }));
  assert.equal(decoded.runs.length, MAX_RUNS_PER_SNAPSHOT);
  assert.equal(decoded.envelope.omittedRuns, 7);
});

test("retains at most the latest 32 tool traces", () => {
  const tools = Array.from({ length: MAX_RETAINED_TOOL_TRACES + 5 }, (_, i) => ({
    id: `t-${i}`,
    name: "bash",
    args: `cmd ${i}`,
    status: "succeeded",
  }));
  const decoded = decodeTrellisProgressDetails(envelope({ runs: [run({ tools })] }));
  assert.equal(decoded.runs[0].tools.length, MAX_RETAINED_TOOL_TRACES);
  assert.equal(decoded.runs[0].toolsOmitted, 5);
  assert.equal(decoded.runs[0].tools[0].id, "t-5");
});

test("tool decoding does not inspect entries outside the retained tail", () => {
  let reads = 0;
  const tools = new Proxy(Array.from({ length: MAX_RETAINED_TOOL_TRACES + 10 }, (_, i) => ({
    id: `t-${i}`,
    name: "bash",
    args: `cmd ${i}`,
    status: "succeeded",
  })), {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) reads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  const decoded = decodeTrellisProgressDetails(envelope({ runs: [run({ tools })] }));
  assert.equal(decoded.runs[0].tools.length, MAX_RETAINED_TOOL_TRACES);
  assert.equal(reads, MAX_RETAINED_TOOL_TRACES);
});

test("bounds final text, excerpts and tails with explicit truncation flags", () => {
  const decoded = decodeTrellisProgressDetails(envelope({
    runs: [run({
      prompt: "p".repeat(MAX_EXCERPT_LENGTH + 10),
      finalText: "f".repeat(MAX_FINAL_TEXT_LENGTH + 10),
      textTail: "t".repeat(MAX_TAIL_LENGTH + 10),
      thinkingTail: "k".repeat(MAX_TAIL_LENGTH + 10),
      stderrTail: "e".repeat(MAX_TAIL_LENGTH + 10),
      errorMessage: "x".repeat(MAX_EXCERPT_LENGTH + 10),
    })],
  }));
  const payload = decoded.runs[0];
  assert.equal(payload.promptExcerpt.length, MAX_EXCERPT_LENGTH);
  assert.equal(payload.promptTruncated, true);
  assert.equal(payload.finalText.length, MAX_FINAL_TEXT_LENGTH);
  assert.equal(payload.finalTextTruncated, true);
  assert.equal(payload.textTail.length, MAX_TAIL_LENGTH);
  assert.match(payload.textTail, /t$/);
  assert.equal(payload.tailsTruncated, true);
  assert.equal(payload.errorExcerpt.length, MAX_EXCERPT_LENGTH);
  assert.equal(payload.errorTruncated, true);
});

test("bounds labels and tool arguments with explicit truncation flags", () => {
  const decoded = decodeTrellisProgressDetails(envelope({
    agent: "e".repeat(MAX_LABEL_LENGTH + 50),
    runs: [run({
      agent: undefined,
      model: "m".repeat(MAX_LABEL_LENGTH + 1),
      thinking: "t".repeat(MAX_LABEL_LENGTH + 1),
      tools: [{
        id: "tool",
        name: "b".repeat(MAX_LABEL_LENGTH + 1),
        args: "a".repeat(MAX_EXCERPT_LENGTH + 1),
        status: "running",
      }],
    })],
  }));
  const payload = decoded.runs[0];
  assert.equal(payload.agent.length, MAX_LABEL_LENGTH);
  assert.equal(payload.model.length, MAX_LABEL_LENGTH);
  assert.equal(payload.thinking.length, MAX_LABEL_LENGTH);
  assert.equal(payload.labelsTruncated, true);
  assert.equal(payload.tools[0].name.length, MAX_LABEL_LENGTH);
  assert.equal(payload.tools[0].nameTruncated, true);
  assert.equal(payload.tools[0].argsExcerpt.length, MAX_EXCERPT_LENGTH);
  assert.equal(payload.tools[0].argsTruncated, true);
});

test("aggregate view budget clears remaining text deterministically", () => {
  const big = "z".repeat(MAX_EXCERPT_LENGTH);
  const items = [0, 1, 2, 3].map((i) => ({
    id: `id-${i}`,
    promptExcerpt: big,
    finalText: "",
    textTail: "",
    thinkingTail: "",
    stderrTail: "",
    agent: "",
    tools: [],
    omittedByBudget: false,
  }));
  const bounded = enforceTextBudget(items, MAX_EXCERPT_LENGTH * 2 + 10);
  assert.equal(bounded[0].omittedByBudget, false);
  assert.equal(bounded[1].omittedByBudget, false);
  assert.equal(bounded[2].omittedByBudget, true);
  assert.equal(bounded[3].omittedByBudget, true);
  assert.equal(bounded[3].promptExcerpt, "");
});

test("decode never mutates the source details", () => {
  const source = envelope({
    runs: [run({ tools: [{ id: "t", name: "bash", args: "ls", status: "running" }] })],
  });
  const snapshot = JSON.parse(JSON.stringify(source));
  Object.freeze(source);
  project(source);
  assert.deepEqual(source, snapshot);
});

test("projection from partial evidence is reported, not a live guarantee", () => {
  const projection = project(envelope({ final: false }));
  assert.equal(projection.records[0].evidence, "partial");
  assert.equal(projection.records[0].status, "running");
  assert.equal(projection.records[0].finalEnvelope, false);
});

// ── reducer ────────────────────────────────────────────────────────────

function rec(id, overrides = {}) {
  return {
    id,
    parentSessionId: PARENT,
    toolCallId: CALL,
    runId: id,
    agent: "a",
    mode: "single",
    promptExcerpt: "",
    promptTruncated: false,
    status: "running",
    finalEnvelope: false,
    evidence: "partial",
    errorTruncated: false,
    finalText: "",
    finalTextTruncated: false,
    textTail: "",
    thinkingTail: "",
    stderrTail: "",
    tailsTruncated: false,
    tools: [],
    toolsOmitted: 0,
    incomplete: false,
    stamp: 1,
    stale: false,
    omittedByBudget: false,
    startedAt: 10,
    updatedAt: 10,
    ...overrides,
  };
}

test("reducer deduplicates update/end/message into one row per tuple", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { evidence: "partial", status: "running", stamp: 1 })],
    watermark: 1,
  });
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { evidence: "tool-end", status: "succeeded", finalEnvelope: true, stamp: 2 })],
    watermark: 2,
  });
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { evidence: "message", status: "succeeded", finalEnvelope: true, finalText: "done", stamp: 3 })],
    watermark: 3,
  });
  const { records: selected } = selectTrellisRecords(store);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].evidence, "message");
  assert.equal(selected[0].finalText, "done");
});

test("a late partial cannot regress a terminal record", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { evidence: "tool-end", status: "succeeded", finalEnvelope: true, stamp: 2 })],
    watermark: 2,
  });
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { evidence: "partial", status: "running", stamp: 3 })],
    watermark: 3,
  });
  const { records: selected } = selectTrellisRecords(store);
  assert.equal(selected[0].status, "succeeded");
  assert.equal(selected[0].evidence, "tool-end");
});

test("tool-end before its canonical message keeps the final snapshot across the gap", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { evidence: "tool-end", status: "succeeded", finalEnvelope: true, stamp: 1 })],
    watermark: 1,
  });
  const afterEnd = selectTrellisRecords(store);
  assert.equal(afterEnd.records.length, 1);
  assert.equal(afterEnd.records[0].finalEnvelope, true);

  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { evidence: "message", status: "succeeded", finalEnvelope: true, finalText: "canonical", stamp: 2 })],
    watermark: 2,
  });
  const afterMessage = selectTrellisRecords(store);
  assert.equal(afterMessage.records[0].finalText, "canonical");
});

test("final without any partial still becomes one record", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { evidence: "message", status: "succeeded", finalEnvelope: true, stamp: 1 })],
    watermark: 1,
  });
  assert.equal(selectTrellisRecords(store).records.length, 1);
});

test("concurrent tool calls keep independent rows", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [
      rec("a", { toolCallId: "c1", stamp: 1 }),
      rec("b", { toolCallId: "c2", stamp: 1 }),
    ],
    watermark: 1,
  });
  assert.equal(selectTrellisRecords(store).records.length, 2);
});

test("history replaces its base but keeps overlays newer than the request", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("live", { toolCallId: "c-live", evidence: "partial", stamp: 5 })],
    watermark: 5,
  });
  store = reduceTrellisStore(store, {
    type: "history",
    records: [rec("old", { toolCallId: "c-old", evidence: "history", stamp: 0 })],
    watermark: 2,
    truncated: false,
  });
  const { records: selected, historyCoverage } = selectTrellisRecords(store);
  assert.equal(historyCoverage, "complete");
  assert.deepEqual(selected.map((r) => r.runId).sort(), ["live", "old"]);
});

test("persisted history outranks a later provisional overlay for the same tuple", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { evidence: "partial", status: "running", stamp: 9 })],
    watermark: 9,
  });
  store = reduceTrellisStore(store, {
    type: "history",
    records: [rec("a", { evidence: "history", status: "succeeded", finalEnvelope: true, finalText: "durable", stamp: 0 })],
    watermark: 4,
    truncated: false,
  });
  const selected = selectTrellisRecords(store).records;
  assert.equal(selected.length, 1);
  assert.equal(selected[0].evidence, "history");
  assert.equal(selected[0].status, "succeeded");
  assert.equal(selected[0].finalText, "durable");
});

test("a stale request snapshot does not erase a newly arrived final overlay", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { evidence: "message", status: "succeeded", finalText: "fresh", finalEnvelope: true, stamp: 9 })],
    watermark: 9,
  });
  store = reduceTrellisStore(store, {
    type: "history",
    records: [rec("a", { evidence: "history", status: "running", stamp: 0 })],
    watermark: 4,
    truncated: false,
  });
  const { records: selected } = selectTrellisRecords(store);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].finalText, "fresh");
  assert.equal(selected[0].status, "succeeded");
});

test("older-than-request overlay covered by history is dropped", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { toolCallId: "c1", evidence: "partial", stamp: 1 })],
    watermark: 1,
  });
  store = reduceTrellisStore(store, {
    type: "history",
    records: [rec("a", { toolCallId: "c1", evidence: "history", status: "succeeded", stamp: 0 })],
    watermark: 5,
    truncated: false,
  });
  const { records: selected } = selectTrellisRecords(store);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].evidence, "history");
  assert.equal(selected[0].status, "succeeded");
});

test("a late history response preserves newer event omission signaling", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("live", { stamp: 5 })],
    watermark: 5,
    truncated: true,
  });
  store = reduceTrellisStore(store, {
    type: "history",
    records: [],
    watermark: 2,
    truncated: false,
  });
  assert.equal(selectTrellisRecords(store).truncated, true);
});

test("a history response clears event omission signaling it covers", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("live", { stamp: 1 })],
    watermark: 1,
    truncated: true,
  });
  store = reduceTrellisStore(store, {
    type: "history",
    records: [],
    watermark: 2,
    truncated: false,
  });
  assert.equal(selectTrellisRecords(store).truncated, false);
});

test("an overlay with no durable backing is retained but marked stale", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("ghost", { toolCallId: "c-ghost", evidence: "partial", stamp: 1 })],
    watermark: 1,
  });
  store = reduceTrellisStore(store, {
    type: "history",
    records: [rec("other", { toolCallId: "c-other", evidence: "history", stamp: 0 })],
    watermark: 5,
    truncated: false,
  });
  const ghost = selectTrellisRecords(store).records.find((r) => r.runId === "ghost");
  assert.ok(ghost);
  assert.equal(ghost.stale, true);
  assert.equal(ghost.evidence, "partial");
});

test("reset clears every scope", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("a", { stamp: 1 })],
    watermark: 1,
  });
  store = reduceTrellisStore(store, { type: "reset" });
  const { records: selected, historyCoverage } = selectTrellisRecords(store);
  assert.equal(selected.length, 0);
  assert.equal(historyCoverage, "none");
});

test("selection caps retained records and marks truncation", () => {
  let store = createTrellisStore();
  const many = Array.from({ length: MAX_RECORDS_PER_VIEW + 4 }, (_, i) =>
    rec(`r-${i}`, { stamp: i + 1, updatedAt: i + 1, startedAt: i + 1 }));
  store = reduceTrellisStore(store, { type: "event", records: many, watermark: many.length });
  const { records: selected, truncated } = selectTrellisRecords(store);
  assert.equal(selected.length, MAX_RECORDS_PER_VIEW);
  assert.equal(truncated, true);
});

test("selection applies the aggregate text budget newest-first", () => {
  let store = createTrellisStore();
  const chunk = "q".repeat(200_000);
  const many = [
    rec("new", { stamp: 2, updatedAt: 2, finalText: chunk }),
    rec("mid", { stamp: 1, updatedAt: 1, finalText: chunk }),
    rec("old", { stamp: 0, updatedAt: 0, finalText: chunk }),
  ];
  store = reduceTrellisStore(store, { type: "event", records: many, watermark: 2 });
  const { records: selected } = selectTrellisRecords(store);
  assert.ok(selected.some((r) => r.omittedByBudget));
  const total = selected.reduce((sum, r) => sum + r.finalText.length + r.promptExcerpt.length, 0);
  assert.ok(total <= MAX_TEXT_BUDGET);
  assert.equal(selected[0].omittedByBudget, false);
});

test("event arrival order, not producer timestamps, controls display order", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("newer-arrival", { stamp: 2, updatedAt: 1 })],
    watermark: 2,
  });
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("latest-arrival", { stamp: 3, updatedAt: 99_999 })],
    watermark: 3,
  });
  assert.deepEqual(selectTrellisRecords(store).records.map((record) => record.runId), [
    "latest-arrival",
    "newer-arrival",
  ]);
});

test("a reconnect can qualify retained overlays as stale", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, {
    type: "event",
    records: [rec("partial")],
    watermark: 1,
  });
  store = reduceTrellisStore(store, { type: "markOverlaysStale" });
  assert.equal(selectTrellisRecords(store).records[0].stale, true);
});

test("background settlement keeps a historical branch while its own prompt follows head", () => {
  assert.equal(shouldFollowTrellisHeadRefresh("history-x", "head", null, 3), false);
  assert.equal(shouldFollowTrellisHeadRefresh("history-x", "head", 2, 3), false);
  assert.equal(shouldFollowTrellisHeadRefresh("history-x", "head", 3, 3), true);
  assert.equal(shouldFollowTrellisHeadRefresh("head", "head", null, 3), true);
});

test("old-owner cleanup cannot erase a newer mounted snapshot", () => {
  const active = { parentSessionId: "b", owner: 2, records: [], truncated: false, historyCoverage: "none" };
  const oldCleanup = { parentSessionId: null, owner: 1, records: [], truncated: false, historyCoverage: "none" };
  const activeCleanup = { ...oldCleanup, owner: 2 };
  assert.equal(shouldAcceptTrellisSnapshot(1, active), true);
  assert.equal(shouldAcceptTrellisSnapshot(2, oldCleanup), false);
  assert.equal(shouldAcceptTrellisSnapshot(2, activeCleanup), true);
});

test("markHistoryIncomplete records degraded coverage", () => {
  let store = createTrellisStore();
  store = reduceTrellisStore(store, { type: "markHistoryIncomplete" });
  assert.equal(selectTrellisRecords(store).historyCoverage, "incomplete");
});
