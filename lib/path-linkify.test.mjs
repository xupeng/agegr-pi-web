import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { buildFileIndexLookup, linkifyToken, linkifyPlainText } = await jiti.import("./path-linkify.ts");

function lookup(files, cwd = "/repo", truncated = false) {
  return buildFileIndexLookup(files, cwd, truncated);
}

const context = (index) => ({ lookup: index });

test("handles bare filenames with line suffixes and filesystem-root cwd", () => {
  assert.equal(linkifyToken("prd.md:12:3", context(lookup(["task/prd.md"])))?.filePath, "/repo/task/prd.md");
  assert.equal(linkifyToken("src/a.ts", context(lookup(["src/a.ts"], "/")))?.filePath, "/src/a.ts");
});

test("case-folds normalized UNC roots as well as their relative paths", () => {
  const index = lookup(["src/a.ts"], "//Server/Share/repo");
  assert.equal(linkifyToken("//server/share/REPO/SRC/A.TS", context(index))?.relativePath, "SRC/A.TS");
});

test("resolves absolute and relative paths that exist in the index", () => {
  const index = lookup(["src/a.ts", ".trellis/tasks/x/prd.md"]);
  assert.deepEqual(linkifyToken("src/a.ts", context(index)), {
    filePath: "/repo/src/a.ts",
    relativePath: "src/a.ts",
  });
  assert.deepEqual(linkifyToken("/repo/.trellis/tasks/x/prd.md", context(index)), {
    filePath: "/repo/.trellis/tasks/x/prd.md",
    relativePath: ".trellis/tasks/x/prd.md",
  });
});

test("strips a :line / :line:col suffix before the lookup", () => {
  const index = lookup(["src/a.ts"]);
  assert.equal(linkifyToken("src/a.ts:42", context(index))?.relativePath, "src/a.ts");
  assert.equal(linkifyToken("src/a.ts:42:7", context(index))?.relativePath, "src/a.ts");
  assert.equal(linkifyToken("/repo/src/a.ts:10", context(index))?.filePath, "/repo/src/a.ts");
});

test("completes a unique bare basename but not an ambiguous one", () => {
  const unique = lookup(["src/a.ts", ".trellis/tasks/x/prd.md"]);
  assert.deepEqual(linkifyToken("prd.md", context(unique)), {
    filePath: "/repo/.trellis/tasks/x/prd.md",
    relativePath: ".trellis/tasks/x/prd.md",
  });

  const ambiguous = lookup(["a/prd.md", "b/prd.md"]);
  assert.equal(linkifyToken("prd.md", context(ambiguous)), null);
});

test("disables unique-basename completion when the index was truncated", () => {
  const index = lookup(["src/prd.md"], "/repo", true);
  assert.equal(linkifyToken("prd.md", context(index)), null);
  // Exact hits still work on a truncated index.
  assert.equal(linkifyToken("src/prd.md", context(index))?.relativePath, "src/prd.md");
});

test("never links anything without an index", () => {
  assert.equal(linkifyToken("src/a.ts", { lookup: null }), null);
  assert.deepEqual(linkifyPlainText("see src/a.ts", { lookup: null }), [{ text: "see src/a.ts" }]);
});

test("rejects URLs, schemes, anchors and non-file dotted tokens", () => {
  const index = lookup(["src/a.ts", "import.meta"]);
  for (const token of [
    "https://example.com/a.ts",
    "http://example.com/a.ts",
    "mailto:a@b.com",
    "file:///repo/src/a.ts",
    "//host/share/a.ts",
    "#section",
    "?query",
    "@mention",
    "import.meta",
    "e.g",
    "README",
    "plainword",
  ]) {
    assert.equal(linkifyToken(token, context(index)), null, token);
  }
});

test("refuses paths that resolve outside cwd", () => {
  const index = lookup(["src/a.ts"]);
  assert.equal(linkifyToken("../outside.md", context(index)), null);
  assert.equal(linkifyToken("/etc/passwd", context(index)), null);
});

test("handles Windows drive paths case-insensitively", () => {
  const index = lookup(["src/a.ts"], "C:\\repo");
  assert.equal(linkifyToken("src\\a.ts", context(index))?.relativePath, "src/a.ts");
  assert.equal(linkifyToken("C:\\repo\\src\\a.ts", context(index))?.filePath, "C:/repo/src/a.ts");
  assert.equal(linkifyToken("C:/repo/SRC/A.TS", context(index))?.relativePath, "SRC/A.TS");
});

test("handles backslash UNC paths", () => {
  const index = lookup(["src/a.ts"], "\\\\server\\share\\repo");
  assert.deepEqual(linkifyToken("\\\\server\\share\\repo\\src\\a.ts", context(index)), {
    filePath: "//server/share/repo/src/a.ts",
    relativePath: "src/a.ts",
  });
});

test("linkifyPlainText splits around punctuation and preserves whitespace", () => {
  const index = lookup(["src/a.ts"]);
  assert.deepEqual(linkifyPlainText("see src/a.ts, ok", context(index)), [
    { text: "see " },
    { text: "src/a.ts", match: { filePath: "/repo/src/a.ts", relativePath: "src/a.ts" } },
    { text: ", ok" },
  ]);

  assert.deepEqual(linkifyPlainText("(src/a.ts)", context(index)), [
    { text: "(" },
    { text: "src/a.ts", match: { filePath: "/repo/src/a.ts", relativePath: "src/a.ts" } },
    { text: ")" },
  ]);
});

test("keeps the original :line text while linking the file", () => {
  const index = lookup(["src/a.ts"]);
  const segments = linkifyPlainText("see src/a.ts:42 now", context(index));
  assert.deepEqual(segments, [
    { text: "see " },
    { text: "src/a.ts:42", match: { filePath: "/repo/src/a.ts", relativePath: "src/a.ts" } },
    { text: " now" },
  ]);
});

test("buildFileIndexLookup ignores absolute and escaping entries", () => {
  const index = lookup(["/abs/a.ts", "../escape.ts", "src/ok.ts"]);
  assert.deepEqual([...index.relative], ["src/ok.ts"]);
});
