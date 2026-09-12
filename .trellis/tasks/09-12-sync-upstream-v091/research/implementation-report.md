# Implementation report — sync upstream v0.9.1 into personal fork

> This is the implementation-time snapshot. The later independent review fixed additional issues and
> supersedes the final test counts and gate in `research/check-report.md`; this file remains the record
> of the initial merge execution.

Status: **isolated merge + verification complete; candidate left uncommitted. Awaiting integration/commit authorization.**
Scope executed under the explicit approval for *isolated merge + verification only*. No commit, no
amend, no push, no personal fast-forward, no publish, no `next build` were performed. Main checkout
business code remains at `L`.

## 1. Fixed refs and ancestry

| Role | Ref |
| --- | --- |
| L (personal HEAD / merge base of candidate) | `fdb21ff968b7d99e38aae0a9901f28206d3e5258` |
| U (upstream v0.9.1) | `8366762fa4b4ef3327f1b19e8ff7bf891a14c06c` |
| B (merge base) | `a26cc68df9227cb74253bddd7c59624aa475e61f` |

- Ancestry verified before merge: `B` is an ancestor of both `L` and `U`; `L` is the `personal` tip;
  main checkout was clean at `L` (only the untracked task directory).
- No later commits were incorporated; targets are frozen to the hashes above.

## 2. Isolated workspace

- Isolation root (distinct from the real checkout):
  `/home/xupeng/dev/personal/forked/.pi-web-v091-iso-20260912-200432/`
  with `home/`, `xdg/`, `agent/`, `logs/`, `artifacts/`, `store/`.
- Candidate worktree: `<iso>/candidate`, branch `merge/upstream-v091-20260912-200432`, created from `L`.
- Baseline worktree: `<iso>/baseline`, detached at `L`.
- Dependencies installed per worktree with `pnpm install --frozen-lockfile --store-dir <iso>/store`
  (private store; the main checkout's `node_modules`/store was never written). Native prepare
  (`node-pty`) build scripts ignored, identical to the main checkout's prior install.
- Every test/browser process ran with an explicit isolated env:
  `HOME=<iso>/home XDG_CONFIG_HOME=<iso>/xdg XDG_DATA_HOME=<iso>/xdg/data
  XDG_CACHE_HOME=<iso>/xdg/cache PI_CODING_AGENT_DIR=<iso>/agent`, cleared credentials, dynamic
  loopback ports. No existing dev/installed service, global config, real sessions or user data was
  touched. The main checkout received **task-document changes only**.

## 3. Candidate state (as left)

- `HEAD = L` (`fdb21ff9…`), `MERGE_HEAD = U` (`8366762f…`), branch
  `merge/upstream-v091-20260912-200432`.
- Merge is **uncommitted**: `git merge --no-ff --no-commit U` with all ten conflicts resolved and
  `git add`ed (77 staged paths). No conflict markers remain anywhere in the tree.
- Three intentional unstaged working-tree changes on top of the staged merge (§5).
- App/business code equals the pure merge result: no local behavioural invention beyond the merge.

## 4. Conflict resolution log (10 files, no blind ours/theirs)

| File | Resolution |
| --- | --- |
| `package.json` | ours: keep `@xup3ng/pi-web@0.9.2`, SDK `0.85.1`, local scripts/locks. Upstream changed only name/version (line divergence). |
| `package-lock.json` | ours: upstream only changed root metadata. |
| `app/api/sessions/[id]/route.ts` | union: kept `forgetPersistedAsk` **and** upstream `abortSubagent,getRpcSession,getRpcSessionInfos`; kept `projectTrellisSubagentHistory` **and** `jsonResponse`; wrapped GET body with `jsonResponse(req,{…trellisSubagentRecords…})`; DELETE loops `for (const deletedId of deletedSessionIds) forgetPersistedAsk(deletedId)` plus `invalidateSessionPathCache(id)`. |
| `app/api/sessions/route.ts` | kept local project-branching lookup; converted the response to `jsonResponse(req, …)`. |
| `app/api/sessions/runtime-route.test.mjs` | union: kept local persisted-ask test and upstream's renamed descendant-delete test. |
| `components/AppShell.tsx` | dropped upstream-removed language/theme top panels; kept local `activeTopPanel==="agents" && effectiveAgentFamily` → `AgentSessionPanel` + `TrellisSubagentRecords`. |
| `components/ChatInput.tsx` | combined model helpers (`MODEL_OPTION_COLLATOR`, `compareModelOptions`, `filterModelOptions`, `modelSupportsImageInput`) with upstream `subscribeUpwardMenuMaxHeight`. |
| `components/ChatInput.test.mjs` | union of imports (added `cycleListIndex`); merged image test with upstream new tests; removed the duplicated button-tooltip test that `L` already carried later. |
| `components/SettingsPanel.test.mjs` | kept both the local extension-UI test and upstream's language test. |
| `hooks/useAgentSession.ts` | combined options/deps; dropped unused `sessionRunning` while keeping `onSubagentRecordsChange`; loadSession deps `[resetTrellisScope, applyTrellisHistory, setToolPresetState, syncLiveModel]`; `tool_execution_end` combines Trellis ingest with active-tool-result clearing; `handleAgentEvent` deps add `syncLiveModel` only. |

All 27 overlap paths were reviewed in both directions (candidate vs `L` and candidate vs `U`) so that
both local and upstream contributions survive auto-merge, not just the ten textual conflicts.

## 5. Post-merge local adjustments (3 unstaged files)

| File | Change | Reason |
| --- | --- | --- |
| `.trellis/spec/frontend/trellis-subagent-records.md` | reconnect replay wording | merged behaviour replays live tool calls; spec amended narrowly |
| `app/api/sessions/detail-route.test.mjs` | scoped the "no full scan" assertion to the GET body | upstream DELETE legitimately calls `listAllSessions()`; the unscoped spy assertion failed |
| `e2e/subagents.mjs` | harness adaptations: lease route stub returns `renewed:0`; emit/error target the currently-open mock source; wait for history before injecting a live partial; drive a lifecycle-resume `visibilitychange` before emitting; widen the intentional-404 window to the settle point | reconcile the local Trellis E2E with upstream's new selected-session lease/keep-alive lifecycle |

No production code was modified by these adjustments.

## 6. Retention matrix P01–P14

Local customizations are preserved by construction: the candidate is a merge whose first parent is
`L`, and no local-only path appears in the merge's changed set. Overlap rows were additionally
reviewed both ways.

| Row | Local customization | Result |
| --- | --- | --- |
| P01 | Fork release identity / scripts / workflows / locks | **Preserved** — `package.json`/lock resolved ours; release scripts & workflows untouched. |
| P02 | Oxanium / WenKai / Cascadia fonts, `layout.tsx`, `globals.css` | **Preserved** — not in overlap; no `next/font` reintroduction. |
| P03 | `useChatAppearance.ts` offset→absolute migration, `8e49a9d` size chain | **Preserved** — untouched by merge. |
| P04 | Table scroll + Mermaid style fix | **Preserved** — untouched. |
| P05 | Viewport-height / is-mobile touch predicate, send-shortcut | **Preserved** — predicates untouched; `ChatInput` merged. |
| P06 | Settings margin-auto / mobile full-screen / short-height reachability | **Preserved** — `settings.css` + `SettingsPanel` merged. |
| P07 | Image routing, attachment helpers, previews, `file-access.ts` | **Preserved** — untouched. |
| P08 | Extension-UI settings & widget/plugin visibility | **Preserved** — untouched. |
| P09 | ask-user store/persist/routes/card | **Preserved** — files untouched; sessions route/test merge keeps ask cleanup + persisted-ask coverage. |
| P10 | Incremental session-list cache; deleted scanner stays deleted | **Preserved** — `session-reader.ts` upstream change is confined to `readSessionContext`; no `session-list-scanner.*` present. |
| P11 | Sidebar content-vs-structure refresh, virtualization, family aggregation | **Preserved** — `SessionSidebar`/`session-list-cache` not in merge change set. |
| P12 | Trellis bounded adapter/history/hook/UI/locales/E2E | **Preserved** — Trellis modules untouched; `AppShell`/hook/sessions route merged additively; owning spec amended. |
| P13 | `.agents/.pi/.trellis`, extensions, AGENTS/eslint/ignore | **Preserved** — `.agents/.pi/.trellis` untouched; `AGENTS.md` merged additively. |
| P14 | Prior intentional removals (Electron safe-area, deleted scanners, font controller) | **Not resurrected** — ancestor is `L`; upstream did not re-add them. |

## 7. Verification results (isolated, same env for both sides)

Commands (each run inside `<iso>/{candidate,baseline}` with the isolated env of §2):

```sh
node_modules/.bin/tsc --noEmit --incremental false
npm test
npm run lint
E2E_SERVER_MODE=dev PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> node e2e/run.mjs      # original
E2E_SERVER_MODE=dev PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=<chromium> node e2e/subagents.mjs # Trellis
```

| Check | Candidate | Baseline (`L`) | Verdict |
| --- | --- | --- | --- |
| `tsc --noEmit` | PASS (exit 0) | PASS (exit 0) | OK |
| Node unit tests | **1214 pass / 0 fail** | **1164 pass / 0 fail** | OK (delta = upstream new suites) |
| ESLint | **17 errors** | **16 errors** | all `react-hooks/preserve-manual-memoization`; +1 at `hooks/useAgentSession.ts:472` |
| Original E2E (`e2e/run.mjs`) | reaches known `e2e/chat-appearance.mjs:88` ("language option reachable") when it completes earlier phases; earlier `reading offset` phase is flaky | same: reaches `chat-appearance.mjs:88`; same `reading offset` flake | environment-equivalent, no new deterministic failure |
| Trellis E2E (`e2e/subagents.mjs`) | **PASS — all 4 phases** (detail projection, A/B/404+X/Y/X reconnect+settlement, 1280px matrix, 390px matrix) | **PASS — all 4 phases** | OK |

Lint reconciliation: the extra error is **upstream-inherited**, not a resolution artifact — linting
the upstream revision of `hooks/useAgentSession.ts` yields three
`preserve-manual-memoization` errors vs `L`'s two (baseline 2, candidate 3). Distribution:
`ChatInput` 7, `ChatMinimap` 5, `SessionSidebar` 2, `useAgentSession` 3.

Original-E2E note: in this isolated dev environment both `L` and the candidate intermittently fail the
same earlier phase (`Returning to older history must restore its reading offset`) due to dev
cold-compile timing; when that phase passes, both deterministically reach the historical
`chat-appearance.mjs:88` failure. This is a **pre-existing baseline limitation**, not a merge
regression, but it is not waived: it remains a known inherited failure to be accepted before
integration. The local Trellis E2E, which the candidate initially regressed, now passes fully.

## 8. Findings and how they were handled

1. **Upstream selected-session keep-alive vs `L` dev E2E lifecycle.** Upstream opens the warmed SSE
   from an effect whose teardown closes the stream; React StrictMode's dev replay
   (setup → cleanup → setup) closes it and the re-`maintain` runs before the mount flag is restored,
   so the local Trellis E2E's mocked source went `CLOSED`. Handled by **adapting the local E2E
   harness** (drive the lifecycle-resume `visibilitychange`, which the lease path already supports,
   then wait for an open source) — no app-code change. This keeps upstream code intact and is
   dev-only (upstream's own browser CI runs `next start`, which we are not allowed to build here).
2. **Session activation appends a meta entry, shifting the 50-entry page.** When a session is
   activated, the SDK/extension binding appends an entry; a fixture whose compaction sits exactly at
   the 50-entry window boundary then drops the compaction from the first page. This is an inherent
   consequence of keep-alive/activation (present in `L` too once a session activates), not a
   merge-resolution bug. With pure upstream code the original E2E's compaction/minimap phase passes;
   only a speculative app-side "fix" (which was reverted) exposed it in dev. Recorded as a
   behavioural observation, no product code changed.
3. **Unit regression fixed.** `app/api/sessions/detail-route.test.mjs` needed its no-full-scan spy
   scoped to GET because upstream's DELETE legitimately scans; without this, one unit test failed.

## 9. Deviations, gaps and unverified items

- **Node version**: only Node **v26.1.0** was available; upstream CI targets **22.19.0**. Both sides
  used the same Node, so comparisons are valid, but the CI-version gap is unverified.
- **Playwright Chromium**: rev **1234** (`chromium_headless_shell-1234`) used via
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for both sides; the pinned expectation is **1243**. No browser
  was installed into the shared cache.
- **No production server path**: `next build` / `E2E_SERVER_MODE=start` was intentionally not run
  (approval forbade it), so production (non-StrictMode) SSE keep-alive behaviour was not exercised
  end-to-end.
- **Tablet / coarse-pointer browser matrix (744px)** requested by R5 was not executed as a browser
  run; the related predicates/tests are covered by unit suites. Touch/IME/iPad coarse-pointer Enter
  is therefore **unit-verified, not browser-verified**.
- **Real iOS/WKWebView keyboard, push delivery, provider quota** remain environment-limited and are
  deferred (not claimed as passed), as in `prd.md`.
- Disk pressure in the environment (~98% used) forced trace cleanup between E2E runs; logs are kept.

## 10. Decision requested

- Accept the inherited baseline limitations (§7: candidate/baseline `chat-appearance.mjs:88`,
  inherited lint extra, dev `reading offset` flake) before integration.
- Then authorize commit + integration (`M`/`D`/`I`) and the personal fast-forward with HMR window
  per `design.md`/`implement.md`. No such action has been taken.

## 11. Recovery refs and evidence

- Candidate branch tip (recovery): `merge/upstream-v091-20260912-200432` at `L` with `MERGE_HEAD=U`,
  merge staged but uncommitted.
- Baseline: detached `L` in `<iso>/baseline`.
- Logs: `<iso>/logs/` (`tsc-*`, `unit-*`, `lint-*`, `e2e-original-*`, `e2e-subagents-*`).
- Overlap inventory: `<iso>/artifacts/overlap-paths.txt`.
