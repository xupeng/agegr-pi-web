# Independent check — upstream MCP / Code mode candidate

## Status / reviewed boundary

**Post-fix status: the main-approved F1/F2 repairs are implemented and all final static/Node gates pass (2121 units).** The append below supersedes the original unresolved disposition; historical already-promoted Agent snapshots remain an explicit limitation. Browser evidence and the eventual merge commit are owned by other agents/main, not certified by this report.

The initial review was not acceptance-ready because F1/F2 required a main-session decision. Its evidence and first-round gate numbers below are preserved.

- Sole edited checkout: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-mcp-codemode-20261002`.
- Branch: `merge/upstream-mcp-codemode-20261002`; unchanged HEAD/L `93e63e873481aea761cb2b2072c8a2da1654dc73`; unchanged MERGE_HEAD/U `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`.
- Reviewed **working-tree result against HEAD and U**, not only unstaged changes. Included staged resolution, unstaged compatibility changes, both untracked Node regression files, all 27 conflict-path hunk records, and high-risk automatic merges.
- Loaded PRD/design/implement, curated check specs/research, conflict decisions, implementation and independent baseline reports. Main-checkout CodeGraph was used to explore `snapshotWrittenFiles` relationships; it indexes L, so candidate conclusions use actual candidate reads and `/usr/bin/git` diffs.
- Independently reran `git merge-tree --write-tree --name-only HEAD MERGE_HEAD` (read-only to refs/index). It reports the same 27 conflicts. Compared non-conflict working blobs to that automatic tree; remaining differences are the documented compatibility followups and this check's test. Evidence: `logs/check-auto-tree.log`. No unexpected automatic-merge replacement was found.
- `logs/check-reviewed-files.json` records SHA-256 of the changed paths at this review boundary, including the concurrently added browser fixture and new spec. It is a change-detection aid, not a committed-tree claim.
- No commit, push, archive, staging, service startup, browser launch, Next build, paid provider or user MCP was performed. No e2e/test-results file was edited by this agent.

## Findings (real code evidence)

### F1 — P1: child result summaries can be laundered into trusted Agent snapshots — initially unresolved; prospective fix below

Evidence chain:

1. `lib/tool-names.ts:37-43` accepts decorated names ending `_apply_patch` or `.apply_patch` as apply-patch UI tools.
2. `lib/written-file-sources.ts:363-381,496-543` pairs assistant calls/results and applies that broad predicate to structured `details.result.summaries`, without checking the source of the tool.
3. `lib/subagent-runtime.ts:200-205,441,583` uses this same render-facing extractor for completion `writtenFiles` snapshots.
4. `lib/subagent-extension.ts:114-118` copies those paths into `Agent`/collection/notification details.
5. `lib/session-file-references-core.ts:8-20,130-145` considers the exact host subagent tool names path-reporting and recursively collects their entire result. Its newly added exact-name gate at lines 106-112 applies only to the untrusted-result branch; it cannot recover lost child provenance.

Independent executable probe using the candidate's actual two functions:

```js
const p = '/outside/remote-invented.md';
const child = [
  { type: 'message', message: { role: 'assistant', content: [
    { type: 'toolCall', id: 'c1', name: 'mcp__remote_apply_patch', arguments: { input: 'noop' } },
  ] } },
  { type: 'message', message: { role: 'toolResult', toolCallId: 'c1',
    toolName: 'mcp__remote_apply_patch', content: [],
    details: { result: { summaries: ['add: ' + p] } } } },
];
const writtenFiles = extractWrittenFilesFromEntries(child, '/project');
const parent = [{ type: 'message', message: { role: 'toolResult',
  toolName: 'Agent', toolCallId: 'a1', content: [], details: {
    kind: 'pi-web-subagent', sessionId: '00000000-0000-4000-8000-000000000000', writtenFiles,
  } } }];
```

Observed output: `writtenFiles=[{filePath:p,operation:'add',origin:'apply-patch-details'}]`; `isFilePathReferencedByEntries(p,child) === false`; `isFilePathReferencedByEntries(p,parent) === true`. No write or model path argument established that file. Thus the direct namespaced-spoof negative test does not cover the host's snapshot boundary.

**Trigger limitation:** new/reopened children do not receive host built-in MCP factories. The supported path requires a child explicitly loading a third-party extension/tool (profiles allow `loadExtensions` and `extensionTools`, `subagent-runtime.ts:287-304`), or a resumed recorded child carrying that result. This is not a claim that the default host MCP secretly connects in children. The card's child `sourceSessionId` can still cause its own opening attempt to be denied; the demonstrated bad grant is the parent's session-reference fallback after the host promotes the result. User/assistant references that U intentionally permits are not part of the requested restriction.

**Suggested disposition:** gate which structured-result sources may enter a host completion snapshot, while retaining the existing parser, genuine exact apply_patch/Trellis/Agent writes, relative paths, and model-issued arguments. Do not globally tighten the UI decorated-name helpers or prohibit allowed user/assistant prose. Requires an explicit source-policy decision and a child→snapshot→parent negative regression; no silent redesign was made here.

### F2 — P2: historical navigation drops enabled ask_user — initially unresolved; fixed below

- `lib/rpc-manager.ts:271` includes codemode/tool_search/subagent controls in `SESSION_TOOL_NAMES`, but not fork `ask_user`.
- `navigateTreeKeepingToolSelection` at lines 795-803 keeps only target-branch active tools plus the old active session-tool set. A branch recorded before ask was enabled can therefore remove the host question capability.
- Executed the real wrapper with the same structural inner fixture pattern as `rpc-manager-tool-exposure.test.mjs`: before navigation `active=['read','ask_user']`, target historical loadout `['read']`; after successful `navigate_tree`, **active remains `['read']`**. The old fork helper preserved ask across navigation.

**Suggested narrow fix:** include only already-active `ask_user` in the session-level carry set and add navigation tests for enabled/disabled/hidden ask. This preserves U's registered≠active distinction, Chat-only and child isolation; it does not restore the old activate-every-extension helper. Since the session-vs-branch policy is an interface decision, this agent reported the exact proposal and stopped this modification pending main approval.

### F3 — P2: new chat labels ignore the fork font preference — fixed

Three new surfaces had bare `fontSize: 11`: `ChatWindow.ExtensionWaitingCount`, historical-edit cancel button, and collapsed Code mode call count in `MessageView`. Converted those **three new elements only** to `calc(11px + var(--chat-font-size-offset, 0px))`. Existing unrelated fixed-size chrome was not rewritten. `CodemodeToolView` already used the shared offset/CodeBlock correctly.

Regression added to `components/ChatAppearance.test.mjs`: verifies all three new elements use the shared variable and Code mode component contains no numeric fontSize. This is source-level regression evidence; browser geometry is a separate agent's responsibility.

### F4 — P3 documentation accuracy: atomic settings write claim — main-owned

The initial `mcp-codemode.md` says global settings use an atomic minimal edit. `lib/global-settings-file.ts:64-71` instead locks, parses, **writes the destination in place with `writeFileSync`**, then chmods it. SDK same-path locking and mode 0600 are true; rename-based atomic replacement is not. This is inherited from L's PowerShell write policy, not a newly invented merge regression. Requested main correct the claim and retain the crash-corruption limitation, or explicitly approve a separate product adaptation. No settings architecture rewrite was made.

Also the spec's claim that all structured Agent grants reuse successful exact-name evidence is stronger than current code: F1 and PATH_REPORTING_TOOL_NAMES bypass that decoder. Main owns this spec and its final wording.

## Full-scope review results

All 27 conflict paths were checked against the two sides' hunk intents and actual candidate changes:

| Paths | Result |
| --- | --- |
| `AGENTS.md`, `README.md` | Fork identity/watchdog guidance retained; U lifecycle/MCP/Code mode guidance added, no browser MCP panel claim. |
| `app/api/file-index/route.ts`, `app/api/files/[...path]/route.ts` | Deleted-index subtraction/UNC retained; shared visibility, parent-segment rejection, realpath/linked-directory authorization adopted. Visibility is not authorization. |
| `components/ChatInput.test.mjs`, `ChatInput.tsx` | Touch Enter/newline and pending image semantics retained alongside send-mode matrix, IME and completion priority. |
| `components/ChatWindow.tsx` | Persistent ask and Trellis callback retained; independent dialog/custom queues, compaction status, history edit/fork, tail key present; F3 fixed. |
| `components/MarkdownBody.test.mjs`, `MarkdownBody.tsx` | Index-verified links and unified options object retained; U plugin/CJK/image/line-break behavior included. |
| `components/MessageView.tsx` | PathText/written-file/source-session/watchdog/minimap structure retained alongside Code mode/MCP cards and recovery/edit controls; F3 fixed. |
| `components/SessionSidebar.tsx` | Two-level on-demand catalog, targeted row overrides, request ownership, family suppression, fixed windowing remain; DismissButton/U explorer controls integrated. |
| `components/SettingsPanel.tsx` | Append-system/extension visibility/font shortcuts retained; U Code mode/send-key settings consume shared DTOs. No font offset leaked into settings. |
| `hooks/useAgentSession.test.mjs`, `useAgentSession.ts` | Ask close-race/state polling/Trellis owner and tail primitive retained; U queue/reconnect/history/Code mode changes included. |
| `hooks/useViewportHeight.test.mjs`, `useViewportHeight.ts` | Scale-aware 60px threshold and settle chain coexist with focus retries/capture fallback; transition-only page repair and cleanup retained. |
| `lib/agent-event-wire.test.mjs` | Both fork Trellis final evidence and U slim nested/capped-progress tests retained. |
| `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | Union of stall/ask/fork strings and U strings; registry key/placeholder checks pass. |
| `lib/message-display.ts` | Stall formatting remains separate from added assistant-answer predicate. |
| `lib/model-catalog-refresh.integration.test.mjs`, `lib/pi-types.ts` | SDK 0.99.1 prompt dispositions/current readonly prompt preserved; nested/exposure additions retained. |
| `lib/rpc-manager-shutdown.test.mjs`, `rpc-manager.test.mjs` | Both sides' lifecycle/admission/mock contracts retained, including replacement-ask regression and clone directory-delta assertion. |
| `lib/rpc-manager.ts` | Lazy MCP/Stop/closing/identity, acceptance-only ask invalidation, inner watchdog retained; F2 is the remaining carry omission. |
| `lib/subagents.ts` | Written-file metadata and U resumed-run/allow-deny selectors retained; snapshot source issue is F1. |

Automatic-merge/cross-layer audit:

- `session-reader`: U changes only the flush-timing comment against L; fork disk-mtime cache/single-flight/generation/allowStale/pagination/targeted reading were not replaced by the alternate upstream scanner.
- `AppShell` / sidebar: URL > tab > workspace guards and single-row refresh remain; U branch-switch lock is wired through both navigator mounts. Trellis cleanup still uses owner identity; sourceSessionId/modeHint/page remain forwarded.
- New and reopened child loaders preserve resource snapshots and exact prompt; neither loads the host builtin array. U control tools are model-only, and consumed completion identity includes completedAt. F1 is not an accusation of default MCP child loading.
- Watchdog observes raw inner events before SSE projection; nested bash gets its own budget without top-level replay. Parent end removes descendant tracked calls. agent_settled/Stop/completion/dispose paths disarm, and old-wrapper destroy checks registry identity before forgetting ask.
- MCP host/transport: initial empty server config, project trust passed to SDK, serial diff sync, cancellation and no-run idle cleanup, exposure downgrade without sandbox, read-only nested pipeline, and sanitized stdio/fail-closed SDK adapter are present and exercised by fixture tests. No registered→active blanket helper was reintroduced.
- SSE final exception is exact top-level tool/kind and details-only; coalescing drops pending updates at end, nested updates are omitted. Trellis projection bounds are **not a hard byte cap on raw producer details**.
- Authorization retains U's intentional user/assistant/tool arguments, coding nested arguments and fullOutputPath while denying system/context_edit/codemode store/untrusted result prose. Exact apply_patch/Trellis direct compatibility gate exists; F1 identifies its missing transitive snapshot boundary, not a reason to undo U policy.
- Shared successful write extraction still prioritizes summaries/appliedFiles, never preview-only; card existence is not authority. Symlink/outside-root/link-target checks use shared path boundaries; no new checker was copied.
- Package/lock identity remains `@xup3ng/pi-web@0.12.0`, all four direct SDK pins are 0.99.1. @types/mdast, Safari/iOS browserslist and both email loader paths/Mermaid transpilation are present. No eslint/tsconfig gate weakening or tracked product deletion.
- Other automatically absorbed API/settings/plugin/skills/model/worktree changes were inspected for shared DTO/trust/path/platform boundaries. They follow U; this report does not certify a redesign of all inherited upstream behavior.

## Spec accuracy review

Read main's new `mcp-codemode.md`, frontend index registration and upstream-sync §8. Accurate on registered vs active, two queues/connected.pendingExtensionUiIds, no MCP panel, global automatic/always behavior, nested policy, child isolation, and Trellis final exception without bytecap promise. F1/F4 require correction or product decisions; F2's proposed fix would also require listing ask among session-level navigation tools. The narrow ask/watchdog/mobile specs match the implemented exposure, old-wrapper identity, nested budget/replay and scale/settling rules. No same-name spec was written by this agent.

## Changes made by this check

Only:

1. `components/ChatWindow.tsx` — one new label font.
2. `components/MessageView.tsx` — two new label fonts.
3. `components/ChatAppearance.test.mjs` — one regression test.
4. This task report and local verification logs.

Paths were announced before product edits for browser attribution. The shell has no `apply_patch` executable (attempt exited 127 without changing files); used harness exact replacements for the three surgical edits and new-file writing for this report. No git add was run.

## Independent verification

Candidate-local dependency tree is the implementer's clean `npm ci --include=dev` tree. This check independently ran the gates, not another install or L baseline. Baseline source remains the independent baseline report: L tsc 0, lint 565/0/0, units 1755/1755.

| Gate | Independent result | Evidence |
| --- | --- | --- |
| Initial `tsc --noEmit` | exit 0, no diagnostics | `logs/check-tsc{,-exit}.log` |
| Initial `npm run lint -- --format json` | exit 0, **627 files / 0 errors / 0 warnings** | `logs/check-lint{,-exit}.log` |
| Initial isolated `npm test` | exit 0, **2105 tests / 2105 pass / 0 fail**, 13 suites; 0 cancel/skip/todo; 159988.589518 ms | `logs/check-unit{,-exit}.log` |
| Post-fix focused | exit 0, **197 tests / 197 pass / 0 fail**, 0 cancel/skip/todo; 14555.573962 ms | `logs/check-focused{,-exit}.log` |
| Post-fix final `tsc --noEmit` | exit 0, no diagnostics | `logs/check-final-tsc{,-exit}.log` |
| Post-fix final lint | exit 0, **628 files / 0 errors / 0 warnings** | `logs/check-final-lint{,-exit}.log` |
| Post-fix final full unit | exit 0, **2106 tests / 2106 pass / 0 fail**, 13 suites; 0 cancel/skip/todo; 192643.402695 ms | `logs/check-final-unit{,-exit}.log` |
| staged and unstaged diff checks / unmerged index | exit 0; no unmerged paths, no tracked deletions | independently executed `/usr/bin/git diff --check`, `diff --cached --check`, `ls-files -u`, `diff --name-status HEAD --diff-filter=D` |

+1 final unit is this check's font regression. +1 lint target during checking is the browser agent's `e2e/upstream-interactions.mjs`, not a new lint rule or product file from this agent. Candidate vs L: +351 passing tests, +63 lint targets at this boundary.

Full unit command (both independent rounds):

```sh
iso=$(mktemp -d /tmp/pi-web-check-final-XXXXXX)
mkdir -p "$iso"/{home,tmp,agent}
env -i PATH="$PATH" LANG=C.UTF-8 NODE_ENV=production \
  HOME="$iso/home" TMPDIR="$iso/tmp" PI_CODING_AGENT_DIR="$iso/agent" npm test
```

No global PI_OFFLINE. Fixture roots are /tmp; no provider/MCP credentials inherited. Focused command used the same isolation and `node --test` with ChatAppearance, MessageView, ChatWindow.extension-request, ask codemode + portable tests, session-file-references*, rpc watchdog/shutdown/exposure*, mcp-host*, exact-system-prompt*.

## Initial acceptance limitations (superseded by the post-fix status below)

- F1/F2 unresolved; do not label AC2/AC4 unconditional passes because all current tests happen to pass.
- Browser agent is concurrently adding/running isolated Chromium fixtures. This check has not claimed those assertions or edited its files. Final main-session scope review must include its finished fixture/report and any later product/doc fix.
- Merge is still uncommitted: U is MERGE_HEAD, not yet proven ancestor of HEAD; AC1's final merge ancestry and archive/journal closeout remain main's work.
- No Safari/iOS 16.2 hardware, Windows hardware, actual user MCP/OAuth or paid provider request. Source/config/Node results do not certify those platforms.
- Existing dependency advisories were not remediated here; no npm audit fix or unrelated dependency upgrade was attempted.

---

## Post-fix check — main-approved F1/F2 followup

Main explicitly approved both repairs as existing security/fork-preservation scope. Product/test paths were announced before editing. No further dispatch, staging, commit, archive, e2e or main-owned spec edits were performed. The unavailable `apply_patch` command was not replaced by a script that overwrites source; all followup source/test/report edits used harness exact replacements.

### F1 disposition and executable contract

**Fixed at both fresh and reopened/resumed host completion-snapshot boundaries.** The only parser remains `written-file-sources.ts`; its structured success and legacy summary parsers, counts, relative resolution and dedupe are unchanged.

- Added `WrittenFileEvidencePolicy = "render" | "snapshot"`.
- `extractRawWrittenFiles(toolName, input, result, policy = "render")` now refuses result-controlled apply_patch evidence in snapshot policy unless the tool name is exact/trusted. The guard precedes both structured and legacy text paths; it is not an `mcp__` blacklist.
- `extractWrittenFilesFromEntries(entries, cwd?, policy = "render")` forwards that explicit policy.
- `isTrustedWrittenFileResultToolName(toolName: string)` is the shared exact gate (`apply_patch`, existing Trellis constant, existing Agent constant). `session-file-references-core` reuses it instead of maintaining a second result-source name list; its explicit `toolName !== undefined` guard preserves strict typing.
- Runtime's single `snapshotWrittenFiles` helper calls `extractWrittenFilesFromEntries(entries, cwd, "snapshot")`; both new-child and resume completions already go through it.
- `tool-names.ts` and render defaults remain unchanged. Decorated write/edit still obtain their **path from model-issued call arguments**, not remote result summaries. Edit details can enrich counts but cannot nominate another path. Errored calls do not produce successful-write snapshots. U intentionally permitting user/assistant prose and call arguments is not undone.
- Normal exact apply_patch success, older exact text summaries, successful Trellis traces and valid exact Agent snapshots remain available. Preview-only, empty authoritative summaries, deletions, failed patch calls and failed Trellis traces do not establish writes.

Regression evidence:

1. Full **child entries → snapshot policy → real `subagentToolDetails` → parent Agent authorization** chain rejects structured and legacy summaries for three decorated forms: `mcp__remote_apply_patch`, `remote.apply_patch`, `apply_patch_remote`. The render extractor still returns their cards, proving that rendering was not globally restricted.
2. Positive exact patch/Trellis/Agent tests, relative path/count assertions, preview/error/delete negatives and decorated write/edit model-argument tests preserve the legitimate contracts.
3. A real SDK-created new child/manager, with only its provider turn substituted, writes real /tmp fixture files and injects structured/legacy/preview/error evidence; its actual completion snapshot and parent authorization reject all invented paths and retain confirmed paths.
4. Resume test explicitly exercises `reopenSession` after cached-run discovery and checks the same complete chain. It does not merely assert a source substring.
5. A direct owner test ensures snapshot and authorization share the same exact gate; uppercase/decorated render recognition does not become snapshot authority.

**Wider Agent/historical limitation (not hidden):** exact host Agent/get_subagent_result/steer_subagent result strings remain PATH_REPORTING sources under U. An already-persisted parent `Agent.writtenFiles` has lost the original child tool provenance. The existing pure authorization/snapshot parser cannot distinguish a previously polluted historical snapshot from a genuine one; nested historical exact Agent snapshots can retain that pollution. This patch prevents newly promoted decorated apply_patch results, including when rescanning a resumed child's decorated-call history, but does **not** migrate/revalidate earlier promoted Agent records. Changing that would require an explicit historical provenance/child-session revalidation policy, not a second parser or a silent ban on U's allowed Agent/model text. No default built-in MCP child loading or plugin sandbox guarantee is claimed. A final isolated probe (`logs/check-postfix-probe.json`) confirms `snapshotFiles=[]`, child/new-parent authorization both false, while a simulated already-promoted historical parent remains true. This residual is executable evidence, not an untested hypothetical.

### F2 disposition

**Fixed.** `SESSION_TOOL_NAMES` includes `ask_user`; navigation carries only names in `activeBefore`, then the existing resolver requires still-registered/non-hidden tools. No registered→active blanket activation was restored.

Four added wrapper tests cover:

- target history predating ask activation, both pinned and unpinned sessions;
- registered but inactive ask remains off;
- hidden ask is not restored;
- Chat-only and empty pinned selections are not repopulated.

Existing non-session extension branch rules, cancellation, subagent isolation and extension-command navigation tests remain passing.

### Followup files owned by this check

Products: `lib/written-file-sources.ts`, `lib/session-file-references-core.ts`, `lib/subagent-runtime.ts`, `lib/rpc-manager.ts`.

Tests: `lib/written-file-sources.check.test.mjs`, `lib/session-file-references.fork-evidence.test.mjs`, `lib/subagent-runtime.test.mjs`, `lib/rpc-manager-tool-exposure.test.mjs`.

These are in addition to the original three typography files listed above. **15 new tests** were added after the original post-typography 2106-test boundary. The original resume snapshot test was strengthened rather than removed.

### Final independent gates after F1/F2

| Gate | Result | Evidence |
| --- | --- | --- |
| Pre-fix red probes | exit 1; **31 tests / 24 pass / 7 fail** (six decorated-summary laundering cases and active-ask navigation) | `logs/check-fix-red{,-exit}.log` |
| Final `tsc --noEmit` | **exit 0**, no diagnostics | `logs/check-fix-tsc{,-exit}.log` |
| Final `npm run lint -- --format json` | **exit 0; 628 files / 0 errors / 0 warnings** | `logs/check-fix-lint{,-exit}.log` |
| Final isolated focused | **exit 0; 149 tests / 149 pass / 0 fail**, 0 cancel/skip/todo; 41206.064848 ms | `logs/check-fix-focused{,-exit}.log` |
| Final isolated full `npm test` | **exit 0; 2121 tests / 2121 pass / 0 fail**, 13 suites, 0 cancel/skip/todo; 347762.521247 ms | `logs/check-fix-unit{,-exit}.log` |
| staged/unstaged diff checks, unmerged index, tracked deletions | **exit 0; no whitespace issues / unmerged paths / tracked product deletions** | independently repeated after all product/test edits |

The full run includes the final owner-gate test by name, not just an inferred count. Compared with independent L baseline: **+366 passing tests**, +63 lint targets. No baseline gate or dependency pin was weakened.

Focused files: `written-file-sources*.test.mjs`, `session-file-references*.test.mjs`, `turn-written-files*.test.mjs`, `subagent-runtime.test.mjs`, `subagent-extension*.test.mjs`, `rpc-manager-tool-exposure*.test.mjs`, `chat-only*.test.mjs`, ask codemode integration and portable tests.

Both focused/full used `env -i PATH="$PATH" LANG=C.UTF-8 NODE_ENV=production HOME=<isolated /tmp>/home TMPDIR=<isolated /tmp>/tmp PI_CODING_AGENT_DIR=<isolated /tmp>/agent`, without PI_OFFLINE. Successful temporary roots and the interrupted-run root were removed; no real HOME or credentials were inherited.

Intermediate failures were not hidden: the first followup tsc caught an optional tool-name narrowing error, fixed by the explicit guard; the first reopen fixture lacked discoverable run metadata, corrected to retire the cached child between discovery/reopen. A 300-second concurrent gate parent command and a later lint wait hit harness timeouts. Those partial logs are preserved as `check-fix-*-initial/interrupted.log`; they are **not** accepted results. Final full/lint were run detached to completion with independent exit logs. Final lint's stale exit log was removed before rerunning it.

### Hash / concurrent review boundary

HEAD/L is still `93e63e873481aea761cb2b2072c8a2da1654dc73`; MERGE_HEAD/U still `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`. There is still no final merge commit/ancestry certificate from this agent.

`logs/check-postfix-reviewed-files.json` fingerprints **178 changed/relevant paths** at this followup boundary. Product SHA-256:

| Product | SHA-256 |
| --- | --- |
| `lib/written-file-sources.ts` | `0a54ba23ddbb4d7de5b3f17370354b4717b4cb04a4f92c1ca731898a06935237` |
| `lib/session-file-references-core.ts` | `6fd2123ed39bee3668e09b8614797ca033f6676c2faf91e33a12bd8fef1dfa3c` |
| `lib/subagent-runtime.ts` | `0442e5664a3b330180b7922760b5b04834d0ff442ece1d9c0baa1ba201ef6783` |
| `lib/rpc-manager.ts` | `ff8fe1620cbe27df110307700a3a93875668bae384e15edab93bf635e5cd85d3` |

Changes since the first review fingerprint outside this agent's ownership are main's MCP spec and browser-owned `e2e/README.md`, `e2e/run.mjs`, `e2e/subagents.mjs`, `e2e/upstream-interactions.mjs`. This check does not claim those later browser changes as independently executed assertions. Main must reconcile final browser scope and any later doc change before committing.

F4's original atomic-write wording is now corrected by main to SDK same-path lock, minimal field edit and in-place write/chmod 0600, explicitly disclosing interrupted-write corruption. Main still owns the final F1/F2 signature/source-policy wording and line anchors. No spec was rewritten by this check.

**Current conclusion:** approved F1 prospective source-boundary and F2 navigation fixes are verified; no further regression was found in these touched paths. Historical promoted-snapshot limitation, final browser coverage, actual Safari/Windows/MCP/provider coverage and final commit/archive ownership remain explicit rather than being certified by passing Node gates.
