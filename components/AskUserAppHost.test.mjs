import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const hostSource = await readFile(new URL("./AskUserAppHost.tsx", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
// The file comments legitimately name the protocol/modules the host must not
// use, so hygiene assertions run against the code with comments removed.
const hostCode = hostSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { AskUserAppHost } = await jiti.import("./AskUserAppHost.tsx");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");

const sampleAsk = {
  askId: "ask-1",
  askedAt: "2026-09-26T00:00:00.000Z",
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

function renderHost() {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(AskUserAppHost, { ask: sampleAsk, onSubmit() {}, onCancel() {} }),
    ),
  );
}

test("chat window keys the shared-view host by askId so drafts do not leak across asks", () => {
  const hostElement = /<AskUserAppHost[\s\S]*?\/>/.exec(chatWindowSource)?.[0] ?? "";
  assert.match(hostElement, /key=\{pendingAsk\.askId\}/);
  // The projection fetch is gone, so the host no longer needs the session id.
  assert.doesNotMatch(hostElement, /sessionId=/);
});

test("host renders the shared AskUserView with the copy resolved from i18n", () => {
  const html = renderHost();
  assert.match(html, /data-ask-user-view="shared"/);
  assert.match(html, /class="pi-ask"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-label="Questions from the agent"/);
  assert.match(html, /Which environment\?/);
  assert.match(html, /role="radiogroup"/);
  assert.match(html, /role="group"/);
  assert.match(html, /Type your own answer…/);
  assert.match(html, /Add details \(kept alongside the selected options\)…/);
  assert.match(html, /Additional info \(optional\)/);
  assert.match(html, />Submit</);
  assert.match(html, />Cancel</);
  // The stylesheet travels with the shared component.
  assert.match(html, /<style>[\s\S]*?\.pi-ask \{/);
});

test("host maps Pi Web tokens onto the --pi-ask-* namespace", () => {
  const html = renderHost();
  const mappings = {
    "--pi-ask-surface": "var(--bg-panel)",
    "--pi-ask-field": "var(--bg)",
    "--pi-ask-field-hover": "var(--bg-hover)",
    "--pi-ask-border": "var(--border)",
    "--pi-ask-text": "var(--text)",
    "--pi-ask-text-muted": "var(--text-muted)",
    "--pi-ask-text-dim": "var(--text-dim)",
    "--pi-ask-accent": "var(--accent)",
    "--pi-ask-accent-contrast": "var(--accent-contrast)",
    "--pi-ask-max-width": "var(--chat-content-max-width)",
    "--pi-ask-font-size-offset": "var(--chat-font-size-offset, 0px)",
  };
  for (const [name, value] of Object.entries(mappings)) {
    assert.ok(html.includes(`${name}:${value}`), `missing mapping ${name} -> ${value}`);
  }
  // The success/danger tokens keep the component's own add/remove defaults
  // (they are only named in the mapping's explanatory comment).
  assert.doesNotMatch(hostCode, /--pi-ask-success|--pi-ask-danger/);
});

test("host keeps the UI font stack and never uses the chat prose stack", () => {
  // The stack must be the UI stack (`body`), which is what the deleted native
  // card inherited: Latin in Oxanium, CJK in the device's own sans. The prose
  // stack (--font-content) would put the question in LXGW WenKai Screen, whose
  // kai glyphs read bigger and heavier than the card's sans.
  assert.match(hostSource, /function readFontFamilyStack\(\): string \{[\s\S]*?getComputedStyle\(document\.body\)\.fontFamily/);
  assert.doesNotMatch(hostSource, /getPropertyValue\("--font-content"\)/);
  assert.match(hostSource, /"--pi-ask-font-family": fontFamily/);
  // Both the UI stack and the mapping cannot break out of the inline style.
  assert.ok(hostSource.includes("[^A-Za-z0-9 ,'\"_-]"));
});

test("host marker is the single fixed shared value", () => {
  assert.match(hostSource, /data-ask-user-view="shared"/);
  assert.doesNotMatch(hostSource, /apps-pending|data-ask-user-view="native"|viewState/);
});

test("host carries no MCP Apps, iframe, handshake, or font-delivery path", () => {
  assert.doesNotMatch(hostSource, /srcdoc|srcDoc|<iframe|sandbox=|postMessage/);
  assert.doesNotMatch(hostSource, /isBuiltinAskUserViewHtml|APPS_PROTOCOL_VERSION|ui\/initialize|size-changed/);
  assert.doesNotMatch(hostSource, /ask-view|font-faces|theme-tokens|view-fonts|view-font-manifest|AskUserAppFailure/);
  assert.doesNotMatch(hostSource, /dangerouslySetInnerHTML/);
});

test("host forwards the mounted ask and the close commands without rewriting them", () => {
  assert.match(
    hostSource,
    /<AskUserView ask=\{ask\} labels=\{labels\} onSubmit=\{onSubmit\} onCancel=\{onCancel\} \/>/,
  );
  // The adapter owns no form behaviour: no reducer, no payload assembly.
  assert.doesNotMatch(hostSource, /useReducer|buildAskUserSubmission|askUserViewReducer|dispatch\(/);
});

test("chat window returns the submit promise so a rejected ask can unlock the view", () => {
  assert.match(chatWindowSource, /onSubmit=\{\(askId, answers, supplement\) => submitAsk\(askId, answers, supplement\)\}/);
  assert.doesNotMatch(chatWindowSource, /void submitAsk\(askId, answers, supplement\)/);
});
