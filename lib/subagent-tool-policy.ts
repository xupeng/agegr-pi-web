import type { AgentSession, LoadExtensionsResult, RegisteredTool } from "@earendil-works/pi-coding-agent";
import { SUBAGENT_SNAPSHOT_BUILTIN_TOOL_NAMES } from "./subagent-coding-tools";
import type { ExtensionToolTransform } from "./ask-user/extension-policy";
import { createSubagentExtensionToolFilter, SUBAGENT_CONTROL_TOOL_NAMES } from "./subagents";

/** Every built-in coding tool pi-web knows how to license for a child. */
export const SUBAGENT_BUILTIN_TOOL_NAMES = SUBAGENT_SNAPSHOT_BUILTIN_TOOL_NAMES;

/** Control and host tools a child must never receive, in either the `tools` or `excludeTools` path. */
export const SUBAGENT_RESERVED_TOOL_NAMES = [...SUBAGENT_CONTROL_TOOL_NAMES, "ask_user"] as const;

/**
 * The public `excludeTools` deny list for a child. Builtins the profile does not license are
 * removed by name, and the reserved control tools are always removed. Extension tools are
 * governed separately by the registration-aware projection, which is why the new path passes
 * no `tools` allow list.
 */
export function buildSubagentExcludeTools(builtinTools: readonly string[]): string[] {
  const allowed = new Set(builtinTools);
  return [...new Set([
    ...SUBAGENT_BUILTIN_TOOL_NAMES.filter((tool) => !allowed.has(tool)),
    ...SUBAGENT_RESERVED_TOOL_NAMES,
  ])];
}

/** Initialize coding tools only, after extension binding/ready. Extension activation belongs to
 * the SDK/extension itself, not the profile's permission list. A coding-name override is never
 * activated merely because the profile licenses the corresponding builtin.
 */
export function initializeSubagentBuiltinTools(
  session: Pick<AgentSession, "getActiveToolNames" | "getAllTools" | "setActiveToolsByName">,
  builtinTools: readonly string[],
  extensionsResult: LoadExtensionsResult,
  preferredBuiltinTools?: readonly string[],
): void {
  const licensed = new Set(builtinTools);
  const builtinNames = new Set<string>(SUBAGENT_BUILTIN_TOOL_NAMES);
  const overrides = new Set(extensionsResult.extensions.flatMap((extension) => [...extension.tools.keys()]));
  const registered = new Set(session.getAllTools()
    .filter((tool) => builtinNames.has(tool.name) && tool.sourceInfo.source === "builtin" && !overrides.has(tool.name))
    .map((tool) => tool.name));
  const active = session.getActiveToolNames();
  const initial = preferredBuiltinTools ?? builtinTools;
  const additions = initial.filter((name) => builtinNames.has(name) && licensed.has(name) && registered.has(name));
  const next = [...new Set([...active.filter((name) => !registered.has(name)), ...additions])];
  if (next.length !== active.length || next.some((name) => !active.includes(name))) session.setActiveToolsByName(next);
}

export interface ResolvedSubagentToolPolicy {
  builtinTools: string[];
  extensionAllow: string[];
  extensionDeny: string[];
}

/**
 * Derive the versioned policy for a new child from its profile. An extension-enabled profile
 * with no explicit `ext:` allow selectors defaults to `ext:*`, so a tool registered after the
 * load scan (for example a search tool at `session_start`) is still licensed; an explicit deny
 * is always kept and wins.
 */
export function resolveProfileToolPolicy(profile: {
  tools: readonly string[];
  loadExtensions: boolean;
  extensionTools?: readonly string[];
  disallowedExtensionTools?: readonly string[];
}): ResolvedSubagentToolPolicy {
  return {
    builtinTools: [...profile.tools],
    extensionAllow: profile.loadExtensions
      ? profile.extensionTools && profile.extensionTools.length > 0
        ? [...profile.extensionTools]
        : ["ext:*"]
      : [],
    extensionDeny: [...(profile.disallowedExtensionTools ?? [])],
  };
}

/**
 * Project a persisted policy into the live filter. A legacy snapshot with no policy keeps its
 * exact `tools` list as a hard SDK allow list (the caller must branch on `resources.toolPolicy`),
 * so this returns no extension grant for it; guessing selectors from old tool names would widen
 * permissions.
 */
export function resolveSnapshotToolPolicy(resources: {
  tools: readonly string[];
  loadExtensions: boolean;
  toolPolicy?: { builtinTools: readonly string[]; extensionAllow: readonly string[]; extensionDeny: readonly string[] };
}): ResolvedSubagentToolPolicy {
  if (resources.toolPolicy) {
    return {
      builtinTools: [...resources.toolPolicy.builtinTools],
      extensionAllow: [...resources.toolPolicy.extensionAllow],
      extensionDeny: [...resources.toolPolicy.extensionDeny],
    };
  }
  return { builtinTools: [...resources.tools], extensionAllow: [], extensionDeny: [] };
}

export interface SubagentExtensionToolPolicy {
  /** `ext:` allow selectors; `["ext:*"]` grants every loaded extension. */
  extensionAllow: readonly string[];
  /** `ext:` deny selectors; denied tools are removed even when the allow side is `ext:*`. */
  extensionDeny: readonly string[];
}

export interface SubagentExtensionToolProjectionOptions {
  policy: SubagentExtensionToolPolicy;
  /**
   * Applied before the allow/deny filter, for example the transform from
   * `createAskUserToolProjection(base, false)` to withdraw `ask_user` from a child.
   * Returning undefined removes the tool.
   */
  transform?: ExtensionToolTransform;
  /** Wrapper-owned manual-off names, retained conservatively across loader generations. */
  manualOffNames?: Set<string>;
}

/**
 * A Map that keeps only tool names the policy allows and re-filters every later `set`.
 * `pi.registerTool()` writes to `extension.tools`, so wrapping the Map the factory closure
 * already holds also removes tools registered after startup (for example a search tool at
 * `session_start`). A removed tool never enters the runner's registered-tool set, so
 * `codemode`/`deferred` nested execution cannot reach it either.
 */
class RegistrationFilteredToolMap extends Map<string, RegisteredTool> {
  private readonly allowed: (toolName: string) => boolean;
  private readonly transform?: (tool: RegisteredTool) => RegisteredTool | undefined;

  constructor(
    source: Map<string, RegisteredTool>,
    allowed: (toolName: string) => boolean,
    transform?: (tool: RegisteredTool) => RegisteredTool | undefined,
  ) {
    super();
    this.allowed = allowed;
    this.transform = transform;
    for (const [name, tool] of source) {
      const kept = this.applyTransform(tool);
      if (kept !== undefined && allowed(name)) super.set(name, kept);
    }
  }

  private applyTransform(tool: RegisteredTool): RegisteredTool | undefined {
    return this.transform === undefined ? tool : this.transform(tool);
  }

  set(name: string, tool: RegisteredTool): this {
    const kept = this.applyTransform(tool);
    if (kept === undefined || !this.allowed(name)) {
      super.delete(name);
      return this;
    }
    super.set(name, kept);
    return this;
  }
}

/**
 * Keep the same Extension objects a factory closure already references and wrap each `tools`
 * Map with the policy filter. Copying the Extension or its Map would break both directions:
 * the runner would read a stale Map and a late `registerTool` would write to the original,
 * unfiltered one.
 */
const manualOffByResult = new WeakMap<object, Set<string>>();

/** Withdraw currently inactive default-active tools before reload; never merely hide declarations. */
export function preserveSubagentManualOffTools(base: LoadExtensionsResult | undefined, activeNames: readonly string[]): void {
  if (!base) return;
  const names = manualOffByResult.get(base);
  if (!names) return;
  const active = new Set(activeNames);
  for (const extension of base.extensions) {
    for (const [name, tool] of extension.tools) {
      if (!active.has(name) && tool.definition.defaultActive !== false && tool.definition.exposure !== "hidden") names.add(name);
    }
  }
  for (const extension of base.extensions) for (const name of names) extension.tools.delete(name);
}

export function projectRegistrationAwareExtensionTools(
  base: LoadExtensionsResult,
  options: SubagentExtensionToolProjectionOptions,
): LoadExtensionsResult {
  const filter = createSubagentExtensionToolFilter(
    base.extensions,
    options.policy.extensionAllow,
    options.policy.extensionDeny,
  );
  const transform = options.transform;
  const manualOffNames = options.manualOffNames ?? new Set<string>();
  manualOffByResult.set(base, manualOffNames);
  for (const extension of base.extensions) {
    extension.tools = new RegistrationFilteredToolMap(
      extension.tools,
      (toolName) => !manualOffNames.has(toolName) && filter(extension, toolName),
      transform === undefined ? undefined : (tool) => transform(extension, tool),
    );
  }
  return base;
}
