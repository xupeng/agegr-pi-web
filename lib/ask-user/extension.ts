import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { ASK_USER_BRIDGE_CHANNEL, decodeAskUserOpenRequest } from "./protocol";
import type { PendingAskOpenInput, PendingAskOpenResult } from "./store";

export interface AskUserSessionHandle {
  readonly sessionId: string;
  isAlive(): boolean;
  openAsk(input: PendingAskOpenInput): Promise<PendingAskOpenResult>;
}

/** Bridge-only Web host. The SDK-discovered extension owns the tool. */
export function createAskUserExtension(
  getSession: (sessionId: string) => AskUserSessionHandle | undefined,
  getLoaderSessionId: () => string,
): InlineExtension {
  return {
    name: "pi-web-ask-user-host",
    hidden: true,
    factory: (pi) => {
      // Registration must be synchronous; only opening the ask may await.
      // pi.events belongs to this loader and the SDK tears it down on reload.
      pi.events.on(ASK_USER_BRIDGE_CHANNEL, (resolution: unknown) => {
        if (!resolution || typeof resolution !== "object" || !("register" in resolution)
          || typeof resolution.register !== "function") return;
        resolution.register(async (input: unknown) => {
          const request = decodeAskUserOpenRequest(input);
          const sessionId = getLoaderSessionId();
          if (request.conversationId !== sessionId) {
            throw new Error("ask_user: conversation identity does not match this loader");
          }
          const session = getSession(sessionId);
          if (!session || !session.isAlive() || session.sessionId !== sessionId) {
            throw new Error("ask_user: no live session for this call");
          }
          return session.openAsk({ sessionId, questions: request.questions });
        });
      });
    },
  };
}
