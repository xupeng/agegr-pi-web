import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { CHAT_FONT_SIZE_SHORTCUT_ARIA, CHAT_FONT_SIZE_STEP, chatFontSizeShortcutFromKey } =
  await jiti.import("./chat-font-size-shortcut.ts");

const idle = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };
const ctrlShift = { ...idle, ctrlKey: true, shiftKey: true };
const metaShift = { ...idle, metaKey: true, shiftKey: true };

const step = (delta) => ({ kind: "step", delta });
const reset = { kind: "reset" };

test("the step matches the Settings slider and every combo is advertised", () => {
  assert.equal(CHAT_FONT_SIZE_STEP, 1);
  assert.equal(
    CHAT_FONT_SIZE_SHORTCUT_ARIA,
    "Control+Shift+- Meta+Shift+- Control+Shift+= Meta+Shift+= Control+Shift+0 Meta+Shift+0",
  );
});

test("Ctrl+Shift+-/= and Cmd+Shift+-/= step in the right direction", () => {
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Minus", key: "_" }), step(-1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Equal", key: "+" }), step(1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...metaShift, code: "Minus", key: "_" }), step(-1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...metaShift, code: "Equal", key: "+" }), step(1));
});

test("Ctrl/Cmd+Shift+0 asks for the default size instead of a step", () => {
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Digit0", key: ")" }), reset);
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...metaShift, code: "Digit0", key: ")" }), reset);
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Numpad0", key: "0" }), reset);
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, key: "0" }), reset);
});

test("the physical key wins when Shift or a non-US layout changes event.key", () => {
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Minus", key: "?" }), step(-1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Equal", key: "´" }), step(1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Digit0", key: "°" }), reset);
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Minus", key: "=" }), step(-1));
});

test("numpad keys step the same way", () => {
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "NumpadSubtract", key: "-" }), step(-1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "NumpadAdd", key: "+" }), step(1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "NumpadEqual", key: "=" }), step(1));
});

test("events without a code fall back to event.key", () => {
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, key: "-" }), step(-1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, key: "_" }), step(-1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, key: "=" }), step(1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, key: "+" }), step(1));
  assert.deepEqual(chatFontSizeShortcutFromKey({ ...ctrlShift, key: ")" }), reset);
  assert.equal(chatFontSizeShortcutFromKey({ ...ctrlShift, key: "5" }), null);
});

test("bare Ctrl/Cmd zoom, AltGr and composing input stay out of the way", () => {
  // Without Shift these are the browser's own zoom keys.
  assert.equal(chatFontSizeShortcutFromKey({ ...idle, ctrlKey: true, code: "Minus", key: "-" }), null);
  assert.equal(chatFontSizeShortcutFromKey({ ...idle, ctrlKey: true, code: "Equal", key: "=" }), null);
  assert.equal(chatFontSizeShortcutFromKey({ ...idle, ctrlKey: true, code: "Digit0", key: "0" }), null);
  // AltGr is Ctrl+Alt on Windows/Linux layouts.
  assert.equal(chatFontSizeShortcutFromKey({ ...ctrlShift, altKey: true, code: "Minus" }), null);
  assert.equal(chatFontSizeShortcutFromKey({ ...ctrlShift, altKey: true, code: "Digit0" }), null);
  // An unrelated modifier-less or Meta-only press is not a shortcut.
  assert.equal(chatFontSizeShortcutFromKey({ ...idle, code: "Minus" }), null);
  assert.equal(chatFontSizeShortcutFromKey({ ...idle, metaKey: true, code: "Minus" }), null);
  // IME composition wins over everything.
  assert.equal(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Minus", isComposing: true }), null);
});

test("a code outside the shortcut set is ignored even when event.key looks right", () => {
  assert.equal(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Digit5", key: "-" }), null);
  assert.equal(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Escape", key: "-" }), null);
  // Shift+Digit5 is not the 0 reset either.
  assert.equal(chatFontSizeShortcutFromKey({ ...ctrlShift, code: "Digit5", key: ")" }), null);
});
