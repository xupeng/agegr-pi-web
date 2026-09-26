/**
 * The `ask_user` view's behaviour, as a host-neutral pure reducer.
 *
 * This owns only "what the user did to this form": per-question drafts, the
 * free-text supplement, the submit/cancel lock, and the payload assembled from
 * them. It deliberately does **not** own:
 *
 * - answer validation — `./validation.ts` is the single implementation, and a
 *   host validates the produced payload before sending it;
 * - rendering, DOM, keyboard, and focus — those belong to the view layer;
 * - command transport — the host turns the payload into `ask_submit`/`ask_cancel`;
 * - ask lifecycle — a `PendingAskStore` owns open/supersede/submit/cancel.
 *
 * Portable by construction: no framework, SDK, Node, or host imports, so the
 * same reducer can drive a React `useReducer` or a plain DOM host.
 */

import type { AskUserAnswer, AskUserQuestion } from "./types";

/** Per-question draft: selected option values plus optional custom text. */
export interface AskUserQuestionDraft {
  values: string[];
  otherText: string;
}

/** The view is editable only while `idle`; submit/cancel lock it immediately. */
export type AskUserViewStatus = "idle" | "submitting" | "cancelling";

export interface AskUserViewState {
  /** Keyed by question id. A `Map` (not a plain object): question ids are
   *  model-authored and may collide with `Object.prototype` keys. */
  drafts: Map<string, AskUserQuestionDraft>;
  supplement: string;
  status: AskUserViewStatus;
  /** Message shown when a submit/cancel callback rejected. */
  error: string;
}

export type AskUserViewAction =
  | { type: "toggle-option"; questionId: string; value: string; multiple: boolean }
  | { type: "set-other-text"; questionId: string; text: string; multiple: boolean }
  | { type: "set-supplement"; text: string }
  | { type: "submit-requested" }
  | { type: "cancel-requested" }
  | { type: "action-failed"; error: string };

/** An untouched view: no drafts, no supplement, editable. */
export function createAskUserViewState(): AskUserViewState {
  return { drafts: new Map(), supplement: "", status: "idle", error: "" };
}

/**
 * Apply one action and return a new state. Pure: never mutates the input
 * state or its drafts, and never throws. `multiple` is carried on the action
 * so the reducer does not need the `AskUserQuestion` to interpret it.
 */
export function askUserViewReducer(state: AskUserViewState, action: AskUserViewAction): AskUserViewState {
  switch (action.type) {
    case "toggle-option": {
      const draft = draftFor(state, action.questionId);
      if (action.multiple) {
        const values = draft.values.includes(action.value)
          ? draft.values.filter((value) => value !== action.value)
          : [...draft.values, action.value];
        return withDraft(state, action.questionId, { values, otherText: draft.otherText });
      }
      // Single-answer question: picking an option clears custom text.
      return withDraft(state, action.questionId, { values: [action.value], otherText: "" });
    }
    case "set-other-text": {
      const draft = draftFor(state, action.questionId);
      if (action.multiple) {
        return withDraft(state, action.questionId, { values: draft.values, otherText: action.text });
      }
      // Single-answer question: typing custom text clears the picked option.
      return withDraft(state, action.questionId, { values: [], otherText: action.text });
    }
    case "set-supplement":
      return { ...state, supplement: action.text };
    case "submit-requested":
      return { ...state, status: "submitting", error: "" };
    case "cancel-requested":
      return { ...state, status: "cancelling", error: "" };
    case "action-failed":
      // A rejection means nothing was delivered, so the form unlocks and the
      // error stays visible for a retry. The "answers may already be in flight"
      // guarantee is the in-flight lock (`submitting`/`cancelling`), not this
      // path — see `lib/ask-user/mcp-view-html.ts:605-623`.
      return { ...state, status: "idle", error: action.error };
  }
}

/** The draft for one question; an untouched question reads as empty. */
export function draftFor(state: AskUserViewState, questionId: string): AskUserQuestionDraft {
  return state.drafts.get(questionId) ?? { values: [], otherText: "" };
}

/** `values.length > 0 || otherText.trim() !== ""`. */
export function isQuestionAnswered(state: AskUserViewState, questionId: string): boolean {
  const draft = draftFor(state, questionId);
  return draft.values.length > 0 || draft.otherText.trim() !== "";
}

/** How many of the given questions have at least one selection or custom text. */
export function answeredCount(state: AskUserViewState, questions: AskUserQuestion[]): number {
  return questions.filter((question) => isQuestionAnswered(state, question.id)).length;
}

/** True once a submit or cancel was requested; the form is no longer editable. */
export function isLocked(state: AskUserViewState): boolean {
  return state.status !== "idle";
}

/**
 * `✓ value · value · otherText`, using the option's raw value (not its label).
 * Empty string when the question is untouched. The view decides to show it
 * only while locked.
 */
export function questionSummary(state: AskUserViewState, questionId: string): string {
  const draft = draftFor(state, questionId);
  const otherText = draft.otherText.trim();
  const parts = [...draft.values, ...(otherText !== "" ? [otherText] : [])];
  return parts.length === 0 ? "" : `✓ ${parts.join(" · ")}`;
}

/**
 * Assemble the `ask_submit` payload: untouched questions are skipped, blank
 * custom text is dropped, and a blank supplement is omitted. The host still
 * runs this through `validateSubmission`; this only guarantees structure.
 */
export function buildAskUserSubmission(
  state: AskUserViewState,
  questions: AskUserQuestion[],
): { answers: AskUserAnswer[]; supplement?: string } {
  const answers: AskUserAnswer[] = [];
  for (const question of questions) {
    const draft = draftFor(state, question.id);
    const values = [...draft.values];
    const otherText = draft.otherText.trim();
    if (values.length === 0 && otherText === "") continue;
    answers.push({ id: question.id, values, ...(otherText !== "" ? { otherText } : {}) });
  }
  const supplement = state.supplement.trim();
  return supplement === "" ? { answers } : { answers, supplement };
}

function withDraft(
  state: AskUserViewState,
  questionId: string,
  draft: AskUserQuestionDraft,
): AskUserViewState {
  const drafts = new Map(state.drafts);
  drafts.set(questionId, draft);
  return { ...state, drafts };
}
