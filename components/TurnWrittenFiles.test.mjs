import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const componentSource = await readFile(new URL("./TurnWrittenFiles.tsx", import.meta.url), "utf8");

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { TurnWrittenFiles } = await jiti.import("./TurnWrittenFiles.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function render(props) {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, null, React.createElement(TurnWrittenFiles, props)),
  );
}

test("renders a card per file showing the basename, type line and full path", () => {
  const html = render({
    files: [{ filePath: "/abs/out/report.html" }, { filePath: "/abs/out/data.json" }],
    onOpenFile() {},
  });
  assert.match(html, /<button/);
  assert.match(html, /report\.html/);
  assert.match(html, /data\.json/);
  assert.match(html, /title="\/abs\/out\/report\.html"/);
  assert.match(html, /title="\/abs\/out\/data\.json"/);
  assert.match(html, /Code · HTML/);
  assert.match(html, /Data · JSON/);
  assert.match(html, /Files: 2/);
});

test("renders nothing when no files were written", () => {
  assert.equal(render({ files: [], onOpenFile() {} }), "");
});

test("keeps the actions menu collapsed behind a labelled trigger", () => {
  const html = render({
    files: [{ filePath: "/abs/out/report.html", added: 4, removed: 1 }],
    onOpenFile() {},
  });

  assert.match(html, /Files: 1/);
  assert.doesNotMatch(html, /1 files/);
  assert.match(html, /aria-label="File actions"/);
  assert.match(html, /aria-expanded="false"/);
  // Actions are inline-expanded on demand; the collapsed card hides them.
  assert.doesNotMatch(html, /Open preview/);
  assert.doesNotMatch(html, /Open diff/);
  assert.doesNotMatch(html, /Copy path/);
});

test("shows per-file counts only when the source provides them", () => {
  const html = render({
    files: [
      { filePath: "/abs/tasks/prd.md", operation: "update", added: 81, removed: 10 },
      { filePath: "/abs/tasks/notes.txt" },
    ],
    onOpenFile() {},
  });

  assert.match(html, /\+81/);
  assert.match(html, /-10/);
  // The uncounted file contributes nothing, and the mixed group has no total.
  assert.equal((html.match(/\+\d+/g) ?? []).length, 1);
  assert.equal((html.match(/-\d+/g) ?? []).length, 1);
});

test("shows a group total only when every file has counts", () => {
  const html = render({
    files: [
      { filePath: "/abs/tasks/prd.md", added: 81, removed: 10 },
      { filePath: "/abs/tasks/design.md", added: 11, removed: 3 },
    ],
    onOpenFile() {},
  });

  assert.match(html, /\+92/);
  assert.match(html, /-13/);
});

test("forwards the card's source session id to the open handler", () => {
  // The open callback is `(filePath, { modeHint?, sourceSessionId? })`; the
  // preview, diff and primary actions must all carry the child session so
  // /api/files can authorize subagent-written paths outside the allowed roots.
  assert.match(componentSource, /const openOptions = sourceSessionId \? \{ sourceSessionId \} : undefined/);
  assert.match(componentSource, /onOpenFile\?\.\(filePath, openOptions\)/);
  assert.match(componentSource, /onOpenFile\(filePath, openOptions\)/);
  assert.match(componentSource, /onOpenFile\(filePath, \{ modeHint: "diff", \.\.\.openOptions \}\)/);
});
