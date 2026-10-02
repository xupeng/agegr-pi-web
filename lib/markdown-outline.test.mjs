import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { extractOutlineRows, isOutlineHeading } = await jiti.import("./markdown-outline.ts");

/** Rows as the minimap reads them: level plus text, in document order. */
const shape = (markdown) => extractOutlineRows(markdown).map(({ kind, level, headingIndex, text }) => ({
  kind,
  level,
  headingIndex,
  text,
}));

test("lists root-level headings in order with their levels", () => {
  assert.deepEqual(shape(`# One

Some prose.

## Two

### Three
`), [
    { kind: "heading", level: 1, headingIndex: 0, text: "One" },
    { kind: "heading", level: 2, headingIndex: 1, text: "Two" },
    { kind: "heading", level: 3, headingIndex: 2, text: "Three" },
  ]);
});

test("collapses inline markup and math in a heading into one line of text", () => {
  const rows = shape("# `code` and **bold** and $f_{k,t+1}$\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].level, 1);
  assert.match(rows[0].text, /code/);
  assert.match(rows[0].text, /bold/);
  assert.match(rows[0].text, /f_\{k,t\+1\}/);
  assert.doesNotMatch(rows[0].text, /\n/);
});

test("ignores headings the preview does not render", () => {
  // Depth past the limit, a fenced code block, and headings nested inside a
  // blockquote or list are not root children of the answer's tree.
  assert.deepEqual(shape(`#### Too deep

\`\`\`
# Inside a fence
\`\`\`

> ### Inside a quote

- #### Inside a list
`), []);

  // With a paragraph available the answer still reaches the rail, as prose.
  assert.deepEqual(shape(`#### Too deep

The answer's prose.
`), [{ kind: "paragraph", level: 0, headingIndex: -1, text: "The answer's prose." }]);
});

test("falls back to the first paragraph when the answer has no heading", () => {
  assert.deepEqual(shape("First line.\n\nSecond paragraph.\n"), [
    { kind: "paragraph", level: 0, headingIndex: -1, text: "First line." },
  ]);
});

test("returns no rows for empty or prose-free markdown", () => {
  assert.deepEqual(extractOutlineRows(""), []);
  assert.deepEqual(extractOutlineRows("---\ntitle: only frontmatter\n---\n"), []);
});

test("keeps the heading filter shared with the renderer", () => {
  assert.equal(isOutlineHeading({ type: "heading", depth: 1 }), true);
  assert.equal(isOutlineHeading({ type: "heading", depth: 3 }), true);
  assert.equal(isOutlineHeading({ type: "heading", depth: 4 }), false);
  assert.equal(isOutlineHeading({ type: "paragraph" }), false);
});
