/**
 * Portable `ask_user` Pi extension (local prototype, not published).
 *
 * The default export is the Pi package entry: it registers the bounded
 * `ask_user` tool whose `open` is resolved through the explicit host bridge in
 * `./bridge` at execution time. See `README.md` for the bridge contract, local
 * installation, and pinned SDK peers.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { openAskThroughBridge } from "./bridge";
import { createAskUserToolDefinition } from "./tool";

/**
 * Pi extension factory. Registers the bridge-backed `ask_user` tool and holds
 * only the loader-scoped `pi.events` bus; it performs no host lookup, no disk
 * or UI work, and no setup beyond tool registration.
 */
export default function askUserExtension(pi: ExtensionAPI): void {
  pi.registerTool(createAskUserToolDefinition({
    open: (input) => openAskThroughBridge(pi.events, {
      conversationId: input.sessionId,
      questions: input.questions,
    }),
  }));
}

export * from "./types";
export {
  PendingAskValidationError,
  cloneAsk,
  cloneQuestion,
  normalizeSupplement,
  requireId,
  requireSessionId,
  validateQuestions,
  validateSubmission,
  type RecordedAnswers,
} from "./validation";
export { renderAskUserAnswersText, renderSupersededAskText } from "./format";
export {
  createAskUserToolDefinition,
  type AskUserInvocation,
  type AskUserToolDeps,
} from "./tool";
export {
  ASK_USER_BRIDGE_CHANNEL,
  ASK_USER_BRIDGE_VERSION,
  AskUserBridgeError,
  openAskThroughBridge,
  type AskUserBridgeEventBus,
  type AskUserBridgeOpen,
  type AskUserBridgeRequest,
  type AskUserBridgeResolution,
  type OpenAskThroughBridgeInput,
} from "./bridge";
export {
  askUserViewReducer,
  answeredCount,
  buildAskUserSubmission,
  createAskUserViewState,
  draftFor,
  isLocked,
  isQuestionAnswered,
  questionSummary,
  type AskUserQuestionDraft,
  type AskUserViewAction,
  type AskUserViewState,
  type AskUserViewStatus,
} from "./view-controller";
