import type { AskUserQuestion } from "./types";
import { requireId, validateQuestions } from "./validation";

/** Supported wire contract only: no Web tool, resolver or fallback. */
export const ASK_USER_BRIDGE_CHANNEL = "pi.ask-user.bridge:resolve-open:v1";
export interface AskUserOpenRequest {
  version: 1;
  conversationId: string;
  questions: AskUserQuestion[];
}

export function decodeAskUserOpenRequest(input: unknown): AskUserOpenRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || !("version" in input) || input.version !== 1) {
    throw new Error("ask_user: unsupported host bridge version (expected v1)");
  }
  if (!("conversationId" in input) || !("questions" in input)) {
    throw new Error("ask_user: malformed host open request");
  }
  return {
    version: 1,
    conversationId: requireId(input.conversationId, "conversationId"),
    questions: validateQuestions(input.questions),
  };
}
