# Review fixes A — focused revalidation complete, not whole-task acceptance

> 原始验收产物现留在私有离线副本；本文仍是原 SHA 的历史记录，见 [证据留存](../evidence-retention.md)。

Worktree: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`.
Fresh general-purpose reviewer; no resumed/spawned child. Original checkout WIP was not inspected/copied/edited. A owns selection/services/subagents/tool-policy/runtime, their tests and new narrow helpers. User additionally assigned `app/api/subagents/profiles/route.{ts,test.mjs}` to A. B's RPC, agent route, provider-sources, e2e/UI/i18n were not edited.

## Public contract for B / main agent

1. `resolveSubagentModelSelection({ requestedReference: { provider, modelId }, ... })` is the highest-priority exact `runtime.getModel` entry, above requestedModel/profileModel/parentModel. HTTP and persisted branch refs **must** use it rather than concatenated strings. `parentModel` itself is now exact.
2. `resolveConcreteModel(runtime, string | ModelReference)`: object exact; string first resolves an exact full id (preserving genuine `:free`, `@001`, even `:high` ids), otherwise SDK pattern/alias/thinking parsing is allowed only with **zero diagnostics**. Legal pattern thinking/aliases remain supported. UI/shared enabledModels scope was not changed.
3. Export from `lib/subagent-tool-policy.ts`:

   ```ts
   initializeSubagentBuiltinTools(
     session: Pick<AgentSession, "getActiveToolNames" | "getAllTools" | "setActiveToolsByName">,
     builtinTools: readonly string[],
     extensionsResult: LoadExtensionsResult,
     preferredBuiltinTools?: readonly string[],
   ): void
   ```

   After ready, versioned-policy cold recovery passes `nativePersistedCodingPins ?? policy.builtinTools` as preferred argument. Do not call for legacy exact-tools or pass a persistent SDK hardtools list. Only actual builtin-source registered coding tools are initialized; preferred empty pins stay empty. SDK-active extension names are retained. Hidden/defaultActive:false/manual-off extensions and coding-name overrides are not activated by the permission list. New start calls the helper after wrapper ready.
4. `assertProviderInitializationHealthy(runtime, providerId)` from new `lib/subagent-registration-ledger.ts` is invoked by selection. Services begin each final loader generation and instrument only the child-owned public runtime registration methods, including later bind/session_start callbacks. Target failure rejects through selection with existing `provider-context-unavailable`, before admission/enqueue; stale legacy/native getter existence cannot make it healthy. No DTO reason was added. B's admission can continue calling selection.
5. New-start snapshot.providerSources is guarded by explicit `loadExtensions=false`. Ordinary inheritance needs independent current services + strict scope/auth, not C provenance.
6. New-start shell mapping now occurs **after** services creation/final trust reload, using `services.settingsManager.getDefaultTools()`, not parent settings or the initial pre-trust view. B should likewise use its final child services settings.

## Files / decisions

- `lib/subagent-model-selection.ts`: requestedReference API, exact parent/object resolution, exact-full-id precedence, strict diagnostics, initialization-health gate.
- `lib/subagent-registration-ledger.ts`: per-runtime weak generation ledger; public pending provider id/extensionPath associations, sticky provider failures, later public registration interception. No raw diagnostic parsing/source scanning/private SDK fields/provider singleton. Errors/config/keys/files are not emitted in safe DTOs. A failed extension factory with no public provider id makes that child generation incomplete and conservatively refuses execution, rather than declaring retained context healthy. Normal-session UI/services are not globally instrumented.
- `lib/subagent-session-services.ts`: establishes ledger before pending queues drain, on both inherited services and provider-only hosts. Caller-provided runtime seam is explicitly documented as a child runtime, never a parent.
- `lib/subagents.ts`: missing file-profile fields default to inheritance; missing new save fields true; existing false and omitted-switch alias text remain authored. Explicit switch updates still follow the existing alias synchronization contract. Exported `SubagentProfileSaveInput` honestly makes the two omitted switches optional.
- `app/api/subagents/profiles/route.ts`: forwards omitted flags without coercion and explicitly rejects present non-boolean flags. Actual PUT/GET execution tests prove new missing defaults and existing false/alias preservation, including invalid writes leaving files untouched.
- `lib/subagent-coding-tools.ts`: single canonical/shell-mapped coding-name owner. Editable profiles map powershell to portable bash; snapshot/tool-policy decoder and runtime exclusion share the permission union including powershell.
- `lib/subagent-tool-policy.ts`: narrowly initializes builtin active set independently from persistent permission, preserving active extension loadout and coding-name override ownership.
- `lib/subagent-runtime.ts`: final-child-settings shell mapping, explicit-false-only C snapshot, initialization after ready, repeated exact selection gate after binding and before queue creation.
- `lib/subagent-review-fixes.integration.test.mjs`: real SDK memory runtimes/services/AgentSession/controller fixtures; no model/search network.
- `lib/subagent-resource-snapshot.test.mjs`: parseMissing/saveNewMissing/saveExistingFalse, authored alias text, canonical profile mapping and legacy powershell exact snapshot.
- `lib/subagent-runtime.test.mjs`: two old partial runtime doubles now declare their public registration methods (throw if unexpectedly used); no weakened assertions or any casts.

## Actual verification

Baseline dependency tree was retained: worktree lock-consistent npm-ci tree documented in baseline.md, Node v24.21.0/Pi pins 1.0.0. No install/SDK/lock changes.

First command verified inherited TMPDIR was `/home/xupeng/.cache/pi-tmp/01a111ee-9ce5-7540-97bf-c491bdf79967`; none of the validation used that real-HOME ancestor. Every run used a unique small `/var/tmp/pi-review-a-validation-home.XXXXXXXX`, unset XDG_STATE/CONFIG/DATA/CACHE, outer HOME + `$HOME/.cache/pi-tmp` for pi-tmp-run, then inner HOME=`$PI_TASK_TMPDIR/home` and PI_CODING_AGENT_DIR=`$HOME/.pi/agent` with isolated XDG cache. The outer EXIT trap removed each owned HOME. No `/tmp` or large source/dependency copy was created.

Final focused commands (all first cd the worktree):

```sh
node --test lib/subagent-review-fixes.integration.test.mjs \
  lib/subagent-model-selection.test.mjs lib/subagent-resource-snapshot.test.mjs \
  lib/subagents.test.mjs lib/subagent-runtime.test.mjs \
  lib/subagent-tool-policy.integration.test.mjs lib/subagent-resource-loader.integration.test.mjs \
  lib/subagent-provider-run.integration.test.mjs app/api/subagents/profiles/route.test.mjs
node_modules/.bin/tsc --noEmit --incremental false
node_modules/.bin/eslint lib/subagent-model-selection.ts lib/subagent-session-services.ts \
  lib/subagents.ts lib/subagent-tool-policy.ts lib/subagent-runtime.ts \
  lib/subagent-registration-ledger.ts lib/subagent-coding-tools.ts \
  lib/subagent-review-fixes.integration.test.mjs lib/subagent-resource-snapshot.test.mjs \
  lib/subagent-model-selection.test.mjs lib/subagent-runtime.test.mjs lib/subagents.test.mjs \
  lib/subagent-tool-policy.integration.test.mjs app/api/subagents/profiles/route.ts \
  app/api/subagents/profiles/route.test.mjs -f json
node --test lib/subagent-provider-sources.integration.test.mjs lib/subagent-model-restore.integration.test.mjs
```

| Gate | Actual count / result | Evidence |
|---|---|---|
| Owner focused + actual profile route | **112 tests / 112 pass / 0 fail/skip/cancel/todo**, exit 0 | `review-a-final-focused-tests.log` |
| Typecheck | exit 0 | `review-a-final-focused-tsc.log` (empty) |
| Focused ESLint | **15 files / 0 errors / 0 warnings**, exit 0 | `review-a-final-focused-eslint.json` |
| Current compatibility C/source + SDK/RPC/route restore matrix | **18 tests / 18 pass / 0 fail/skip/cancel/todo**, exit 0 | `review-a-compatibility-tests.log` |
| Owner tracked-file diff check | exit 0 | command output checked directly |

These are snapshots during concurrent B development, **not final full npm test/full lint/full browser acceptance**. Earlier 2935/718/full-tsc green is not evidence for new counterexamples. The 18 compatibility tests were run read-only; B's owned files/tests were not edited.

### Executed assertions (not source-regex or browser claims)

- Real SDK memory runtime containing base gpt rejects exact retired `gpt:free`, `gpt:invalid`, `gpt@retired`, and `gpt:high` refs; requestedReference wins even with a valid requestedModel. Exact parent refs reject too. String invalid-thinking diagnostics cannot select base gpt; valid thinking and unique SDK alias pattern still resolve. Authentic full suffix ids stay exact. Refusals make **0 provider calls**.
- Inherited pending legacy valid→invalid registration retains SDK old gpt but selection rejects it; unrelated healthy provider can still be selected. Native failure also rejects. session_start re-registration via bound public callbacks stays unhealthy until a new successful loader generation. Failed factory errors cannot borrow old context. Safe DTO contains no fixture secret/endpoint/raw registration text.
- Actual inherited controller bad legacy factory sentinel proves the factory really ran; failure creates **0 wrappers/queued runs/provider calls** and does not mutate the parent's catalog.
- Actual new controller explore/general-purpose await real bindExtensions and declare `[read,grep,find,ls]` / full licensed coding set alongside session_start late_search. Only two local faux child requests, parent requests 0; inherited snapshots have no providerSources. Direct real SDK request transcript system toolsAdded independently proves declarations, not merely registry membership.
- Cold-helper pins preserve ext_keep but not manual-off/hidden/default-inactive tools; inactive extension grep override stays inactive. Empty coding pins do not resurrect coding tools.
- win32 mapping function executed on Linux maps bash to powershell; JSON snapshot round-trip decoder accepts it and real SDK registered powershell becomes active, bash stays excluded. Canonical profile edit and old exact snapshot remain distinct. Independent child cwd/project override tests execute both final trust accept/revoke branches, proving pre-trust mapping would differ from final settings. Parent settings getter throws if consulted by actual new controller fixture.
- Actual profile HTTP handler PUT/GET executions cover missing new flags, false/none/whitelist aliases, malformed boolean values, and no overwrite on refusal. Legacy snapshots still default false, no tool-policy migration.

## Honest failed attempts / fixture calibration

All initial logs were retained, not rewritten as passes:

- `review-a-initial-tests.log`: 28 / 21 pass / 7 fail. Corrections: use a coherent cached Jiti module graph for module-local ledger state (separate uncached imports had separate ledgers), await faux runtime offline availability initialization, assert declarations from transcript system messages instead of obsolete context.tools, provide required parent snapshot identity, and use actual supported SDK bare alias syntax.
- `review-a-refined-tests.log`: 28 / 27 / 1; too-broad `gp` alias legitimately matched a builtin model. Replaced with a unique review alias, not modified product resolver behavior.
- `review-a-focused-tests.log`: 102 / 100 / 2; old partial runtime doubles lacked public registration methods. Tests were corrected, product ledger was not weakened.
- `review-a-focused-retest.log`: 104 / 103 / 1; SDK automatic discovery ignores `.mjs`. Changed only the synthetic discovered fixture to `.js`, added real factory sentinel assertion (earlier rejection alone was insufficient evidence), then `review-a-controller.log`: 11 / 11 pass.
- Latest expanded owner/route/trust run is the 112/112 result above; no unvalidated product patch remains after that run.

No system apply_patch executable was installed. Existing-file changes used a narrow shell `apply_patch() { patch -p1 --forward; }` with Python-generated unified exact hunks; no temporary patch/helper file remains. New files used the write tool.

## Remaining responsibility / risks

- B/main must finish exact HTTP/persisted call-site adoption and cold policy helper invocation, then re-run final full gates and fresh Chromium acceptance. Browser default provenance blocker is not claimed resolved by these focused runtime tests.
- Safari/Windows were not run. The explicit win32 parameter tests are Linux execution, **not a Windows platform pass**. No live model/search, real pi-sub2api, network catalog, paid provider, browser or Next build was used by A.
- A factory load failure without a public provider id conservatively makes that child generation incomplete; arbitrary trusted extension factory/import side effects remain outside sandbox guarantees. The ledger's ordinary loader-generation reset is tested, not arbitrary module hot-replacement.
- No commit/push/archive/deploy, real settings/auth/history edits or SDK/lock changes. Owned validation HOMEs were verified absent; no A-owned service was launched or left running. Only formal source/tests/research evidence remain.
