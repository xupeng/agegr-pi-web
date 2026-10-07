import { beginProviderInitializationGeneration } from "./subagent-registration-ledger";
import { join } from "node:path";
import { authorizeProviderSourceRefs, captureProviderSources, readCapturedProviderSources } from "./subagent-provider-sources";
import { initializeChildCatalogReadiness, ModelSelectionError } from "./subagent-model-selection";
import type { SubagentProviderSourcesSnapshot } from "./subagents";
import {
  ModelRuntime,
  SettingsManager,
  type AgentSessionRuntimeDiagnostic,
  type AgentSessionServices,
  type LoadExtensionsResult,
  type PathMetadata,
} from "@earendil-works/pi-coding-agent";
import {
  createNoInstallResourceLoader,
  type CreateNoInstallResourceLoaderOptions,
  type NoInstallReloadOptions,
} from "./subagent-resource-loader";

export interface CreateSubagentSessionServicesOptions {
  cwd: string;
  agentDir: string;
  /**
   * An already-initialized runtime the caller owns, for tests or a runtime this code built
   * itself. A provided runtime is never refreshed here, but child registrations and their
   * initialization ledger belong to it. Never supply a parent runtime.
   */
  modelRuntime?: ModelRuntime;
  settingsManager?: SettingsManager;
  resourceLoader?: Omit<CreateNoInstallResourceLoaderOptions, "cwd" | "agentDir" | "settingsManager">;
  /** Public reload options forwarded to the loader, notably `resolveProjectTrust`. */
  resourceLoaderReloadOptions?: NoInstallReloadOptions;
  /** Only for explicit false: replay this provider in a factory-only host. */
  providerOnly?: { providerId: string; sources?: SubagentProviderSourcesSnapshot };
}

export interface ProviderExtensionHostOptions {
  cwd: string;
  agentDir: string;
  /** Concrete provider entry files; directories, globs and package specs are rejected. */
  files: readonly string[];
  /** Each file's real path must stay inside one of these package roots. */
  containmentRoots?: readonly string[];
  /** A caller-owned runtime, used as-is and never refreshed here. */
  modelRuntime?: ModelRuntime;
  settingsManager?: SettingsManager;
}

export interface ProviderExtensionHost {
  modelRuntime: ModelRuntime;
  /** Loaded provider extensions, for authorization diagnostics. No session is bound to them. */
  extensionsResult: LoadExtensionsResult;
  diagnostics: AgentSessionRuntimeDiagnostic[];
}

const providerOnlySources = new WeakMap<object, SubagentProviderSourcesSnapshot>();
export function readProviderOnlySources(loader: object): SubagentProviderSourcesSnapshot | undefined {
  return providerOnlySources.get(loader);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createRuntime(agentDir: string, provided?: ModelRuntime): Promise<ModelRuntime> {
  if (provided) return provided;
  const runtime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  initializeChildCatalogReadiness(runtime);
  return runtime;
}

/**
 * Flush the public pending legacy/native/virtual registration queues into the model runtime the
 * same way `createAgentSessionServices` does, so a child runtime sees an extension's providers
 * without the SDK's own services helper (which cannot take the no-install loader).
 */
function flushPendingProviderRegistrations(
  modelRuntime: ModelRuntime,
  extensionsResult: LoadExtensionsResult,
  diagnostics: AgentSessionRuntimeDiagnostic[],
): void {
  beginProviderInitializationGeneration(modelRuntime, extensionsResult);
  const runtime = extensionsResult.runtime;
  for (const { name, config, extensionPath } of runtime.pendingProviderRegistrations) {
    try {
      modelRuntime.registerProvider(name, config);
    } catch (error) {
      diagnostics.push({ type: "error", message: `Extension "${extensionPath}" provider registration failed: ${errorMessage(error)}` });
    }
  }
  runtime.pendingProviderRegistrations = [];
  for (const { provider, extensionPath } of runtime.pendingNativeProviderRegistrations) {
    try {
      modelRuntime.registerNativeProvider(provider);
    } catch (error) {
      diagnostics.push({ type: "error", message: `Extension "${extensionPath}" native provider registration failed: ${errorMessage(error)}` });
    }
  }
  runtime.pendingNativeProviderRegistrations = [];
  for (const { definition, extensionPath } of runtime.pendingVirtualModelRegistrations) {
    try {
      modelRuntime.registerVirtualModel(definition);
    } catch (error) {
      diagnostics.push({ type: "error", message: `Extension "${extensionPath}" virtual model registration failed: ${errorMessage(error)}` });
    }
  }
  runtime.pendingVirtualModelRegistrations = [];
}

/**
 * Build the coherent cwd-bound services for an independent child runtime. The model runtime is
 * fresh unless one is provided; the settings manager is the real one so model/scope reads stay
 * truthful, while the resource loader authorizes extensions without installing.
 */
export async function createSubagentSessionServices(
  options: CreateSubagentSessionServicesOptions,
): Promise<AgentSessionServices> {
  try { return await buildSubagentSessionServices(options); }
  catch (error) {
    if (error instanceof ModelSelectionError) throw error;
    throw new ModelSelectionError("provider-context-unavailable", "Child services initialization failed");
  }
}

async function buildSubagentSessionServices(options: CreateSubagentSessionServicesOptions): Promise<AgentSessionServices> {
  const cwd = options.cwd;
  const agentDir = options.agentDir;
  const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);
  const ownsRuntime = options.modelRuntime === undefined;
  const modelRuntime = await createRuntime(agentDir, options.modelRuntime);
  const providerDiagnostics: AgentSessionRuntimeDiagnostic[] = [];
  const loader = createNoInstallResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    ...(options.resourceLoader ?? {}),
    ...(options.resourceLoaderReloadOptions ? { reloadOptions: options.resourceLoaderReloadOptions } : {}),
    projectExtensions: (base) => {
      const result = options.resourceLoader?.projectExtensions?.(base) ?? base;
      const finalizeSources = captureProviderSources(result, cwd, { modelRuntime, agentDir });
      flushPendingProviderRegistrations(modelRuntime, result, providerDiagnostics);
      finalizeSources(modelRuntime, providerDiagnostics);
      return result;
    },
  });
  await loader.resourceLoader.reload();
  loader.diagnostics.push(...providerDiagnostics);
  if (options.providerOnly) {
    const { providerId, sources } = options.providerOnly;
    const registeredByExtension = modelRuntime.getRegisteredProviderIds().includes(providerId);
    // An extension lead must be checked even if models.json happens to have a same-name provider.
    if (sources || registeredByExtension || !modelRuntime.getModels().some((model) => model.provider === providerId)) {
      if (!sources) throw new ModelSelectionError("provider-context-unavailable", "No confirmed provider source");
      let files;
      try {
        files = await authorizeProviderSourceRefs({ refs: sources, providerId, cwd, agentDir, settingsManager });
      } catch {
        throw new ModelSelectionError("provider-source-invalid", "Provider source authorization failed");
      }
      const hostLoader = createNoInstallResourceLoader({ cwd, agentDir, settingsManager, explicitExtensions: files });
      await hostLoader.resourceLoader.reload();
      const hostResult = hostLoader.resourceLoader.getExtensions();
      const hostRuntime = await createRuntime(agentDir);
      const finalizeHost = captureProviderSources(hostResult, cwd, { modelRuntime: hostRuntime, agentDir });
      // Virtual routers depend on session context; never transfer them from a provider-only host.
      hostResult.runtime.pendingVirtualModelRegistrations = [];
      flushPendingProviderRegistrations(hostRuntime, hostResult, loader.diagnostics);
      finalizeHost(hostRuntime, loader.diagnostics);
      const replayed = readCapturedProviderSources(hostResult, providerId);
      if (!replayed || replayed.refs[0].kind !== sources.refs.find((ref) => ref.providerId === providerId)?.kind) {
        throw new ModelSelectionError("provider-replay-unsupported", "Provider is not factory-ready or has ambiguous ownership");
      }
      // Transfer only the necessary fresh factory definition, not unrelated provider registrations.
      // No parent credential/runtime object participates in this host or the independent child.
      if (replayed.refs[0].kind === "native") {
        const provider = hostRuntime.getRegisteredNativeProvider(providerId);
        if (!provider) throw new ModelSelectionError("provider-replay-unsupported", "No native definition");
        modelRuntime.registerNativeProvider(provider);
      } else {
        const config = hostRuntime.getRegisteredProviderConfig(providerId);
        if (!config) throw new ModelSelectionError("provider-replay-unsupported", "No single-file legacy definition");
        modelRuntime.unregisterProvider(providerId); // own child only; do not merge a stale generation
        modelRuntime.registerProvider(providerId, config);
      }
      // Never transfer the host's tools, hooks, commands or event bus.
      providerOnlySources.set(loader.resourceLoader, replayed);
    }
  }
  // Only a runtime this call created is refreshed. A provided (caller-owned) runtime is left
  // untouched so a child can never refresh its parent's catalog.
  if (ownsRuntime) {
    try {
      await modelRuntime.refresh({ allowNetwork: false });
    } catch (error) {
      loader.diagnostics.push({ type: "warning", message: `Model catalog refresh failed: ${errorMessage(error)}` });
    }
  }
  return {
    cwd,
    agentDir,
    modelRuntime,
    settingsManager,
    resourceLoader: loader.resourceLoader,
    diagnostics: loader.diagnostics,
  };
}

/**
 * The explicit noExtensions exception: load only the named provider entry files so their
 * factory registers a provider, then flush the registration. No AgentSession is created, so
 * session_start/tool/hook lifecycle never runs and nothing is handed to a child.
 */
export async function createProviderExtensionHost(
  options: ProviderExtensionHostOptions,
): Promise<ProviderExtensionHost> {
  const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
  const settingsManager = options.settingsManager ?? SettingsManager.inMemory({});
  const ownsRuntime = options.modelRuntime === undefined;
  const modelRuntime = await createRuntime(options.agentDir, options.modelRuntime);
  const metadata: PathMetadata = { source: "local", scope: "user", origin: "top-level" };
  const loader = createNoInstallResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    settingsManager,
    explicitExtensions: options.files.map((path) => ({ path, metadata })),
    ...(options.containmentRoots ? { containmentRoots: options.containmentRoots } : {}),
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.resourceLoader.reload();
  const extensionsResult = loader.resourceLoader.getExtensions();
  flushPendingProviderRegistrations(modelRuntime, extensionsResult, diagnostics);
  if (ownsRuntime) {
    try {
      await modelRuntime.refresh({ allowNetwork: false });
    } catch (error) {
      diagnostics.push({ type: "warning", message: `Model catalog refresh failed: ${errorMessage(error)}` });
    }
  }
  diagnostics.push(...loader.diagnostics);
  return { modelRuntime, extensionsResult, diagnostics };
}
