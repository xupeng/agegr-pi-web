"use client";

import { useEffect } from "react";

interface ViewportHeightState {
  hasFocusedEditable: boolean;
  innerHeight: number;
  viewportHeight: number;
  viewportScale: number;
}

export function shouldUseVisualViewportHeight({
  hasFocusedEditable,
  innerHeight,
  viewportHeight,
  viewportScale,
}: ViewportHeightState): boolean {
  const isUnscaled = Math.abs(viewportScale - 1) < 0.01;
  return hasFocusedEditable && isUnscaled && innerHeight - viewportHeight > 1;
}

function hasFocusedEditableElement(): boolean {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;

  return activeElement.isContentEditable
    || activeElement.tagName === "INPUT"
    || activeElement.tagName === "SELECT"
    || activeElement.tagName === "TEXTAREA";
}

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

    const applyKeyboardHeight = () => {
      const keyboardOpen = shouldUseVisualViewportHeight({
        hasFocusedEditable: hasFocusedEditableElement(),
        innerHeight: window.innerHeight,
        viewportHeight: viewport.height,
        viewportScale: viewport.scale,
      });
      if (keyboardOpen) {
        root.style.setProperty("--app-viewport-height", `${viewport.height}px`);
      } else {
        root.style.removeProperty("--app-viewport-height");
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
    const scheduleUpdate = () => {
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

    scheduleUpdate();
    viewport.addEventListener("resize", scheduleUpdate);
    viewport.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    window.addEventListener("keydown", onEditableInput, true);
    window.addEventListener("input", onEditableInput, true);
    window.addEventListener("pageshow", scheduleUpdate);

    return () => {
      viewport.removeEventListener("resize", scheduleUpdate);
      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("keydown", onEditableInput, true);
      window.removeEventListener("input", onEditableInput, true);
      window.removeEventListener("pageshow", scheduleUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      clearRetries();
      root.style.removeProperty("--app-viewport-height");
    };
  }, []);
}
