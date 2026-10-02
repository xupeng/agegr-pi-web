"use client";

import { useEffect } from "react";

interface ViewportHeightState {
  hasFocusedEditable: boolean;
  innerHeight: number;
  viewportHeight: number;
  viewportScale: number;
}

/**
 * Smallest visual-viewport shrink that can only come from the on-screen
 * keyboard. Safari toolbar and safe-area changes stay well below this, so a
 * focused editor is not mistaken for an open keyboard while the page scrolls.
 */
export const KEYBOARD_MIN_HEIGHT_PX = 60;

/**
 * Page zoom shrinks the visual viewport to `innerHeight / scale` on its own.
 * Comparing the raw `innerHeight` reports a keyboard for every zoomed page and
 * makes iOS auto-zoom (or a user pinch) skip the resize, which leaves the
 * composer behind the real keyboard. Compare against the zoomed height instead.
 */
export function shouldUseVisualViewportHeight({
  hasFocusedEditable,
  innerHeight,
  viewportHeight,
  viewportScale,
}: ViewportHeightState): boolean {
  if (!hasFocusedEditable) return false;
  const scale = viewportScale > 0 ? viewportScale : 1;
  return innerHeight / scale - viewportHeight > KEYBOARD_MIN_HEIGHT_PX;
}

function hasFocusedEditableElement(): boolean {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;

  return activeElement.isContentEditable
    || activeElement.tagName === "INPUT"
    || activeElement.tagName === "SELECT"
    || activeElement.tagName === "TEXTAREA";
}

// WebKit reports the shrunken visual viewport only once the keyboard animation
// finishes (bugs.webkit.org 265578), and an IME candidate bar can resize the
// keyboard without any visualViewport event at all. Re-read the geometry for a
// short while after every trigger so the layout lands on the value WebKit
// settles on instead of the mid-animation one.
const SETTLE_DELAYS_MS = [48, 120, 240, 420, 720];

/**
 * Delays (ms) at which the keyboard height is re-checked after an editable
 * element gains focus. The iOS keyboard slides in over ~250-300ms and shells
 * that do not shrink the layout viewport (e.g. a native WKWebView without
 * keyboard avoidance) can skip the visualViewport resize event during the
 * animation, so the immediate post-focus read still sees the full height.
 * Re-checking a few times after focusin covers that window; the checks are
 * idempotent (setting/removing the CSS variable repeatedly is harmless).
 */
export const KEYBOARD_RETRY_DELAYS = [300, 700, 1200] as const;

/**
 * Keep the app height aligned with the visual viewport while a mobile keyboard
 * is open. iOS standalone PWAs can leave 100dvh at the layout viewport height,
 * which puts the composer behind the keyboard and may scroll the page itself.
 */
export function useViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frameId: number | null = null;
    let lastKeyboardOpen = false;
    const retryTimers = new Set<ReturnType<typeof setTimeout>>();
    const settleTimers = new Set<number>();
    let settleChainRunning = false;

    const applyKeyboardHeight = () => {
      const keyboardOpen = shouldUseVisualViewportHeight({
        hasFocusedEditable: hasFocusedEditableElement(),
        innerHeight: window.innerHeight,
        viewportHeight: viewport.height,
        viewportScale: viewport.scale,
      });
      if (keyboardOpen) {
        root.style.setProperty("--app-viewport-height", `${viewport.height}px`);
        // CSS collapses secondary composer chrome while typing so the few
        // hundred pixels above the keyboard go to the conversation.
        root.dataset.keyboardOpen = "true";
      } else {
        root.style.removeProperty("--app-viewport-height");
        delete root.dataset.keyboardOpen;
      }

      // Restore the page position only at the keyboard open/close transition.
      // iOS pushes the layout viewport while the keyboard is up, so the page
      // can come back shifted; scrolling it back on *every* visualViewport
      // event (which also fires during rubber-band overscroll at the top of
      // the chat list) fights the user's gesture and makes the page jitter
      // near the composer. A single scrollTo at the transition restores the
      // shifted page without that fight.
      const isUnscaled = Math.abs(viewport.scale - 1) < 0.01;
      if (keyboardOpen !== lastKeyboardOpen && isUnscaled) {
        if (window.scrollX !== 0 || window.scrollY !== 0) {
          window.scrollTo(0, 0);
        }
      }
      lastKeyboardOpen = keyboardOpen;
    };

    const runUpdate = () => {
      frameId = null;
      applyKeyboardHeight();
    };

    // WebKit can dispatch the resize event before visualViewport.height has
    // settled, especially when an installed PWA dismisses the keyboard. Reading
    // it on the next animation frame prevents the keyboard-height CSS value
    // from remaining after the keyboard has closed.
    const scheduleFrame = () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(runUpdate);
    };

    const clearRetries = () => {
      for (const timer of retryTimers) clearTimeout(timer);
      retryTimers.clear();
    };

    // Re-check a few times after focus so the keyboard slide-in animation (and
    // shells that emit no visualViewport resize while it plays) cannot leave
    // the composer behind the keyboard until the user starts typing.
    const scheduleRetries = () => {
      clearRetries();
      for (const delay of KEYBOARD_RETRY_DELAYS) {
        retryTimers.add(setTimeout(applyKeyboardHeight, delay));
      }
    };

    const onFocusIn = () => {
      scheduleUpdate();
      scheduleRetries();
    };

    const onFocusOut = () => {
      clearRetries();
      scheduleUpdate();
    };

    // Last-resort triggers for shells that never emit the visualViewport
    // resize while the keyboard is up: the first keystroke (or IME input)
    // re-checks the settled viewport height.
    const onEditableInput = () => {
      if (hasFocusedEditableElement()) scheduleUpdate();
    };

    // One chain at a time: a keystroke arriving mid-chain must not restart it,
    // or continuous typing would keep pushing the last re-read into the future.
    const runSettleChain = () => {
      if (settleChainRunning) return;
      settleChainRunning = true;
      let index = 0;
      const step = () => {
        if (index >= SETTLE_DELAYS_MS.length) {
          settleChainRunning = false;
          return;
        }
        const delay = SETTLE_DELAYS_MS[index++];
        const timer = window.setTimeout(() => {
          settleTimers.delete(timer);
          scheduleFrame();
          step();
        }, delay);
        settleTimers.add(timer);
      };
      step();
    };

    const scheduleUpdate = () => {
      scheduleFrame();
      runSettleChain();
    };

    // IME candidate bars resize the keyboard without a visualViewport event.
    const onEditableActivity = () => {
      if (!hasFocusedEditableElement()) return;
      scheduleUpdate();
    };

    scheduleUpdate();
    viewport.addEventListener("resize", scheduleUpdate);
    viewport.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    window.addEventListener("keydown", onEditableInput, true);
    window.addEventListener("input", onEditableInput, true);
    window.addEventListener("pageshow", scheduleUpdate);
    document.addEventListener("compositionstart", onEditableActivity);
    document.addEventListener("compositionupdate", onEditableActivity);
    document.addEventListener("compositionend", onEditableActivity);
    document.addEventListener("keyup", onEditableActivity);

    return () => {
      viewport.removeEventListener("resize", scheduleUpdate);
      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("keydown", onEditableInput, true);
      window.removeEventListener("input", onEditableInput, true);
      window.removeEventListener("pageshow", scheduleUpdate);
      document.removeEventListener("compositionstart", onEditableActivity);
      document.removeEventListener("compositionupdate", onEditableActivity);
      document.removeEventListener("compositionend", onEditableActivity);
      document.removeEventListener("keyup", onEditableActivity);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      clearRetries();
      for (const timer of settleTimers) window.clearTimeout(timer);
      settleTimers.clear();
      root.style.removeProperty("--app-viewport-height");
      delete root.dataset.keyboardOpen;
    };
  }, []);
}
