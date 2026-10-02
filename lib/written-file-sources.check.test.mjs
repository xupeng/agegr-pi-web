import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { extractRawWrittenFiles, isTrustedWrittenFileResultToolName, parseApplyPatchDetails, parseEditDiffCounts } = await jiti.import("./written-file-sources.ts");

test("preview-only and malformed details cannot establish successful writes", () => {
  for (const details of [{}, { preview: { files: [{ filePath: "failed.md", operation: "add" }] } }]) {
    assert.deepEqual(extractRawWrittenFiles("apply_patch", {}, { details, text: "add: failed.md" }), []);
  }
});

test("empty summaries are authoritative and applied fallback excludes known deletions", () => {
  assert.deepEqual(parseApplyPatchDetails({ result: { summaries: [], appliedFiles: ["gone.md"] } }), []);
  assert.deepEqual(parseApplyPatchDetails({
    result: { appliedFiles: ["gone.md", "kept.md"] },
    preview: { files: [{ filePath: "gone.md", operation: "delete" }] },
  }), [{ filePath: "kept.md", origin: "apply-patch-details" }]);
});

test("later delete or move in one patch removes earlier artifact paths", () => {
  const summaries = ["add: gone.md", "delete: gone.md", "update: old.md", "move: old.md -> new.md"];
  for (const result of [{ text: summaries.join("\n") }, { details: { result: { summaries } } }]) {
    assert.deepEqual(extractRawWrittenFiles("apply_patch", {}, result).map((file) => file.filePath), ["new.md"]);
  }
});

test("unrecognized edit diff formats do not fabricate zero counts", () => {
  assert.equal(parseEditDiffCounts({ diff: "+1 added\n-1 removed" }), null);
  assert.equal(parseEditDiffCounts({ patch: "not a unified patch" }), null);
});

test("snapshot and authorization share exact result names without tightening render predicates", () => {
  for (const name of ["apply_patch", "trellis_subagent", "Agent"]) {
    assert.equal(isTrustedWrittenFileResultToolName(name), true);
  }
  for (const name of ["remote.apply_patch", "apply_patch_remote", "APPLY_PATCH", "remote.trellis_subagent", "remote.Agent"]) {
    assert.equal(isTrustedWrittenFileResultToolName(name), false);
    const result = { details: { result: { summaries: ["add: untrusted.md"] } } };
    assert.deepEqual(extractRawWrittenFiles(name, {}, result, "snapshot"), []);
  }
  const result = { details: { result: { summaries: ["add: confirmed.md"] } } };
  assert.equal(extractRawWrittenFiles("apply_patch", {}, result, "snapshot")[0].filePath, "confirmed.md");
  assert.equal(extractRawWrittenFiles("APPLY_PATCH", {}, result)[0].filePath, "confirmed.md");
});
