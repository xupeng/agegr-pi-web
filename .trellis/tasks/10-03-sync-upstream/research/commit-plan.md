# 本地提交方案（已确认）

工作树 `agegr-pi-web-worktrees/upstream-sync-20261003`，任务分支 `merge/upstream-20261003`；personal 仍为 BASE。
所有下列路径都属于本次上游合并、必要适配或任务记录，没有未识别脏文件。不推送、不发布、不创建 PR，不 amend。

用户已明确确认此五批方案；合并提交 `18a284d` 和 spec 提交 `b9c5bcb` 已完成，后续按相同方案提交产物、归档与日志。

## 顺序

1. `merge: sync upstream 6fcd7d4 and upgrade Pi to 1.0.0`
   - 非快进 merge commit，保留 BASE/TARGET 两个父提交。仅暂存下列160个产品/上游文档路径。
2. `docs(spec): document Pi 1.0 and MCP settings contracts`
   - 七份 spec，见下面完整名单。
3. `chore(task): add sync-upstream planning and verification artifacts`
   - `.trellis/tasks/10-03-sync-upstream/{task.json,prd.md,design.md,implement.md,implement.jsonl,check.jsonl}`。
   - 同任务 `research/` 的 planning、independent-review、verification、browser-verification、commit-plan、verify-settings.mjs、四张 Settings 截图和 smoke 日志。
   - 写入冻结 merge SHA 和祖先/无删除证据后提交，不改变已检验产品树。
4. `chore(task): archive sync-upstream`
   - task.py archive 生成；同一特性分支，归档到 `.trellis/tasks/archive/2026-10/`。
5. 会话日志提交（按仓库 session_commit_message）
   - add_session.py 生成的 `.trellis/workspace/xupeng/{journal-1.md,index.md}`，引用本任务工作/spec/产物提交，留在任务分支。

## 产品路径（160）

```text
AGENTS.md
app/api/mcp/route-add.test.mjs
app/api/mcp/route-write.test.mjs
app/api/mcp/route.test.mjs
app/api/mcp/route.ts
app/api/mcp/sign-in/[flowId]/route.ts
app/api/mcp/sign-in/route.test.mjs
app/api/mcp/sign-in/route.ts
app/api/mcp/test/route.test.mjs
app/api/mcp/test/route.ts
app/api/project-trust/route.test.mjs
app/api/project-trust/route.ts
app/api/tools/settings/route.test.mjs
app/api/tools/settings/route.ts
app/globals.css
app/settings.css
components/AgentsConfig.test.mjs
components/AgentsConfig.tsx
components/AppShell.tsx
components/AppendSystemConfig.test.mjs
components/AppendSystemConfig.tsx
components/ChatInput.test.mjs
components/ChatInput.tsx
components/ChatWindow.tsx
components/CodemodeToolView.tsx
components/EnabledModelsSection.test.mjs
components/EnabledModelsSection.tsx
components/McpAddServer.test.mjs
components/McpAddServer.tsx
components/McpConfig.test.mjs
components/McpConfig.tsx
components/McpSignIn.test.mjs
components/McpSignIn.tsx
components/MermaidBlock.tsx
components/MessageView.test.mjs
components/MessageView.tsx
components/MobilePwaLayout.test.mjs
components/ModelsConfig.tsx
components/OAuthPastePanel.test.mjs
components/OAuthPastePanel.tsx
components/PluginsConfig.tsx
components/ProjectTrustDialog.test.mjs
components/ProjectTrustDialog.tsx
components/SettingsPanel.test.mjs
components/SettingsPanel.tsx
components/SettingsUi.blocks.test.mjs
components/SettingsUi.test.mjs
components/SettingsUi.tsx
components/SkillsConfig.tsx
components/ToolDefinitionsPanel.test.mjs
components/ToolDefinitionsPanel.tsx
components/mcp-add-helpers.test.mjs
components/mcp-add-helpers.ts
components/mcp-config-helpers.test.mjs
components/mcp-config-helpers.ts
components/mcp-sign-in-helpers.test.mjs
components/mcp-sign-in-helpers.ts
components/settings-ui-helpers.test.mjs
components/settings-ui-helpers.ts
docs/adr/0002-chat-only-tool-selection.md
docs/adr/0004-enabled-models-toggles.md
docs/adr/0006-mcp-and-code-mode.md
docs/agents/client-platform.md
docs/agents/files-and-access.md
docs/agents/mcp-add.md
docs/agents/mcp-runtime.md
docs/agents/mcp-settings.md
docs/agents/mcp-test-sign-in.md
docs/agents/models.md
docs/agents/sessions.md
docs/agents/settings-ui.md
docs/agents/subagents.md
docs/agents/tools.md
e2e/upstream-interactions.mjs
hooks/mcp-slash-command.test.mjs
hooks/useAgentSession.ts
hooks/useKeyboardShortcuts.test.mjs
hooks/useKeyboardShortcuts.ts
lib/__fixtures__/mcp-env-server.mjs
lib/__fixtures__/mcp-hang-server.mjs
lib/__fixtures__/mcp-oauth-server.mjs
lib/api-types.ts
lib/ask-user/portable/discovery.test.mjs
lib/ask-user/portable/package.json
lib/builtin-extensions.integration.test.mjs
lib/builtin-extensions.test.mjs
lib/builtin-extensions.ts
lib/codemode-settings.test.mjs
lib/codemode-settings.ts
lib/i18n/messages/en.ts
lib/i18n/messages/zh-CN.ts
lib/i18n/messages/zh-TW.ts
lib/jsonc.test.mjs
lib/jsonc.ts
lib/key-serializer.test.mjs
lib/key-serializer.ts
lib/mcp-add.test.mjs
lib/mcp-add.ts
lib/mcp-command.test.mjs
lib/mcp-command.ts
lib/mcp-config-file.test.mjs
lib/mcp-config-file.ts
lib/mcp-config-key.test.mjs
lib/mcp-config-key.ts
lib/mcp-config-read.test.mjs
lib/mcp-config-read.ts
lib/mcp-config-values.test.mjs
lib/mcp-config-values.ts
lib/mcp-entry-request.ts
lib/mcp-host.integration.test.mjs
lib/mcp-host.test.mjs
lib/mcp-host.ts
lib/mcp-import-cli.ts
lib/mcp-import-core.ts
lib/mcp-import-json.ts
lib/mcp-import-links.ts
lib/mcp-import.integration.test.mjs
lib/mcp-import.test.mjs
lib/mcp-import.ts
lib/mcp-json-error.ts
lib/mcp-read-only-policy.ts
lib/mcp-secrets.test.mjs
lib/mcp-secrets.ts
lib/mcp-server-display.test.mjs
lib/mcp-server-display.ts
lib/mcp-sign-in.integration.test.mjs
lib/mcp-sign-in.test.mjs
lib/mcp-sign-in.ts
lib/mcp-sign-out.ts
lib/mcp-status.test.mjs
lib/mcp-status.ts
lib/mcp-test.test.mjs
lib/mcp-test.ts
lib/mcp-tool-display.ts
lib/mcp-transport.test.mjs
lib/mcp-transport.ts
lib/mcp-undo.test.mjs
lib/mcp-undo.ts
lib/model-catalog-refresh.ts
lib/models-config-store.test.mjs
lib/models-config-store.ts
lib/pi-sdk-internals.ts
lib/pi-types.ts
lib/project-trust.test.mjs
lib/project-trust.ts
lib/regular-file.test.mjs
lib/regular-file.ts
lib/rpc-manager-tool-exposure.integration.test.mjs
lib/rpc-manager-tool-exposure.test.mjs
lib/rpc-manager.ts
lib/settings-navigation.test.mjs
lib/settings-navigation.ts
lib/shell-words.test.mjs
lib/shell-words.ts
lib/stacked-dialog.test.mjs
lib/stacked-dialog.ts
lib/tool-presets.ts
lib/worktree.ts
package-lock.json
package.json
```

## Spec 路径（7）

```text
.trellis/spec/frontend/append-system-prompt.md
.trellis/spec/frontend/ask-user-protocol.md
.trellis/spec/frontend/index.md
.trellis/spec/frontend/mcp-codemode.md
.trellis/spec/frontend/mcp-settings.md
.trellis/spec/frontend/pi-sdk-admission.md
.trellis/spec/guides/upstream-sync.md
```

## 未识别脏文件

无。Next 开发运行的 tsconfig 自动添加行已排除；不把 ignored test-results、.next、node_modules 或用户配置混入提交。主 checkout 仅保留本任务中转规划副本，归档完成后清理此副本并清除主 checkout 的 active-task 指针，不动 personal 历史。
