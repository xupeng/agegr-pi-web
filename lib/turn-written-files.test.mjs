import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { extractTurnWrittenFiles } = await jiti.import("./turn-written-files.ts");

function toolCall(toolCallId, toolName, input) {
  return { type: "toolCall", toolCallId, toolName, input };
}

function okResult(toolCallId) {
  return { role: "toolResult", toolCallId, content: [{ type: "text", text: "ok" }] };
}

function errorResult(toolCallId) {
  return { role: "toolResult", toolCallId, content: [{ type: "text", text: "boom" }], isError: true };
}

function results(...entries) {
  return new Map(entries.map((r) => [r.toolCallId, r]));
}

function paths(content, toolResults, cwd) {
  return extractTurnWrittenFiles(content, toolResults, cwd).map((f) => f.filePath);
}

test("extracts a file from a successful write tool call", () => {
  const content = [toolCall("1", "write", { file_path: "/abs/out/report.html" })];
  assert.deepEqual(paths(content, results(okResult("1"))), ["/abs/out/report.html"]);
});

test("extracts a file from a successful edit tool call using input.path", () => {
  const content = [toolCall("1", "edit", { path: "/abs/src/a.ts" })];
  assert.deepEqual(paths(content, results(okResult("1"))), ["/abs/src/a.ts"]);
});

test("accepts namespaced write/edit tool names from MCP servers", () => {
  const content = [
    toolCall("1", "write_file", { file_path: "/abs/a.txt" }),
    toolCall("2", "fs.edit", { file_path: "/abs/b.txt" }),
    toolCall("3", "str_replace_editor", { file_path: "/abs/c.txt" }),
  ];
  assert.deepEqual(
    paths(content, results(okResult("1"), okResult("2"), okResult("3"))),
    ["/abs/a.txt", "/abs/b.txt", "/abs/c.txt"],
  );
});

test("skips a tool call whose result errored", () => {
  const content = [toolCall("1", "write", { file_path: "/abs/out/report.html" })];
  assert.deepEqual(paths(content, results(errorResult("1"))), []);
});

test("skips a tool call whose result has not arrived (streaming)", () => {
  const content = [toolCall("1", "write", { file_path: "/abs/out/report.html" })];
  assert.deepEqual(paths(content, results()), []);
  assert.deepEqual(paths(content, undefined), []);
});

test("deduplicates the same file written then edited", () => {
  const content = [
    toolCall("1", "write", { file_path: "/abs/out/report.html" }),
    toolCall("2", "edit", { path: "/abs/out/report.html" }),
  ];
  assert.deepEqual(paths(content, results(okResult("1"), okResult("2"))), ["/abs/out/report.html"]);
});

test("resolves a relative path against cwd", () => {
  const content = [toolCall("1", "write", { file_path: "out/report.html" })];
  assert.deepEqual(paths(content, results(okResult("1")), "/abs"), ["/abs/out/report.html"]);
});

test("resolves extensionless and dot-prefixed filenames against cwd", () => {
  const content = [
    toolCall("1", "write", { path: "LICENSE" }),
    toolCall("2", "write", { path: ".env" }),
  ];
  assert.deepEqual(
    paths(content, results(okResult("1"), okResult("2")), "/repo"),
    ["/repo/LICENSE", "/repo/.env"],
  );
});

test("preserves path characters that have special meaning in hrefs", () => {
  const content = [
    toolCall("1", "write", { path: "release#1.md" }),
    toolCall("2", "write", { path: "query?.json" }),
    toolCall("3", "write", { path: "report.md:42" }),
  ];
  assert.deepEqual(
    paths(content, results(okResult("1"), okResult("2"), okResult("3")), "/repo"),
    ["/repo/release#1.md", "/repo/query?.json", "/repo/report.md:42"],
  );
});

test("normalizes Windows-relative tool paths against a Windows cwd", () => {
  const content = [toolCall("1", "write", { path: "src\\report.html" })];
  assert.deepEqual(
    paths(content, results(okResult("1")), "C:\\repo"),
    ["C:/repo/src/report.html"],
  );
});

test("skips non-writing tools like read and bash", () => {
  const content = [
    toolCall("1", "read", { file_path: "/abs/a.ts" }),
    toolCall("2", "bash", { command: "echo hi > /abs/a.txt" }),
  ];
  assert.deepEqual(paths(content, results(okResult("1"), okResult("2"))), []);
});

test("ignores paths that only appear in the reply text", () => {
  // A path the assistant merely writes in prose is not evidence of a write.
  const content = [
    { type: "text", text: "I saved the report to /abs/out/report.html for you." },
  ];
  assert.deepEqual(paths(content, results()), []);
});

test("lists only the file actually written, not others named in the text", () => {
  const content = [
    toolCall("1", "write", { file_path: "/abs/out/real.html" }),
    { type: "text", text: "See also /abs/out/imagined.html and /etc/passwd" },
  ];
  assert.deepEqual(paths(content, results(okResult("1"))), ["/abs/out/real.html"]);
});

test("skips a write call missing both file_path and path", () => {
  const content = [toolCall("1", "write", { content: "hi" })];
  assert.deepEqual(paths(content, results(okResult("1"))), []);
});

test("returns an empty array for an empty or text-only turn", () => {
  assert.deepEqual(paths([], results()), []);
  assert.deepEqual(paths([{ type: "text", text: "hi" }], results()), []);
});

// ── apply_patch (external pi-apply-patch extension) ────────────────────

function resultWithDetails(toolCallId, details, text = "ok", extra = {}) {
  return {
    role: "toolResult",
    toolCallId,
    content: [{ type: "text", text }],
    details,
    ...extra,
  };
}

test("lists every file one apply_patch call wrote", () => {
  const content = [toolCall("1", "apply_patch", { input: "*** Begin Patch\n..." })];
  const result = resultWithDetails("1", {
    preview: {
      files: [
        { filePath: "src/a.ts", operation: "update", added: 10, removed: 2 },
        { filePath: "src/b.ts", operation: "add", added: 5, removed: 0 },
      ],
    },
    result: {
      summaries: ["update: src/a.ts", "add: src/b.ts"],
      appliedFiles: ["src/a.ts", "src/b.ts"],
      failures: [],
    },
  });

  const written = extractTurnWrittenFiles(content, results(result), "/repo");
  assert.deepEqual(written.map((file) => file.filePath), ["/repo/src/a.ts", "/repo/src/b.ts"]);
  assert.deepEqual(written.map((file) => file.added), [10, 5]);
});

test("excludes apply_patch deletes and resolves relative paths", () => {
  const content = [toolCall("1", "apply_patch", { input: "..." })];
  const result = resultWithDetails("1", {
    result: {
      summaries: ["delete: old.md", "add: .trellis/tasks/x/prd.md"],
      appliedFiles: ["old.md", ".trellis/tasks/x/prd.md"],
      failures: [],
    },
  });

  assert.deepEqual(
    paths(content, results(result), "/repo"),
    ["/repo/.trellis/tasks/x/prd.md"],
  );
});

test("lists only applied files when apply_patch partially failed", () => {
  const content = [toolCall("1", "apply_patch", { input: "..." })];
  const result = resultWithDetails("1", {
    result: {
      summaries: ["add: lib/ok.ts"],
      appliedFiles: ["lib/ok.ts"],
      failures: [{ filePath: "lib/failed.ts", operation: "update", message: "context mismatch" }],
      hasPartialSuccess: true,
    },
  }, "apply_patch partially failed.\nFailed:\n- lib/failed.ts (update): context mismatch");

  assert.deepEqual(paths(content, results(result), "/repo"), ["/repo/lib/ok.ts"]);
});

test("contributes nothing when apply_patch failed to parse the patch", () => {
  const content = [toolCall("1", "apply_patch", { input: "*** Add File: x" })];
  const result = resultWithDetails(
    "1",
    undefined,
    "Invalid patch format: Add File lines must start with '+'",
    { isError: true },
  );
  assert.deepEqual(paths(content, results(result), "/repo"), []);
});

test("falls back to apply_patch summary text when details are missing", () => {
  const content = [toolCall("1", "apply_patch", { input: "..." })];
  const result = resultWithDetails("1", undefined, "update: src/a.ts\nadd: src/b.ts");
  assert.deepEqual(paths(content, results(result), "/repo"), ["/repo/src/a.ts", "/repo/src/b.ts"]);
});

// ── subagents ──────────────────────────────────────────────────────────

function trellisDetails(toolCount) {
  const tools = [];
  for (let index = 0; index < toolCount; index += 1) {
    tools.push({
      id: `t${index}`,
      name: "write",
      args: JSON.stringify({ path: `src/f${index}.ts` }),
      status: "succeeded",
    });
  }
  return { kind: "trellis-subagent-progress", agent: "trellis-implement", mode: "single", runs: [{ id: "run-1", status: "succeeded", tools }] };
}

test("lists files written by trellis_subagent without the 32-trace cap", () => {
  const content = [toolCall("1", "trellis_subagent", { prompt: "implement" })];
  const result = resultWithDetails("1", trellisDetails(40), "done");
  const written = extractTurnWrittenFiles(content, results(result), "/repo");
  assert.equal(written.length, 40);
  assert.equal(written[0].filePath, "/repo/src/f0.ts");
  assert.equal(written[39].filePath, "/repo/src/f39.ts");
});

test("lists files from the built-in Agent completion snapshot", () => {
  const content = [toolCall("1", "Agent", { prompt: "do work" })];
  const result = resultWithDetails("1", {
    kind: "pi-web-subagent",
    sessionId: "child",
    writtenFiles: [{ filePath: "/repo/a.ts", operation: "edit" }],
  }, "done");
  assert.deepEqual(paths(content, results(result), "/repo"), ["/repo/a.ts"]);
});

test("ignores an Agent-shaped tool without the pi-web snapshot kind", () => {
  const content = [toolCall("1", "Agent", { prompt: "do work" })];
  const result = resultWithDetails("1", { writtenFiles: [{ filePath: "/repo/a.ts" }] }, "done");
  assert.deepEqual(paths(content, results(result), "/repo"), []);
});

test("tags built-in Agent snapshot files with the child session id", () => {
  const content = [toolCall("1", "Agent", { prompt: "do work" })];
  const result = resultWithDetails("1", {
    kind: "pi-web-subagent",
    sessionId: "child",
    writtenFiles: [{ filePath: "/repo/a.ts", operation: "edit" }],
  }, "done");
  const written = extractTurnWrittenFiles(content, results(result), "/repo");
  assert.deepEqual(written, [
    { filePath: "/repo/a.ts", operation: "edit", sourceSessionId: "child", origin: "subagent-snapshot" },
  ]);
});

test("backfills a source session id when the same path was written earlier without one", () => {
  const content = [
    toolCall("1", "write", { file_path: "/repo/a.ts" }),
    toolCall("2", "Agent", { prompt: "do work" }),
  ];
  const result = results(
    okResult("1"),
    resultWithDetails("2", {
      kind: "pi-web-subagent",
      sessionId: "child",
      writtenFiles: [{ filePath: "/repo/a.ts", operation: "edit" }],
    }, "done"),
  );
  const written = extractTurnWrittenFiles(content, result, "/repo");
  assert.equal(written.length, 1);
  assert.equal(written[0].filePath, "/repo/a.ts");
  assert.equal(written[0].sourceSessionId, "child");
});

test("trellis_subagent entries never carry a source session id", () => {
  const content = [toolCall("1", "trellis_subagent", { prompt: "implement" })];
  const result = resultWithDetails("1", trellisDetails(2), "done");
  const written = extractTurnWrittenFiles(content, results(result), "/repo");
  assert.equal(written.length, 2);
  assert.equal(written[0].sourceSessionId, undefined);
});

function applyPatchCall(toolCallId, input) {
  return toolCall(toolCallId, "apply_patch", { input });
}

function applyPatchResult(toolCallId, details, text = "ok") {
  return { role: "toolResult", toolCallId, content: [{ type: "text", text }], details };
}

const MULTI_FILE_PATCH = [
  "*** Begin Patch",
  "*** Add File: src/a.ts",
  "+hello",
  "*** Update File: old.ts",
  "*** Move to: renamed.ts",
  "-x",
  "+y",
  "*** Delete File: gone.ts",
  "*** End Patch",
].join("\n");

test("apply_patch uses appliedFiles and drops deletes", () => {
  const content = [applyPatchCall("1", MULTI_FILE_PATCH)];
  const result = applyPatchResult("1", {
    result: { appliedFiles: ["src/a.ts", "renamed.ts", "gone.ts"], failures: [] },
    preview: {
      files: [
        { filePath: "src/a.ts", operation: "add", diff: "+  1 hello" },
        { filePath: "old.ts", movePath: "renamed.ts", operation: "update", diff: "+  1 y" },
        { filePath: "gone.ts", operation: "delete", diff: "-  1 bye" },
      ],
    },
  });
  assert.deepEqual(paths(content, results(result), "/repo"), ["/repo/src/a.ts", "/repo/renamed.ts"]);
});

test("apply_patch returned failures write nothing unless some files applied", () => {
  const content = [applyPatchCall("1", MULTI_FILE_PATCH)];
  const failed = applyPatchResult("1", {
    result: { appliedFiles: [], failures: [{ filePath: "src/a.ts", message: "boom" }] },
  }, "apply_patch failed.");
  assert.deepEqual(paths(content, results(failed), "/repo"), []);

  const partial = applyPatchResult("1", {
    result: { appliedFiles: ["src/a.ts"], failures: [{ filePath: "old.ts", message: "miss" }] },
    preview: { files: [{ filePath: "src/a.ts", operation: "add", diff: "+  1 hello" }] },
  }, "apply_patch partially failed.");
  assert.deepEqual(paths(content, results(partial), "/repo"), ["/repo/src/a.ts"]);
});

test("apply_patch preview-only details write nothing without a confirming result", () => {
  // `preview` is built from the *parsed* patch, so on a partial failure it can
  // still name files whose hunk never landed. Without `details.result` there is
  // no proof anything was written, so the stricter fork rule wins over listing
  // preview paths (kept in step with written-file-sources.check.test.mjs).
  const content = [applyPatchCall("1", MULTI_FILE_PATCH)];
  const previewOnly = applyPatchResult("1", {
    preview: {
      files: [
        { filePath: "src/a.ts", operation: "add", diff: "+  1 hello" },
        { filePath: "gone.ts", operation: "delete", diff: "-  1 bye" },
      ],
    },
  });
  assert.deepEqual(paths(content, results(previewOnly), "/repo"), []);
});
