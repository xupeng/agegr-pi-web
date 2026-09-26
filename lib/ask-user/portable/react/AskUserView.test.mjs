import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

/**
 * Structural coverage for the host-neutral view. The repository has no DOM
 * harness, so this renders with `react-dom/server` and asserts on roles, ARIA
 * attributes and tabindex values; the keyboard index maths is asserted
 * directly in `keyboard.test.mjs`. Real-browser key handling is verified
 * manually only — see the task's `research/fixture-evidence.md`.
 */

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { AskUserView, AskUserViewContent } = await jiti.import("./AskUserView.tsx");
const { askUserViewLabels } = await jiti.import("./copy.ts");
const controller = await jiti.import("../view-controller.ts");

const componentSource = await readFile(new URL("./AskUserView.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("./view-css.ts", import.meta.url), "utf8");
// The file comments legitimately name the imports the view must not use, so
// import-hygiene assertions run against the code with comments removed.
const componentCode = componentSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const cssCode = cssSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Drop the `<style>` element so markup assertions do not see CSS selectors. */
function stripStyle(html) {
  return html.replace(/<style>[\s\S]*?<\/style>/, "");
}

const labels = askUserViewLabels("en");

const sampleAsk = {
  askId: "ask-1",
  questions: [
    {
      id: "q1",
      question: "Which environment?",
      detail: "Pick one.",
      options: [
        { value: "dev", label: "Development" },
        { value: "prod", label: "Production", detail: "live" },
      ],
    },
    {
      id: "q2",
      question: "Which regions?",
      multiple: true,
      options: [{ value: "eu", label: "Europe" }],
    },
  ],
};

function renderView(props = {}) {
  return renderToStaticMarkup(
    React.createElement(AskUserView, { ask: sampleAsk, onSubmit() {}, onCancel() {}, ...props }),
  );
}

function seededState(...actions) {
  return actions.reduce((state, action) => controller.askUserViewReducer(state, action), controller.createAskUserViewState());
}

function renderContent(state, overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(AskUserViewContent, {
      ask: sampleAsk,
      state,
      labels,
      statusRef: { current: null },
      dispatch() {},
      onSubmit() {},
      onCancel() {},
      ...overrides,
    }),
  );
}

/** All `.pi-ask-option` buttons with parsed attributes. */
function optionButtons(html) {
  return [...html.matchAll(/<button type="button" class="pi-ask-option"([^>]*)>([\s\S]*?)<\/button>/g)].map(
    ([, attrs, inner]) => ({
      attrs,
      inner,
      role: /\brole="([^"]+)"/.exec(attrs)?.[1],
      checked: /\baria-checked="([^"]+)"/.exec(attrs)?.[1],
      tabindex: /\btabindex="([^"]+)"/.exec(attrs)?.[1],
      disabled: /\bdisabled\b/.test(attrs),
    }),
  );
}

test("the view is a labelled dialog and never claims to be modal", () => {
  const html = renderView();
  assert.match(html, /class="pi-ask" role="dialog" aria-label="Questions from the agent"/);
  assert.equal(html.includes("aria-modal"), false, "no cross-boundary focus trap exists, so no aria-modal");
});

test("single-choice groups expose radiogroup/radio semantics with a roving tabindex", () => {
  const html = renderView();
  const group = html.match(/<div class="pi-ask-options" role="radiogroup" aria-labelledby="([^"]+)">/);
  assert.ok(group, "the single-choice options are a radiogroup");
  const textId = group[1];
  assert.match(html, new RegExp(`id="${textId}">Which environment\\?`), "aria-labelledby points at the question text");

  const [first, second] = optionButtons(html);
  assert.equal(first.role, "radio");
  assert.equal(first.checked, "false");
  assert.equal(first.tabindex, "0", "the group's one tab stop is the first option");
  assert.equal(second.tabindex, "-1", "the other option is arrow-reachable only");
  assert.match(first.inner, /aria-hidden="true"/, "the state glyph is decorative");
  assert.match(first.inner, /○/);
});

test("a selected option owns the roving tab stop and reports aria-checked", () => {
  const state = seededState({ type: "toggle-option", questionId: "q1", value: "prod", multiple: false });
  const [first, second] = optionButtons(renderContent(state));
  assert.equal(first.checked, "false");
  assert.equal(first.tabindex, "-1");
  assert.equal(second.checked, "true");
  assert.equal(second.tabindex, "0");
  assert.match(second.inner, /◉/, "the glyph reflects the state");
  assert.match(second.inner, /aria-hidden="true"/);
});

test("multiple-choice groups expose checkbox semantics and stay in the tab order", () => {
  const html = renderView();
  assert.match(html, /<div class="pi-ask-options" role="group" aria-labelledby="[^"]+">/);
  const checkboxes = optionButtons(html).filter((button) => button.role === "checkbox");
  assert.equal(checkboxes.length, 1);
  assert.equal(checkboxes[0].checked, "false");
  assert.equal(checkboxes[0].tabindex, undefined, "checkboxes are not roving; all keep their default tab stop");
  assert.match(checkboxes[0].inner, /☐/);

  // Space toggles through the native button click; arrows are not wired at all.
  assert.match(componentSource, /if \(question\.multiple === true\) return;/);
  assert.match(componentSource, /onKeyDown=\{\s*multiple \? undefined :/);
});

test("the answered counter is a polite live region that follows the drafts", () => {
  assert.match(renderView(), /class="pi-ask-counter" role="status" aria-live="polite">0 of 2 answered</);
  const state = seededState({ type: "toggle-option", questionId: "q1", value: "dev", multiple: false });
  assert.match(renderContent(state), /class="pi-ask-counter" role="status" aria-live="polite">1 of 2 answered</);
});

test("both text inputs carry an aria-label derived from the copy", () => {
  const html = renderView();
  const inputs = [...html.matchAll(/<input type="text" class="pi-ask-input"([^>]*)>/g)].map(([, attrs]) => attrs);
  assert.equal(inputs.length, 2);
  assert.match(inputs[0], /aria-label="Type your own answer…"/);
  assert.match(inputs[1], /aria-label="Add details \(kept alongside the selected options\)…"/);
  assert.match(html, /<textarea class="pi-ask-textarea"[^>]*aria-label="Additional info \(optional\)"/);
});

test("locking the form disables every control and shows the status row", () => {
  const state = seededState(
    { type: "toggle-option", questionId: "q1", value: "dev", multiple: false },
    { type: "submit-requested" },
  );
  const html = renderContent(state);

  assert.match(html, /class="pi-ask-status" role="status" aria-live="polite" tabindex="-1"/);
  assert.match(html, /Submitted — delivering your answers…/);
  assert.doesNotMatch(stripStyle(html), /class="pi-ask-(submit|cancel)"/, "the actions are gone once locked");

  for (const button of optionButtons(html)) {
    assert.equal(button.disabled, true, "options are disabled while locked");
  }
  for (const [, attrs] of html.matchAll(/<input type="text" class="pi-ask-input"([^>]*)>/g)) {
    assert.match(attrs, /\bdisabled\b/, "custom inputs are disabled while locked");
  }
  assert.match(html, /<textarea class="pi-ask-textarea"[^>]*disabled/);
});

test("the locked view shows a per-question summary with a decorative check", () => {
  const state = seededState(
    { type: "toggle-option", questionId: "q1", value: "prod", multiple: false },
    { type: "submit-requested" },
  );
  const html = renderContent(state);
  const summary = html.match(/<div class="pi-ask-summary"><span class="pi-ask-summary-check" aria-hidden="true">✓<\/span> ([^<]*)<\/div>/);
  assert.ok(summary, "the answered question keeps a submit summary");
  assert.equal(summary[1], "prod", "the summary carries the raw option value, not the label");
  assert.match(html, /Which regions\?<\/div>/, "an unanswered question still renders");
});

test("a rejected action surfaces an alert and leaves the form editable", () => {
  const state = seededState(
    { type: "submit-requested" },
    { type: "action-failed", error: "The ask action failed. You can try again." },
  );
  const html = renderContent(state);
  assert.match(html, /class="pi-ask-error" role="alert">The ask action failed\. You can try again\.</);
  assert.match(html, /class="pi-ask-submit"/, "the form is editable again after a rejection");
  assert.doesNotMatch(stripStyle(html), /class="pi-ask-status"/, "the locked status row is gone");
});

test("the locked status row is the programmatic focus target", () => {
  // The effect cannot run under renderToStaticMarkup; the row is focusable and
  // the source moves focus to it whenever the lock engages.
  const state = seededState({ type: "submit-requested" });
  assert.match(renderContent(state), /class="pi-ask-status"[^>]*tabindex="-1"/);
  assert.match(
    componentSource,
    /useEffect\(\(\) => \{\s*if \(locked\) statusRef\.current\?\.focus\(\);\s*\}, \[locked\]\)/,
  );
  assert.match(componentSource, /ref=\{statusRef\}/);
});

test("locale and labels give the host full control of every visible string", () => {
  assert.match(renderView(), /Questions from the agent/);
  assert.match(renderView({ locale: "zh-CN" }), /来自 agent 的问题/);
  assert.match(renderView({ locale: "zh-TW" }), /來自 agent 的問題/);

  const overridden = renderView({ labels: { title: "Host title", submit: "Send it" } });
  assert.match(overridden, /aria-label="Host title"/);
  assert.match(overridden, />Send it</);
  assert.match(overridden, /Cancel/, "keys the host did not override keep the bundled value");
});

test("host labels also drive the locked and error surfaces", () => {
  const locked = renderContent(seededState({ type: "submit-requested" }), {
    labels: { ...labels, submitted: "LOCKED", actionFailed: "FAILED" },
  });
  assert.match(locked, />LOCKED</);

  const failed = renderContent(seededState({ type: "action-failed", error: "FAILED" }), {
    labels: { ...labels, actionFailed: "FAILED" },
  });
  assert.match(failed, /role="alert">FAILED</);
  // The override reaches the surface through both callbacks' catch path.
  assert.match(componentSource, /type: "action-failed", error: labels\.actionFailed/);
});

test("the disabled prop disables the controls without entering the locked view", () => {
  const html = renderView({ disabled: true });
  for (const button of optionButtons(html)) {
    assert.equal(button.disabled, true);
  }
  assert.match(html, /<textarea class="pi-ask-textarea"[^>]*disabled/);
  assert.match(html, /class="pi-ask-submit"[^>]*disabled/);
  assert.doesNotMatch(stripStyle(html), /class="pi-ask-status"/, "a host disable is not a submit/cancel lock");
});

test("fallback styling is present, including a focus ring and no inline outline:none", () => {
  assert.match(cssSource, /--pi-ask-surface/);
  assert.match(cssSource, /light-dark\(/);
  assert.match(cssSource, /\.pi-ask :focus-visible\s*\{\s*outline: 2px solid var\(--pi-ask-accent/);
  assert.doesNotMatch(componentSource, /outline\s*:\s*["']?none/);
});

test("the view reads only the --pi-ask-* namespace and never theme-tokens", () => {
  const surfaces = componentCode + cssCode;
  for (const hostName of ["--bg", "--text", "--accent", "--border", "--chat-font-size-offset", "--pi-accent"]) {
    assert.equal(surfaces.includes(`var(${hostName}`), false, `must not read host token ${hostName}`);
  }
  assert.doesNotMatch(componentCode, /theme-tokens/);
  assert.doesNotMatch(cssCode, /theme-tokens|sanitizeToken/);
});

test("the deleted native card's metrics are carried over", () => {
  assert.match(cssSource, /\.pi-ask-questions\s*\{[^}]*display: grid[^}]*gap: 14px/);
  assert.match(cssSource, /\.pi-ask-option\s*\{[^}]*padding: 7px 10px[^}]*border-radius: 7px/);
  assert.match(cssSource, /\.pi-ask-detail\s*\{[^}]*line-height: 1\.9/);
  assert.match(cssSource, /\.pi-ask-option:disabled\s*\{[^}]*opacity: 0\.75/);
  assert.match(cssSource, /\.pi-ask-option-glyph\s*\{[^}]*opacity: 0\.85/);
  assert.match(cssSource, /\.pi-ask-submit\s*\{[^}]*padding: 7px 16px/);
  assert.match(cssSource, /\.pi-ask-cancel\s*\{[^}]*padding: 7px 14px/);
  assert.match(cssSource, /\.pi-ask-hint\s*\{[^}]*var\(--pi-ask-text-dim/);
  assert.match(cssSource, /\.pi-ask-submit\s*\{[^}]*var\(--pi-ask-accent-contrast/);
  assert.match(cssSource, /border-radius: 10px/);
  assert.match(cssSource, /var\(--pi-ask-max-width/);
});

test("question text ids are namespaced by askId and index", () => {
  const html = renderView();
  assert.match(html, /id="pi-ask-ask-1-q-0"/);
  assert.match(html, /id="pi-ask-ask-1-q-1"/);
});

test("the view imports only relative modules and React", () => {
  const specifiers = [...componentSource.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
  assert.ok(specifiers.length > 0);
  for (const specifier of specifiers) {
    assert.ok(
      specifier.startsWith(".") || specifier === "react",
      `unexpected import ${specifier}`,
    );
  }
  assert.doesNotMatch(componentCode, /@\/|useI18n|node:|from "next|lib\/i18n/);
});

test("both free-text controls bound their input at the answer length limit", () => {
  const html = stripStyle(renderView());
  // The deleted native card bounded the custom answer, and `validateSubmission`
  // rejects an over-long one; without the attribute the user only discovers the
  // limit through a generic action failure. React emits the attribute casing as
  // written (`maxLength`), so match case-insensitively the way HTML reads it.
  assert.match(html, /<input[^>]*maxlength="4000"/i, "the custom answer input is bounded");
  assert.match(html, /<textarea[^>]*maxlength="4000"/i, "the supplement textarea is bounded");
});
