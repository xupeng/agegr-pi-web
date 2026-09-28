"use client";

import { useEffect } from "react";
import { CHAT_CONTENT_FONT_SIZE_DEFAULT, useChatAppearance } from "@/hooks/useChatAppearance";
import { CHAT_FONT_SIZE_STEP, chatFontSizeShortcutFromKey } from "@/lib/chat-font-size-shortcut";

// ---------------------------------------------------------------------------
// Module-level registry — ChatWindow registers the abort handler here so that
// the global Esc listener in AppShell can call it without prop-drilling.
// ---------------------------------------------------------------------------
let globalAbortHandler: (() => void) | null = null;

/**
 * Register (or clear) the abort handler for the global Esc shortcut.
 * Call this from ChatWindow whenever agentRunning or handleAbort changes.
 */
export function registerAbortHandler(handler: (() => void) | null): void {
  globalAbortHandler = handler;
}

// ---------------------------------------------------------------------------
// Hook: global keyboard shortcuts
// ---------------------------------------------------------------------------

interface UseGlobalKeyboardShortcutsOptions {
  /** Called when Ctrl+Alt+N is pressed. Receives current cwd. */
  onNewSession?: (cwd: string) => void;
  /** The currently selected project directory (sidebar cwd). */
  activeCwd?: string | null;
}

/**
 * Register global keyboard shortcuts for the application.
 *
 * Shortcuts handled here:
 *   Esc                                    – stop the running agent (via module-level abort handler)
 *   Ctrl+Alt+N                             – create a new session in the active project directory
 *   Ctrl/Cmd+Shift+- / Ctrl/Cmd+Shift+=    – step the chat font size by 1px
 *   Ctrl/Cmd+Shift+0                       – restore the default chat font size
 *
 * Note: Esc inside <textarea> or <input> is deliberately NOT handled here.
 * ChatInput manages its own Esc logic (closing slash / @ file menus, stopping
 * the agent when no menu is open) because it needs intimate knowledge of menu
 * state that is local to that component.
 */
export function useGlobalKeyboardShortcuts(
  options: UseGlobalKeyboardShortcutsOptions,
): void {
  const { onNewSession, activeCwd } = options;
  // The font size lives in a module-level store, so the shortcut can change it
  // without routing a callback through AppShell.
  const { fontSize, setFontSize } = useChatAppearance();

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // ---- Ctrl/Cmd+Shift+- / = / 0: chat font size ----
      // Matched first: these keys never mean "stop the agent", and the
      // preventDefault must beat the browser's own Ctrl+Shift+= zoom (it cannot
      // be cancelled in Safari, which is a known limit, not a bug fixable here).
      const fontShortcut = chatFontSizeShortcutFromKey(e);
      if (fontShortcut) {
        e.preventDefault();
        // At the 12/24 bounds the setter clamps; the key is still consumed.
        setFontSize(
          fontShortcut.kind === "reset"
            ? CHAT_CONTENT_FONT_SIZE_DEFAULT
            : fontSize + fontShortcut.delta * CHAT_FONT_SIZE_STEP,
        );
        return;
      }

      // ---- Esc: stop agent ----
      if (e.key === "Escape") {
        if (!globalAbortHandler) return;

        const tag = (e.target as HTMLElement)?.tagName;
        // Let textarea/input handle Esc internally (ChatInput menus / stop).
        if (tag === "TEXTAREA" || tag === "INPUT") return;

        e.preventDefault();
        globalAbortHandler();
        return;
      }

      // ---- Ctrl+Alt+N: new session ----
      if (e.key === "n" && e.ctrlKey && e.altKey) {
        if (!activeCwd || !onNewSession) return;
        e.preventDefault();
        onNewSession(activeCwd);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeCwd, onNewSession, fontSize, setFontSize]);
}
