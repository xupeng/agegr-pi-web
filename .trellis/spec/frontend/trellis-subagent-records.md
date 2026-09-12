# Trellis subagent execution snapshots

## 1. Scope / Trigger

This is the single frontend code-spec owner for the cross-layer Trellis adapter: structured tool evidence → bounded branch-history API projection → scoped hook store → read-only Subagents panel. The implementation contract owner is `lib/trellis-subagent-records.ts`; history traversal lives in `lib/trellis-subagent-history.ts`. Do not duplicate producer interfaces in components or import `.pi/extensions/trellis` into the browser.

Built-in children remain real sessions from `getSessionFamily`; Trellis records belong only to the selected parent's viewed branch, not every session in that family. They are not SessionInfo objects. [Session list refresh](./session-list-refresh.md) remains the owner of catalog/cache/polling behavior. This adapter does not repair the deferred short-lived built-in sampling gap.

No producer change, durable partial replay, new persistence schema, structural-version protocol, registry relation, global setting or environment key was added. Client request/view/owner counters are local cancellation tokens, not wire versions.

## 2. Signatures

Actual exports from `lib/trellis-subagent-records.ts`:

```ts
projectTrellisSubagentRecords(options: ProjectTrellisOptions): TrellisProjection | null
// options: { parentSessionId: string; toolCallId: string; toolName?: string;
//   evidence: TrellisEvidenceKind; details: unknown; entryId?: string; stamp?: number }
// projection: { records: TrellisSubagentRecord[]; omittedRuns: number; malformedRuns: number }
trellisRecordId(parentSessionId: string, toolCallId: string, runId: string): string
reduceTrellisStore(state: TrellisSubagentStore, action: TrellisStoreAction): TrellisSubagentStore
selectTrellisRecords(state: TrellisSubagentStore): TrellisSelection
```

History exports:

```ts
collectBranchPath(entries: SessionEntry[], leafId: string | null): SessionEntry[]
projectTrellisSubagentHistory(entries: SessionEntry[], leafId: string | null,
  parentSessionId: string): TrellisHistoryProjection
```

Routes: `GET /api/sessions/[id]` and `GET /api/sessions/[id]/context`. Hook callback (passed through `ChatWindow`):

```ts
onSubagentRecordsChange?: (snapshot: TrellisSubagentRecordsSnapshot) => void;
// { parentSessionId: string | null; owner: number; records: TrellisSubagentRecord[];
//   truncated: boolean; historyCoverage: "none" | "incomplete" | "complete" }
```

## 3. Contracts (request / response / lifecycle)

### Exact gate and bounded data

Both `toolName === "trellis_subagent"` and `details.kind === "trellis-subagent-progress"` are required at the projection boundary. `isTrellisSubagentDetails`/`decodeTrellisProgressDetails` alone check details, not tool identity. Details must be an object with a `runs` array. Unknown fields are ignored; never spread raw details into the view model.

Identity is `JSON.stringify([parentSessionId, toolCallId, run.id])`; parent comes from request/connection scope, never details. Optional persisted `entryId` is provenance, not navigation. Modes: `single | parallel | chain | unknown`; run statuses: `pending | running | succeeded | failed | cancelled | unknown`. Only supplied runs/steps are rendered (no invented later chain steps). `final === true` sets `finalEnvelope`, not success.

The source constants are local UI limits (string lengths are JS UTF-16 code units):

| Constant | Value / behavior |
|---|---|
| `MAX_IDENTITY_LENGTH` | 256; nonempty IDs, reject rather than truncate; also bounds optional entry ID and trace IDs |
| `MAX_RUNS_PER_SNAPSHOT` | 100; inspect first 100 |
| `MAX_RETAINED_TOOL_TRACES` | 32; inspect last 32 per run |
| `MAX_RECORDS_PER_VIEW` | 100; newest source entries / accepted event order first |
| `MAX_BRANCH_TOOL_CALL_IDS` | 100; history retains newest unique calls; each assistant message inspects last 100 content blocks |
| `MAX_LABEL_LENGTH` | 256; agent/model/thinking/tool name; slice before trim |
| `MAX_EXCERPT_LENGTH` | 2,048; prompt/error/tool args head |
| `MAX_FINAL_TEXT_LENGTH` | 16,384; final text head |
| `MAX_TAIL_LENGTH` | 4,096; each text/thinking/stderr tail |
| `MAX_TEXT_BUDGET` | 512 × 1024; normalized display text, not serialized response bytes |
| internal `MAX_SAFE_TIMESTAMP` | 8,640,000,000,000,000; finite, nonnegative |

`enforceTextBudget` reserves agent/model/thinking labels, then allocates rich details in caller order. If a record's details do not fit, it clears that record's details/tools and marks `omittedByBudget`; it does not partially fill the remaining budget. Identity/JSON overhead is not included. Per-field truncation and budget flags are distinct from envelope `truncated` (omitted/malformed runs or record count). Bounds apply to the added projection/selection, not original raw SSE/JSON payload size, full entry loading, or an unlimited archive. Do not describe the internal live store as hard-capped by these selection limits.

### Current branch and pagination

Detail GET uses `sm.getLeafId()`. Context GET uses `root=1` for explicit null root; otherwise the projection uses `leafId ?? sm.getLeafId()`. An empty-string leaf is an invalid explicit leaf, not the default. `root=1` takes precedence. The hook sends `root=1` for `loadContext(..., null)`.

Both routes accept `tail`: positive finite Number capped at 1000, otherwise 50; `deferThinking`/`deferMedia` are presence flags. Context's nonempty `before` means chat pagination (exclude that entry); it returns `{ context, tail, before }` **without** a Trellis projection. Empty `before` does not enter this pagination branch. Page-up never replaces record scope.

Detail and non-pagination context add:

```ts
trellisSubagentRecords: {
  parentSessionId: string;
  leafId: string | null;
  leafValid: boolean;
  truncated: boolean;
  hasRecords: boolean; // records.length > 0
  branchToolCallIds: string[];
  records: TrellisSubagentRecord[];
}
```

History builds one ID map and walks only requested ancestors with visited-ID/cycle protection and an entries-length walk bound. Null root is valid/empty; unknown/cyclic leaf is invalid/empty, with no other-branch fallback. Newest persisted results win duplicate tuple retention, preserving producer run order within a call. It uses already-loaded entries, not the last 50 chat entries or a new session-list scan. Record budget is applied before serialization. A fork's copied results are re-scoped to the fork's parent ID.

The hook accepts the envelope only when parent and effective leaf match. Invalid leaf yields no records/call ownership. Missing or mismatched envelope falls back to already-loaded context messages with incomplete coverage, not full-history claims.

### Evidence, persistence and watermark

Partial comes from `tool_execution_update.partialResult.details`; provisional final from `tool_execution_end.result.details`; canonical message from completed tool-result `message_end`; history from persisted `toolResult.details`. Existing final-message serialization/normalization preserves details; no new persistence entry is written. Partial is memory-only; a crash/full reload without a final result cannot reconstruct it.

`TRELLIS_EVIDENCE_RANK` is `partial:0 < tool-end:1 < history:2 < message:3`. Lower-ranked evidence cannot regress the same tuple. Accepted arrival order, not producer timestamps, controls ordering; timestamps are display metadata. Final tool-end survives the gap before canonical message. An invalid/missing final is ignored by the decoder, not converted to sibling success/failure; settlement/reconnect can leave the prior partial stale.

Each history request captures the event watermark. History removes a covered call's overlay only when its nonzero stamp is at or before that watermark; newer overlays survive. Uncovered older overlays become stale. `eventTruncationWatermark` separately preserves omissions observed after dispatch; a covering later history response can clear them. Coverage describes retained historical evidence, not proof that a subprocess is alive or every partial was persisted.

### Session / branch / request / SSE / callback ownership

- `loadSession` guards accepted success, 404, errors and loading cleanup with mounted state, real session ID and request sequence; full reads invalidate old context requests.
- Branch replacement increments view generation and invalidates old full reads, clears records/call ownership before awaiting. Context acceptance also checks requested leaf, request sequence and abort signal. A→B→A and X→Y→X must not revive old responses. Pagination only prepends matching chat/entry IDs.
- Live ingestion requires head-following (active leaf equals latest leaf, or prompt belongs to current view generation) **and** an allowed call ID. Ownership comes from accepted assistant tool-call messages/deltas, not buffered `tool_execution_start`. Both persisted `id/name` and normalized `toolCallId/toolName` shapes are supported.
- `AgentEventConnection` rejects discarded EventSource callbacks. Reconnect resets allowed calls to historical evidence and marks overlays stale; it does not replay Trellis partials. Refresh is skipped while history is in flight or parent/prompt/SDK is active; settlement reconciles later. Historical settlement refreshes that context rather than jumping to head.
- Hook publication carries a monotonic hook owner; branch view generation is a separate request token. AppShell re-filters by selected parent. Non-null publications require owner >= current; cleanup with null parent requires owner === current. Old unmount cleanup cannot erase a newer keyed hook. New-session promotion publishes real IDs, not `new:*` draft keys.

### Read-only UI and built-in separation

Entry visibility is built-in children OR retained Trellis records; count is children + runs, excluding main row. Built-in navigation, listbox, search, status and running count stay unchanged; records-only views retain selected session as main fallback. Records do not enter session usage/running/unread/notification totals.

`TrellisSubagentRecords` uses local expandable buttons with `aria-expanded`; disappearing records clear expanded selection. Rows say **Last reported**, including running/pending; no liveness spinner/timer. Details show evidence, snapshot/not-full-conversation, upstream excerpt caveat, stale/incomplete/coverage and additional UI truncation. Missing prompt/final is unavailable; absent usage is not fabricated as zero. Text is escaped, never raw HTML or automatically fetched paths/URLs. No record-as-session navigation or Continue/Steer/Fork/Stop actions.

## 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Wrong/missing tool name, wrong/missing kind, null/array details, non-array runs | Projection null; generic tool rendering unchanged |
| Empty runs | Valid empty projection; no entry solely from it |
| Invalid/oversized parent or call ID | Projection null |
| Bad run ID/object; duplicate run ID | Skip individually; first valid duplicate wins; count malformed |
| Oversized optional entry ID / invalid trace ID | Drop provenance / trace; never truncate identity |
| Unknown mode/status | `unknown`, not guessed success/running |
| Invalid numeric field | Omit; usage counts nonnegative safe integers, cost finite nonnegative, step positive safe integer; entirely invalid usage absent |
| Excess runs/traces/text | Bounded inspection/retention and omission flags; no arbitrary-details stringify |
| Root / missing or cyclic leaf | Empty valid root / empty invalid leaf projection; no unrelated branch |
| Missing session | HTTP 404 `{ error: "Session not found" }` |
| Route exception | HTTP 500 `{ error: String(error) }` |
| Stale request/SSE/cleanup | No current-view overwrite; not a user-facing validation error |

## 5. Good / Base / Bad Cases

- **Good:** A final parallel tool result older than 50 entries restores on first detail GET; two calls sharing run ID still have distinct tuples. Partial → end → message → history produces one row per tuple with higher-ranked evidence preserved.
- **Base:** Only built-in children exist: original navigation works. No children or valid records: entry hidden. Old API without projection: page-only fallback labeled incomplete. Failed early chain: show only reported steps.
- **Bad:** A different tool copies the kind string; ignore it. A slow head response arrives after choosing historical leaf; reject it. Partial says running then disconnects: stale last-report snapshot, never a live-process claim.

## 6. Tests Required (assertion points)

- `lib/trellis-subagent-records.test.mjs`: exact two-part gate, tuple collisions, duplicate/malformed siblings, all modes/statuses, numeric/identity/field/aggregate limits, immutability, evidence rank, event order, history and omission watermarks, owner cleanup.
- `lib/trellis-subagent-history.test.mjs`: >50-entry restore, X/Y ancestors, root/unknown/cycle, fork scope, latest 100 records/calls, budget before serialization.
- `lib/trellis-subagent-persistence.test.mjs`, normalize/wire tests: temporary SessionManager round-trip retains final details, deferred media/thinking do not strip evidence; partial is not durable replay.
- Detail/context route tests: additive envelope, effective leaf, explicit root, default tail and page-up envelope absence; no new list scan or registry side effect.
- `hooks/useAgentSession.trellis.test.mjs` and `e2e/subagents.mjs`: delayed A→B→A success/404/finally, X→Y→X context, pagination races, reconnect/final reconciliation, historical settlement, old owner cleanup and real-ID promotion. Source wiring assertions supplement reducer/browser behavior, not replace it.
- `components/TrellisSubagentRecords.test.mjs`, built-in panel/toolbar tests and desktop/mobile E2E: built-in-only/Trellis-only/mixed/empty, correct count, keyboard expansion, overflow, snapshot labels, no fake session/control requests.

Historical verification for task `09-11-subagents-entry-visibility` is in its `research/check-report.md`: 68 focused, 150 related and 1164 isolated full Node tests passed; typecheck passed; task-specific E2E passed at 1280×800 and 390×844. **Not all quality gates are green:** lint has 16 identical HEAD baseline errors; original full E2E fails the same `e2e/chat-appearance.mjs:88` short-settings language-option hit-test on both HEAD and changed copies with available Chromium. Do not convert these into passes. Documentation closeout does not rerun those suites.

## 7. Wrong vs Correct

```ts
// Wrong: kind alone admits unrelated tools; delimiter IDs can collide.
if (isTrellisSubagentDetails(details)) show(details);
const key = `${parent}:${call}:${run}`;

// Correct: trusted parent/call scope + exact tool gate + bounded projection.
const projection = projectTrellisSubagentRecords({
  parentSessionId, toolCallId, toolName, details, evidence: "history",
});
const key = trellisRecordId(parentSessionId, toolCallId, runId);
```

**Wrong:** derive all records from the paginated chat page, let a late history response erase newer final evidence, or label a historical `running` record as an active child session.

**Correct:** project requested full ancestors, reconcile using captured watermarks and separate ownership guards, and render a read-only last-reported snapshot beside—not as—a built-in session.
