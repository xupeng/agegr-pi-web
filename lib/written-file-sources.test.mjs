import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  parseApplyPatchDetails,
  parseApplyPatchSummaryText,
  parseEditDiffCounts,
  extractTrellisWrittenFiles,
  extractSubagentSnapshotWrittenFiles,
  extractRawWrittenFiles,
  extractWrittenFilesFromEntries,
  resolveAndMergeWrittenFiles,
} = await jiti.import("./written-file-sources.ts");

// ── apply_patch details ────────────────────────────────────────────────

test("reads apply_patch files from preview + result and drops deletes", () => {
  const details = {
    preview: {
      files: [
        { filePath: "/repo/prd.md", operation: "update", diff: "", added: 81, removed: 10 },
        { filePath: "/repo/design.md", operation: "add", diff: "", added: 18, removed: 0 },
      ],
      added: 99,
      removed: 10,
    },
    result: {
      summaries: ["update: /repo/prd.md", "add: /repo/design.md"],
      appliedFiles: ["/repo/prd.md", "/repo/design.md"],
      failures: [],
      hasPartialSuccess: false,
    },
  };

  assert.deepEqual(parseApplyPatchDetails(details), [
    { filePath: "/repo/prd.md", operation: "update", added: 81, removed: 10, origin: "apply-patch-details" },
    { filePath: "/repo/design.md", operation: "add", added: 18, removed: 0, origin: "apply-patch-details" },
  ]);
});

test("excludes delete entries from a delete-only patch", () => {
  const details = {
    preview: { files: [{ filePath: "gone.md", operation: "delete", diff: "", added: 0, removed: 4 }] },
    result: { summaries: ["delete: gone.md"], appliedFiles: ["gone.md"], failures: [], hasPartialSuccess: false },
  };

  assert.deepEqual(parseApplyPatchDetails(details), []);
});

test("move uses the destination path", () => {
  const details = {
    preview: {
      files: [{ filePath: "old.ts", movePath: "new.ts", operation: "update", diff: "", added: 1, removed: 0 }],
    },
    result: {
      summaries: ["move: old.ts -> new.ts"],
      appliedFiles: ["new.ts"],
      failures: [],
      hasPartialSuccess: false,
    },
  };

  assert.deepEqual(parseApplyPatchDetails(details), [
    { filePath: "new.ts", operation: "move", added: 1, removed: 0, origin: "apply-patch-details" },
  ]);
});

test("partial failure lists only the applied files from result summaries", () => {
  // Real sample shape: `details` has no preview when the failing hunk could not
  // be previewed; summaries/appliedFiles carry the two files that landed.
  const details = {
    result: {
      summaries: ["add: lib/ask-user/resolve-pending-ask.ts", "update: hooks/useAgentSession.pending-ask.test.mjs"],
      appliedFiles: [
        "lib/ask-user/resolve-pending-ask.ts",
        "hooks/useAgentSession.pending-ask.test.mjs",
      ],
      failures: [{ filePath: "hooks/useAgentSession.ts", operation: "update", message: "context mismatch" }],
      hasPartialSuccess: true,
    },
  };

  assert.deepEqual(parseApplyPatchDetails(details), [
    { filePath: "lib/ask-user/resolve-pending-ask.ts", operation: "add", origin: "apply-patch-details" },
    { filePath: "hooks/useAgentSession.pending-ask.test.mjs", operation: "update", origin: "apply-patch-details" },
  ]);
});

test("a stale preview cannot resurrect a file whose hunk failed", () => {
  // The extension builds `preview` from the parsed patch, so on a partial
  // failure it can still list the failed hunk. `result` is authoritative.
  const details = {
    preview: {
      files: [
        { filePath: "a.md", operation: "update", diff: "", added: 1, removed: 1 },
        { filePath: "failed.md", operation: "update", diff: "", added: 9, removed: 9 },
      ],
    },
    result: {
      summaries: ["update: a.md"],
      appliedFiles: ["a.md"],
      failures: [{ filePath: "failed.md", operation: "update", message: "nope" }],
      hasPartialSuccess: true,
    },
  };

  assert.deepEqual(parseApplyPatchDetails(details), [
    { filePath: "a.md", operation: "update", added: 1, removed: 1, origin: "apply-patch-details" },
  ]);
});

test("returns null when there is no usable structured evidence", () => {
  assert.equal(parseApplyPatchDetails(undefined), null);
  assert.equal(parseApplyPatchDetails(null), null);
  assert.equal(parseApplyPatchDetails("text"), null);
  assert.equal(parseApplyPatchDetails({}), null);
  assert.equal(parseApplyPatchDetails({ progress: { applied: 1, failed: 0, total: 1 } }), null);
});

// ── apply_patch summary text fallback ──────────────────────────────────

test("parses add/update/move summary lines and skips delete and failure lines", () => {
  const text = [
    "add: .trellis/tasks/x/prd.md",
    "update: src/app.ts",
    "delete: old.md",
    "move: src/a.ts -> src/b.ts",
    "- /repo/hooks/useAgentSession.ts (update): Failed to find expected lines",
    "Recovery: MUST read /repo/hooks/useAgentSession.ts before retrying.",
  ].join("\n");

  assert.deepEqual(parseApplyPatchSummaryText(text), [
    { filePath: ".trellis/tasks/x/prd.md", operation: "add", origin: "apply-patch-text" },
    { filePath: "src/app.ts", operation: "update", origin: "apply-patch-text" },
    { filePath: "src/b.ts", operation: "move", origin: "apply-patch-text" },
  ]);
});

test("falls back to summary text only when details are absent", () => {
  const text = "add: /repo/new.md\nupdate: /repo/edit.md";
  assert.deepEqual(
    extractRawWrittenFiles("apply_patch", { input: "*** Begin Patch..." }, { text }),
    [
      { filePath: "/repo/new.md", operation: "add", origin: "apply-patch-text" },
      { filePath: "/repo/edit.md", operation: "update", origin: "apply-patch-text" },
    ],
  );

  // details present → text is ignored
  assert.deepEqual(
    extractRawWrittenFiles(
      "apply_patch",
      { input: "..." },
      { text: "update: /repo/wrong.md", details: { result: { summaries: ["update: /repo/right.md"], appliedFiles: [] } } },
    ),
    [{ filePath: "/repo/right.md", operation: "update", origin: "apply-patch-details" }],
  );
});

test("an errored apply_patch call contributes nothing", () => {
  assert.deepEqual(
    extractRawWrittenFiles(
      "apply_patch",
      { input: "*** Add File: x" },
      { isError: true, text: "Invalid patch format: Add File lines must start with '+'" },
    ),
    [],
  );
});

// ── edit counts ────────────────────────────────────────────────────────

test("counts edit patch lines inside hunks only", () => {
  const patch = [
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,3 +1,4 @@",
    " line1",
    "+added1",
    "+added2",
    "-removed1",
    " line2",
  ].join("\n");

  assert.deepEqual(parseEditDiffCounts({ patch }), { added: 2, removed: 1 });
  assert.deepEqual(
    extractRawWrittenFiles("edit", { path: "src/a.ts" }, { details: { patch } }),
    [{ filePath: "src/a.ts", operation: "edit", added: 2, removed: 1, origin: "tool-input" }],
  );
  assert.equal(parseEditDiffCounts({}), null);
});

// ── trellis traces ─────────────────────────────────────────────────────

function trellisDetails(toolCount) {
  const tools = [];
  for (let index = 0; index < toolCount; index += 1) {
    tools.push({
      id: `t${index}`,
      name: index % 5 === 0 ? "edit" : "write",
      args: JSON.stringify({ path: `src/f${index}.ts` }),
      status: "succeeded",
    });
  }
  return {
    kind: "trellis-subagent-progress",
    agent: "trellis-implement",
    mode: "single",
    final: true,
    runs: [{ id: "run-1", status: "succeeded", tools }],
  };
}

test("keeps every Trellis write path beyond the 32-trace display cap", () => {
  const details = trellisDetails(40);
  const files = extractTrellisWrittenFiles(details);
  assert.equal(files.length, 40);
  assert.equal(files[0].filePath, "src/f0.ts");
  assert.equal(files[0].operation, "edit");
  assert.equal(files[39].filePath, "src/f39.ts");
  assert.equal(files[39].origin, "subagent-trellis");
});

test("skips non-succeeded traces and malformed args", () => {
  const details = {
    kind: "trellis-subagent-progress",
    runs: [{
      id: "run-1",
      tools: [
        { id: "1", name: "write", args: JSON.stringify({ path: "ok.ts" }), status: "succeeded" },
        { id: "2", name: "write", args: JSON.stringify({ path: "running.ts" }), status: "running" },
        { id: "3", name: "write", args: JSON.stringify({ path: "failed.ts" }), status: "failed" },
        { id: "4", name: "write", args: "{not json", status: "succeeded" },
        { id: "5", name: "read", args: JSON.stringify({ path: "read.ts" }), status: "succeeded" },
        { id: "6", name: "write", args: JSON.stringify({ file_path: "snake.ts" }), status: "succeeded" },
      ],
    }],
  };

  assert.deepEqual(extractTrellisWrittenFiles(details), [
    { filePath: "ok.ts", operation: "write", origin: "subagent-trellis" },
    { filePath: "snake.ts", operation: "write", origin: "subagent-trellis" },
  ]);
});

test("ignores non-trellis details", () => {
  assert.deepEqual(extractTrellisWrittenFiles({ kind: "pi-web-subagent", runs: [] }), []);
  assert.deepEqual(extractTrellisWrittenFiles(null), []);
});

// ── built-in Agent snapshot ────────────────────────────────────────────

test("reads the built-in Agent completion snapshot", () => {
  const details = {
    kind: "pi-web-subagent",
    sessionId: "child",
    writtenFiles: [
      { filePath: "/repo/a.ts", operation: "edit", added: 3, removed: 1 },
      { filePath: "/repo/b.ts", operation: "write" },
      { filePath: 42 },
      { operation: "edit" },
    ],
  };

  assert.deepEqual(extractSubagentSnapshotWrittenFiles(details), [
    { filePath: "/repo/a.ts", operation: "edit", added: 3, removed: 1, sourceSessionId: "child", origin: "subagent-snapshot" },
    { filePath: "/repo/b.ts", operation: "write", sourceSessionId: "child", origin: "subagent-snapshot" },
  ]);
});

test("a snapshot without a session id keeps the source undefined", () => {
  const details = {
    kind: "pi-web-subagent",
    writtenFiles: [{ filePath: "/repo/a.ts", operation: "write" }],
  };

  assert.deepEqual(extractSubagentSnapshotWrittenFiles(details), [
    { filePath: "/repo/a.ts", operation: "write", origin: "subagent-snapshot" },
  ]);
});

test("a snapshot without the pi-web kind is ignored", () => {
  assert.deepEqual(extractSubagentSnapshotWrittenFiles({ writtenFiles: [{ filePath: "/a" }] }), []);
});

// ── session entries (server snapshot path) ─────────────────────────────

function assistantEntry(id, blocks) {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    message: { role: "assistant", content: blocks, model: "m", provider: "p" },
  };
}

function toolResultEntry(id, toolCallId, options = {}) {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: "2026-01-01T00:00:01.000Z",
    message: {
      role: "toolResult",
      toolCallId,
      content: [{ type: "text", text: options.text ?? "ok" }],
      ...(options.isError ? { isError: true } : {}),
      ...(options.details !== undefined ? { details: options.details } : {}),
    },
  };
}

test("extractWrittenFilesFromEntries pairs raw tool calls with their results", () => {
  const entries = [
    assistantEntry("a1", [
      { type: "toolCall", id: "tc1", name: "write", arguments: { path: "src/a.ts" } },
      { type: "toolCall", id: "tc2", name: "apply_patch", arguments: { input: "*** Begin Patch" } },
    ]),
    toolResultEntry("r1", "tc1"),
    toolResultEntry("r2", "tc2", {
      text: "add: src/b.md\nupdate: src/c.md",
      details: {
        result: {
          summaries: ["add: src/b.md", "update: src/c.md"],
          appliedFiles: ["src/b.md", "src/c.md"],
          failures: [],
        },
      },
    }),
  ];

  assert.deepEqual(
    extractWrittenFilesFromEntries(entries, "/repo"),
    [
      { filePath: "/repo/src/a.ts", operation: "write", origin: "tool-input" },
      { filePath: "/repo/src/b.md", operation: "add", origin: "apply-patch-details" },
      { filePath: "/repo/src/c.md", operation: "update", origin: "apply-patch-details" },
    ],
  );
});

test("extractWrittenFilesFromEntries reads all Trellis traces for a child session", () => {
  const entries = [
    assistantEntry("a1", [
      { type: "toolCall", id: "tc1", name: "trellis_subagent", arguments: { prompt: "run" } },
    ]),
    toolResultEntry("r1", "tc1", { details: trellisDetails(40) }),
  ];

  const files = extractWrittenFilesFromEntries(entries, "/repo");
  assert.equal(files.length, 40);
  assert.equal(files[0].filePath, "/repo/src/f0.ts");
});

test("extractWrittenFilesFromEntries skips errored results", () => {
  const entries = [
    assistantEntry("a1", [{ type: "toolCall", id: "tc1", name: "write", arguments: { path: "x.ts" } }]),
    toolResultEntry("r1", "tc1", { isError: true }),
  ];
  assert.deepEqual(extractWrittenFilesFromEntries(entries, "/repo"), []);
});

// ── resolution / dedupe ────────────────────────────────────────────────

test("resolves relative paths and dedupes keeping first-seen order", () => {
  const merged = resolveAndMergeWrittenFiles(
    [
      { filePath: "src/a.ts", operation: "write", origin: "tool-input" },
      { filePath: "src/b.ts", operation: "add", origin: "apply-patch-details" },
      { filePath: "src/a.ts", operation: "edit", added: 2, removed: 1, origin: "tool-input" },
    ],
    "/repo",
  );

  assert.deepEqual(merged, [
    { filePath: "/repo/src/a.ts", operation: "write", added: 2, removed: 1, origin: "tool-input" },
    { filePath: "/repo/src/b.ts", operation: "add", origin: "apply-patch-details" },
  ]);
});

test("drops relative paths when there is no cwd", () => {
  assert.deepEqual(
    resolveAndMergeWrittenFiles([{ filePath: "src/a.ts", origin: "tool-input" }], undefined),
    [],
  );
});

test("backfills a source session id from a later duplicate without reordering", () => {
  const merged = resolveAndMergeWrittenFiles(
    [
      { filePath: "src/a.ts", operation: "write", origin: "apply-patch-details" },
      { filePath: "src/b.ts", operation: "write", origin: "tool-input" },
      { filePath: "src/a.ts", sourceSessionId: "child", origin: "subagent-snapshot" },
    ],
    "/repo",
  );

  assert.deepEqual(merged, [
    { filePath: "/repo/src/a.ts", operation: "write", sourceSessionId: "child", origin: "apply-patch-details" },
    { filePath: "/repo/src/b.ts", operation: "write", origin: "tool-input" },
  ]);
});

test("keeps the first source session id when duplicates disagree", () => {
  const merged = resolveAndMergeWrittenFiles(
    [
      { filePath: "src/a.ts", sourceSessionId: "first", origin: "subagent-snapshot" },
      { filePath: "src/a.ts", sourceSessionId: "second", origin: "subagent-snapshot" },
    ],
    "/repo",
  );

  assert.deepEqual(merged, [
    { filePath: "/repo/src/a.ts", sourceSessionId: "first", origin: "subagent-snapshot" },
  ]);
});
