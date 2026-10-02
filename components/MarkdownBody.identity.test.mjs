import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { createJiti } from "jiti";

const source = await readFile(new URL("./MarkdownBody.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jiti = createJiti(import.meta.url);
const paths = await jiti.import("../lib/path-linkify.ts");

// Execute the real component with a persistent memo-slot harness. No DOM shim:
// changing a ReactMarkdown renderer function changes the element type and
// remounts its subtree even if the enclosing message entry key is unchanged.
function createHarness() {
  let lookup = null;
  let slot = 0;
  const memos = [];
  const memoSlot = (factory, deps) => {
    const index = slot++;
    const previous = memos[index];
    if (previous && deps.length === previous.deps.length
      && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return previous.value;
    const value = factory();
    memos[index] = { deps, value };
    return value;
  };
  const exports = {};
  const PathText = () => null;
  runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return { ...React, useMemo: memoSlot, useCallback: (fn, deps) => memoSlot(() => fn, deps) };
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "@/lib/path-linkify") return paths;
      if (name === "@/lib/markdown") return { normalizeDisplayMath: text => text };
      if (name === "./FileIndexContext") return { useFileIndexContext: () => lookup };
      if (name === "./PathText") return { PathText };
      return {};
    },
  });
  return {
    PathText,
    render(nextLookup, props) {
      lookup = nextLookup;
      slot = 0;
      return exports.MarkdownBody({ children: "E2E message 4998", ...props }).props.children.props.components;
    },
  };
}

test("keeps Markdown renderer element types across initial and TTL file-index refreshes", () => {
  const harness = createHarness();
  const props = { cwd: "/project", onOpenFile() {}, keepLineBreaks: true };
  const initial = harness.render(null, props);
  for (const files of [[], [], ["src/app.ts"], []]) {
    const refreshed = harness.render(paths.buildFileIndexLookup(files, "/project"), props);
    for (const tag of ["p", "li", "td", "th", "code", "pre", "a", "img", "table"]) {
      assert.equal(refreshed[tag], initial[tag], `${tag} must not remount on lookup refresh`);
    }
  }
});

test("stable block renderers consume the current index instead of capturing its first value", () => {
  const harness = createHarness();
  const props = { cwd: "/project", onOpenFile() {} };
  const initial = harness.render(null, props);
  for (const tag of ["p", "li", "td", "th"]) {
    assert.equal(initial[tag]({ children: "open src/app.ts" }).props.children, "open src/app.ts");
  }
  harness.render(paths.buildFileIndexLookup(["src/app.ts"], "/project"), props);
  for (const tag of ["p", "li", "td", "th"]) {
    const linked = initial[tag]({ children: "open src/app.ts", node: {} });
    assert.equal(linked.props.children[0].type, harness.PathText);
    assert.equal(linked.props.children[0].props.text, "open src/app.ts");
    assert.equal(linked.props.node, undefined);
  }
  harness.render(paths.buildFileIndexLookup([], "/project"), props);
  for (const tag of ["p", "li", "td", "th"]) {
    assert.equal(initial[tag]({ children: "open src/app.ts" }).props.children, "open src/app.ts");
  }
});
