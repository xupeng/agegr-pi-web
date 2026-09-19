import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { MarkdownBody } = await jiti.import("./MarkdownBody.tsx");
const { FileIndexProvider } = await jiti.import("./FileIndexContext.tsx");
const { buildFileIndexLookup } = await jiti.import("../lib/path-linkify.ts");
const { normalizeDisplayMath } = await jiti.import("../lib/markdown.ts");
const globalCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

function renderMarkdown(markdown, props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(MarkdownBody, {
        cwd: "/home/me/project",
        onOpenFile() {},
        ...props,
      }, markdown),
    ),
  );
}

function renderMarkdownWithIndex(markdown, files, props = {}) {
  const lookup = buildFileIndexLookup(files, "/home/me/project");
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(
        FileIndexProvider,
        { lookup },
        React.createElement(MarkdownBody, {
          cwd: "/home/me/project",
          onOpenFile() {},
          ...props,
        }, markdown),
      ),
    ),
  );
}

test("opens non-file markdown links in a safe new tab", () => {
  const html = renderMarkdown("[docs](https://example.com/docs)");

  assert.match(
    html,
    /<a (?=[^>]*href="https:\/\/example\.com\/docs")(?=[^>]*target="_blank")(?=[^>]*rel="noopener noreferrer")[^>]*>docs<\/a>/,
  );
  assert.doesNotMatch(html, /\snode=/);
});

test("keeps local file markdown links in the app", () => {
  const relativeHtml = renderMarkdown("[file](components/MarkdownBody.tsx)");
  const fileUrlHtml = renderMarkdown("[report](file:///home/me/project/report.html)");

  assert.match(relativeHtml, /<a href="components\/MarkdownBody\.tsx">file<\/a>/);
  assert.doesNotMatch(relativeHtml, /target=|rel=|\snode=/);
  assert.match(fileUrlHtml, /<a href="file:\/\/\/home\/me\/project\/report\.html">report<\/a>/);
  assert.doesNotMatch(fileUrlHtml, /target=|rel=|\snode=/);
});

test("keeps file URLs inert without an in-app file handler", () => {
  const html = renderMarkdown("[report](file:///home/me/project/report.html)", { onOpenFile: undefined });

  assert.match(html, /<a href="" target="_blank" rel="noopener noreferrer">report<\/a>/);
});

test("sizes Markdown table columns by content inside a horizontal scroll container", () => {
  const html = renderMarkdown(`| # | Tool | Description |
|---|---|---|
| 1 | douban_current_user | Returns the current user |`);

  assert.match(
    html,
    /<div class="markdown-table-wrap"><table><thead>/,
  );
  assert.match(html, /<tbody><tr><td>1<\/td>/);
  assert.match(globalCss, /\.markdown-table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(globalCss, /\.markdown-body table\s*\{[^}]*width:\s*max-content[^}]*min-width:\s*100%/s);
  assert.match(globalCss, /\.markdown-body th, \.markdown-body td\s*\{[^}]*max-width:\s*32rem/s);
  assert.doesNotMatch(globalCss, /\.markdown-body th, \.markdown-body td\s*\{[^}]*min-width:/s);
});

test("keeps single-tilde CJK numeric ranges literal instead of striking them", () => {
  const html = renderMarkdown("5~7U 保证金 × 100~200倍杠杆");

  assert.doesNotMatch(html, /<del>/);
  assert.match(html, /5~7U/);
  assert.match(html, /100~200倍/);
});

test("still renders double-tilde strikethrough", () => {
  const html = renderMarkdown("~~gone~~");

  assert.match(html, /<del>gone<\/del>/);
});

test("renders backslash-escaped backticks inside inline code", () => {
  const html = renderMarkdown("`AudioManager\\`1.cs`");

  assert.match(html, /<code[^>]*>AudioManager`1\.cs<\/code>/);
  assert.doesNotMatch(html, /<\/code>1\.cs`/);
});

test("renders LaTeX parenthesis delimiters as inline math", () => {
  const html = renderMarkdown(String.raw`射线为 \(r_c = K^{-1}p\)。`);

  assert.match(html, /class="katex"/);
  assert.match(html, /r_c/);
});

test("renders paired LaTeX bracket delimiters as display math", () => {
  const html = renderMarkdown(String.raw`\[
P(\lambda)=o_b+\lambda r_b
\]`);
  const oneLineHtml = renderMarkdown(String.raw`\[P(\lambda)=o_b+\lambda r_b\]`);

  assert.match(html, /class="katex-display"/);
  assert.match(html, /lambda/);
  assert.match(oneLineHtml, /class="katex-display"/);
});

test("renders model-emitted bracket-only formula lines as display math", () => {
  const html = renderMarkdown(String.raw`平均一致性：

[ C(x) = \frac{2}{T(T-1)} \sum_{i<j} S(\hat{y}^{(i)}, \hat{y}^{(j)}) ]`);

  assert.match(html, /class="katex-display"/);
  assert.match(html, /\\sum/);
});

test("leaves an unmatched LaTeX bracket delimiter unchanged", () => {
  const markdown = String.raw`before
\[
x + y
after`;

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize LaTeX delimiters inside Markdown code", () => {
  const markdown = "    \\(indented\\)\n\n`code\n\\(inline\\)`\n\n```text\n\\[\nfenced\n\\]\n```";

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize LaTeX delimiters inside raw HTML code", () => {
  const markdown = "<code>\\(inline\\)</code>\n\n<pre>\n\\(block\\)\n</pre>";

  assert.equal(normalizeDisplayMath(markdown), markdown);
});

test("does not normalize escaped delimiters or link destinations", () => {
  const escaped = String.raw`Literal: \\(x+y\\).`;
  const link = String.raw`[docs](https://example.com/\(manual\))`;

  assert.equal(normalizeDisplayMath(escaped), escaped);
  assert.equal(normalizeDisplayMath(link), link);
});

test("previews completed Mermaid diagrams by default", () => {
  const html = renderMarkdown("```mermaid\ngraph TD\n  A --> B\n```");

  assert.match(html, /mermaid-block-loading/);
  assert.match(html, />Source</);
  assert.doesNotMatch(html, /A --&gt; B/);
});

test("keeps Mermaid source visible while the response is streaming", () => {
  const html = renderMarkdown("```mermaid\ngraph TD\n  A --> B\n```", { isStreaming: true });

  assert.doesNotMatch(html, /mermaid-block-loading/);
  assert.match(html, />Preview</);
  assert.match(html, /A --&gt; B/);
});

test("does not nest automatic inline-code links inside existing markdown anchors", () => {
  for (const href of ["prd.md", "https://example.com"]) {
    const html = renderMarkdownWithIndex("[`prd.md`](" + href + ")", ["prd.md"]);
    assert.equal((html.match(/<a /g) ?? []).length, 1);
    assert.match(html, /<code class="markdown-inline-code">prd.md<\/code>/);
  }
});

test("links inline code paths that exist in the file index", () => {
  const html = renderMarkdownWithIndex("see `prd.md` now", [".trellis/tasks/x/prd.md"]);

  assert.match(
    html,
    /<a (?=[^>]*href="\.trellis\/tasks\/x\/prd\.md")(?=[^>]*class="markdown-inline-code markdown-file-link")[^>]*>prd\.md<\/a>/,
  );
  assert.doesNotMatch(html, /\snode=/);
});

test("leaves inline code paths plain when the index has no match", () => {
  const unmatched = renderMarkdownWithIndex("see `prd.md` now", ["other.md"]);
  const noIndex = renderMarkdown("see `prd.md` now");

  assert.match(unmatched, /<code class="markdown-inline-code">prd\.md<\/code>/);
  assert.doesNotMatch(unmatched, /markdown-file-link/);
  assert.match(noIndex, /<code class="markdown-inline-code">prd\.md<\/code>/);
  assert.doesNotMatch(noIndex, /markdown-file-link/);
});

test("linkifies bare text paths in paragraphs only when the index confirms them", () => {
  const linked = renderMarkdownWithIndex("open .trellis/tasks/x/prd.md now", [".trellis/tasks/x/prd.md"]);
  const missing = renderMarkdownWithIndex("open src/missing.ts now", [".trellis/tasks/x/prd.md"]);

  assert.match(linked, /<a href="\.trellis\/tasks\/x\/prd\.md" class="path-text-link">\.trellis\/tasks\/x\/prd\.md<\/a>/);
  assert.doesNotMatch(missing, /<a /);
});

test("keeps table cell text unwrapped when the index has no match", () => {
  const html = renderMarkdownWithIndex("| # |\n|---|\n| 1 |", ["src/a.ts"]);

  assert.match(html, /<tbody><tr><td>1<\/td>/);
});

test("opens markdown images in the shared image preview", () => {
  const localHtml = renderMarkdown("![chart](docs/tmp/chart.png)");
  const remoteHtml = renderMarkdown("![logo](https://example.com/logo.png)");

  assert.match(localHtml, /<button[^>]+aria-label="Preview image: chart"[^>]*>/);
  assert.match(localHtml, /<img[^>]+src="\/api\/files\/home\/me\/project\/docs\/tmp\/chart\.png\?type=read"/);
  assert.match(localHtml, /<img[^>]+alt="chart"/);
  assert.match(remoteHtml, /<button[^>]+aria-label="Preview image: logo"[^>]*>/);
  assert.match(remoteHtml, /<img[^>]+src="https:\/\/example\.com\/logo\.png"/);
});

test("keeps linked markdown images as links instead of nested preview buttons", () => {
  const html = renderMarkdown("[![diagram](docs/tmp/diagram.png)](https://example.com/docs)");

  assert.match(
    html,
    /<a (?=[^>]*href="https:\/\/example\.com\/docs")(?=[^>]*target="_blank")[^>]*>/,
  );
  assert.match(html, /<img[^>]+alt="diagram"/);
  assert.doesNotMatch(html, /<a[^>]*>[\s\S]*<button/);
  assert.doesNotMatch(html, /<button[^>]*>[\s\S]*<\/a>/);
});

test("uses a generic preview label when a markdown image has no alt text", () => {
  const html = renderMarkdown("![](https://example.com/shot.png)");

  assert.match(html, /<button[^>]+aria-label="Preview image"[^>]*>/);
  assert.doesNotMatch(html, /Preview image:/);
});
