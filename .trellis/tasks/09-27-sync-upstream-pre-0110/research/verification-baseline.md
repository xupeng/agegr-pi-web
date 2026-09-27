# Verification baseline — upstream merge

## Inputs and result

| Item | Value |
|------|-------|
| `personal` before | `f186cdb` |
| `upstream/main` | `96966e5` |
| merge base | `5e9b997` |
| branch | `merge/upstream-pre-0110-20260927-171343` |
| merge commit | `7790ec7` (real merge, `--no-ff`) |
| extra commits on the branch | `92d8e46` task artifacts, `ed31361` e2e extra-page fix, `716c3a9` e2e diagnostic |
| conflict count | 21 content + 2 modify/delete (see `conflict-decisions.md`) |

## Gates (independently re-run by the main agent, not only by the implement agent)

| Gate | Command | Result |
|------|---------|--------|
| typecheck | `node_modules/.bin/tsc --noEmit` | exit 0 |
| lint | `npm run lint` | `ESLint: No issues found` |
| unit | `env -u NODE_PATH XDG_STATE_HOME= npm test` | **1720 pass, 0 fail, 0 skipped** (44.3 s) |

Unit reconciliation: fork baseline 1522. Upstream adds 38 commits' worth of tests; the
fork deletes `lib/session-list-scanner.test.mjs` (7 upstream cases). Net +197, plus one
check-agent test added after review (`lib/session-reader.test.mjs`: the equal-`modified`
reverse-filename ordering the scanner used to cover) = **1720**. No test
file disappeared (`git diff --diff-filter=D f186cdb..HEAD -- '*test*'` is empty) and no
test file lost lines except where the behaviour it asserted was deliberately changed
(`lib/rpc-manager*.test.mjs`: the exact prompt now travels through a
`before_agent_start` extension, so the assertion was rewritten to "the wrapper must never
assign the SDK prompt" and `lib/exact-system-prompt.test.mjs` covers the extension).

## e2e (isolated worktree `/home/xupeng/dev/personal/forked/pi-web-e2e-0110`)

Why a worktree: `e2e/run.mjs` asserts `!existsSync(.next/dev/lock)` and the user's dev
server (PID 1604984, `0.0.0.0:8505`) owns that lock in the main checkout.

```bash
git worktree add --detach /home/xupeng/dev/personal/forked/pi-web-e2e-0110 <commit>
cp -al node_modules <worktree>/node_modules        # /home, hardlinks, tmpfs would fail
cd <worktree> && E2E_SERVER_MODE=dev node e2e/run.mjs
```

Seven runs, 5 green / 2 red, and the two reds were **different** assertions:

| Run | Result | Failure |
|-----|--------|---------|
| 1 | red | history window shorter than the pages paged in (expected 450, DOM had 500) |
| 2 | green | — |
| 3 | red | `Prepending history must preserve existing message nodes` (`connected: false`) |
| 4-7 | green | — (13 PASS each, both viewports) |

### Run 1 — the test's expectation, not the app

The DOM rendered a **contiguous** 4500-4999 window with no gaps or duplicates, and the
dev-server log shows the app really fetched the extra page (`before=e4500`, one of 12
distinct cursors in `test-results/e2e/server.log`). The retry added in PR #16 stops as
soon as a request is seen, but a nudge already scheduled can land one more page *after*
the responses were counted, so `olderResponses` (8) undercounted the loaded pages (9).
Fixed in `ed31361` by asserting what the app guarantees — a contiguous suffix that covers
the paged-in range — instead of an exact length. Gaps, duplicates, reordering, and a lost
page still fail.

### Run 3 — unresolved, bounded

One occurrence in seven runs, never reproduced in the four follow-up runs. Evidence
gathered so far:

* the detached handle still had `textContent === "E2E message 4998"` (the content was
  correct; only the node identity changed);
* the merge's ChatWindow delta from upstream contains no key or list-container change —
  only `useScrollbarVisibility`, scrollbar classes, `[scrollbar-gutter:stable]`, and the
  scroll-to-latest button — so no structural remount source was introduced;
* both states that feed the render keys (`messages` / `entryIds`) are always set in the
  same synchronous block in `hooks/useAgentSession.ts` (`:1012-1013` prepend,
  `:857-858` reset), so the index-key fallback in `components/ChatWindow.tsx:1069`
  (`entryIds[idx] ?? idx`) requires a render that lands between two commits.

`716c3a9` makes the next occurrence self-diagnosing (node count, empty `data-entry-id`
count, and the entry id of any node carrying the same text), which separates "the render
fell back to index keys" from "the list container was recreated". Recorded as a known
intermittent gate rather than fixed, because all four follow-up runs at both viewports
were green and no mechanism was found in the code the merge touched.

## R4 spot checks (upstream security fixes present in the merged tree)

| Fix | Reference |
|-----|-----------|
| `PI_WEB_PASSWORD` stripped from agent bash and terminal child envs | `lib/project-command-env.ts:34`, `lib/terminal-manager.ts:50` |
| Basic-auth attempts share the login throttle | `proxy.ts:62` (`recordAuthFailure`) + `lib/auth-throttle.ts` |
| login destination must stay same-origin | `lib/login-destination.ts:9` (`safeLoginDestination`) |
| `models.json` read the way pi reads it, never overwritten when unreadable | `lib/models-config-store.ts:94` |
| listener unsubscribe mid-emit no longer drops the event | `lib/rpc-manager.ts` (Set-based listener delivery) |

## Deviations and notes

1. The implement agent committed the planning artifacts (`92d8e46`) on the merge branch so
   the PR can link `research/conflict-decisions.md`; the archive/journal commits follow the
   usual order at finish-work.
2. Two test-only commits (`ed31361`, `716c3a9`) sit on the merge branch. They do not touch
   product code, they are needed for the gate to be meaningful (see run 1), and the
   second only runs on failure.
3. `research/conflict-decisions.md` was corrected after review: the AppShell row claimed
   the upstream per-tab memory was *dropped*, while the merged code integrates it
   (`lib/tab-session.ts` + `withTabOpen`) and upstream's `AppShell.tab-session.test.mjs`
   (3 cases, unmodified) passes. The doc now matches the code.
4. Dependency adoption (user decision): `@earendil-works/pi-*` 0.87.1, `next` 16.3.6,
   `semver` 7.8.5, `undici` 8.11.0, production-install trim; `name`/`version` stay
   `@xup3ng/pi-web` 0.10.0. `lib/ask-user/portable/package.json` peer pins and
   `discovery.test.mjs` were updated to 0.87.1 as part of the SDK bump repair.

## AC status

| AC | Status |
|----|--------|
| AC1 merge commit + PR body links the decision file | merge exists; PR body written at open |
| AC2 modify/delete resolved deliberately, scanner stays deleted, tie-break ported | done (`mergeSessionLists()`), recorded |
| AC3 tsc / lint / unit / e2e green | done for the first three; e2e 5/7 green with one documented intermittent assertion |
| AC4 R4 fixes present and spot-checked | done (table above) |
| AC5 dependency decision recorded, SDK-dependent tests pass | done |
| AC6 `AGENTS.md` re-read and corrected | done (`listSessionsIncremental` line rewritten) |
