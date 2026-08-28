import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { isAskUserEnabled } from "../ask-user-settings";
import type { PendingAskOpenResult } from "./store";
import { createAskUserToolDefinition, type AskUserInvocation } from "./tool";

export interface AskUserSessionHandle {
  openAsk(input: AskUserInvocation): Promise<PendingAskOpenResult>;
}

/**
 * Inline extension that registers the `ask_user` tool when enabled.
 *
 * As an extension rather than an SDK `customTools` entry, the tool is
 * re-registered on every session reload, so toggling the setting in the UI and
 * reloading the session applies the change — the same lifecycle as the
 * built-in subagents extension. Registration is skipped while disabled; a
 * session created before the toggle keeps its already-registered tool until it
 * is reloaded, matching the built-in subagents behavior.
 */
export function createAskUserExtension(
  getSession: (sessionId: string) => AskUserSessionHandle | undefined,
): InlineExtension {
  return {
    name: "pi-web-ask-user",
    hidden: true,
    factory: (pi) => {
      if (!isAskUserEnabled()) return;
      pi.registerTool(createAskUserToolDefinition({
        open: async (input) => {
          const session = getSession(input.sessionId);
          if (!session) throw new Error("ask_user: no live session for this call");
          return session.openAsk(input);
        },
      }));
    },
  };
}
