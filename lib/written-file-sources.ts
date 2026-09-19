/**
 * Pure helpers that turn tool evidence into "files this turn wrote".
 *
 * Three evidence shapes feed the turn file list:
 *
 * - `write` / `edit` tool input (`file_path` / `path`)
 * - the external `pi-apply-patch` extension, whose `apply_patch` result carries
 *   structured `details` (preferred) plus a per-hunk summary text (fallback)
 * - subagents: Trellis tool traces (`trellis_subagent`) and the built-in
 *   `Agent` completion snapshot (`details.writtenFiles`)
 *
 * Every `details` payload is `unknown`; nothing here is cast without a runtime
 * guard. No React, no DOM, no filesystem — the same module runs in the browser,
 * in route handlers and inside the subagent runtime.
 */

import { resolveLocalFilePath } from "./file-links";
import { isApplyPatchToolName, isEditToolName, isWriteToolName } from "./tool-names";
import {
  isTrellisSubagentDetails,
  TRELLIS_SUBAGENT_TOOL_NAME,
} from "./trellis-subagent-records";
import type { SessionEntry } from "./types";

export { TRELLIS_SUBAGENT_TOOL_NAME };

/** Built-in subagent tool name. The `details.kind` gate below is what makes it safe. */
export const AGENT_TOOL_NAME = "Agent";
export const SUBAGENT_DETAILS_KIND = "pi-web-subagent";

export type WrittenFileOperation = "add" | "update" | "move" | "write" | "edit";
export type WrittenFileOrigin =
  | "tool-input"
  | "apply-patch-details"
  | "apply-patch-text"
  | "subagent-trellis"
  | "subagent-snapshot";

const WRITTEN_FILE_OPERATIONS = new Set<WrittenFileOperation>([
  "add",
  "update",
  "move",
  "write",
  "edit",
]);

export interface WrittenFile {
  /** Resolved absolute path of a file this turn wrote. */
  filePath: string;
  operation?: WrittenFileOperation;
  /** Per-file additions when the source can prove it belongs to this turn. */
  added?: number;
  /** Per-file deletions when the source can prove it belongs to this turn. */
  removed?: number;
  /**
   * Session whose persisted entries reference this path. Only the built-in
   * `Agent` snapshot carries one; it lets `/api/files` authorize paths outside
   * the allowed roots via the child session that wrote them.
   */
  sourceSessionId?: string;
  /** Provenance, kept for debugging and test assertions. */
  origin?: WrittenFileOrigin;
}

/** A written file before the raw path is resolved against a cwd. */
export interface RawWrittenFile {
  filePath: string;
  operation?: WrittenFileOperation;
  added?: number;
  removed?: number;
  sourceSessionId?: string;
  origin: WrittenFileOrigin;
}

/** Bound hostile/unbounded payloads. The Trellis producer caps at these values. */
export const MAX_TRELLIS_RUNS_FOR_FILES = 100;
export const MAX_TRELLIS_TOOLS_PER_RUN_FOR_FILES = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readInputPath(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  return nonEmptyString(input.file_path) ?? nonEmptyString(input.path);
}

/** Join text blocks from a tool-result content array. */
export function textFromToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

// ── apply_patch ────────────────────────────────────────────────────────

const SUMMARY_ADD_UPDATE_RE = /^(add|update): (.+)$/;
const SUMMARY_MOVE_RE = /^move: (.+) -> (.+)$/;

/**
 * Parse the per-hunk summary lines `apply_patch` returns on success.
 *
 * Only `add` / `update` / `move` are written files: `delete:` removes a file and
 * must never be listed as an openable artifact. Failure lines
 * (`- <path> (<op>): <msg>`) start with `- ` and never match.
 */
export function parseApplyPatchSummaryText(text: string): RawWrittenFile[] {
  const files = new Map<string, RawWrittenFile>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("delete: ")) {
      files.delete(line.slice("delete: ".length).trim());
      continue;
    }
    const move = SUMMARY_MOVE_RE.exec(line);
    if (move) {
      files.delete(move[1].trim());
      files.set(move[2].trim(), { filePath: move[2].trim(), operation: "move", origin: "apply-patch-text" });
      continue;
    }
    const change = SUMMARY_ADD_UPDATE_RE.exec(line);
    if (change) {
      files.set(change[2].trim(), {
        filePath: change[2].trim(),
        operation: change[1] as WrittenFileOperation,
        origin: "apply-patch-text",
      });
    }
  }
  return [...files.values()];
}

interface PreviewEntry {
  target: string;
  operation?: WrittenFileOperation;
  added?: number;
  removed?: number;
}

function parseApplyPatchPreview(preview: unknown): PreviewEntry[] | null {
  if (!isRecord(preview) || !Array.isArray(preview.files)) return null;
  const entries: PreviewEntry[] = [];
  for (const raw of preview.files) {
    if (!isRecord(raw)) continue;
    if (raw.operation === "delete") continue;
    const movePath = nonEmptyString(raw.movePath);
    const target = movePath ?? nonEmptyString(raw.filePath);
    if (!target) continue;
    let operation: WrittenFileOperation | undefined;
    if (movePath) operation = "move";
    else if (raw.operation === "add") operation = "add";
    else if (raw.operation === "update") operation = "update";
    entries.push({
      target,
      operation,
      added: nonNegativeCount(raw.added),
      removed: nonNegativeCount(raw.removed),
    });
  }
  return entries;
}

/**
 * Authoritative applied-file list for an `apply_patch` result.
 *
 * `details.preview.files` is built from the *parsed* patch, so on a partial
 * failure it can still contain files whose hunk failed. The result object's
 * `summaries` / `appliedFiles` only contain files that actually landed, so they
 * are the primary source; preview is used solely to enrich line counts.
 */
function parseApplyPatchResult(result: unknown): RawWrittenFile[] | null {
  if (!isRecord(result)) return null;
  const hasSummaries = Array.isArray(result.summaries);
  const hasApplied = Array.isArray(result.appliedFiles);
  if (!hasSummaries && !hasApplied) return null;

  if (hasSummaries) {
    // Summaries are authoritative and carry the operation, so a delete-only
    // patch correctly yields no openable files (it is not "nothing known").
    const text = (result.summaries as unknown[]).filter((value) => typeof value === "string").join("\n");
    return parseApplyPatchSummaryText(text).map((file) => ({ ...file, origin: "apply-patch-details" }));
  }

  if (hasApplied) {
    const applied = (result.appliedFiles as unknown[])
      .map(nonEmptyString)
      .filter((value): value is string => value !== null);
    if (applied.length > 0) {
      return applied.map((filePath) => ({ filePath, origin: "apply-patch-details" as const }));
    }
  }

  // Structured evidence says nothing was applied (e.g. every hunk failed).
  return [];
}

/**
 * Parse `apply_patch` details. Returns `null` when the payload holds no usable
 * structured evidence. Present but unusable details must not trigger text fallback.
 */
export function parseApplyPatchDetails(details: unknown): RawWrittenFile[] | null {
  if (!isRecord(details)) return null;
  const previewEntries = parseApplyPatchPreview(details.preview);
  const resultEntries = parseApplyPatchResult(details.result);

  if (resultEntries !== null) {
    // Older results may omit summaries. Applied paths can include deletions;
    // use preview operations only to exclude those, never to invent success.
    const deleted = new Set<string>();
    if (isRecord(details.preview) && Array.isArray(details.preview.files)) {
      for (const file of details.preview.files) {
        if (isRecord(file) && file.operation === "delete" && typeof file.filePath === "string") {
          deleted.add(file.filePath);
        }
      }
    }
    const applied = resultEntries.filter((entry) => entry.operation !== undefined || !deleted.has(entry.filePath));
    if (!previewEntries || previewEntries.length === 0) return applied;
    const previewByTarget = new Map<string, PreviewEntry>();
    for (const entry of previewEntries) previewByTarget.set(entry.target, entry);
    return applied.map((entry) => {
      const preview = previewByTarget.get(entry.filePath);
      if (!preview) return entry;
      return {
        ...entry,
        added: entry.added ?? preview.added,
        removed: entry.removed ?? preview.removed,
        operation: entry.operation ?? preview.operation,
      };
    });
  }

  return null;
}

// ── edit line counts ───────────────────────────────────────────────────

/**
 * Count added/removed lines in an `edit` result's unified patch. Header lines
 * (`---` / `+++`) precede the first `@@` hunk, so only lines inside a hunk are
 * counted.
 */
export function parseEditDiffCounts(details: unknown): { added: number; removed: number } | null {
  if (!isRecord(details)) return null;
  const patch = nonEmptyString(details.patch);
  if (!patch) return null;
  let added = 0;
  let removed = 0;
  let inHunk = false;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    if (line.startsWith("+")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }
  return inHunk ? { added, removed } : null;
}

// ── subagents ──────────────────────────────────────────────────────────

function readTracePath(args: unknown): string | null {
  let parsed = args;
  if (typeof args === "string") {
    try {
      parsed = JSON.parse(args);
    } catch {
      return null;
    }
  }
  if (!isRecord(parsed)) return null;
  return nonEmptyString(parsed.path) ?? nonEmptyString(parsed.file_path);
}

/**
 * Extract `write` / `edit` files from a Trellis progress envelope.
 *
 * Deliberately walks the full producer payload instead of the client decoder:
 * `lib/trellis-subagent-records.ts` retains only the last 32 traces per run for
 * display, which drops ~36% of written paths. Bounds here match the producer's
 * own caps (100 runs × 256 traces), so nothing the producer emitted is lost.
 */
export function extractTrellisWrittenFiles(details: unknown): RawWrittenFile[] {
  if (!isTrellisSubagentDetails(details)) return [];
  const runs = (details as Record<string, unknown>).runs;
  if (!Array.isArray(runs)) return [];
  const files: RawWrittenFile[] = [];
  for (const run of runs.slice(0, MAX_TRELLIS_RUNS_FOR_FILES)) {
    if (!isRecord(run) || !Array.isArray(run.tools)) continue;
    for (const trace of run.tools.slice(0, MAX_TRELLIS_TOOLS_PER_RUN_FOR_FILES)) {
      if (!isRecord(trace)) continue;
      if (trace.status !== "succeeded") continue;
      const name = nonEmptyString(trace.name);
      if (!name || (!isWriteToolName(name) && !isEditToolName(name))) continue;
      const filePath = readTracePath(trace.args);
      if (!filePath) continue;
      files.push({
        filePath,
        operation: isEditToolName(name) ? "edit" : "write",
        origin: "subagent-trellis",
      });
    }
  }
  return files;
}

/** Read the completion snapshot the built-in `Agent` runtime writes into details. */
export function extractSubagentSnapshotWrittenFiles(details: unknown): RawWrittenFile[] {
  if (!isRecord(details) || details.kind !== SUBAGENT_DETAILS_KIND) return [];
  if (!Array.isArray(details.writtenFiles)) return [];
  // The run's own session id is the provenance for every file it wrote; it is
  // what `/api/files` uses to authorize paths outside the allowed roots.
  const sourceSessionId = nonEmptyString(details.sessionId) ?? undefined;
  const files: RawWrittenFile[] = [];
  for (const raw of details.writtenFiles) {
    if (!isRecord(raw)) continue;
    const filePath = nonEmptyString(raw.filePath);
    if (!filePath) continue;
    const operation = typeof raw.operation === "string" &&
      WRITTEN_FILE_OPERATIONS.has(raw.operation as WrittenFileOperation)
      ? raw.operation as WrittenFileOperation
      : undefined;
    const added = nonNegativeCount(raw.added);
    const removed = nonNegativeCount(raw.removed);
    files.push({
      filePath,
      ...(operation ? { operation } : {}),
      ...(added !== undefined ? { added } : {}),
      ...(removed !== undefined ? { removed } : {}),
      ...(sourceSessionId ? { sourceSessionId } : {}),
      origin: "subagent-snapshot",
    });
  }
  return files;
}

// ── shared per-call extraction ─────────────────────────────────────────

export interface ToolResultEvidence {
  isError?: boolean;
  details?: unknown;
  /** Joined text content of the tool result. */
  text?: string;
}

/**
 * Raw (unresolved) written files for a single tool call.
 *
 * Failed calls wrote nothing by definition, so they are skipped — a partial
 * `apply_patch` failure is *not* an error result and still lists the hunks that
 * landed.
 */
export function extractRawWrittenFiles(
  toolName: string,
  input: Record<string, unknown> | undefined,
  result: ToolResultEvidence | undefined,
): RawWrittenFile[] {
  if (!result || result.isError) return [];

  if (isApplyPatchToolName(toolName)) {
    if (result.details !== undefined && result.details !== null) {
      return parseApplyPatchDetails(result.details) ?? [];
    }
    // Older extension builds / other runtimes may omit details entirely.
    return parseApplyPatchSummaryText(result.text ?? "");
  }

  if (isWriteToolName(toolName)) {
    const filePath = readInputPath(input);
    return filePath ? [{ filePath, operation: "write", origin: "tool-input" }] : [];
  }

  if (isEditToolName(toolName)) {
    const filePath = readInputPath(input);
    if (!filePath) return [];
    const counts = parseEditDiffCounts(result.details);
    return [{
      filePath,
      operation: "edit",
      ...(counts ?? {}),
      origin: "tool-input",
    }];
  }

  if (toolName === TRELLIS_SUBAGENT_TOOL_NAME) {
    return extractTrellisWrittenFiles(result.details);
  }

  if (toolName === AGENT_TOOL_NAME) {
    return extractSubagentSnapshotWrittenFiles(result.details);
  }

  return [];
}

// ── resolution / dedupe ────────────────────────────────────────────────

/**
 * Resolve raw paths against `cwd`, dedupe by resolved path and keep first-seen
 * order. A later duplicate fills in line counts and a source session id the
 * first entry lacked, without moving it.
 */
export function resolveAndMergeWrittenFiles(
  rawFiles: readonly RawWrittenFile[],
  cwd?: string,
): WrittenFile[] {
  const byPath = new Map<string, WrittenFile>();
  const ordered: WrittenFile[] = [];
  for (const raw of rawFiles) {
    const filePath = resolveLocalFilePath(raw.filePath, cwd);
    if (!filePath) continue;
    const existing = byPath.get(filePath);
    if (existing) {
      if (existing.added === undefined && raw.added !== undefined) existing.added = raw.added;
      if (existing.removed === undefined && raw.removed !== undefined) existing.removed = raw.removed;
      if (existing.operation === undefined && raw.operation !== undefined) existing.operation = raw.operation;
      if (existing.sourceSessionId === undefined && raw.sourceSessionId !== undefined) {
        existing.sourceSessionId = raw.sourceSessionId;
      }
      if (existing.origin === undefined && raw.origin !== undefined) existing.origin = raw.origin;
      continue;
    }
    const written: WrittenFile = { filePath };
    if (raw.operation !== undefined) written.operation = raw.operation;
    if (raw.added !== undefined) written.added = raw.added;
    if (raw.removed !== undefined) written.removed = raw.removed;
    if (raw.sourceSessionId !== undefined) written.sourceSessionId = raw.sourceSessionId;
    written.origin = raw.origin;
    byPath.set(filePath, written);
    ordered.push(written);
  }
  return ordered;
}

// ── session entries (server-side subagent snapshot) ────────────────────

interface OrderedToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function readToolCallBlock(block: unknown): OrderedToolCall | null {
  if (!isRecord(block) || block.type !== "toolCall") return null;
  const id = nonEmptyString(block.toolCallId) ?? nonEmptyString(block.id);
  const name = nonEmptyString(block.toolName) ?? nonEmptyString(block.name);
  if (!id || !name) return null;
  const input = isRecord(block.input) ? block.input : isRecord(block.arguments) ? block.arguments : {};
  return { id, name, input };
}

/**
 * Collect the files a persisted session wrote, from assistant `toolCall` blocks
 * paired with their `toolResult` entries. Used by the subagent runtime to
 * snapshot a child session's writes at completion time.
 */
export function extractWrittenFilesFromEntries(
  entries: readonly SessionEntry[],
  cwd?: string,
): WrittenFile[] {
  const calls: OrderedToolCall[] = [];
  const results = new Map<string, ToolResultEvidence>();

  for (const entry of entries) {
    if (!isRecord(entry) || entry.type !== "message") continue;
    const message = entry.message;
    if (!isRecord(message)) continue;

    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const block of message.content) {
        const call = readToolCallBlock(block);
        if (call) calls.push(call);
      }
      continue;
    }

    if (message.role === "toolResult") {
      const id = nonEmptyString(message.toolCallId);
      if (!id) continue;
      results.set(id, {
        isError: message.isError === true,
        details: message.details,
        text: textFromToolResultContent(message.content),
      });
    }
  }

  const raw: RawWrittenFile[] = [];
  for (const call of calls) {
    const result = results.get(call.id);
    if (!result) continue;
    raw.push(...extractRawWrittenFiles(call.name, call.input, result));
  }
  return resolveAndMergeWrittenFiles(raw, cwd);
}
