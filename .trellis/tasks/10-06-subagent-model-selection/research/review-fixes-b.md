# Fresh review B — server/source fixes

Date: 2026-10-06. Worktree only: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`. Fresh general-purpose owner; no old child resumed or child agent spawned. This is a focused delivery, **not final whole-tree/browser acceptance**.

## Boundaries and decisions

Read PRD/design/implement, research server-closeout/client-errors/browser-report/baseline, relevant SDK admission/session-restore/subagent record specs and `docs/agents/subagents.md`. First TMPDIR was `/home/xupeng/.cache/pi-tmp/01a111ee-9ce9-7540-97bf-c492797e57b6`; runtime validation did not use it. Original notification checkout/WIP was neither touched nor copied. No deploy, real settings/auth/history edits, real model/search requests, commit/push/archive, SDK/lock change or next build. No browser/dev service was started; other owners' 8505/26812 processes were not touched.

Source changes used a small `/var/tmp` apply_patch-compatible helper (the host has no apply_patch binary); it is now deleted. No source/SDK/worktree/dependency copy was made.

## Owned changes

- `lib/rpc-manager.ts`: inherited admission no longer captures/caches/authorizes C source references. True snapshots with existing leads also skip C. The independent current services plus exact choice, branch consistency, strict scope/auth and A's initialization health remain the inherited execution gate. Only explicit/legacy false admission reauthorizes provider-only leads.
- `lib/subagent-provider-sources.ts`: still re-resolves CURRENT SDK enabled/trusted entries using the no-install missing callback; saved stat alone never authorizes execution. Configured top-level absolute FILE authority is its declared entry and parent-directory canonical containment, not SDK metadata.baseDir (a settings resolution base). Configured directory entries are checked against their declared directory. Package-origin entries retain actual current packageRoot containment, including legitimate linked roots. Exact canonical ref.file equality and scope/origin/source checks remain. Out-of-root/forged/unconfigured, missing, disabled, trust-revoked, version-mismatched and swapped/escaping symlink cases remain closed.
- `lib/rpc-manager.ts`, `app/api/agent/[id]/route.ts`: added `modelSelectionIntent: "user-command"`, distinct from constructor/internal reload `initialModel`. A cold HTTP command prepares its target, awaits ready, applies standard SDK setModel and persists BEFORE publishing under the startup lock. Route does not send that already-applied command a second time. A waiter applies its own intent on the committed winner under its existing selection/admission lock. Waiting SDK failure is not mistaken for startup failure/retried. Own unpublished failure cleanup preserves the old ask and waits for disposal; it cannot remove another request's committed wrapper. Startup lock deletion is identity-safe.
- `lib/rpc-manager.ts`: A's public `requestedReference` contract is used for live HTTP model pairs, cold initialModel, admission and saved active-branch model_change, avoiding string parser/fuzzy reinterpretation of literal colon/nested IDs.
- `lib/rpc-manager.ts`: after cold ready, versioned policy calls A's public `initializeSubagentBuiltinTools`. It captures native transcript loadout before SDK creation, filters coding activation to saved pins (including []), passes those pins as preferred and retains actual active extension carry. With no native pin, profile defaults initialize coding only. Legacy hard `snapshot.tools`, extension inactive/hidden state and Chat-only remain distinct; no policy migration.
- `lib/rpc-manager.test.mjs`: one obsolete blanket ban on buildSessionContext was narrowed to the child native-tool-pin use; continuing-message detection still uses actual non-system branch messages. This is a structural regression assertion, not runtime proof.
- NEW `lib/subagent-review-b.integration.test.mjs`: separate from A's source/restore fixtures. Eight real SDK/RPC/HTTP tests; provider/search declarations live OUTSIDE fake agentDir and are explicitly absolute-configured. No browser fixture was moved. `docs/agents/subagents.md` now records these server contracts.

Safe existing failure reasons/DTO are unchanged. Prompt refusal remains `prompt_rejected/accepted:false`. UI/i18n/hooks/e2e/runtime/selection/services/tool-policy/subagents files were not edited by B.

## Runtime assertions

1. DEFAULT inherited absolute configured file admits with no refs; a true snapshot containing an obsolete forged/missing lead still admits from its own current resources. Factory and session_start execute and the first local faux child request succeeds. Explore coding defaults and delayed search registration are present, inactive extension is not force-activated.
2. SDK false/provider-only absolute-file replay succeeds, transfers only the provider, and makes a local faux request with **zero** child tools from the extension, session lifecycle, provider-request hooks, search factories or search executions. Only licensed coding tools remain.
3. Current SDK source authorization accepts absolute configured file; rejects unconfigured forged lead, bad version, disabled/missing and changed/escaping symlink leads without provider factory execution. Existing included source suite additionally verifies linked package success, changed root/escape, project trust revocation, npm version mismatch and registration provenance/reload boundaries.
4. Native saved coding pins [read] and [] are honored; actual legal active extension remains, defaultActive:false stays off. Legacy hard [read] remains exact. Explicit false Chat-only + native [] remains zero-tool.
5. Constructor-only initialModel does not persist cold model authorization and cannot prompt against old history. HTTP literal `family:high` and `nested/gpt` choices persist exactly once each via SDK. Fixture enabled scope uses `review-b/**`, preserving SDK's nested-id glob semantics.
6. A public ModelRuntime.checkAuth fixture allows real catalog/config/scope discovery but refuses the SDK standard setModel auth check. Observed at the auth boundary: target known/configured, startup lock held, wrapper unpublished. Typed HTTP 409 auth-unavailable, zero model requests, no model_change write, no registry/start-lock orphan; old in-memory/persisted ask and settings remain unchanged. Restoring the public auth implementation allows retry, one target record and preserved ask.
7. First cold intent is held at SDK auth and fails while a valid competing target waits. Winner subsequently commits and stays alive; multiple additional valid intents persist in order with no loss.
8. A valid cold winner is held while an invalid waiter joins. Winner commits; waiter fails its own SDK auth exactly once, without retry, duplicate record or winner cleanup.

Auth-boundary observations are asserted OUTSIDE the SDK catch path so assertions cannot be swallowed as expected auth errors. Fixtures seed the ordinary saved thinking-level record: an earlier stricter byte-equality assertion exposed the SDK's existing constructor normalization of missing thinking_level_change to off, not a target model_change. That failed diagnostic run is retained. This task does not alter SDK normalization.

## Actual verification

Every command first cd'd the worktree, made a UNIQUE small outer HOME with `mktemp -d --tmpdir=/var/tmp pi-review-b-validation.XXXXXXXX`, unset XDG_STATE/CONFIG/DATA/CACHE, then invoked `/home/xupeng/.pi/agent/bin/pi-tmp-run` with outer HOME and its `.cache/pi-tmp`. Inner HOME/PI_CODING_AGENT_DIR/XDG_CACHE_HOME were under `$PI_TASK_TMPDIR`. Shell EXIT traps removed the owned outer HOMEs, and fixture hooks shut down owned wrappers/processes. No /tmp runtime or large copy.

Before running real fixtures, both initial and coordinated-current code compiled: `review-b-initial-tsc.log`, `review-b-coordinated-tsc.log`, exit 0. Latest delivery commands:

```sh
node --test lib/rpc-manager*.test.mjs \
  lib/subagent-review-b.integration.test.mjs \
  lib/subagent-provider-sources.integration.test.mjs \
  lib/subagent-model-restore.integration.test.mjs \
  lib/subagent-resource-loader.integration.test.mjs \
  lib/subagent-provider-run.integration.test.mjs \
  lib/subagent-tool-policy.integration.test.mjs \
  lib/subagent-model-selection.test.mjs
node_modules/.bin/tsc --noEmit --incremental false
node_modules/.bin/eslint --max-warnings=0 lib/rpc-manager.ts \
  lib/rpc-manager.test.mjs 'app/api/agent/[id]/route.ts' \
  lib/subagent-provider-sources.ts lib/subagent-review-b.integration.test.mjs
```

- Latest delivery tests: **210 / 210 pass**, zero fail/skip/cancel/todo, exit 0 (`review-b-delivery-tests.log`). Includes eight NEW review-B runtime tests plus existing relevant RPC and SDK integration/selection contracts.
- Latest delivery tsc: exit 0 (`review-b-delivery-tsc.log`). A concurrently evolving whole-tree type snapshot, not a final acceptance promise.
- Latest delivery ESLint: **5 targeted files**, 0 errors/warnings, exit 0 (`review-b-delivery-lint.log`). Not full 718-file lint.
- Focused diff check for owned files exit 0. Earlier focused 26/26 log retained; latest 210 run supersedes it.

Diagnostic failures were not erased: initial review tests 5/8 (incorrectly assumed a currently enabled search file could not be an authorized source lead; changed the forged fixture to a truly unconfigured regular file, with no product bypass; nested scope needed SDK ** glob); initial broad related run 317/320 (one now-fixed stale RPC structural assertion plus TWO unowned `subagent-runtime.test.mjs` service fixture failures); stricter history-byte diagnostic 209/210 (missing thinking fixture record, described above). The two unowned broad failures were `queued abort waits for a real isolated subagent worktree to disappear` and `new child completion snapshots use trusted-result policy without contacting a provider`, both provider-context-unavailable during services creation on that concurrent A snapshot. B did not edit those fixtures; A must include/recheck them in final whole-tree validation.

## Remaining acceptance / risks

- Fresh browser retry is still REQUIRED against the unchanged globally absolute configured fixture. B has not rerun Chromium/mobile, and does not replace the prior browser blocker report with a pass. Browser owner also has the separate Next HMR metadata-network-attempt blocker documented in browser-report.md.
- No full npm test/full lint was run by B; final synchronized A/B/browser tree must be compiled and validated again. Earlier 2935 full pass/718 lint/tsc evidence is not final acceptance of these fixes.
- Safari/Windows/live providers/real search/remote package installations remain untested. Trusted factory/hook code is not sandboxed. The C path rejects unprovable legacy/context-dependent replay rather than guessing provenance.
- Only formal source/docs/research logs remain. The patch helper and all owned validation HOME directories were deleted; no B-owned listener or service needs stopping.
