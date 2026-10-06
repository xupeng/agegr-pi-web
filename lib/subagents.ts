import { SUBAGENT_CANONICAL_BUILTIN_TOOL_NAMES, SUBAGENT_SNAPSHOT_BUILTIN_TOOL_NAMES, canonicalSubagentProfileTools } from "./subagent-coding-tools";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { dump as stringifyYaml } from "js-yaml";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { parseFrontmatter } from "./frontmatter";
import { parseNpmSource } from "./npm-source";
import { writePrivateFileAtomicSync } from "./atomic-file";
import { isExistingPathWithinRoots } from "./path-security";
import { disabledBuiltInSubagents } from "./subagent-settings";
import { PRESET_READ_ONLY } from "./tool-presets";
import type { WrittenFile } from "./written-file-sources";
import type { SessionEntry, SubagentSessionStatus } from "./types";

export const SUBAGENT_META_TYPE = "pi-web:subagent";
export const SUBAGENT_STATUS_TYPE = "pi-web:subagent-status";
export const SUBAGENT_RESULT_TYPE = "pi-web:subagent-result";
export const SUBAGENT_CONTROL_TOOL_NAMES = ["Agent", "get_subagent_result", "steer_subagent"] as const;

export type SubagentStatus = SubagentSessionStatus;
export type SubagentScope = "builtin" | "global" | "workspace" | "project";
export type SubagentWritableScope = Extract<SubagentScope, "global" | "project">;

export interface SubagentProfile {
  name: string;
  displayName: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  extensionTools?: string[];
  /** Raw `ext:` deny selectors, resolved against the loaded extensions at spawn time. */
  disallowedExtensionTools?: string[];
  loadSkills: boolean;
  loadExtensions: boolean;
  model?: string;
  thinking?: ThinkingLevel;
  maxTurns?: number;
  inheritContext: boolean;
  runInBackground: boolean;
  promptMode: "replace" | "append";
  color?: string;
  isolation?: "worktree" | "off";
  persistSession?: boolean;
  enabled: boolean;
  scope: SubagentScope;
  filePath?: string;
}

export interface SubagentMetadata {
  version: 1;
  parentSessionId: string;
  parentSessionPath: string;
  parentToolCallId: string;
  profile: string;
  description: string;
  task: string;
  runInBackground: boolean;
  createdAt: string;
  resourceSnapshot: SubagentResourceSnapshot;
  worktreePath?: string;
  worktreeBranch?: string;
}

/**
 * Versioned built-in tool licence plus the original `ext:` allow/deny selectors. This is
 * separate from `tools` because a flat name list cannot express a licence for a tool an
 * extension only registers later (for example a search tool at `session_start`).
 */
export interface SubagentResourceToolPolicy {
  version: 1;
  /** Built-in (and shell-mapped) tools a child may run; control tools are always excluded. */
  builtinTools: string[];
  /** `ext:` allow selectors; `["ext:*"]` grants every loaded extension. */
  extensionAllow: string[];
  /** `ext:` deny selectors; denied tools are removed even from an `ext:*` grant. */
  extensionDeny: string[];
}

/**
 * A no-credentials reference to a concrete provider entry file. It is only a lead for the
 * explicit `noExtensions` exception; execution re-validates enablement, trust, real path and
 * package containment before the file is loaded. Never stores config, functions, keys, or URLs.
 */
export interface SubagentProviderSourceRef {
  providerId: string;
  kind: "native" | "legacy";
  /** Absolute concrete provider entry file. */
  file: string;
  scope: "global" | "project";
  origin: "top-level" | "package";
  /** Package or local source identity used for re-resolution and containment. */
  source: string;
  /** Forward slash separated declared cwd (no secrets). */
  cwd: string;
}

/**
 * A versioned envelope for the no-credentials provider source leads. The envelope carries its own
 * `version` so a reader never treats it as versioned merely because the surrounding resource
 * snapshot is version 1; an unknown envelope version is rejected, not guessed.
 */
export interface SubagentProviderSourcesSnapshot {
  version: 1;
  refs: SubagentProviderSourceRef[];
}

export interface SubagentResourceSnapshot {
  version: 1;
  appendSystemPrompt: string[];
  /** Legacy conservative projection: the exact hard tool list older readers understand. */
  tools: string[];
  loadSkills: boolean;
  loadExtensions: boolean;
  exactSystemPrompt?: string;
  /** Present on new children; absent on legacy v1 snapshots, which keep `tools` verbatim. */
  toolPolicy?: SubagentResourceToolPolicy;
  /** Present only for the explicit `noExtensions` provider-only exception. */
  providerSources?: SubagentProviderSourcesSnapshot;
}

export interface SubagentSessionResources {
  appendSystemPrompt: string[];
  tools: string[];
  loadSkills: boolean;
  loadExtensions: boolean;
  exactSystemPrompt?: string;
  toolPolicy?: SubagentResourceToolPolicy;
  providerSources?: SubagentProviderSourcesSnapshot;
}

export interface SubagentResultMetadata {
  version: 1;
  status: Exclude<SubagentStatus, "starting" | "running" | "queued" | "interrupted">;
  completedAt: string;
  result?: string;
  error?: string;
  worktreeCleanupError?: string;
}

export interface SubagentStatusMetadata {
  version: 1;
  status: Extract<SubagentStatus, "queued" | "running">;
}

export interface SubagentRunInfo {
  sessionId: string;
  sessionPath: string;
  parentSessionId: string;
  parentToolCallId: string;
  profile: string;
  description: string;
  task: string;
  runInBackground: boolean;
  status: SubagentStatus;
  createdAt: string;
  completedAt?: string;
  result?: string;
  error?: string;
  worktreePath?: string;
  worktreeBranch?: string;
  worktreeCleanupError?: string;
  /** Files the child session wrote, snapshotted when the run finished. */
  writtenFiles?: WrittenFile[];
  /** Set on a run started by `resume`, which reuses the session ID of an earlier run. Not persisted. */
  resumed?: boolean;
}

const DEFAULT_TOOLS: string[] = [...SUBAGENT_CANONICAL_BUILTIN_TOOL_NAMES];
// Profiles remain canonical (bash); execution snapshots also license the shell-mapped name.
const SNAPSHOT_BUILTIN_TOOLS = new Set<string>(SUBAGENT_SNAPSHOT_BUILTIN_TOOL_NAMES);
const SUBAGENT_CONTROL_TOOLS = new Set<string>(SUBAGENT_CONTROL_TOOL_NAMES);
const THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

/**
 * Frontmatter keys the web UI owns. Everything else in a profile file belongs to
 * whichever runtime reads it (pi-subagents and friends), so a save from this app must
 * carry those keys through untouched. Dropping them silently changed behaviour:
 * `allowed_subagents` was lost and an orchestrator could no longer spawn anything,
 * `exclude_extensions` was lost and an opt-out became an opt-in.
 */
const MANAGED_FRONTMATTER_KEYS = new Set([
  "description",
  "display_name",
  "tools",
  "load_skills",
  "load_extensions",
  "enabled",
  "inherit_context",
  "run_in_background",
  "model",
  "thinking",
  "max_turns",
  "prompt_mode",
  "color",
  "isolation",
  "persist_session",
]);

const FRONTMATTER_OPEN_RE = /^(?:\uFEFF)?---[ \t]*(?:\r\n|\n|\r)/;

/**
 * The UI exposes two booleans (`load_skills` / `load_extensions`); pi-subagents reads
 * the aliases `skills` / `extensions`, which also accept a whitelist. Aliases are
 * carried through by `unmanagedFrontmatter` and only rewritten once we own them.
 */
const OWNED_ALIAS_VALUES = new Set(["none", "all", "true", "false"]);

const BUILTIN_PROFILES: SubagentProfile[] = [
  {
    name: "general-purpose",
    displayName: "General purpose",
    description: "Handle a focused implementation or investigation task",
    systemPrompt: "Work autonomously on the delegated task. Keep the final answer concise and include important files, decisions, and remaining risks.",
    tools: DEFAULT_TOOLS,
    loadSkills: false,
    loadExtensions: true,
    promptMode: "append",
    inheritContext: false,
    runInBackground: false,
    enabled: true,
    scope: "builtin",
  },
  {
    name: "explore",
    displayName: "Explore",
    description: "Quickly inspect a codebase without modifying it",
    systemPrompt: "Explore the codebase to answer the delegated question. Do not modify files. Report concrete findings with file paths and relevant symbols.",
    tools: [...PRESET_READ_ONLY],
    loadSkills: false,
    loadExtensions: true,
    promptMode: "append",
    inheritContext: false,
    runInBackground: false,
    enabled: true,
    scope: "builtin",
  },
  {
    name: "plan",
    displayName: "Plan",
    description: "Design an implementation plan without modifying files",
    systemPrompt: "Produce an implementation-ready plan for the delegated task. Inspect the repository as needed, do not modify files, and call out dependencies, risks, and verification steps.",
    tools: [...PRESET_READ_ONLY],
    loadSkills: false,
    loadExtensions: true,
    promptMode: "append",
    inheritContext: false,
    runInBackground: false,
    enabled: true,
    scope: "builtin",
  },
];

function assertBooleanFlag(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Interpret one resource flag value. `null` means the field is absent. A present value that is
 * neither boolean nor a recognized `none`/`false`/`all`/`true` spelling returns `{ known: false }`
 * so the caller can fail closed instead of treating an arbitrary string as "enable everything".
 * The alias (`extensions`) also accepts a pi-subagents whitelist — an array or a bare package
 * name — which means "this source is enabled"; the boolean UI switch has no scoping to express,
 * so the authored text is preserved by `syncFlagAlias`/`unmanagedFrontmatter` but the flag is on.
 */
function parseResourceFlagValue(
  value: unknown,
  allowWhitelist: boolean,
): { known: true; value: boolean } | { known: false } | null {
  if (value === undefined) return null;
  if (typeof value === "boolean") return { known: true, value };
  if (Array.isArray(value)) return allowWhitelist ? { known: true, value: true } : { known: false };
  if (typeof value === "string") {
    const token = value.trim().toLowerCase();
    if (token === "none" || token === "false") return { known: true, value: false };
    if (token === "all" || token === "true") return { known: true, value: true };
    return allowWhitelist ? { known: true, value: true } : { known: false };
  }
  return { known: false };
}

/**
 * Resolve a resource toggle from its canonical field first, then its alias. `undefined` uses
 * `fallback`; an unrecognized but present value is denied rather than allowed.
 */
function resourceFlag(canonical: unknown, alias: unknown, fallback: boolean): boolean {
  if (canonical !== undefined) {
    const parsed = parseResourceFlagValue(canonical, false);
    if (parsed === null) return fallback;
    return parsed.known ? parsed.value : false;
  }
  const parsed = parseResourceFlagValue(alias, true);
  if (parsed === null) return fallback;
  return parsed.known ? parsed.value : false;
}

function stringList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return values.map((item) => String(item).trim()).filter(Boolean);
}

function parseTools(value: unknown, fallback: string[]): string[] {
  const tools = stringList(value);
  if (tools.includes("none")) return [];
  if (tools.includes("all") || tools.includes("*")) return [...DEFAULT_TOOLS];
  if (tools.length === 0) return [...fallback];
  return canonicalSubagentProfileTools(tools);
}

function rawToolValues(value: unknown): string[] {
  return stringList(value);
}

function parseExtensionToolSelectors(value: unknown): string[] {
  return [...new Set(rawToolValues(value).filter((tool) => tool.toLowerCase().startsWith("ext:")))];
}

/** Read existing frontmatter without allowing malformed metadata to be overwritten. */
function readStoredFrontmatter(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  const source = readFileSync(filePath, "utf8");
  const { data } = parseFrontmatter(source);
  if (data) return data;
  if (FRONTMATTER_OPEN_RE.test(source)) {
    throw new Error("Cannot save agent profile: existing frontmatter is invalid");
  }
  return {};
}

/** Keys another runtime owns, in file order, so a save round-trips them. */
function unmanagedFrontmatter(stored: Record<string, unknown>): Record<string, unknown> {
  const preserved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (!MANAGED_FRONTMATTER_KEYS.has(key)) preserved[key] = value;
  }
  return preserved;
}

/**
 * pi-web filters `tools` down to the built-ins it can dispatch, which would drop
 * another runtime's `ext:<name>` selectors on every save — carry them through.
 */
function composeToolsField(tools: string[], storedTools: unknown): string {
  const selectors = stringList(storedTools).filter((tool) => tool.toLowerCase().startsWith("ext:"));
  const combined = [...tools, ...selectors.filter((selector) => !tools.some((tool) => tool.toLowerCase() === selector.toLowerCase()))];
  return combined.length > 0 ? combined.join(", ") : "none";
}

/**
 * Keep the alias in step with the boolean the UI owns. A boolean (or a "none" /
 * "all" spelling) is ours to rewrite; a whitelist such as `extensions:
 * pi-advisor-flow` expresses scoping the UI cannot show, so it stays as authored.
 */
function syncFlagAlias(
  frontmatter: Record<string, unknown>,
  alias: string,
  storedValue: unknown,
  flag: boolean,
): void {
  const owned = storedValue === undefined
    || typeof storedValue === "boolean"
    || (typeof storedValue === "string" && OWNED_ALIAS_VALUES.has(storedValue.trim().toLowerCase()));
  if (owned) frontmatter[alias] = flag;
}
function parseProfileFile(filePath: string, scope: SubagentScope): SubagentProfile | null {
  try {
    const source = readFileSync(filePath, "utf8");
    const { data, rest } = parseFrontmatter(source);
    const name = stringValue(data?.name) ?? basename(filePath, ".md");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return null;
    const thinkingValue = stringValue(data?.thinking) as ThinkingLevel | undefined;
    const maxTurnsValue = typeof data?.max_turns === "number" ? Math.floor(data.max_turns) : undefined;
    const tools = parseTools(data?.tools, DEFAULT_TOOLS);
    const disallowedTools = new Set(parseTools(data?.disallowed_tools, []));
    // The deny list is also handed to the runtime, which resolves both sides against the
    // loaded extensions. This parse-time filter is only the cheap literal fast path: it
    // cannot see extension aliases (`ext:codegraph` vs `ext:@scope/pi-codegraph`), so it
    // must never be the only gate.
    const disallowedExtensionTools = parseExtensionToolSelectors(data?.disallowed_tools);
    const deniedKeys = new Set(
      disallowedExtensionTools.map((tool) => normalizeExtensionSelector(tool).toLowerCase()),
    );
    const extensionTools = parseExtensionToolSelectors(data?.tools)
      .filter((tool) => {
        const allowed = normalizeExtensionSelector(tool).toLowerCase();
        return ![...deniedKeys].some((denied) => (
          denied === "*" || allowed === denied || allowed.startsWith(`${denied}/`)
        ));
      });
    return {
      name,
      displayName: stringValue(data?.display_name) ?? name,
      description: stringValue(data?.description) ?? name,
      systemPrompt: rest.trim(),
      tools: tools.filter((tool) => !disallowedTools.has(tool)),
      ...(extensionTools.length > 0 ? { extensionTools } : {}),
      ...(disallowedExtensionTools.length > 0 ? { disallowedExtensionTools } : {}),
      loadSkills: resourceFlag(data?.load_skills, data?.skills, false),
      loadExtensions: resourceFlag(data?.load_extensions, data?.extensions, true),
      ...(stringValue(data?.model) ? { model: stringValue(data?.model) } : {}),
      ...(thinkingValue && THINKING_LEVELS.has(thinkingValue) ? { thinking: thinkingValue } : {}),
      ...(maxTurnsValue && maxTurnsValue > 0 ? { maxTurns: maxTurnsValue } : {}),
      inheritContext: booleanValue(data?.inherit_context, false),
      runInBackground: booleanValue(data?.run_in_background, false),
      promptMode: data?.prompt_mode === "replace" ? "replace" : "append",
      ...(stringValue(data?.color) ? { color: stringValue(data?.color) } : {}),
      ...(data?.isolation === "worktree" || data?.isolation === "off" ? { isolation: data.isolation } : {}),
      ...(typeof data?.persist_session === "boolean" ? { persistSession: data.persist_session } : {}),
      enabled: booleanValue(data?.enabled, true),
      scope,
      filePath,
    };
  } catch {
    return null;
  }
}

function isProjectProfilePathAllowed(cwd: string, target: string): boolean {
  return isExistingPathWithinRoots(target, new Set([cwd]));
}

function readProfileDirectory(dir: string, scope: SubagentScope, cwd: string): SubagentProfile[] {
  if (!existsSync(dir)) return [];
  if (scope !== "global" && !isProjectProfilePathAllowed(cwd, dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => parseProfileFile(join(dir, entry.name), scope))
    .filter((profile): profile is SubagentProfile => profile !== null);
}

function profileDirectories(cwd: string): Array<[string, Exclude<SubagentScope, "builtin">]> {
  return [
    [join(getAgentDir(), "agents"), "global"],
    [join(resolve(cwd), ".agents", "agents"), "workspace"],
    [join(resolve(cwd), ".pi", "agents"), "project"],
  ];
}

/**
 * A built-in has no file, so `enabled: false` cannot be written next to it the way
 * it is for a profile on disk. Its off state is a name in `agents/settings.json`
 * instead of a copied-out override file, which would otherwise freeze the built-in
 * prompt at the version it was copied from.
 */
function builtInProfiles(): SubagentProfile[] {
  const disabled = disabledBuiltInSubagents();
  return BUILTIN_PROFILES.map((profile) => ({
    ...profile,
    tools: [...profile.tools],
    enabled: !disabled.has(profile.name.toLowerCase()),
  }));
}

/** Every configured source, including profiles shadowed by a higher-precedence scope. */
export function listSubagentProfileSources(cwd: string): SubagentProfile[] {
  const profiles = builtInProfiles();
  for (const [dir, scope] of profileDirectories(cwd)) {
    profiles.push(...readProfileDirectory(dir, scope, cwd));
  }
  return profiles.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function listSubagentProfiles(cwd: string): SubagentProfile[] {
  // A same-name file replaces the built-in outright, its own `enabled` included.
  const byName = new Map(builtInProfiles().map((profile) => [profile.name.toLowerCase(), profile]));
  for (const [dir, scope] of profileDirectories(cwd)) {
    for (const profile of readProfileDirectory(dir, scope, cwd)) byName.set(profile.name.toLowerCase(), profile);
  }
  return [...byName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function resolveSubagentProfile(cwd: string, name: string): SubagentProfile | undefined {
  return listSubagentProfiles(cwd).find((profile) => profile.name.toLowerCase() === name.trim().toLowerCase() && profile.enabled);
}

function assertProfileName(name: string): string {
  const normalized = name.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error("Agent name may contain only letters, numbers, dots, underscores, and hyphens");
  }
  return normalized;
}

function writableProfileDirectory(cwd: string, scope: SubagentWritableScope): string {
  if (scope === "global") return join(getAgentDir(), "agents");
  if (scope === "project") return join(resolve(cwd), ".pi", "agents");
  throw new Error("Agent scope must be global or project");
}

function assertWritableProfileDirectory(cwd: string, scope: SubagentWritableScope): string {
  const dir = writableProfileDirectory(cwd, scope);
  if (scope === "global") return dir;

  let existingAncestor = dir;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) throw new Error("Agent profile directory is outside the project root");
    existingAncestor = parent;
  }
  if (!isProjectProfilePathAllowed(cwd, existingAncestor)) {
    throw new Error("Agent profile directory is outside the project root");
  }
  return dir;
}

export type SubagentProfileSaveInput = Omit<SubagentProfile, "scope" | "filePath" | "loadSkills" | "loadExtensions"> & {
  loadSkills?: boolean;
  loadExtensions?: boolean;
};

export function saveSubagentProfile(
  cwd: string,
  scope: SubagentWritableScope,
  profile: SubagentProfileSaveInput,
): SubagentProfile {
  const name = assertProfileName(profile.name);
  const tools = canonicalSubagentProfileTools(profile.tools);
  const extensionTools = [...new Set(profile.extensionTools ?? [])];
  if (profile.thinking && !THINKING_LEVELS.has(profile.thinking)) {
    throw new Error(`Invalid thinking level: ${profile.thinking}`);
  }
  if (profile.maxTurns !== undefined && (!Number.isFinite(profile.maxTurns) || profile.maxTurns < 0)) {
    throw new Error("Max turns must be a non-negative number");
  }
  const maxTurns = profile.maxTurns && profile.maxTurns > 0
    ? Math.floor(profile.maxTurns)
    : undefined;
  const displayName = profile.displayName.trim() || name;
  const description = profile.description.trim() || name;
  const systemPrompt = profile.systemPrompt.trim();
  const model = profile.model?.trim() || undefined;
  const promptMode = profile.promptMode === "replace" ? "replace" : "append";
  const dir = assertWritableProfileDirectory(cwd, scope);
  mkdirSync(dir, { recursive: true });
  if (scope === "project" && !isProjectProfilePathAllowed(cwd, dir)) {
    throw new Error("Agent profile directory is outside the project root");
  }
  const filePath = join(dir, `${name}.md`);
  const stored = readStoredFrontmatter(filePath);
  // An omitted field means "leave the authored flag alone"; an explicit non-boolean from the
  // client is rejected instead of being coerced, and a stored explicit false is never overwritten.
  const loadSkillsInput: boolean | undefined = profile.loadSkills;
  const loadExtensionsInput: boolean | undefined = profile.loadExtensions;
  const loadSkills = loadSkillsInput === undefined
    ? resourceFlag(stored.load_skills, stored.skills, false)
    : assertBooleanFlag(loadSkillsInput, "loadSkills");
  const loadExtensions = loadExtensionsInput === undefined
    ? resourceFlag(stored.load_extensions, stored.extensions, true)
    : assertBooleanFlag(loadExtensionsInput, "loadExtensions");
  const managed: Record<string, unknown> = {
    description,
    display_name: displayName,
    tools: composeToolsField([...tools, ...extensionTools], stored.tools),
    load_skills: loadSkills,
    load_extensions: loadExtensions,
    enabled: profile.enabled,
    inherit_context: profile.inheritContext,
    run_in_background: profile.runInBackground,
    prompt_mode: promptMode,
  };
  if (loadSkillsInput !== undefined || stored.skills === undefined) syncFlagAlias(managed, "skills", stored.skills, loadSkills);
  if (loadExtensionsInput !== undefined || stored.extensions === undefined) syncFlagAlias(managed, "extensions", stored.extensions, loadExtensions);
  if (model) managed.model = model;
  if (profile.thinking) managed.thinking = profile.thinking;
  if (maxTurns) managed.max_turns = maxTurns;
  if (profile.color?.trim()) managed.color = profile.color.trim();
  if (profile.isolation) managed.isolation = profile.isolation;
  if (profile.persistSession !== undefined) managed.persist_session = profile.persistSession;
  // Managed keys win; keys this app does not own follow in their original order.
  const frontmatter: Record<string, unknown> = { ...managed };
  for (const [key, value] of Object.entries(unmanagedFrontmatter(stored))) {
    if (!(key in frontmatter)) frontmatter[key] = value;
  }
  const yaml = stringifyYaml(frontmatter, { noRefs: true, lineWidth: 1000 }).trimEnd();
  writePrivateFileAtomicSync(filePath, `---\n${yaml}\n---\n\n${systemPrompt}\n`);
  return {
    ...profile,
    name,
    displayName,
    description,
    systemPrompt,
    tools,
    ...(extensionTools.length > 0 ? { extensionTools } : {}),
    loadSkills,
    loadExtensions,
    ...(model ? { model } : { model: undefined }),
    ...(maxTurns ? { maxTurns } : { maxTurns: undefined }),
    promptMode,
    ...(profile.color ? { color: profile.color } : {}),
    ...(profile.isolation ? { isolation: profile.isolation } : {}),
    ...(profile.persistSession !== undefined ? { persistSession: profile.persistSession } : {}),
    scope,
    filePath,
  };
}

export function deleteSubagentProfile(cwd: string, scope: SubagentWritableScope, name: string): void {
  const safeName = assertProfileName(name);
  const filePath = join(assertWritableProfileDirectory(cwd, scope), `${safeName}.md`);
  if (existsSync(filePath)) unlinkSync(filePath);
}

export function saveProjectSubagentProfile(cwd: string, profile: SubagentProfileSaveInput): SubagentProfile {
  return saveSubagentProfile(cwd, "project", profile);
}

export function deleteProjectSubagentProfile(cwd: string, name: string): void {
  deleteSubagentProfile(cwd, "project", name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ValidSubagentMetadataData = Record<string, unknown> & {
  version: 1;
  parentSessionId: string;
  parentSessionPath: string;
};

function subagentMetadataData(entries: readonly SessionEntry[]): ValidSubagentMetadataData | null {
  const metaEntry = entries.find((entry) => entry.type === "custom" && entry.customType === SUBAGENT_META_TYPE);
  if (!metaEntry || metaEntry.type !== "custom" || !isRecord(metaEntry.data)) return null;
  const data = metaEntry.data;
  if (data.version !== 1 || typeof data.parentSessionId !== "string" || typeof data.parentSessionPath !== "string") return null;
  return data as ValidSubagentMetadataData;
}

/** Restore the isolated prompt and tool scope used by a persisted subagent session. */
export function readSubagentSessionResources(
  entries: readonly SessionEntry[],
): SubagentSessionResources | null {
  const decoded = decodeSubagentSessionResources(entries);
  return decoded.kind === "valid" ? decoded.resources : null;
}

/**
 * Result of decoding a persisted child's resource snapshot. `none` means the file is not a
 * subagent (or carries no web subagent metadata); `invalid` means the child marker exists but
 * its snapshot is malformed or an unknown version. The RPC must refuse to execute an `invalid`
 * child instead of decoding it to `null` and letting a normal, fully-resourced session start.
 */
export type SubagentResourceDecode =
  | { kind: "none" }
  | { kind: "invalid"; reason: string }
  | { kind: "valid"; resources: SubagentSessionResources };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isExtSelector(value: unknown): value is string {
  return typeof value === "string" && value.toLowerCase().startsWith("ext:");
}

function decodeToolPolicy(value: unknown): SubagentResourceToolPolicy | "invalid" | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.version !== 1) return "invalid";
  const { builtinTools, extensionAllow, extensionDeny } = value;
  if (!Array.isArray(builtinTools) || !builtinTools.every((tool) => typeof tool === "string" && SNAPSHOT_BUILTIN_TOOLS.has(tool))) {
    return "invalid";
  }
  if (!Array.isArray(extensionAllow) || !extensionAllow.every(isExtSelector)) return "invalid";
  if (!Array.isArray(extensionDeny) || !extensionDeny.every(isExtSelector)) return "invalid";
  return {
    version: 1,
    builtinTools: [...new Set(builtinTools)],
    extensionAllow: [...new Set(extensionAllow)],
    extensionDeny: [...new Set(extensionDeny)],
  };
}

function decodeProviderSources(value: unknown): SubagentProviderSourcesSnapshot | "invalid" | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.version !== 1) return "invalid";
  const refsValue = value.refs;
  if (!Array.isArray(refsValue) || refsValue.length > 8) return "invalid";
  try { if (Buffer.byteLength(JSON.stringify(value), "utf8") > 32768) return "invalid"; }
  catch { return "invalid"; }
  const refs: SubagentProviderSourceRef[] = [];
  for (const entry of refsValue) {
    if (!isRecord(entry)) return "invalid";
    const { providerId, kind, file, scope, origin, source, cwd } = entry;
    if (!isNonEmptyString(providerId)) return "invalid";
    if (kind !== "native" && kind !== "legacy") return "invalid";
    if (!isNonEmptyString(file) || !file.startsWith("/")) return "invalid";
    if (scope !== "global" && scope !== "project") return "invalid";
    if (origin !== "top-level" && origin !== "package") return "invalid";
    if (!isNonEmptyString(source) || source.length > 4096 || /[\r\n\0]|:\/\//.test(source)) return "invalid";
    if (!isNonEmptyString(cwd)) return "invalid";
    refs.push({ providerId, kind, file, scope, origin, source, cwd });
  }
  return { version: 1, refs };
}

export function decodeSubagentSessionResources(
  entries: readonly SessionEntry[],
): SubagentResourceDecode {
  const metaEntry = entries.find((entry) => entry.type === "custom" && entry.customType === SUBAGENT_META_TYPE);
  if (!metaEntry) return { kind: "none" };
  if (metaEntry.type !== "custom" || !isRecord(metaEntry.data)) {
    return { kind: "invalid", reason: "subagent metadata is not an object" };
  }
  const data = metaEntry.data;
  if (data.version !== 1) return { kind: "invalid", reason: "unsupported subagent metadata version" };
  if (typeof data.parentSessionId !== "string" || typeof data.parentSessionPath !== "string") {
    return { kind: "invalid", reason: "subagent metadata is missing parent identity" };
  }
  const snapshot = data.resourceSnapshot;
  if (!isRecord(snapshot) || snapshot.version !== 1) {
    return { kind: "invalid", reason: "subagent resource snapshot is missing or an unsupported version" };
  }
  if (
    !Array.isArray(snapshot.appendSystemPrompt)
    || !snapshot.appendSystemPrompt.every((item) => typeof item === "string")
  ) {
    return { kind: "invalid", reason: "subagent appendSystemPrompt is malformed" };
  }
  const loadSkills = snapshot.loadSkills === undefined ? false : snapshot.loadSkills;
  const loadExtensions = snapshot.loadExtensions === undefined ? false : snapshot.loadExtensions;
  if (typeof loadSkills !== "boolean" || typeof loadExtensions !== "boolean") {
    return { kind: "invalid", reason: "subagent resource flags are not boolean" };
  }
  if (!Array.isArray(snapshot.tools)) {
    return { kind: "invalid", reason: "subagent tool snapshot is not an array" };
  }
  const tools = [...new Set(snapshot.tools)];
  if (!tools.every((tool) =>
    isNonEmptyString(tool)
    && !SUBAGENT_CONTROL_TOOLS.has(tool)
    && (SNAPSHOT_BUILTIN_TOOLS.has(tool) || loadExtensions)
  )) {
    return { kind: "invalid", reason: "subagent tool snapshot contains a disallowed tool" };
  }
  if (snapshot.exactSystemPrompt !== undefined && typeof snapshot.exactSystemPrompt !== "string") {
    return { kind: "invalid", reason: "subagent exactSystemPrompt is malformed" };
  }
  const toolPolicy = decodeToolPolicy(snapshot.toolPolicy);
  if (toolPolicy === "invalid") return { kind: "invalid", reason: "subagent toolPolicy is malformed or an unsupported version" };
  const sourceEntry = [...entries].reverse().find((entry) => entry.type === "custom" && entry.customType === "pi-web:subagent-provider-sources");
  const providerSources = decodeProviderSources(sourceEntry?.type === "custom" ? sourceEntry.data : snapshot.providerSources);
  if (providerSources === "invalid") return { kind: "invalid", reason: "subagent providerSources are malformed" };
  return {
    kind: "valid",
    resources: {
      appendSystemPrompt: [...snapshot.appendSystemPrompt],
      tools,
      loadSkills,
      loadExtensions,
      ...(typeof snapshot.exactSystemPrompt === "string" ? { exactSystemPrompt: snapshot.exactSystemPrompt } : {}),
      ...(toolPolicy !== undefined ? { toolPolicy } : {}),
      ...(providerSources !== undefined ? { providerSources } : {}),
    },
  };
}

/** True when the entries carry a web subagent marker, even if its snapshot is unreadable. */
export function hasSubagentMetadata(entries: readonly SessionEntry[]): boolean {
  return entries.some((entry) => entry.type === "custom" && entry.customType === SUBAGENT_META_TYPE);
}

export function withSubagentExtensionTools(
  profileTools: readonly string[],
  extensionToolNames: Iterable<string>,
): string[] {
  return [...new Set([
    ...profileTools,
    ...[...extensionToolNames].filter((name) => !SUBAGENT_CONTROL_TOOLS.has(name)),
  ])];
}

export interface SubagentExtensionLike {
  path: string;
  sourceInfo?: { source?: string; origin?: string };
  tools: Map<string, unknown>;
}

/**
 * Normalize one `ext:` selector to its body: a trailing slash and a trailing star-segment
 * are dropped, so `ext:name`, `ext:name/` and `ext:name/*` are one selector. Shared by the
 * allow list and the deny list so the two cannot disagree on what a selector means.
 */
function normalizeExtensionSelector(selector: string): string {
  const body = selector.slice(4).trim().replace(/\/+$/, "");
  return body.endsWith("/*") ? body.slice(0, -2) : body;
}

function extensionPathParts(extension: SubagentExtensionLike): { parentDir: string; baseName: string } {
  const segments = extension.path.replaceAll("\\", "/").split("/");
  return {
    parentDir: segments.at(-2) ?? extension.path,
    baseName: (segments.at(-1) ?? "").replace(/\.[^.]+$/, ""),
  };
}

/**
 * The source a file belongs to. Only package resources have a real identity in
 * `sourceInfo.source`; top-level ones all carry the shared constant `"local"` (settings
 * entry) or `"auto"` (auto-discovered), so they fall back to their own path — otherwise
 * every unrelated local extension would look like one unit to the name gate below.
 */
function extensionSourceKey(extension: SubagentExtensionLike): string {
  const info = extension.sourceInfo;
  const source = info?.source?.trim();
  return source && info?.origin === "package" ? source : extension.path;
}

/**
 * Every spelling an `ext:<name>` selector could use for one extension: the file's parent
 * directory, its basename, and — for package resources only — the npm source name and that
 * name without its scope (a pinned `npm:@scope/pkg@1.2.3` contributes `@scope/pkg`, not the
 * pin). `"local"` / `"auto"` are deliberately never candidates: they are shared constants,
 * so accepting them would turn `ext:local` into "every local extension".
 */
function extensionCandidateNames(extension: SubagentExtensionLike): string[] {
  const { parentDir, baseName } = extensionPathParts(extension);
  const names = [parentDir, baseName];
  const info = extension.sourceInfo;
  if (info?.origin === "package") {
    const source = (info.source ?? "").trim();
    const packageName = parseNpmSource(source)?.name ?? source;
    names.push(packageName, packageName.replace(/^@[^/]+\//, ""));
  }
  return [...new Set(names.map((name) => name.toLowerCase()).filter(Boolean))];
}

/**
 * Map each candidate name to the set of sources that can offer it. A name claimed by more
 * than one source is not addressable: `index.ts`, a shared `extensions/` directory and two
 * packages collapsing to the same unscoped name (`@a/tool`, `@b/tool`) are all common, and
 * a selector for one of them would otherwise grant tools from unrelated extensions. Several
 * files of the `same` source may share a name — they are one unit, not a collision.
 */
function extensionNameOwners(extensions: readonly SubagentExtensionLike[]): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const extension of extensions) {
    const owner = extensionSourceKey(extension);
    for (const name of extensionCandidateNames(extension)) {
      const claimed = owners.get(name) ?? new Set<string>();
      claimed.add(owner);
      owners.set(name, claimed);
    }
  }
  return owners;
}

interface ExtensionSelectorMatch {
  name: string;
  toolName?: string;
}

/**
 * Resolve one selector to the longest candidate name it matches, or undefined when it matches
 * none. Extension names are case-insensitive; tool names are matched exactly as authored.
 * Resolving names per extension instead would let `ext:@scope/pkg` bind to the shorter,
 * unrelated name `@scope` offered by a different extension.
 */
function resolveSelectorName(selector: string, names: Iterable<string>): string | undefined {
  const lower = selector.toLowerCase();
  let best: string | undefined;
  for (const name of names) {
    if (lower !== name && !lower.startsWith(`${name}/`)) continue;
    if (best === undefined || name.length > best.length) best = name;
  }
  return best;
}

function matchFromName(selector: string, name: string): ExtensionSelectorMatch {
  const toolName = selector.toLowerCase() === name ? undefined : selector.slice(name.length + 1) || undefined;
  return { name, ...(toolName === undefined ? {} : { toolName }) };
}

function resolveExtensionSelector(
  selector: string,
  addressableNames: Iterable<string>,
): ExtensionSelectorMatch | null {
  const name = resolveSelectorName(selector, addressableNames);
  return name === undefined ? null : matchFromName(selector, name);
}

function coversExtensionTool(match: ExtensionSelectorMatch, toolName: string): boolean {
  return match.toolName === undefined || match.toolName === toolName;
}

/**
 * Build a live predicate for one extension's tool names from the same allow/deny selectors
 * `selectSubagentExtensionTools` uses. The predicate also answers for names registered after
 * the extension set was scanned — a search extension can register `web_search` at
 * `session_start` — which is why the registration-aware projection needs a function instead
 * of the flat name list.
 */
export function createSubagentExtensionToolFilter(
  extensions: Iterable<SubagentExtensionLike>,
  selectors: readonly string[],
  deniedSelectors: readonly string[] = [],
): (extension: SubagentExtensionLike, toolName: string) => boolean {
  const normalizeAll = (values: readonly string[]) => values
    .filter((selector) => selector.toLowerCase().startsWith("ext:"))
    .map((selector) => normalizeExtensionSelector(selector))
    .filter(Boolean);
  const wanted = normalizeAll(selectors);
  const denied = normalizeAll(deniedSelectors);
  const loaded = [...extensions];
  const owners = extensionNameOwners(loaded);
  const addressable = new Set([...owners].filter(([, claimed]) => claimed.size === 1).map(([name]) => name));
  const everyExtension = wanted.includes("*");
  const denyEveryExtension = denied.includes("*");
  // A name claimed by more than one source cannot be addressed by that short spelling. For an
  // *allow* that means the selector grants nothing (it must not become "every owner"). For a
  // *deny* the safe reading is the opposite: the user asked to remove that name where it is
  // ambiguous, so deny every owner that offers it. Silently dropping the deny while `ext:*`
  // allows would turn a deny into a grant.
  const allNames = new Set(owners.keys());
  const isAmbiguousName = (name: string) => (owners.get(name)?.size ?? 0) > 1;
  const resolveAll = (values: readonly string[], names: Iterable<string>) => values.flatMap((selector) => {
    if (selector === "*") return [];
    const match = resolveExtensionSelector(selector, names);
    return match === null ? [] : [match];
  });
  const matches = resolveAll(wanted, addressable);
  const uniqueDenials = resolveAll(denied, addressable);
  const ambiguousDenials: ExtensionSelectorMatch[] = [];
  for (const selector of denied) {
    if (selector === "*") continue;
    const best = resolveSelectorName(selector, allNames);
    if (best === undefined || !isAmbiguousName(best)) continue;
    ambiguousDenials.push(matchFromName(selector, best));
  }
  const ownedMatches = new Map<SubagentExtensionLike, ExtensionSelectorMatch[]>();
  const ownedDenials = new Map<SubagentExtensionLike, ExtensionSelectorMatch[]>();
  const ownedAmbiguousDenials = new Map<SubagentExtensionLike, ExtensionSelectorMatch[]>();
  for (const extension of loaded) {
    const candidateNames = new Set(extensionCandidateNames(extension));
    const owned = new Set([...candidateNames].filter((name) => addressable.has(name)));
    ownedMatches.set(extension, matches.filter((match) => owned.has(match.name)));
    ownedDenials.set(extension, uniqueDenials.filter((match) => owned.has(match.name)));
    ownedAmbiguousDenials.set(extension, ambiguousDenials.filter((match) => candidateNames.has(match.name)));
  }
  return (extension, toolName) => {
    const owned = ownedMatches.get(extension);
    if (owned === undefined) return false;
    const granted = everyExtension || owned.some((match) => coversExtensionTool(match, toolName));
    if (!granted || denyEveryExtension) return false;
    const deniedByUnique = (ownedDenials.get(extension) ?? []).some((match) => coversExtensionTool(match, toolName));
    if (deniedByUnique) return false;
    return !(ownedAmbiguousDenials.get(extension) ?? []).some((match) => coversExtensionTool(match, toolName));
  };
}

export function selectSubagentExtensionTools(
  extensions: Iterable<SubagentExtensionLike>,
  selectors: readonly string[],
  deniedSelectors: readonly string[] = [],
): string[] {
  const loaded = [...extensions];
  const filter = createSubagentExtensionToolFilter(loaded, selectors, deniedSelectors);
  const selected: string[] = [];
  for (const extension of loaded) {
    for (const toolName of extension.tools.keys()) {
      if (filter(extension, toolName)) selected.push(toolName);
    }
  }
  return [...new Set(selected)];
}

export function readSubagentRun(entries: readonly SessionEntry[], sessionId: string, sessionPath: string): SubagentRunInfo | null {
  const data = subagentMetadataData(entries);
  if (!data) return null;
  const lifecycleEntry = [...entries].reverse().find((entry) =>
    entry.type === "custom" && (entry.customType === SUBAGENT_RESULT_TYPE || entry.customType === SUBAGENT_STATUS_TYPE)
  );
  const resultEntry = lifecycleEntry?.type === "custom" && lifecycleEntry.customType === SUBAGENT_RESULT_TYPE
    ? lifecycleEntry
    : undefined;
  const result = resultEntry?.type === "custom" && isRecord(resultEntry.data) ? resultEntry.data : undefined;
  const statusEntry = lifecycleEntry?.type === "custom" && lifecycleEntry.customType === SUBAGENT_STATUS_TYPE
    ? lifecycleEntry
    : undefined;
  const statusData = statusEntry?.type === "custom" && isRecord(statusEntry.data) ? statusEntry.data : undefined;
  const persistedStatus = result && (result.status === "completed" || result.status === "failed" || result.status === "aborted")
    ? result.status
    : statusData?.version === 1 && (statusData.status === "queued" || statusData.status === "running")
      ? statusData.status
      : "interrupted";
  return {
    sessionId,
    sessionPath,
    parentSessionId: data.parentSessionId,
    parentToolCallId: typeof data.parentToolCallId === "string" ? data.parentToolCallId : "",
    profile: typeof data.profile === "string" ? data.profile : "general-purpose",
    description: typeof data.description === "string" ? data.description : "Subagent",
    task: typeof data.task === "string" ? data.task : "",
    runInBackground: data.runInBackground === true,
    status: persistedStatus,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    ...(result && typeof result.completedAt === "string" ? { completedAt: result.completedAt } : {}),
    ...(result && typeof result.result === "string" ? { result: result.result } : {}),
    ...(result && typeof result.error === "string" ? { error: result.error } : {}),
    ...(typeof data.worktreePath === "string" ? { worktreePath: data.worktreePath } : {}),
    ...(typeof data.worktreeBranch === "string" ? { worktreeBranch: data.worktreeBranch } : {}),
    ...(result && typeof result.worktreeCleanupError === "string" ? { worktreeCleanupError: result.worktreeCleanupError } : {}),
  };
}
