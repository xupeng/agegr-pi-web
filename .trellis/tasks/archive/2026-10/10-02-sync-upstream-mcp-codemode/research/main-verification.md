# Main-session final verification — checkpoint (browser still RED)

Candidate remains `merge/upstream-mcp-codemode-20261002`, HEAD/L `93e63e8`, MERGE_HEAD/U
`d733d43`. No commit, staging batch, archive, push or main-checkout product edit was performed.
This is a checkpoint, **not** a final acceptance certificate.

## Infrastructure interruption and recovery

The two resumed final agents failed before completing their final handoffs, first with OpenAI
OAuth `invalid_grant`, then `unsupported_country_region_territory`. Explicit model overrides
on those resumed sessions did not recover them. These are agent-provider failures, not candidate
test results. No auth/config/network workaround was applied to the user's real Pi setup.

Main took ownership of full static/browser execution. A fresh read-only agent using the configured
`xupeng-oneapi/deepseek-flash` completed the incremental review in `final-incremental-review.md`;
it verified source/spec/e2e contracts and 41 focused Node cases, not the full browser gate.

## Actual main-owned commands/results

Raw evidence: ignored `test-results/final-validation-main/` and
`test-results/final-browser-verification-main/`. Both executions used `env -i`, separate /tmp
HOME/TMPDIR, production+isolated agent dir for units, development+runner-created fixture agent
dir for browsers. No PI_OFFLINE, provider keys, user MCP or paid model completions were inherited.
The dependency tree remains the earlier lockfile-consistent `npm ci --include=dev` tree.

| Gate | Actual result |
| --- | --- |
| Full TypeScript | exit 0 |
| Full unit | exit 0; **2123/2123**, 13 suites, 0 fail/cancel/skip/todo; 157705.108965ms |
| Initial full lint | exit 0 but two mock-hook warnings; not claimed warning-free |
| Mock-harness correction | test-only rename local simulated hook to `memoSlot`; no lint disable; remove blank EOF |
| Full lint recheck | exit 0; **630 targets, 0 errors / 0 warnings** in this diagnostic worktree |
| Markdown focused recheck | **41/41**, exit 0 |
| Untracked identity-test whitespace | `git diff --no-index --check /dev/null ...` exit 0 |
| Unfiltered `npm run test:e2e` | **exit 1**, actual desktop reading-offset failure at `e2e/run.mjs:557` |

The two source-identity tests explain 2121→2123. L baseline stays the independently measured
1755/1755; no unit count or passing assertion was removed. Lint target counts reflect actual
checkout contents (including local diagnostic files), not a guessed clean-commit target count.

## Browser boundary

No E2E_VIEWPORT_WIDTH/E2E_CHECK_GROUP or observer/preload was set. Chromium executable is the
verified 153.0.8010.12 headless shell. No second dev server was started; candidate lock and 30141
were checked first, and existing servers for other worktrees were untouched.

This run passed new desktop MCP/Code mode/edit/queue cases, original paragraph DOM identity,
pagination, minimap typography, short-viewport alignment and process/thinking checks. It then
reproduced the previously retained `Returning to older history must restore its reading offset`
failure. It did not reach the later mobile/Trellis full-run stages; prior targeted passes do not
substitute for those missing results. `source-before.sha256` and `source-after.sha256` match.

The reading-offset finding is now independently reproduced, not waived as timing noise. A fresh
focused agent owns that investigation and the candidate browser until its handoff. It must prove
the restoration owner or an actual completion-condition sampling issue without loosening the
120px position / <5px tolerance, arbitrary sleeps or removing assertions. Final whole-suite
verification remains required afterwards.

## Remaining limitations

Historical already-promoted polluted Agent snapshots are not migrated/revalidated. Real
Safari/iOS/Windows/IME, live user MCP/OAuth/paid providers and running thinking/fork controls
are not certified by these tests. Existing dependency advisories remain out of upgrade scope.
U is still MERGE_HEAD, not yet an ancestor of a new merge commit. AC6 and final closeout remain
pending; the task must stay `in_progress`.

## Final superseding results — full browser GREEN, awaiting commit confirmation

Evidence is the separate ignored `test-results/final-validation-main-2/` and
`test-results/final-browser-verification-main-2/`, preserving all prior RED attempts.

| Gate | Final observed result |
| --- | --- |
| Full TypeScript | exit 0 |
| Full isolated unit | **2123/2123**, exit 0; 13 suites, 0 fail/cancel/skip/todo; 273705.450688ms |
| Default full lint | exit 0; 631 targets/0 errors/1 warning, solely unused `snap` in ignored reading-offset observer |
| Complete commit-source lint | `npm run lint -- --format json --ignore-pattern 'test-results/**'`: **629 targets/0 errors/0 warnings**, exit 0 |
| Unfiltered full browser | **exit 0**, both `e2e/run.mjs` and `e2e/subagents.mjs` |
| staged/unstaged whitespace, unresolved index | passed; no unmerged paths |
| Browser source before/after | identical SHA manifest digest **c2e387c1df584e33cc3ddff1eae1cae2a0e943dc604a1ca14a5b15216edd5ee8** |

No ESLint config/rule was weakened. The two additional default-lint targets are ignored diagnostic
observer programs under test-results, not committed source; their warning is disclosed, not
rewritten away. All committed production/test/e2e targets pass the original rules warning-free.

Reading-offset diagnostic established unstable capture values (9275/-2275/120) while a stable
120 capture restored to 120. Main approved only a fixture precondition: re-park at 120 until two
consecutive frame samples remain within the existing <5px with no older requests, inside 30s.
Listeners are scoped and removed in finally; original return-side assertion is byte-identical,
with no repositioning on return. No product scroll-precedence change or blind sleep was added.
`final-fixture-review.md` independently reviewed this increment and its limits: stabilization is
not a mathematical guarantee against every later observer event, and timeout diagnostics could
report more raw state. Neither info/low item is hidden as a product fix.

The full run passed 1280/390 pagination, original DOM handle, branch/context/compaction, reading
position, minimap/typography, file panel, extension dialogs, shared ask, restore/appearance/tail,
new MCP/Code mode/history edit/FIFO cases; touch Enter/overflow passed at 390/744; complete Trellis
passed 1280/744/390 and its ownership/reconnect/race assertions. No viewport/group filter,
diagnostic observer or preload was supplied. Source manifest includes all changed source/tests
and e2e files; no product changed during the run. Candidate lock/30141 are absent after cleanup.

Independent original full-scope check plus fresh incremental/fixture reviews and main's actual
full commands now close candidate-code AC2–AC6 within the explicitly listed fixture/platform
boundaries. They do not certify true Safari/Windows/live provider/MCP or retrospective historical
Agent migration. AC1 merge ancestry and AC7 archive/journal remain pending. Commit confirmation
is the next gate; `personal` still equals L and no push/PR/publish is permitted.
