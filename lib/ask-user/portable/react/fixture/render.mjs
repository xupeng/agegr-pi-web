/**
 * Minimal host fixture for the shared `AskUserView`.
 *
 * Run from the repository root:
 *
 *   node lib/ask-user/portable/react/fixture/render.mjs
 *
 * It loads the component through `jiti` (the same loader the unit tests use)
 * and renders it with `react-dom/server` — no Pi Web module, no Next, no
 * `I18nProvider`, no host CSS variables. It demonstrates the R4 fallback
 * path (`light-dark()` + system font stack) and every interactive control,
 * then renders a locked state by driving the host-neutral controller.
 *
 * Real-browser keyboard interaction is NOT exercised here; see
 * `.trellis/tasks/09-26-ask-user-react-view-package/research/fixture-evidence.md`.
 */

import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { AskUserView, AskUserViewContent } = await jiti.import("../AskUserView.tsx");
const { askUserViewLabels } = await jiti.import("../copy.ts");
const controller = await jiti.import("../../view-controller.ts");

const ask = {
  askId: "fixture-ask",
  questions: [
    {
      id: "env",
      question: "Which environment?",
      detail: "Choose the deployment target.\n\nAsk a maintainer if unsure.",
      options: [
        { value: "dev", label: "Development" },
        { value: "prod", label: "Production", detail: "live traffic" },
      ],
    },
    {
      id: "regions",
      question: "Which regions?",
      multiple: true,
      options: [
        { value: "eu", label: "Europe" },
        { value: "us", label: "US" },
      ],
    },
  ],
};

const labels = askUserViewLabels("en");

const live = renderToStaticMarkup(
  React.createElement(AskUserView, { ask, onSubmit() {}, onCancel() {} }),
);

for (const [what, pattern] of [
  ["dialog", /role="dialog" aria-label="Questions from the agent"/],
  ["radiogroup", /role="radiogroup"/],
  ["checkbox group", /role="group"/],
  ["radio", /role="radio"/],
  ["checkbox", /role="checkbox"/],
  ["custom input", /class="pi-ask-input"/],
  ["supplement textarea", /class="pi-ask-textarea"/],
  ["submit", /class="pi-ask-submit"/],
  ["cancel", /class="pi-ask-cancel"/],
  ["fallback colour", /light-dark\(/],
  ["fallback font stack", /-apple-system, system-ui/],
]) {
  assert.match(live, pattern, `the fixture must render ${what}`);
}
assert.equal(live.includes("aria-modal"), false, "the dialog must not claim to be modal");

// Drive a submit-like lock through the controller and render the locked view.
const lockedState = [
  { type: "toggle-option", questionId: "env", value: "prod", multiple: false },
  { type: "set-other-text", questionId: "regions", text: "plus custom", multiple: true },
  { type: "set-supplement", text: "ship it" },
  { type: "submit-requested" },
].reduce((state, action) => controller.askUserViewReducer(state, action), controller.createAskUserViewState());

const locked = renderToStaticMarkup(
  React.createElement(AskUserViewContent, {
    ask,
    state: lockedState,
    labels,
    statusRef: { current: null },
    dispatch() {},
    onSubmit() {},
    onCancel() {},
  }),
);
assert.match(locked, /role="status" aria-live="polite" tabindex="-1"/);
assert.match(locked, /pi-ask-summary-check/, "the locked view keeps a per-question summary");
assert.match(locked, /Submitted — delivering your answers…/);

console.log("fixture OK: AskUserView renders without any Pi Web import or host CSS variable");
console.log(`  live markup: ${live.length} bytes`);
console.log(`  locked markup: ${locked.length} bytes`);
console.log(`  labels: ${Object.keys(labels).length} keys, locale default 'en'`);
console.log("");
console.log("--- live markup ---");
console.log(live);
console.log("");
console.log("--- locked markup ---");
console.log(locked);
