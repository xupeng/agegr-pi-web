# 合并预判与研究证据

## 主会话实测（2026-10-02）

| 项 | 结果 |
| --- | --- |
| L | `93e63e873481aea761cb2b2072c8a2da1654dc73` |
| U | `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e` |
| B | `433d09ea2f2cc77b0ff356e8c57575cd4d30179e` |
| 上游提交 | `git rev-list --count L..U` = 59；`git cherry L U` 全部 `+`，但 SDK 升级行为已由 fork 单独实现 |
| 上游变化 | B→U：157 files，15038 insertions，1210 deletions；`--diff-filter=D` 无删除 |
| 预判 | `git merge-tree --write-tree --name-only L U`：27 个内容冲突，不改 index/working tree |
| 依赖 | 四个直接 SDK pin 两侧均 0.99.1；上游新增 `@types/mdast`、browserslist 与 next loader/transpilation |
| 无漂移项 | 上游 B→U 未修改 `.github`、tsconfig 或 eslint 配置 |
| 环境 | Node v24.21.0，npm 11.19.0；磁盘同级目录有空间；规划时 30141 无 listener |

所有内容仅为规划证据。未运行实际 merge、安装、候选测试或浏览器，不能当作验收通过。

## 内容冲突清单（27）

```text
AGENTS.md
README.md
app/api/file-index/route.ts
app/api/files/[...path]/route.ts
components/ChatInput.test.mjs
components/ChatInput.tsx
components/ChatWindow.tsx
components/MarkdownBody.test.mjs
components/MarkdownBody.tsx
components/MessageView.tsx
components/SessionSidebar.tsx
components/SettingsPanel.tsx
hooks/useAgentSession.test.mjs
hooks/useAgentSession.ts
hooks/useViewportHeight.test.mjs
hooks/useViewportHeight.ts
lib/agent-event-wire.test.mjs
lib/i18n/messages/en.ts
lib/i18n/messages/zh-CN.ts
lib/i18n/messages/zh-TW.ts
lib/message-display.ts
lib/model-catalog-refresh.integration.test.mjs
lib/pi-types.ts
lib/rpc-manager-shutdown.test.mjs
lib/rpc-manager.test.mjs
lib/rpc-manager.ts
lib/subagents.ts
```

## 只读规划子代理的有效发现

来源：plan session `01a0fa79-5f14-77da-bce5-e77fc36bdfb3`。子代理阅读 fork 的实际源码、前次冲突决策与本地 SDK 文档，未独立核实 U 的 blob，也未跑测试；上游行为以主会话所读目标 diff / ADR 为准。

- `startRpcSession` 与 `subagent-runtime` 有两条 services 构造路径；新增 factory 不得只兼容主会话或重开路径。
- exact prompt 的 provider 投影由 `createExactSystemPromptExtension` 所有，不能以 `get_state` 正确代替真实 request context 验证。
- fork 的 `withExtensionTools` 强制加入所有非 coding 工具，与 MCP 的 inactive/deferred/exposure 冲突；需采用上游最终 helper。
- `ask_user` 当前没有 exposure；其 terminate 回合语义不适合 Code mode 嵌套调用，需明确 model-only 并测试。
- fork wrapper admission 清旧 ask 的时点是 SDK 接收之后；新增 MCP prepare 的 rejection 不能绕过这个时点。
- 普通 extension dialog/custom UI 是阻塞式请求，pending ask 是已终止回合后的持久态；二者不能合为一种队列。
- watchdog 在 inner subscription 观察 SDK 事件，在 `agent_settled` 停止；SSE slim/coalesce 不能改变其观察源。
- `session-file-references-core` 需要收紧系统消息/非编程结果的字符串授权，必须同时复核 fork 产物 provenance 与统一打开 options。
- written-file 卡片的成功证据不允许 preview-only；Trellis 产物不能借用截断后的 UI trace；保留 `sourceSessionId`。
- 会话缓存/按需侧栏、恢复顺序、重连和晚到响应有 fork 专用门禁；自动合并不能绕回全量列表或回退新行。
- 上游 Code mode 卡片是新增对话排版表面，须加 fork 字号 offset；移动键盘和字体变化要实际浏览器检查 minimap 与 tail。

## 对研究建议的边界校正

- 不接受把所有 user/assistant prose 都禁止授权的额外策略：上游最终版仍允许部分这些来源。本任务只合入已明确的安全收紧，并保持合法 fork 文件打开，进一步策略变更另议。
- 不接受要求普通 dialog/custom UI 合成新统一 FIFO 的扩展范围：采用上游两类队列各自按 id 管理。
- 不把所有 Code mode 嵌套写入产物 UI 扩展列为独立新功能；仅当保持现有文件契约必需时做证据适配。
- 旧 viewport 对 zoom 的策略不直接冻结；上游按 scale 修复要与“不抢用户滚动位置”的 fork 用户契约一起验证。

## 自动合并高风险点

merge-tree 已自动合并 `AppShell`、`session-reader`、`subagent-runtime`、`subagent-extension`、`api-types`、`agent-event-wire` 产品模块、CSS、worktree 和 package/lock。它们仍需语义检查。

重点是 session restore/row overrides、增量 scan、exact prompt/resource snapshot、resume 通知、pending ask、nested event 的类型投影、字号 offset 及 fork package 元数据；“无文本冲突”不是通过证据。

## 既有任务参考

- `.trellis/tasks/archive/2026-09/09-30-sync-upstream-pi-0991/research/conflict-decisions.md`：上次 six-file 冲突保留策略。
- 同任务 `research/closeout.md`：此前干净 npm 树与隔离 e2e 的执行方式；历史计数不作为本次基线。
- `.trellis/spec/guides/upstream-sync.md`：逐 hunk 并集、成功写入证据、自动合并复核和追加修复提交。

## 实施后需新增的证据

baseline、实际冲突决策、验证报告、独立检查和 closeout；所有真实 SDK/MCP fixture 与浏览器结果必须记录使用的 commit/tree、依赖和数据隔离方式。
