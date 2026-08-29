import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AskUserCard.tsx", import.meta.url), "utf8");

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
