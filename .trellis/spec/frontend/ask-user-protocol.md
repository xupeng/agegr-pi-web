# ask_user 提问协议

> Pi Web 的 `ask_user` 工具契约、状态机与前后端协议。

## 背景与设计决策

`ask_user` 让模型向用户提问，问题以浏览器卡片呈现，答案以 follow-up 消息唤醒模型。实现参考 `pi-web` fork（`src/server/sessions/askUserTool.ts` + `pendingAskStore.ts`），移植为 agegr-pi-web 架构。

**核心决策：异步非阻塞，不用 `ctx.ui`。** `ctx.ui.*` 是阻塞式（agent 运行被 pin 住、SSE 长连、状态易失）。`ask_user` 调用后返回 `terminate: true` 结束本轮运行，问题存为进程级状态，答案通过 `sendCustomMessage(..., { triggerTurn: true, deliverAs: "followUp" })` 送达模型。

## 工具契约

- 工具名 `ask_user`，通过 InlineExtension（`lib/ask-user/extension.ts`）注册，注入到主会话的 `extensionFactories`（非 chatOnly、非子代理会话）。
- 作为扩展而非 SDK `customTools`，工具在每次会话 reload 时重新注册，所以设置开关变更后 reload 会话即可生效（与 built-in subagents 同生命周期）。
- 参数：`questions[]`（每项 `id/question/detail?/options[]/multiple?`）。限制：≤20 问题、每题 ≤12 选项、id ≤128、文本 ≤1000、自定义文本 ≤4000。
- 执行：登记为会话 open ask 后返回 `{ terminate: true }`；畸形问题集抛 `PendingAskValidationError`（变 error tool result，模型可自纠重发）。
- 工具文本明确告知模型"答案将以 follow-up 唤醒，不要重复提问"；supersede 时附加旧 ask 未答列表。

## 状态机（`lib/ask-user/store.ts` 的 `PendingAskStore`）

每会话至多一个 open ask：`open → (supersede|submit|cancel)`。

- `open`：关闭旧 ask（supersede）并返回其 outcome，登记新 ask。
- `submit`：校验答案匹配 open ask（未知 id / 重复 / 选项不存在 / multiple 冲突 / 超长均拒绝），拒绝时 ask 保持打开。
- `cancel`：无答案关闭，outcome 全未答。
- `cancelOpen`：用户发普通消息时作废（`prompt` 命令 preflight 接受后调用），`triggerTurn: false` 搭用户消息便车，不单独唤醒。
- `forgetSession`：wrapper `destroy()` 时清理。
- store 为进程级单例（`globalThis.__piAskUserStore`，与 `__piSessions` 同模式防 Next.js 热重载丢失）。

### 补充输入项（supplement）

- `AskUserSubmission.supplement?`：用户补充的问题之外的自由文本（多行输入框，≤4000，trim 空丢弃），随 `ask_submit` 提交；`AskUserOutcome.supplement?` 记录。
- `renderAskUserAnswersText` 末尾附加 `Supplement (user-provided, beyond the questions): <json>`，模型可据此获取补充信息。
- 浏览器侧 `submitAsk(askId, answers, supplement?)` 传递；`AskUserCard` 底部"补充信息（可选）"多行框。

### 提交锁定

- `AskUserCard` 提交/取消后进入 `submitted`/`cancelling` 状态（`locked`）：选项按钮 disabled、输入 readOnly、操作栏显示"已提交 ✓"、每题下渲染提交摘要（`✓ values · otherText`）。
- 正常路径 `syncPendingAsk(response)`（pendingAsk undefined）使卡片消失；若因 SSE 关闭/重水合竞态卡片残留，`locked` 保证不可再编辑——答案已交付，避免"不确定最终提交了什么"。
- 单选问题：选选项清空自定义文本、输入自定义文本取消选项（互斥）；多选问题选项与自定义可共存，自定义输入框占位文案区分（`askUserMultipleOtherPlaceholder`）。

### 状态残留与关闭竞态

- `ChatWindow` 中 `<AskUserCard key={pendingAsk.askId} ...>`：ask 切换必须重建组件，否则旧 ask 的 `status`（submitting/locked）、drafts、supplement 会泄漏到新卡片（表现为新卡片选项无反应、输入禁用）。
- 关闭命令（submit/cancel）响应可能晚于新 ask 打开到达：此时服务端对旧 askId 返回 stale，响应无 `pendingAsk` 时不得清掉已打开的新 ask。解析逻辑在 `lib/ask-user/resolve-pending-ask.ts` 的 `resolvePendingAskAfterClose(current, submittedAskId, response)`：当前 ask 与提交 askId 不同 → 保留当前（除非响应显式带替换）。
- 该模块必须保持零依赖（无 `@/` 别名、无框架导入），才能被纯 Node 测试 jiti 导入。

## 事件与命令协议

- SSE 事件：`ask.opened`（`{ type, ask }`）、`ask.closed`（`{ type, askId, reason }`）。浏览器据此维护卡片；supersede 时先发旧 `ask.closed` 再发新 `ask.opened`。
- 命令（`POST /api/agent/[id]`）：`ask_submit`（`askId` + `answers[]`）、`ask_cancel`（`askId`）。
- 关闭响应：`{ result: "closed"|"stale", outcome?, pendingAsk? }`；stale 是普通竞态（已关闭/被取代/会话销毁），浏览器按返回 `pendingAsk` 重水合，不是错误。
- `get_state` 返回 `pendingAsk`，浏览器刷新后重水合卡片。
- 答案以 custom message（`customType: "pi-web.ask.answers"`，`display: true`）进 transcript，不署名用户。

## 文件布局

- `lib/ask-user/types.ts` — 类型 + 限制常量（纯、可复用）
- `lib/ask-user/store.ts` — `PendingAskStore` + 校验 + 答案文本渲染（纯、无框架依赖）
- `lib/ask-user/tool.ts` — `createAskUserToolDefinition`（`defineTool` + TypeBox schema）
- `lib/rpc-manager.ts` — 注入、命令、事件、作废钩子、`get_state` 投影
- `lib/ask-user-settings.ts` + `app/api/settings/ask-user/route.ts` — 开关持久化（`~/.pi/agent/pi-web-settings.json` 的 `askUser` 字段）+ GET/PUT；`PI_WEB_ASK_USER` env 优先于文件
- `hooks/useAgentSession.ts` — `pendingAsk` 状态、`submitAsk`/`cancelAsk`、事件处理、重水合
- `components/AskUserCard.tsx` — 问题卡片（选项/多选/自定义/部分作答）
- `components/SettingsPanel.tsx`（GeneralSettings）— ask_user 开关 + reload 提示/按钮

## 陷阱

- 官方 `question.ts` 扩展示例检查 `ctx.mode !== "tui"` 会拒绝运行；本功能不依赖 `ctx.ui`，与官方扩展互不干扰。
- chatOnly 会话（空工具 allow-list）不会激活 `customTools`，无需特判工具可见性。
- 扩展的 `open` 在工具执行时按 `sessionId` 从 `getRegistry()` 查 wrapper（注册先于扩展绑定，无时序问题）。
- 工具注入代码在 server 端模块，旧 dev server 进程不会热加载（验证时需重启 dev server）。
- 开关变更只影响 reload 后的会话；已存在会话的扩展绑定在 reload 时重建。

## UI 布局（卡片随消息流滚动）

- 非空会话：`AskUserCard` 渲染在消息滚动容器内（`messageContentRef` 内、`{rendered.slice(startIndex)}` 之后），跟随对话滚动，输入框上方不再固定占位，消息可视区域保持全高。卡片无固定高度上限、无内部滚动，问题较多时由整个滚动区承担滚动。
- 空会话（新会话页）：卡片在 header 与 composer 之间，保持 `padding: 0 16px 12px`（桌面端 `paddingRight: 52`）的列对齐包装。
- 命名约定（`ChatWindow.tsx`）：`askUserCardElement` 是裸卡片（滚动流内使用），`askUserCardInColumn` 是带列对齐 padding 的包装（仅空会话使用）。改动布局时注意两处引用语义不同。
- ask 出现时无需额外滚动逻辑：`prompt_done`/`agent_end` 使 `agentRunning` 置 false 后，现有 `useLayoutEffect` 在 `isNearBottom` 时 `scrollToBottom`，卡片自动进入视野；用户已上滚查看历史时不打扰。ask 与 agent running 不同时存在，`promptAnchorSpacer` 测量不受影响。
- 回归测试：`components/ChatWindow.ask-user-layout.test.mjs`（源码断言）覆盖卡片在滚动容器内、composer 区不再承载卡片、空会话包装、卡片无 maxHeight/内部滚动。
