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
