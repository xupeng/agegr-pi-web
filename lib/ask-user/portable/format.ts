/**
 * Model-facing text for a closed `ask_user` set.
 *
 * Pure formatting shared by the portable package and Pi Web: the model reads
 * this, so it must name unanswered questions as plainly as answered ones.
 */

import type { AskUserOutcome, AskUserQuestionRecord } from "./types";

/**
 * Model-facing text of a closed ask.
 */
export function renderAskUserAnswersText(outcome: AskUserOutcome): string {
  const lead = outcome.reason === "submitted"
    ? "The user submitted answers to your questions."
    : `The question set was closed (${outcome.reason}) before it was fully answered.`;
  const supplementLine = outcome.supplement === undefined
    ? []
    : ["", `Supplement (user-provided, beyond the questions): ${JSON.stringify(outcome.supplement)}`];
  return [lead, "", ...outcome.questions.map(questionLines).flat(), "", outcome.summary, ...supplementLine].join("\n");
}

/**
 * Notice for the model when a new ask replaced one the user never answered, so
 * a supersede is never a silent loss of the earlier questions.
 */
export function renderSupersededAskText(outcome: AskUserOutcome): string {
  return [
    `This replaced an earlier question set (${outcome.askId}) that the user never submitted.`,
    `Left unanswered: ${outcome.unansweredIds.join(", ")}.`,
  ].join("\n");
}

function questionLines(record: AskUserQuestionRecord): string[] {
  const header = `- ${record.question.id}: ${record.question.question}`;
  if (!record.answered) return [header, "  Unanswered."];
  const parts = [...record.values.map((value) => `selected ${value}`)];
  if (record.otherText !== undefined) parts.push(`custom: ${JSON.stringify(record.otherText)}`);
  return [header, `  Answered: ${parts.join("; ")}`];
}
