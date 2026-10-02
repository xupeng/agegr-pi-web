"use client";

import { useSyncExternalStore } from "react";

// Mobile breakpoint shared with app/globals.css (max-width: 640px).
const MOBILE_QUERY = "(max-width: 640px)";
// Narrow phones keep secondary toolbar actions behind the More button.
const NARROW_MOBILE_QUERY = "(max-width: 480px)";
// Touch-first devices (phones, tablets incl. iPad at widths above the 640px
// breakpoint, e.g. iPad mini portrait at 744px). Matches the primary input
// device regardless of viewport width, so keyboard Enter must not be treated
// as a desktop send shortcut on these devices.
const TOUCH_QUERY = "(pointer: coarse)";
// A pointer that can rest on a target without clicking it. Hover-revealed UI
// must stay click-reachable on a touch screen, where `mouseenter` fires only
// as part of a tap.
const HOVER_QUERY = "(hover: hover)";

function subscribeToQuery(query: string, cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(query);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function queryMatches(query: string): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

const subscribeMobile = (cb: () => void) => subscribeToQuery(MOBILE_QUERY, cb);
const getMobileSnapshot = () => queryMatches(MOBILE_QUERY);
const subscribeNarrowMobile = (cb: () => void) => subscribeToQuery(NARROW_MOBILE_QUERY, cb);
const getNarrowMobileSnapshot = () => queryMatches(NARROW_MOBILE_QUERY);
const subscribeTouch = (cb: () => void) => subscribeToQuery(TOUCH_QUERY, cb);
const getTouchSnapshot = () => queryMatches(TOUCH_QUERY);
const subscribeHover = (cb: () => void) => subscribeToQuery(HOVER_QUERY, cb);
const getHoverSnapshot = () => queryMatches(HOVER_QUERY);

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Returns true when the viewport is at or below the mobile breakpoint.
 * SSR-safe: renders as desktop (false) on the server and first client paint,
 * then syncs to the real viewport after hydration.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribeMobile, getMobileSnapshot, getServerSnapshot);
}

/** Returns true when the compact mobile toolbar should collapse extra actions. */
export function useIsNarrowMobile(): boolean {
  return useSyncExternalStore(subscribeNarrowMobile, getNarrowMobileSnapshot, getServerSnapshot);
}

/**
 * Returns true when the primary input device is a touch screen (coarse
 * pointer). Unlike the width-based mobile breakpoint this also covers tablets
 * wider than 640px (iPad mini portrait is 744px), where the on-screen keyboard
 * still needs the mobile Enter semantics (newline, not send).
 */
export function useIsTouchDevice(): boolean {
  return useSyncExternalStore(subscribeTouch, getTouchSnapshot, getServerSnapshot);
}

/**
 * Returns true when the primary input device hovers (mouse, trackpad, stylus
 * that reports hover). Hover-to-reveal affordances gate on this so a touch
 * screen keeps its click/tap path.
 */
export function useHoverCapable(): boolean {
  return useSyncExternalStore(subscribeHover, getHoverSnapshot, getServerSnapshot);
}
