import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const { createAskUserToolDefinition } = await jiti.import("./tool.ts");
const { PendingAskStore } = await jiti.import("./store.ts");

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
  assert.match(tool.promptSnippet, /blocking clarification or a required decision/);
  assert.match(tool.promptSnippet, /ends the run, answers return as a follow-up/);
  const guidance = tool.promptGuidelines.join(" ");
  assert.match(guidance, /cannot continue the requested work without a missing fact, scope choice, or decision/);
  assert.match(guidance, /and ask_user is available, use it instead of ending with a prose question/);
  assert.match(guidance, /Group related questions in one call/);
  assert.match(guidance, /Do not use it for ordinary conversation, rhetorical questions, or optional follow-up suggestions/);
  assert.match(guidance, /if the tool is unavailable, ask in prose/);
  assert.match(guidance, /clarification, not authorization for a sensitive action/);
  assert.match(guidance, /Call it alone and last, and do not repost the same questions or poll for answers/);
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

test("a non-durable open result does not terminate", async () => {
  const tool = createAskUserToolDefinition({
    open: async () => ({ ask: { askId: "", askedAt: "t", questions: [] } }),
  });
  await assert.rejects(
    () => tool.execute("call-1", { questions: [{ id: "q1", question: "Which database?" }] }, undefined, undefined, makeCtx()),
    /did not durably register/,
  );
});

test("an unreportable supersede does not terminate", async () => {
  const tool = createAskUserToolDefinition({
    open: async (input) => ({
      ask: { askId: "ask-2", askedAt: "2026-08-28T00:00:00.000Z", questions: input.questions },
      superseded: { askId: "ask-1", reason: "cancelled", unansweredIds: "q1" },
    }),
  });
  await assert.rejects(
    () => tool.execute("call-1", { questions: [{ id: "q9", question: "New?" }] }, undefined, undefined, makeCtx()),
    /superseded outcome is not reportable/,
  );
});

function storeBackedTool() {
  const store = new PendingAskStore({
    now: () => new Date("2026-09-25T00:00:00.000Z"),
    createAskId: (() => {
      let n = 0;
      return () => `ask-${++n}`;
    })(),
  });
  const tool = createAskUserToolDefinition({
    open: async (input) => store.open(input),
  });
  return { store, tool };
}

test("Pi Web store-backed execution keeps malformed runtime asks unregistered", async () => {
  const { store, tool } = storeBackedTool();
  await assert.rejects(
    () => tool.execute("call-1", { questions: [{ id: "", question: "bad" }] }, undefined, undefined, makeCtx()),
    /question id must not be empty/,
  );
  await assert.rejects(
    () => tool.execute("call-1", { questions: [null] }, undefined, undefined, makeCtx()),
    /Each question must be an object/,
  );
  assert.equal(store.pendingAsk("s1"), undefined);
});

test("Pi Web store-backed execution still terminates only after a real open and reports supersede", async () => {
  const { store, tool } = storeBackedTool();
  const first = await tool.execute(
    "call-1",
    { questions: [{ id: "q1", question: "Which database?", options: [{ value: "pg", label: "Postgres" }] }] },
    undefined,
    undefined,
    makeCtx(),
  );
  assert.equal(first.terminate, true);
  assert.equal(store.pendingAsk("s1").askId, "ask-1");
  const second = await tool.execute(
    "call-2",
    { questions: [{ id: "q2", question: "Second?" }] },
    undefined,
    undefined,
    makeCtx(),
  );
  assert.equal(second.terminate, true);
  assert.match(second.content[0].text, /replaced an earlier question set \(ask-1\)/);
  assert.match(second.content[0].text, /Left unanswered: q1\./);
  assert.equal(store.pendingAsk("s1").askId, "ask-2");
  assert.equal(second.details.ask.questions[0].id, "q2");
  assert.equal(second.details.ask.questions[0].multiple, undefined);
});
