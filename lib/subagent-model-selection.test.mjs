import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const {
  ModelSelectionError,
  resolveConcreteModel,
  resolveSubagentModelSelection,
  assertExplicitSelectionMatches,
} = await jiti.import("./subagent-model-selection.ts");
const { isModelSelectionFailureDTO, MODEL_SELECTION_FAILURE_REASONS } = await jiti.import("./api-types.ts");

const modelA = { provider: "alpha", id: "gpt" };
const modelB = { provider: "beta", id: "kimi" };
const allModels = [modelA, modelB];

function runtime(models = allModels, configured = models.map((model) => model.provider)) {
  return {
    getModel: (provider, id) => models.find((model) => model.provider === provider && model.id === id),
    getModels: () => models,
    getAvailable: async () => models,
    hasConfiguredAuth: (provider) => configured.includes(provider),
  };
}

function settings(patterns) {
  return { getEnabledModels: () => patterns };
}

test("the safe DTO accepts only known reasons and never requires auth fields", () => {
  assert.equal(isModelSelectionFailureDTO({
    code: "model_selection_failed",
    reason: "outside-scope",
    message: "outside",
  }), true);
  assert.equal(isModelSelectionFailureDTO({
    code: "model_selection_failed",
    reason: "made-up-reason",
    message: "x",
  }), false);
  assert.equal(isModelSelectionFailureDTO({ code: "model_selection_failed", reason: "outside-scope" }), false);
  assert.deepEqual(MODEL_SELECTION_FAILURE_REASONS.includes("selection-mismatch"), true);
});

test("toSafeDTO never echoes a raw loader/auth message", () => {
  const error = new ModelSelectionError(
    "provider-context-unavailable",
    "loader failed: https://user:secret@host/path?token=SECRET",
    { provider: "sub2api", modelId: "gpt" },
  );
  const dto = error.toSafeDTO();
  assert.doesNotMatch(dto.message, /secret|https:\/\/|token=/i);
  assert.doesNotMatch(error.message, /secret|https:\/\/|token=/i);
  assert.equal(dto.message, error.message);
  assert.equal(dto.provider, "sub2api");
  assert.equal(dto.modelId, "gpt");
  assert.equal(isModelSelectionFailureDTO(dto), true);
});

test("resolveConcreteModel distinguishes a missing provider from a missing model", async () => {
  await assert.rejects(
    resolveConcreteModel(runtime(), "ghost/model"),
    (error) => error instanceof ModelSelectionError && error.reason === "provider-context-unavailable",
  );
  await assert.rejects(
    resolveConcreteModel(runtime(), "alpha/missing"),
    (error) => error instanceof ModelSelectionError && error.reason === "model-unavailable",
  );
  assert.equal((await resolveConcreteModel(runtime(), "alpha/gpt")).reference.modelId, "gpt");
});

test("selection priority is request > profile > parent, all re-resolved in the child runtime", async () => {
  const runtimeAlpha = runtime();
  const requested = await resolveSubagentModelSelection({
    modelRuntime: runtimeAlpha,
    settingsManager: settings([]),
    requestedModel: "beta/kimi",
    profileModel: "alpha/gpt",
    parentModel: { provider: "alpha", modelId: "gpt" },
  });
  assert.equal(requested.reference.provider, "beta");

  const fromProfile = await resolveSubagentModelSelection({
    modelRuntime: runtimeAlpha,
    settingsManager: settings([]),
    profileModel: "beta/kimi",
    parentModel: { provider: "alpha", modelId: "gpt" },
  });
  assert.equal(fromProfile.reference.provider, "beta");

  const fromParent = await resolveSubagentModelSelection({
    modelRuntime: runtimeAlpha,
    settingsManager: settings([]),
    parentModel: { provider: "alpha", modelId: "gpt" },
  });
  assert.equal(fromParent.reference.provider, "alpha");

  await assert.rejects(
    resolveSubagentModelSelection({ modelRuntime: runtimeAlpha, settingsManager: settings([]) }),
    (error) => error instanceof ModelSelectionError && error.reason === "missing-selection",
  );
});

test("an empty configured scope resolves to no execution scope, not the whole catalog", async () => {
  await assert.rejects(
    resolveSubagentModelSelection({
      modelRuntime: runtime(),
      settingsManager: settings(["gamma/*"]),
      requestedModel: "alpha/gpt",
    }),
    (error) => error instanceof ModelSelectionError && error.reason === "scope-unresolved",
  );
});

test("a target outside the resolved scope and a missing auth both refuse", async () => {
  await assert.rejects(
    resolveSubagentModelSelection({
      modelRuntime: runtime(),
      settingsManager: settings(["alpha/*"]),
      requestedModel: "beta/kimi",
    }),
    (error) => error instanceof ModelSelectionError && error.reason === "outside-scope",
  );
  await assert.rejects(
    resolveSubagentModelSelection({
      modelRuntime: runtime(allModels, ["alpha"]),
      settingsManager: settings([]),
      requestedModel: "beta/kimi",
    }),
    (error) => error instanceof ModelSelectionError && error.reason === "auth-unavailable",
  );
});

test("an alive wrapper must match its branch's newest explicit selection", () => {
  assert.doesNotThrow(() => assertExplicitSelectionMatches({ provider: "alpha", modelId: "gpt" }, { provider: "alpha", id: "gpt" }));
  assert.throws(
    () => assertExplicitSelectionMatches({ provider: "alpha", modelId: "gpt" }, { provider: "beta", id: "kimi" }),
    (error) => error instanceof ModelSelectionError && error.reason === "selection-mismatch",
  );
  assert.throws(
    () => assertExplicitSelectionMatches(null, { provider: "beta", id: "kimi" }),
    (error) => error instanceof ModelSelectionError && error.reason === "missing-selection",
  );
});
