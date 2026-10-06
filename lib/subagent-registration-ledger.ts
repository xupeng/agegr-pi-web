import type { LoadExtensionsResult, ModelRuntime } from "@earendil-works/pi-coding-agent";

interface Generation {
  failed: Set<string>;
  files: Map<string, Set<string>>;
  /** A failed factory has no public provider id; its partial initialization cannot be trusted. */
  incomplete: boolean;
}
const generations = new WeakMap<ModelRuntime, Generation>();
const instrumented = new WeakSet<ModelRuntime>();

export class ProviderInitializationError extends Error {
  constructor() {
    super("Selected provider initialization failed");
    this.name = "ProviderInitializationError";
  }
}

/** Child-only instrumentation: keep failures even if the SDK retains a previous definition.
 * Wrapping the public runtime methods also covers callbacks installed by bindExtensions, without
 * depending on SDK fields or error-message parsing. Each loader result starts a new generation.
 */
export function beginProviderInitializationGeneration(runtime: ModelRuntime, result: LoadExtensionsResult): void {
  const generation: Generation = { failed: new Set(), files: new Map(), incomplete: result.errors.length > 0 };
  const associate = (id: string, file: string): void => {
    const files = generation.files.get(id) ?? new Set<string>();
    files.add(file);
    generation.files.set(id, files);
  };
  for (const entry of result.runtime.pendingProviderRegistrations) associate(entry.name, entry.extensionPath);
  for (const entry of result.runtime.pendingNativeProviderRegistrations) associate(entry.provider.id, entry.extensionPath);
  for (const entry of result.runtime.pendingVirtualModelRegistrations) associate(entry.definition.provider, entry.extensionPath);
  generations.set(runtime, generation);
  if (instrumented.has(runtime)) return;
  instrumented.add(runtime);
  const legacy = runtime.registerProvider.bind(runtime);
  runtime.registerProvider = (...args: Parameters<ModelRuntime["registerProvider"]>) => {
    try { return legacy(...args); }
    catch (error) { generations.get(runtime)?.failed.add(args[0]); throw error; }
  };
  const native = runtime.registerNativeProvider.bind(runtime);
  runtime.registerNativeProvider = (...args: Parameters<ModelRuntime["registerNativeProvider"]>) => {
    try { return native(...args); }
    catch (error) { generations.get(runtime)?.failed.add(args[0].id); throw error; }
  };
  const virtual = runtime.registerVirtualModel.bind(runtime);
  runtime.registerVirtualModel = (...args: Parameters<ModelRuntime["registerVirtualModel"]>) => {
    try { return virtual(...args); }
    catch (error) { generations.get(runtime)?.failed.add(args[0].provider); throw error; }
  };
}

/** No configuration, auth data, raw diagnostics or file paths escape this admission assertion. */
export function assertProviderInitializationHealthy(runtime: ModelRuntime, providerId: string): void {
  const generation = generations.get(runtime);
  if (generation?.incomplete || generation?.failed.has(providerId)) throw new ProviderInitializationError();
}
