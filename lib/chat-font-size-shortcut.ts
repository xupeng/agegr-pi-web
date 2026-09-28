/**
 * Keyboard contract for the chat-area font size.
 *
 * Ctrl+Shift+- / Ctrl+Shift+= (Cmd on macOS) step the chat font size by 1px,
 * exactly like moving the Settings slider one notch, and Ctrl+Shift+0 puts the
 * default back. The matcher is a pure function so the layout traps below can be
 * unit-tested without a DOM event.
 */

/** Pixels added per key press — keep in step with the Settings slider `step`. */
export const CHAT_FONT_SIZE_STEP = 1;

/**
 * `aria-keyshortcuts` value for the Settings slider: both modifier sets, both
 * step keys and the reset key. ARIA wants the physical key values, so `-` / `=`
 * / `0` rather than the shifted `_` / `+` / `)` a US layout reports.
 */
export const CHAT_FONT_SIZE_SHORTCUT_ARIA =
  "Control+Shift+- Meta+Shift+- Control+Shift+= Meta+Shift+= Control+Shift+0 Meta+Shift+0";

/** What a matched key press asks the preference to do. */
export type ChatFontSizeShortcut =
  | { kind: "step"; delta: -1 | 1 }
  | { kind: "reset" };

/** The subset of `KeyboardEvent` this matcher reads. */
export interface ChatFontSizeShortcutEvent {
  code?: string;
  key?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
  isComposing?: boolean;
}

const DECREASE_CODES = new Set(["Minus", "NumpadSubtract"]);
const INCREASE_CODES = new Set(["Equal", "NumpadAdd", "NumpadEqual"]);
const RESET_CODES = new Set(["Digit0", "Numpad0"]);
const DECREASE_KEYS = new Set(["-", "_"]);
const INCREASE_KEYS = new Set(["=", "+"]);
const RESET_KEYS = new Set(["0", ")"]);

/**
 * The action a `keydown` event means for the chat font size, or `null` when the
 * event is not ours (including the Shift-less modifier combos, which stay the
 * browser's own zoom).
 *
 * `code` decides first. With Shift held the US layout reports `_` / `+` / `)`
 * as `key`, and non-US layouts report unrelated characters, while the physical
 * key stays `Minus` / `Equal` / `Digit0`. `key` is only consulted for events
 * that carry no `code` at all (synthetic events, older browsers).
 *
 * Shift is required — bare Ctrl+- / Ctrl+= / Ctrl+0 stay the browser's own
 * zoom — and Alt is excluded because AltGr arrives as Ctrl+Alt on Windows/Linux
 * layouts.
 */
export function chatFontSizeShortcutFromKey(
  event: ChatFontSizeShortcutEvent,
): ChatFontSizeShortcut | null {
  if (!event.ctrlKey && !event.metaKey) return null;
  if (!event.shiftKey || event.altKey || event.isComposing) return null;

  const code = event.code ?? "";
  const byCode = code !== "";
  const key = byCode ? code : event.key ?? "";

  if (byCode ? DECREASE_CODES.has(key) : DECREASE_KEYS.has(key)) return { kind: "step", delta: -1 };
  if (byCode ? INCREASE_CODES.has(key) : INCREASE_KEYS.has(key)) return { kind: "step", delta: 1 };
  if (byCode ? RESET_CODES.has(key) : RESET_KEYS.has(key)) return { kind: "reset" };
  return null;
}
