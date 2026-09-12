import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { TrellisSubagentRecords, RecordDetails } = await jiti.import("./TrellisSubagentRecords.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { projectTrellisSubagentRecords } = await jiti.import("@/lib/trellis-subagent-records");

function makeRecords(overrides = {}) {
  const projection = projectTrellisSubagentRecords({
    parentSessionId: "parent",
    toolCallId: "call",
    toolName: "trellis_subagent",
    evidence: "message",
    details: {
      kind: "trellis-subagent-progress",
      agent: "trellis-implement",
      mode: "parallel",
      startedAt: 1_000,
      updatedAt: 2_000,
      final: true,
      runs: [
        {
          id: "run-1",
          agent: "trellis-implement",
          prompt: "Implement the adapter",
          status: "succeeded",
          step: 1,
          finalText: "Result text",
          textTail: "tail",
          thinkingTail: "thought",
          stderrTail: "",
          tools: [{ id: "t1", name: "bash", args: "ls", status: "succeeded" }],
          usage: { input: 10, output: 20, cost: 0.1 },
        },
      ],
      ...overrides,
    },
  });
  return projection.records;
}

function renderDetails(record) {
  const t = (key, params) => {
    const messages = {
      "trellisSubagent.prompt": "Prompt",
      "trellisSubagent.finalResult": "Final result",
      "trellisSubagent.textTail": "Text tail",
      "trellisSubagent.thinkingTail": "Thinking tail",
      "trellisSubagent.stderrTail": "stderr tail",
      "trellisSubagent.tools": "Recent tools",
      "trellisSubagent.usage": "Usage",
      "trellisSubagent.error": "Error",
      "trellisSubagent.step": `Step ${params?.step}`,
      "trellisSubagent.updated": `Updated ${params?.time}`,
      "trellisSubagent.unavailable": "Unavailable",
      "trellisSubagent.snapshotNotice": "Execution snapshot — not a full conversation",
      "trellisSubagent.upstreamNotice": "Excerpts may already be truncated by the producer",
      "trellisSubagent.displayTruncated": "Further truncated by Pi Web display limits",
      "trellisSubagent.incomplete": "Some snapshot fields are unavailable",
      "trellisSubagent.provenance": "Source",
      "trellisSubagent.evidence.partial": "Live partial snapshot",
      "trellisSubagent.evidence.toolEnd": "Tool completion snapshot",
      "trellisSubagent.evidence.message": "Final message snapshot",
      "trellisSubagent.evidence.history": "Persisted session history",
      "trellisSubagent.stale": "Not backed by a persisted record",
      "trellisSubagent.omittedBudget": "Text omitted to stay within the display budget",
      "trellisSubagent.omittedTools": `${params?.count} older tools omitted`,
      "trellisSubagent.mode.single": "Single",
      "trellisSubagent.mode.parallel": "Parallel",
      "trellisSubagent.mode.chain": "Chain",
      "trellisSubagent.mode.unknown": "Unknown mode",
    };
    return messages[key] ?? key;
  };
  return renderToStaticMarkup(React.createElement(RecordDetails, { record, locale: "en", t }));
}

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(TrellisSubagentRecords, props)),
  );
}

test("renders nothing without records", () => {
  assert.equal(render({ records: [], truncated: false, historyCoverage: "none" }), "");
});

test("renders a bounded, read-only snapshot section with qualified statuses", () => {
  const html = render({ records: makeRecords(), truncated: true, historyCoverage: "incomplete" });
  assert.match(html, /Trellis executions/);
  assert.match(html, /1 records/);
  assert.match(html, /Last reported: Succeeded/);
  assert.match(html, /not a full conversation/i);
  assert.match(html, /older results may be missing/i);
  assert.match(html, /Some records omitted/);
  assert.match(html, /aria-expanded="false"/);
  // Read-only: the section has no session selection, URLs or control commands.
  assert.doesNotMatch(html, /onSelectSession/);
  assert.doesNotMatch(html, /href=/);
  assert.doesNotMatch(html, /<a\b/i);
});

test("escapes producer text instead of injecting markup", () => {
  const records = makeRecords();
  records[0] = { ...records[0], agent: '<img src=x onerror="alert(1)">', finalText: "<script>alert(2)</script>" };
  const html = render({ records, truncated: false, historyCoverage: "complete" });
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;img/);
});

test("labels unknown mode/status honestly and shows snapshot-only running", () => {
  const records = makeRecords({ mode: "broadcast", runs: [{ id: "r", agent: "agent", prompt: "", status: "running", textTail: "", thinkingTail: "", stderrTail: "", tools: [] }] });
  const section = render({ records, truncated: false, historyCoverage: "complete" });
  assert.match(section, /Last reported: Running/);
  // Running is never presented as live process state.
  assert.match(section, /not live process state/i);
  const details = renderDetails(records[0]);
  assert.match(details, /Unknown mode/);
});

test("marks stale and budget-omitted records explicitly", () => {
  const records = makeRecords();
  records[0] = { ...records[0], stale: true, omittedByBudget: true, finalText: "kept" };
  const html = renderDetails(records[0]);
  assert.match(html, /Not backed by a persisted record/);
  assert.match(html, /Text omitted to stay within the display budget/);
  assert.match(html, /Final result/);
  assert.match(html, /Recent tools/);
  assert.match(html, /Usage/);
});

test("distinguishes upstream excerpts from additional Pi Web truncation", () => {
  const records = makeRecords({
    runs: [{
      id: "r",
      agent: "agent",
      prompt: "",
      status: "succeeded",
      finalText: "f".repeat(16_384 + 5),
      textTail: "",
      thinkingTail: "",
      stderrTail: "",
      tools: [],
    }],
  });
  const html = renderDetails(records[0]);
  assert.match(html, /already be truncated by the producer/);
  assert.match(html, /Further truncated by Pi Web display limits/);
});

test("marks Pi Web label and tool-argument truncation", () => {
  const records = makeRecords({
    runs: [{
      id: "r",
      agent: "a".repeat(300),
      prompt: "prompt",
      status: "succeeded",
      finalText: "done",
      tools: [{ id: "tool", name: "bash", args: "x".repeat(3_000), status: "succeeded" }],
    }],
  });
  const html = renderDetails(records[0]);
  assert.match(html, /Further truncated by Pi Web display limits/);
});

test("missing final data is explicitly unavailable", () => {
  const records = makeRecords({
    runs: [{ id: "r", agent: "agent", prompt: "", status: "unknown", tools: [] }],
  });
  const html = renderDetails(records[0]);
  assert.match(html, /Final result/);
  assert.match(html, /Unavailable/);
});
