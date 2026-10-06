# SERVER/CORE closeout — interrupted before final revalidation

Worktree: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`; branch `feat/subagent-model-selection`. The subagent was interrupted while handing off; the user has not cancelled or narrowed the approved task. This is a handoff, **not final acceptance**.

## Implemented

- `lib/subagent-provider-sources.ts`: captures public pending queues and final sourceInfo; successful native getter identity; legacy pre-registration public base state plus models.json provider presence checks, single contribution only, stable final getter identity. Direct public legacy registration invalidates the lead. Registration errors leave the generation unconfirmed. Dynamic extension registration invalidates leads; reload results have distinct registries.
- Source references contain opaque SHA-256 source identities, not credential-bearing URLs/config/functions. Replay re-resolves current installed/enabled resources with no-install callback, checks scope/origin/source identity, realpath, regular provider file and canonical directory containment. Legitimate linked package roots are allowed. Envelope limits use UTF-8 bytes, maximum 8 refs / 32 KiB.
- `lib/subagent-session-services.ts`: explicit-false path loads only the required authorized provider file into an unbound factory host; transfers only the necessary native or provable single-file legacy definition into the independent child runtime. No host tools/commands/hooks/event bus/lifecycle/MCP move into the child. Virtual replay is refused. Missing old refs may come from confirmed alive-parent provenance only; unprovable contributions are explicitly refused, not treated as builtin fallback.
- `lib/subagent-runtime.ts`: captures false-child refs in snapshots; checks ready/admission before runs; cleans unpublished failed children; resume/steer use wrapper admission validation. Profile skills flag now reaches the helper.
- `lib/rpc-manager.ts` and `app/api/agent/[id]/route.ts`: strict cold child selection from active-branch latest explicit model_change; no physical-assistant selection authorization or SDK default fallback. Cold set_model constructs against the user's target, then standard SDK setModel persists the explicit choice. Concurrent intents apply on the winning wrapper; a competing stale-history startup failure does not drop a target intent. Child model changes share the prompt-admission lock. Prompt failures keep prompt_rejected/accepted:false and safe DTO, HTTP 409. Constructor alone is not persistence.
- Wrapper reload conservatively carries manual-off default-active tool names into registration-filtered Maps, preventing reload/turn re-registration revival and nested visibility. Hidden/defaultActive:false tools are not force-activated; ordinary-session tool behavior remains separate.
- `ModelSelectionError.message` and DTO are fixed safe messages; provider/model identity is filtered. Agent tool errors expose the existing safe modelSelection DTO; no new failure reason was introduced.

## Actual runtime evidence

New tests:
- `lib/subagent-model-restore.integration.test.mjs`: real SDK + RPC new child, warm Agent resume, reopen, fresh process, actual idle timer, active branch, historical physical Kimi, cold SDK model_change persistence, startup/command concurrency, false-child parent supplementation and parent-absent refusal, exact legacy tools, virtual selection, manual-off reload, actual HTTP route.
- `lib/subagent-provider-sources.integration.test.mjs`: native override/failed registration, pure legacy success, models.json+legacy and multiple contributions refusal, direct public legacy mutation invalidation, reload generation, dynamic invalidation, trust revocation, linked root success/changed root/escape refusal, opaque credential-URL identity, installed npm version mismatch.
- Snapshot tests include UTF-8 envelope bound and raw credential URL refusal.

All providers are local faux fixtures; legacy port-1 endpoints are deliberately never requested. Kimi request counters remain zero. Search is a local synthetic fixture, not real search.

## Verification state — do not omit this caveat

Initial tsc/lint/targeted validation was green. A full intermediate run was green: **2933/2933 tests**, **718 ESLint files**, **0 errors / 0 warnings**, tsc exit 0 (`server-final-*` logs).

After that successful full run, additional actual HTTP/installed-version/idle fixtures and final server refinements were added. The last focused run (`server-restore.log`) was **18 tests: 17 pass, 1 fail**: the unauthenticated exact-model HTTP fixture reported model-unavailable instead of auth-unavailable. The subsequent candidate adds the exact-model auth distinction and chooses a real current builtin id, but **has not been rerun**. Further final edits include source-error reference enrichment, setter input guarding/formatting and thinking-pin application. Consequently **the latest candidate is not yet validated green**. The full log describes the earlier intermediate tree, not these last edits.

Recovery after the parent wait watchdog: tsc exit 0; ESLint 718 files / 0 errors / 0 warnings; focused real SDK restore/source tests 18/18 pass. Full npm test exposed one stale source assertion for the newly applied child thinking pin; the assertion has been updated to reflect `childSelection?.thinkingLevel ?? initial?.thinkingLevel`. Evidence: `recovery-tsc.log`, `recovery-eslint.json`, `recovery-focused.log`, `recovery-tests.log`. Full candidate revalidation and browser acceptance are still pending; do not mark all ACs complete from the intermediate run.

Isolation used for every runtime run: unique small `mktemp -d --tmpdir=/var/tmp` outer HOME; unset XDG_STATE/CONFIG/DATA; invoke `/home/xupeng/.pi/agent/bin/pi-tmp-run` with outer HOME and its `.cache/pi-tmp`; inner HOME=`$PI_TASK_TMPDIR/home`, PI_CODING_AGENT_DIR=`$HOME/.pi/agent`. Owned temp HOMEs were cleaned by shell traps; fresh-process fixtures were awaited and shut down. Logs are in this formal research directory, including `server-restore-alias-failure.log` for an earlier harness alias issue.

## Remaining acceptance / risks

- Latest-candidate revalidation and final server docs/spec progress are pending due the requested wrap-up.
- Browser interaction/viewport acceptance belongs to the other owner; the RPC/HTTP tests are not browser evidence. Safari/Windows and real Git remote package replay have not been run. URL hashing was runtime-tested with synthetic metadata, not a live remote installation.
- Legacy sources with existing base contributions, ambiguous/multiple contributions or unproved reload state fail closed. Arbitrary trusted factory/import side effects and future context-dependent native request implementations are not sandboxed or statically proven.
- No changes were made to the original notification checkout, real user configuration/history, SDK pins or lockfile. No commit/push/archive/deployment/next build or real model/search request was performed. Client/i18n/e2e files were not edited by this owner.
