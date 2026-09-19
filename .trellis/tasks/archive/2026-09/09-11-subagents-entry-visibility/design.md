# Design: built-in sessions plus Trellis execution snapshots

Status: approved and implemented in pi-web. The implementation record, verification results and residual gaps are in `research/findings.md` section 9 and the checked list in `implement.md`. No producer, persistence, registry, family or list-refresh contract was changed.

Documentation disposition: implementation and independent check complete, awaiting user acceptance/submission. This file preserves the approved design, including proposal-era wording below; the verified, maintained implementation contract is owned by [the frontend snapshot spec](../../spec/frontend/trellis-subagent-records.md). In particular, hook owner and branch generation are separate tokens, evidence rank is message > history > tool-end > partial, and aggregate display-text bounds are not wire-byte limits. Deferred structural-version proposals are not implemented.

## Boundary and decisions

The smallest gap is that `trellis_subagent` already emits structured execution details, but pi-web only exposes real session-family members in its top entry. Add a pi-web-owned adapter and a read-only section; do not change Trellis, Pi persistence, session relations, registry, or list refresh protocol.

Two distinct sources remain explicit:

- **Built-in sessions**: existing selected-session family, navigation, status, sorting and actions unchanged.
- **Trellis execution records**: snapshots owned by the currently selected parent session's viewed branch. Not a family-wide search across other session files. Selecting a built-in child displays that child's own Trellis records, not its parent's records. A fork may contain copied historical results; those are snapshots scoped to the new parent ID, never shared live executions.

Top visibility is `builtInChildren.length > 0 || trellisRecords.length > 0`; the count is built-in children plus retained Trellis runs (not tool calls, not the main row). Display a capped-count indicator when records were omitted. The entry is not permanently visible. Trellis records do not participate in `runningSessionIds`, session statistics, notifications, unread marks, or the built-in running counter.

## Evidence-driven data flow

```text
Trellis onUpdate({details})
  -> agent-core tool_execution_update
  -> AgentSession.subscribe -> rpc wrapper -> agent-event-wire -> SSE
  -> useAgentSession shared decoder/reducer
  -> scoped onSubagentRecordsChange via ChatWindow
  -> AppShell visibility/count -> panel's read-only Trellis section

Trellis return {details}
  -> tool_execution_end.result.details (immediate final snapshot)
  -> message_end toolResult.details (canonical finalized message)
  -> SessionManager.appendMessage -> JSONL
  -> existing session/detail or branch/context GET reads entries
  -> bounded active-branch record projection (independent of chat pagination)
  -> same hook projection/reducer -> same UI
```

See `research/findings.md` section 8 for file:line evidence and executed checks. The normalizer and lazy image/thinking handling preserve details. There is no need to patch persistence or copy records into custom entries. Partial updates are not durable and reconnect snapshots only contain the assistant message: complete replay of interrupted external execution is impossible without changing the producer/runtime, which is excluded.

## One contract owner

Proposed `lib/trellis-subagent-records.ts` owns public types, `unknown` decoding, bounded projections, tuple identity, merge/state transitions and status formatting inputs. Do not import the project extension into the browser or duplicate its TypeScript interfaces inside components.

Require both tool name `trellis_subagent` and `details.kind === "trellis-subagent-progress"`. For live events use their tool identity; for stored results use `toolResult.toolName/toolCallId`. Do not infer from assistant text, `content: "subagent running"`, tool availability or a run's agent name.

Identity is a collision-free tuple encoding of **parentSessionId + toolCallId + run.id**, e.g. JSON.stringify of the three strings, never delimiter concatenation. Parent identity is supplied by the trusted request/connection scope, not details. Keep the source toolCallId and optional persisted result entryId for provenance; record IDs are never session IDs or navigation targets.

Normalized records contain source tag, parent ID, toolCallId, run ID, mode/step, agent/prompt excerpt, reported status, evidence kind (`partial`, `tool-end`, `message`, `history`), final-envelope flag, timestamps when valid, model/thinking setting, bounded final text/tails/tool trace/usage and omission flags. No raw unknown object spread into the view model.

### Validation and bounded work

Proposed constants are local UI limits, **not a producer schema version protocol**:

- Identity strings: nonempty, at most 256 code units; reject oversized IDs (never truncate identity). Mode must be single/parallel/chain; unknown/missing mode displays `unknown`, without interpreting unsupported semantics.
- Inspect at most 100 runs per snapshot, at most 32 retained tool traces per run (prefer latest traces); retain at most 100 run records per parent/branch view. Newest source entries win the retention budget; stable run order inside a call, chain step ordering when valid. Duplicate run IDs in one snapshot: first valid instance wins, mark malformed/omitted data.
- Display labels at most 256 characters, prompt/args/error excerpts at most 2,048, final text at most 16,384, each tail at most 4,096. Keep head for final/prompt, tail for tail fields; truncate before aggregation. Overall normalized text budget 512 Ki characters per view, with deterministic newest-first allocation and omission markers. Do not JSON.stringify arbitrary details to enforce the budget.
- Numbers must be finite/nonnegative; integer-only positive chain step, integer usage counts, bounded safe timestamp range. Missing usage is unavailable, not zero. Do not sum Trellis usage into parent session totals.
- Enumerate known statuses; unknown/missing status becomes `unknown`. `final:true` is not proof of success. Malformed runs are skipped individually; malformed envelope/missing kind/missing runs/non-object details yields no records and keeps generic tool rendering intact. Ignore unknown fields.
- Pure projection walks only the requested ancestor chain, with visited IDs and a walk bound of entries.length to reject cycles. Build the entry lookup once; do not repeatedly walk per run. Finding results older than 50 entries must not require loading chat pages.

These limits bound the added adapter/response/rendering work, not the existing raw SSE/JSON parsing or original tool-result payload. Raw Trellis `finalText` and existing history details can still be large; changing the producer or transport-level payload policy is deferred.

## History projection without pagination coupling

The detail GET already loads all entries and builds a tree. Add an optional response field such as `trellisSubagentRecords: { parentSessionId, leafId, records, truncated }`, computed over the requested full ancestor path, not `context.messages` (default tail is 50). Add the same field to branch/context GET for a branch replacement, but do not recompute/send it on `before` pagination requests. Use a server helper (`lib/trellis-subagent-history.ts`, or a small export beside session-reader) consuming the shared decoder; no new endpoint and no session-list scan/cache invalidation.

For context GET, resolve the intended leaf explicitly (`leafId` or `sm.getLeafId()`), never infer Trellis scope from the last entry in the entire file. Invalid leaf means empty/error, never another branch. Represent the empty root selection explicitly (e.g. `root=1`), and pass `null` to branch projection/context construction. Existing `loadContext(null)` omits leafId today; its accidental default-leaf fallback must not leak records. `before` pagination affects chat only, not the snapshot scope. Return effective leaf in the record envelope so the hook can validate the response.

This is an additive pi-web response projection, not an extension schema version, structural version counter, or migration. Older API responses without the field can derive records from the already loaded messages as best effort and label history coverage incomplete; do not claim full coverage. Unknown details remain ordinary tool results.

## Hook lifecycle and race handling

`agentPhase` is an ephemeral one-line indicator, not a suitable record store. Keep normalized Trellis state separately in the hook, using a pure reducer and narrow integration into existing event/load paths. Preserve `getToolExecutionProgress` behavior for all tools.

1. **Scope**: `(real parent ID, view generation, requested leaf)`; view generation is client-local cancellation ownership, not a wire/global version. Increment before branch navigation, session replacement/rekey and unmount. Clear scoped records/expanded details synchronously when scope changes; never wait for a fetch to clear old Trellis data.
2. **Requests**: capture scope generation, requested leaf, request sequence and event watermark at dispatch. Accept successful, error, 404 and finally updates only if still mounted and owner matches. A prior latest-session load must not replace a subsequently selected historical branch; page-up requests must not prepend into a different branch. Apply these guards at shared `loadSession/loadContext` mutation points because deriving from raced messages would reintroduce leakage. Keep this fix local; no hook-wide redesign.
3. **Events**: `AgentEventConnection` already suppresses callbacks from discarded EventSources. Still validate the real parent scope in hook publication. Consume `partialResult.details`, `tool_execution_end.result.details`, and completed tool-result messages. A tool end can precede its result message in parallel mode; keep a final snapshot through that gap. Within a connection, event arrival is the ordering authority, not producer timestamps. Terminal records cannot regress on an old partial. Final `message_end`/persisted message wins over provisional tool-end data; deduplicate by the tuple.
4. **Branch ownership**: only accept a live call if its toolCallId is on the viewed branch (assistant toolCall evidence in accepted messages/stream), or was observed in this scope while following the active live branch. Navigating to a historical branch invalidates all live overlays, including late events for the old branch even when parent ID is unchanged. Do not retag a late tool event with the new view generation. Returning to latest starts from a fresh snapshot; no old map reuse.
5. **Reload/reconcile**: replace the historical base from accepted server snapshots, merge only same-scope overlays newer than the request watermark and known to belong to the branch. Old fetches cannot erase a newly received final result. Once persisted records cover a tool call, remove its overlay. Missing/invalid final details after an observed partial stops live expectations and leaves only a clearly incomplete snapshot; do not infer every parallel sibling failed/succeeded from the outer tool flag.
6. **Reconnect**: invalidate previous live ownership; refresh bounded historical records through the existing session/context read path without resetting a viewed historical leaf. `connected.isStreaming` says only that the parent is active. It cannot restore an external run or establish a missing call's identity. Partial-only records retained in the same view may remain as stale snapshots; after a full reload they may be unavailable. A new, branch-owned event may update them. Do not add runtime recovery/polling or a Trellis subprocess lookup.
7. **AppShell bridge**: optional `onSubagentRecordsChange` passed through ChatWindow to the hook, carrying parent ID and hook/view ownership token. AppShell filters synchronously by selected session and current owner (including cleanup); stale unmount callbacks cannot clear a newer view. New-session promotion uses real ID only; never publish under `new:*`. Key panel detail state by the ownership scope and reset when a record disappears.

## Honest status and read-only UX

All Trellis rows are **execution snapshots**, including actively updated ones. Show `Last reported: running/pending/succeeded/failed/cancelled/unknown` with last update time when available; stale/incomplete history is explicitly labeled. Do not show an unqualified running badge/spinner, an elapsed timer implying liveness, or add these records to the built-in running counter. A parent's running state, final:false, timestamps, and absence of a tool end are not a reliable external-process liveness oracle. This conservative presentation needs no new heartbeat protocol.

Use two named sections under the existing top panel. Preserve built-in main-first row, session selection callback, ordering, search threshold and persisted/live status semantics. A separate `TrellisSubagentRecords` component renders buttons that only expand local details, outside the built-in listbox semantics (no nested interactive elements in a session option). Keyboard activation, aria-expanded, focus, overflow and mobile fit must work.

Trellis details show agent, mode/step, prompt excerpt, recorded outcome, model/settings, usage if valid, final result, text/thinking/stderr tails, recent tool trace and error excerpt as escaped text. Label **snapshot, not a full conversation**; tails/prompt/tool traces are already potentially truncated by Trellis even when pi-web does not truncate further. Mark additional UI truncation separately. Missing fields say unavailable. No raw HTML, automatic file/URL access, session API navigation, Continue, Steer, Fork, Stop, or fake child-session creation. Existing generic chat tool results remain unchanged.

## Expected implementation files

- New `lib/trellis-subagent-records.ts` + pure tests: decoder, bounds, identity, projection/reducer.
- New `lib/trellis-subagent-history.ts` + tests: full requested branch projection using existing entries, no filesystem scanning.
- `hooks/useAgentSession.ts` owns `SessionData` today (`:40`): add the optional typed response field there, importing shared adapter types. Update `lib/types.ts` only if another shared contract requires it; no mutation of SessionInfo/relation.
- `app/api/sessions/[id]/route.ts`, `app/api/sessions/[id]/context/route.ts`: bounded history projection and explicit effective leaf/root handling.
- `hooks/useAgentSession.ts`: scope/request guards, event reducer, history reconciliation, callback publication.
- `components/ChatWindow.tsx`: typed callback pass-through only.
- `components/AppShell.tsx`: scoped published state, combined visibility/count and panel composition; keep catalog/family logic unchanged.
- `components/AgentSessionPanel.tsx`: composition boundary only if needed to preserve its built-in listbox and fit the shared panel; do not rewrite built-in rows.
- New `components/TrellisSubagentRecords.tsx` + tests: snapshot list/details.
- `lib/i18n/messages/en.ts`, `zh-CN.ts`, `zh-TW.ts`, following existing typed locale fallbacks: source/status/coverage/truncation/read-only labels.
- Existing wire, normalize, reader, hook/panel tests plus isolated E2E fixtures: extend coverage, not production transport changes.

No expected changes to `.pi/extensions/trellis`, Trellis skills/scripts, `lib/session-family.ts`, SessionSidebar, rpc-manager registry, global settings, persisted user sessions, or structural version machinery.

## Rollback and deferred risks

All new state is derived. Rollback removes the adapter, additive response field and UI bridge; no stored-data migration. Do not roll back unrelated user changes. The prior built-in short-lifecycle list refresh gap remains documented, not solved here. Other extensions and family-wide Trellis browsing are out of scope. SDK/tool_result hooks can replace details, crashes can prevent final persistence, and old sessions may never have had structured details; display cannot reconstruct absent evidence. The plan's conservative snapshot presentation is deliberate, not a claim of live subprocess monitoring.
