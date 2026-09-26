import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

/**
 * The controller is the host-neutral behaviour of the ask_user view. These
 * tests drive the pure reducer/selectors directly — no DOM shim — and are the
 * equivalent of the behaviour assertions that used to run the inline view
 * script (see research/assertion-migration.md for the per-assertion mapping).
 */

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const {
  askUserViewReducer,
  answeredCount,
  buildAskUserSubmission,
  createAskUserViewState,
  draftFor,
  isLocked,
  isQuestionAnswered,
  questionSummary,
} = await jiti.import("./view-controller.ts");

const source = await readFile(new URL("./view-controller.ts", import.meta.url), "utf8");

const singleQuestion = {
  id: "q1",
  question: "Single?",
  options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }],
};
const multiQuestion = {
  id: "q2",
  question: "Multi?",
  multiple: true,
  options: [{ value: "eu", label: "Europe" }],
};

function reduce(state, ...actions) {
  return actions.reduce((current, action) => askUserViewReducer(current, action), state);
}

test("an untouched view has empty drafts and is editable", () => {
  const state = createAskUserViewState();
  assert.deepEqual(draftFor(state, "q1"), { values: [], otherText: "" });
  assert.equal(isQuestionAnswered(state, "q1"), false);
  assert.equal(answeredCount(state, [singleQuestion, multiQuestion]), 0);
  assert.equal(isLocked(state), false);
  assert.equal(questionSummary(state, "q1"), "");
  assert.deepEqual(buildAskUserSubmission(state, [singleQuestion, multiQuestion]), { answers: [] });
});

test("the reducer returns a new state without mutating the input", () => {
  const state = createAskUserViewState();
  const snapshot = createAskUserViewState();
  const next = askUserViewReducer(state, { type: "toggle-option", questionId: "q1", value: "yes", multiple: false });
  assert.notEqual(next, state);
  assert.deepEqual(state, snapshot, "the input state must be unchanged");
  assert.deepEqual(draftFor(next, "q1"), { values: ["yes"], otherText: "" });
});

test("single-choice options and custom text are mutually exclusive", () => {
  // Typing custom text clears a picked option ...
  let state = reduce(createAskUserViewState(), { type: "set-other-text", questionId: "q1", text: "custom", multiple: false });
  assert.deepEqual(draftFor(state, "q1"), { values: [], otherText: "custom" });
  // ... and picking an option clears the custom text.
  state = askUserViewReducer(state, { type: "toggle-option", questionId: "q1", value: "yes", multiple: false });
  assert.deepEqual(draftFor(state, "q1"), { values: ["yes"], otherText: "" });
  // The reverse direction leaves only one value, never a list.
  state = askUserViewReducer(state, { type: "set-other-text", questionId: "q1", text: "again", multiple: false });
  state = askUserViewReducer(state, { type: "toggle-option", questionId: "q1", value: "no", multiple: false });
  assert.deepEqual(draftFor(state, "q1"), { values: ["no"], otherText: "" });
});

test("multiple-choice options and custom text coexist and toggle", () => {
  let state = reduce(
    createAskUserViewState(),
    { type: "toggle-option", questionId: "q2", value: "eu", multiple: true },
    { type: "set-other-text", questionId: "q2", text: "plus custom", multiple: true },
  );
  assert.deepEqual(draftFor(state, "q2"), { values: ["eu"], otherText: "plus custom" });
  // Deselecting the option keeps the custom text.
  state = askUserViewReducer(state, { type: "toggle-option", questionId: "q2", value: "eu", multiple: true });
  assert.deepEqual(draftFor(state, "q2"), { values: [], otherText: "plus custom" });
});

test("answeredCount counts selections and non-blank custom text", () => {
  let state = reduce(createAskUserViewState(), { type: "set-other-text", questionId: "q1", text: "   ", multiple: false });
  assert.equal(answeredCount(state, [singleQuestion, multiQuestion]), 0, "whitespace-only custom text is not an answer");
  state = askUserViewReducer(state, { type: "toggle-option", questionId: "q2", value: "eu", multiple: true });
  assert.equal(answeredCount(state, [singleQuestion, multiQuestion]), 1);
  state = askUserViewReducer(state, { type: "set-other-text", questionId: "q1", text: "custom", multiple: false });
  assert.equal(answeredCount(state, [singleQuestion, multiQuestion]), 2);
  assert.equal(isQuestionAnswered(state, "q1"), true);
});

test("submit and cancel lock the view and clear a previous error", () => {
  let state = reduce(
    createAskUserViewState(),
    { type: "action-failed", error: "stale error" },
    { type: "submit-requested" },
  );
  assert.equal(state.status, "submitting");
  assert.equal(state.error, "", "retrying clears the stale error");
  assert.equal(isLocked(state), true);

  const cancel = askUserViewReducer(createAskUserViewState(), { type: "cancel-requested" });
  assert.equal(cancel.status, "cancelling");
  assert.equal(isLocked(cancel), true);
});

test("a rejected action surfaces the error and unlocks so the user can retry", () => {
  const submitted = reduce(createAskUserViewState(), { type: "submit-requested" });
  assert.equal(isLocked(submitted), true, "the form locks while the command is in flight");

  const rejected = askUserViewReducer(submitted, { type: "action-failed", error: "rejected by server" });
  assert.equal(rejected.error, "rejected by server");
  assert.equal(rejected.status, "idle", "a rejection delivered nothing, so retry must stay possible");
  assert.equal(isLocked(rejected), false);

  const retried = askUserViewReducer(rejected, { type: "submit-requested" });
  assert.equal(retried.error, "", "retrying clears the stale error");
  assert.equal(isLocked(retried), true);
});

test("questionSummary uses the raw option values plus trimmed custom text", () => {
  let state = createAskUserViewState();
  assert.equal(questionSummary(state, "q1"), "", "an untouched question has no summary");
  state = askUserViewReducer(state, { type: "toggle-option", questionId: "q1", value: "yes", multiple: false });
  assert.equal(questionSummary(state, "q1"), "✓ yes");
  state = reduce(
    state,
    { type: "toggle-option", questionId: "q2", value: "eu", multiple: true },
    { type: "set-other-text", questionId: "q2", text: "  on dev only  ", multiple: true },
  );
  assert.equal(questionSummary(state, "q2"), "✓ eu · on dev only");
});

test("buildAskUserSubmission skips empty questions and omits blank fields", () => {
  const plain = reduce(
    createAskUserViewState(),
    { type: "toggle-option", questionId: "q1", value: "yes", multiple: false },
    { type: "set-supplement", text: "   " },
  );
  const plainSubmission = buildAskUserSubmission(plain, [singleQuestion, multiQuestion]);
  assert.deepEqual(plainSubmission, { answers: [{ id: "q1", values: ["yes"] }] });
  assert.equal(plainSubmission.supplement, undefined, "a blank supplement is omitted");

  const withCustom = reduce(
    createAskUserViewState(),
    { type: "toggle-option", questionId: "q2", value: "eu", multiple: true },
    { type: "set-other-text", questionId: "q2", text: "  plus custom  ", multiple: true },
    { type: "set-supplement", text: "  extra context  " },
  );
  const customSubmission = buildAskUserSubmission(withCustom, [singleQuestion, multiQuestion]);
  assert.deepEqual(customSubmission, {
    answers: [{ id: "q2", values: ["eu"], otherText: "plus custom" }],
    supplement: "extra context",
  });
  // An omitted `otherText` must be absent, not present as undefined.
  assert.equal("otherText" in customSubmission.answers[0], true);
  assert.equal("otherText" in plainSubmission.answers[0], false);
});

test("question ids that collide with Object.prototype are stored safely", () => {
  const prototypeKeys = Object.getOwnPropertyNames(Object.prototype).sort();
  const state = reduce(
    createAskUserViewState(),
    { type: "toggle-option", questionId: "__proto__", value: "yes", multiple: false },
    { type: "set-other-text", questionId: "toString", text: "custom", multiple: false },
    { type: "toggle-option", questionId: "constructor", value: "eu", multiple: true },
  );
  assert.deepEqual(draftFor(state, "__proto__"), { values: ["yes"], otherText: "" });
  assert.deepEqual(draftFor(state, "toString"), { values: [], otherText: "custom" });
  assert.deepEqual(draftFor(state, "constructor"), { values: ["eu"], otherText: "" });
  assert.equal(isQuestionAnswered(state, "__proto__"), true);
  assert.deepEqual(
    buildAskUserSubmission(state, [
      { id: "__proto__", question: "one", options: [] },
      { id: "toString", question: "two", options: [] },
      { id: "constructor", question: "three", options: [] },
    ]).answers,
    [
      { id: "__proto__", values: ["yes"] },
      { id: "toString", values: [], otherText: "custom" },
      { id: "constructor", values: ["eu"] },
    ],
  );
  assert.deepEqual(Object.getOwnPropertyNames(Object.prototype).sort(), prototypeKeys, "Object.prototype must stay untouched");
});

test("the controller only imports relative modules (no React, @/, or node:)", () => {
  const specifiers = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
  assert.ok(specifiers.length > 0, "expected the controller to import its DTO types");
  for (const specifier of specifiers) {
    assert.ok(specifier.startsWith("."), `only relative imports are allowed, found ${specifier}`);
  }
  assert.doesNotMatch(source, /require\s*\(/, "the controller must not require a Node builtin");
});
