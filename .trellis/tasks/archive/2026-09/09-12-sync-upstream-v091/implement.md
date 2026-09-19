# Implementation plan — authorized integration, fresh validation recorded (pre-ff)

2026-09-13 update: the user has accepted the existing limitations and authorized M/D/I and personal ff/HMR. Fresh current-snapshot validation and exact manifest/tree are in `research/revalidation-report.md`: 1222 unit, tsc, two consecutive full Trellis matrices and this original-E2E run pass; the same 14 lint errors remain. Earlier original-E2E failures/environment limits are retained. At this document snapshot main business code is still L; M/D/I operations and actual ff outcome will be recorded externally, not anticipated here. Authorization-pending statements below describe the prior phase.

Execution status (2026-09-12): the isolated merge was independently reviewed and repaired in the
candidate. `merge/upstream-v091-20260912-200432` remains **uncommitted** (`HEAD=L`, `MERGE_HEAD=U`,
77 merge paths staged plus 15 reviewed follow-up paths unstaged, zero unresolved entries). No
commit/amend/push/publish/personal-ff/`next build` was performed. Implementation evidence is in
`research/implementation-report.md`; independent findings, fixes, commands, and the conditional gate
are in `research/check-report.md`. Remaining actions require explicit acceptance of inherited
lint/original-E2E limits and authorization for `M`/`D`/`I` and the final fast-forward.

## Gates and preflight

- [x] Obtain a subsequent explicit approval of the latest final planning summary. (Approved for
  *isolated merge + verification only*; commit/personal-ff/push/publish explicitly withheld.)
- [x] Reload before-dev and applicable specs. Re-read research P01–P14 and complete inventory. Check
  task JSONL paths exist. Set base_branch=personal in planning metadata; actual candidate
  branch/worktree remain null until creation. (branch/worktree subsequently created and recorded in
  task.json.)
- [x] Verify full fixed L/U/B hashes and ancestry; main branch personal@L, main diff/index/untracked
  inventory, running service cwd/PIDs/ports, existing worktrees, available Node/browser and disk. Any
  business-code or ref drift requires pause/research, not automatic incorporation. (Both target and
  source were clean; environment gaps recorded: Node 26 vs CI 22.19, Chromium 1234 vs 1243, disk ~98%.)
- [x] Back up/hash main task artifacts outside repository. After approval start task in main, leaving
  authoritative documents there. Record operational paths and ensure agents run implementation commands
  only with candidate cwd. (Task docs remained authoritative in main and were not destructively
  rewritten; candidate commands ran only from the candidate cwd.)

## Candidate and baseline (future actions)

- [x] Create unique sibling worktree branch `merge/upstream-v091-<unique>` from L. Never reuse/prune old
  /tmp/pi-web-0.9.2-verify. Baseline source is separate exact L (e.g. disposable git archive copy); no
  shared .next/node_modules. (Root `.pi-web-v091-iso-20260912-200432/`, candidate branch
  `merge/upstream-v091-20260912-200432`, separate baseline at detached L.)
- [x] Install private dependencies using `npm ci` from local retained lock, with isolated npm cache if
  needed. Record Node/npm version and native prepare-terminal result. No next build/release scripts.
  Prefer Node 22.19.0 matching upstream CI when available; L/candidate must use same version for
  comparison. If only Node 26 available, record CI-version gap. (Deviation: installed with
  `pnpm install --frozen-lockfile --store-dir <iso>/store` because the retained lock is consumed via
  pnpm here; node-pty prepare ignored as in main. Node 26.1.0 used on both sides — CI gap recorded.)
- [x] For pnpm consumers, separately verify `pnpm install --frozen-lockfile` in another disposable
  source/dependency directory if feasible; do not regenerate lock or mix package managers in the same
  node_modules. Block on unexplained install drift; unavailable secondary check is a documented gap.
  (pnpm was the install path; no lock was regenerated.)
- [x] Baseline lint/type/full Node/original E2E/Trellis E2E run under the isolation recipe below before
  relying on previous results. Preserve logs/artifacts by baseline hash. (`logs/lint-baseline.log`,
  `tsc-baseline.log`, `unit-baseline*.log`, `e2e-original-baseline*.log`, `e2e-subagents-*`.)
- [x] In candidate only, `git merge --no-ff --no-commit 8366762fa4b4ef3327f1b19e8ff7bf891a14c06c`;
  expected ten conflict paths. If materially different, stop and update research. (Exactly the ten
  expected conflicts; all resolved and `git add`ed.)

## Resolution order

- [x] Metadata: retain @xup3ng/pi-web@0.9.2, fork release metadata, both E2E commands and local locks;
  compare dependency trees to L/U.
- [x] Routes: compressed list/detail plus local targeted lookup/Trellis envelope; descendant
  abort/delete plus per-ID ask cleanup and fork behavior. Update runtime-route tests without losing
  persisted-ask coverage.
- [x] Hook/lifecycle: combine dependency arrays/options/tool-end branches; preserve resume
  action/active shell results, Trellis final rank/history watermark and scoped
  request/SSE/callback guards. Audit auto-merged navigation, all new syncLiveModel awaits, selected
  idle SSE/lease renewal, reload/recreated wrapper, reconnect replay. (Independent check fixed the
  StrictMode warm-stream demand ordering, stale model/branch navigation ownership, and current-view
  active-tool replay union; E2E no longer depends on visibility simulation to open the first stream.)
- [x] UI: accept Settings relocation, keep records-only/mixed/built-in/empty entry logic and owner
  publication; merge independent ChatInput helpers and tests, fix VM fixtures for coarse-pointer
  predicate; retain ask stream layout/images/Markdown/fonts/mobile settings.
- [x] Built-in/profile/cache: latest queued/running/result metadata, resumed child same session,
  worktree cleanup/family grouping, unknown profile frontmatter/extension selectors. Independent check
  added hidden-field preservation, queued/running abort settlement and DELETE failure semantics, plus
  one real `extensionRuntime.start()` path with an actual disposable git worktree.
- [x] Review every P01–P14 row and every local net path; mark preservation/supersession plus validation
  evidence. Confirm deleted scanner files and reverted traffic-light UI are not resurrected. No change
  to .pi Trellis producer or old task history. (Matrix in the implementation report; all rows
  preserved/not-resurrected.)
- [x] Where the merged behavior changes existing specification (notably replay on reconnect), update the
  real owning spec narrowly and losslessly. Historical font-offset text is superseded by current code;
  do not use it to reverse the earlier 8e49a9d fix. (`trellis-subagent-records.md` amended.)

## Validation commands and isolation recipe

Run only inside baseline/candidate disposable source. Create a fresh absolute `RUN_ROOT`, directories
`home`, `xdg`, `agent`, and explicitly prefix each Node/test process with `HOME=<run>/home
XDG_CONFIG_HOME=<run>/xdg PI_CODING_AGENT_DIR=<run>/agent`. Remove credential/provider env from the
child environment; don't copy real settings/auth/sessions. Paths such as ask persistence/cache are
computed at import time. For browser runners, their own agentDir takes precedence; still use isolated
HOME and explicit PLAYWRIGHT browser path/cache. Use independent temporary git fixture projects for
attachments/profiles/worktree tests (a linked candidate cwd resolves to the real main project root).

Commands, logging each exit code independently (do not let lint failure skip E2E):

```sh
npm test
node_modules/.bin/tsc --noEmit --incremental false
npm run lint
E2E_SERVER_MODE=dev node e2e/run.mjs
npm run test:e2e:subagents
git diff --check
git diff --cached --check
git ls-files -u
```

- [x] Run focused adapter/history/persistence/hook/component tests and related
  normalize/wire/connection/stream/family/toolbar/routes/ask/cache/image suites. Use current files
  discovered by inventory, not deleted scanner tests. Then full Node tests; historical 1164 is
  reference, new upstream tests change expected total. No skips/failures silently hidden by count
  changes. (Implementation: candidate 1214/1214, baseline 1164/1164. Final independent check after
  added regressions: candidate 1222/1222.)
- [x] Exercise all upstream new suites: queue/runtime/isolation/profile/subagents/prompt, lease/event
  stream/RPC shutdown, JSON gzip, provider usage, plugins, initial navigation, model scope/switching,
  push/SW, ChatInput and Settings. Run terminal fixture smoke only against isolated child server/data;
  never actual user's shell session. (Covered by the full unit run; no real terminal/user data touched.)
- [x] Compare lint findings by rule/file/enclosing callback/message; historical distribution
  7+5+2+2=16 is not allowance for any 16 errors. Record removals/new findings separately. Same
  dependency/browser/Node settings for baseline and candidate. (Implementation candidate was 17 vs
  baseline 16. Independent check removed all three candidate hook findings without changing runtime
  ref semantics; final candidate is 14: ChatInput 7 + ChatMinimap 5 + SessionSidebar 2. Focused lint
  for every checker-touched production file passes.)
- [x] Run **original** node e2e/run.mjs separately from Trellis runner, because package test:e2e uses &&.
  Compare the old chat-appearance.mjs:88 failure with baseline; upstream changed Settings, so diagnose
  any new location/symptom. Record phases not reached after early failure. Run masked required phases
  independently with an isolated harness if needed, retaining the original full-suite failure honestly.
  (Original suite remains incomplete on both sides in the history/minimap dev-timing family; no full
  pass is claimed. The stale language test was corrected to scroll each control, and the same targeted
  appearance flow passes on candidate and L. Trellis runs separately and passes.)
- [x] Prefer compatible pinned Playwright Chromium; otherwise use discovered absolute
  chromium_headless_shell-1234 executable via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH consistently for both
  runs and report revision mismatch. No unrequested browser installation into user's shared cache.
  (Used rev 1234 on both sides; 1243 expected.)

### Targeted browser matrix (1280×800 and 390×844)

- [x] Built-in-only, Trellis-only, mixed, empty; accurate count excluding main; mobile More-controls
  entry; keyboard expand; escaped bounded details, Last reported/stale/truncated labels; no run-ID
  session fetch, navigation, steer/continue/fork/stop. (Trellis E2E 1280px + 390px phases pass.)
- [x] >50-entry durable restore, explicit root/invalid leaf, pagination, fork scope; delayed A→B→A
  success/404/finally and X→Y→X; request watermark vs newer final; old hook cleanup after new
  publication.
- [x] Selected idle SSE opens/renews/releases; lease expiry/renewed=0 reconnect and tab visibility;
  partial replay before/after history with old tool calls, historical branch during running parent,
  reconnect stale → end → canonical final; no head jump on settlement. Timers may be controlled in
  fixture/unit tests rather than waiting real 90 seconds. (A natural StrictMode stream open is now a
  prerequisite; `renewed:0` + `visibilitychange` is exercised separately. Active replay proves the
  current-view union and bounded pre-snapshot ownership buffer without cross-branch relaxation.)
- [x] Open active session mid-stream preserves text/thinking and bash/powershell output; Edit-from-here
  success/cancel/late response and first-message fork keep correct branch/model and copied Trellis
  scope. (Covered by original-E2E phases and unit suites.)
- [x] Delete parent with queued/live/persisted descendants in fixture project, ensure selected record
  clears, other session/fork survives, ask persistence cleared only for deleted IDs, list/project cache
  updates. (Tests now cover ordinary fork + fork-child survival, transient queued/running settlement,
  per-ID asks, 500/no-unlink cleanup failure and retry, and actual isolated worktree removal.)
- [x] Built-in profile roundtrip preserves unknown frontmatter, extension selectors, color, isolation
  and persistence flags across editor saves and immediate enabled toggles; queue/resume/worktree
  operations remain limited to disposable repos. Provider quota success/empty/auth-unavailable/error
  UI is mocked, never real credentials; plugin visibility and extension Markdown remain accessible.
- [x] ask_user open/supersede/submit/cancel/stale/supplement, same askId rehydrate after fixture wrapper
  loss and two browser contexts polling; card stays in chat stream and touch controls usable.
- [ ] Image model-capability routing, paste/drop and model switch with pending preview, old/new mentions
  and reload remain Node/fixture covered; physical picker/drop interaction is still not browser- or
  device-verified.
- [x] File picker height/wrap and duplicate built-in command lock retain unit coverage; 744x1133
  Chromium with `hasTouch` asserts `(pointer: coarse)` and verifies Enter newline. IME remains covered
  by event/unit behavior rather than a physical composition device.
- [x] Font/absolute size + old preference migration, table horizontal scroll, light/dark code warnings;
  Settings theme/language/extension/ask controls at short desktop/mobile height; viewport
  focus/keyboard simulation. Chromium does not prove physical iOS/WKWebView keyboard or push delivery;
  record real-device validation as deferred, not passed. (**Deferred** as stated.)
- [x] Capture screenshots/traces/console and page errors/API 5xx. Push service-worker/background
  handling mocked; no live push subscription, provider quota request, model run or auth mutation.

## Check, integration authorization, and final ff

- [x] Independent trellis-check using real check.jsonl context, full staged/unstaged/untracked review
  and preservation matrix. `task.py validate <absolute-main-task-dir>` passes in main; no generated
  Next AGENTS block/build/test output is staged, and no next build ran.
- [x] Write main-owned `research/check-report.md` with exact code tree/hash, versions, commands/exit
  codes, new vs baseline failures and gaps. All discovered in-scope findings were fixed; inherited
  lint/original-E2E limitations still require explicit acceptance before integration.
- [ ] Present report plus HMR warning and request integration/commit authorization. No commit/ff just
  because planning was approved.
- [ ] Follow design's late M/D/I topology: candidate code merge M after validation; task-only D on
  personal after checking main unchanged at L; merge D into candidate I; compare I business tree to
  validated M, final checks and clean state. Do not blindly copy/stage competing task copies or
  stash -u main documents.
- [ ] Immediately before ff: personal exactly D, main index/worktree clean, no untracked collision,
  candidate I unchanged/clean, U and D ancestors of I, recovery refs retained; otherwise stop.
  `git merge --ff-only <candidate>` in main only during user-approved HMR window. No force-update or
  hard reset.
- [ ] Report final refs, validation limits, HMR observation and retained rollback point. Do not restart
  current service, push, publish or archive either old task. Any post-ff issue needs a separately
  reviewed forward fix/rollback; do not auto-reset main.

## Planning stop

Independent review artifacts are ready for an approval decision, not execution. Remaining decisions:
accept the recorded inherited baseline/version/device limitations, then explicitly authorize the
`M`/`D`/`I` commits and final fast-forward/HMR window. Unexpected ref, worktree, dependency, runtime,
or behavior drift still stops integration rather than expanding scope automatically.
