/**
 * Bounded projection of Trellis `trellis_subagent` execution snapshots from an
 * already-loaded session entry list.
 *
 * This is deliberately independent of chat pagination: it walks the full
 * requested ancestor path (not the default 50-message tail) with one ID map and
 * cycle protection, so historical records older than the chat page are still
 * recoverable. It never scans the session list or filesystem.
 */

import type { SessionEntry } from "./types";
import {
  collectTrellisToolCallIdsFromMessage,
  enforceTextBudget,
  MAX_BRANCH_TOOL_CALL_IDS,
  MAX_RECORDS_PER_VIEW,
  projectTrellisSubagentRecords,
  TRELLIS_SUBAGENT_TOOL_NAME,
  type TrellisSubagentRecord,
} from "./trellis-subagent-records";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface TrellisHistoryProjection {
  parentSessionId: string;
  /** Effective leaf the projection was computed for; null means explicit root. */
  leafId: string | null;
  /** True when the requested leaf exists and is usable. */
  leafValid: boolean;
  records: TrellisSubagentRecord[];
  /** True when more records exist than the retained budget. */
  truncated: boolean;
  /** Assistant tool-call IDs seen on the requested branch (live ownership). */
  branchToolCallIds: string[];
}

/**
 * Walk one ancestor path root -> leaf. Returns [] for an explicit root (null)
 * or an unknown/cyclic leaf; it never falls back to another branch.
 */
export function collectBranchPath(
  entries: SessionEntry[],
  leafId: string | null,
): SessionEntry[] {
  if (leafId === null) return [];
  const byId = new Map<string, SessionEntry>();
  for (const entry of entries) byId.set(entry.id, entry);
  const leaf = byId.get(leafId);
  if (!leaf) return [];

  const chain: SessionEntry[] = [];
  const visited = new Set<string>();
  let current: SessionEntry | undefined = leaf;
  // entries.length bounds the walk so a malformed parent cycle cannot loop.
  for (let guard = 0; current && guard <= entries.length; guard += 1) {
    if (visited.has(current.id)) return [];
    visited.add(current.id);
    chain.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  chain.reverse();
  return chain;
}

function collectToolCallIds(path: SessionEntry[]): string[] {
  const newestFirst: string[] = [];
  const seen = new Set<string>();
  // Traverse newest-first and stop as soon as the ownership budget is full;
  // neither the retained list nor its de-duplication set grows with history.
  for (let index = path.length - 1; index >= 0 && newestFirst.length < MAX_BRANCH_TOOL_CALL_IDS; index -= 1) {
    const entry = path[index];
    if (entry.type !== "message") continue;
    const messageIds = collectTrellisToolCallIdsFromMessage(entry.message);
    for (let callIndex = messageIds.length - 1; callIndex >= 0; callIndex -= 1) {
      const id = messageIds[callIndex];
      if (seen.has(id)) continue;
      seen.add(id);
      newestFirst.push(id);
      if (newestFirst.length === MAX_BRANCH_TOOL_CALL_IDS) break;
    }
  }
  return newestFirst.reverse();
}

export function projectTrellisSubagentHistory(
  entries: SessionEntry[],
  leafId: string | null,
  parentSessionId: string,
): TrellisHistoryProjection {
  const path = collectBranchPath(entries, leafId);
  const leafValid = leafId === null ? true : path.length > 0;
  const branchToolCallIds = collectToolCallIds(path);

  const byRecordId = new Map<string, TrellisSubagentRecord>();
  let sourceOmitted = false;
  // Newest source entries win while preserving stable run order within a call.
  scanEntries: for (let index = path.length - 1; index >= 0; index -= 1) {
    const entry = path[index];
    if (entry.type !== "message" || entry.message.role !== "toolResult") continue;
    const message = entry.message;
    const toolName = typeof message.toolName === "string" ? message.toolName : "";
    if (toolName !== TRELLIS_SUBAGENT_TOOL_NAME) continue;
    const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : "";
    if (!toolCallId) continue;
    const projection = projectTrellisSubagentRecords({
      parentSessionId,
      toolCallId,
      toolName,
      evidence: "history",
      details: message.details,
      entryId: entry.id,
      stamp: 0,
    });
    if (!projection) continue;
    sourceOmitted ||= projection.omittedRuns > 0 || projection.malformedRuns > 0;
    for (const record of projection.records) {
      if (byRecordId.has(record.id)) continue;
      if (byRecordId.size >= MAX_RECORDS_PER_VIEW) {
        sourceOmitted = true;
        break scanEntries;
      }
      byRecordId.set(record.id, record);
    }
    if (byRecordId.size >= MAX_RECORDS_PER_VIEW && sourceOmitted) break;
  }

  const records = [...byRecordId.values()];
  const truncated = sourceOmitted;
  const retained = records;
  return {
    parentSessionId,
    leafId,
    leafValid,
    records: enforceTextBudget(retained),
    truncated,
    branchToolCallIds,
  };
}

/**
 * Best-effort fallback for older API responses that predate the additive
 * `trellisSubagentRecords` envelope. It can only see the already-loaded chat
 * page, so callers must label history coverage incomplete.
 */
export function projectTrellisSubagentContextMessages(
  messages: unknown[],
  parentSessionId: string,
): TrellisSubagentRecord[] {
  const records: TrellisSubagentRecord[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isObject(message) || message.role !== "toolResult") continue;
    const toolName = typeof message.toolName === "string" ? message.toolName : "";
    if (toolName !== TRELLIS_SUBAGENT_TOOL_NAME) continue;
    const toolCallId = typeof message.toolCallId === "string" ? message.toolCallId : "";
    if (!toolCallId) continue;
    const projection = projectTrellisSubagentRecords({
      parentSessionId,
      toolCallId,
      toolName,
      evidence: "history",
      details: message.details,
      stamp: 0,
    });
    if (projection) records.push(...projection.records);
    if (records.length >= MAX_RECORDS_PER_VIEW) break;
  }
  return enforceTextBudget(records.slice(0, MAX_RECORDS_PER_VIEW));
}
