import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const { createAskUserToolDefinition } = await jiti.import("./tool.ts");

function makeCtx(sessionId = "s1") {
  return {
    sessionManager: { getSessionId: () => sessionId },
  };
}

test("tool exposes the ask_user contract metadata", () => {
  const tool = createAskUserToolDefinition({ open: async () => ({ ask: null }) });
  assert.equal(tool.name, "ask_user");
  assert.equal(tool.label, "Ask user");
  assert.match(tool.description, /browser form and end this run/);
  assert.equal(tool.promptSnippet, "ask_user: post a question set to the user; ends the run, answers return as a follow-up");
  assert.ok(tool.promptGuidelines.length > 0);
});

test("execute posts the ask, terminates the run, and reports the posted text", async () => {
  const opened = [];
  const tool = createAskUserToolDefinition({
    open: async (input) => {
      opened.push(input);
      return {
        ask: {
          askId: "ask-1",
          askedAt: "2026-08-28T00:00:00.000Z",
          questions: input.questions,
        },
      };
    },
  });
  const result = await tool.execute(
    "call-1",
    {
      questions: [
        {
          id: "q1",
          question: "Which database?",
          options: [{ value: "pg", label: "Postgres" }],
        },
        {
          id: "q2",
          question: "Anything else?",
          multiple: true,
        },
      ],
    },
    undefined,
    undefined,
    makeCtx("s1"),
  );

  assert.equal(opened.length, 1);
  assert.equal(opened[0].sessionId, "s1");
  assert.equal(opened[0].questions.length, 2);
  assert.deepEqual(opened[0].questions[1].options, []);
  assert.equal(opened[0].questions[1].multiple, true);

  assert.equal(result.terminate, true);
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /Posted 2 questions to the user as ask ask-1/);
  assert.match(result.content[0].text, /answers arrive as a follow-up message that wakes you/);
  assert.equal(result.details.ask.askId, "ask-1");
});

test("execute appends a supersede notice when the ask replaced an earlier one", async () => {
  const tool = createAskUserToolDefinition({
    open: async (input) => ({
      ask: {
        askId: "ask-2",
        askedAt: "2026-08-28T00:00:00.000Z",
        questions: input.questions,
      },
      superseded: {
        askId: "ask-1",
        reason: "superseded",
        askedAt: "t",
        closedAt: "t2",
        questions: [],
        answeredCount: 0,
        unansweredIds: ["q1"],
        summary: "Answered 0 of 1; unanswered: q1",
      },
    }),
  });
  const result = await tool.execute(
    "call-1",
    { questions: [{ id: "q9", question: "New?" }] },
    undefined,
    undefined,
    makeCtx(),
  );
  assert.match(result.content[0].text, /replaced an earlier question set \(ask-1\)/);
  assert.match(result.content[0].text, /Left unanswered: q1\./);
});

test("rejected opens propagate so the agent loop sees an error tool result", async () => {
  const tool = createAskUserToolDefinition({
    open: async () => {
      throw new Error("An ask must contain at least one question");
    },
  });
  await assert.rejects(
    () => tool.execute("call-1", { questions: [] }, undefined, undefined, makeCtx()),
    /at least one question/,
  );
});
