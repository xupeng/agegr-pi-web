import { statSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import {
  createSyntheticSourceInfo,
  DefaultPackageManager,
  DefaultResourceLoader,
  SettingsManager,
  type AgentSessionRuntimeDiagnostic,
  type InlineExtension,
  type LoadExtensionsResult,
  type PathMetadata,
  type ResolvedResource,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { isExistingPathWithinRoots } from "./path-security";

/** `ResourceLoader.reload` options, derived from the public interface (the SDK does not export the type). */
export type NoInstallReloadOptions = Parameters<ResourceLoader["reload"]>[0];

export interface NoInstallExtensionSource {
  /** Concrete existing file, never a directory, glob, or package spec. */
  path: string;
  metadata: PathMetadata;
}

export interface NoInstallSkillSource {
  /** Concrete existing skill directory or `SKILL.md`, never a glob or package spec. */
  path: string;
  metadata: PathMetadata;
}

export interface CreateNoInstallResourceLoaderOptions {
  cwd: string;
  agentDir: string;
  /** Real settings used for authorization; the loader projects a package-free view internally. */
  settingsManager?: SettingsManager;
  /** What to do with an enabled package that is not installed: skip it, or fail the reload. */
  onMissingSource?: (source: string) => "skip" | "error";
  /** Skip the package preflight entirely and load exactly these concrete files. */
  explicitExtensions?: readonly NoInstallExtensionSource[];
  /** Explicit files and preflighted resources must resolve inside one of these package roots. */
  containmentRoots?: readonly string[];
  extensionFactories?: InlineExtension[];
  /**
   * Load the preflighted installed extensions. Defaults to true; `false` still preflights
   * skills when `loadSkills` is set, but authorizes no extension and resolves no package
   * unless skills need the resolution. Used by the child `loadExtensions:false` path.
   */
  loadExtensions?: boolean;
  /**
   * Load the skills the preflight authorizes for the current trust/enablement state. The inner
   * loader still disables auto-discovery, so only authorized skill paths can appear.
   */
  loadSkills?: boolean;
  /** Explicit off switch that wins over `loadSkills`. */
  noSkills?: boolean;
  noPromptTemplates?: boolean;
  noThemes?: boolean;
  noContextFiles?: boolean;
  systemPrompt?: string;
  systemPromptOverride?: (base: string | undefined) => string | undefined;
  appendSystemPrompt?: string[];
  /**
   * Forwarded to every `reload()` unless the caller passes per-call options. `resolveProjectTrust`
   * here is what gates project extensions behind the real trust store, so the wrapper passes
   * `projectTrustReloadOptions(cwd, agentDir)`.
   */
  reloadOptions?: NoInstallReloadOptions;
  /** Runs after sourceInfo is restored from the preflight and before the session reads the result. */
  projectExtensions?: (base: LoadExtensionsResult) => LoadExtensionsResult;
}

export interface NoInstallResourceLoader {
  resourceLoader: ResourceLoader;
  /** Enabled extension resources the loader is authorized to load, with their real path metadata. */
  readonly authorizedExtensions: ResolvedResource[];
  diagnostics: AgentSessionRuntimeDiagnostic[];
}

function hasSyntheticPath(path: string): boolean {
  return path.startsWith("builtin:") || path.startsWith("<");
}

function assertConcreteSource(path: string): void {
  if (!isAbsolute(path)) {
    throw new Error(`Extension source must be an absolute file path: ${path}`);
  }
  if (path.startsWith("npm:") || path.includes("*")) {
    throw new Error(`Extension source must be a concrete file, not a package spec or glob: ${path}`);
  }
}

function assertExistingResource(path: string): void {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(path);
  } catch {
    throw new Error(`Extension source does not exist: ${path}`);
  }
  if (!stats.isFile() && !stats.isDirectory()) {
    throw new Error(`Extension source must be a regular file or directory: ${path}`);
  }
}

function assertConcreteFile(path: string): void {
  assertConcreteSource(path);
  let isFile: boolean;
  try {
    isFile = statSync(path).isFile();
  } catch {
    throw new Error(`Extension source does not exist: ${path}`);
  }
  if (!isFile) throw new Error(`Extension source must be a regular file: ${path}`);
}

/**
 * Reuse the one file-access authorization in `lib/path-security.ts`: it realpaths both sides
 * (so a symlinked root and a symlinked file are compared canonically), rejects `..` segments,
 * and case-folds on Windows. Copying that boundary logic here would let the two drift.
 */
function assertWithinRoots(path: string, roots: readonly string[]): void {
  if (!isExistingPathWithinRoots(path, new Set(roots))) {
    throw new Error(`Extension source resolves outside its package root: ${path}`);
  }
}

function findMetadata(
  metadataByPath: ReadonlyMap<string, PathMetadata>,
  filePath: string,
): PathMetadata | undefined {
  const resolved = resolve(filePath);
  const exact = metadataByPath.get(resolved);
  if (exact !== undefined) return exact;
  for (const [sourcePath, metadata] of metadataByPath) {
    const root = resolve(sourcePath);
    if (resolved === root || resolved.startsWith(`${root}${sep}`)) return metadata;
  }
  return undefined;
}

/**
 * Restore the real `sourceInfo` the package preflight resolved. The inner loader necessarily
 * receives authorized files as CLI-style additional paths, so its own pass records them as
 * `cli`/`temporary`; extension alias selectors and trust decisions must keep seeing the
 * package/local source and scope they had in a normal load.
 */
function restoreExtensionSourceInfo(
  result: LoadExtensionsResult,
  metadataByPath: ReadonlyMap<string, PathMetadata>,
): void {
  for (const extension of result.extensions) {
    const metadata = findMetadata(metadataByPath, extension.resolvedPath);
    if (metadata === undefined) continue;
    const sourceInfo = createSyntheticSourceInfo(extension.path, {
      source: metadata.source,
      scope: metadata.scope,
      origin: metadata.origin,
      baseDir: metadata.baseDir,
    });
    extension.sourceInfo = sourceInfo;
    for (const command of extension.commands.values()) command.sourceInfo = sourceInfo;
    for (const tool of extension.tools.values()) tool.sourceInfo = sourceInfo;
  }
}

/** Restore the preflight sourceInfo of authorized skills, which the inner loader marks as `cli`. */
function restoreSkillSourceInfo(
  loader: DefaultResourceLoader,
  metadataByPath: ReadonlyMap<string, PathMetadata>,
): void {
  for (const skill of loader.getSkills().skills) {
    const metadata = findMetadata(metadataByPath, skill.filePath);
    if (metadata === undefined) continue;
    skill.sourceInfo = createSyntheticSourceInfo(skill.filePath, {
      source: metadata.source,
      scope: metadata.scope,
      origin: metadata.origin,
      baseDir: metadata.baseDir,
    });
  }
}

/**
 * A `ResourceLoader` that resolves the current enabled/trusted installed resources with the
 * public no-install `PackageManager.resolve(skip/error)` callback, then loads exactly those
 * concrete files through an inner `DefaultResourceLoader` whose settings projection contains
 * no `packages` or resource declarations. The inner loader therefore cannot install a missing
 * package or widen the authorized set by re-resolving a package spec, directory, or glob.
 *
 * `reload` forwards the public reload options, and resolves project trust afresh on every call:
 * a bootstrap pass with trust off feeds `resolveProjectTrust`, its answer is written to the real
 * settings manager, and only then does the package preflight run. A trust snapshot taken at
 * construction would keep loading project extensions after the decision was revoked.
 */
export function createNoInstallResourceLoader(
  options: CreateNoInstallResourceLoaderOptions,
): NoInstallResourceLoader {
  const cwd = resolve(options.cwd);
  const agentDir = resolve(options.agentDir);
  const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);
  const diagnostics: AgentSessionRuntimeDiagnostic[] = [];
  const skillsEnabled = options.loadSkills === true && options.noSkills !== true;
  const extensionsEnabled = options.loadExtensions !== false;
  let authorized: ResolvedResource[] = [];
  let activeLoader: DefaultResourceLoader | undefined;
  let current: LoadExtensionsResult | undefined;

  const onMissing = async (source: string): Promise<"skip" | "error"> => {
    const action = options.onMissingSource?.(source) ?? "skip";
    diagnostics.push({
      type: action === "error" ? "error" : "warning",
      message: `Extension package "${source}" is not installed; ${action === "error" ? "refusing to continue" : "skipped"} without installing.`,
    });
    return action;
  };

  const authorizeInstalled = async (): Promise<{
    extensions: NoInstallExtensionSource[];
    skills: NoInstallSkillSource[];
  }> => {
    if (!extensionsEnabled && !skillsEnabled) return { extensions: [], skills: [] };
    const packageManager = new DefaultPackageManager({
      cwd,
      agentDir,
      settingsManager,
      builtinExtensions: [],
    });
    const resolved = await packageManager.resolve(onMissing);
    const extensions: NoInstallExtensionSource[] = [];
    if (extensionsEnabled) {
      for (const resource of resolved.extensions) {
        if (!resource.enabled || hasSyntheticPath(resource.path)) continue;
        assertConcreteFile(resource.path);
        if (options.containmentRoots?.length) assertWithinRoots(resource.path, options.containmentRoots);
        extensions.push({ path: resolve(resource.path), metadata: resource.metadata });
      }
    }
    const skills: NoInstallSkillSource[] = [];
    if (skillsEnabled) {
      for (const resource of resolved.skills) {
        if (!resource.enabled || hasSyntheticPath(resource.path)) continue;
        assertExistingResource(resource.path);
        if (options.containmentRoots?.length) assertWithinRoots(resource.path, options.containmentRoots);
        skills.push({ path: resolve(resource.path), metadata: resource.metadata });
      }
    }
    return { extensions, skills };
  };

  const authorizeExplicit = (): {
    extensions: NoInstallExtensionSource[];
    skills: NoInstallSkillSource[];
  } => {
    const roots = options.containmentRoots ?? [];
    const extensions = (options.explicitExtensions ?? []).map((source) => {
      assertConcreteSource(source.path);
      const path = resolve(cwd, source.path);
      assertConcreteFile(path);
      if (roots.length > 0) assertWithinRoots(path, roots);
      return { path, metadata: source.metadata };
    });
    return { extensions, skills: [] };
  };

  const buildLoader = (
    sources: readonly NoInstallExtensionSource[],
    skills: readonly NoInstallSkillSource[],
    projectTrusted: boolean,
  ): DefaultResourceLoader =>
    new DefaultResourceLoader({
      cwd,
      agentDir,
      // A fresh projection per reload: no packages, no resource declarations, current trust.
      settingsManager: SettingsManager.inMemory({}, { projectTrusted }),
      additionalExtensionPaths: sources.map((source) => source.path),
      ...(skills.length > 0 ? { additionalSkillPaths: skills.map((skill) => skill.path) } : {}),
      noExtensions: true,
      // Suppress auto-discovery; authorized skills still load through `additionalSkillPaths`.
      noSkills: true,
      noPromptTemplates: options.noPromptTemplates ?? true,
      noThemes: options.noThemes ?? true,
      noContextFiles: options.noContextFiles ?? true,
      ...(options.extensionFactories ? { extensionFactories: options.extensionFactories } : {}),
      ...(options.systemPrompt !== undefined ? { systemPrompt: options.systemPrompt } : {}),
      ...(options.systemPromptOverride ? { systemPromptOverride: options.systemPromptOverride } : {}),
      ...(options.appendSystemPrompt ? { appendSystemPrompt: options.appendSystemPrompt } : {}),
    });

  const reload = async (perCall?: NoInstallReloadOptions): Promise<void> => {
    const reloadOptions = perCall ?? options.reloadOptions;
    // Fresh settings for the current trust before anything reads packages or trust.
    await settingsManager.reload();
    let trusted = settingsManager.isProjectTrusted();
    if (reloadOptions?.resolveProjectTrust) {
      // Bootstrap pass: trust forced off, no install, so only user/global resources are visible.
      settingsManager.setProjectTrusted(false);
      await settingsManager.reload();
      const bootstrap = await authorizeInstalled();
      const bootstrapLoader = buildLoader(bootstrap.extensions, [], false);
      await bootstrapLoader.reload();
      trusted = await reloadOptions.resolveProjectTrust({
        extensionsResult: bootstrapLoader.getExtensions(),
      });
      settingsManager.setProjectTrusted(trusted);
      await settingsManager.reload();
    }
    const sources = options.explicitExtensions ? authorizeExplicit() : await authorizeInstalled();
    const metadataByPath = new Map(sources.extensions.map((source) => [resolve(source.path), source.metadata] as const));
    const loader = buildLoader(sources.extensions, sources.skills, trusted);
    await loader.reload();
    const result = loader.getExtensions();
    restoreExtensionSourceInfo(result, metadataByPath);
    restoreSkillSourceInfo(loader, new Map(sources.skills.map((skill) => [resolve(skill.path), skill.metadata] as const)));
    activeLoader = loader;
    current = options.projectExtensions ? options.projectExtensions(result) : result;
    authorized = sources.extensions.map((source) => ({ path: source.path, enabled: true, metadata: source.metadata }));
  };

  const loaded = (): DefaultResourceLoader => {
    if (activeLoader === undefined) throw new Error("Extension resource loader has not been reloaded yet");
    return activeLoader;
  };

  const resourceLoader: ResourceLoader = {
    getExtensions: () => {
      if (current === undefined) throw new Error("Extension resource loader has not been reloaded yet");
      return current;
    },
    getSkills: () => loaded().getSkills(),
    getPrompts: () => loaded().getPrompts(),
    getThemes: () => loaded().getThemes(),
    getAgentsFiles: () => loaded().getAgentsFiles(),
    getSystemPrompt: () => loaded().getSystemPrompt(),
    getSystemPromptSource: () => loaded().getSystemPromptSource(),
    getAppendSystemPrompt: () => loaded().getAppendSystemPrompt(),
    getAppendSystemPromptSources: () => loaded().getAppendSystemPromptSources(),
    extendResources: (paths) => loaded().extendResources(paths),
    reload,
  };

  return {
    resourceLoader,
    diagnostics,
    get authorizedExtensions() {
      return authorized;
    },
  };
}
