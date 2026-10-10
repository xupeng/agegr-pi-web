import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const jiti = createJiti(import.meta.url);
const { KEYBOARD_RETRY_DELAYS, shouldUseVisualViewportHeight } = await jiti.import("./useViewportHeight.ts");

// Execute the actual effect with controlled DOM/events and a deterministic
// clock. This tests the hook lifecycle, not native iOS keyboard geometry.
const compiledHook = ts.transpileModule(await readFile(new URL("./useViewportHeight.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function mountViewportHook() {
  const frames = new Map(), timers = new Map(), inline = new Map(), scrolls = [], writes = [], reads = [];
  const model = { appPan: 0, barPan: 0, responsive: true, rectOverride: null };
  let nextId = 0, now = 0, cleanup;
  class Element {
    constructor(tagName) { this.tagName = tagName; this.isContentEditable = false; }
  }
  const root = { dataset: {}, style: {
    setProperty: (name, value) => { writes.push([name, value]); inline.set(name, value); },
    removeProperty: name => { writes.push([name, null]); inline.delete(name); },
    getPropertyValue: name => inline.get(name) ?? "",
  } };
  const doc = Object.assign(new EventTarget(), { documentElement: root, activeElement: new Element("BODY"), visibilityState: "visible" });
  const app = Object.assign(new Element("MAIN"), { isConnected: true, ownerDocument: doc });
  const bar = Object.assign(new Element("DIV"), { isConnected: true, ownerDocument: doc });
  doc.querySelector = selector => selector === "[data-app-viewport]" ? app : selector === ".app-topbar-surface" ? bar : null;
  const viewport = Object.assign(new EventTarget(), { height: 844, scale: 1, offsetTop: 0, pageTop: 0 });
  const setTimer = (fn, delay) => { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; };
  const clearTimer = id => timers.delete(id);
  const win = Object.assign(new EventTarget(), {
    visualViewport: viewport, innerHeight: 844, scrollX: 0, scrollY: 0,
    requestAnimationFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id), setTimeout: setTimer, clearTimeout: clearTimer,
    scrollTo: (x, y) => { scrolls.push([x, y]); win.scrollX = x; win.scrollY = y; },
    getComputedStyle: node => ({ position: "fixed", transform: "none", filter: "none", perspective: "none", contain: "none", willChange: "auto", ...node.computedStyle }),
  });
  for (const [node, key, property] of [[app, "appPan", "--app-viewport-pan-correction"], [bar, "barPan", "--app-topbar-pan-correction"]]) {
    node.getBoundingClientRect = () => {
      const top = (Number.parseFloat(inline.get("--app-viewport-offset-top")) || 0)
        + ((node === app ? model.responsive : model.barResponsive ?? model.responsive) ? Number.parseFloat(inline.get(property)) || 0 : 0) - model[key];
      const height = node === app ? Number.parseFloat(inline.get("--app-viewport-height")) : 36;
      const rect = { top, height, bottom: top + height, width: 402, ...(node === app ? model.rectOverride : null) };
      reads.push({ node: node === app ? "app" : "bar", ...rect });
      return rect;
    };
  }
  const exports = {};
  runInNewContext(compiledHook, { exports, window: win, document: doc, HTMLElement: Element,
    setTimeout: setTimer, clearTimeout: clearTimer,
    require: name => { assert.equal(name, "react"); return { useEffect: fn => { cleanup = fn(); } }; },
  });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(); };
  const emit = (target, type) => target.dispatchEvent(new Event(type));
  const advance = ms => {
    const end = now + ms;
    for (;;) {
      const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry || entry[1].at > end) break;
      const [id, timer] = entry; timers.delete(id); now = timer.at; timer.fn(); flush();
    }
    now = end;
  };
  exports.useViewportHeight();
  return { win, viewport, doc, root, inline, scrolls, frames, timers, flush, emit, advance, app, bar, model, writes, reads,
    focus: () => { doc.activeElement = new Element("TEXTAREA"); emit(win, "focusin"); },
    close: () => cleanup(),
  };
}

test("normal fixed geometry does not add scrollY during late pan/IME; not a model of the device's shifted BCR", () => {
  const h = mountViewportHook();
  try {
    h.flush(); h.focus(); h.flush();
    assert.equal(h.inline.size, 0);
    h.viewport.height = 510; h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.root.dataset.keyboardViewport, "true");
    for (const [offset, scroll, height] of [[80, 120, 510], [160, 120, 470], [90, 0, 490], [0, 150, 490]]) {
      Object.assign(h.viewport, { offsetTop: offset, pageTop: scroll + offset, height });
      h.win.scrollY = scroll;
      h.emit(h.viewport, "scroll"); h.emit(h.doc, "compositionupdate"); h.advance(300); h.flush();
      assert.equal(h.inline.get("--app-viewport-offset-top"), `${offset}px`);
      assert.equal(h.inline.get("--app-viewport-height"), `${height}px`);
      assert.equal(h.win.scrollY, scroll, "ongoing pan is not forcibly scrolled away");
      assert.equal(h.scrolls.length, 0);
      // A controlled document-flow negative control, not WebKit fixed BCR.
      assert.ok((offset + height) - (height - scroll) > 0);
    }
    h.viewport.scale = 2; h.viewport.height = 300;
    h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.root.dataset.keyboardViewport, undefined);
    assert.equal(h.inline.has("--app-viewport-offset-top"), false);
    assert.equal(h.inline.get("--app-viewport-height"), "300px");
    assert.equal(h.win.scrollY, 150);
    h.viewport.scale = 1; h.viewport.height = 490; h.viewport.offsetTop = 40;
    h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.inline.get("--app-viewport-offset-top"), "40px");
    h.viewport.height = 844; h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.root.dataset.keyboardViewport, undefined);
    assert.equal(h.inline.get("--app-viewport-height"), "844px", "focus-scoped latch survives height restoration");
    h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush();
    assert.equal(h.inline.size, 0);
    assert.equal(h.scrolls.length, 1, "only the close transition restores scroll");
  } finally { h.close(); }
});

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} != ${expected}`);
test("20:19 conserved383+429=812 opens once without429 fixed top; zero offset and IME stay latched until blur", () => {
  const h = mountViewportHook();
  try {
    h.win.innerHeight = 812; h.viewport.height = 812; h.flush(); h.focus(); h.flush();
    assert.equal(h.inline.size, 0);
    h.win.innerHeight = 383; h.win.scrollY = 429;
    Object.assign(h.viewport, { height: 383, offsetTop: 429, scale: 1 });
    h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.root.dataset.keyboardOpen, "true");
    assert.equal(h.root.dataset.keyboardViewport, undefined);
    assert.equal(h.inline.get("--app-viewport-height"), "383px");
    assert.equal(h.inline.has("--app-viewport-offset-top"), false);
    assert.equal(h.inline.has("--app-viewport-pan-correction"), false);
    assert.equal(h.inline.has("--app-topbar-pan-correction"), false);
    assert.deepEqual(h.scrolls, [[0, 0]]);
    h.viewport.offsetTop = 0; h.emit(h.viewport, "scroll"); h.flush(); h.advance(1900);
    assert.equal(h.root.dataset.keyboardOpen, "true", "scroll restore must not unlock and oscillate");
    h.win.innerHeight = 350; h.viewport.height = 350; h.win.scrollY = 20;
    h.emit(h.doc, "compositionupdate"); h.flush(); h.advance(1900);
    assert.equal(h.inline.get("--app-viewport-height"), "350px");
    assert.equal(h.root.dataset.keyboardViewport, undefined); assert.equal(h.scrolls.length, 1);
    h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush();
    assert.equal(h.inline.size, 0); assert.equal(h.root.dataset.keyboardOpen, undefined);
    h.win.innerHeight = h.viewport.height = 812; h.win.scrollY = 0; h.emit(h.win, "resize"); h.flush();
    h.focus(); h.flush(); assert.equal(h.inline.size, 0, "fresh hardware focus after blur cannot reuse latch");
  } finally { h.close(); }
});

test("push guard excludes ordinary scroll/pinch and limits baseline conservation to8px", () => {
  for (const [inner, offset, scale, expected] of [[812, 100, 1, false], [383, 429, 2, false], [383, 421, 1, true], [383, 420, 1, false]]) {
    const h = mountViewportHook();
    try {
      h.win.innerHeight = h.viewport.height = 812; h.flush(); h.focus(); h.flush();
      h.win.innerHeight = h.viewport.height = inner; h.viewport.offsetTop = offset; h.viewport.scale = scale;
      h.win.scrollY = offset; h.emit(h.viewport, "scroll"); h.flush();
      assert.equal(h.root.dataset.keyboardOpen === "true", expected);
      assert.equal(h.root.dataset.keyboardViewport, undefined);
      assert.equal(h.inline.has("--app-viewport-offset-top"), false);
      if (!expected) assert.equal(h.scrolls.length, 0, "no signal, no scroll restore");
    } finally { h.close(); }
  }
});

function deliverReportedPan(h, appPan, barPan = appPan) {
  // Separate empirical rectangle-pan input, NOT derived from scrollY.
  // 115 comes from the reported382.66 vs desired497.66; normal fixed uses0.
  h.win.innerHeight = 697; h.win.scrollY = 115;
  Object.assign(h.viewport, { height: 383, scale: 1, offsetTop: 114.66 });
  Object.assign(h.model, { appPan, barPan });
  h.emit(h.viewport, "scroll"); h.flush();
}

test("reported existing697/383/114.66/115/382.66 is measured then corrected; new812/383/0/0 stays383", () => {
  const h = mountViewportHook();
  try {
    h.win.innerHeight = 812; h.viewport.height = 812; h.focus(); h.flush();
    assert.equal(h.inline.size, 0, "reported5.01s editable but no shrink");
    h.viewport.height = 383; h.emit(h.viewport, "resize"); h.flush();
    near(h.app.getBoundingClientRect().bottom, 383);
    assert.equal(h.inline.has("--app-viewport-pan-correction"), false);
    deliverReportedPan(h, 115);
    assert.ok(h.reads.some(r => r.node === "app" && Math.abs(r.bottom - 382.66) < 0.01), "pre-correction measured device-equivalent rectangle");
    assert.equal(h.inline.get("--app-viewport-offset-top"), "114.66px");
    assert.equal(h.inline.get("--app-viewport-pan-correction"), "115px");
    assert.equal(h.inline.get("--app-topbar-pan-correction"), "115px");
    near(h.app.getBoundingClientRect().bottom, 497.66); near(h.bar.getBoundingClientRect().top, 114.66);
    const count = h.writes.length;
    h.advance(1900); h.flush();
    assert.equal(h.writes.length, count, "settle/retry do not reset and re-add correction");
    assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
    assert.equal(h.win.scrollY, 115); assert.equal(h.scrolls.length, 0);
  } finally { h.close(); }
  assert.equal(h.inline.size, 0); assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
});

test("identical scroll115 but normal fixed/mixed independent header geometry gets only its measured correction", () => {
  for (const [appPan, barPan] of [[0, 0], [115, 0], [115, 70]]) {
    const h = mountViewportHook();
    try {
      h.focus(); h.viewport.height = 383; h.flush();
      deliverReportedPan(h, appPan, barPan);
      assert.equal(h.inline.get("--app-viewport-pan-correction"), appPan ? `${appPan}px` : undefined);
      assert.equal(h.inline.get("--app-topbar-pan-correction"), barPan ? `${barPan}px` : undefined);
      near(h.app.getBoundingClientRect().bottom, 497.66); near(h.bar.getBoundingClientRect().top, 114.66);
      assert.equal(h.win.scrollY, 115, "no per-update scrolling");
    } finally { h.close(); }
  }
});

test("late pan reversal and IME retain base height; pinch/blur/close/unmount remove both pan owners", () => {
  const h = mountViewportHook();
  try {
    h.win.innerHeight = 812; h.focus(); h.viewport.height = 383; h.flush(); deliverReportedPan(h, 115);
    h.model.appPan = 90; h.model.barPan = 70; h.viewport.height = 350; h.viewport.offsetTop = 80;
    h.emit(h.doc, "compositionupdate"); h.flush();
    assert.equal(h.inline.get("--app-viewport-height"), "350px");
    assert.equal(h.inline.get("--app-viewport-pan-correction"), "90px");
    near(h.app.getBoundingClientRect().bottom, 430); near(h.bar.getBoundingClientRect().top, 80);
    h.viewport.scale = 2; h.viewport.height = 200; h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.inline.get("--app-viewport-height"), "200px");
    assert.equal(h.inline.has("--app-viewport-pan-correction"), false); assert.equal(h.inline.has("--app-topbar-pan-correction"), false);
    h.viewport.scale = 1; deliverReportedPan(h, 115);
    h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush(); assert.equal(h.inline.size, 0);
    h.model.appPan = h.model.barPan = 0; h.viewport.offsetTop = 0; h.win.innerHeight = 812; h.win.scrollY = 0;
    h.focus(); h.viewport.height = 383; h.flush(); deliverReportedPan(h, 115);
    h.viewport.height = 812; h.win.innerHeight = 812; h.model.appPan = h.model.barPan = 0; h.viewport.offsetTop = 0;
    h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.root.dataset.keyboardViewport, undefined);
    assert.equal(h.inline.get("--app-viewport-height"), "812px");
    assert.equal(h.doc.activeElement.tagName, "TEXTAREA");
    h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush();
    assert.equal(h.inline.size, 0); assert.equal(h.root.dataset.keyboardOpen, undefined);
  } finally { h.close(); }
});

test("uncertain root or non-responsive CSS never publishes a guessed pan correction", () => {
  const cases = [
    h => { h.model.rectOverride = { top: NaN }; },
    h => { h.model.rectOverride = { height: 700 }; },
    h => { h.model.rectOverride = { width: 0 }; },
    h => { h.app.isConnected = false; },
    h => { h.app.computedStyle = { position: "static" }; },
    h => { h.app.parentElement = { computedStyle: { transform: "matrix(1,0,0,1,0,0)" } }; },
    h => { h.model.responsive = false; },
    h => { h.model.responsive = false; h.model.barResponsive = true; },
    h => { h.model.barResponsive = false; },
  ];
  for (const makeUncertain of cases) {
    const h = mountViewportHook();
    try {
      h.focus(); h.viewport.height = 383; h.flush(); makeUncertain(h); deliverReportedPan(h, 115);
      assert.equal(h.inline.has("--app-viewport-pan-correction"), false);
      assert.equal(h.inline.has("--app-topbar-pan-correction"), false, "no partial publication when only one owner responds");
      h.advance(1900); assert.equal(h.inline.has("--app-viewport-pan-correction"), false);
      assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0, "no calibration loop");
    } finally { h.close(); }
  }
});

test("alignment sanitizes absent/negative offset and is removed on blur and unmount", () => {
  const h = mountViewportHook();
  h.focus(); h.viewport.height = 510; h.flush();
  for (const offsetTop of [undefined, NaN, -12]) {
    h.viewport.offsetTop = offsetTop; h.emit(h.viewport, "scroll"); h.flush();
    assert.equal(h.inline.get("--app-viewport-offset-top"), "0px");
  }
  h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush();
  assert.equal(h.root.dataset.keyboardViewport, undefined); assert.equal(h.inline.size, 0);
  h.focus(); h.flush(); h.close();
  assert.equal(h.root.dataset.keyboardViewport, undefined); assert.equal(h.inline.size, 0);
});

// Session-switch characterization: DOM focus inputs are controlled, not
// observations of iOS keeping/dismissing its native keyboard after a remount.
test("session replacement clears keyboard flags on the next frame, not synchronously in focusout", () => {
  const h = mountViewportHook();
  try {
    h.win.innerHeight = 812; h.viewport.height = 812;
    h.focus(); h.flush(); h.viewport.height = 383;
    h.emit(h.viewport, "resize"); h.flush();
    const oldTextarea = h.doc.activeElement;
    assert.equal(h.root.dataset.keyboardOpen, "true");
    h.doc.activeElement = null; // outgoing textarea removed; loading branch
    h.emit(h.win, "focusout");
    assert.equal(h.root.dataset.keyboardOpen, "true", "event only schedules a frame");
    h.flush();
    assert.equal(h.root.dataset.keyboardOpen, undefined);
    assert.equal(h.root.dataset.keyboardViewport, undefined);
    assert.equal(h.inline.size, 0);
    assert.equal(h.viewport.height, 383, "no synthetic native keyboard close");
    h.advance(1800);
    assert.equal(h.root.dataset.keyboardOpen, undefined, "not just a one-frame gap");
    h.focus(); h.flush(); // user normally focuses the incoming textarea
    assert.notEqual(h.doc.activeElement, oldTextarea);
    assert.equal(h.root.dataset.keyboardOpen, "true", "same app-level hook survives the switch");
    h.viewport.height = 350; h.emit(h.doc, "compositionupdate"); h.flush();
    assert.equal(h.inline.get("--app-viewport-height"), "350px");
    h.viewport.height = 812; h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.doc.activeElement.tagName, "TEXTAREA");
    assert.equal(h.inline.get("--app-viewport-height"), "812px", "close retains the authorized focus latch");
    assert.equal(h.root.dataset.keyboardViewport, undefined);
    h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush();
    assert.equal(h.inline.size, 0, "blur releases CSS ownership");
  } finally { h.close(); }
  assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
});

test("loss of editable focus during a pending settle is detected even without focusout delivery", () => {
  const h = mountViewportHook();
  try {
    h.focus(); h.viewport.height = 383; h.flush();
    assert.equal(h.root.dataset.keyboardOpen, "true");
    h.doc.activeElement = null;
    h.advance(48);
    assert.equal(h.root.dataset.keyboardOpen, undefined);
    assert.equal(h.viewport.height, 383);
    h.advance(1800);
    assert.equal(h.inline.size, 0);
  } finally { h.close(); }
});

test("switch with a lingering keyboard and normal blur-dismiss share inputs until visual geometry diverges", () => {
  const traces = [];
  for (const nativeState of ["keyboard temporarily remains", "keyboard dismissal animation"]) {
    const h = mountViewportHook();
    try {
      h.win.innerHeight = 812; h.focus(); h.viewport.height = 383; h.flush();
      h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush();
      const trace = [];
      for (const delay of [0, 48, 300, 1200]) {
        h.advance(delay);
        trace.push([h.win.innerHeight, h.viewport.height, h.viewport.scale, h.root.dataset.keyboardOpen ?? null]);
      }
      assert.equal(h.inline.size, 0, nativeState);
      traces.push(trace);
      h.viewport.height = 812; h.emit(h.viewport, "resize"); h.flush();
      assert.equal(h.inline.size, 0);
    } finally { h.close(); }
  }
  assert.deepEqual(traces[0], traces[1], "labels are not an observable keyboard signal");
});

// Characterization of the failed v10 detector, not acceptance of these states
// as a reliable physical-keyboard signal. Keep the height override decision
// separate from any future keyboard-UI detector when resolving this gap.
test("height-signal episode now latches chrome when innerHeight catches up, until blur", () => {
  const h = mountViewportHook();
  try {
    h.flush(); h.focus(); h.flush();
    const states = [];
    for (const [inner, visual, event] of [
      [844, 510, "resize"], // v10's previous positive model
      [510, 510, "resize"], // layout catches up, keyboard need not have closed
      [510, 470, "compositionupdate"],
      [510, 430, "compositionupdate"],
      [430, 430, "resize"],
      [844, 844, "resize"], // close, focus retained
    ]) {
      h.win.innerHeight = inner; h.viewport.height = visual;
      h.emit(event === "compositionupdate" ? h.doc : h.viewport, event);
      h.flush(); h.advance(1800);
      states.push(h.root.dataset.keyboardOpen === "true");
      assert.equal(h.doc.activeElement.tagName, "TEXTAREA");
    }
    assert.deepEqual(states, [true, true, true, true, true, true]);
    h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush();
    assert.equal(h.inline.size, 0);
  } finally { h.close(); }
});

test("joint resize cannot be distinguished from focused hardware-keyboard window resize by current inputs", () => {
  const traces = [];
  for (const scenario of ["software keyboard with layout avoidance", "hardware keyboard plus window resize"]) {
    const h = mountViewportHook();
    try {
      h.flush(); h.focus(); h.flush();
      const flags = [h.root.dataset.keyboardOpen === "true"];
      for (const height of [700, 510, 480, 510, 844]) {
        h.win.innerHeight = height; h.viewport.height = height;
        h.emit(h.win, "resize"); h.emit(h.doc, "compositionupdate"); h.flush(); h.advance(1800);
        flags.push(h.root.dataset.keyboardOpen === "true");
        assert.equal(h.inline.size, 0, scenario);
      }
      traces.push(flags);
    } finally { h.close(); }
  }
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[0], [false, false, false, false, false, false]);
});

test("focus loss and page return independently gate the original height detector", () => {
  const h = mountViewportHook();
  try {
    h.flush(); h.focus(); h.flush();
    assert.equal(h.root.dataset.keyboardOpen, undefined, "focus/hardware keyboard alone is insufficient");
    h.viewport.scale = 2; h.viewport.height = 422; h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.root.dataset.keyboardOpen, undefined, "pure pinch is not a keyboard");
    h.viewport.height = 300; h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.root.dataset.keyboardOpen, "true");
    assert.equal(h.root.dataset.keyboardViewport, undefined, "alignment is separately scale-gated");
    h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush();
    assert.equal(h.root.dataset.keyboardOpen, undefined);
    h.emit(h.win, "pageshow"); h.flush();
    assert.equal(h.root.dataset.keyboardOpen, undefined, "page return without editable focus is insufficient");
    h.focus(); h.flush(); assert.equal(h.root.dataset.keyboardOpen, "true");
    h.viewport.height = 422; h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.root.dataset.keyboardOpen, undefined, "close can retain focus and zoom");
  } finally { h.close(); }
});

test("effect initializes without an inline height; focus-preserving close clears alignment, blur releases latch", () => {
  const h = mountViewportHook();
  try {
    h.flush(); assert.equal(h.inline.has("--app-viewport-height"), false);
    h.focus(); h.flush(); assert.equal(h.inline.size, 0, "focus alone must not resize the app");
    h.viewport.height = 510; h.advance(300);
    assert.equal(h.inline.get("--app-viewport-height"), "510px");
    assert.equal(h.root.dataset.keyboardOpen, "true");
    h.viewport.height = 470; h.emit(h.doc, "compositionupdate"); h.flush();
    assert.equal(h.inline.get("--app-viewport-height"), "470px");
    h.viewport.height = 844; h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.doc.activeElement.tagName, "TEXTAREA", "keyboard can close without blur");
    assert.equal(h.inline.get("--app-viewport-height"), "844px");
    assert.equal(h.root.dataset.keyboardOpen, "true");
    assert.equal(h.root.dataset.keyboardViewport, undefined);
    h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush();
    assert.equal(h.inline.size, 0);
    assert.deepEqual(h.scrolls, []);
  } finally { h.close(); }
});

test("effect restores document scroll only on unscaled keyboard transitions, never initial/ongoing scroll", () => {
  const h = mountViewportHook();
  try {
    h.win.scrollY = 18; h.flush(); assert.equal(h.scrolls.length, 0);
    h.viewport.height = 510; h.focus(); h.flush(); assert.equal(h.scrolls.length, 1);
    h.win.scrollY = 14; h.emit(h.viewport, "scroll"); h.flush();
    h.viewport.height = 470; h.emit(h.doc, "compositionupdate"); h.flush(); h.advance(1200);
    assert.equal(h.scrolls.length, 1, "IME/settle/inner overscroll events are not new transitions");
    h.viewport.height = 844; h.emit(h.viewport, "resize"); h.flush(); assert.equal(h.scrolls.length, 1, "restored height with focus is not latch close");
    h.doc.activeElement = null; h.emit(h.win, "focusout"); h.flush(); assert.equal(h.scrolls.length, 2);
    h.win.scrollY = 8; h.emit(h.viewport, "scroll"); h.flush(); h.advance(2000);
    assert.equal(h.scrolls.length, 2); assert.equal(h.win.scrollY, 8);
  } finally { h.close(); }
});

test("effect preserves pinch position and only applies height when zoom-adjusted keyboard shrink is real", () => {
  const h = mountViewportHook();
  try {
    h.viewport.scale = 2; h.viewport.height = 422; h.win.scrollY = 120; h.focus(); h.flush();
    assert.equal(h.inline.size, 0);
    h.viewport.height = 300; h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.inline.get("--app-viewport-height"), "300px");
    h.viewport.height = 422; h.emit(h.viewport, "resize"); h.flush();
    assert.equal(h.inline.size, 0); assert.equal(h.win.scrollY, 120); assert.deepEqual(h.scrolls, []);
  } finally { h.close(); }
});

test("effect does not multiply settle chains and cleans timers, listeners and inline state on unmount", () => {
  const h = mountViewportHook();
  h.viewport.height = 510; h.focus(); h.flush();
  const timerCount = h.timers.size;
  for (let i = 0; i < 100; i++) h.emit(h.win, "input");
  assert.equal(h.timers.size, timerCount); assert.equal(h.frames.size, 1);
  h.close();
  assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0); assert.equal(h.inline.size, 0);
  assert.equal(h.root.dataset.keyboardOpen, undefined);
  h.emit(h.win, "focusin"); h.emit(h.viewport, "resize"); h.emit(h.doc, "compositionupdate");
  h.advance(2000); h.flush();
  assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0); assert.equal(h.inline.size, 0);
});

test("uses the visual viewport for a focused editor when the keyboard shrinks it", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  }), true);
});

test("does not keep the keyboard height after the visual viewport restores", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 844,
    viewportScale: 1,
  }), false);
});

test("restores the dynamic height as soon as the editor loses focus", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: false,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  }), false);
});

test("does not mistake pinch zoom for an open keyboard", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 422,
    viewportScale: 2,
  }), false);
});

test("keeps the dynamic viewport height when the visual viewport is not reduced", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 844,
    viewportScale: 1,
  }), false);
});

test("retries the keyboard-height check shortly after focus to survive the slide-in animation", () => {
  // The first retry must land inside the ~250-300ms iOS keyboard animation
  // window so a shell that emits no visualViewport resize still recovers
  // before the user starts typing. Later retries cover slow shells.
  assert.ok(KEYBOARD_RETRY_DELAYS.length >= 3, "re-check more than once after focus");
  assert.ok(KEYBOARD_RETRY_DELAYS[0] <= 500, `first retry within the keyboard animation window, got ${KEYBOARD_RETRY_DELAYS[0]}`);
  for (let i = 1; i < KEYBOARD_RETRY_DELAYS.length; i++) {
    assert.ok(KEYBOARD_RETRY_DELAYS[i] > KEYBOARD_RETRY_DELAYS[i - 1], "retry delays increase");
  }
});

test("an immediate post-focus read that sees the full height is corrected once the keyboard shrinks", () => {
  // Focus lands while the keyboard animation has not started (full height),
  // so the first check says "no keyboard". A later check inside the retry
  // window sees the shrunk visual viewport and flips to keyboard mode.
  const beforeSlideIn = shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 844,
    viewportScale: 1,
  });
  const afterSlideIn = shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 1,
  });
  assert.equal(beforeSlideIn, false);
  assert.equal(afterSlideIn, true);
});

// iOS auto-zooms the page when a < 16px editable takes focus, and a user pinch
// zooms it too. The composer must still follow the keyboard in those cases.
test("detects the keyboard while the page is zoomed", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 350,
    viewportScale: 1.3,
  }), true);
});

test("ignores the Safari toolbar shift while an editor is focused", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 806,
    viewportScale: 1,
  }), false);
});

test("falls back to an unscaled comparison for a missing scale", () => {
  assert.equal(shouldUseVisualViewportHeight({
    hasFocusedEditable: true,
    innerHeight: 844,
    viewportHeight: 510,
    viewportScale: 0,
  }), true);
});
