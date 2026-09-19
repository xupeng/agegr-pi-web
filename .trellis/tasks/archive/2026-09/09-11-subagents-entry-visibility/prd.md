# Subagents entry: built-in sessions and Trellis execution records

## Goal and user value

Explain the previously intermittent Subagents entry, then make Trellis subagent executions discoverable through the same top entry without pretending they are Pi Web sessions. Users can switch among existing built-in sessions and inspect Trellis execution snapshots in one panel.

## Approval and current state

The original read-only investigation is complete (AC1–AC3). The user approved the direction **do not change Trellis; adapt `trellis_subagent` with `details.kind=trellis-subagent-progress` in pi-web only**. The final PRD/design/implementation plan was then explicitly approved in the main session ("好的，继续"), so the earlier planning-only gate is closed and implementation is authorized.

Artifacts: `research/findings.md` preserves the original investigation, adapter research and section 9 implementation record; `design.md` specifies the final proposal; `implement.md` specifies work order, validation and the checked checklist; `research/check-report.md` records the independent review. Curated `implement.jsonl`/`check.jsonl` supply spec/research context. Status: **implemented and independently checked in pi-web; focused/full isolated tests, typecheck and task-specific desktop/mobile browser E2E pass, with only documented repository baseline lint/E2E gaps remaining**.

Implementation summary: new `lib/trellis-subagent-records.ts` (gate/decoder/bounds/tuple identity/merge store), `lib/trellis-subagent-history.ts` (full viewed-branch projection), `components/TrellisSubagentRecords.tsx` (read-only qualified snapshot UI), additive `trellisSubagentRecords` envelopes in the detail and non-pagination context GET routes, scoped hook reducer/request-ownership/callback bridge, owner-filtered `AppShell` visibility/count, `ChatWindow` pass-through and en+zh-CN+zh-TW strings. No producer, registry, list-refresh, structural-version, global-config or real-session changes.

Documentation closeout: **implementation and independent check complete; awaiting user acceptance/submission** (`task.json: review`). The actual cross-layer contract has one maintained owner: [Trellis subagent execution snapshots](../../spec/frontend/trellis-subagent-records.md). No archive, finish or commit was performed; this documentation pass did not rerun expensive tests. Lint retains 16 failures also present on HEAD; original full E2E fails the same assertion on HEAD and the changed copy; task-specific desktop/mobile E2E passed (see check report).

## Confirmed background

- The reported visibility instability has no captured user browser reproduction; there is no proven unique incident root cause.
- `components/AppShell.tsx:124-140` combines sessionCatalog with selectedSession, resolves getSessionFamily and sets hasSubagentSessions from family.subagents.length. Desktop/mobile rendering at `:1526-1564` is conditional, not an enabled-tool indicator; the no-family close effect at `:334-338` and panel at `:2244-2253` use the same source.
- Original research confirms a built-in short-lifecycle sampling/list-refresh gap, but completion does not remove normally persisted, already loaded children. Findings sections 1–7 retain source anchors, scenario evidence levels and the original 14 tests / 12 memory checks.
- Trellis uses an external CLI with `--no-session` (`.pi/extensions/trellis/index.ts:696-710,1441`), so no child SessionInfo/registry relationship exists. Its progress envelope and final toolResult.details are available independently.
- Follow-up source/SDK research verifies details survive SSE, final-message serialization, normalize and history reading; the hook currently retains only one-line progress. History defaults to 50 entries, requiring a bounded full-viewed-branch projection for top-entry recovery. Findings section 8 records this evidence and the additional **60 passing existing tests and 9 passing synthetic memory checks**; neither is a new-feature browser test.

## Requirements and acceptance mapping

| ID | Requirement | Acceptance |
|---|---|---|
| R1 | Trace toolbar, session family, sidebar refresh, server relationships and child creation. Retain the source investigation. | AC1 |
| R2 | Document create/complete/reload/project-session switch/history restore behavior; extend checks to branch switches and reconnect. Distinguish source inference, automated tests and real reproduction. | AC2, AC6 |
| R3 | Distinguish built-in sessions from extension executions; do not generalize Trellis compatibility to arbitrary Agent tools. | AC2, AC4 |
| R4 | Preserve confirmed causes, hypotheses, trigger conditions and minimal remedies. Earlier structural-version remedies remain deferred. | AC3 |
| R5 | Show a shared top entry when either existing built-in children or valid Trellis records exist. Keep source-separated sections; count built-in children plus retained Trellis runs, excluding the main row. | AC4 |
| R6 | Consume structured live partial/end/message events and restore final records independently of the 50-entry chat page, through an additive bounded projection in existing detail/context responses. | AC5 |
| R7 | Scope records to the currently selected parent session and viewed branch. Key every run by parentSessionId + toolCallId + run.id; reject stale session, branch, request, reconnect and cleanup writes. No cross-session/branch overlay reuse. | AC6 |
| R8 | Support single/parallel/chain; shared bounded validation from unknown; unknown/missing/malformed details preserve generic tool behavior. Do not fabricate chain steps or truncate IDs into collisions. | AC7 |
| R9 | Trellis details are read-only execution snapshots with reported statuses, provenance and snapshot/truncation/coverage labels. Never infer true running from parent activity or old details, nor expose session continue/steer/fork/stop actions. | AC8 |
| R10 | Existing built-in session family/navigation/status/search behavior remains intact. No producer, registry, persistence format, list refresh or structural-version changes. Tests must not touch real user sessions/configuration. | AC9 |

## Acceptance criteria

- **AC1 (R1, completed):** findings identify entry conditions and each update source with file:line evidence.
- **AC2 (R2/R3, original completed):** findings retain scenario/source comparisons and evidence levels; future implementation expands the regression matrix rather than claiming an unobserved browser reproduction.
- **AC3 (R4, completed):** confirmed causes, unverified incident hypotheses, deferred remedies and remaining risks are explicit.
- **AC4 (R3/R5):** desktop/mobile fixtures cover built-in-only, Trellis-only, mixed and empty views. Valid Trellis runs expose the entry without any child SessionInfo. Mixed count is children + retained runs; truncation is visible; clicking a built-in row still navigates, clicking a Trellis row only expands its snapshot.
- **AC5 (R6):** a Trellis result older than the last 50 entries appears on initial restore without page-up. Repeated partial -> end -> message -> persisted snapshot yields one row per tuple with final data preserved. Single, parallel and failed early chain round-trip through isolated persistence/normalization/history. Partial-only crashes/reloads honestly show unavailable/incomplete evidence, not invented results.
- **AC6 (R2/R7):** deterministic delayed HTTP/SSE tests cover A -> B -> A sessions, same-parent branch X -> Y -> X, empty/invalid leaf, page-up racing navigation, old load/404/finally, reconnect, unmount cleanup and real-ID promotion. No old view records flash or overwrite the current view. Same run.id in different calls/parents does not collide.
- **AC7 (R8):** tests cover null/nonobject details, missing/unknown kind, wrong tool name, empty/malformed/oversized runs, duplicate/oversized IDs, unknown status/mode, invalid numeric fields, huge strings/tools and aggregate limits. Valid siblings survive malformed entries, input is not mutated, UI stays bounded, generic tools remain usable.
- **AC8 (R9):** every Trellis detail is labeled snapshot/not full conversation; upstream excerpts and additional UI truncation are distinguished. Missing data is unavailable. Historical/partial running is qualified as last reported, with no live spinner or contribution to built-in running count. Trellis interactions issue no session navigation/control commands or automatic path/URL requests. Keyboard and mobile detail interaction are usable.
- **AC9 (R10):** existing relevant tests plus new pure, isolated persistence, transport/hook and browser tests pass; typecheck/lint pass or unrelated baseline failures are documented. No `.pi/extensions/trellis`, list-version protocol, global configuration or real session data changes. Final planning approval precedes execution.

## Scope decisions in the final proposal

- Built-in section keeps its existing family scope. Trellis section is explicitly the **selected parent's viewed branch**, not a search through every member of the built-in family.
- Trellis statuses are qualified **last reported snapshots**, not process liveness; existing built-in running indicators are unchanged.
- History projection walks the full requested ancestor path but returns at most 100 run records with bounded fields and a total 512 Ki-character text budget. Omitted records/fields are labeled; this is not unlimited archival browsing. Exact per-field budgets and merge ownership are in design.md.
- No separate product decision blocks presenting this plan. These explicit UX/scope choices were reviewed and approved with the implementation.

## Out of scope and risks

No Trellis changes, true Trellis session persistence, continue/steer/fork/stop for records, arbitrary extension compatibility, cross-family historical aggregation, permanent entry, new global store, structural version protocol or repair of the earlier built-in polling gap. No session migration, real subagent execution, production API probing, git commit, global config/session edits or dev build during this delegation.

Final details may be absent after a crash or replaced by extension hooks; partials have no durable replay. Producer fields and existing raw SSE/history payloads can still be large despite bounded added projections. Branch request guards are a necessary local change in a high-risk hook. Actual deployment may differ from the inspected `8e49a9d`/Pi 0.85.1 baseline. Tests and operational constraints are in implement.md.
