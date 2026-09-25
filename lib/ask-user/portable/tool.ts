import { Type, type Static } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  ASK_USER_ID_MAX_LENGTH,
  ASK_USER_OPTION_LIMIT,
  ASK_USER_QUESTION_LIMIT,
  ASK_USER_TEXT_MAX_LENGTH,
  type AskUserQuestion,
  type AskUserQuestionOption,
  type PendingAskOpenResult,
} from "./types";
import { renderSupersededAskText } from "./format";
import { PendingAskValidationError } from "./validation";

/** One `ask_user` call: the questions to post, for the conversation that called the tool. */
export interface AskUserInvocation {
  sessionId: string;
  questions: AskUserQuestion[];
}

export interface AskUserToolDeps {
  /** Registers the ask as the conversation's open one; rejects malformed question sets. */
  open(input: AskUserInvocation): Promise<PendingAskOpenResult>;
}

type AskUserToolDetails = PendingAskOpenResult;

const AskUserOptionParams = Type.Object({
  value: Type.String({
    maxLength: ASK_USER_ID_MAX_LENGTH,
    description: "Stable machine value reported back to you when the user picks this option.",
  }),
  label: Type.String({
    maxLength: ASK_USER_TEXT_MAX_LENGTH,
    description: "Short label the user reads, ideally a few words.",
  }),
  detail: Type.Optional(Type.String({
    maxLength: ASK_USER_TEXT_MAX_LENGTH,
    description: "Optional clarification shown under the label.",
  })),
});

const AskUserQuestionParams = Type.Object({
  id: Type.String({
    maxLength: ASK_USER_ID_MAX_LENGTH,
    description: "Unique within this call; used as the answer key reported back to you.",
  }),
  question: Type.String({
    maxLength: ASK_USER_TEXT_MAX_LENGTH,
    description: "The question itself, as one plain-text line.",
  }),
  detail: Type.Optional(Type.String({
    maxLength: ASK_USER_TEXT_MAX_LENGTH,
    description: "Optional supporting context shown under the question.",
  })),
  options: Type.Optional(Type.Array(AskUserOptionParams, {
    maxItems: ASK_USER_OPTION_LIMIT,
    description: "Options to choose from. Omit when free text is the whole answer; the browser always adds a Custom choice.",
  })),
  multiple: Type.Optional(Type.Boolean({
    description: "Allow several options at once. Default: one answer per question.",
  })),
});

const AskUserParams = Type.Object({
  questions: Type.Array(AskUserQuestionParams, {
    minItems: 1,
    maxItems: ASK_USER_QUESTION_LIMIT,
    description: "The questions to post, in the order the user should read them. Every question may be left unanswered.",
  }),
});

/**
 * Shapes one schema question into the domain question. Runtime values that are
 * not objects fail here as validation errors, before `open`, so a malformed
 * call cannot register an ask or end the run. The shared validator still owns
 * limits, duplicates and text bounds.
 */
function toQuestion(param: Static<typeof AskUserQuestionParams>): AskUserQuestion {
  if (!param || typeof param !== "object") throw new PendingAskValidationError("Each question must be an object");
  const { detail, options, multiple } = param;
  if (options !== undefined && !Array.isArray(options)) {
    throw new PendingAskValidationError("Question options must be a list");
  }
  return {
    id: param.id,
    question: param.question,
    ...(detail === undefined ? {} : { detail }),
    options: (options ?? []).map(toOption),
    ...(multiple === undefined ? {} : { multiple }),
  };
}

function toOption(param: Static<typeof AskUserOptionParams>): AskUserQuestionOption {
  if (!param || typeof param !== "object") throw new PendingAskValidationError("Each option must be an object");
  const { detail } = param;
  return { value: param.value, label: param.label, ...(detail === undefined ? {} : { detail }) };
}

function postedText(result: PendingAskOpenResult): string {
  const count = result.ask.questions.length;
  const posted = `Posted ${count.toString()} question${count === 1 ? "" : "s"} to the user as ask ${result.ask.askId}. Ending this run; the answers arrive as a follow-up message that wakes you, naming every question the user left unanswered. Do not repost these questions.`;
  return result.superseded === undefined ? posted : `${posted}\n\n${renderSupersededAskText(result.superseded)}`;
}

/** Refuse to end the run unless the open result can be reported without guessing. */
function assertReportableOpen(result: PendingAskOpenResult): void {
  const ask = result?.ask;
  if (!ask || typeof ask.askId !== "string" || ask.askId.trim() === "" || typeof ask.askedAt !== "string" || ask.askedAt.trim() === "") {
    throw new Error("ask_user: open did not durably register the ask");
  }
  if (!Array.isArray(ask.questions) || ask.questions.length === 0) {
    throw new Error("ask_user: open did not durably register the ask");
  }
  const superseded = result.superseded;
  if (superseded === undefined) return;
  if (superseded.reason !== "superseded" || typeof superseded.askId !== "string" || superseded.askId.trim() === "" || !Array.isArray(superseded.unansweredIds) || superseded.unansweredIds.some((id) => typeof id !== "string")) {
    throw new Error("ask_user: superseded outcome is not reportable");
  }
}

/**
 * Custom tool that posts a question set to the user's browser as interactive UI.
 *
 * It deliberately does **not** await the user. Awaiting would pin the agent run
 * for an unbounded human-scale wait, keep the session streaming, and leave a
 * dangling tool call if the runtime were replaced meanwhile. Instead the ask
 * becomes host-owned state, the tool terminates the run, and the submitted
 * answers return later as a follow-up message that wakes the session.
 *
 * Rejected question sets throw: the agent loop turns the thrown message into an
 * error tool result, so the model can fix the ask and post it again.
 */
export function createAskUserToolDefinition(deps: AskUserToolDeps) {
  return defineTool<typeof AskUserParams, AskUserToolDetails>({
    name: "ask_user",
    label: "Ask user",
    description: "Post a set of questions to the user as a browser form and end this run. Answers arrive later as a follow-up message; the user may leave any question unanswered.",
    promptSnippet: "ask_user: ask for blocking clarification or a required decision; ends the run, answers return as a follow-up",
    promptGuidelines: [
      "When you cannot continue the requested work without a missing fact, scope choice, or decision from the user, and ask_user is available, use it instead of ending with a prose question. Group related questions in one call. Do not use it for ordinary conversation, rhetorical questions, or optional follow-up suggestions; if the tool is unavailable, ask in prose. An answer to ask_user is clarification, not authorization for a sensitive action. The tool ends the run; answers, including unanswered questions, arrive as a follow-up message that wakes you. Call it alone and last, and do not repost the same questions or poll for answers.",
    ],
    parameters: AskUserParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!Array.isArray(params.questions)) {
        throw new PendingAskValidationError("An ask must contain at least one question");
      }
      const result = await deps.open({
        sessionId: ctx.sessionManager.getSessionId(),
        questions: params.questions.map(toQuestion),
      });
      // Shared by Pi Web's direct injection and the package bridge. A missing
      // or unreportable result must throw so the agent loop records an error
      // instead of `terminate: true` for an ask that was not durably posted.
      assertReportableOpen(result);
      return {
        content: [{ type: "text", text: postedText(result) }],
        details: result,
        terminate: true,
      };
    },
  });
}
