import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { ASK_USER_VIEW_SCRIPT } = await jiti.import("./mcp-view-html.ts");

/**
 * The view is an inline script that must run inside an opaque-origin frame, so
 * there is no browser DOM here. This is the smallest shim that lets the real
 * script execute: elements, `textContent`, attributes, listeners and the
 * `window.parent.postMessage` channel the host listens on.
 */
function makeElement(tag) {
  return {
    tagName: tag,
    children: [],
    listeners: {},
    attributes: {},
    text: null,
    disabled: false,
    value: "",
    style: { setProperty() {} },
    setAttribute(key, value) { this.attributes[key] = String(value); },
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
    appendChild(child) { this.children.push(child); return child; },
    get textContent() {
      return (this.text || "") + this.children.map((child) => child?.textContent ?? "").join("");
    },
    set textContent(value) { this.text = value; this.children = []; },
    click() { (this.listeners.click || []).forEach((handler) => handler({})); },
    findAll(found = []) { found.push(this); this.children.forEach((child) => child.findAll?.(found)); return found; },
  };
}

function createView() {
  const root = makeElement("div");
  const documentElement = makeElement("html");
  documentElement.scrollHeight = 320;
  documentElement.clientWidth = 800;
  const document = {
    documentElement,
    getElementById: (id) => (id === "pi-web-ask-root" ? root : null),
    createElement: (tag) => makeElement(tag),
    createTextNode: (value) => ({ textContent: String(value) }),
  };
  const posted = [];
  const listeners = {};
  const window = {
    location: { origin: "null" },
    parent: {
      postMessage: (message, target) => posted.push({ message, target }),
      location: { get origin() { throw new Error("SecurityError"); } },
    },
    addEventListener: (type, handler) => { (listeners[type] ||= []).push(handler); },
  };
  new Function("window", "document", ASK_USER_VIEW_SCRIPT)(window, document);
  return {
    root,
    posted,
    send: (data) => (listeners.message || []).forEach((handler) => handler({ source: window.parent, origin: "null", data })),
  };
}

function button(root, label) {
  return root.findAll().find((node) => node.tagName === "button" && node.textContent === label);
}

function nodes(root, tag) {
  return root.findAll().filter((node) => node.tagName === tag);
}

/** Option rows render as `<check glyph><label>`, so match on the glyph prefix. */
function optionButton(root, label) {
  return nodes(root, "button").find((node) => /^[○◉☐☑]/.test(node.textContent) && node.textContent.endsWith(label));
}

function fire(node, type) {
  (node.listeners[type] || []).forEach((handler) => handler({}));
}

function toolsCalls(view) {
  return view.posted.map((entry) => entry.message).filter((message) => message?.method === "tools/call");
}

function summaries(root) {
  return nodes(root, "div").filter((node) => node.textContent.startsWith("✓ "));
}

function projection(overrides = {}) {
  return {
    schemaVersion: 1,
    sessionId: "s1",
    askId: "a1",
    askedAt: "2026-09-26T00:00:00.000Z",
    questions: [{ id: "q1", question: "Pick one", multiple: false, options: [{ value: "yes", label: "Yes" }] }],
    ...overrides,
  };
}

function mount(view, structuredContent) {
  view.send({ jsonrpc: "2.0", id: 0, result: { protocolVersion: "2026-01-26" } });
  view.send({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: { sessionId: "s1", askId: "a1" } } });
  view.send({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent } });
}

test("view renders a projection and posts only ask_submit for a submit", () => {
  const view = createView();
  mount(view, projection({ labels: { submit: "Submit", cancel: "Cancel" } }));
  assert.match(view.root.textContent, /Pick one/);
  button(view.root, "Submit").click();
  const call = view.posted.map((entry) => entry.message).find((message) => message?.method === "tools/call");
  assert.equal(call.params.name, "ask_submit");
  assert.deepEqual(call.params.arguments.sessionId, "s1");
  assert.deepEqual(call.params.arguments.askId, "a1");
});

test("a rejected action keeps the error visible and the retry/cancel controls usable", async () => {
  const view = createView();
  mount(view, projection({ labels: { submit: "Submit", cancel: "Cancel" } }));
  button(view.root, "Submit").click();
  const call = view.posted.map((entry) => entry.message).find((message) => message?.method === "tools/call");
  view.send({ jsonrpc: "2.0", id: call.id, error: { code: -32603, message: "rejected by server" } });
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.match(view.root.textContent, /rejected by server/);
  assert.ok(button(view.root, "Submit"), "submit must stay available to retry");
  assert.ok(button(view.root, "Cancel"), "cancel must stay available after a failed action");
  // Retrying clears the stale error.
  button(view.root, "Cancel").click();
  assert.doesNotMatch(view.root.textContent, /rejected by server/);
});

test("question ids that collide with Object.prototype do not crash the render", () => {
  const view = createView();
  assert.doesNotThrow(() => mount(view, projection({
    questions: [
      { id: "__proto__", question: "Evil one", multiple: false, options: [] },
      { id: "constructor", question: "Evil two", multiple: false, options: [] },
    ],
  })));
  assert.match(view.root.textContent, /Evil one/);
  assert.match(view.root.textContent, /Evil two/);
});

test("a host response id that collides with Object.prototype is ignored", () => {
  const view = createView();
  mount(view, projection());
  assert.doesNotThrow(() => view.send({ jsonrpc: "2.0", id: "__proto__", result: { content: [] } }));
});

test("a host that omits Pi Web extras still renders with safe defaults", () => {
  const view = createView();
  assert.doesNotThrow(() => mount(view, projection()));
  assert.match(view.root.textContent, /Questions from the agent/);
  assert.match(view.root.textContent, /Submit/);
});

test("submitting locks the view and shows the answered summary under each question", () => {
  const view = createView();
  mount(view, projection({
    labels: { submit: "Submit", cancel: "Cancel" },
    questions: [
      { id: "q1", question: "Pick one", multiple: false, options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
      { id: "q2", question: "Which regions?", multiple: true, options: [{ value: "eu", label: "Europe" }] },
    ],
  }));
  optionButton(view.root, "Yes").click();
  optionButton(view.root, "Europe").click();
  const other = nodes(view.root, "input")[1];
  other.value = "on dev only";
  fire(other, "input");

  button(view.root, "Submit").click();

  // The card used to show what was delivered per question once submitted; the
  // view is now the only presentation, so it must keep that behaviour.
  const shown = summaries(view.root);
  assert.deepEqual(shown.map((node) => node.textContent), ["✓ yes", "✓ eu · on dev only"]);
  assert.ok(shown.every((node) => node.style.display === "block"), "locked summaries must be visible");
  assert.match(view.root.textContent, /Submitted/);
  assert.ok(
    nodes(view.root, "button").filter((node) => node.textContent === "Submit" || node.textContent === "Cancel")
      .every((node) => node.disabled === true),
    "actions lock after submit",
  );
  assert.ok(nodes(view.root, "input").concat(nodes(view.root, "textarea")).every((node) => node.disabled === true), "inputs lock after submit");

  // Locked means locked: a late click cannot rewrite what was delivered.
  optionButton(view.root, "No").click();
  assert.deepEqual(summaries(view.root).map((node) => node.textContent), ["✓ yes", "✓ eu · on dev only"]);
  assert.equal(optionButton(view.root, "Europe").attributes["aria-pressed"], "true");
});

test("cancelling locks the view and reports the delivered cancel", () => {
  const view = createView();
  mount(view, projection({ labels: { submit: "Submit", cancel: "Cancel", cancelling: "Cancelling…" } }));
  button(view.root, "Cancel").click();

  const calls = toolsCalls(view);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].params.name, "ask_cancel");
  assert.deepEqual(calls[0].params.arguments, { sessionId: "s1", askId: "a1" });
  assert.match(view.root.textContent, /Cancelling…/);
  assert.ok(nodes(view.root, "input").every((node) => node.disabled === true));
});

test("the supplement box is forwarded with a submit only when it is not blank", () => {
  const view = createView();
  mount(view, projection({ labels: { submit: "Submit", cancel: "Cancel" } }));
  optionButton(view.root, "Yes").click();
  button(view.root, "Submit").click();
  assert.equal(toolsCalls(view).at(-1).params.arguments.supplement, undefined);

  const supplemented = createView();
  mount(supplemented, projection({ labels: { submit: "Submit", cancel: "Cancel" } }));
  optionButton(supplemented.root, "Yes").click();
  const box = nodes(supplemented.root, "textarea")[0];
  box.value = "  extra context  ";
  fire(box, "input");
  button(supplemented.root, "Submit").click();
  assert.equal(toolsCalls(supplemented).at(-1).params.arguments.supplement, "extra context");
  assert.deepEqual(toolsCalls(supplemented).at(-1).params.arguments.answers, [{ id: "q1", values: ["yes"] }]);
});

test("multiple questions keep options and custom text together; single questions stay exclusive", () => {
  const view = createView();
  mount(view, projection({
    labels: { submit: "Submit", cancel: "Cancel", otherPlaceholder: "Other…", multipleOtherPlaceholder: "Add details…" },
    questions: [
      { id: "q1", question: "Single?", multiple: false, options: [{ value: "yes", label: "Yes" }] },
      { id: "q2", question: "Multi?", multiple: true, options: [{ value: "eu", label: "Europe" }] },
    ],
  }));
  const [single, multi] = nodes(view.root, "input");
  assert.equal(single.attributes.placeholder, "Other…");
  assert.equal(multi.attributes.placeholder, "Add details…");

  // Single choice: a custom answer clears the option, picking an option clears the text.
  single.value = "custom";
  fire(single, "input");
  assert.equal(optionButton(view.root, "Yes").attributes["aria-pressed"], "false");
  optionButton(view.root, "Yes").click();
  assert.equal(single.value, "");
  assert.equal(optionButton(view.root, "Yes").attributes["aria-pressed"], "true");

  // Multiple choice: option and custom text coexist and both are delivered.
  optionButton(view.root, "Europe").click();
  multi.value = "plus custom";
  fire(multi, "input");
  assert.equal(optionButton(view.root, "Europe").attributes["aria-pressed"], "true");
  button(view.root, "Submit").click();
  assert.deepEqual(toolsCalls(view).at(-1).params.arguments.answers, [
    { id: "q1", values: ["yes"] },
    { id: "q2", values: ["eu"], otherText: "plus custom" },
  ]);
});
