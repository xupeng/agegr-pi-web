# Fixed-input Git inventory

Generated read-only from B=a26cc68, L=fdb21ff, U=8366762. A/M/D preserve Git net status; deleted paths must not be mistaken for active customization files.

## All personal commits reachable after B

```text
fdb21ff feat: show Trellis subagent execution snapshots
8e49a9d fix: restore upstream behavior after merge
d6d028b chore(task): record sync-upstream-release task artifacts
78c884c chore(merge): clear lint warnings from merged test harness leftovers
9eff808 fix(merge): reconcile ChatInput suite and ask-user layout with merged components
91c54e4 fix(merge): complete session-reader and ChatInput test alignment
0c5f27e fix(merge): align post-merge tests with canonical semantics
084e312 chore: bump version to 0.9.2 and regenerate lockfiles (pi 0.85.1, terminal deps)
a8bbf14 merge: integrate upstream/main (a26cc68) into personal
8040f64 chore(workspace): record npm publish of @xup3ng/pi-web 0.9.1
d4aa179 chore: bump version to 0.9.1
64341e0 revert(personal): drop Electron traffic-light safe area to match upstream
b4d7fc1 feat(release): add npm publish script for @xup3ng/pi-web
a2be9ea chore(workspace): record npm publish of @xup3ng/pi-web 0.9.0
976b0cf chore(task): archive 08-30-npmjs-publish-prep
fb32fa7 chore(release): publish @xup3ng/pi-web 0.9.0 to npm
be1c037 chore(workspace): record release of 0.8.11-personal.11
7175612 chore: bump version to 0.8.11-personal.11
0006e12 chore(task): add 08-30-chat-font-size-control artifacts
d0e4559 feat(settings): add relative chat font size control and fix mobile settings layout
aab0087 chore: bump version to 0.8.11-personal.10
c39a677 chore(task): archive 08-29-ask-user-card-rehydrate
9e49af1 chore(task): add 08-29-ask-user-card-rehydrate artifacts
a7b25d5 chore(spec): document ask_user persistence and cross-device sync
78903e2 fix(ask-user): rehydrate and persist open ask cards across sessions and devices
8f80452 chore(task): archive 08-29-sidebar-session-list-empty
b965d16 chore(spec): document session list refresh contract and race pitfalls
425d5cd chore(workspace): update xupeng journal
0b40c11 chore(task): add 08-29-sidebar-session-list-empty artifacts
7d737eb fix(sidebar): prevent empty list on refresh race; refresh single row on agent end
3b99dae feat(api): read a single session by id without a full directory scan
f7447ac chore(workspace): register xupeng and adopt the migrated developer workspace
ab247da chore: bump version to 0.8.11-personal.9
73f5453 fix(iOS): recover the composer from the keyboard and keep Enter as newline on touch
a60377e feat(ask-user): scroll with the conversation, submit lock, and supplement input
f30bd40 chore: bump version to 0.8.11-personal.8
47cfa54 chore: release-personal.sh 添加可执行权限
0c2eb54 chore(task): archive 08-29-auto-release-github-actions
d993480 ci: personal 版本 tag 推送后自动构建发布 tarball
1109828 fix: ask_user 取消后卡片不消失
897a0e4 fix: ask_user 卡片对齐消息列并拉开与输入框间距
2fd8ee4 chore(task): archive 08-28-ask-user-support
64bb544 feat: 支持 ask_user 向用户提问（异步卡片 + follow-up 唤醒）
17fb2f5 chore: bump version to 0.8.11-personal.7
84e93e4 feat: 支持配置扩展界面可见性
d598fd0 fix: 优化 Markdown 表格横向滚动
15e4133 chore: 初始化 Trellis 工作流与子代理
6b80a95 fix(release): support 0.8.x-personal versions, proxy for push/gh
baba83d chore: bump version to 0.8.11-personal.6
e91c965 fix(iOS): stop scroll jitter at the top of the chat list
a2c7ce3 Merge upstream/main (v0.8.11) into personal
c2546c1 chore: bump version to 0.8.9-personal.4
38a8e57 fix(code-block): resolve React shorthand style collision warning
1a974f5 style(chat): enlarge chat font size on mobile and tablet
ffc1e90 chore: add personal release script with npm/pnpm one-click install blocks
4fb9874 chore: bump version to 0.8.9-personal.3
390625a feat(sessions): on-demand project and session loading in the sidebar
3d33bca perf(sessions): incremental disk-backed session scan
784d986 chore: bump version to 0.8.9-personal.2
0220a29 feat(personal): model-aware image routing with previews and project-scoped storage
d8469b5 feat(personal): Electron shell integration — traffic-light safe area, blended strip, compact header
55c1eaa feat(personal): paste images are saved to disk and @-mentioned as absolute paths
2679843 feat(personal): custom fonts — Oxanium UI/content, Cascadia Code mono, WenKai CJK, 16px desktop content
```

## Every local net path (311)

```text
A	.agents/skills/trellis-before-dev/SKILL.md
A	.agents/skills/trellis-brainstorm/SKILL.md
A	.agents/skills/trellis-break-loop/SKILL.md
A	.agents/skills/trellis-channel/SKILL.md
A	.agents/skills/trellis-channel/references/command-reference.md
A	.agents/skills/trellis-channel/references/forum.md
A	.agents/skills/trellis-channel/references/progress-debugging.md
A	.agents/skills/trellis-channel/references/workers.md
A	.agents/skills/trellis-channel/references/workflows.md
A	.agents/skills/trellis-check/SKILL.md
A	.agents/skills/trellis-meta/SKILL.md
A	.agents/skills/trellis-meta/references/customize-local/add-project-local-conventions.md
A	.agents/skills/trellis-meta/references/customize-local/change-agents.md
A	.agents/skills/trellis-meta/references/customize-local/change-context-loading.md
A	.agents/skills/trellis-meta/references/customize-local/change-hooks.md
A	.agents/skills/trellis-meta/references/customize-local/change-skills-or-commands.md
A	.agents/skills/trellis-meta/references/customize-local/change-spec-structure.md
A	.agents/skills/trellis-meta/references/customize-local/change-task-lifecycle.md
A	.agents/skills/trellis-meta/references/customize-local/change-workflow.md
A	.agents/skills/trellis-meta/references/customize-local/overview.md
A	.agents/skills/trellis-meta/references/local-architecture/bundled-skills.md
A	.agents/skills/trellis-meta/references/local-architecture/context-injection.md
A	.agents/skills/trellis-meta/references/local-architecture/generated-files.md
A	.agents/skills/trellis-meta/references/local-architecture/multi-agent-channel.md
A	.agents/skills/trellis-meta/references/local-architecture/overview.md
A	.agents/skills/trellis-meta/references/local-architecture/spec-system.md
A	.agents/skills/trellis-meta/references/local-architecture/task-system.md
A	.agents/skills/trellis-meta/references/local-architecture/workflow.md
A	.agents/skills/trellis-meta/references/local-architecture/workspace-memory.md
A	.agents/skills/trellis-meta/references/platform-files/agents.md
A	.agents/skills/trellis-meta/references/platform-files/hooks-and-settings.md
A	.agents/skills/trellis-meta/references/platform-files/overview.md
A	.agents/skills/trellis-meta/references/platform-files/platform-map.md
A	.agents/skills/trellis-meta/references/platform-files/skills-and-commands.md
A	.agents/skills/trellis-session-insight/SKILL.md
A	.agents/skills/trellis-session-insight/references/cli-quick-reference.md
A	.agents/skills/trellis-session-insight/references/triggering-patterns.md
A	.agents/skills/trellis-spec-bootstrap/SKILL.md
A	.agents/skills/trellis-spec-bootstrap/references/mcp-setup.md
A	.agents/skills/trellis-spec-bootstrap/references/repository-analysis.md
A	.agents/skills/trellis-spec-bootstrap/references/spec-task-planning.md
A	.agents/skills/trellis-spec-bootstrap/references/spec-writing.md
A	.agents/skills/trellis-update-spec/SKILL.md
A	.gitattributes
A	.github/workflows/release-personal.yml
M	.gitignore
A	.pi/agents/trellis-check.md
A	.pi/agents/trellis-implement.md
A	.pi/agents/trellis-research.md
A	.pi/extensions/trellis/index.ts
A	.pi/prompts/trellis-continue.md
A	.pi/prompts/trellis-finish-work.md
A	.pi/prompts/trellis-start.md
A	.pi/settings.json
A	.trellis/.developer
A	.trellis/.gitignore
A	.trellis/.template-hashes.json
A	.trellis/.version
A	.trellis/agents/check.md
A	.trellis/agents/implement.md
A	.trellis/config.yaml
A	.trellis/scripts/__init__.py
A	.trellis/scripts/add_session.py
A	.trellis/scripts/common/__init__.py
A	.trellis/scripts/common/active_task.py
A	.trellis/scripts/common/cli_adapter.py
A	.trellis/scripts/common/config.py
A	.trellis/scripts/common/developer.py
A	.trellis/scripts/common/git.py
A	.trellis/scripts/common/git_context.py
A	.trellis/scripts/common/io.py
A	.trellis/scripts/common/log.py
A	.trellis/scripts/common/packages_context.py
A	.trellis/scripts/common/paths.py
A	.trellis/scripts/common/safe_commit.py
A	.trellis/scripts/common/session_context.py
A	.trellis/scripts/common/task_context.py
A	.trellis/scripts/common/task_queue.py
A	.trellis/scripts/common/task_store.py
A	.trellis/scripts/common/task_utils.py
A	.trellis/scripts/common/tasks.py
A	.trellis/scripts/common/trellis_config.py
A	.trellis/scripts/common/types.py
A	.trellis/scripts/common/workflow_phase.py
A	.trellis/scripts/get_context.py
A	.trellis/scripts/get_developer.py
A	.trellis/scripts/hooks/linear_sync.py
A	.trellis/scripts/init_developer.py
A	.trellis/scripts/task.py
A	.trellis/spec/frontend/ask-user-protocol.md
A	.trellis/spec/frontend/component-guidelines.md
A	.trellis/spec/frontend/directory-structure.md
A	.trellis/spec/frontend/hook-guidelines.md
A	.trellis/spec/frontend/index.md
A	.trellis/spec/frontend/mobile-keyboard-viewport.md
A	.trellis/spec/frontend/quality-guidelines.md
A	.trellis/spec/frontend/session-list-refresh.md
A	.trellis/spec/frontend/settings-dialog-mobile.md
A	.trellis/spec/frontend/state-management.md
A	.trellis/spec/frontend/trellis-subagent-records.md
A	.trellis/spec/frontend/type-safety.md
A	.trellis/spec/guides/code-reuse-thinking-guide.md
A	.trellis/spec/guides/cross-layer-thinking-guide.md
A	.trellis/spec/guides/index.md
A	.trellis/tasks/00-bootstrap-guidelines/prd.md
A	.trellis/tasks/00-bootstrap-guidelines/task.json
A	.trellis/tasks/08-27-hide-tui-powerline-widgets/check.jsonl
A	.trellis/tasks/08-27-hide-tui-powerline-widgets/design.md
A	.trellis/tasks/08-27-hide-tui-powerline-widgets/implement.jsonl
A	.trellis/tasks/08-27-hide-tui-powerline-widgets/implement.md
A	.trellis/tasks/08-27-hide-tui-powerline-widgets/prd.md
A	.trellis/tasks/08-27-hide-tui-powerline-widgets/task.json
A	.trellis/tasks/08-27-markdown-table-horizontal-scroll/check.jsonl
A	.trellis/tasks/08-27-markdown-table-horizontal-scroll/implement.jsonl
A	.trellis/tasks/08-27-markdown-table-horizontal-scroll/implement.md
A	.trellis/tasks/08-27-markdown-table-horizontal-scroll/prd.md
A	.trellis/tasks/08-27-markdown-table-horizontal-scroll/task.json
A	.trellis/tasks/08-29-ask-user-card-in-stream/check.jsonl
A	.trellis/tasks/08-29-ask-user-card-in-stream/design.md
A	.trellis/tasks/08-29-ask-user-card-in-stream/implement.jsonl
A	.trellis/tasks/08-29-ask-user-card-in-stream/implement.md
A	.trellis/tasks/08-29-ask-user-card-in-stream/prd.md
A	.trellis/tasks/08-29-ask-user-card-in-stream/task.json
A	.trellis/tasks/08-29-ask-user-card-state-reset/check.jsonl
A	.trellis/tasks/08-29-ask-user-card-state-reset/design.md
A	.trellis/tasks/08-29-ask-user-card-state-reset/implement.jsonl
A	.trellis/tasks/08-29-ask-user-card-state-reset/implement.md
A	.trellis/tasks/08-29-ask-user-card-state-reset/prd.md
A	.trellis/tasks/08-29-ask-user-card-state-reset/task.json
A	.trellis/tasks/08-29-ask-user-submit-lockup-supplement/check.jsonl
A	.trellis/tasks/08-29-ask-user-submit-lockup-supplement/design.md
A	.trellis/tasks/08-29-ask-user-submit-lockup-supplement/implement.jsonl
A	.trellis/tasks/08-29-ask-user-submit-lockup-supplement/implement.md
A	.trellis/tasks/08-29-ask-user-submit-lockup-supplement/prd.md
A	.trellis/tasks/08-29-ask-user-submit-lockup-supplement/task.json
A	.trellis/tasks/08-29-mobile-enter-sends/check.jsonl
A	.trellis/tasks/08-29-mobile-enter-sends/design.md
A	.trellis/tasks/08-29-mobile-enter-sends/implement.jsonl
A	.trellis/tasks/08-29-mobile-enter-sends/implement.md
A	.trellis/tasks/08-29-mobile-enter-sends/prd.md
A	.trellis/tasks/08-29-mobile-enter-sends/task.json
A	.trellis/tasks/08-29-mobile-keyboard-cover/check.jsonl
A	.trellis/tasks/08-29-mobile-keyboard-cover/design.md
A	.trellis/tasks/08-29-mobile-keyboard-cover/implement.jsonl
A	.trellis/tasks/08-29-mobile-keyboard-cover/implement.md
A	.trellis/tasks/08-29-mobile-keyboard-cover/prd.md
A	.trellis/tasks/08-29-mobile-keyboard-cover/task.json
A	.trellis/tasks/08-30-chat-font-size-control/check.jsonl
A	.trellis/tasks/08-30-chat-font-size-control/implement.jsonl
A	.trellis/tasks/08-30-chat-font-size-control/prd.md
A	.trellis/tasks/08-30-chat-font-size-control/task.json
A	.trellis/tasks/09-09-sync-upstream-release/check.jsonl
A	.trellis/tasks/09-09-sync-upstream-release/design.md
A	.trellis/tasks/09-09-sync-upstream-release/implement.jsonl
A	.trellis/tasks/09-09-sync-upstream-release/implement.md
A	.trellis/tasks/09-09-sync-upstream-release/prd.md
A	.trellis/tasks/09-09-sync-upstream-release/task.json
A	.trellis/tasks/09-11-subagents-entry-visibility/check.jsonl
A	.trellis/tasks/09-11-subagents-entry-visibility/design.md
A	.trellis/tasks/09-11-subagents-entry-visibility/implement.jsonl
A	.trellis/tasks/09-11-subagents-entry-visibility/implement.md
A	.trellis/tasks/09-11-subagents-entry-visibility/prd.md
A	.trellis/tasks/09-11-subagents-entry-visibility/research/adapter-context.md
A	.trellis/tasks/09-11-subagents-entry-visibility/research/check-report.md
A	.trellis/tasks/09-11-subagents-entry-visibility/research/findings.md
A	.trellis/tasks/09-11-subagents-entry-visibility/task.json
A	.trellis/tasks/archive/2026-08/08-28-ask-user-support/check.jsonl
A	.trellis/tasks/archive/2026-08/08-28-ask-user-support/design.md
A	.trellis/tasks/archive/2026-08/08-28-ask-user-support/implement.jsonl
A	.trellis/tasks/archive/2026-08/08-28-ask-user-support/implement.md
A	.trellis/tasks/archive/2026-08/08-28-ask-user-support/prd.md
A	.trellis/tasks/archive/2026-08/08-28-ask-user-support/task.json
A	.trellis/tasks/archive/2026-08/08-29-ask-user-card-rehydrate/check.jsonl
A	.trellis/tasks/archive/2026-08/08-29-ask-user-card-rehydrate/design.md
A	.trellis/tasks/archive/2026-08/08-29-ask-user-card-rehydrate/implement.jsonl
A	.trellis/tasks/archive/2026-08/08-29-ask-user-card-rehydrate/implement.md
A	.trellis/tasks/archive/2026-08/08-29-ask-user-card-rehydrate/prd.md
A	.trellis/tasks/archive/2026-08/08-29-ask-user-card-rehydrate/task.json
A	.trellis/tasks/archive/2026-08/08-29-auto-release-github-actions/check.jsonl
A	.trellis/tasks/archive/2026-08/08-29-auto-release-github-actions/implement.jsonl
A	.trellis/tasks/archive/2026-08/08-29-auto-release-github-actions/implement.md
A	.trellis/tasks/archive/2026-08/08-29-auto-release-github-actions/prd.md
A	.trellis/tasks/archive/2026-08/08-29-auto-release-github-actions/task.json
A	.trellis/tasks/archive/2026-08/08-29-sidebar-session-list-empty/check.jsonl
A	.trellis/tasks/archive/2026-08/08-29-sidebar-session-list-empty/design.md
A	.trellis/tasks/archive/2026-08/08-29-sidebar-session-list-empty/implement.jsonl
A	.trellis/tasks/archive/2026-08/08-29-sidebar-session-list-empty/implement.md
A	.trellis/tasks/archive/2026-08/08-29-sidebar-session-list-empty/prd.md
A	.trellis/tasks/archive/2026-08/08-29-sidebar-session-list-empty/task.json
A	.trellis/tasks/archive/2026-08/08-30-npmjs-publish-prep/check.jsonl
A	.trellis/tasks/archive/2026-08/08-30-npmjs-publish-prep/implement.jsonl
A	.trellis/tasks/archive/2026-08/08-30-npmjs-publish-prep/implement.md
A	.trellis/tasks/archive/2026-08/08-30-npmjs-publish-prep/prd.md
A	.trellis/tasks/archive/2026-08/08-30-npmjs-publish-prep/task.json
A	.trellis/workflow.md
A	.trellis/workspace/index.md
A	.trellis/workspace/xupeng/index.md
A	.trellis/workspace/xupeng/journal-1.md
M	AGENTS.md
M	README.ja.md
M	README.md
M	README.ru.md
M	README.zh-CN.md
M	app/api/agent/[id]/route.ts
A	app/api/attachments/route.test.mjs
A	app/api/attachments/route.ts
A	app/api/extension-ui/settings/route.test.mjs
A	app/api/extension-ui/settings/route.ts
M	app/api/file-index/route.ts
M	app/api/files/[...path]/route.ts
A	app/api/models/route.test.mjs
A	app/api/projects/route.test.mjs
A	app/api/projects/route.ts
M	app/api/sessions/[id]/context/route.ts
M	app/api/sessions/[id]/route.ts
M	app/api/sessions/[id]/state/route.ts
M	app/api/sessions/context-route.test.mjs
M	app/api/sessions/detail-route.test.mjs
M	app/api/sessions/route.ts
M	app/api/sessions/runtime-route.test.mjs
A	app/api/settings/ask-user/route.ts
M	app/globals.css
M	app/layout.tsx
M	app/settings.css
M	components/AgentSessionPanel.tsx
M	components/AppShell.mobile-toolbar.test.mjs
M	components/AppShell.tsx
A	components/AskUserCard.test.mjs
A	components/AskUserCard.tsx
M	components/ChatAppearance.test.mjs
A	components/ChatInput.send-shortcut.test.mjs
M	components/ChatInput.test.mjs
M	components/ChatInput.tsx
A	components/ChatWindow.ask-user-layout.test.mjs
M	components/ChatWindow.tsx
M	components/MarkdownBody.test.mjs
M	components/MermaidBlock.tsx
M	components/MessageView.test.mjs
M	components/MessageView.tsx
M	components/MobilePwaLayout.test.mjs
M	components/SessionSidebar.test.mjs
M	components/SessionSidebar.tsx
M	components/SettingsPanel.test.mjs
M	components/SettingsPanel.tsx
A	components/TrellisSubagentRecords.test.mjs
A	components/TrellisSubagentRecords.tsx
A	docs/release-npm.md
M	docs/release.md
M	e2e/README.md
M	e2e/run.mjs
A	e2e/subagents.mjs
M	eslint.config.mjs
A	hooks/useAgentSession.pending-ask-rehydrate.test.mjs
A	hooks/useAgentSession.pending-ask.test.mjs
A	hooks/useAgentSession.trellis.test.mjs
M	hooks/useAgentSession.ts
M	hooks/useChatAppearance.ts
M	hooks/useIsMobile.ts
M	hooks/useViewportHeight.test.mjs
M	hooks/useViewportHeight.ts
M	lib/agent-event-wire.test.mjs
M	lib/api-types.ts
A	lib/ask-user-settings.test.mjs
A	lib/ask-user-settings.ts
A	lib/ask-user/extension.ts
A	lib/ask-user/index.ts
A	lib/ask-user/persist.test.mjs
A	lib/ask-user/persist.ts
A	lib/ask-user/resolve-pending-ask.ts
A	lib/ask-user/store.test.mjs
A	lib/ask-user/store.ts
A	lib/ask-user/tool.test.mjs
A	lib/ask-user/tool.ts
A	lib/ask-user/types.ts
A	lib/attachment-paths.test.mjs
A	lib/attachment-paths.ts
A	lib/extension-ui-settings.test.mjs
A	lib/extension-ui-settings.ts
M	lib/file-access.ts
M	lib/i18n/messages/en.ts
M	lib/i18n/messages/zh-CN.ts
M	lib/i18n/messages/zh-TW.ts
A	lib/image-mentions.test.mjs
A	lib/image-mentions.ts
M	lib/rpc-manager-widgets.test.mjs
M	lib/rpc-manager.test.mjs
M	lib/rpc-manager.ts
A	lib/session-list-cache.test.mjs
A	lib/session-list-cache.ts
D	lib/session-list-scanner.bench.mjs
D	lib/session-list-scanner.test.mjs
D	lib/session-list-scanner.ts
A	lib/session-reader-incremental.test.mjs
M	lib/session-reader.test.mjs
M	lib/session-reader.ts
A	lib/trellis-subagent-history.test.mjs
A	lib/trellis-subagent-history.ts
A	lib/trellis-subagent-persistence.test.mjs
A	lib/trellis-subagent-records.test.mjs
A	lib/trellis-subagent-records.ts
M	lib/types.ts
M	lib/worktree.ts
M	package-lock.json
M	package.json
A	pnpm-lock.yaml
A	public/fonts/cascadia-code-latin-400-normal.woff2
A	public/fonts/cascadia-code-latin-500-normal.woff2
A	public/fonts/cascadia-code-latin-600-normal.woff2
A	public/fonts/cascadia-code-latin-700-normal.woff2
A	scripts/release-npm.sh
A	scripts/release-personal.sh
```

## All upstream commits (34)

```text
8366762 Release v0.9.1
553f2d7 fix(subagents): keep agent profile fields this app does not own (#794)
6d53fd5 feat(models): show provider usage quotas
894c735 fix(i18n): clarify main worktree labels
2eb95b9 fix: keep theme and language controls in settings (#772)
effa464 ci: pin Node.js to 22.19.0 to match engines (#760)
0ff32dd docs(i18n): use npm test in verification steps (#759)
c8c63a1 docs(cli): document SKIP_VERSION_CHECK and IDLE_TIMEOUT_MS in --help (#758)
a74aef8 feat: support sidebar=collapsed query param for embedded launches (#712)
f607816 fix: hide leftover enabledModels warnings when other models still match (#770)
4787a14 fix(ui): preserve streaming output when opening active session
e83f4b5 feat(sessions): delete subagent descendants with parent
1b88ec7 fix: keep @ file picker within the visible area above the composer (#768)
dab9850 fix: wrap keyboard selection in the @ file picker (#769)
17ad5c5 docs(agents): point streaming normalization at useAgentSession (#756)
fad65c9 docs(agents): use current New session and Edit from here labels (#757)
55df7d7 fix(e2e): tolerate live session metadata during pagination
f106531 merge: pi web subagent P0 features
b5b52f0 fix(ui): compact subagent settings
e3fbbf6 feat(subagents): honor extension tool selectors
2661247 feat(subagents): isolate agents in worktrees
bbe2f7d feat(subagents): support tintinweb profiles
a31d5c5 feat(subagents): resume persisted sessions
b77a25f feat(subagents): queue concurrent runs
0ff1138 feat: keep selected sessions alive
3e9fcfa fix(push): make iOS background delivery actually work (#728)
09383ae perf(sessions): gzip large JSON responses (#731)
def1478 fix: preserve shell output across SSE reconnects
f4a700d fix: render extension prompts as markdown (#699)
585d56c fix: support first-message session forks
d10988d fix: prevent duplicate built-in command submissions
ef51ffd fix: show top-level extensions in plugin settings
b1a7296 test: update model fallback e2e expectation
ed840ed fix: restore and display session models accurately
```

## Every upstream net path (79)

```text
M	.github/workflows/ci.yml
M	AGENTS.md
A	app/api/agent/[id]/lease/route.ts
A	app/api/plugins/route.test.mjs
M	app/api/plugins/route.ts
A	app/api/provider-usage/query/route.ts
M	app/api/sessions/[id]/route.ts
M	app/api/sessions/route.ts
M	app/api/sessions/runtime-route.test.mjs
M	app/api/subagents/profiles/route.ts
M	app/api/subagents/settings/route.test.mjs
M	app/api/subagents/settings/route.ts
M	app/settings.css
M	bin/pi-web-options.js
M	components/AgentsConfig.test.mjs
M	components/AgentsConfig.tsx
M	components/AppShell.mobile-toolbar.test.mjs
M	components/AppShell.tsx
M	components/ChatInput.test.mjs
M	components/ChatInput.tsx
M	components/ChatWindow.extension-request.test.mjs
M	components/ChatWindow.tsx
M	components/MessageView.test.mjs
M	components/MessageView.tsx
M	components/ModelsConfig.tsx
M	components/PluginsConfig.tsx
A	components/ProviderUsageSummary.tsx
M	components/SettingsPanel.test.mjs
M	components/SettingsPanel.tsx
M	docs/i18n.md
M	e2e/run.mjs
M	hooks/model-switching.test.mjs
M	hooks/useAgentSession.test.mjs
M	hooks/useAgentSession.ts
M	lib/agent-event-stream.test.mjs
M	lib/agent-event-stream.ts
M	lib/api-types.ts
M	lib/i18n/messages/en.ts
M	lib/i18n/messages/zh-CN.ts
M	lib/i18n/messages/zh-TW.ts
M	lib/initial-navigation.test.mjs
M	lib/initial-navigation.ts
A	lib/json-response.test.mjs
A	lib/json-response.ts
M	lib/model-scope.test.mjs
M	lib/model-scope.ts
M	lib/pi-web-options.test.mjs
A	lib/provider-usage-ids.ts
A	lib/provider-usage.test.mjs
A	lib/provider-usage.ts
M	lib/push-client.ts
M	lib/rpc-manager-shutdown.test.mjs
M	lib/rpc-manager.test.mjs
M	lib/rpc-manager.ts
M	lib/session-liveness.test.mjs
M	lib/session-liveness.ts
M	lib/session-reader.test.mjs
M	lib/session-reader.ts
M	lib/streaming-message.test.mjs
M	lib/streaming-message.ts
M	lib/subagent-extension.test.mjs
M	lib/subagent-extension.ts
A	lib/subagent-isolation.test.mjs
M	lib/subagent-prompt.test.mjs
M	lib/subagent-prompt.ts
A	lib/subagent-queue.test.mjs
A	lib/subagent-queue.ts
M	lib/subagent-runtime.test.mjs
M	lib/subagent-runtime.ts
M	lib/subagent-settings.ts
M	lib/subagents.test.mjs
M	lib/subagents.ts
M	lib/types.ts
M	lib/web-push.test.mjs
M	lib/web-push.ts
M	package-lock.json
M	package.json
M	public/sw.js
M	public/sw.test.mjs
```
