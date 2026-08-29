import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const {
  PendingAskStore,
  PendingAskValidationError,
  renderAskUserAnswersText,
  renderSupersededAskText,
} = await jiti.import("./store.ts");

function makeStore(now = () => new Date("2026-08-28T00:00:00.000Z")) {
  let storeAskId = 0;
  return new PendingAskStore({
    now,
    createAskId: () => `ask-${++storeAskId}`,
  });
}

function question(overrides = {}) {
  return {
    id: "q1",
    question: "Which database?",
    options: [
      { value: "pg", label: "Postgres" },
      { value: "sqlite", label: "SQLite" },
    ],
    ...overrides,
  };
}

function openAsk(store, sessionId = "s1", questions = [question()]) {
  return store.open({ sessionId, questions });
}

test("open registers the ask with a fresh id and clones questions", () => {
  const store = makeStore();
  const result = openAsk(store);
  assert.equal(result.ask.askId, "ask-1");
  assert.equal(result.ask.askedAt, "2026-08-28T00:00:00.000Z");
  assert.equal(result.ask.questions.length, 1);
  assert.equal(result.ask.questions[0].id, "q1");
  assert.equal(result.superseded, undefined);
  // pendingAsk projection returns a clone, not the internal record
  const projected = store.pendingAsk("s1");
  assert.deepEqual(projected, result.ask);
  projected.questions[0].question = "mutated";
  assert.notEqual(store.pendingAsk("s1").questions[0].question, "mutated");
});

test("open supersedes an earlier unanswered ask and reports its outcome", () => {
  const store = makeStore();
  const first = openAsk(store);
  assert.equal(first.ask.askId, "ask-1");
  const second = openAsk(store, "s1", [question({ id: "q2", question: "Second?" })]);
  assert.equal(second.ask.askId, "ask-2");
  assert.equal(second.superseded.askId, "ask-1");
  assert.equal(second.superseded.reason, "superseded");
  assert.equal(second.superseded.answeredCount, 0);
  assert.deepEqual(second.superseded.unansweredIds, ["q1"]);
  assert.equal(store.pendingAsk("s1").askId, "ask-2");
});

test("open validates question sets", () => {
  const store = makeStore();
  assert.throws(() => openAsk(store, "s1", []), PendingAskValidationError);
  assert.throws(
    () => openAsk(store, "s1", Array.from({ length: 21 }, (_, i) => question({ id: `q${i}` }))),
    /more than 20/,
  );
  assert.throws(() => openAsk(store, "s1", [question(), question({ id: "q1" })]), /Duplicate question id q1/);
  assert.throws(() => openAsk(store, "s1", [question({ id: "" })]), /question id must not be empty/);
  assert.throws(
    () => openAsk(store, "s1", [question({ id: "x".repeat(129) })]),
    /question id exceeds its length limit/,
  );
  assert.throws(() => openAsk(store, "s1", [question({ question: "  " })]), /text of question q1 must not be empty/);
  assert.throws(
    () => openAsk(store, "s1", [question({ question: "x".repeat(1001) })]),
    /text of question q1 exceeds its length limit/,
  );
  // empty options are legal: a free-text question
  assert.equal(openAsk(store, "s1", [question({ options: [] })]).ask.questions[0].options.length, 0);
  assert.throws(
    () => openAsk(store, "s1", [question({ options: [{ value: "a", label: "" }] })]),
    /label of option a in question q1 must not be empty/,
  );
  assert.throws(
    () => openAsk(store, "s1", [question({ options: [{ value: "a", label: "A" }, { value: "a", label: "A2" }] })]),
    /Duplicate option value a in question q1/,
  );
  assert.throws(
    () => openAsk(store, "s1", [question({
      options: Array.from({ length: 13 }, (_, i) => ({ value: `v${i}`, label: `V${i}` })),
    })]),
    /more than 12 options/,
  );
});

test("submit records answers and computes the outcome", () => {
  const store = makeStore();
  const { ask } = openAsk(store, "s1", [
    question({ id: "q1", options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ] }),
    question({ id: "q2", question: "Free text?", options: [] }),
  ]);
  const result = store.submit("s1", ask.askId, {
    answers: [
      { id: "q1", values: ["a"] },
      { id: "q2", values: [], otherText: "  my answer  " },
    ],
  });
  assert.equal(result.status, "closed");
  const { outcome } = result;
  assert.equal(outcome.reason, "submitted");
  assert.equal(outcome.answeredCount, 2);
  assert.deepEqual(outcome.unansweredIds, []);
  assert.equal(outcome.questions[0].answered, true);
  assert.deepEqual(outcome.questions[0].values, ["a"]);
  assert.equal(outcome.questions[1].otherText, "my answer");
  assert.match(outcome.summary, /^Answered 2 of 2/);
  assert.equal(store.pendingAsk("s1"), undefined);
});

test("submit reports partial answers with unanswered ids", () => {
  const store = makeStore();
  const { ask } = openAsk(store, "s1", [
    question({ id: "q1" }),
    question({ id: "q2", question: "Second?" }),
  ]);
  const result = store.submit("s1", ask.askId, { answers: [{ id: "q1", values: ["pg"] }] });
  assert.equal(result.status, "closed");
  assert.equal(result.outcome.answeredCount, 1);
  assert.deepEqual(result.outcome.unansweredIds, ["q2"]);
  assert.equal(result.outcome.questions[1].answered, false);
  assert.match(result.outcome.summary, /unanswered: q2/);
});

test("submit records a supplement and renders it for the model", () => {
  const store = makeStore();
  const { ask } = openAsk(store, "s1", [question({ id: "q1" })]);
  const result = store.submit("s1", ask.askId, {
    answers: [{ id: "q1", values: ["pg"] }],
    supplement: "  I also need the read replica config.  ",
  });
  assert.equal(result.status, "closed");
  assert.equal(result.outcome.supplement, "I also need the read replica config.");
  const text = renderAskUserAnswersText(result.outcome);
  assert.match(text, /Supplement \(user-provided, beyond the questions\): "I also need the read replica config\."/);
});

test("submit drops a blank supplement and rejects an over-long one", () => {
  const store = makeStore();
  const { ask } = openAsk(store, "s1", [question({ id: "q1" })]);
  const blank = store.submit("s1", ask.askId, {
    answers: [{ id: "q1", values: ["pg"] }],
    supplement: "   ",
  });
  assert.equal(blank.status, "closed");
  assert.equal(blank.outcome.supplement, undefined);

  const { ask: ask2 } = openAsk(store, "s1", [question({ id: "q1" })]);
  assert.throws(
    () => store.submit("s1", ask2.askId, {
      answers: [{ id: "q1", values: ["pg"] }],
      supplement: "x".repeat(4001),
    }),
    PendingAskValidationError,
  );
});

test("submit rejects answers that do not fit the open ask", () => {
  const store = makeStore();
  const { ask } = openAsk(store);
  assert.throws(
    () => store.submit("s1", ask.askId, { answers: [{ id: "nope", values: [] }] }),
    /Unknown question id nope/,
  );
  assert.throws(
    () => store.submit("s1", ask.askId, { answers: [
      { id: "q1", values: ["pg"] },
      { id: "q1", values: ["sqlite"] },
    ] }),
    /Duplicate answer for question q1/,
  );
  assert.throws(
    () => store.submit("s1", ask.askId, { answers: [{ id: "q1", values: ["mysql"] }] }),
    /Question q1 has no option mysql/,
  );
  assert.throws(
    () => store.submit("s1", ask.askId, { answers: [{ id: "q1", values: ["pg"], otherText: "custom" }] }),
    /accepts a single answer/,
  );
  assert.throws(
    () => store.submit("s1", ask.askId, { answers: [{ id: "q1", values: [], otherText: "x".repeat(4001) }] }),
    /exceeds its length limit/,
  );
  // ask stays open after a rejected submission
  assert.equal(store.pendingAsk("s1").askId, ask.askId);
});

test("multiple questions accept several selected options", () => {
  const store = makeStore();
  const { ask } = openAsk(store, "s1", [question({
    multiple: true,
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
      { value: "c", label: "C" },
    ],
  })]);
  const result = store.submit("s1", ask.askId, { answers: [{ id: "q1", values: ["a", "c"] }] });
  assert.equal(result.status, "closed");
  assert.deepEqual(result.outcome.questions[0].values, ["a", "c"]);
});

test("cancel reports every question unanswered", () => {
  const store = makeStore();
  const { ask } = openAsk(store);
  const result = store.cancel("s1", ask.askId);
  assert.equal(result.status, "closed");
  assert.equal(result.outcome.reason, "cancelled");
  assert.equal(result.outcome.answeredCount, 0);
  assert.deepEqual(result.outcome.unansweredIds, ["q1"]);
});

test("cancelOpen voids the open ask without naming it", () => {
  const store = makeStore();
  openAsk(store);
  const outcome = store.cancelOpen("s1");
  assert.equal(outcome.reason, "cancelled");
  assert.equal(store.pendingAsk("s1"), undefined);
  assert.equal(store.cancelOpen("s1"), undefined);
});

test("submit/cancel for a stale ask id report stale and leave state alone", () => {
  const store = makeStore();
  const { ask } = openAsk(store);
  assert.deepEqual(store.submit("s1", "ask-999", { answers: [] }), { status: "stale" });
  assert.deepEqual(store.cancel("s1", "ask-999"), { status: "stale" });
  assert.equal(store.pendingAsk("s1").askId, ask.askId);
});

test("forgetSession drops the ask without reporting an outcome", () => {
  const store = makeStore();
  openAsk(store);
  store.forgetSession("s1");
  assert.equal(store.pendingAsk("s1"), undefined);
});

test("restore re-registers a persisted ask keeping its original askId", () => {
  const store = makeStore();
  const restored = store.restore("s1", {
    askId: "ask-9",
    askedAt: "2026-08-27T12:00:00.000Z",
    questions: [question({ id: "q9" })],
  });
  assert.equal(restored, true);
  const ask = store.pendingAsk("s1");
  assert.equal(ask.askId, "ask-9");
  assert.equal(ask.askedAt, "2026-08-27T12:00:00.000Z");
  assert.equal(ask.questions[0].id, "q9");
});

test("restore does not supersede or overwrite an existing open ask", () => {
  const store = makeStore();
  const { ask } = openAsk(store);
  const restored = store.restore("s1", {
    askId: "ask-9",
    askedAt: "2026-08-27T12:00:00.000Z",
    questions: [question()],
  });
  assert.equal(restored, false);
  assert.equal(store.pendingAsk("s1").askId, ask.askId);
});

test("restore ignores malformed records", () => {
  const store = makeStore();
  assert.equal(store.restore("s1", undefined), false);
  assert.equal(store.restore("s1", { askId: "", askedAt: "x", questions: [] }), false);
  assert.equal(
    store.restore("s1", {
      askId: "ask-x",
      askedAt: "x",
      questions: [{ id: 1 }],
    }),
    false,
  );
  assert.equal(store.pendingAsk("s1"), undefined);
});

test("sessions hold independent open asks", () => {
  const store = makeStore();
  openAsk(store, "s1");
  openAsk(store, "s2");
  assert.equal(store.pendingAsk("s1").askId, "ask-1");
  assert.equal(store.pendingAsk("s2").askId, "ask-2");
  store.cancelOpen("s1");
  assert.equal(store.pendingAsk("s1"), undefined);
  assert.equal(store.pendingAsk("s2").askId, "ask-2");
});

test("renderAskUserAnswersText names answered and unanswered questions", () => {
  const store = makeStore();
  const { ask } = openAsk(store, "s1", [
    question({
      id: "q1",
      multiple: true,
      options: [
        { value: "pg", label: "Postgres" },
        { value: "sqlite", label: "SQLite" },
      ],
    }),
    question({ id: "q2", question: "Second?" }),
  ]);
  const { outcome } = store.submit("s1", ask.askId, {
    answers: [
      { id: "q1", values: ["pg"], otherText: "actually sqlite" },
    ],
  });
  const text = renderAskUserAnswersText(outcome);
  assert.match(text, /The user submitted answers to your questions\./);
  assert.match(text, /q1: Which database\?/);
  assert.match(text, /selected pg/);
  assert.match(text, /custom: "actually sqlite"/);
  assert.match(text, /q2: Second\?/);
  assert.match(text, /Unanswered\./);
  assert.match(text, /Answered 1 of 2; unanswered: q2/);
});

test("renderAskUserAnswersText covers cancelled closes", () => {
  const store = makeStore();
  const { ask } = openAsk(store);
  const { outcome } = store.cancel("s1", ask.askId);
  const text = renderAskUserAnswersText(outcome);
  assert.match(text, /closed \(cancelled\) before it was fully answered/);
  assert.match(text, /Unanswered\./);
});

test("renderSupersededAskText names the replaced ask and its unanswered ids", () => {
  const outcome = {
    askId: "ask-1",
    reason: "superseded",
    askedAt: "t",
    closedAt: "t2",
    questions: [],
    answeredCount: 0,
    unansweredIds: ["q1", "q2"],
    summary: "Answered 0 of 2; unanswered: q1, q2",
  };
  const text = renderSupersededAskText(outcome);
  assert.match(text, /replaced an earlier question set \(ask-1\)/);
  assert.match(text, /Left unanswered: q1, q2\./);
});
