# Implementation plan (implemented and independently checked)

## Documentation closeout

Status: **implementation and independent check complete; awaiting user acceptance/submission** (`review`, not completed/archived). The single maintained contract owner is [the frontend Trellis snapshot spec](../../spec/frontend/trellis-subagent-records.md), linked from the frontend index after checking records/history/hook/API/UI implementation. This pass changes only specs/task documents, runs no expensive tests and performs no archive, finish or commit. Prior verification remains exactly as recorded below and in `research/check-report.md`: 16 lint errors also fail on HEAD; original full E2E fails the same assertion on HEAD and the change; task-specific desktop/mobile E2E passes. No all-green quality-gate claim.

## Gate and boundary

The user approved the final planning summary in the main session ("好的，继续"), closing the planning gate. Implementation was performed directly by the `trellis-implement` sub-agent; no `task.py start`, git commit, global config change or real-session mutation was performed. `research/findings.md` section 9 records the shipped files, commands and results.

Smallest behavior change: add structured Trellis execution snapshot discovery and read-only inspection alongside the existing built-in family. Needed cross-layer work is decoder -> bounded branch history -> scoped hook bridge -> panel. The 50-entry history default and same-session branch-request races make a toolbar-only patch insufficient.

No Trellis/registry/list invalidation/version/schema migration work. No global state/config edits, real user session fixtures or model calls. Shared hook request guards are narrowly justified by branch isolation; unrelated prompt, sound, draft, queue, streaming and session-list behavior is untouched.

## Ordered checklist

- [x] **0. Approval and baseline:** approval recorded; no conflicting changes; spec/research manifests read; existing 60-test baseline, typecheck and lint (16 pre-existing React-Compiler errors) recorded without `next build`.
- [x] **1. Shared decoder and reducer:** `lib/trellis-subagent-records.ts` + 40 tests: tuple identity, bounded unknown decoding, mode/status compatibility, provenance, snapshot presentation, pure ownership/merge transitions. Limits tested before UI integration.
- [x] **2. History projection:** `lib/trellis-subagent-history.ts` + 10 tests: existing entries, one ID map, requested ancestor path, cycle protection, retention/text budgets. Additive envelope in detail and non-pagination context GET; `SessionData.trellisSubagentRecords` typed from the adapter. Explicit default/root/invalid leaves. 50-entry chat pagination and entryIds alignment preserved.
- [x] **3. Lifecycle integration:** separate record reducer state and scoped callback; update/end/message details consumed without changing generic `agentPhase`; `loadSession`/`loadContext` success/error/404/finally guarded by mounted scope, leaf intent and request sequence; page-up does not touch records; branch reset before await; event watermark prevents slow-load erasure of newer finals.
- [x] **4. Shell bridge:** typed callback through `ChatWindow`; `AppShell` accepts only matching parent + current view owner, clears stale state on selection/rekey, uses one combined count/visibility predicate for desktop/mobile/auto-close. `sessionCatalog`, `getSessionFamily` and running IDs unchanged.
- [x] **5. Panel:** `AgentSessionPanel` composed with a separate read-only `TrellisSubagentRecords`; built-in listbox intact; source heading, qualified reported status, local expandable details, snapshot/truncation/stale labels, unavailable values, bounded overflow; en/zh-CN/zh-TW strings.
- [x] **6. Behavioral tests:** 68 focused feature tests (reducer/runtime/DOM/persistence) plus extended wire/route/toolbar/hook wiring tests. Source assertions supplement, never replace, reducer, temp-dir persistence and browser behavior assertions.
- [x] **7. Isolated browser verification:** `e2e/subagents.mjs` passes at 1280x800 and 390x844 in a disposable source copy with an isolated `.next` and temporary `PI_CODING_AGENT_DIR`. It covers built-in-only, Trellis-only, mixed, empty, >50-entry restore, A-B-A success/404, X-Y-X, reconnect/final reconciliation, historical settlement and read-only behavior.
- [x] **8. Review:** independent `trellis-check` reviewed the full tracked/untracked diff, fixed decoder/history/reducer/hook/AppShell issues directly, added behavioral coverage, and left no known in-scope finding. No commit was performed.

## Independent check disposition

- Full scope review and fixes are recorded in `research/check-report.md`.
- Focused/compatibility tests pass 150/150; the isolated full unit suite passes 1164/1164; non-incremental typecheck passes.
- Lint still reports the same 16 React Compiler memoization errors as isolated `HEAD`; no new lint finding is introduced.
- The task-specific browser suite passes on desktop/mobile. The repository's pre-existing `e2e/run.mjs` reaches the chat-appearance check and fails the same short-settings language reachability assertion on both the change and isolated `HEAD` with the locally available Chromium revision; this is documented as a baseline/environment gap, not hidden as a pass.

## Test matrix and implementation mode

| Layer / proposed test | Required behavioral assertions | AC |
|---|---|---|
| `lib/trellis-subagent-records.test.mjs` (node:test + jiti, fsCache:false) | all three modes; failed/cancelled/unknown statuses; exact tool/kind gate; same run ID in distinct parent/call; duplicate IDs; missing optional fields; numeric bounds; text/tools/runs/total budgets; mutation-free decode; reported running not live | 4,7,8 |
| Pure reducer tests in the same file | update/end/message/history dedup; end before message; final without any partial; late partial cannot regress terminal; final details missing after a partial; concurrent tools; stale request vs newly arrived final; old owner cleanup; branch ownership | 5,6 |
| `lib/trellis-subagent-history.test.mjs` | >50 entries; only requested ancestors; chain failed before later steps; branch X/Y reuse IDs; empty/unknown/cyclic leaf; fork re-scoping; newest capped retention and omission flags | 5,6,7 |
| `lib/session-reader.test.mjs` / `lib/normalize.test.mjs` | toolResult.details survives normalize, deferThinking/deferMedia and aligned entryIds. Use synthetic fixtures and isolated SessionManager.create(temp) -> append valid assistant+tool result -> reopen -> buildSessionContext. No SessionManager.create(default cwd/sessionDir) | 5,9 |
| Detail/context route tests with mock runtime or temp agent dir | additive envelope; default/effective/root leaf; page-up does not replace/recompute full record scope; no listAllSessions scan, registry creation or cache invalidation; <=100 records/budget while context remains paginated | 5,6,9 |
| `lib/agent-event-wire/stream/connection.test.mjs` | partial details and final result survive JSON; tool end before message; stale EventSource ignored; reconnect publishes no nonexistent Trellis replay; generic event traffic unchanged | 5,6,9 |
| Hook integration through browser + reducer; existing `hooks/useAgentSession.test.mjs` as wiring guard only | A->B->A; X->Y->X with deferred responses; stale 404/finally; pending page-up; disconnected partial then final; mount/unmount + ID promotion; no old rows or state overwrite; generic progress intact | 6,9 |
| Component DOM/browser assertions + `AgentSessionPanel.test.mjs` existing contracts | built-in main first/navigation/status/order/search; source grouping/count; Trellis-only entry without catalog; empty closes; read-only expand/collapse; keyboard/aria/mobile overflow; no fake session command or session URL request | 4,8,9 |

For hook lifecycle tests, prefer the existing Playwright runner's route interception and synthetic session fixtures over adding a new React test dependency. It can delay detail/context responses and provide synthetic EventSource payloads without model credentials. Pure reducer tests must execute production reducers; do not duplicate predicates in test-only logic and call that integration coverage. Browser network assertions should distinguish legitimate parent history reads from forbidden record-as-session requests.

## Original implementation-agent verification

Targeted existing baseline (re-run: 60/60):

```sh
JITI_FS_CACHE=false node --experimental-strip-types --test lib/normalize.test.mjs lib/tool-execution-progress.test.mjs lib/agent-event-wire.test.mjs lib/agent-event-stream.test.mjs lib/agent-event-connection.test.mjs lib/session-family.test.mjs components/AgentSessionPanel.test.mjs hooks/useAgentSession.test.mjs
```

Feature tests (55/55):

```sh
JITI_FS_CACHE=false node --experimental-strip-types --test lib/trellis-subagent-records.test.mjs lib/trellis-subagent-history.test.mjs lib/trellis-subagent-persistence.test.mjs components/TrellisSubagentRecords.test.mjs hooks/useAgentSession.trellis.test.mjs
```

Full isolated suite (1151/1151, `PI_CODING_AGENT_DIR=$(mktemp -d)`), typecheck and lint:

```sh
TMP_AGENT=$(mktemp -d) && JITI_FS_CACHE=false PI_CODING_AGENT_DIR="$TMP_AGENT" node --experimental-strip-types --test "app/**/*.test.mjs" "components/**/*.test.mjs" "hooks/**/*.test.mjs" "lib/**/*.test.mjs" "public/**/*.test.mjs"
node_modules/.bin/tsc --noEmit --incremental false
npm run lint
```

Result: typecheck clean; lint has 16 pre-existing `react-hooks/preserve-manual-memoization` errors (none in the new files). Browser gate not run (see below).

Test setup must isolate all persistence behind mkdtemp/PI_CODING_AGENT_DIR and remove fixtures. Audit tests before broad execution; do not assume every existing test is side-effect-free. `--incremental false` prevents typecheck from rewriting tsbuildinfo.

Browser gate:

```sh
npm run test:e2e
```

**Not run by the original implementation delegation.** The independent check subsequently added and passed the task-specific `e2e/subagents.mjs` in an idle disposable source copy. The combined repository gate still stops in the pre-existing `e2e/run.mjs` chat-appearance assertion reproduced on isolated `HEAD`; see `research/check-report.md`.

Planning-document checks (safe now):

```sh
python3 .trellis/scripts/task.py validate .trellis/tasks/09-11-subagents-entry-visibility
 git diff --check
 git status --short
```

Because the task directory is currently untracked, also validate JSONL paths and trailing whitespace directly; git diff --check alone does not inspect untracked files.

## Risk, rollback and release checks

- Highest-risk file: `hooks/useAgentSession.ts` (branch/request/reconcile ownership and final-event timing). Prove current generic stream/draft/queue/notification behaviors remain through existing tests.
- API change is additive bounded projection, no version/persistence migration. Default 50-entry context and deferred media must remain unchanged; bound the extra projection and avoid pagination repeated work.
- No producer heartbeat or durable partial replay exists. Qualified snapshot labels are the acceptance behavior; live process monitoring would require a new proposal.
- History records before the newest 100 are omitted explicitly. Changing to unlimited/family-wide browsing or adding an index is a new scope decision.
- Raw incoming/history details remain potentially large; added adapter limits do not solve original transport payload size. Document any measured regressions and stop for scope review rather than silently modifying Trellis.
- Rollback is removal of derived projection and UI bridge; no real session/configuration repair should be needed. Keep unrelated changes intact.
- Previously proven built-in list sampling gap remains deferred; do not claim this adapter fixes all visibility instability.

## Convergence and current disposition

Goal, scope, source distinction, status honesty, history recovery, bounds, ownership, tests and excluded structural-version work are explicit and mapped to AC1–AC9. The final plan was approved, implemented and independently checked; findings section 9 retains the implementation-agent record and `research/check-report.md` records the final review, fixes, verification and residual baseline gaps. No commit, `next build` or Trellis/session/global-config change was performed.
