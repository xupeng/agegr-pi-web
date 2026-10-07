import { realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";
import { readModelsConfig } from "./models-config-store";
import {
  DefaultPackageManager,
  type LoadExtensionsResult,
  type ModelRuntime,
  type PathMetadata,
  type SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { isExistingPathWithinRoots } from "./path-security";
import { samePath } from "./paths";
import { ModelSelectionError } from "./subagent-model-selection";
import type { SubagentProviderSourceRef, SubagentProviderSourcesSnapshot } from "./subagents";

export const SUBAGENT_PROVIDER_SOURCES_TYPE = "pi-web:subagent-provider-sources";

interface CapturedSource {
  ref: SubagentProviderSourceRef;
  valid: () => boolean;
}
// Provenance belongs to the current public registration result, not a provider singleton.
const registries = new WeakMap<object, Map<string, CapturedSource>>();
const registeredIdsByResult = new WeakMap<object, Set<string>>();

function sourceIdentity(source: string): string {
  // URLs may include credentials. Store only an opaque identity, never the raw package config.
  return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

export function isSafeProviderSourceText(value: string): boolean {
  return value.length <= 4096 && !/[\r\n\0]|:\/\/|[?@].*=/.test(value);
}

/** Capture BEFORE SDK services drains the public queues; finalize AFTER sourceInfo is assigned. */
export function captureProviderSources(result: LoadExtensionsResult, cwd: string, baseline?: { modelRuntime: ModelRuntime; agentDir: string }): (runtime: ModelRuntime, diagnostics?: readonly { type: string }[]) => void {
  const legacy = [...result.runtime.pendingProviderRegistrations];
  const native = [...result.runtime.pendingNativeProviderRegistrations];
  const virtual = [...result.runtime.pendingVirtualModelRegistrations];
  const hasConfiguredBase = (id: string): boolean => {
    if (!baseline) return true; // absent pre-registration proof is not a single-file contribution
    try {
      const providers = readModelsConfig(join(baseline.agentDir, "models.json")).providers;
      return typeof providers !== "object" || providers === null || Object.hasOwn(providers, id);
    } catch { return true; }
  };
  // Read public pre-registration state, not the post-merge config. Retain only denial booleans.
  const legacyHasBase = new Set(legacy.filter((entry) => !baseline || hasConfiguredBase(entry.name)
    || baseline.modelRuntime.getRegisteredProviderConfig(entry.name) !== undefined
    || baseline.modelRuntime.getProvider(entry.name) !== undefined).map((entry) => entry.name));
  const sources = new Map<string, CapturedSource>();
  registries.set(result, sources);
  const registeredIds = new Set([...legacy.map((entry) => entry.name), ...native.map((entry) => entry.provider.id), ...virtual.map((entry) => entry.definition.provider)]);
  registeredIdsByResult.set(result, registeredIds);
  return (runtime, diagnostics = []) => {
    // SDK native registration may mutate its getter before throwing. Identity alone is not proof
    // of successful registration. Any registration error leaves this generation unconfirmed.
    if (diagnostics.some((diagnostic) => diagnostic.type === "error")) return;
    const refFor = (id: string, kind: "native" | "legacy", path: string): SubagentProviderSourceRef | undefined => {
      const extension = result.extensions.find((item) => item.path === path);
      const info = extension?.sourceInfo;
      if (!extension || !info || !isAbsolute(extension.resolvedPath) || !info.source) return;
      if (info.scope !== "user" && info.scope !== "project") return;
      try {
        if (!statSync(extension.resolvedPath).isFile()) return;
        return {
          providerId: id, kind, file: realpathSync(extension.resolvedPath),
          scope: info.scope === "user" ? "global" : "project",
          origin: info.origin, source: sourceIdentity(info.source), cwd: resolve(cwd),
        };
      } catch { return; }
    };
    for (const registration of native) {
      const id = registration.provider.id;
      // Last native wins, but only if the public getter confirms this exact successful object.
      const ref = refFor(id, "native", registration.extensionPath);
      if (ref && runtime.getRegisteredNativeProvider(id) === registration.provider && !virtual.some((item) => item.definition.provider === id)) {
        sources.set(id, { ref, valid: () => runtime.getRegisteredNativeProvider(id) === registration.provider });
      }
    }
    for (const registration of legacy) {
      const id = registration.name;
      // Legacy registration merges configs: a last file cannot prove ownership of that merge.
      if (native.some((item) => item.provider.id === id) || virtual.some((item) => item.definition.provider === id)) continue;
      if (legacyHasBase.has(id) || legacy.filter((item) => item.name === id).length !== 1) continue;
      const ref = refFor(id, "legacy", registration.extensionPath);
      const finalConfig = runtime.getRegisteredProviderConfig(id);
      // Pinned SDK getter returns its stable effective object; direct public registerProvider
      // replaces it. Never serialize this object, nor infer ownership merely from its existence.
      if (ref && finalConfig) sources.set(id, { ref, valid: () => runtime.getRegisteredProviderConfig(id) === finalConfig && !hasConfiguredBase(id) });
    }
    // bindExtensions replaces these public callbacks. Wrap their replacement, never SDK fields.
    // Every dynamic change invalidates the affected lead, even when it reuses object identity.
    const callbacks = result.runtime;
    const wrap = <K extends "registerProvider" | "registerNativeProvider" | "unregisterProvider" | "registerVirtualModel" | "unregisterVirtualModel">(key: K): void => {
      let callback = callbacks[key];
      Object.defineProperty(callbacks, key, {
        configurable: true,
        get: () => callback,
        set: (replacement: typeof callback) => {
          callback = ((...args: Parameters<typeof replacement>) => {
            sources.clear();
            const first: unknown = args[0];
            const id = typeof first === "string" ? first : first && typeof first === "object"
              ? (key === "registerVirtualModel" ? Reflect.get(first, "provider") : Reflect.get(first, "id")) : undefined;
            if (typeof id === "string") registeredIds.add(id);
            return Reflect.apply(replacement, callbacks, args);
          }) as typeof callback;
        },
      });
    };
    wrap("registerProvider"); wrap("registerNativeProvider"); wrap("unregisterProvider");
    wrap("registerVirtualModel"); wrap("unregisterVirtualModel");
  };
}

export function readCapturedProviderSources(result: object | undefined, providerId: string): SubagentProviderSourcesSnapshot | undefined {
  const source = result && registries.get(result)?.get(providerId);
  if (!source || !source.valid()) return;
  return { version: 1, refs: [{ ...source.ref }] };
}

/** Distinguish absent builtin/models.json provenance from an extension contribution we cannot prove. */
export function hasUnreplayableProviderSource(result: object | undefined, providerId: string): boolean {
  return Boolean(result && registeredIdsByResult.get(result)?.has(providerId) && !readCapturedProviderSources(result, providerId));
}

/** Re-resolve CURRENT installation, enablement and trust. A stored lead never authorizes code. */
interface AuthorizeProviderSourceOptions {
  refs: SubagentProviderSourcesSnapshot;
  providerId: string;
  cwd: string;
  agentDir: string;
  settingsManager: SettingsManager;
}

export async function authorizeProviderSourceRefs(options: AuthorizeProviderSourceOptions): Promise<Array<{ path: string; metadata: PathMetadata }>> {
  try { return await authorizeCurrentProviderSources(options); }
  catch (error) {
    if (error instanceof ModelSelectionError) throw error;
    throw new ModelSelectionError("provider-source-invalid", "Provider source authorization failed");
  }
}

async function authorizeCurrentProviderSources(options: AuthorizeProviderSourceOptions): Promise<Array<{ path: string; metadata: PathMetadata }>> {
  const fail = (): never => { throw new ModelSelectionError("provider-source-invalid", "Invalid provider source"); };
  if (options.refs.version !== 1 || options.refs.refs.length > 8 || Buffer.byteLength(JSON.stringify(options.refs), "utf8") > 32768) fail();
  const refs = options.refs.refs.filter((ref) => ref.providerId === options.providerId);
  if (refs.length !== 1) fail();
  const [ref] = refs;
  if (!samePath(resolve(ref.cwd), resolve(options.cwd)) && ref.scope === "project") fail();
  if (!isAbsolute(ref.file) || !isSafeProviderSourceText(ref.source)) fail();
  const manager = new DefaultPackageManager({ cwd: options.cwd, agentDir: options.agentDir, settingsManager: options.settingsManager, builtinExtensions: [] });
  const resolved = await manager.resolve(async () => "skip");
  for (const entry of resolved.extensions) {
    if (!entry.enabled || !isAbsolute(entry.path)) continue;
    const info = entry.metadata;
    const sameSource = ref.source === sourceIdentity(info.source) || (isSafeProviderSourceText(ref.source) && ref.source === info.source);
    if (info.scope !== (ref.scope === "global" ? "user" : "project") || info.origin !== ref.origin || !sameSource) continue;
    try {
      if (!statSync(entry.path).isFile() || !samePath(realpathSync(entry.path), ref.file)) continue;
      // Canonical equality catches changed targets; canonical containment accepts legitimate
      // linked package roots while rejecting an entry symlink that escapes the current root.
      // baseDir resolves settings paths; it is NOT an authority root for absolute files.
      // Authority is this enabled/trusted SDK entry, bounded by its declared location.
      const base = ref.scope === "global" ? options.agentDir : join(options.cwd, ".pi");
      let roots = [info.packageRoot ?? info.baseDir ?? base];
      if (info.origin === "top-level" && info.source === "local") {
        const settings = ref.scope === "global" ? options.settingsManager.getGlobalSettings() : options.settingsManager.getProjectSettings();
        roots = (settings.extensions ?? []).filter((path) => !/^[!+-]/.test(path)).flatMap((path) => {
          const declared = resolve(base, path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
          try {
            if (statSync(declared).isFile()) {
              return samePath(resolve(entry.path), declared) ? [dirname(declared)] : [];
            }
            return statSync(declared).isDirectory() && isExistingPathWithinRoots(entry.path, new Set([declared])) ? [declared] : [];
          } catch { return []; }
        });
      }
      if (!roots.some((root) => statSync(root).isDirectory() && isExistingPathWithinRoots(entry.path, new Set([root])))) fail();
      return [{ path: entry.path, metadata: info }];
    } catch (error) {
      if (error instanceof ModelSelectionError) throw error;
    }
  }
  return fail();
}
