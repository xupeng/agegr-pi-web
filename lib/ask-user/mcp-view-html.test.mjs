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
    focused: false,
    style: {
      props: {},
      setProperty(key, value) { this.props[key] = String(value); },
    },
    focus() { this.focused = true; },
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
    head: makeElement("head"),
    getElementById: (id) => (id === "pi-web-ask-root" ? root : null),
    createElement: (tag) => makeElement(tag),
    createTextNode: (value) => ({ textContent: String(value) }),
    fonts: {
      ready: Promise.resolve(),
      add: (face) => { faces.push(face); },
    },
  };
  const posted = [];
  const listeners = {};
  const faces = [];
  const window = {
    location: { origin: "null" },
    parent: {
      postMessage: (message, target) => posted.push({ message, target }),
      location: { get origin() { throw new Error("SecurityError"); } },
    },
    addEventListener: (type, handler) => { (listeners[type] ||= []).push(handler); },
    // The real frame installs Pi Web's faces from the bytes the host posts.
    FontFace: class {
      constructor(family, data, options) {
        this.family = family;
        this.data = data;
        this.options = options ?? {};
      }
      load() { return Promise.resolve(this); }
    },
  };
  new Function("window", "document", ASK_USER_VIEW_SCRIPT)(window, document);
  return {
    root,
    documentElement,
    head: document.head,
    posted,
    faces,
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

function fire(node, type, event = {}) {
  (node.listeners[type] || []).forEach((handler) => handler(event));
}

function toolsCalls(view) {
  return view.posted.map((entry) => entry.message).filter((message) => message?.method === "tools/call");
}

function summaries(root) {
  return nodes(root, "div").filter((node) => node.textContent.startsWith("✓ "));
}

/** A woff2 payload: the four signature bytes plus filler. */
function woff2(bytes = 64) {
  const data = new Uint8Array(bytes);
  data.set([0x77, 0x4f, 0x46, 0x32]);
  return data.buffer;
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
  assert.equal(optionButton(view.root, "Europe").attributes["aria-checked"], "true");
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
  assert.equal(optionButton(view.root, "Yes").attributes["aria-checked"], "false");
  optionButton(view.root, "Yes").click();
  assert.equal(single.value, "");
  assert.equal(optionButton(view.root, "Yes").attributes["aria-checked"], "true");

  // Multiple choice: option and custom text coexist and both are delivered.
  optionButton(view.root, "Europe").click();
  multi.value = "plus custom";
  fire(multi, "input");
  assert.equal(optionButton(view.root, "Europe").attributes["aria-checked"], "true");
  button(view.root, "Submit").click();
  assert.deepEqual(toolsCalls(view).at(-1).params.arguments.answers, [
    { id: "q1", values: ["yes"] },
    { id: "q2", values: ["eu"], otherText: "plus custom" },
  ]);
});

test("host tokens are mirrored into the frame and unusable values fall back", () => {
  const view = createView();
  mount(view, projection({
    tokens: {
      bg: "#f4f8f7",
      bgPanel: "#e9f0ee",
      border: "#afc4ba",
      accent: "#1e6559",
      maxWidth: "900px",
      injected: "#ff0000",
      textDim: "#fff; background:url(https://evil.example/x.png)",
      text: "var(--text)",
    },
  }));

  const props = view.documentElement.style.props;
  // mist's palette, not the view's own defaults
  assert.equal(props["--pi-bg"], "#f4f8f7");
  assert.equal(props["--pi-bg-panel"], "#e9f0ee");
  assert.equal(props["--pi-border"], "#afc4ba");
  assert.equal(props["--pi-accent"], "#1e6559");
  assert.equal(props["--pi-max-width"], "900px");
  // rejected or absent values keep Pi Web's light defaults
  assert.equal(props["--pi-text"], "#1a1a1a");
  assert.equal(props["--pi-text-dim"], "#5e6673");
  assert.equal(props["--pi-bg-hover"], "#eeeeee");
  assert.equal("--pi-injected" in props, false);
  // the injected rule is installed once, from the frame's own stylesheet
  assert.equal(nodes(view.root, "style").length, 0);
});

test("the host's font bytes are installed as faces, and installed only once", () => {
  const view = createView();
  const face = {
    family: "LXGW WenKai Screen",
    style: "normal",
    weight: "400",
    unicodeRange: "U+4E00-9FFF",
    data: woff2(),
  };
  mount(view, projection({ fonts: [face] }));
  assert.equal(view.faces.length, 1);
  assert.equal(view.faces[0].family, "LXGW WenKai Screen");
  assert.equal(view.faces[0].options.style, "normal");
  assert.equal(view.faces[0].options.weight, "400");
  assert.equal(view.faces[0].options.unicodeRange, "U+4E00-9FFF");
  assert.equal(view.faces[0].options.display, "swap");
  assert.equal(view.faces[0].data.byteLength, 64);

  // A re-render with the same payload must not restart the font loads.
  mount(view, projection({ fonts: [{ ...face, data: woff2() }] }));
  assert.equal(view.faces.length, 1);

  // A new subset is added; the installed ones stay.
  mount(view, projection({ fonts: [face, { ...face, unicodeRange: "U+3400-4DBF", data: woff2(96) }] }));
  assert.equal(view.faces.length, 3);
});

test("font payloads the frame did not expect are never installed", () => {
  const valid = {
    family: "Oxanium",
    style: "normal",
    weight: "300 700",
    unicodeRange: "U+0000-00FF,U+0131",
    data: woff2(),
  };
  const cases = [
    [undefined, "no payload"],
    ["a string", "wrong type"],
    [42, "wrong type"],
    [[], "empty list"],
    [Array.from({ length: 129 }, () => valid), "over the face limit"],
    [[{ ...valid, family: "Comic Sans MS" }], "family outside the app's own"],
    [[{ ...valid, data: "not a buffer" }], "no bytes"],
    [[{ ...valid, data: new Uint8Array([1, 2, 3, 4]).buffer }], "not a woff2 file"],
    [[{ ...valid, data: new ArrayBuffer(0) }], "empty file"],
    [[{ ...valid, unicodeRange: "all" }], "unreadable unicode range"],
    [[{ ...valid, unicodeRange: "U+0000-00FF; } body { background: url(https://evil.example/x)" }], "escaping range"],
    [[{ ...valid, style: "oblique url(https://evil.example/x)" }], "escaping style"],
    [[{ ...valid, weight: "700 !important" }], "escaping weight"],
  ];
  for (const [fonts, label] of cases) {
    const view = createView();
    mount(view, projection({ fonts }));
    assert.equal(view.faces.length, 0, label);
  }
  // A frame that never receives faces keeps its system fallbacks.
  const view = createView();
  mount(view, projection());
  assert.equal(view.faces.length, 0);
  assert.match(view.documentElement.style.fontFamily, /system-ui/);
});

test("color-scheme follows the host instead of the theme name", () => {
  const pine = createView();
  mount(pine, projection({ theme: "pine", colorScheme: "dark" }));
  assert.equal(pine.documentElement.style.colorScheme, "dark");

  const mist = createView();
  mount(mist, projection({ theme: "mist", colorScheme: "light" }));
  assert.equal(mist.documentElement.style.colorScheme, "light");

  // older projections only carry a theme name
  const legacy = createView();
  mount(legacy, projection({ theme: "dark" }));
  assert.equal(legacy.documentElement.style.colorScheme, "dark");
});

test("options expose radio and checkbox semantics with a roving tabindex", () => {
  const view = createView();
  mount(view, projection({
    questions: [
      { id: "q1", question: "Single?", multiple: false, options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
      { id: "q2", question: "Multi?", multiple: true, options: [{ value: "eu", label: "Europe" }] },
    ],
  }));
  const yes = optionButton(view.root, "Yes");
  const no = optionButton(view.root, "No");
  const europe = optionButton(view.root, "Europe");

  assert.equal(yes.attributes.role, "radio");
  assert.equal(europe.attributes.role, "checkbox");
  assert.equal(yes.attributes.tabindex, "0");
  assert.equal(no.attributes.tabindex, "-1");
  assert.equal(europe.attributes.tabindex, undefined);
  assert.equal(yes.children[0].attributes["aria-hidden"], "true", "the state glyph is decorative");

  const groups = nodes(view.root, "div").filter((node) => ["radiogroup", "group"].includes(node.attributes.role));
  assert.deepEqual(groups.map((node) => node.attributes.role), ["radiogroup", "group"]);
  assert.equal(groups[0].attributes["aria-labelledby"], "pi-web-ask-q-0");
  const label = view.root.findAll().find((node) => node.attributes.id === "pi-web-ask-q-0");
  assert.equal(label.textContent, "Single?");

  yes.click();
  assert.equal(yes.attributes["aria-checked"], "true");
  fire(yes, "keydown", { key: "ArrowDown", preventDefault() {} });
  assert.equal(yes.attributes["aria-checked"], "false");
  assert.equal(no.attributes["aria-checked"], "true");
  assert.equal(no.attributes.tabindex, "0");
  assert.equal(no.focused, true, "arrows move focus with the selection");

  fire(no, "keydown", { key: "ArrowDown", preventDefault() {} });
  assert.equal(yes.attributes["aria-checked"], "true", "arrows wrap");
  fire(yes, "keydown", { key: "End", preventDefault() {} });
  assert.equal(no.attributes["aria-checked"], "true");
  fire(no, "keydown", { key: "Home", preventDefault() {} });
  assert.equal(yes.attributes["aria-checked"], "true");

  // An empty radiogroup behaves like a native one: a forward arrow selects the
  // first option, a backward arrow selects the last.
  const fresh = createView();
  mount(fresh, projection({
    questions: [{ id: "q1", question: "Single?", multiple: false, options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] }],
  }));
  fire(optionButton(fresh.root, "No"), "keydown", { key: "ArrowDown", preventDefault() {} });
  assert.equal(optionButton(fresh.root, "Yes").attributes["aria-checked"], "true");
  fire(optionButton(fresh.root, "Yes"), "keydown", { key: "ArrowUp", preventDefault() {} });
  assert.equal(optionButton(fresh.root, "No").attributes["aria-checked"], "true");

  // checkbox groups keep every option in the tab order and ignore arrow keys
  fire(europe, "keydown", { key: "ArrowDown", preventDefault() {} });
  assert.equal(europe.attributes["aria-checked"], "false");
});

test("the answered counter and the locked footer are announced", () => {
  const view = createView();
  mount(view, projection({ labels: { submit: "Submit", cancel: "Cancel" } }));
  const counter = nodes(view.root, "div").find((node) => node.attributes["aria-live"] === "polite" && /answered/.test(node.textContent));
  assert.ok(counter, "the counter is a polite live region");

  optionButton(view.root, "Yes").click();
  assert.match(counter.textContent, /1 of 1 answered/);
  assert.equal(optionButton(view.root, "Yes").attributes["aria-checked"], "true");

  button(view.root, "Submit").click();
  const status = nodes(view.root, "div").find((node) => node.attributes.role === "status");
  assert.ok(status, "the locked footer is a status region");
  assert.equal(status.focused, true, "focus lands on the status when the controls disable");
  assert.equal(nodes(view.root, "textarea")[0].attributes["aria-label"], "Additional info (optional)");
  assert.equal(nodes(view.root, "input")[0].attributes["aria-label"], "Type your own answer…");
});

test("form controls inherit the host font and mobile text autosizing is off", () => {
  const view = createView();
  mount(view, projection());
  const injected = view.head.children.map((node) => node.textContent).join("");
  // UA stylesheets give button/input/textarea their own family, which on a phone
  // rendered the option rows in the platform UI font under a question that used
  // the host stack - the reported "wrong font".
  assert.match(injected, /button,input,textarea\{font-family:inherit;\}/);
  // -webkit- prefix and the standard property: WebKit needs the first, Blink and
  // Gecko read the second.
  assert.match(injected, /-webkit-text-size-adjust:100%;text-size-adjust:100%/);
  assert.match(injected, /button:focus-visible,input:focus-visible,textarea:focus-visible\{outline:/);
});

test("question blocks keep the native card's spacing and small metrics", () => {
  const view = createView();
  mount(view, projection({
    questions: [
      { id: "q1", question: "First?", multiple: false, options: [{ value: "a", label: "A" }] },
      { id: "q2", question: "Second?", multiple: false, options: [{ value: "b", label: "B" }] },
    ],
  }));
  const questionBlocks = view.root.findAll().filter((node) => node.tagName === "div" && /font-size:calc\(12.5px/.test(node.attributes.style || "") && /overflow-wrap:anywhere/.test(node.attributes.style || ""));
  assert.equal(questionBlocks.length, 2);
  // The list is a grid with the card's 14px row gap: without it consecutive
  // questions render flush against each other (measured 0px between blocks).
  // The shim has no parentElement, so locate the list by the contract itself.
  const list = nodes(view.root, "div").find((node) => /display:grid;gap:14px;/.test(node.attributes.style || ""));
  assert.ok(list, "the question list is a grid with the card's 14px gap");
  assert.match(list.attributes.style, /padding:12px 14px;/);
  assert.equal(list.children.length, 2, "both questions live in that one list");

  // Glyph opacity, submit padding and the hint colour are the card's values.
  const glyph = optionButton(view.root, "A").children[0];
  assert.match(glyph.attributes.style, /opacity:0.85;/);
  assert.match(button(view.root, "Submit").attributes.style, /padding:7px 16px;/);
  assert.match(button(view.root, "Cancel").attributes.style, /padding:7px 14px;/);
  const hint = nodes(view.root, "div").find((node) => /--pi-text-dim/.test(node.attributes.style || "") && /line-height:1.45/.test(node.attributes.style || ""));
  assert.ok(hint, "the footer hint uses --text-dim like the card, not --text-muted");
});
