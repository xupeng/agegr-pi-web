/**
 * Bounded `ask_user` domain types and limits.
 *
 * Portable by construction: pure TypeScript with no framework, SDK, Node, or
 * host imports, so this module is shared verbatim by the local Pi package
 * entry, a host bridge adapter, and Pi Web's server-side tool/store. Nothing
 * Pi Web-specific (`pi-web.ask.answers`, the submit/cancel wire response, the
 * persistence file, SSE) belongs here.
 */

/** Largest question set one `ask_user` call may post. */
export const ASK_USER_QUESTION_LIMIT = 20;
/** Largest option list one question may offer. */
export const ASK_USER_OPTION_LIMIT = 12;
/** Length bound for ids: the ask id, question ids, and option values. */
export const ASK_USER_ID_MAX_LENGTH = 128;
/** Length bound for model-authored prose: questions, details, and option labels. */
export const ASK_USER_TEXT_MAX_LENGTH = 1_000;
/** Length bound for the free text a user types as a custom answer. */
export const ASK_USER_OTHER_TEXT_MAX_LENGTH = 4_000;

/** One selectable option of an {@link AskUserQuestion}. */
export interface AskUserQuestionOption {
  /** Stable machine value reported back to the model. */
  value: string;
  /** Short human label rendered in the browser. */
  label: string;
  /** Optional clarifying line rendered under the label. */
  detail?: string;
}

/**
 * One question of an `ask_user` set. Questions are never required: the user
 * may submit while leaving any of them untouched, and unanswered questions are
 * reported to the model as such.
 */
export interface AskUserQuestion {
  /** Unique within the ask; used as the answer key. */
  id: string;
  /** The question itself, as one plain-text line. */
  question: string;
  /** Optional supporting context rendered under the question. */
  detail?: string;
  /** Offered options; may be empty when only free text makes sense. */
  options: AskUserQuestionOption[];
  /** When true, several options may be selected at once. */
  multiple?: boolean;
}

/**
 * The open, unanswered question set of a conversation. A host owns where this
 * lives (memory, disk, UI); the package only validates and moves it.
 */
export interface PendingAskUser {
  askId: string;
  askedAt: string;
  questions: AskUserQuestion[];
}

/** Why an ask stopped being the conversation's open ask. */
export type AskUserCloseReason = "submitted" | "superseded" | "cancelled";

/**
 * A freshly opened ask, plus the outcome of the ask it replaced. A
 * conversation holds at most one open ask, so opening while one is still
 * unanswered supersedes it — and the caller must report that outcome to the
 * model, naming the questions the user never got to answer.
 */
export interface PendingAskOpenResult {
  ask: PendingAskUser;
  superseded?: AskUserOutcome;
}

/**
 * What the user replied to one question. Absent from a submission means the
 * question was left untouched; an empty `values` with no `otherText` means the
 * same thing.
 */
export interface AskUserAnswer {
  /** Matches an {@link AskUserQuestion.id} of the open ask. */
  id: string;
  /** Selected {@link AskUserQuestionOption.value} entries; several only when the question allows it. */
  values: string[];
  /** Free text typed as the question's custom answer. */
  otherText?: string;
}

/** One submit of the open ask: answers for some or all of its questions. */
export interface AskUserSubmission {
  answers: AskUserAnswer[];
  /** Free text the user adds beyond the questions; optional. */
  supplement?: string;
}

/**
 * One question of a closed ask paired with what came back for it. Carries the
 * question itself so the record renders without the original ask still existing.
 */
export interface AskUserQuestionRecord {
  question: AskUserQuestion;
  /** True when at least one option was selected or custom text was given. */
  answered: boolean;
  values: string[];
  otherText?: string;
}

/**
 * The complete result of an ask, computed when it closes. Shared by the
 * model-facing follow-up message and the browser's read-only record, so both
 * report the same answered and unanswered questions.
 */
export interface AskUserOutcome {
  askId: string;
  reason: AskUserCloseReason;
  askedAt: string;
  closedAt: string;
  questions: AskUserQuestionRecord[];
  answeredCount: number;
  /** Ids of the questions left unanswered, in the order they were asked. */
  unansweredIds: string[];
  /** Free text the user added beyond the questions, when provided. */
  supplement?: string;
  /** One line, for example `Answered 3 of 5; unanswered: q2, q5`. */
  summary: string;
}
