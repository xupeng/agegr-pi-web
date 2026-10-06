import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const {
  ASK_USER_VIEW_LOCALES,
  DEFAULT_ASK_USER_VIEW_LOCALE,
  askUserViewLabels,
} = await jiti.import("./copy.ts");

const EXPECTED_KEYS = [
  "title",
  "answered",
  "otherPlaceholder",
  "multipleOtherPlaceholder",
  "supplementTitle",
  "supplementPlaceholder",
  "submitted",
  "cancelling",
  "hint",
  "cancel",
  "submit",
  "actionFailed",
].sort();

test("the bundled table exposes exactly the twelve contract keys for every locale", () => {
  for (const locale of ASK_USER_VIEW_LOCALES) {
    const labels = askUserViewLabels(locale);
    assert.deepEqual(Object.keys(labels).sort(), EXPECTED_KEYS, `${locale} key set drifted`);
  }
});

test("every bundled string is non-empty", () => {
  for (const locale of ASK_USER_VIEW_LOCALES) {
    for (const [key, value] of Object.entries(askUserViewLabels(locale))) {
      assert.equal(typeof value, "string", `${locale}.${key} is not a string`);
      assert.notEqual(value.trim(), "", `${locale}.${key} is blank`);
    }
  }
});

test("the answered template keeps both placeholders in every locale", () => {
  for (const locale of ASK_USER_VIEW_LOCALES) {
    const answered = askUserViewLabels(locale).answered;
    assert.match(answered, /\{count\}/, `${locale} lost {count}`);
    assert.match(answered, /\{total\}/, `${locale} lost {total}`);
  }
});

test("the default locale is English and is one of the bundled locales", () => {
  assert.equal(DEFAULT_ASK_USER_VIEW_LOCALE, "en");
  assert.ok(ASK_USER_VIEW_LOCALES.includes(DEFAULT_ASK_USER_VIEW_LOCALE));
  assert.equal(askUserViewLabels(DEFAULT_ASK_USER_VIEW_LOCALE).submit, "Submit");
});

test("askUserViewLabels returns a copy so callers cannot poison the bundled table", () => {
  const first = askUserViewLabels("en");
  first.title = "mutated";
  assert.equal(askUserViewLabels("en").title, "Questions from the agent");
});

test("the bundled tables are transcriptions, not translations invented here", () => {
  // A spot check per locale that catches a copy-paste of the wrong table.
  assert.equal(askUserViewLabels("en").cancel, "Cancel");
  assert.equal(askUserViewLabels("zh-CN").cancel, "取消");
  assert.equal(askUserViewLabels("zh-TW").cancel, "取消");
  assert.equal(askUserViewLabels("zh-TW").submit, "送出");
});
