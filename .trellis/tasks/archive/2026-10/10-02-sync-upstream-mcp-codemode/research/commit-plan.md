# Approved local commit batch

User selected `approve` for `approve_local_commit_batch`; execute all five local batches.

Only branch `merge/upstream-mcp-codemode-20261002` in its sibling candidate worktree.
No push, PR, publish, version/SDK bump or personal/main advance. No amend. All dirty paths are
recognized as upstream merge content or this task's implementation/check/browser/spec/artifacts;
no unrecognized file is proposed. Raw logs/traces/diagnostics remain ignored and uncommitted.

## 1. `merge: integrate upstream MCP and Code mode updates`

Real two-parent merge of fixed U `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e` into L
`93e63e873481aea761cb2b2072c8a2da1654dc73`, including necessary fork compatibility repairs.
Explicit paths (173; no wildcard staging):

```text
AGENTS.md
README.md
app/api/cwd/browse/route.ts
app/api/file-index/route.ts
app/api/files/[...path]/route.ts
app/api/files/linked-directory-route.test.mjs
app/api/files/list-route.test.mjs
app/api/models-config/discover/route.ts
app/api/open-in-explorer/route.test.mjs
app/api/open-in-explorer/route.ts
app/api/plugins/route.test.mjs
app/api/plugins/route.ts
app/api/skills/route.test.mjs
app/api/skills/route.ts
app/api/tools/settings/route.test.mjs
app/api/tools/settings/route.ts
app/api/worktrees/route.ts
app/globals.css
app/settings.css
bin/pi-web-options.js
components/AgentsConfig.tsx
components/AppShell.tsx
components/BranchNavigator.test.mjs
components/BranchNavigator.tsx
components/ChatAppearance.test.mjs
components/ChatInput.send-shortcut.test.mjs
components/ChatInput.streaming-thinking.test.mjs
components/ChatInput.test.mjs
components/ChatInput.tsx
components/ChatWindow.extension-request.test.mjs
components/ChatWindow.process-details.test.mjs
components/ChatWindow.status-tail-follow.test.mjs
components/ChatWindow.tsx
components/CodemodeToolView.tsx
components/DirectoryPicker.tsx
components/DismissButton.tsx
components/EnabledModelsSection.test.mjs
components/FileExplorer.linked-directory.test.mjs
components/FileExplorer.tsx
components/MarkdownBody.identity.test.mjs
components/MarkdownBody.test.mjs
components/MarkdownBody.tsx
components/MessageView.test.mjs
components/MessageView.tsx
components/MobilePwaLayout.test.mjs
components/ModelSelector.test.mjs
components/ModelSelector.tsx
components/ModelsConfig.test.mjs
components/ModelsConfig.tsx
components/OAuthPastePanel.test.mjs
components/OAuthPastePanel.tsx
components/PluginsConfig.test.mjs
components/PluginsConfig.tsx
components/SessionSidebar.tsx
components/SettingsPanel.test.mjs
components/SettingsPanel.tsx
components/SettingsUi.blocks.test.mjs
components/SettingsUi.group-switch.test.mjs
components/SettingsUi.test.mjs
components/SettingsUi.tsx
components/SkillsConfig.bulk.test.mjs
components/SkillsConfig.tsx
components/models-config-helpers.ts
components/settings-ui-helpers.test.mjs
components/settings-ui-helpers.ts
demo/components/ChatWindow.tsx
demo/components/MessageView.tsx
demo/lib/i18n/messages/en.ts
demo/lib/i18n/messages/zh-CN.ts
demo/lib/i18n/messages/zh-TW.ts
demo/lib/markdown.ts
demo/lib/message-display.ts
docs/adr/0006-mcp-and-code-mode.md
e2e/README.md
e2e/extension-dialog.mjs
e2e/run.mjs
e2e/subagents.mjs
e2e/upstream-interactions.mjs
hooks/useAgentSession.test.mjs
hooks/useAgentSession.trellis.test.mjs
hooks/useAgentSession.ts
hooks/useEnterSendMode.ts
hooks/useViewportHeight.test.mjs
hooks/useViewportHeight.ts
lib/__fixtures__/mcp-env-server.mjs
lib/agent-event-stream.test.mjs
lib/agent-event-stream.ts
lib/agent-event-wire.test.mjs
lib/agent-event-wire.ts
lib/api-types.ts
lib/ask-user/codemode.integration.test.mjs
lib/ask-user/portable/tool.ts
lib/ask-user/tool.test.mjs
lib/builtin-extensions.integration.test.mjs
lib/builtin-extensions.test.mjs
lib/builtin-extensions.ts
lib/chat-phase-label.test.mjs
lib/chat-phase-label.ts
lib/codemode-settings.test.mjs
lib/codemode-settings.ts
lib/codemode-view.test.mjs
lib/codemode-view.ts
lib/directory-browser.test.mjs
lib/directory-browser.ts
lib/display-path.test.mjs
lib/display-path.ts
lib/extension-ui-queue.test.mjs
lib/extension-ui-queue.ts
lib/file-access.test.mjs
lib/file-tree-visibility.test.mjs
lib/file-tree-visibility.ts
lib/gfm-autolink-email-loader.cjs
lib/gfm-autolink-email-loader.test.mjs
lib/global-settings-file.ts
lib/i18n/messages/en.ts
lib/i18n/messages/zh-CN.ts
lib/i18n/messages/zh-TW.ts
lib/linked-directory.test.mjs
lib/linked-directory.ts
lib/markdown.test.mjs
lib/markdown.ts
lib/mcp-host.integration.test.mjs
lib/mcp-host.test.mjs
lib/mcp-host.ts
lib/mcp-read-only-policy.integration.test.mjs
lib/mcp-read-only-policy.test.mjs
lib/mcp-read-only-policy.ts
lib/mcp-tool-display.test.mjs
lib/mcp-tool-display.ts
lib/mcp-transport.test.mjs
lib/mcp-transport.ts
lib/message-display.ts
lib/model-discovery-auth.ts
lib/model-discovery.test.mjs
lib/npm-source.ts
lib/open-in-file-manager.test.mjs
lib/open-in-file-manager.ts
lib/path-security.ts
lib/pi-sdk-internals.test.mjs
lib/pi-sdk-internals.ts
lib/pi-types.ts
lib/plugin-updates.ts
lib/powershell-settings.test.mjs
lib/powershell-settings.ts
lib/project-command-env.test.mjs
lib/project-command-env.ts
lib/rpc-manager-idle-timeout.test.mjs
lib/rpc-manager-lifecycle.test.mjs
lib/rpc-manager-shutdown.test.mjs
lib/rpc-manager-stall-watchdog.test.mjs
lib/rpc-manager-tool-exposure.integration.test.mjs
lib/rpc-manager-tool-exposure.test.mjs
lib/rpc-manager.test.mjs
lib/rpc-manager.ts
lib/session-file-references-core.ts
lib/session-file-references.fork-evidence.test.mjs
lib/session-file-references.test.mjs
lib/session-reader.ts
lib/subagent-extension.integration.test.mjs
lib/subagent-extension.test.mjs
lib/subagent-extension.ts
lib/subagent-runtime.test.mjs
lib/subagent-runtime.ts
lib/subagents.test.mjs
lib/subagents.ts
lib/thinking-level-mid-run.integration.test.mjs
lib/worktree.test.mjs
lib/worktree.ts
lib/written-file-sources.check.test.mjs
lib/written-file-sources.ts
next.config.ts
package-lock.json
package.json
```

## 2. `docs(spec): document MCP runtime and fork compatibility contracts`

```text
.trellis/spec/frontend/ask-user-protocol.md
.trellis/spec/frontend/clickable-file-paths.md
.trellis/spec/frontend/index.md
.trellis/spec/frontend/mcp-codemode.md
.trellis/spec/frontend/mobile-keyboard-viewport.md
.trellis/spec/frontend/stall-watchdog.md
.trellis/spec/guides/upstream-sync.md
```

## 3. `chore(task): add upstream sync planning and acceptance artifacts`

All paths below are inside `.trellis/tasks/10-02-sync-upstream-mcp-codemode/`:

```text
.gitignore
check.jsonl
design.md
implement.jsonl
implement.md
prd.md
task.json
research/baseline-report.md
research/browser-verification.md
research/commit-plan.md
research/conflict-decisions.md
research/context-read-audit.md
research/debug-retrospective.md
research/final-fixture-review.md
research/final-incremental-review.md
research/implementation-report.md
research/independent-check.md
research/main-verification.md
research/merge-analysis.md
research/pagination-fix.md
research/reading-offset-fix.md
research/verification-report.md
research/verification-summary.json
research/closeout.md
```

`closeout.md` will record the approved merge/spec commit hashes, actual U ancestry and frozen
source comparison before this artifact commit. Original intermediate RED reports remain intact.

## 4. `chore(task): archive sync-upstream-mcp-codemode`

Run `task.py archive` only after the approved work/spec/artifact commits and final ancestry check.
Move this task into `.trellis/tasks/archive/2026-10/10-02-sync-upstream-mcp-codemode/`, completed
metadata included. Auto-commit only task paths on this feature branch, never on personal.

## 5. `chore: record journal`

Run `add_session.py` on this feature branch after archive. Only the generated journal/index:
`.trellis/workspace/xupeng/index.md` and `.trellis/workspace/xupeng/journal-1.md` (or next file
if its 2000-line limit requires rotation). Include this task's actual work commit hashes and
verification/limitations, no unrelated session. This English message matches config.yaml.

## Post-commit local checks and boundaries

- Verify two merge parents, U ancestry, unchanged `personal=L`, no unmerged/markers/deletions,
  source digest matching the tested tree, explicit intended commits and clean candidate state.
- No remote action. Do not remove unrelated worktrees/services or raw evidence.
- Main checkout's task copy was created by this session. Clear its active routing and remove
  that duplicate only after verifying the committed archive and confirming it has no unrelated
  manual additions; if unexpected content exists, retain it and report rather than delete it.
- Historical promoted Agent pollution is not migrated; Safari/Windows/live providers/MCP and
  running thinking/fork browser controls are not covered. Approved local delivery retains these
  disclosed limitations; it does not certify more than the actual tests.
