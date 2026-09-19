import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { extractRawWrittenFiles, parseApplyPatchDetails, parseEditDiffCounts } = await jiti.import("./written-file-sources.ts");

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
