import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AskUserCard.tsx", import.meta.url), "utf8");

test("questions use the full available width across details, options and custom input", () => {
  const question = source.match(/<div key=\{question\.id\} style=\{\{[\s\S]*?\}\}>/)?.[0];
  assert.ok(question);
  assert.match(question, /width: "100%"/);
  assert.match(question, /minWidth: 0/);
  assert.doesNotMatch(question, /maxWidth/);
  assert.match(question, /fontSize: 12\.5/);
  assert.match(source, /gridTemplateColumns: "20px minmax\(0, 1fr\)"/);
});

test("question details have breathing room and wrap long unbroken text", () => {
  const detail = source.match(/question\.detail !== undefined && \([\s\S]*?<\/p>/)?.[0];
  assert.ok(detail);
  assert.match(detail, /padding: "10px 12px"/);
  assert.match(detail, /marginTop: 8/);
  assert.match(detail, /marginBottom: 6/);
  assert.match(detail, /lineHeight: 1\.9/);
  assert.match(detail, /whiteSpace: "pre-wrap"/);
  assert.match(detail, /overflowWrap: "anywhere"/);
  assert.doesNotMatch(detail, /maxWidth/);
  assert.match(detail, /marginTop: paragraphIndex === 0 \? 0 : 6/);
});

test("locks the card after submit so a surviving card cannot be edited again", () => {
  assert.match(source, /useState<"idle" \| "submitting" \| "cancelling">\("idle"\)/);
  assert.match(source, /const locked = status !== "idle";/);
  assert.match(source, /if \(locked\) return;/);
  assert.match(source, /disabled=\{locked\}/);
  assert.match(source, /onSubmit\(ask\.askId, answers, trimmedSupplement === "" \? undefined : trimmedSupplement\)/);
});

test("shows the submitted state and a per-question answer summary once locked", () => {
  assert.match(source, /t\("chat\.askUserSubmitted"\)/);
  assert.match(source, /status === "submitting" \? t\("chat\.askUserSubmitted"\) : t\("chat\.askUserCancelling"\)/);
  assert.match(source, /\{locked && \(draft\.values\.length > 0 \|\| draft\.otherText\.trim\(\) !== ""\) &&/);
  assert.match(source, /\.join\(" · "\)/);
});

test("offers a multiline supplement input beyond the questions", () => {
  assert.match(source, /const \[supplement, setSupplement\] = useState\(""\)/);
  assert.match(source, /t\("chat\.askUserSupplementTitle"\)/);
  assert.match(source, /t\("chat\.askUserSupplementPlaceholder"\)/);
  assert.match(source, /maxLength=\{ASK_USER_OTHER_TEXT_MAX_LENGTH\}/);
  assert.match(source, /resize: "none"/);
});

test("labels the custom-answer input differently for multiple-choice questions", () => {
  assert.match(
    source,
    /question\.multiple === true\s*\? t\("chat\.askUserMultipleOtherPlaceholder"\)\s*: t\("chat\.askUserOtherPlaceholder"\)/,
  );
});
