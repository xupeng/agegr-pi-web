/**
 * The single `ask_user` schema validator, shared by the local Pi package entry
 * and Pi Web's server-side store.
 *
 * `validateQuestions` is applied by the portable bridge before it emits a host
 * registration request, and again by any host that keeps its own open-ask
 * store, so a malformed ask can never be silently accepted. `validateSubmission`
 * and `normalizeSupplement` guard the other direction: answers a browser sends
 * back. Kept free of framework, SDK, Node, and host imports.
 */

import {
  ASK_USER_ID_MAX_LENGTH,
  ASK_USER_OPTION_LIMIT,
  ASK_USER_OTHER_TEXT_MAX_LENGTH,
  ASK_USER_QUESTION_LIMIT,
  ASK_USER_TEXT_MAX_LENGTH,
  type AskUserAnswer,
  type AskUserQuestion,
  type AskUserQuestionOption,
  type AskUserSubmission,
  type PendingAskUser,
} from "./types";

/** Rejected input: a question set is malformed, or an answer does not fit its question. */
export class PendingAskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PendingAskValidationError";
  }
}

/** Answers accepted for one open ask, keyed by question id. */
export type RecordedAnswers = ReadonlyMap<string, AskUserAnswer>;

/** Validate and clone a whole question set; the returned array is detached. */
export function validateQuestions(questions: AskUserQuestion[]): AskUserQuestion[] {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new PendingAskValidationError("An ask must contain at least one question");
  }
  if (questions.length > ASK_USER_QUESTION_LIMIT) {
    throw new PendingAskValidationError(`An ask must not contain more than ${ASK_USER_QUESTION_LIMIT.toString()} questions`);
  }
  const seenIds = new Set<string>();
  return questions.map((question) => {
    if (!isRecord(question)) throw new PendingAskValidationError("Each question must be an object");
    const id = requireId(question.id, "question id");
    if (seenIds.has(id)) throw new PendingAskValidationError(`Duplicate question id ${id}`);
    seenIds.add(id);
    return validateQuestion(question, id);
  });
}

/**
 * Validate a submission against the open ask. Answers that do not fit their
 * question (unknown id, duplicate, unknown option, single-answer conflict,
 * over-long text) throw rather than being truncated. An untouched question and
 * an explicitly empty answer are the same thing and are dropped.
 */
export function validateSubmission(ask: PendingAskUser, submission: AskUserSubmission): RecordedAnswers {
  if (!isRecord(submission) || !Array.isArray(submission.answers)) {
    throw new PendingAskValidationError("Answers must be a list");
  }
  const questionsById = new Map(ask.questions.map((question) => [question.id, question]));
  const answers = new Map<string, AskUserAnswer>();
  for (const answer of submission.answers) {
    if (!isRecord(answer) || typeof answer.id !== "string") {
      throw new PendingAskValidationError("Answer must be an object with a question id");
    }
    const question = questionsById.get(answer.id);
    if (question === undefined) throw new PendingAskValidationError(`Unknown question id ${answer.id}`);
    if (answers.has(answer.id)) throw new PendingAskValidationError(`Duplicate answer for question ${answer.id}`);
    const validated = validateAnswer(question, answer);
    if (validated !== undefined) answers.set(answer.id, validated);
  }
  return answers;
}

/** Trim a supplement; empty-after-trim is dropped, over-long is rejected. */
export function normalizeSupplement(supplement: string | undefined): string | undefined {
  if (supplement === undefined) return undefined;
  if (typeof supplement !== "string") throw new PendingAskValidationError("Supplement must be text");
  if (supplement.length > ASK_USER_OTHER_TEXT_MAX_LENGTH) {
    throw new PendingAskValidationError("Supplement exceeds its length limit");
  }
  const trimmed = supplement.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Detached copy of an open ask. */
export function cloneAsk(ask: PendingAskUser): PendingAskUser {
  return { askId: ask.askId, askedAt: ask.askedAt, questions: ask.questions.map(cloneQuestion) };
}

/** Detached copy of one question (options included). */
export function cloneQuestion(question: AskUserQuestion): AskUserQuestion {
  return { ...question, options: question.options.map((option) => ({ ...option })) };
}

/** A conversation identity must be present; hosts key pending state by it. */
export function requireSessionId(sessionId: string): string {
  if (sessionId === "") throw new Error("sessionId must not be empty");
  return sessionId;
}

/** A non-empty, bounded machine identifier. */
export function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new PendingAskValidationError(`${field} must not be empty`);
  if (value.length > ASK_USER_ID_MAX_LENGTH) throw new PendingAskValidationError(`${field} exceeds its length limit`);
  return value;
}

function validateQuestion(
  question: { question: unknown; detail?: unknown; options: unknown; multiple?: unknown },
  id: string,
): AskUserQuestion {
  if (!Array.isArray(question.options)) {
    throw new PendingAskValidationError(`Question ${id} options must be a list`);
  }
  if (question.options.length > ASK_USER_OPTION_LIMIT) {
    throw new PendingAskValidationError(`Question ${id} must not offer more than ${ASK_USER_OPTION_LIMIT.toString()} options`);
  }
  const seenValues = new Set<string>();
  const options = question.options.map((option) => {
    if (!isRecord(option)) throw new PendingAskValidationError(`Question ${id} has a malformed option`);
    const value = requireId(option.value, `option value of question ${id}`);
    if (seenValues.has(value)) throw new PendingAskValidationError(`Duplicate option value ${value} in question ${id}`);
    seenValues.add(value);
    return validateOption(option, value, id);
  });
  const detail = question.detail;
  return {
    id,
    question: requireText(question.question, `text of question ${id}`),
    ...(detail === undefined ? {} : { detail: requireText(detail, `detail of question ${id}`) }),
    options,
    ...(question.multiple === true ? { multiple: true } : {}),
  };
}

function validateOption(
  option: Record<string, unknown>,
  value: string,
  questionId: string,
): AskUserQuestionOption {
  const detail = option.detail;
  return {
    value,
    label: requireText(option.label, `label of option ${value} in question ${questionId}`),
    ...(detail === undefined ? {} : { detail: requireText(detail, `detail of option ${value} in question ${questionId}`) }),
  };
}

function validateAnswer(
  question: AskUserQuestion,
  answer: { id: string; values: unknown; otherText?: unknown },
): AskUserAnswer | undefined {
  if (!Array.isArray(answer.values)) {
    throw new PendingAskValidationError(`Answer for question ${question.id} must list values`);
  }
  const optionValues = new Set(question.options.map((option) => option.value));
  const values: string[] = [];
  for (const value of answer.values) {
    if (typeof value !== "string") throw new PendingAskValidationError(`Question ${question.id} has no option ${String(value)}`);
    if (!optionValues.has(value)) throw new PendingAskValidationError(`Question ${question.id} has no option ${value}`);
    if (values.includes(value)) throw new PendingAskValidationError(`Duplicate value ${value} for question ${question.id}`);
    values.push(value);
  }
  const otherText = normalizeOtherText(question, answer.otherText);
  const selectionCount = values.length + (otherText === undefined ? 0 : 1);
  if (question.multiple !== true && selectionCount > 1) {
    throw new PendingAskValidationError(`Question ${question.id} accepts a single answer`);
  }
  if (selectionCount === 0) return undefined;
  return { id: question.id, values, ...(otherText === undefined ? {} : { otherText }) };
}

function normalizeOtherText(question: AskUserQuestion, otherText: unknown): string | undefined {
  if (otherText === undefined) return undefined;
  if (typeof otherText !== "string") {
    throw new PendingAskValidationError(`Other text of question ${question.id} must be text`);
  }
  if (otherText.length > ASK_USER_OTHER_TEXT_MAX_LENGTH) {
    throw new PendingAskValidationError(`Other text of question ${question.id} exceeds its length limit`);
  }
  const trimmed = otherText.trim();
  return trimmed === "" ? undefined : trimmed;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new PendingAskValidationError(`${field} must not be empty`);
  if (value.length > ASK_USER_TEXT_MAX_LENGTH) throw new PendingAskValidationError(`${field} exceeds its length limit`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
