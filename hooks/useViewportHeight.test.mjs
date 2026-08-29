import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { KEYBOARD_RETRY_DELAYS, shouldUseVisualViewportHeight } = await jiti.import("./useViewportHeight.ts");

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
