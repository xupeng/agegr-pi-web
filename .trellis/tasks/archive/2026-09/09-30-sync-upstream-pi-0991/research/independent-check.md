# Independent check: upstream merge + Pi 0.99.1

## Verdict

**PASS after one local P2 repair. No remaining blocking findings in the approved merge/SDK scope.**

Reviewed the complete working candidate against both L `576e74f80b6fb271402369fde4bc0c5eee7cf509` and U `433d09ea2f2cc77b0ff356e8c57575cd4d30179e`, not just the nine unstaged upgrade files. Workspace: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-pi-0991-20260930`, branch `merge/upstream-pi-0991-20260930`.

HEAD remains L, MERGE_HEAD remains U, and the index still contains the pure merge snapshot. Actual merge-commit ancestry/AC1 is a parent closeout step, not something this review has completed.

## Progress and validation

The earlier progress checkpoint is now complete. Pre-fix evidence is deliberately separate from post-fix validation:

| Phase | Check | Result / evidence |
| --- | --- | --- |
| Before route repair | `node_modules/.bin/tsc --noEmit` | Exit 0 |
| Before route repair | `npm run lint` | Exit 0 |
| Before route repair | `env -u NODE_PATH XDG_STATE_HOME= npm test` | **1753 pass / 0 fail**, `research/logs/independent-unit.log` |
| Regression before repair | New route test against existing handler | **1 pass / 1 fail**, `TypeError: Cannot read properties of null (reading 'provider')`, `parseEdit` at old `route.ts:27`, PUT at old `route.ts:54` |
| After route repair | New route tests | **2 pass / 0 fail**, malformed/non-object JSON and invalid edit fields rejected without creating files in the isolated agent directory |
| After route repair | `node_modules/.bin/tsc --noEmit` | Exit 0 |
| After route repair | Full ESLint JSON scan | **565 files / 0 errors / 0 warnings**, `research/logs/independent-lint.json` |
| After route repair | Focused route/RPC/shutdown/stall/catalog/portable-discovery tests | **84 pass / 0 fail**, `research/logs/independent-focused.log` |
| After route repair | Full `npm test` | **1755 pass / 0 fail**, 10 suites, 0 skipped/cancelled, `research/logs/independent-unit-after-route.log` |
| After route repair | Real SDK offline admission/settlement probe | All assertions pass, **6 simulated provider calls / zero network requests**, `research/logs/independent-sdk-admission.log` |
| Final | `git diff --check`, `git diff --cached --check` | Exit 0 |

Dependency provenance: reused the implementer's clean `npm ci` target tree, verified the installation metadata and installed package versions against all 1013 lockfile entries (optional platform packages may be absent). No mismatches for installed packages or missing non-optional packages. The frozen-L baseline was produced by clean npm ci: tsc 0, lint 558 files/0 diagnostics, 1736 unit passes. The candidate's extra lint targets/tests come from upstream additions and this route regression; no rule/compiler weakening. Direct non-Pi package pins and application identity/version remain unchanged.

## Finding fixed

### P2: Non-object JSON could escape the new defaults API's error handling

- Owner: `app/api/models/default/route.ts:52` (previously `:47`), `parseEdit` at `:29`.
- Reproduction: call the real PUT handler with body `null`. JSON parsing succeeds, but the previous type assertion did not validate runtime shape; the subsequent `body.provider` read threw outside the route's service/write catch. The result was an uncontrolled handler failure instead of a 400 response.
- Repair: retain the request as `unknown`, narrow through `isRequestObject` at `:25` (non-null, object, non-array), then run the existing edit validation unchanged. No SDK services/settings writes occur for rejected bodies.
- Regression: `app/api/models/default/route.test.mjs:32` covers null, array, string, number and boolean; `:43` covers malformed JSON, missing/half model fields, and invalid thinking level. The test was run red against the original handler and green after repair. Both tests use an independent temporary agent directory and assert no files are created.
- The fix is **unstaged**. `route.ts` is now `AM`; the staged added route remains the original pure-merge version. New test is untracked/unstaged.

## Whole-candidate review

All six documented resolutions were checked against L/U and the candidate:

| Resolution | Independent conclusion |
| --- | --- |
| `lib/file-access.ts` | Old flat default-cwd scan deliberately removed; attachment persistence scan retained; shared lexical/realpath security boundary unchanged. New cwd selection authorizes via `/api/cwd/validate`. |
| `lib/rpc-manager.ts` | Only obsolete startup-preferences import/writer removed from the merge; fork stall/ask/subagent/SSE handling remains. Upgrade preflight change matches actual SDK. |
| `components/ChatInput.tsx` | Both image-mentions and Markdown continuation imports retained; the new beforeinput listener does not remove image/mention/key handlers. |
| `components/ChatWindow.tsx` | Explicit-default handlers and fork `followTailIfAttached` both wired through hook destructuring and consumers. |
| `components/SessionSidebar.tsx` | Shared validation keeps fork project identity; remember=false only skips custom-picker memory; redundant setter remains removed. |
| `components/ChatInput.test.mjs` | Both sides' appended tests retained, no conflicting expectation discarded. |

Also reviewed automatic merge additions in hook model loading/default setters, RPC tests, models route/cache, enabled-models display helper, default-cwd route, translations, selector components and AGENTS.md. The only deletions relative to L are the intentional startup-preferences implementation/test; replacing startup persistence with explicit save is required by R3. Unchanged auth/security/session-restore/tool-preset/event modules remain in the candidate and are covered by the passing full suite. Comparing the candidate to U shows retained fork image mentions, attachment roots, tail following, stall notices/watchdog, ask_user, wrapper event/reconnect logic and sidebar identity, not whole-side replacement. No extra consumer-side casts or global test/type/lint relaxations were introduced.

## SDK and changed tests

Installed `pi-coding-agent` 0.99.1 implementations/declarations were authoritative, especially `dist/core/agent-session.js:1449`, `:1648`, `:1659`, `:1714`, `:1315` and `dist/modes/rpc/rpc-mode.js:298`.

- Success dispositions are **`started`**, **`queued`**, **`handled`**. There is no `accepted` or `rejected` string in PromptDisposition. Rejection is a rejected promise with no acceptance callback. `lib/pi-types.ts:162` and updated shutdown/RPC mocks reflect this exactly.
- `steer`/`followUp` return `handled` if an input extension consumes the input, otherwise `queued` (including transformed input). Direct queue APIs do not start an idle run. The hook continues using prompt + streamingBehavior for its atomic queue-or-start decision. Wrapper direct commands retain their existing null response; exposing SDK dispositions as a new Web API was not required or introduced.
- Acceptance is distinct from completion. Wrapper pending-count and SDK idle gates delay notification; a queued input does not prematurely complete an active run. Streaming-behavior input that arrives after idle starts/settles correctly via SDK agent events, without needing a prompt_done for the queue command.
- The real-SDK probe (`research/sdk-admission-probe.mjs`) uses public session/resource/runtime interfaces and substitutes only the agent's provider stream function. Fetch is forbidden. It verifies handled input, rejection without callback, admission while a stream is pending, transformed steering/follow-up queues, one completion notification plus one prompt_done after the whole queued run settles, idle queue/start race, deferred non-triggering custom notice persistence, and immediate ask_submit response followed by an extension-injected run/one idle notification. Probe setup initially needed `bindExtensions({})`; correcting the probe did not require product changes.
- ask answers still fire-and-forget through triggerTurn/followUp; stall non-triggering messages still flush after the current run; completion/SSE behavior is preserved. No live or paid model requests were made.
- Clone assertion change is valid: actual SDK now writes after the first user entry. Before/after directory comparison proves cancellation adds no session file, unlike the old invalid empty-directory assertion. Positive clone/reopen/replacement-lock tests also pass.
- Catalog fixture's origin/path match properly tolerates SDK's `types=chat,image,classifier` query without changing production behavior; refresh, revalidation and single-flight assertions all pass.
- Root and nested copies of all four Pi packages are exactly 0.99.1; portable pi-ai/coding-agent peers match. Independent-copy discovery/bridge failure-closed tests passed against the actual target loader. No unsupported widening of peer ranges.

## E2E evidence and documentation

Reused the fresh successful full run recorded in `research/logs/upgrade-e2e-2.log` and `verification-report.md`, after inspecting the runner's isolated temporary agent directory/random-port server setup. It covers desktop/mobile/touch, pagination/branches, markdown/tools/compaction, extension dialogs, shared ask_user, URL restore, appearance/status-tail and subagent interactions. First cold run's timeout remains disclosed; it was not counted as passing. This review changed no browser/RPC implementation, only rejecting malformed defaults requests, verified separately with actual handler tests.

Parent-owned `.trellis/spec/frontend/pi-sdk-admission.md`, `model-default-settings.md`, `index.md` and `ask-user-protocol.md` are consistent with current admission/default/peer behavior. Index links exist. Two precision notes, not blockers: explicitly mention non-object JSON in the defaults API's 400 matrix and name the new route tests; the RPC startup-default assertion is a source-level regression, not itself proof of every runtime startup variant. No spec files were modified by this check agent.

## Boundaries and residual risks

- No remaining blocking concrete bugs found in the reviewed scope. No live provider/auth/paid completion was tested; controlled streams exercise actual SDK/agent/wrapper lifecycle, not provider networking.
- Earlier e2e does **not** claim dedicated browser coverage of the new default-save stars or Markdown continuation's native undo/mobile-beforeinput behavior. Those have component/source/pure-function/unit coverage; genuine browser interaction coverage remains a limitation.
- Linux/Node 24 validation only; Windows runtime behavior and minimum Node 22.19 were not rerun. Existing path-security/UNC cross-platform tests pass.
- Existing transitive audit findings remain the implementer's recorded baseline (1 moderate, 1 high); no audit fix or unrelated dependency remediation performed.
- New SDK opt-in codemode/MCP/virtual/image/classifier features are not enabled or comprehensively tested by this task.
- Pure merge snapshot unchanged: SHA-256 of `git diff --cached --binary` before/after is `e2b374742473701cf4c10afe44df809fb918197d469b0c0eea72f13c1e3ed49c`. No staging, commits, pushes, publishes, archives or next build performed.
- Original checkout's four dirty-file SHA-256 values match `research/isolation-baseline.md`; original source/index/settings/dependencies/server were not modified by review.
- Tooling limitation: the provided environment has no apply_patch tool or executable (attempt failed before making changes); scoped repairs used structured exact-text edit/new-file tools instead. No shell/Python rewriting of product files.

## Files changed by this check agent

1. `app/api/models/default/route.ts` - local runtime object guard (unstaged).
2. `app/api/models/default/route.test.mjs` - two route input regressions (new, unstaged).
3. `.trellis/tasks/09-30-sync-upstream-pi-0991/research/independent-check.md` - this report.
4. `.trellis/tasks/09-30-sync-upstream-pi-0991/research/sdk-admission-probe.mjs` - repeatable isolated SDK lifecycle probe.
5. Task `research/logs/independent-unit.log`, `independent-unit-after-route.log`, `independent-focused.log`, `independent-lint.json`, `independent-sdk-admission.log` - verification outputs.

Parent's spec edits and implementer's existing merge/upgrade edits were left intact and are not attributed to this agent.
