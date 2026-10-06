/** Editable profile names stay canonical; execution snapshots also accept shell-mapped names. */
export const SUBAGENT_CANONICAL_BUILTIN_TOOL_NAMES = [
  "read", "bash", "edit", "write", "grep", "find", "ls",
] as const;
export const SUBAGENT_SNAPSHOT_BUILTIN_TOOL_NAMES = [
  ...SUBAGENT_CANONICAL_BUILTIN_TOOL_NAMES, "powershell",
] as const;

/** Profile editing uses bash as the portable shell token, even for authored mapped snapshots. */
export function canonicalSubagentProfileTools(tools: readonly string[]): string[] {
  const canonical = new Set<string>(SUBAGENT_CANONICAL_BUILTIN_TOOL_NAMES);
  return [...new Set(tools.map((tool) => tool === "powershell" ? "bash" : tool).filter((tool) => canonical.has(tool)))];
}
