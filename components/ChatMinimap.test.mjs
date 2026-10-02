import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";

registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith(".module.css")) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: "export default new Proxy({}, { get: (_, key) => String(key) });",
    };
  },
});

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const { AssistantOutline, countToolCalls, tickSpacing } = await jiti.import("./ChatMinimap.tsx");

test("renders math in headings without disabling heading navigation", () => {
  const html = renderToStaticMarkup(
    React.createElement(AssistantOutline, {
      markdown: String.raw`# Inline $f_{k,t+1}$

## Parentheses \(x^2 + y^2\)`,
      onHeadingClick() {},
    }),
  );

  assert.match(html, /class="katex"/);
  assert.match(html, /data-preview-heading-index="0"/);
  assert.match(html, /data-preview-heading-index="1"/);
  assert.doesNotMatch(html, /disabled=""/);
});

test("counts tool calls per assistant reply, including replies that also answer", () => {
  // A reply can both answer and call tools, so counting text-less messages
  // would undercount this turn.
  assert.equal(countToolCalls({
    role: "assistant",
    content: [
      { type: "text", text: "Let me check that file." },
      { type: "toolCall", toolCallId: "1", toolName: "read", input: {} },
      { type: "toolCall", toolCallId: "2", toolName: "grep", input: {} },
    ],
  }), 2);

  assert.equal(countToolCalls({
    role: "assistant",
    content: [{ type: "toolCall", toolCallId: "3", toolName: "bash", input: {} }],
  }), 1);

  assert.equal(countToolCalls({
    role: "assistant",
    content: [{ type: "text", text: "Done." }],
  }), 0);
});

test("counts no tool calls for non-assistant or string-content messages", () => {
  assert.equal(countToolCalls({ role: "user", content: "run the tests" }), 0);
  assert.equal(countToolCalls({ role: "assistant", content: "plain string" }), 0);
  assert.equal(countToolCalls({ role: "assistant" }), 0);
});

test("keeps the outline rail's fixed pitch below Notion's top anchor", () => {
  // Notion's rail: 2px ticks 12px apart, the group anchored 130px down, never centred.
  const spacing = tickSpacing(3, 600);
  assert.equal(spacing.gap, 14);
  assert.equal(spacing.start, 130);
  assert.equal(spacing.fillsHeight, false);
});

test("anchors a single or empty outline at the top anchor too", () => {
  assert.deepEqual(tickSpacing(1, 600), { gap: 14, start: 130, fillsHeight: false });
  assert.deepEqual(tickSpacing(0, 600), { gap: 14, start: 130, fillsHeight: false });
});

test("compresses a long outline until every tick fits below the anchor", () => {
  const spacing = tickSpacing(100, 600);
  assert.equal(spacing.gap, (600 - 130 - 8) / 99);
  assert.equal(spacing.start, 130);
  assert.equal(spacing.fillsHeight, true);
});

test("lifts the anchor on a rail shorter than the anchor itself", () => {
  assert.equal(tickSpacing(3, 100).start, 92);
  assert.equal(tickSpacing(3, 4).start, 8);
});
