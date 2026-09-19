# Upstream v0.9.1 merge research

## Evidence and limits

Research only, 2026-09-12. No checkout merge, worktree creation, commit, build, test server, push, publish or old-task archive was performed. `git merge-tree --write-tree` writes unreachable Git objects but does not change refs, index or working files. Tests below are planned, not new passes.

Fixed inputs:
- L = `fdb21ff968b7d99e38aae0a9901f28206d3e5258` (personal).
- U = `8366762fa4b4ef3327f1b19e8ff7bf891a14c06c` (upstream release v0.9.1).
- B = `a26cc68df9227cb74253bddd7c59624aa475e61f` (verified merge-base).

Reproduction: `git merge-base L U`; `git log --oneline B..L`; `git diff --name-status B L`; `git log --oneline B..U`; `git diff B U -- <path>`; `git merge-tree --write-tree --name-only L U`. Substitute full fixed hashes. Local net diff has **311 paths** (including workflow/history and three deleted scanner files); upstream has **34 commits / 79 paths**. Net-diff intersection is **27 paths**, not just the **10 paths** shared with the last Trellis commit. [inventory.md](./inventory.md) records every local net path and every upstream commit; historical local commits predating B in wall-clock time still belong to `B..L` because of divergent ancestry.

Read skills in requested order, current PRD, frontend and thinking-guide indexes and relevant concrete contracts, all 09-09 planning documents, and 09-11 check report / Trellis contract. 09-09 task metadata still says in_progress: not evidence that publication failed, and not permission to archive it. Its documents lack final release evidence, so read-only `trellis mem search/context/extract` retrieved session `01a08315-1ca7-7aa2-b65c-a5e64d70fe29`: user reported successful publication; final assistant reported npm latest 0.9.2, verified artifact checksum, origin/personal at 8e49a9d, 1091 tests. This is historical evidence, not a fresh registry check. No broad history search was needed.

## Version / dependency finding

| Item | B / U / L | Planned resolution |
|---|---|---|
| Package identity | upstream @agegr/pi-web / same / @xup3ng/pi-web | Keep fork name, URLs, author, keywords, public publishConfig |
| Version | 0.9.0 / 0.9.1 / 0.9.2 | Keep local 0.9.2; upstream source release is a separate version line; no bump/tag/publication |
| Pi SDK | 0.85.1 at all three inputs (four @earendil-works packages) | No SDK upgrade or protocol migration |
| package-lock.json upstream delta | Only two 0.9.0 → 0.9.1 root version strings | Keep local fork lock metadata and dependency graph; do not blindly regenerate |
| pnpm-lock.yaml | Absent in B/U; local added 8016 lines at 084e312 | Preserve local lock; upstream did not change it |
| package scripts | L adds separate Trellis E2E and chained full E2E | Preserve both; run runners separately to avoid short-circuit masking |
| Runtime/tooling | engines >=22.19.0; upstream CI pins 22.19.0 | Current machine Node 26.1.0 / npm 11.13.0 / pnpm 10.33.0; record actual versions, prefer matching CI Node for comparison if available |

Local package-lock net delta versus B is 5 additions / 19 deletions, from previous release reconciliation, not a new upstream dependency update. Validate dependency sections equal across inputs and frozen installs; unexplained lock churn blocks integration. Existing node-pty postinstall writes to its installation, so dependencies must not share a writable node_modules with main.

## Actual text conflicts

Git 2.55.0 merge-tree returned conflict tree `dc169b56237a2349d95612bb14f217467950cad4` (not a usable merge commit). Inspected each marker region, including diff3 base, rather than counting overlapping files.

| File (10 total) | Conflict / resolution contract |
|---|---|
| app/api/sessions/[id]/route.ts | Imports, compressed detail response vs Trellis envelope, delete cleanup. Combine `jsonResponse(req, payload)` with bounded projection; preserve errors. Delete all actual built-in descendants using upstream graph and clean persistent ask for every deleted ID, including transient IDs without a path; preserve ordinary fork reparenting. |
| app/api/sessions/route.ts | Upstream gzip wrapper vs local sessionId/projectKey branching. Retain transient short circuit and targeted `readSessionById`, wrap resulting payload in jsonResponse; never reintroduce unconditional full scan. |
| app/api/sessions/runtime-route.test.mjs | Local persisted-ask fallback test adjacent to upstream replacement of intermediate-child reparent test with descendant deletion. Keep ask test; adopt new built-in deletion expectation, retain ordinary-fork tests. |
| components/AppShell.tsx | Upstream removes top-level theme/language panel adjacent to Trellis agents panel. Accept controls in Settings; preserve effectiveAgentFamily fallback, owner-filtered snapshot, record count/visibility and read-only detail panel. |
| components/ChatInput.tsx | Local model sorting/filter/image helpers vs new upward-menu subscription inserted at same location. Retain both complete functions and braces, preserve menu cleanup. |
| components/ChatInput.test.mjs | Imports plus image routing test vs new wrapping-arrow tests. Keep both test bodies and all exports; VM-extracted key handler needs local touch predicate fixtures too. |
| components/SettingsPanel.test.mjs | Extension visibility test vs language-in-General test. Keep independent tests, no mechanical brace splice. |
| hooks/useAgentSession.ts | Options, callback dependency arrays, tool end. Combine upstream live-model/SSE/active-tool changes with Trellis callbacks, refreshViewedSession and ingestion; remove obsolete sessionRunning destructure where unused. Clear shell active results AND ingest Trellis final evidence. |
| package.json | Fork name/version metadata vs upstream release bump. Keep local identity/version and E2E scripts. |
| package-lock.json | Root metadata conflict only. Keep fork identity/version; no dependency churn justified. |

Other shared paths auto-merge textually, not semantically: AGENTS.md, app/settings.css, AppShell.mobile-toolbar.test.mjs, ChatWindow.tsx, MessageView.tsx/test, SettingsPanel.tsx, e2e/run.mjs, lib/api-types.ts, three locales, rpc-manager.ts/test, session-reader.ts/test, lib/types.ts.

## Complete local-customization retention matrix

Each row must receive a post-merge pass/evidence or an explicit approved supersession; unchanged source is not alone proof of compatibility. The linked full path inventory prevents omission of non-last-commit changes.

| ID | Current local behavior / evidence | Retention checks |
|---|---|---|
| P01 | Fork release identity, scripts/release-{npm,personal}.sh, release-personal.yml, README translations, docs/release*.md | Preserve names/install examples, executable bits, workflows, npm metadata and both locks; never invoke release scripts |
| P02 | Oxanium UI, WenKai CJK, self-hosted Cascadia 400–700; app/layout.tsx:59 and globals.css:4/220/691 | Font assets/links remain; no reintroduction of next/font download; desktop/mobile rendering and code style warning check |
| P03 | hooks/useChatAppearance.ts:13/51/102 migrates old offset to upstream absolute size; 8e49a9d restored upstream size chain | Existing absolute key wins, old offset migrated once, malformed/blocked storage safe, shared 14px+offset CSS. Historical settings-dialog spec's old relative controller is superseded: do NOT resurrect deleted chat-font-preference or fixed responsive sizes |
| P04 | globals.css:821+ table scroll and MermaidBlock.tsx:320 shorthand style fix | Wide table scroll remains local, page not overflow; light/dark code has no background/backgroundColor collision |
| P05 | useViewportHeight.ts and useIsMobile.ts touch predicate; ChatInput.send-shortcut tests | Focus retries, transition-only scroll reset, viewport/keyboard bounds, iPad 744px coarse-pointer Enter newline, IME, Ctrl/Cmd+Enter |
| P06 | Settings CSS margin-auto, mobile full screen/safe area/scroll chain | New language UI and existing extension/ask controls stay reachable in short desktop and mobile Settings; no toolbar theme/language resurrection |
| P07 | ChatInput image routing, attachment API/helpers, image-mentions, MessageView previews, file-access.ts:45 | Image-capable model gets inline payload; other model gets saved absolute mention; pending preview, model switch, paste/drag/history restore; per-project .pi-web/attachments and home fallback remain readable after restart; ignored in file index |
| P08 | lib/extension-ui-settings.ts, settings API, rpc-manager widget/status filters | Default/rule visibility, top-level plugin listing, reload and TUI powerline hiding coexist; no deletion of extension tools |
| P09 | ask-user extension/store/persist/settings, agent/state routes, hook/card | Async follow-up, immediate submit/cancel, validation, supersede/stale response, supplement/lock/key reset, in-stream/empty-state layout, persistence + same askId after wrapper loss, cross-device 3s polling, delete cleanup |
| P10 | session-reader.ts:154–343, session-list-cache.ts, worktree.ts:42/54 | Incremental mtime disk cache, 30s single-flight/generation, 10min project cache/invalidation, targeted sessionId vs projectKey; deleted session-list-scanner.* must stay deleted, no parallel scanner restoration |
| P11 | SessionSidebar and AppShell content-vs-structure refresh, 8e49a9d | No force-clear empty-list race; per-key request/finally ownership, stale project keys, row override; 54px virtualization, rename pinned row, family aggregation and completion suppression preserved |
| P12 | fdb21ff Trellis bounded adapter/history/hook/UI/locales/E2E | Exact tool+kind, tuple IDs, 100 records/calls, 32 traces, 512Ki normalized text budget, persisted finals/current ancestors, explicit root, page-up non-replacement, evidence rank/watermarks, old request/SSE/cleanup rejection, read-only Last reported; no session/control/notification totals for records |
| P13 | .agents/.pi/.trellis configuration, extensions, scripts, task/spec/workspace history; AGENTS.md, eslint ignore, .gitignore/.gitattributes | Preserve files and current planning gate; upstream AGENTS corrections additive; no Trellis update, no producer changes or old task archive; keep union journal attribute (its referenced cli spec is absent here; do not add nonexistent JSONL context) |
| P14 | Prior intentional removals/reconciliation | 64341e0 reverted Electron traffic-light safe area; do not restore merely because d8469b5 introduced it. 8e49a9d is authoritative for font-size and family/virtualization fixes. Keep adapted tests, not old assumptions that undo upstream behavior |

## Semantic conflicts and targeted design

1. **Selected-session SSE/lease vs Trellis reconnect**: U maintains idle selected SSE, renews every 30s with 90s TTL (`session-liveness.ts`, hook), and `rpc-manager.onEvent` now replays latest active tool events for ALL tools, not only bash. Previous spec statement that reconnect never replays partials is no longer globally true. Preserve upstream replay, but treat Trellis replay as untrusted last-reported evidence: historical allowed call IDs + head-following/request/view generation gates still required; no ownership from tool_execution_start, no durable/liveness claim, no reopening another branch. Early replay before history may be rejected; this must not erase later canonical finals. Amend owning spec only during approved implementation to describe actual behavior, not silently remove server replay.
2. **Resume opening stream**: upstream `dispatch({type:'resume'})` preserves streamingMessage; don't replace with start, and retain active bash/powershell output in ChatWindow tool map. Canonical result wins over partial; settlement clears active result map while Trellis records survive with evidence semantics.
3. **Navigation and live models**: upstream handleNavigate waits for navigate_tree, checks cancelled and reloads canonical head; merge-tree auto-applies this without Trellis conflict markers. Guard async completion with request/view ownership to prevent late navigation restoring stale branch. Keep deliberate Edit-from-here navigation distinct from passive historical settlement (`refreshViewedSession`), which must not jump to head. Audit new syncLiveModel calls after awaits for A→B→A/stale responses, not only Trellis state.
4. **Delete descendants**: U's traversal follows `relation.kind === 'subagent'`, not arbitrary header/fork links or Trellis run IDs. Clean local ask per deleted ID, cache per path/ID, reject stale hook publications on selected-parent disappearance; survivor forks keep their own copied Trellis history and re-scoped tuple IDs. Abort queued/live descendants before removal. Test child paths in another worktree and transient descendants. No broad deletion of unrelated fork sessions.
5. **Cache vs queued/resumed lifecycle**: upstream introduces pi-web:subagent-status and keeps resourceSnapshot exactSystemPrompt/worktree metadata. Local reader uses bounded prefix + tail (`session-reader.ts:105–117`) then updated readSubagentRun, not deleted scanner; verify latest status/result order survives warm cache and targeted fetch. Don't claim unbounded historical lifecycle visibility or fix deferred short-lifecycle sampling gap in this task.
6. **Profiles and Trellis configuration**: upstream save preserves unmanaged frontmatter, ext selectors, whitelist aliases and rejects malformed frontmatter. Test synthetic copies of Trellis-like profiles (`allowed_subagents`, `exclude_extensions`, unrelated keys); do not save UI edits into real .pi/agents. Built-in Agent queue/resume/worktree remains separate from trellis_subagent snapshot adapter; no new Trellis wire version.
7. **UI auto-merges**: upstream moves theme/language to Settings, changes extension prompts to Markdown, first-message fork and Edit semantics, quota panels, plugin list, menu position/wrap and duplicate command lock. Preserve local ask card layout/image/Enter behavior and records-only mobile entry. Source-regex tests must be updated to intended contract, not weakened to pass.
8. **Transport/push**: compressed detail/list responses must retain all additive fields and content headers; context endpoint remains its existing implementation (U did not change it). Provider quota errors must not leak credentials. Test push service worker payload/background behavior with mocks; never contact real push subscribers/provider accounts.

## Isolation facts and constraints

- Main worktree is personal@L. Existing `/tmp/pi-web-0.9.2-verify` is a prunable detached registration at 8e49a9d: do not prune/reuse it implicitly.
- Read-only process check: main Next PID 294238 listens on 192.168.11.47:8505; installed npm 0.9.2 PID 1539 on :26812. Standard package dev script uses 30141, so checking only 30141 is insufficient. Recheck ports/PIDs/cwd at execution time; never stop either service.
- Each candidate/baseline needs independent source, .next, test-results and node_modules. No main node_modules symlink/hardlink: Turbopack root resolution and native postinstall make that unsafe. Prefer `npm ci` from retained package-lock in each fresh directory; pnpm frozen install is an alternative using its own local virtual store. Never run both mutating installers over main or regenerate locks to hide a frozen failure.
- Set fresh absolute `PI_CODING_AGENT_DIR` **before Node imports**: ask/cache paths are module constants from getAgentDir. Unit runs each get a separate directory. E2E runners already allocate their own agentDir/project and spawn localhost dynamic-port dev servers, reject active .next/dev/lock, and clean their own processes/data.
- PI_CODING_AGENT_DIR is not filesystem isolation: attachment fallback uses os.homedir(), project attachments resolve main projectRoot for linked worktrees, resource loaders may read project .pi, provider auth may use inherited environment. For attachment/profile/worktree tests use a disposable independent git fixture (not this repository) and a separate HOME/XDG directories, scrub credential/provider env and never copy auth/settings/sessions. Pass explicit available browser executable/cache path when HOME changes. Permit external fonts as documented or record blocked-font limitations, not account network traffic.
- Available browser cache currently has chromium_headless_shell-1234; historical Playwright expected 1243. Prefer pinned compatible browser installed in isolated cache if available; otherwise optional PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, same binary for L/candidate, report mismatch. Chromium viewport checks are not real iOS/WKWebView or background push device validation.
- No next build (even isolated) is required/authorized by this task. E2E uses Turbopack dev, sequentially per worktree. Capture artifacts before cleanup, and verify generated Next AGENTS block/next-env/.next never enters commits. Stop only child processes launched by the test runner.

## Historical validation is not a waiver

09-11 `research/check-report.md:64–91`: 68 focused / 150 related / 1164 isolated full Node tests passed; tsc passed. L baseline lint had 16 preserve-manual-memoization errors: ChatInput 7, ChatMinimap 5, SessionSidebar 2, useAgentSession 2. Original full E2E failed at `e2e/chat-appearance.mjs:88` language option hit-test on both copies; Trellis desktop 1280×800/mobile 390×844 passed.

Re-run L and candidate with identical Node/dependency/browser/environment, record lint rule+file+enclosing symbol/message (not just total or moving lines), exit codes, per-test totals and artifacts. Upstream modifies hook/UI/Settings, so previous 16 errors or appearance failure cannot automatically be grandfathered. If failure disappears, record fixed; if unchanged, document exact equivalence; new/different failures block integration. Run original E2E and Trellis E2E separately even if original fails. If early original failure masks later phases, mark those unexecuted and run independent targeted phases in an isolated harness without weakening the original suite; do not call full E2E passed. Existing proven-equivalent failures remain explicit limitations requiring user acceptance at the integration gate.
