import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const {
  ASK_USER_BRIDGE_CHANNEL,
  ASK_USER_BRIDGE_VERSION,
  AskUserBridgeError,
  openAskThroughBridge,
} = await jiti.import("./bridge.ts");
const { PendingAskValidationError, validateQuestions, validateSubmission } = await jiti.import("./validation.ts");

const validQuestions = [
  {
    id: "q1",
    question: "Which database?",
    options: [
      { value: "pg", label: "Postgres" },
      { value: "sqlite", label: "SQLite" },
    ],
  },
];

/** Minimal synchronous event bus matching the SDK's emit/on shape. */
function createBus() {
  const handlers = new Map();
  return {
    on(channel, handler) {
      const list = handlers.get(channel) ?? [];
      list.push(handler);
      handlers.set(channel, list);
      return () => list.splice(list.indexOf(handler), 1);
    },
    emit(channel, data) {
      for (const handler of [...(handlers.get(channel) ?? [])]) handler(data);
    },
  };
}

function makeAck(request, overrides = {}) {
  return {
    ask: {
      askId: "ask-1",
      askedAt: "2026-09-25T00:00:00.000Z",
      questions: request.questions,
      ...overrides,
    },
  };
}

test("shared validator rejects malformed question sets", () => {
  assert.throws(() => validateQuestions([]), PendingAskValidationError);
  assert.throws(() => validateQuestions([{ id: "", question: "x", options: [] }]), /question id must not be empty/);
  assert.throws(
    () => validateQuestions([validQuestions[0], { id: "q1", question: "dup", options: [] }]),
    /Duplicate question id q1/,
  );
});

test("shared validator rejects answers that do not fit the ask", () => {
  const ask = { askId: "a", askedAt: "t", questions: validateQuestions(validQuestions) };
  assert.throws(
    () => validateSubmission(ask, { answers: [{ id: "nope", values: [] }] }),
    /Unknown question id nope/,
  );
  assert.throws(
    () => validateSubmission(ask, { answers: [{ id: "q1", values: ["pg", "sqlite"] }] }),
    /accepts a single answer/,
  );
  assert.throws(
    () => validateSubmission(ask, { answers: [{ id: "q1", values: ["missing"] }] }),
    /has no option missing/,
  );
});

test("missing host bridge fails closed and the host is never called", async () => {
  const bus = createBus();
  await assert.rejects(
    () => openAskThroughBridge(bus, { conversationId: "c1", questions: validQuestions }),
    /exactly one synchronous host bridge/,
  );
});

test("multiple host bridges fail closed", async () => {
  const bus = createBus();
  bus.on(ASK_USER_BRIDGE_CHANNEL, (request) => request.register(async () => makeAck({ questions: validQuestions })));
  bus.on(ASK_USER_BRIDGE_CHANNEL, (request) => request.register(async () => makeAck({ questions: validQuestions })));
  await assert.rejects(
    () => openAskThroughBridge(bus, { conversationId: "c1", questions: validQuestions }),
    /exactly one synchronous host bridge .*\(got 2\)/,
  );
});

test("a bridge that registers after an await is treated as absent", async () => {
  const bus = createBus();
  bus.on(ASK_USER_BRIDGE_CHANNEL, async (request) => {
    await Promise.resolve();
    request.register(async () => makeAck({ questions: validQuestions }));
  });
  await assert.rejects(
    () => openAskThroughBridge(bus, { conversationId: "c1", questions: validQuestions }),
    /exactly one synchronous host bridge .*\(got 0\)/,
  );
});

test("a malformed ask is rejected before the bridge is emitted", async () => {
  const bus = createBus();
  let emits = 0;
  bus.on(ASK_USER_BRIDGE_CHANNEL, () => { emits += 1; });
  await assert.rejects(
    () => openAskThroughBridge(bus, { conversationId: "c1", questions: [] }),
    /An ask must contain at least one question/,
  );
  assert.equal(emits, 0);
});

test("a valid bridge receives the validated ask and its durable ack is returned", async () => {
  const bus = createBus();
  const seen = [];
  bus.on(ASK_USER_BRIDGE_CHANNEL, (request) => {
    request.register(async (ask) => {
      seen.push(ask);
      return makeAck(ask);
    });
  });
  const result = await openAskThroughBridge(bus, { conversationId: "conv-9", questions: validQuestions });
  assert.equal(result.ask.askId, "ask-1");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].version, ASK_USER_BRIDGE_VERSION);
  assert.equal(seen[0].conversationId, "conv-9");
  assert.deepEqual(seen[0].questions[0].options.map((option) => option.value), ["pg", "sqlite"]);
});

test("a host rejection propagates unchanged", async () => {
  const bus = createBus();
  bus.on(ASK_USER_BRIDGE_CHANNEL, (request) => {
    request.register(async () => { throw new Error("Persistence refused"); });
  });
  await assert.rejects(
    () => openAskThroughBridge(bus, { conversationId: "c1", questions: validQuestions }),
    /Persistence refused/,
  );
});

test("invalid or missing durable acknowledgements fail closed", async () => {
  const invalidAcks = [
    undefined,
    {},
    { ask: {} },
    { ask: { askId: "", askedAt: "t", questions: validQuestions } },
    { ask: { askId: "   ", askedAt: "t", questions: validQuestions } },
    { ask: { askId: "a", askedAt: "", questions: validQuestions } },
    { ask: { askId: "a", askedAt: "   ", questions: validQuestions } },
    { ask: { askId: "a", askedAt: "t", questions: [] } },
    { ask: { askId: "a", askedAt: "t", questions: [null] } },
    { ask: { askId: "a", askedAt: "t", questions: [{ id: "other", question: "nope", options: [] }] } },
  ];
  for (const ack of invalidAcks) {
    const bus = createBus();
    bus.on(ASK_USER_BRIDGE_CHANNEL, (request) => request.register(async () => ack));
    await assert.rejects(
      () => openAskThroughBridge(bus, { conversationId: "c1", questions: validQuestions }),
      AskUserBridgeError,
      `ack ${JSON.stringify(ack)} should be rejected`,
    );
  }
});

test("an empty conversation identity fails closed", async () => {
  const bus = createBus();
  await assert.rejects(
    () => openAskThroughBridge(bus, { conversationId: "", questions: validQuestions }),
    /non-empty conversationId/,
  );
});

test("acknowledgement questions must match the validated ask identity", async () => {
  const mismatched = [
    [{ id: "q1", question: "Which database?", options: [{ value: "sqlite", label: "SQLite" }, { value: "pg", label: "Postgres" }] }],
    [{ id: "q1", question: "Which cache?", options: validQuestions[0].options }],
    [validQuestions[0], { id: "q2", question: "Extra?", options: [] }],
  ];
  for (const questions of mismatched) {
    const bus = createBus();
    bus.on(ASK_USER_BRIDGE_CHANNEL, (request) => request.register(async () => ({
      ask: { askId: "ask-1", askedAt: "2026-09-25T00:00:00.000Z", questions },
    })));
    await assert.rejects(
      () => openAskThroughBridge(bus, { conversationId: "c1", questions: validQuestions }),
      /questions do not match the validated ask/,
    );
  }
});

test("a cloned acknowledgement with the same question identity succeeds", async () => {
  const bus = createBus();
  bus.on(ASK_USER_BRIDGE_CHANNEL, (request) => {
    request.register(async (ask) => ({
      ask: {
        askId: "ask-7",
        askedAt: "2026-09-25T00:00:00.000Z",
        questions: ask.questions.map((question) => ({ ...question, hostTag: "ignore", options: question.options.map((option) => ({ ...option })) })),
      },
      superseded: {
        askId: "ask-old",
        reason: "superseded",
        unansweredIds: ["q0"],
        hostNote: "kept",
      },
    }));
  });
  const result = await openAskThroughBridge(bus, { conversationId: "c1", questions: validQuestions });
  assert.equal(result.ask.askId, "ask-7");
  assert.equal(result.ask.questions[0].hostTag, undefined);
  assert.deepEqual(result.ask.questions, validateQuestions(validQuestions));
  assert.equal(result.superseded.askId, "ask-old");
  assert.deepEqual(result.superseded.unansweredIds, ["q0"]);
});

test("mutating the delivered questions cannot forge a matching acknowledgement", async () => {
  const bus = createBus();
  bus.on(ASK_USER_BRIDGE_CHANNEL, (request) => {
    request.register(async (ask) => {
      ask.questions[0].id = "forged";
      return {
        ask: { askId: "ask-1", askedAt: "2026-09-25T00:00:00.000Z", questions: ask.questions },
      };
    });
  });
  await assert.rejects(
    () => openAskThroughBridge(bus, { conversationId: "c1", questions: validQuestions }),
    /questions do not match the validated ask/,
  );
});

test("an invalid supersede acknowledgement fails closed and is not treated as success", async () => {
  const invalid = [
    null,
    {},
    { askId: "old", reason: "cancelled", unansweredIds: ["q1"] },
    { askId: "old", reason: "superseded" },
    { askId: "old", reason: "superseded", unansweredIds: "q1" },
    { askId: "", reason: "superseded", unansweredIds: [] },
    { askId: "old", reason: "superseded", unansweredIds: [1] },
  ];
  for (const superseded of invalid) {
    const bus = createBus();
    bus.on(ASK_USER_BRIDGE_CHANNEL, (request) => request.register(async (ask) => ({
      ask: { askId: "ask-1", askedAt: "2026-09-25T00:00:00.000Z", questions: ask.questions },
      superseded,
    })));
    await assert.rejects(
      () => openAskThroughBridge(bus, { conversationId: "c1", questions: validQuestions }),
      AskUserBridgeError,
      `superseded ${JSON.stringify(superseded)} should be rejected`,
    );
  }
});
