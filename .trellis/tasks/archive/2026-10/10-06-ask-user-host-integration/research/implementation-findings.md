# Implementation findings (2026-10-06, implement agent)

## Product ownership and scope

- Removed the portable installable Pi package, local tool factory/schema/prompt/execute, bridge caller/resolver and tool re-exports. No AskUser production dependency or installation path was added.
- Retained Web v1 DTOs, host validation, browser answer validation/format, store/mirror and pure UI/controller under `lib/ask-user/`; view moved to `lib/ask-user/view/`. Existing UI/admission/late-close/late-destroy behavior is unchanged.
- Bridge-only inline host uses `pi.events.on` on the actual SDK loader, synchronously registers async open, validates version/identity/bounded payload and looks up alive matching registry wrapper at call time.
- Tool-map-only policy preserves discovered execute/schema/prompt/source and unrelated registrations, withdraws ambiguous sources, and projects declarable AskUser to model-only. Hidden remains hidden; defaultActive:false is unchanged. For prior codemode/deferred exposure, defaultActive:false preserves its original *non-default-activation semantics* after model-only projection; this is not an exact preservation of an omitted defaultActive property. Explicit SDK selection can still activate it.
- Chat-only has no host/resources; both new/reopened child paths remove AskUser from tool Maps and exclude its reserved name. Other extensions are untouched by AskUser policy. Factories execute before policy; no claim of preventing their initialization side effects.
- Settings retirement was owned by the other agent; no edits to its SettingsPanel/API/helper/i18n/test files.

## Important SDK evidence

SDK 1.0.0 `AgentSession.reload()` (`dist/core/agent-session.js`, reload builds runtime with includeAllExtensionTools:true) re-activates a default-active direct/model-only extension tool after setActiveToolsByName previously disabled it. This is native behavior for both unprojected direct and projected model-only tools, not Web active carry. Tests distinguish this from defaultActive:false/hidden/resource exclusions, which remain off; Web does not rewrite SDK reload selection. If the requirement instead means manually inactive AskUser must survive the SDK's own reactivation, that would require an explicitly approved special reload selection policy, not silently changing its definition or SDK. Externally installed AskUser currently declares direct/defaultActive unspecified.

Follow-up defaultActive review: the actual SDK does **not** use defaultActive ?? exposure defaults. At agent-session.js:2856-2862, _isActivatedOnRegistration requires _isDeclarable (direct/model-only) AND defaultActive !== false. Genuine SDK discovery + AgentSession reload regressions now prove both codemode/defaultActive:true and deferred/defaultActive:true stay inactive without Web projection (14/14 discovery tests passed). Retaining explicit true while projecting those definitions to model-only would autoactivate them. The current projection instead normalizes false, preserving inactivity but overriding the explicit field. This is an unresolved requirements trade-off reported to the main agent: either explicitly treat true as activation intent for model-only projection, or fail closed with diagnosis for these special combinations; exact flag preservation and exact native activation semantics cannot both be met through a tool-Map-only exposure rewrite. No SDK or out-of-scope active-set policy was added. The ordinary installed direct source is unaffected by this edge case.


The scoped `apply_patch` shell helper dispatched standard unified diffs through system patch because this harness has no apply_patch executable/tool. No write/edit tool, git commit/push/merge, external repository edits or service operations were used.

### Main-agent / independent-review resolution

The defaultActive question above is resolved by the independently tested native SDK semantics, not by preserving a misleading raw flag after changing exposure. Keep defaultActive:false normalization for original codemode/deferred (including explicit true), preserve the immutable source definition, and keep explicit SDK selection available. No new gate, facade or active-set rewrite is needed. Likewise, native SDK reload reactivation of registration-default tools is retained; Web adds no reactivation beyond that native behavior. See independent-review.md and the clarified design/spec.

## Quick current-tree verification (not final clean npm-ci gates)

- TMPDIR checked before probes: under ~/.cache/pi-tmp/01a10fa1-0133-753b-a8de-d7a674ed2441; finite commands used pi-tmp-run --keep-on-failure.
- SDK/Web imports isolated HOME + PI_CODING_AGENT_DIR before import, PI_OFFLINE=1, JITI_FS_CACHE=false; all providers faux, no real model request.
- Targeted AskUser/view/RPC exposure/shutdown/admission/subagent/settings-retirement tests: **235/235 passed**, zero skipped (4.30s).
- Touched file ESLint: **0 errors / 0 warnings**; browser runner node --check passed.
- Real SDK discovery fixture covers no package/no fallback/broken entry/resource exclusion/non-main/defaultActive false/hidden/codemode inactive/multiple sources/unrelated registrations and genuine AgentSession reload exclusion+restoration for three rounds, no accumulating listeners. Protocol unit coverage includes unknown version, foreign loader identity, missing/closing/wrong wrapper and bounded questions. Code mode only direct ask terminates after one faux call; scripts/ctx.executeTool cannot call model-only AskUser.
- New actual RPC startup integration passed: configured discovery + retired false/env0 -> exactly one posted/persisted ask -> graceful wrapper shutdown/rebuild -> original askId hydrated -> real submit/cancel -> same-session custom continuation. It uses a minimal test-only protocol peer, not the real installed extension.
- `tsc --noEmit --incremental false`: only 4 stale `.next` TS2307 imports of the route deleted by settings retirement; no product source diagnostics observed. Did not restore route, alter tsconfig, or manipulate another process's `.next`.
- Full npm test under globally forced offline/isolated HOME: **2741 total, 2714 passed, 27 failed**. Failures are in project-trust/route trust/builtin-MCP fresh-trust fixtures and four plugin-update fixtures (the latter explicitly return offline errors under PI_OFFLINE=1). Do not claim a clean pass or that these are proven baseline failures; main agent is normalizing baseline/candidate harness environments separately. No out-of-scope product fixes were made.

## Browser runner and exact invocation

No browser server was started by this agent; actual browser/installed-source results remain for main/check on the clean candidate. Existing e2e/ask-user.mjs is still a view command-stub test, not host evidence.

New `e2e/ask-user-host.mjs` starts only its own isolated next dev process/agent/home/project, copies a minimal test peer (default) or an explicitly selected installed source, and registers the complete offline faux Provider through SDK discovery. No production interface was added. It checks real API tool source/model-only, posted/persisted identity, one-call terminate, React submit/single/multiple/custom/supplement/unanswered, same-session continuation, reload/cancel, session switch/refresh restore, wrapper shutdown/rebuild via existing set_tools configured-loadout API, independent second device with SSE blocked so polling closes its card, actual General Settings in three locales with unrelated Appearance control, no AskUser section/reload/fetch and old API GET/PUT 404.

The source tree has no API kill command (agent POST supports no kill); existing set_tools with omitted toolNames is the existing graceful normal-wrapper rebuild path and returns recreated:true. This avoids inventing a production endpoint. Raw seeded history is used only for the *other* navigation session; the tested AskUser session is created through actual /api/agent/new.

From a clean candidate checkout with no active next dev graph:

```sh
PLAYWRIGHT_EXECUTABLE_PATH=/absolute/path/to/installed/headless_shell \
  ~/.pi/agent/bin/pi-tmp-run --keep-on-failure ask-user-host-browser -- \
  bash -c 'node e2e/ask-user-host.mjs; code=$?; mkdir -p .trellis/tasks/10-06-ask-user-host-integration/research/browser-protocol; cp -a "$PI_TASK_TMPDIR/results/." .trellis/tasks/10-06-ask-user-host-integration/research/browser-protocol/; exit "$code"'
```

For independent installed-source evidence, prefix that invocation with `ASK_USER_HOST_SOURCE=/absolute/path/to/independent/system-source-copy` and use a different evidence directory, e.g. browser-installed. The runner copies only top-level entry/source modules + package.json, never node_modules/.git/.codegraph; this matches the installed package's flat source layout. No default hardcoded external directory or fixed source revision exists. Source snapshots with a nested layout need an explicit fixture copy adaptation, not a product resolver.

Artifacts use PI_TASK_TMPDIR/results. No video; no tracing by default. Explicit `E2E_TRACE=1` retry enables trace collection, saves it only on failure; successful traces are discarded. Log/failure screenshot retained as appropriate. Runner stops only its own process group and closes its own contexts. pi-tmp-run cleans successful workspaces after evidence is copied.

## Remaining gates / limitations

- Final clean lock-consistent tsc/lint/full tests, actual installed-source SDK smoke and both protocol/installed browser invocations are not yet claimed passed.
- TUI UI, Safari/Windows, production bundle/distribution and live deployment/restart are untested/out of scope. Browser runner has syntax/lint verification only at this handoff.
- Persistence remains best-effort; answers remain fire-and-forget without durable outbox/exactly-once guarantee.
- Retained failure scratch directories from this agent's quick probes were removed after findings were recorded; the GNU patch .orig backup was also removed. No dev server/process was launched by this agent.


## Limited Settings browser-harness selector correction

Main agent reported candidate d6be566 reached the protocol host browser chain through discovered source/model-only, posted/persisted ask, wrapper rebuild, refresh/session switch, independent-device polling close and same-session submit/cancel continuation, then timed out at e2e/ask-user-host.mjs:151 waiting for `.settings-dialog`. Read-only inspection of research/browser-protocol/failure.png confirms Settings/General was already open: this was a test-selector bug, not evidence of a product Settings failure. Existing evidence files were not overwritten.

Checked current components/SettingsPanel.tsx, hooks/useTheme.ts, hooks/useI18n.tsx, lib/theme.ts, English labels and e2e/chat-appearance.mjs before the mechanical fix. Current dialog is role=dialog on `.settings-dialog-backdrop`, containing `.settings-dialog-surface`; `.settings-dialog` does not exist. Desktop navigation is role=navigation (`.settings-section-tabs`) with actual buttons, not ARIA tabs. `.settings-general`, `.settings-language-options`/role=radio, `.settings-theme-option` labels and native input name=theme/value=light all exist. Language options contain stable locale-code text; useI18n updates both html.lang and pi-locale. useTheme applies data-theme/pi-theme through a potentially asynchronous view transition.

Runner now selects the Settings dialog by its role plus actual inner surface, keeping the locator valid when its aria-label translates; selects General through the navigation/button roles; confirms the General heading; chooses languages by locale-code text rather than assumed order, scrolling each actual option into view and waiting for checked state; verifies html.lang/storage; clicks the existing theme label (input is sr-only), waits for applied data-theme/storage, checks the native Light radio; closes by the actual Close button role and waits for dialog removal. No new production selectors/interfaces, policy changes, service startup, planning edits or evidence-log changes.

This follow-up is verified only by node --check and targeted ESLint (both exit 0), plus git diff --check. The revised browser path has NOT been rerun by the implement agent; protocol and installed-source Chromium reruns remain for the main agent after refreshing its unique candidate snapshot.
