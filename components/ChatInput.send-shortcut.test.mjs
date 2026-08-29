import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatInputSource = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const isMobileHookSource = await readFile(new URL("../hooks/useIsMobile.ts", import.meta.url), "utf8");

test("touch devices keep keyboard Enter as newline regardless of viewport width", () => {
  // iPad mini portrait (744px) exceeds the 640px mobile breakpoint, so the
  // send shortcut must also defer to the coarse-pointer (touch) detection or
  // the on-screen "newline" key of third-party keyboards would send.
  assert.match(chatInputSource, /const isMobileOrTouch = isMobile \|\| isTouchDevice;/);
  assert.match(
    chatInputSource,
    /const sendShortcut = e\.key === "Enter" && !e\.shiftKey && \(!isMobileOrTouch \|\| e\.ctrlKey \|\| e\.metaKey\);/,
  );
});

test("composer tells the keyboard the return key is newline", () => {
  assert.match(chatInputSource, /enterKeyHint="enter"/);
});

test("useIsMobile exposes a coarse-pointer touch device hook", () => {
  assert.match(isMobileHookSource, /TOUCH_QUERY = "\(pointer: coarse\)"/);
  assert.match(isMobileHookSource, /export function useIsTouchDevice\(\): boolean/);
});
