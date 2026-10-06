import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { readAgentCommandError, AgentCommandError, isPromptRejectedError } = await jiti.import("./agent-client.ts");
const { formatModelSelectionError } = await jiti.import("./model-selection-error-display.ts");
const { MODEL_SELECTION_FAILURE_REASONS } = await jiti.import("./api-types.ts");
const { getLocalePlugin } = await jiti.import("./i18n/registry.ts");
const { translateMessage } = await jiti.import("./i18n/format.ts");
const locales = ["en", "zh-CN", "zh-TW"];
const messages = Object.fromEntries(locales.map((locale) => [locale, getLocalePlugin(locale).messages]));
const t = (locale) => (key, params) => translateMessage(locale, key, messages, params);
const selection = (reason) => ({ code: "model_selection_failed", reason, message: "RAW_AUTH_MESSAGE", provider: "gateway", modelId: "retired-gpt" });

for (const locale of locales) {
  test(`${locale}: every canonical reason has local actionable copy, safe target and no raw message`, () => {
    const reasons = new Set();
    for (const reason of MODEL_SELECTION_FAILURE_REASONS) {
      const error = readAgentCommandError({ code: "prompt_rejected", accepted: false, error: "RAW_LOADER_MESSAGE", modelSelection: selection(reason) }, 409);
      assert.equal(isPromptRejectedError(error), true);
      const text = formatModelSelectionError(error, t(locale));
      assert.match(text, /gateway\/retired-gpt/);
      assert.doesNotMatch(text, /RAW_|chat\.modelSelection|\{\w+\}/);
      reasons.add(text);
      const switched = formatModelSelectionError(error, t(locale), "set-model");
      assert.doesNotMatch(switched, /RAW_|chat\.modelSelection|\{\w+\}/);
      if (locale === "en") {
        assert.match(text, /No model request was sent/);
        assert.match(switched, /previous selection and draft are unchanged/);
      }
    }
    assert.equal(reasons.size, MODEL_SELECTION_FAILURE_REASONS.length, "reasons are not collapsed into a generic network error");
  });
  test(`${locale}: unsafe/unknown DTO falls back locally, never echoes raw loader/auth text or URL`, () => {
    for (const dto of [null, "RAW_LOADER_MESSAGE", {}, selection("unknown-new-reason"),
      { ...selection("auth-unavailable"), modelId: "https://secret:token@example.test" },
      { ...selection("auth-unavailable"), provider: "gateway\nRAW_AUTH_MESSAGE" }]) {
      const error = readAgentCommandError({ error: "RAW_LOADER_MESSAGE", code: "prompt_rejected", accepted: false, modelSelection: dto }, 409);
      const text = formatModelSelectionError(error, t(locale));
      assert.ok(text);
      assert.doesNotMatch(text, /RAW_|secret|token|https|gateway|retired-gpt/);
      assert.equal(isPromptRejectedError(error), true);
      assert.doesNotMatch(error.message, /RAW_/);
    }
  });
}

test("DTO without a target and nested safe model IDs render without a fabricated target", () => {
  const missing = readAgentCommandError({ modelSelection: { code: "model_selection_failed", reason: "missing-selection", message: "raw" } }, 409);
  assert.match(formatModelSelectionError(missing, t("en")), /^No model request was sent\./);
  const nested = readAgentCommandError({ modelSelection: { ...selection("outside-scope"), modelId: "org/nested-model" } }, 409);
  assert.match(formatModelSelectionError(nested, t("en")), /gateway\/org\/nested-model/);
});

test("canonical colon suffixes and at-version model IDs remain displayable without admitting URLs", () => {
  for (const modelId of ["org/nested-model:free", "model@001"]) {
    const error = readAgentCommandError({ modelSelection: { ...selection("outside-scope"), modelId } }, 409);
    assert.ok(formatModelSelectionError(error, t("en")).includes(`gateway/${modelId}`));
  }
  const unsafe = readAgentCommandError({ modelSelection: { ...selection("auth-unavailable"), modelId: "https://secret:token@example.test/path" } }, 409);
  assert.equal(unsafe.modelSelection, undefined);
  assert.doesNotMatch(formatModelSelectionError(unsafe, t("en")), /secret|token|https/);
});

test("generic network errors remain ambiguous, while selection code without DTO gets local fallback", () => {
  assert.equal(formatModelSelectionError(new TypeError("network failed"), t("en")), null);
  assert.equal(formatModelSelectionError(new AgentCommandError("proxy error", 502), t("en")), null);
  const invalid = readAgentCommandError({ code: "model_selection_failed", error: "RAW_LOADER_MESSAGE" }, 409);
  assert.match(formatModelSelectionError(invalid, t("en")), /could not be verified safely/);
  assert.equal(isPromptRejectedError(invalid), false, "selection DTO must not bypass prompt acknowledgement guards");
});

test("HTTP decoder projects the DTO and strips extra fields and raw diagnostic messages", () => {
  const error = readAgentCommandError({ error: "RAW_LOADER_SECRET", modelSelection: { ...selection("auth-unavailable"), auth: { message: "RAW_AUTH_SECRET" } } }, 409);
  assert.deepEqual(error.modelSelection, { ...selection("auth-unavailable"), message: "Model selection failed" });
  assert.doesNotMatch(JSON.stringify(error), /RAW_|"auth":/);
});
