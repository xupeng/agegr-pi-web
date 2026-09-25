/**
 * ask_user domain types and limits for Pi Web.
 *
 * The bounded DTOs and limits live in the portable package
 * (`./portable/types.ts`) so the local Pi extension and Pi Web share one
 * definition; this module only re-exports them and adds the Pi Web wire names
 * that are deliberately **not** part of the portable contract.
 */

export * from "./portable/types";

import type { AskUserOutcome, PendingAskUser } from "./portable/types";

/**
 * `customType` of the follow-up custom message that carries a closed ask back
 * to the model and into the transcript. Its `details` are an
 * {@link AskUserOutcome}. Pi Web-only: the portable package must not depend on
 * this name.
 */
export const ASK_USER_ANSWERS_CUSTOM_TYPE = "pi-web.ask.answers";

/**
 * Result of the browser closing an ask by submitting or cancelling it. Pi Web
 * command response, not part of the portable bridge contract.
 *
 * `"stale"` is an ordinary race rather than an error: the named ask was
 * already submitted, superseded by a newer one, or gone with its session
 * runtime. The browser drops its card and trusts `pendingAsk`, which is
 * returned in both cases so closing an ask needs no follow-up status request.
 */
export type AskUserCloseResponse = {
  result: "closed";
  outcome: AskUserOutcome;
  pendingAsk?: PendingAskUser;
} | {
  result: "stale";
  pendingAsk?: PendingAskUser;
};
