import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { isFilePathReferencedByEntries } = await jiti.import("./session-file-references-core.ts");
const { extractWrittenFilesFromEntries } = await jiti.import("./written-file-sources.ts");
const { subagentToolDetails } = await jiti.import("./subagent-extension.ts");
const filePath = "/outside-root/confirmed.md";
const entry = (toolName, details, isError = false) => ({ type: "message", message: { role: "toolResult", toolName, details, isError, content: [{ type: "text", text: "/outside-root/arbitrary.md" }] } });

test("only successful Trellis write evidence authorizes an outside-root artifact", () => {
  const details = { kind: "trellis-subagent-progress", runs: [{ tools: [{ name: "write", status: "succeeded", args: JSON.stringify({ path: filePath }) }] }] };
  assert.equal(isFilePathReferencedByEntries(filePath, [entry("trellis_subagent", details)]), true);
  assert.equal(isFilePathReferencedByEntries(filePath, [entry("remote_tool", details)]), false);
  assert.equal(isFilePathReferencedByEntries(filePath, [entry("trellis_subagent", details, true)]), false);
  assert.equal(isFilePathReferencedByEntries(filePath, [entry("trellis_subagent", { ...details, runs: [{ tools: [{ name: "write", status: "failed", args: JSON.stringify({ path: filePath }) }] }] })]), false);
  assert.equal(isFilePathReferencedByEntries("/outside-root/arbitrary.md", [entry("trellis_subagent", details)]), false);
});

test("confirmed apply_patch evidence authorizes artifacts but previews and arbitrary details do not", () => {
  const preview = { files: [{ filePath, added: 1, removed: 0 }] };
  assert.equal(isFilePathReferencedByEntries(filePath, [entry("apply_patch", { result: { summaries: [`add: ${filePath}`] }, preview })]), true);
  assert.equal(isFilePathReferencedByEntries(filePath, [entry("mcp__remote__apply_patch", { result: { summaries: [`add: ${filePath}`] }, preview })]), false);
  assert.equal(isFilePathReferencedByEntries(filePath, [entry("apply_patch", { preview })]), false);
  assert.equal(isFilePathReferencedByEntries(filePath, [entry("apply_patch", { result: { summaries: [`delete: ${filePath}`] }, preview })]), false);
  assert.equal(isFilePathReferencedByEntries(filePath, [entry("mcp__remote__read", { path: filePath })]), false);
});

function childCall(name, { details, text = "ok", isError = false, args = { input: "noop" } } = {}) {
  return [
    { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "c1", name, arguments: args }] } },
    { type: "message", message: { role: "toolResult", toolCallId: "c1", toolName: name, details, isError, content: [{ type: "text", text }] } },
  ];
}

function parentSnapshot(child) {
  const writtenFiles = extractWrittenFilesFromEntries(child, "/project", "snapshot");
  const details = subagentToolDetails({
    sessionId: "00000000-0000-4000-8000-000000000000", profile: "test", description: "test",
    status: "completed", runInBackground: false, createdAt: "2026-01-01T00:00:00.000Z", writtenFiles,
  });
  return { writtenFiles, parent: [entry("Agent", details)] };
}

for (const name of ["mcp__remote_apply_patch", "remote.apply_patch", "apply_patch_remote"]) {
  for (const shape of ["structured", "legacy-text"]) {
    test(`child→host snapshot→parent rejects ${name} ${shape} while render names stay broad`, () => {
      const child = childCall(name, shape === "structured"
        ? { details: { result: { summaries: [`add: ${filePath}`] } } }
        : { text: `add: ${filePath}` });
      assert.equal(extractWrittenFilesFromEntries(child, "/project").length, 1, "UI extraction is unchanged");
      assert.equal(isFilePathReferencedByEntries(filePath, child), false);
      const { writtenFiles, parent } = parentSnapshot(child);
      assert.deepEqual(writtenFiles, []);
      assert.equal(isFilePathReferencedByEntries(filePath, parent), false);
    });
  }
}

test("snapshot keeps exact patch success, legacy fallback, relative resolution and counts, never preview/failed artifacts", () => {
  const preview = { files: [{ filePath: "../confirmed.md", operation: "add", added: 3, removed: 1 }] };
  const child = childCall("apply_patch", { details: { result: { summaries: ["add: ../confirmed.md"] }, preview } });
  const { writtenFiles, parent } = parentSnapshot(child);
  assert.deepEqual(writtenFiles, [{ filePath: "/confirmed.md", operation: "add", added: 3, removed: 1, origin: "apply-patch-details" }]);
  assert.equal(isFilePathReferencedByEntries("/confirmed.md", parent), true);
  const legacy = parentSnapshot(childCall("apply_patch", { text: `add: ${filePath}` }));
  assert.equal(legacy.writtenFiles[0].filePath, filePath);
  assert.equal(isFilePathReferencedByEntries(filePath, legacy.parent), true);
  for (const result of [
    { details: { preview }, text: `add: ${filePath}` },
    { details: { result: { summaries: [], appliedFiles: [filePath] }, preview } },
    { details: { result: { summaries: [`add: ${filePath}`] } }, isError: true },
    { details: { result: { summaries: [`delete: ${filePath}`] } } },
    { text: `- ${filePath} (add): failed` },
  ]) {
    const snapshot = parentSnapshot(childCall("apply_patch", result));
    assert.deepEqual(snapshot.writtenFiles, []);
    assert.equal(isFilePathReferencedByEntries(filePath, snapshot.parent), false);
  }
});

test("exact Trellis/Agent snapshots retain successful evidence, reject failed traces and invalid envelopes", () => {
  for (const [name, details] of [
    ["trellis_subagent", { kind: "trellis-subagent-progress", runs: [{ tools: [
      { name: "write", status: "succeeded", args: JSON.stringify({ path: filePath }) },
      { name: "edit", status: "failed", args: JSON.stringify({ path: "/outside-root/failed.md" }) },
    ] }] }],
    ["Agent", { kind: "pi-web-subagent", sessionId: "00000000-0000-4000-8000-000000000001", writtenFiles: [{ filePath, added: 2, removed: 1 }] }],
  ]) {
    const snapshot = parentSnapshot(childCall(name, { details }));
    assert.equal(snapshot.writtenFiles[0].filePath, filePath);
    assert.equal(isFilePathReferencedByEntries(filePath, snapshot.parent), true);
    assert.equal(isFilePathReferencedByEntries("/outside-root/failed.md", snapshot.parent), false);
    assert.deepEqual(parentSnapshot(childCall(name, { details, isError: true })).writtenFiles, []);
    assert.deepEqual(parentSnapshot(childCall(name, { details: { ...details, kind: "spoof" } })).writtenFiles, []);
    assert.deepEqual(parentSnapshot(childCall(`remote.${name}`, { details })).writtenFiles, []);
  }
});

test("decorated write/edit snapshot paths come from model arguments, not remote result paths", () => {
  for (const name of ["remote.write", "mcp__write", "remote.edit", "mcp__edit"]) {
    const child = childCall(name, {
      args: { path: filePath }, text: "add: /outside-root/remote-only.md",
      details: { result: { summaries: ["add: /outside-root/remote-only.md"] }, patch: "@@ -1 +1 @@\n-old\n+new" },
    });
    const snapshot = parentSnapshot(child);
    assert.equal(isFilePathReferencedByEntries(filePath, child), true, "U intentionally permits model-issued arguments");
    assert.equal(isFilePathReferencedByEntries(filePath, snapshot.parent), true);
    assert.equal(isFilePathReferencedByEntries("/outside-root/remote-only.md", snapshot.parent), false);
    assert.equal(snapshot.writtenFiles[0].filePath, filePath);
    if (name.includes("edit")) assert.equal(snapshot.writtenFiles[0].added, 1);
    assert.deepEqual(parentSnapshot(childCall(name, { args: { path: filePath }, isError: true })).writtenFiles, []);
  }
});
