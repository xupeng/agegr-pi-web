import { assertProviderInitializationHealthy, ProviderInitializationError } from "./subagent-registration-ledger";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import {
  resolveModelScopeWithDiagnostics,
  type ModelRuntime,
  type ScopedModel,
  type SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  MODEL_SELECTION_FAILURE_REASONS,
  type ModelSelectionFailureDTO,
  type ModelSelectionFailureReason,
} from "./api-types";

// The canonical reason list and safe DTO live in `api-types.ts` so the client never imports this
// server module. Re-exported here for the server call sites that already reach for them.
export { MODEL_SELECTION_FAILURE_REASONS };
export type { ModelSelectionFailureReason };

/** The safe wire shape for a `ModelSelectionError`; identical to the client-safe DTO. */
export type ModelSelectionSafeDTO = ModelSelectionFailureDTO;

export interface ModelReference {
  provider: string;
  modelId: string;
}

/**
 * A typed refusal raised before any provider request is made. Callers translate it into an
 * Agent tool error or a 409 safe DTO; it never exposes the underlying provider/auth material.
 */
export class ModelSelectionError extends Error {
  readonly reason: ModelSelectionFailureReason;
  readonly provider?: string;
  readonly modelId?: string;

  constructor(
    reason: ModelSelectionFailureReason,
    message: string,
    reference?: ModelReference,
  ) {
    // Tool callers also return Error.message, so safety cannot depend on an HTTP-only decoder.
    super(SAFE_SELECTION_MESSAGES[reason]);
    void message;
    this.name = "ModelSelectionError";
    this.reason = reason;
    if (reference) {
      this.provider = reference.provider;
      this.modelId = reference.modelId;
    }
  }

  toSafeDTO(): ModelSelectionSafeDTO {
    // The DTO is the wire contract shown to users, so it uses a fixed message per reason. The
    // Error.message is safe for Agent tool callers too. Only provider/model identity is echoed,
    // and only when it has the shape of an id (never a credential-bearing URL).
    return {
      code: "model_selection_failed",
      reason: this.reason,
      message: SAFE_SELECTION_MESSAGES[this.reason],
      ...(this.provider && /^[\w.-]+$/.test(this.provider) ? { provider: this.provider } : {}),
      ...(this.modelId && /^[\w./:@+-]+$/.test(this.modelId) && !this.modelId.includes("://") ? { modelId: this.modelId } : {}),
    };
  }
}

/** Fixed, credential-free user-facing text for each refusal reason. */
const SAFE_SELECTION_MESSAGES: Record<ModelSelectionFailureReason, string> = {
  "missing-selection": "No model is selected for this subagent. Choose a model to continue.",
  "provider-context-unavailable": "The selected model's provider is not available for this project.",
  "provider-source-invalid": "The saved provider source is no longer valid. Choose a model to continue.",
  "provider-replay-unsupported": "This subagent's provider cannot be restored automatically. Choose a model to continue.",
  "model-unavailable": "The selected model is no longer available. Choose another model.",
  "auth-unavailable": "No configured authentication for the selected model's provider.",
  "outside-scope": "The selected model is outside the enabled model scope for this project.",
  "scope-unresolved": "The enabled model scope for this project resolves to no model.",
  "selection-mismatch": "The running model does not match this subagent's selected model.",
  "resource-policy-invalid": "This subagent's saved resource policy is invalid and cannot be executed.",
};

export interface ExecutionModelScope {
  /** Models a child may execute when `enabledModels` is configured. Empty means all available. */
  models: readonly Model<Api>[];
  scopedModels: readonly ScopedModel[];
  /** Diagnostics kept for partial misses; they never widen the scope. */
  warnings: string[];
}

/**
 * Resolve the child's execution scope with the same `enabledModels` syntax the UI uses, but
 * without the UI's zero-match fallback: a configured scope that resolves to nothing leaves an
 * empty execution scope, so a stale pattern cannot silently downgrade to the whole catalog.
 */
export async function resolveExecutionModelScope(
  modelRuntime: ModelRuntime,
  settingsManager: SettingsManager,
): Promise<ExecutionModelScope> {
  await awaitChildCatalogReady(modelRuntime);
  const patterns = (settingsManager.getEnabledModels() ?? [])
    .map((pattern) => pattern.trim())
    .filter(Boolean);
  if (patterns.length === 0) {
    return { models: await modelRuntime.getAvailable(), scopedModels: [], warnings: [] };
  }
  // Use the SDK resolver with the real (child-owned) runtime. It owns pattern/alias/thinking
  // parsing; a fake runtime shell would not be a genuine `ModelRuntime` and is not used.
  const { scopedModels, diagnostics } = await resolveModelScopeWithDiagnostics(patterns, modelRuntime);
  return {
    models: scopedModels.map((scoped) => scoped.model),
    scopedModels,
    warnings: diagnostics.map((diagnostic) => diagnostic.message),
  };
}

function sameModel(model: { provider: string; id: string }, reference: ModelReference): boolean {
  return model.provider === reference.provider && model.id === reference.modelId;
}

function hasGlob(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?") || pattern.includes("[");
}

/** Parse `provider/modelId`; returns null for a bare id so the caller can resolve it by id. */
export function parseModelReference(value: string): ModelReference | null {
  const requested = value.trim();
  const slash = requested.indexOf("/");
  if (slash <= 0) return null;
  return { provider: requested.slice(0, slash), modelId: requested.slice(slash + 1) };
}

interface ChildCatalogReadiness { tail: Promise<void> }
const childCatalogReadiness = new WeakMap<ModelRuntime, ChildCatalogReadiness>();

/** Install only on a freshly created, independently owned child runtime. Native registration
 * starts a fire-and-forget public refresh; an overlapping availability pass can supersede the
 * explicitly awaited pass before it publishes auth. Global getAvailable also publishes that
 * same snapshot, so serialize both public operations (not SDK internals or credentials).
 */
export function initializeChildCatalogReadiness(runtime: ModelRuntime): void {
  if (childCatalogReadiness.has(runtime)) return;
  const state: ChildCatalogReadiness = { tail: Promise.resolve() };
  childCatalogReadiness.set(runtime, state);
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const task = state.tail.catch(() => {}).then(operation);
    state.tail = task.then(() => {});
    // The SDK intentionally ignores registration-triggered refresh promises. Keep rejection
    // observed without hiding it from an explicit caller or the readiness gate.
    void state.tail.catch(() => {});
    void task.catch(() => {});
    return task;
  };
  const refresh = runtime.refresh.bind(runtime);
  runtime.refresh = (...args: Parameters<ModelRuntime["refresh"]>) => enqueue(() => refresh(...args));
  const available = runtime.getAvailable.bind(runtime);
  runtime.getAvailable = (...args: Parameters<ModelRuntime["getAvailable"]>) => enqueue(() => available(...args));
}

async function awaitChildCatalogReady(runtime: ModelRuntime): Promise<void> {
  const state = childCatalogReadiness.get(runtime);
  if (!state) return; // Caller-owned runtimes are never refreshed or instrumented here.
  let tail: Promise<void>;
  do {
    tail = state.tail;
    await tail;
    // Public registrations/queries arriving during the await belong to this gate too. This
    // drains promises, not timed retries, and does not mutate registration/source generations.
  } while (tail !== state.tail);
}

interface ConcreteModelResolution {
  model: Model<Api>;
  reference: ModelReference;
  thinkingLevel?: ThinkingLevel;
}

/**
 * Resolve one explicit model reference to a concrete runtime model, delegating pattern/alias/
 * thinking parsing to the SDK resolver (`resolveModelScopeWithDiagnostics`) instead of a local
 * matcher. A missing provider context, a missing model, or an ambiguous bare id refuse; a provider
 * default is never substituted.
 */
export async function resolveConcreteModel(
  modelRuntime: ModelRuntime,
  source: string | ModelReference,
): Promise<ConcreteModelResolution> {
  await awaitChildCatalogReady(modelRuntime);
  const exactReference = typeof source === "string" ? undefined : source;
  const requested = typeof source === "string" ? source.trim() : `${source.provider}/${source.modelId}`;
  if (!requested) throw new ModelSelectionError("missing-selection", "No model was selected for the subagent");
  const parsed = exactReference ?? parseModelReference(requested);
  if (parsed) {
    try { assertProviderInitializationHealthy(modelRuntime, parsed.provider); }
    catch (error) {
      if (error instanceof ProviderInitializationError) throw new ModelSelectionError("provider-context-unavailable", "Provider initialization failed", parsed);
      throw error;
    }
  }
  if (parsed && !modelRuntime.getModels().some((candidate) => candidate.provider === parsed.provider)) {
    throw new ModelSelectionError(
      "provider-context-unavailable",
      `Provider is not available in the child runtime: ${parsed.provider}`,
      parsed,
    );
  }
  // The SDK scope resolver enumerates authenticated models. For a known exact model, distinguish
  // missing auth before that resolver can turn it into an apparent missing-model refusal.
  if (parsed && modelRuntime.getModel(parsed.provider, parsed.modelId) && !modelRuntime.hasConfiguredAuth(parsed.provider)) {
    throw new ModelSelectionError("auth-unavailable", "Selected provider has no configured auth", parsed);
  }
  // Exact full ids win before SDK pattern parsing (including legitimate :free and @ versions).
  const exact = parsed && modelRuntime.getModel(parsed.provider, parsed.modelId);
  if (exact) return { model: exact, reference: { provider: exact.provider, modelId: exact.id } };
  if (exactReference) {
    throw new ModelSelectionError("model-unavailable", "Exact model reference is unavailable", exactReference);
  }
  // A bare id claimed by more than one provider is ambiguous; the SDK resolver would pick a
  // "best" version, which is not an explicit user choice, so refuse it here.
  if (!parsed && !hasGlob(requested)) {
    const bareMatches = modelRuntime.getModels().filter((candidate) => candidate.id === requested);
    if (bareMatches.length > 1) {
      throw new ModelSelectionError(
        "model-unavailable",
        `Model is ambiguous; use provider/modelId: ${requested}`,
      );
    }
  }
  const { scopedModels, diagnostics } = await resolveModelScopeWithDiagnostics([requested], modelRuntime);
  if (diagnostics.length > 0 || scopedModels.length === 0) {
    throw new ModelSelectionError(
      "model-unavailable",
      `Model is not available in the child runtime: ${requested}`,
      parsed ?? undefined,
    );
  }
  if (scopedModels.length > 1) {
    throw new ModelSelectionError(
      "model-unavailable",
      `Model reference is ambiguous; use provider/modelId: ${requested}`,
    );
  }
  const [scoped] = scopedModels;
  try { assertProviderInitializationHealthy(modelRuntime, scoped.model.provider); }
  catch (error) {
    if (error instanceof ProviderInitializationError) throw new ModelSelectionError("provider-context-unavailable", "Provider initialization failed", { provider: scoped.model.provider, modelId: scoped.model.id });
    throw error;
  }
  return {
    model: scoped.model,
    reference: { provider: scoped.model.provider, modelId: scoped.model.id },
    ...(scoped.thinkingLevel ? { thinkingLevel: scoped.thinkingLevel as ThinkingLevel } : {}),
  };
}

export interface ResolveSubagentModelSelectionOptions {
  modelRuntime: ModelRuntime;
  settingsManager: SettingsManager;
  /** HTTP/persisted references: highest priority, exact lookup with no SDK pattern parsing. */
  requestedReference?: ModelReference;
  /** Explicit request pattern override; higher priority than profile/parent. */
  requestedModel?: string;
  /** Profile-configured model; used when the request carries none. */
  profileModel?: string;
  /** Parent's current model identity, used only as a reference to re-resolve. */
  parentModel?: ModelReference;
  thinkingLevel?: ThinkingLevel;
}

export interface ResolvedSubagentModelSelection {
  model: Model<Api>;
  reference: ModelReference;
  thinkingLevel?: ThinkingLevel;
  scopedModels: ScopedModel[];
}

/**
 * Resolve the model a child executes with, in the child's own runtime:
 * `request.model > profile.model > parent's current model reference`.
 *
 * The chosen model must be inside the configured execution scope and have configured auth,
 * otherwise the call throws a typed refusal. The SDK's own "pick a provider default" fallback
 * is never used.
 */
export async function resolveSubagentModelSelection(
  options: ResolveSubagentModelSelectionOptions,
): Promise<ResolvedSubagentModelSelection> {
  try { return await selectSubagentModel(options); }
  catch (error) {
    if (error instanceof ModelSelectionError) throw error;
    throw new ModelSelectionError("model-unavailable", "Selected provider could not resolve an executable model");
  }
}

async function selectSubagentModel(options: ResolveSubagentModelSelectionOptions): Promise<ResolvedSubagentModelSelection> {
  const source = options.requestedReference ?? (options.requestedModel?.trim()
    ? options.requestedModel.trim()
    : options.profileModel?.trim()
      ? options.profileModel.trim()
      : options.parentModel
        ? options.parentModel
        : undefined);
  if (!source) {
    throw new ModelSelectionError("missing-selection", "No model is selected for the subagent");
  }
  await awaitChildCatalogReady(options.modelRuntime);
  // SDK scope parsing and availability are separate async reads. Keep a private, ephemeral
  // signature of their public inputs; a same-id rename/endpoint update can leave a target
  // available while invalidating its earlier scope/pin/model projection. Never log this data.
  const catalogSignature = JSON.stringify(options.modelRuntime.getModels());
  const scopeSignature = JSON.stringify(options.settingsManager.getEnabledModels() ?? []);
  const { model, reference, thinkingLevel: targetThinking } = await resolveConcreteModel(options.modelRuntime, source);
  if (!options.modelRuntime.hasConfiguredAuth(reference.provider)) {
    throw new ModelSelectionError("auth-unavailable", "No configured authentication for selected provider", reference);
  }
  const scope = await resolveExecutionModelScope(options.modelRuntime, options.settingsManager);
  if (scope.models.length === 0) {
    throw new ModelSelectionError(
      "scope-unresolved",
      "The configured enabledModels scope resolves to no model for this project",
      reference,
    );
  }
  if (!scope.models.some((candidate) => sameModel(candidate, reference))) {
    throw new ModelSelectionError(
      "outside-scope",
      `Model is outside the configured enabledModels scope: ${reference.provider}/${reference.modelId}`,
      reference,
    );
  }
  const available = await options.modelRuntime.getAvailable();
  await awaitChildCatalogReady(options.modelRuntime);
  // A public registration can arrive while the query is awaiting local auth. For an owned
  // runtime use the fully drained snapshot, not the superseded query's candidate list.
  const readyAvailable = childCatalogReadiness.has(options.modelRuntime)
    ? options.modelRuntime.getAvailableSnapshot()
    : available;
  try { assertProviderInitializationHealthy(options.modelRuntime, reference.provider); }
  catch (error) {
    if (error instanceof ProviderInitializationError) throw new ModelSelectionError("provider-context-unavailable", "Provider initialization failed", reference);
    throw error;
  }
  if (!options.modelRuntime.getModel(reference.provider, reference.modelId)) {
    throw new ModelSelectionError("model-unavailable", "Selected model was removed during validation", reference);
  }
  if (!options.modelRuntime.hasConfiguredAuth(reference.provider)) {
    throw new ModelSelectionError("auth-unavailable", "Selected provider auth changed during validation", reference);
  }
  if (!readyAvailable.some((candidate) => sameModel(candidate, reference))) {
    throw new ModelSelectionError("model-unavailable", "Selected model is unavailable", reference);
  }
  if (JSON.stringify(options.modelRuntime.getModels()) !== catalogSignature
    || JSON.stringify(options.settingsManager.getEnabledModels() ?? []) !== scopeSignature) {
    throw new ModelSelectionError("model-unavailable", "Model catalog or scope changed during validation", reference);
  }
  const scoped = scope.scopedModels.find((candidate) => sameModel(candidate.model, reference));
  const thinkingLevel = options.thinkingLevel
    ?? targetThinking
    ?? (scoped?.thinkingLevel as ThinkingLevel | undefined);
  return {
    model,
    reference,
    ...(thinkingLevel ? { thinkingLevel } : {}),
    scopedModels: [...scope.scopedModels],
  };
}

/**
 * An alive wrapper must keep the branch's newest explicit `model_change`. A mismatch means the
 * live runtime drifted to a physical answer that is not a user selection, so the caller refuses
 * to continue instead of silently running a different model.
 */
export function assertExplicitSelectionMatches(
  selection: ModelReference | null,
  live: { provider: string; id: string } | null | undefined,
  resolved?: Model<Api>,
): void {
  if (!selection) {
    throw new ModelSelectionError(
      "missing-selection",
      "The subagent session has no explicit model selection; choose a model to continue",
      live ? { provider: live.provider, modelId: live.id } : undefined,
    );
  }
  if (!live || selection.provider !== live.provider || selection.modelId !== live.id
    || (resolved && JSON.stringify(live) !== JSON.stringify(resolved))) {
    throw new ModelSelectionError(
      "selection-mismatch",
      `The running subagent model does not match its explicit selection: ${selection.provider}/${selection.modelId}`,
      selection,
    );
  }
}
