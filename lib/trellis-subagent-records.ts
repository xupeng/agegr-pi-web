/**
 * One contract owner for Trellis `trellis_subagent` execution snapshots.
 *
 * The Trellis producer emits a structured `details` envelope of kind
 * `trellis-subagent-progress`. This module decodes that unknown payload once,
 * bounds every field, assigns collision-free tuple identity and owns the pure
 * merge/reducer transitions used by both live streaming and history restore.
 *
 * Nothing here imports the project extension, Pi persistence or React. The
 * producer is never modified; unknown/malformed details stay ordinary tool
 * results.
 */

export const TRELLIS_SUBAGENT_TOOL_NAME = "trellis_subagent";
export const TRELLIS_SUBAGENT_DETAILS_KIND = "trellis-subagent-progress";

/** Local UI bounds — deliberately not a producer schema version protocol. */
export const MAX_IDENTITY_LENGTH = 256;
export const MAX_RUNS_PER_SNAPSHOT = 100;
export const MAX_RETAINED_TOOL_TRACES = 32;
export const MAX_RECORDS_PER_VIEW = 100;
export const MAX_BRANCH_TOOL_CALL_IDS = 100;
export const MAX_LABEL_LENGTH = 256;
export const MAX_EXCERPT_LENGTH = 2_048;
export const MAX_FINAL_TEXT_LENGTH = 16_384;
export const MAX_TAIL_LENGTH = 4_096;
export const MAX_TEXT_BUDGET = 512 * 1024;

const MAX_SAFE_TIMESTAMP = 8_640_000_000_000_000;

export type TrellisRunMode = "single" | "parallel" | "chain" | "unknown";
export type TrellisRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "unknown";
export type TrellisToolStatus = "running" | "succeeded" | "failed" | "unknown";
export type TrellisEvidenceKind = "partial" | "tool-end" | "message" | "history";

export const TRELLIS_EVIDENCE_RANK: Record<TrellisEvidenceKind, number> = {
  partial: 0,
  "tool-end": 1,
  history: 2,
  message: 3,
};

const RUN_MODES = new Set<TrellisRunMode>(["single", "parallel", "chain"]);
const RUN_STATUSES = new Set<TrellisRunStatus>([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
const TOOL_STATUSES = new Set<TrellisToolStatus>([
  "running",
  "succeeded",
  "failed",
]);

export interface TrellisToolTrace {
  id: string;
  name: string;
  nameTruncated: boolean;
  argsExcerpt: string;
  argsTruncated: boolean;
  status: TrellisToolStatus;
  startedAt?: number;
  finishedAt?: number;
}

export interface TrellisUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: number;
  ctxTokens?: number;
  turns?: number;
}

export interface TrellisSubagentRecord {
  /** Collision-free tuple identity: see {@link trellisRecordId}. */
  id: string;
  parentSessionId: string;
  toolCallId: string;
  runId: string;
  /** Persisted session entry that supplied the record, when known. */
  entryId?: string;
  agent: string;
  mode: TrellisRunMode;
  step?: number;
  promptExcerpt: string;
  promptTruncated: boolean;
  status: TrellisRunStatus;
  /** Producer envelope said `final: true` (not proof of success). */
  finalEnvelope: boolean;
  evidence: TrellisEvidenceKind;
  startedAt?: number;
  finishedAt?: number;
  updatedAt?: number;
  model?: string;
  thinking?: string;
  labelsTruncated: boolean;
  errorExcerpt?: string;
  errorTruncated: boolean;
  finalText: string;
  finalTextTruncated: boolean;
  textTail: string;
  thinkingTail: string;
  stderrTail: string;
  tailsTruncated: boolean;
  tools: TrellisToolTrace[];
  toolsOmitted: number;
  usage?: TrellisUsage;
  /** True when the run object held no usable structured fields. */
  incomplete: boolean;
  /** Set by the store: event/request stamp used for reconciliation. */
  stamp: number;
  /** Set by the store: overlay without fresh durable backing. */
  stale: boolean;
  /** Set by the store: text dropped to stay inside the view budget. */
  omittedByBudget: boolean;
}

export interface TrellisProgressRun {
  id: string;
  status: TrellisRunStatus;
  step?: number;
  startedAt?: number;
  finishedAt?: number;
}

export interface TrellisProgressEnvelope {
  agent: string;
  agentTruncated: boolean;
  mode: TrellisRunMode;
  startedAt?: number;
  updatedAt?: number;
  final: boolean;
  finalEnvelope: boolean;
  runs: TrellisProgressRun[];
  malformedRuns: number;
  omittedRuns: number;
}

/** Decoded payload before per-call identity/provenance is attached. */
export interface TrellisRunPayload {
  runId: string;
  agent: string;
  mode: TrellisRunMode;
  step?: number;
  promptExcerpt: string;
  promptTruncated: boolean;
  status: TrellisRunStatus;
  finalEnvelope: boolean;
  startedAt?: number;
  finishedAt?: number;
  updatedAt?: number;
  model?: string;
  thinking?: string;
  labelsTruncated: boolean;
  errorExcerpt?: string;
  errorTruncated: boolean;
  finalText: string;
  finalTextTruncated: boolean;
  textTail: string;
  thinkingTail: string;
  stderrTail: string;
  tailsTruncated: boolean;
  tools: TrellisToolTrace[];
  toolsOmitted: number;
  usage?: TrellisUsage;
  incomplete: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep the bounded head of a string; never truncate identity values. */
function boundedHead(value: unknown, max: number): { text: string; truncated: boolean } {
  if (typeof value !== "string") return { text: "", truncated: false };
  return value.length <= max
    ? { text: value, truncated: false }
    : { text: value.slice(0, max), truncated: true };
}

/** Keep the bounded tail of a string (for tails). */
function boundedTail(value: unknown, max: number): { text: string; truncated: boolean } {
  if (typeof value !== "string") return { text: "", truncated: false };
  return value.length <= max
    ? { text: value, truncated: false }
    : { text: value.slice(-max), truncated: true };
}

function boundedLabel(value: unknown): { text?: string; truncated: boolean } {
  if (typeof value !== "string") return { truncated: false };
  // Slice before trimming so hostile labels cannot force an unbounded scan.
  const sample = value.slice(0, MAX_LABEL_LENGTH + 1);
  const trimmed = sample.trim();
  if (!trimmed) return { truncated: value.length > sample.length };
  return {
    text: trimmed.slice(0, MAX_LABEL_LENGTH),
    truncated: value.length > MAX_LABEL_LENGTH || trimmed.length > MAX_LABEL_LENGTH,
  };
}

function boundedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_IDENTITY_LENGTH) return null;
  return value;
}

function safeTimestamp(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > MAX_SAFE_TIMESTAMP) return undefined;
  return value;
}

function nonNegativeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function nonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return undefined;
  return value;
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) return undefined;
  return value;
}

/**
 * Collision-free tuple identity. JSON array encoding keeps delimiter characters
 * inside IDs from merging two distinct runs.
 */
export function trellisRecordId(
  parentSessionId: string,
  toolCallId: string,
  runId: string,
): string {
  return JSON.stringify([parentSessionId, toolCallId, runId]);
}

/** Exact gate: tool name plus the structured details kind. */
export function isTrellisSubagentDetails(details: unknown): boolean {
  return isObject(details) && details.kind === TRELLIS_SUBAGENT_DETAILS_KIND;
}

function decodeToolTrace(value: unknown): TrellisToolTrace | null {
  if (!isObject(value)) return null;
  const id = boundedId(value.id);
  if (!id) return null;
  const args = boundedHead(value.args, MAX_EXCERPT_LENGTH);
  const name = boundedLabel(value.name);
  const status = typeof value.status === "string" && TOOL_STATUSES.has(value.status as TrellisToolStatus)
    ? (value.status as TrellisToolStatus)
    : "unknown";
  return {
    id,
    name: name.text ?? "",
    nameTruncated: name.truncated,
    argsExcerpt: args.text,
    argsTruncated: args.truncated,
    status,
    startedAt: safeTimestamp(value.startedAt),
    finishedAt: safeTimestamp(value.finishedAt),
  };
}

function decodeTools(value: unknown): { tools: TrellisToolTrace[]; omitted: number } {
  if (!Array.isArray(value)) return { tools: [], omitted: 0 };
  // The payload is untrusted. Inspect only the retained tail instead of walking
  // an arbitrarily large array merely to discover which traces are newest.
  const inspected = value.slice(-MAX_RETAINED_TOOL_TRACES);
  const decoded: TrellisToolTrace[] = [];
  for (const raw of inspected) {
    const trace = decodeToolTrace(raw);
    if (trace) decoded.push(trace);
  }
  return {
    tools: decoded,
    omitted: Math.max(0, value.length - decoded.length),
  };
}

function decodeUsage(value: unknown): TrellisUsage | undefined {
  if (!isObject(value)) return undefined;
  const usage: TrellisUsage = {
    input: nonNegativeInteger(value.input),
    output: nonNegativeInteger(value.output),
    cacheRead: nonNegativeInteger(value.cacheRead),
    cacheWrite: nonNegativeInteger(value.cacheWrite),
    cost: nonNegativeNumber(value.cost),
    ctxTokens: nonNegativeInteger(value.ctxTokens),
    turns: nonNegativeInteger(value.turns),
  };
  return Object.values(usage).some((field) => field !== undefined) ? usage : undefined;
}

function decodeRun(value: unknown, envelope: TrellisProgressEnvelope): TrellisRunPayload | null {
  if (!isObject(value)) return null;
  const runId = boundedId(value.id);
  if (!runId) return null;

  const prompt = boundedHead(value.prompt, MAX_EXCERPT_LENGTH);
  const finalText = boundedHead(value.finalText, MAX_FINAL_TEXT_LENGTH);
  const textTail = boundedTail(value.textTail, MAX_TAIL_LENGTH);
  const thinkingTail = boundedTail(value.thinkingTail, MAX_TAIL_LENGTH);
  const stderrTail = boundedTail(value.stderrTail, MAX_TAIL_LENGTH);
  const error = boundedHead(value.errorMessage, MAX_EXCERPT_LENGTH);
  const tools = decodeTools(value.tools);
  const agent = boundedLabel(value.agent);
  const model = boundedLabel(value.model);
  const thinking = boundedLabel(value.thinking);
  const status = typeof value.status === "string" && RUN_STATUSES.has(value.status as TrellisRunStatus)
    ? (value.status as TrellisRunStatus)
    : "unknown";

  const hasStructure =
    typeof value.agent === "string"
    || typeof value.status === "string"
    || typeof value.prompt === "string";

  return {
    runId,
    agent: agent.text ?? envelope.agent,
    mode: envelope.mode,
    step: positiveInteger(value.step) ?? undefined,
    promptExcerpt: prompt.text,
    promptTruncated: prompt.truncated,
    status,
    finalEnvelope: envelope.final,
    startedAt: safeTimestamp(value.startedAt),
    finishedAt: safeTimestamp(value.finishedAt),
    updatedAt: envelope.updatedAt,
    model: model.text,
    thinking: thinking.text,
    labelsTruncated:
      agent.truncated
      || (!agent.text && envelope.agentTruncated)
      || model.truncated
      || thinking.truncated,
    errorExcerpt: error.text || undefined,
    errorTruncated: error.truncated,
    finalText: finalText.text,
    finalTextTruncated: finalText.truncated,
    textTail: textTail.text,
    thinkingTail: thinkingTail.text,
    stderrTail: stderrTail.text,
    tailsTruncated: textTail.truncated || thinkingTail.truncated || stderrTail.truncated,
    tools: tools.tools,
    toolsOmitted: tools.omitted,
    usage: decodeUsage(value.usage),
    incomplete: !hasStructure,
  };
}

/**
 * Decode the envelope and its runs. Returns null when the payload is not a
 * valid Trellis progress envelope (missing kind / runs / non-object details),
 * so callers keep generic tool rendering.
 */
export function decodeTrellisProgressDetails(
  details: unknown,
): { envelope: TrellisProgressEnvelope; runs: TrellisRunPayload[] } | null {
  if (!isTrellisSubagentDetails(details)) return null;
  const obj = details as Record<string, unknown>;
  if (!Array.isArray(obj.runs)) return null;

  const mode = typeof obj.mode === "string" && RUN_MODES.has(obj.mode as TrellisRunMode)
    ? (obj.mode as TrellisRunMode)
    : "unknown";

  const envelopeAgent = boundedLabel(obj.agent);
  const envelope: TrellisProgressEnvelope = {
    agent: envelopeAgent.text ?? "",
    agentTruncated: envelopeAgent.truncated,
    mode,
    startedAt: safeTimestamp(obj.startedAt),
    updatedAt: safeTimestamp(obj.updatedAt),
    final: obj.final === true,
    finalEnvelope: obj.final === true,
    runs: [],
    malformedRuns: 0,
    omittedRuns: 0,
  };

  const inspected = obj.runs.slice(0, MAX_RUNS_PER_SNAPSHOT);
  envelope.omittedRuns = Math.max(0, obj.runs.length - inspected.length);

  const seen = new Set<string>();
  const runs: TrellisRunPayload[] = [];
  for (const raw of inspected) {
    const run = decodeRun(raw, envelope);
    if (!run) {
      envelope.malformedRuns += 1;
      continue;
    }
    if (seen.has(run.runId)) {
      // Duplicate run IDs in one snapshot: first valid instance wins.
      envelope.malformedRuns += 1;
      continue;
    }
    seen.add(run.runId);
    envelope.runs.push({
      id: run.runId,
      status: run.status,
      step: run.step,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    });
    runs.push(run);
  }

  return { envelope, runs };
}

export interface ProjectTrellisOptions {
  parentSessionId: string;
  toolCallId: string;
  /** Exact tool name from the event or persisted tool-result message. */
  toolName?: string;
  evidence: TrellisEvidenceKind;
  details: unknown;
  entryId?: string;
  stamp?: number;
}

export interface TrellisProjection {
  records: TrellisSubagentRecord[];
  /** Runs omitted by per-snapshot bounds. */
  omittedRuns: number;
  /** Malformed run objects skipped individually. */
  malformedRuns: number;
}

/**
 * Decode one tool result/event into bounded records for a parent session.
 * Returns null when the payload is not a valid Trellis envelope.
 */
export function projectTrellisSubagentRecords(
  options: ProjectTrellisOptions,
): TrellisProjection | null {
  const { parentSessionId, toolCallId, details, evidence } = options;
  if (options.toolName !== TRELLIS_SUBAGENT_TOOL_NAME) return null;
  if (!boundedId(parentSessionId) || !boundedId(toolCallId)) return null;
  const decoded = decodeTrellisProgressDetails(details);
  if (!decoded) return null;

  const stamp = options.stamp ?? 0;
  const entryId = boundedId(options.entryId);
  const records: TrellisSubagentRecord[] = decoded.runs.map((run) => ({
    id: trellisRecordId(parentSessionId, toolCallId, run.runId),
    parentSessionId,
    toolCallId,
    runId: run.runId,
    ...(entryId ? { entryId } : {}),
    agent: run.agent,
    mode: run.mode,
    step: run.step,
    promptExcerpt: run.promptExcerpt,
    promptTruncated: run.promptTruncated,
    status: run.status,
    finalEnvelope: run.finalEnvelope,
    evidence,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    updatedAt: run.updatedAt,
    model: run.model,
    thinking: run.thinking,
    labelsTruncated: run.labelsTruncated,
    errorExcerpt: run.errorExcerpt,
    errorTruncated: run.errorTruncated,
    finalText: run.finalText,
    finalTextTruncated: run.finalTextTruncated,
    textTail: run.textTail,
    thinkingTail: run.thinkingTail,
    stderrTail: run.stderrTail,
    tailsTruncated: run.tailsTruncated,
    tools: run.tools,
    toolsOmitted: run.toolsOmitted,
    usage: run.usage,
    incomplete: run.incomplete,
    stamp,
    stale: false,
    omittedByBudget: false,
  }));

  return {
    records,
    omittedRuns: decoded.envelope.omittedRuns,
    malformedRuns: decoded.envelope.malformedRuns,
  };
}

// ── Store / reducer ────────────────────────────────────────────────────

export type TrellisHistoryCoverage = "none" | "incomplete" | "complete";

export interface TrellisSubagentStore {
  history: TrellisSubagentRecord[];
  overlays: TrellisSubagentRecord[];
  watermark: number;
  eventTruncationWatermark: number;
  truncated: boolean;
  historyCoverage: TrellisHistoryCoverage;
}

export type TrellisStoreAction =
  | { type: "reset" }
  | { type: "event"; records: TrellisSubagentRecord[]; watermark: number; truncated?: boolean }
  | { type: "history"; records: TrellisSubagentRecord[]; watermark: number; truncated: boolean }
  | { type: "markOverlaysStale" }
  | { type: "markHistoryIncomplete" };

export function createTrellisStore(): TrellisSubagentStore {
  return {
    history: [],
    overlays: [],
    watermark: 0,
    eventTruncationWatermark: 0,
    truncated: false,
    historyCoverage: "none",
  };
}

function mergeIncoming(
  existing: TrellisSubagentRecord[],
  incoming: TrellisSubagentRecord[],
): TrellisSubagentRecord[] {
  const existingById = new Map(existing.map((record) => [record.id, record]));
  const accepted = new Map<string, TrellisSubagentRecord>();
  for (const record of incoming) {
    const current = accepted.get(record.id) ?? existingById.get(record.id);
    if (current) {
      const currentRank = TRELLIS_EVIDENCE_RANK[current.evidence] ?? 0;
      const incomingRank = TRELLIS_EVIDENCE_RANK[record.evidence] ?? 0;
      // Terminal evidence never regresses to a later-arriving partial snapshot.
      if (incomingRank < currentRank) continue;
    }
    accepted.set(record.id, record);
  }

  // Incoming event order is authoritative. Producer timestamps are display
  // metadata only and never decide which snapshot wins or where it is retained.
  return [
    ...accepted.values(),
    ...existing.filter((record) => !accepted.has(record.id)),
  ];
}

export function reduceTrellisStore(
  state: TrellisSubagentStore,
  action: TrellisStoreAction,
): TrellisSubagentStore {
  switch (action.type) {
    case "reset":
      return createTrellisStore();
    case "event": {
      if (action.records.length === 0) return state;
      return {
        ...state,
        overlays: mergeIncoming(state.overlays, action.records),
        watermark: Math.max(state.watermark, action.watermark),
        eventTruncationWatermark: action.truncated
          ? Math.max(state.eventTruncationWatermark, action.watermark)
          : state.eventTruncationWatermark,
        truncated: state.truncated || Boolean(action.truncated),
      };
    }
    case "history": {
      const history = mergeIncoming([], action.records);
      const coveredCalls = new Set(action.records.map((record) => record.toolCallId));
      const overlays = state.overlays
        .filter((overlay) => {
          // Older-than-request overlays are superseded by the durable base.
          if (overlay.stamp !== 0 && overlay.stamp <= action.watermark && coveredCalls.has(overlay.toolCallId)) {
            return false;
          }
          return true;
        })
        .map((overlay) => ({
          ...overlay,
          // A retained overlay not backed by the latest snapshot is stale.
          stale: overlay.stamp <= action.watermark && !coveredCalls.has(overlay.toolCallId)
            ? true
            : overlay.stale,
        }));
      return {
        ...state,
        history,
        overlays,
        watermark: Math.max(state.watermark, action.watermark),
        eventTruncationWatermark: state.eventTruncationWatermark > action.watermark
          ? state.eventTruncationWatermark
          : 0,
        // Event-side omissions after this request began survive; omissions the
        // durable response covers can be cleared by that response.
        truncated: action.truncated || state.eventTruncationWatermark > action.watermark,
        historyCoverage: action.truncated ? "incomplete" : "complete",
      };
    }
    case "markOverlaysStale":
      return {
        ...state,
        overlays: state.overlays.map((overlay) => ({ ...overlay, stale: true })),
      };
    case "markHistoryIncomplete":
      return { ...state, historyCoverage: "incomplete" };
    default:
      return state;
  }
}

function recordBaseTextLength(record: TrellisSubagentRecord): number {
  return record.agent.length + (record.model?.length ?? 0) + (record.thinking?.length ?? 0);
}

function recordDetailTextLength(record: TrellisSubagentRecord): number {
  let total = record.promptExcerpt.length
    + record.finalText.length
    + record.textTail.length
    + record.thinkingTail.length
    + record.stderrTail.length
    + (record.errorExcerpt?.length ?? 0);
  for (const tool of record.tools) {
    total += tool.id.length + tool.name.length + tool.argsExcerpt.length;
  }
  return total;
}

/** Clear lower-priority detail text when the aggregate view budget is exhausted. */
export function enforceTextBudget(
  records: TrellisSubagentRecord[],
  budget: number = MAX_TEXT_BUDGET,
): TrellisSubagentRecord[] {
  // Bounded labels remain useful for identifying rows. Reserve them first, then
  // allocate rich detail newest-first in the caller-provided record order.
  const baseLength = records.reduce((total, record) => total + recordBaseTextLength(record), 0);
  let remaining = Math.max(0, budget - baseLength);
  return records.map((record) => {
    const length = recordDetailTextLength(record);
    if (length <= remaining) {
      remaining -= length;
      return record;
    }
    remaining = 0;
    return {
      ...record,
      promptExcerpt: "",
      promptTruncated: record.promptTruncated || record.promptExcerpt.length > 0,
      finalText: "",
      finalTextTruncated: record.finalTextTruncated || record.finalText.length > 0,
      textTail: "",
      thinkingTail: "",
      stderrTail: "",
      tailsTruncated:
        record.tailsTruncated
        || record.textTail.length > 0
        || record.thinkingTail.length > 0
        || record.stderrTail.length > 0,
      errorExcerpt: undefined,
      errorTruncated: record.errorTruncated || Boolean(record.errorExcerpt),
      tools: [],
      toolsOmitted: record.toolsOmitted + record.tools.length,
      omittedByBudget: true,
    };
  });
}

/**
 * Extract bounded Trellis tool-call IDs from an assistant message in either
 * Pi's persisted shape (`id`/`name`) or pi-web's normalized shape.
 */
export function collectTrellisToolCallIdsFromMessage(message: unknown): string[] {
  if (!isObject(message) || message.role !== "assistant" || !Array.isArray(message.content)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  // A single assistant message is also untrusted; only inspect its latest
  // bounded content window.
  const blocks = message.content.slice(-MAX_BRANCH_TOOL_CALL_IDS);
  for (const block of blocks) {
    if (!isObject(block) || block.type !== "toolCall") continue;
    const toolName = typeof block.name === "string"
      ? block.name
      : (typeof block.toolName === "string" ? block.toolName : "");
    if (toolName !== TRELLIS_SUBAGENT_TOOL_NAME) continue;
    const id = boundedId(typeof block.id === "string" ? block.id : block.toolCallId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function shouldFollowTrellisHeadRefresh(
  activeLeafId: string | null,
  latestLeafId: string | null,
  promptViewGeneration: number | null,
  currentViewGeneration: number,
): boolean {
  return activeLeafId === latestLeafId || promptViewGeneration === currentViewGeneration;
}

export function shouldAcceptTrellisSnapshot(
  currentOwner: number,
  snapshot: TrellisSubagentRecordsSnapshot,
): boolean {
  // A cleanup may only clear the owner it belongs to. A newer mounted hook can
  // publish first during a keyed React replacement, in which case the old
  // cleanup must not win merely because it ran later.
  if (snapshot.parentSessionId === null) return snapshot.owner === currentOwner;
  return snapshot.owner >= currentOwner;
}

export interface TrellisSelection {
  records: TrellisSubagentRecord[];
  truncated: boolean;
  historyCoverage: TrellisHistoryCoverage;
}

/** Additive server response projection (detail/context GET, non-pagination). */
export interface TrellisSubagentRecordsEnvelope {
  parentSessionId: string;
  leafId: string | null;
  leafValid: boolean;
  truncated: boolean;
  hasRecords: boolean;
  branchToolCallIds: string[];
  records: TrellisSubagentRecord[];
}

/**
 * Scoped publication from the session hook to the shell. `owner` is a
 * client-local generation token: the shell ignores snapshots from an older
 * hook/view so a stale unmount cleanup cannot clear a newer view.
 */
export interface TrellisSubagentRecordsSnapshot {
  parentSessionId: string | null;
  owner: number;
  records: TrellisSubagentRecord[];
  truncated: boolean;
  historyCoverage: TrellisHistoryCoverage;
}

let trellisOwnerCounter = 0;

/** Monotonic owner token shared by every hook instance on the client. */
export function nextTrellisOwner(): number {
  trellisOwnerCounter += 1;
  return trellisOwnerCounter;
}

/**
 * Merge durable history with live overlays (overlays win), cap the retained
 * records newest-first and apply the aggregate text budget.
 */
export function selectTrellisRecords(state: TrellisSubagentStore): TrellisSelection {
  const merged = mergeIncoming(state.history, state.overlays);
  const truncatedByCount = merged.length > MAX_RECORDS_PER_VIEW;
  const capped = truncatedByCount ? merged.slice(0, MAX_RECORDS_PER_VIEW) : merged;
  return {
    records: enforceTextBudget(capped),
    truncated: state.truncated || truncatedByCount,
    historyCoverage: state.historyCoverage,
  };
}
