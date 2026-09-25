import { randomUUID } from "node:crypto";
import {
  type AskUserAnswer,
  type AskUserCloseReason,
  type AskUserOutcome,
  type AskUserQuestion,
  type AskUserQuestionRecord,
  type AskUserSubmission,
  type PendingAskOpenResult,
  type PendingAskUser,
} from "./portable/types";
import {
  cloneAsk,
  cloneQuestion,
  normalizeSupplement,
  PendingAskValidationError,
  requireId,
  requireSessionId,
  validateQuestions,
  validateSubmission,
  type RecordedAnswers,
} from "./portable/validation";
import { renderAskUserAnswersText, renderSupersededAskText } from "./portable/format";

// Re-exported so existing Pi Web imports from `./store` and `./index` keep
// working while the definitions live in the portable package.
export { PendingAskValidationError, renderAskUserAnswersText, renderSupersededAskText };
export type { PendingAskOpenResult };

export interface PendingAskStoreOptions {
  now?: (() => Date) | undefined;
  createAskId?: (() => string) | undefined;
}

/** A question set an agent wants to post to the user of one session. */
export interface PendingAskOpenInput {
  sessionId: string;
  questions: AskUserQuestion[];
}

/**
 * Result of submitting or cancelling an ask. `"stale"` means the ask named by
 * the caller is no longer the session's open ask (already submitted,
 * superseded, or gone with its daemon-side session), which is an ordinary race
 * a browser can lose — not an error.
 */
export type PendingAskCloseResult =
  | { status: "closed"; outcome: AskUserOutcome }
  | { status: "stale" };

/**
 * Server-owned open-ask state: one unanswered question set per session.
 *
 * The store is pure domain logic — no Next.js, no Pi session, no I/O, no
 * timers. It validates asks and answers (through the shared portable
 * validator), owns the open/supersede/submit/cancel transitions, and computes
 * the answered-versus-unanswered outcome that both the model-facing message and
 * the browser record are rendered from. Callers publish the returned asks and
 * outcomes; the store never emits anything itself.
 *
 * State is deliberately process-lifetime and in-memory. An open ask is
 * meaningful only while the session runtime that posted it exists, and
 * browsers rehydrate it from `get_state` rather than from disk.
 */
export class PendingAskStore {
  private readonly now: () => Date;
  private readonly createAskId: () => string;
  private readonly openBySessionId = new Map<string, PendingAskUser>();

  constructor(options: PendingAskStoreOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createAskId = options.createAskId ?? randomUUID;
  }

  /** The session's open ask, for `get_state` projection. */
  pendingAsk(sessionId: string): PendingAskUser | undefined {
    const ask = this.openBySessionId.get(requireSessionId(sessionId));
    return ask === undefined ? undefined : cloneAsk(ask);
  }

  open(input: PendingAskOpenInput): PendingAskOpenResult {
    const sessionId = requireSessionId(input.sessionId);
    const questions = validateQuestions(input.questions);
    const askedAt = this.timestamp();
    const superseded = this.close(sessionId, "superseded", askedAt, new Map());
    const ask: PendingAskUser = {
      askId: requireId(this.createAskId(), "askId"),
      askedAt,
      questions,
    };
    this.openBySessionId.set(sessionId, ask);
    return {
      ask: cloneAsk(ask),
      ...(superseded === undefined ? {} : { superseded }),
    };
  }

  /**
   * Record what the user replied and close the ask. Answers are validated
   * against the open ask, so a submission that does not fit its questions is
   * rejected rather than silently truncated; the ask stays open in that case.
   */
  submit(sessionId: string, askId: string, submission: AskUserSubmission): PendingAskCloseResult {
    const ask = this.openBySessionId.get(requireSessionId(sessionId));
    if (ask?.askId !== askId) return { status: "stale" };
    // Validate before closing so a submission that does not fit its questions
    // leaves the ask open for the browser to correct.
    const answers = validateSubmission(ask, submission);
    const supplement = normalizeSupplement(submission.supplement);
    return { status: "closed", outcome: this.requireClose(sessionId, "submitted", answers, supplement) };
  }

  /**
   * Close the session's open ask without a submission. The outcome reports
   * every question as unanswered, because answers only ever reach the server
   * through a submit.
   */
  cancel(sessionId: string, askId: string): PendingAskCloseResult {
    const ask = this.openBySessionId.get(requireSessionId(sessionId));
    if (ask?.askId !== askId) return { status: "stale" };
    return { status: "closed", outcome: this.requireClose(sessionId, "cancelled", new Map()) };
  }

  /**
   * Close whatever ask the session currently has open, e.g. because the user
   * sent an ordinary chat message instead of answering the form. Returns the
   * outcome, or `undefined` when the session has no open ask.
   */
  cancelOpen(sessionId: string): AskUserOutcome | undefined {
    return this.close(requireSessionId(sessionId), "cancelled", this.timestamp(), new Map());
  }

  /** Drop the open ask of a session that is going away, without reporting an outcome. */
  forgetSession(sessionId: string): void {
    this.openBySessionId.delete(requireSessionId(sessionId));
  }

  /**
   * Re-register a previously persisted open ask after its session runtime was
   * rebuilt (idle shutdown, server restart). The original askId is kept so
   * browsers whose card is keyed by it and `ask_submit` calls still match.
   *
   * The record is trusted to have been validated when it was first opened, so
   * only a light structural check runs; malformed records are dropped. When
   * the session already has an open ask the live store wins and the restore is
   * skipped.
   */
  restore(
    sessionId: string,
    ask: { askId: string; askedAt: string; questions: AskUserQuestion[] } | undefined,
  ): boolean {
    const sid = requireSessionId(sessionId);
    if (!ask || typeof ask !== "object") return false;
    if (typeof ask.askId !== "string" || ask.askId === "") return false;
    if (typeof ask.askedAt !== "string" || ask.askedAt === "") return false;
    if (!Array.isArray(ask.questions) || ask.questions.length === 0) return false;
    if (!ask.questions.every((question) => (
      question && typeof question === "object"
      && typeof question.id === "string"
      && typeof question.question === "string"
      && Array.isArray(question.options)
    ))) return false;
    if (this.openBySessionId.has(sid)) return false;
    this.openBySessionId.set(sid, {
      askId: ask.askId,
      askedAt: ask.askedAt,
      questions: ask.questions.map(cloneQuestion),
    });
    return true;
  }

  private requireClose(
    sessionId: string,
    reason: AskUserCloseReason,
    answers: RecordedAnswers,
    supplement?: string,
  ): AskUserOutcome {
    const outcome = this.close(sessionId, reason, this.timestamp(), answers, supplement);
    if (outcome === undefined) throw new Error(`Pending ask of session ${sessionId} disappeared while closing`);
    return outcome;
  }

  private close(
    sessionId: string,
    reason: AskUserCloseReason,
    closedAt: string,
    answers: RecordedAnswers,
    supplement?: string,
  ): AskUserOutcome | undefined {
    const ask = this.openBySessionId.get(sessionId);
    if (ask === undefined) return undefined;
    this.openBySessionId.delete(sessionId);
    return askUserOutcome(ask, answers, reason, closedAt, supplement);
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

function askUserOutcome(
  ask: PendingAskUser,
  answers: RecordedAnswers,
  reason: AskUserCloseReason,
  closedAt: string,
  supplement?: string,
): AskUserOutcome {
  const questions = ask.questions.map((question) => questionRecord(question, answers.get(question.id)));
  const unansweredIds = questions.filter((record) => !record.answered).map((record) => record.question.id);
  const answeredCount = questions.length - unansweredIds.length;
  return {
    askId: ask.askId,
    reason,
    askedAt: ask.askedAt,
    closedAt,
    questions,
    answeredCount,
    unansweredIds,
    ...(supplement === undefined ? {} : { supplement }),
    summary: summaryLine(questions.length, answeredCount, unansweredIds),
  };
}

function questionRecord(question: AskUserQuestion, answer: AskUserAnswer | undefined): AskUserQuestionRecord {
  const values = answer?.values ?? [];
  const otherText = answer?.otherText;
  return {
    question: cloneQuestion(question),
    answered: values.length > 0 || otherText !== undefined,
    values: [...values],
    ...(otherText === undefined ? {} : { otherText }),
  };
}

function summaryLine(total: number, answeredCount: number, unansweredIds: string[]): string {
  const answered = `Answered ${answeredCount.toString()} of ${total.toString()}`;
  return unansweredIds.length === 0
    ? `${answered}; none left unanswered`
    : `${answered}; unanswered: ${unansweredIds.join(", ")}`;
}
