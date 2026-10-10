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
    let expandedInnerHeight: number | null = null;
    let keyboardLatched = false;
    const retryTimers = new Set<ReturnType<typeof setTimeout>>();
    const settleTimers = new Set<number>();
    let settleChainRunning = false;

    const setPixelProperty = (name: string, value: number) => {
      const next = `${value}px`;
      if (root.style.getPropertyValue(name) !== next) root.style.setProperty(name, next);
    };
    const clearProperty = (name: string) => {
      if (root.style.getPropertyValue(name)) root.style.removeProperty(name);
    };
    const clearPan = () => {
      clearProperty("--app-viewport-pan-correction");
      clearProperty("--app-topbar-pan-correction");
    };
    const trustedFixedRect = (node: HTMLElement | null, expectedHeight?: number): DOMRect | null => {
      if (!node?.isConnected || node.ownerDocument !== document || document.visibilityState !== "visible") return null;
      if (window.getComputedStyle(node).position !== "fixed") return null;
      // Only calibrate an untransformed viewport-fixed owner. A different
      // containing block or scale makes a CSS-pixel delta unsafe to apply.
      for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
        const css = window.getComputedStyle(ancestor);
        if (css.transform !== "none" || css.filter !== "none" || css.perspective !== "none"
          || css.contain !== "none" || /transform|filter|perspective/.test(css.willChange)
          || (css.translate && css.translate !== "none") || (css.rotate && css.rotate !== "none")
          || (css.scale && css.scale !== "none")) return null;
      }
      const rect = node.getBoundingClientRect();
      if (![rect.top, rect.bottom, rect.height, rect.width].every(Number.isFinite)
        || rect.width <= 0 || rect.height <= 0 || Math.abs(rect.bottom - rect.top - rect.height) > 1
        || (expectedHeight !== undefined && Math.abs(rect.height - expectedHeight) > 1)) return null;
      return rect;
    };
    const calibrateFixedTop = (node: HTMLElement, before: DOMRect, name: string, target: number, expectedHeight?: number) => {
      const error = target - before.top;
      if (Math.abs(error) <= 1) return; // Ignore subpixel noise; stable settles do not rewrite styles.
      const previous = root.style.getPropertyValue(name);
      const current = Number.parseFloat(previous) || 0;
      const next = Math.round((current + error) * 100) / 100;
      const limit = Math.max(viewport.height, Number.isFinite(window.innerHeight) ? window.innerHeight : 0);
      if (!Number.isFinite(next) || Math.abs(next) > limit) return;
      if (next === 0) clearProperty(name); else setPixelProperty(name, next);
      // One write/read, never a correction loop or a self-scheduled frame.
      // Missing/stale CSS, non-unit response or moving geometry rolls back.
      const after = trustedFixedRect(node, expectedHeight);
      if (!after || Math.abs(after.top - target) > 1) {
        if (previous) root.style.setProperty(name, previous); else clearProperty(name);
      }
    };

    const applyKeyboardHeight = () => {
      const hasFocusedEditable = hasFocusedEditableElement();
      const heightSignal = shouldUseVisualViewportHeight({
        hasFocusedEditable,
        innerHeight: window.innerHeight,
        viewportHeight: viewport.height,
        viewportScale: viewport.scale,
      });
      const isUnscaled = Math.abs(viewport.scale - 1) < 0.01;
      const top = Number.isFinite(viewport.offsetTop) ? Math.max(0, viewport.offsetTop) : 0;
      if (!hasFocusedEditable) keyboardLatched = false;
      // A shrunken layout viewport can equal VV while being pushed down by
      // the missing expanded height. Ordinary scroll does not conserve it.
      const pushedKeyboard = hasFocusedEditable && isUnscaled
        && expandedInnerHeight !== null && top > KEYBOARD_MIN_HEIGHT_PX
        && Math.abs(window.innerHeight + top - expandedInnerHeight) <= 8;
      if (hasFocusedEditable && isUnscaled && (heightSignal || pushedKeyboard)) keyboardLatched = true;
      const keyboardOpen = isUnscaled ? keyboardLatched : heightSignal;
      // Update only outside an identified keyboard episode; never replace the
      // expanded baseline with the keyboard's shrunken height or pinch input.
      if (isUnscaled && !keyboardLatched && top <= KEYBOARD_MIN_HEIGHT_PX
        && Number.isFinite(window.innerHeight) && window.innerHeight > 0) expandedInnerHeight = window.innerHeight;
      // offsetTop is the base, not an assumption about every browser's fixed
      // BCR response to page pan. Measure that response below; never add scrollY.
      if (heightSignal && isUnscaled) {
        setPixelProperty("--app-viewport-offset-top", top);
        if (root.dataset.keyboardViewport !== "true") root.dataset.keyboardViewport = "true";
      } else {
        clearProperty("--app-viewport-offset-top");
        clearPan();
        delete root.dataset.keyboardViewport;
      }
      if (keyboardOpen) {
        setPixelProperty("--app-viewport-height", viewport.height);
        // CSS collapses secondary composer chrome while typing so the few
        // hundred pixels above the keyboard go to the conversation.
        if (root.dataset.keyboardOpen !== "true") root.dataset.keyboardOpen = "true";
      } else {
        clearProperty("--app-viewport-height");
        delete root.dataset.keyboardOpen;
      }

      // Restore the page position only at the keyboard open/close transition.
      // iOS pushes the layout viewport while the keyboard is up, so the page
      // can come back shifted; scrolling it back on *every* visualViewport
      // event (which also fires during rubber-band overscroll at the top of
      // the chat list) fights the user's gesture and makes the page jitter
      // near the composer. A single scrollTo at the transition restores the
      // shifted page without that fight.
      if (keyboardOpen !== lastKeyboardOpen && isUnscaled) {
        if (window.scrollX !== 0 || window.scrollY !== 0) {
          window.scrollTo(0, 0);
        }
      }
      lastKeyboardOpen = keyboardOpen;

      // Read after height/fixed CSS and the existing transition-only restore.
      // A panned device can differ from Chromium's normal fixed coordinates.
      if (heightSignal && isUnscaled) {
        const app = document.querySelector<HTMLElement>("[data-app-viewport]");
        const rect = trustedFixedRect(app, viewport.height);
        if (app && rect) {
          const previousApp = root.style.getPropertyValue("--app-viewport-pan-correction");
          const previousBar = root.style.getPropertyValue("--app-topbar-pan-correction");
          const target = Number.isFinite(viewport.offsetTop) ? Math.max(0, viewport.offsetTop) : 0;
          calibrateFixedTop(app, rect, "--app-viewport-pan-correction", target, viewport.height);
          // The standalone header is independently fixed: do not infer its
          // pan from the app. A relative header already travels with the app.
          const bar = document.querySelector<HTMLElement>(".app-topbar-surface");
          const barRect = trustedFixedRect(bar);
          if (bar && barRect) calibrateFixedTop(bar, barRect, "--app-topbar-pan-correction", target);
          else clearProperty("--app-topbar-pan-correction");
          // Do not publish a half-aligned pair when only one CSS consumer
          // responds (e.g. a stale rule) or geometry changes between reads.
          if (bar && barRect) {
            const finalApp = trustedFixedRect(app, viewport.height);
            const finalBar = trustedFixedRect(bar);
            if (!finalApp || !finalBar || Math.abs(finalApp.top - target) > 1 || Math.abs(finalBar.top - target) > 1) {
              for (const [name, previous] of [["--app-viewport-pan-correction", previousApp], ["--app-topbar-pan-correction", previousBar]]) {
                if (previous && root.style.getPropertyValue(name) !== previous) root.style.setProperty(name, previous);
                else if (!previous) clearProperty(name);
              }
            }
          }
        } else clearPan();
      }
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
      keyboardLatched = false;
      expandedInnerHeight = null;
      settleTimers.clear();
      root.style.removeProperty("--app-viewport-height");
      root.style.removeProperty("--app-viewport-offset-top");
      clearPan();
      delete root.dataset.keyboardViewport;
      delete root.dataset.keyboardOpen;
    };
  }, []);
}
