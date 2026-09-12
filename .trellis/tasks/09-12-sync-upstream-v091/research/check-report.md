# Independent check report - upstream v0.9.1 isolated merge

Date: 2026-09-12
Role: `trellis-check` (no nested agent dispatched)

## Subsequent authorization and fresh evidence (2026-09-13)

The user has since explicitly accepted the recorded limitations and authorized M/D/I plus personal ff/HMR. A fresh snapshot-bound rerun passed 1222 unit tests, tsc, two consecutive full Trellis matrices, and (this time) the entire original E2E runner. Lint remains the same 14 accepted errors. Historical original-E2E failures below are not erased or reclassified; baseline L was not rerun. See [revalidation-report.md](./revalidation-report.md) for the fresh manifest/tree, exact commands and truthful pre-D/pre-ff state. Actual integration outcome is recorded only in the external operation report. The following verdict describes the earlier independent check, not current authorization.

## Verdict

**Code-review gate: PASS after fixes. Integration gate: CLOSED pending explicit user acceptance and authorization.**

No known merge-specific correctness issue remains after the fixes listed below. The candidate is ready to be presented for integration approval, but it is deliberately still an uncommitted merge. The original all-in-one browser suite is not green on either side in the isolated dev environment, and full ESLint still reports inherited React Compiler findings. Those limitations must be accepted explicitly before any commit or fast-forward. This report does not authorize `M`/`D`/`I`, a personal fast-forward, push, publish, service restart, or `next build`.

## Reviewed state and boundaries

- Main checkout: `/home/xupeng/dev/personal/forked/agegr-pi-web`, `personal` at exact `L=fdb21ff968b7d99e38aae0a9901f28206d3e5258`; only `.trellis/tasks/09-12-sync-upstream-v091/` is untracked. No main business code, index, dependency tree, `.next`, service, or real user data was changed.
- Candidate: `/home/xupeng/dev/personal/forked/.pi-web-v091-iso-20260912-200432/candidate`, branch `merge/upstream-v091-20260912-200432`, `HEAD=L`, `MERGE_HEAD=U=8366762fa4b4ef3327f1b19e8ff7bf891a14c06c`, no unresolved index entries. It remains an ordinary, uncommitted merge; therefore U is represented by `MERGE_HEAD` and is not yet an ancestor of `HEAD`.
- Baseline: separate detached source at exact L. Candidate and baseline have separate source, `node_modules`, `.next`, and test results. Commands used isolated HOME/XDG/agent/store roots, scrubbed provider credentials, disposable fixture projects, and dynamic loopback ports.
- Independent inventory recomputation: B->L 311 paths, B->U 79 paths, 27 overlapping paths, 10 content-conflict files (18 conflict hunks), 77 staged merge paths, zero unresolved paths. Final checker fixes plus the three implementation follow-ups are 15 unstaged paths layered over the staged merge.
- Fixed package inputs remain `@xup3ng/pi-web@0.9.2`, SDK `0.85.1`, matching package-lock root metadata, and retained `pnpm-lock.yaml`. Deleted scanner files, the old chat-font controller, and the reverted Electron traffic-light safe area remain absent.

Evidence: `<iso>/logs/check-git-boundaries-final.log`, `<iso>/logs/check-retention-smoke.log`.

## Findings fixed

1. **High - parent DELETE could report success before child finalization/worktree cleanup.** `abort()` returned immediately for queued children and after only `inner.abort()` for running/resumed children. The route then shut down and unlinked sessions. It now awaits the stored completion, handles the queued-to-running race, propagates retained-worktree cleanup errors, returns 500 before unlink/ask deletion on failure, and rejects a later retry while the retained worktree still exists. Tests cover queued and resumed running settlement, transient descendants, per-ID ask cleanup, ordinary-fork survival, a 500/no-unlink failure, and a real queued subagent created through `extensionRuntime.start()` with an actual disposable git worktree that is observed to disappear.
2. **High - stale branch context could mutate the server leaf after the UI moved on.** `handleLeafChange()` sent `navigate_tree` after any resolved context request, including a rejected stale X/Y response. It now sends only when `loadContext()` returned an accepted context and session/leaf ownership still match. Direct navigation also captures the Trellis view generation before awaiting the command. Browser coverage now observes the actual command stream for delayed Y after X and rejects a stale navigation.
3. **Medium - profile edit/toggle could erase runtime fields hidden from the form.** `editableProfile()` and the profile PATCH route dropped `extensionTools`, `color`, `isolation`, and `persistSession`. Both paths now carry them through; `promptMode`, model/thinking/max-turns and existing unmanaged frontmatter preservation remain intact. Route tests prove the extension selector and hidden fields survive a toggle and serialize back to frontmatter.
4. **Medium - the Trellis E2E masked a real StrictMode selected-session stream bug.** The warm-session effect's second StrictMode setup ran while the later mount cleanup still left `sessionHookMountedRef=false`, so `maintain()` declined to reopen the stream. Product code now restores mounted demand before `maintain()`. The browser test first requires a naturally open stream, then separately exercises the mocked `renewed:0` visibility/lease recovery path.
5. **Medium - reconnect replay could discard current-view live tool ownership.** The `connected` handler reset allowed calls to durable history only, so an active tool known from a live assistant delta could have its server replay rejected. It now retains the union of durable history and calls already authorized by the current view. Because the server replays active tool updates before its assistant snapshot, unknown calls are held in a 32-event bounded buffer and released only after that snapshot establishes session/leaf/view ownership; session, branch, or settlement changes drop the buffer. Browser coverage proves both an already-authorized ephemeral replay and an update buffered before snapshot ownership, without relaxing cross-branch ownership.
6. **Medium - delayed live-model reconciliation could cross a session/run boundary.** Prompt settlement, bash recovery, and `agent_end` model fetches now verify mounted/session/run or recovery ownership before applying state. The direct upstream `chatInputRef.current` pattern was also moved behind a small event-time helper, eliminating all three `useAgentSession.ts` React Compiler errors without changing ref semantics.
7. **Test-quality gaps - lifecycle, 404 and Settings assertions were masking or manufacturing failures.** The intentional B-session 404 window now closes on the exact failed response rather than two arbitrary 300 ms waits. The Settings language test scrolls each control into view and hit-tests each option instead of forcing a now-invalid bottom position. The Trellis browser matrix now includes a real 744x1133 `hasTouch` context, asserts coarse pointer, and proves Enter inserts a newline.

Changed production files from this check:

- `app/api/sessions/[id]/route.ts`
- `app/api/subagents/profiles/route.ts`
- `components/AgentsConfig.tsx`
- `hooks/useAgentSession.ts`
- `lib/subagent-runtime.ts`

Changed test/harness files from this check:

- `app/api/sessions/runtime-route.test.mjs`
- `app/api/subagents/profiles/route.test.mjs`
- `components/AgentsConfig.test.mjs`
- `e2e/chat-appearance.mjs`
- `e2e/subagents.mjs`
- `hooks/useAgentSession.test.mjs`
- `hooks/useAgentSession.trellis.test.mjs`
- `lib/subagent-runtime.test.mjs`

The implementation's three unstaged follow-ups (`.trellis/spec/frontend/trellis-subagent-records.md`, `app/api/sessions/detail-route.test.mjs`, `e2e/subagents.mjs`) remain present; the E2E file now also contains checker coverage. Nothing was committed or staged by the checker.

## P01-P14 preservation review

| Row | Independent conclusion |
| --- | --- |
| P01 | PASS - fork package identity/version, release scripts/workflows, executable metadata, package-lock and pnpm lock remain; no release command ran. |
| P02 | PASS - Oxanium/WenKai/Cascadia paths and local layout/global styling remain; no `next/font` download path was introduced. |
| P03 | PASS - absolute chat appearance and offset migration logic remains. Corrected appearance harness passes against both candidate and L. |
| P04 | PASS - table overflow and Mermaid/code style fixes remain; related Node and initial browser phases pass. |
| P05 | PASS - viewport/touch predicates remain; 744px coarse-pointer Chromium verifies Enter newline, while 390px and 1280px remain covered. |
| P06 | PASS - Settings layout and relocated language/extension/ask controls remain reachable at 1280x600 and 320x568 with per-control hit testing. |
| P07 | PASS - attachment/image routing, pending preview/history helpers and storage roots remain; full Node coverage passes. Physical picker/drag behavior remains an environment limitation. |
| P08 | PASS - extension visibility, plugin listing, widget/status filtering and TUI powerline behavior remain; upstream plugin changes coexist in the full Node suite. |
| P09 | PASS - ask validation/persistence/rehydration paths remain. Descendant DELETE clears asks for deleted IDs only; ordinary fork/fork-child asks and files survive. |
| P10 | PASS - targeted `?sessionId=` detail/list tests still prohibit the full catalogue path; incremental caches remain; deleted scanners remain absent. DELETE's forced relationship scan is intentional and separate from directed reads. |
| P11 | PASS - sidebar request ownership, row refresh, virtualization and family aggregation remain; full Node coverage and the initial original-E2E pagination phase pass. |
| P12 | PASS - bounded history/envelope, exact tool+kind gate, tuple identity, evidence rank, watermark/request/owner cleanup and read-only display remain. Gzip detail now explicitly asserts its Trellis envelope. A/B/A success+404, X/Y/X, stale navigate rejection, active replay, final overlay and historical settlement pass twice across the browser matrix. |
| P13 | PASS - `.agents`, `.pi`, Trellis workflow/spec/task history and additive AGENTS changes remain. No Trellis upgrade, producer protocol change, or old-task archive occurred. |
| P14 | PASS - no deleted scanner, old font controller, or reverted Electron traffic-light safe area was resurrected. |

## Verification

Tool versions: Node `v26.1.0`, npm `11.13.0`, Playwright Chromium cache revision 1234 / Chrome for Testing `151.0.7922.34`. CI expects Node 22.19.0 and Playwright revision 1243, so those version gaps remain explicit.

| Check | Result |
| --- | --- |
| `node_modules/.bin/tsc --noEmit --incremental false` | PASS, exit 0 (`check-tsc-r6.log`). |
| `npm test` | PASS, 1222 tests / 10 suites / 0 failures (`check-unit-full-r5.log`). |
| ESLint on all checker-touched production TS/TSX files | PASS, exit 0 (`check-focused-eslint-r6.log`). |
| `npm run lint` | Expected inherited nonzero: 14 `react-hooks/preserve-manual-memoization` errors - ChatInput 7, ChatMinimap 5, SessionSidebar 2 (`check-lint-full-r3.log`). Baseline L has 16 (same 14 plus two in `useAgentSession`); candidate introduces no new lint finding and checker removed all three hook findings present immediately after the merge. |
| Focused deletion/runtime/profile/hook/detail suites | PASS, including real worktree cleanup and 500/no-unlink/no-survivor-rewrite behavior (`check-runtime-route-r7.log`, `check-subagent-runtime-r3.log`, earlier focused logs). |
| Trellis E2E, dev server | PASS twice after final replay-buffer behavior changes (`check-e2e-subagents-r10.log`, `check-e2e-subagents-r11.log`): 1280x800, 744x1133 touch/coarse pointer, 390x844; no browser/page errors. |
| Corrected chat-appearance browser harness | PASS on candidate and baseline L (`check-e2e-chat-appearance-only-r1.log`, `check-e2e-chat-appearance-baseline-corrected.log`). This proves the old language failure was a stale test scroll assumption, not unreachable controls. |
| Original `node e2e/run.mjs` | NOT FULLY GREEN. Two candidate reruns pass the bounded-history/API phase then time out waiting for minimap node 0; an independent L rerun fails in the same history/minimap timing family with an incomplete older page. Existing implementation logs also show both sides alternating among reading-offset/minimap timing and the old stale language hit-test. No full-suite pass is claimed. |
| `git diff --check` / unresolved merge entries | PASS / zero unresolved. |

No `next build`, production `next start`, package install/regeneration, release, commit, push, fast-forward, service restart, or real credential/provider/model request was run during this check.

## Residual risks and gate conditions

- The original all-in-one dev E2E remains timing-sensitive and incomplete on both L and the candidate. The corrected appearance phase and Trellis-specific behavior are independently green, but a production-start path was not run because `next build` is prohibited.
- Real iOS/WKWebView keyboard behavior, physical paste/drop/file picker behavior, live push delivery, provider quota/auth, and active HMR replacement of already-existing `globalThis` wrappers remain environment-limited.
- Node and Playwright revisions differ from CI as recorded above.
- U cannot become an ancestor of candidate `HEAD` until an authorized merge commit is created. Main task documents are still untracked until an authorized document commit.

**Gate conclusion:** no unresolved check finding blocks requesting integration approval. Integration itself remains blocked until the user explicitly (1) accepts the inherited full-lint/original-E2E limitations and version/device gaps, and (2) authorizes the documented M/D/I commit topology and final `personal` fast-forward/HMR window.
