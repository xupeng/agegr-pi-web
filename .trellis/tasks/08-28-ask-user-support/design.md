# Design: ask_user 提问支持（agegr-pi-web 架构移植）

## 总体架构

参照参考项目 pi-web 的异步设计，按 agegr-pi-web 的 Next.js + in-process AgentSession 架构落地。三层：

```
模型 --ask_user 工具调用--> AgentSession(customTools) --openAsk--> AskUserStore（进程级单例）
      │ 校验/状态机
      AskUserStore --(ask.opened/ask.closed)--> AgentSessionWrapper.emit --> SSE --> 浏览器
浏览器 AskUserCard --ask_submit/ask_cancel--> POST /api/agent/[id] --> wrapper.send
      --> store 关闭 --> inner.sendCustomMessage(answers, {triggerTurn:true, deliverAs:"followUp"}) --> 模型唤醒
```

## 模块与文件

### 1. `lib/ask-user/`（纯领域层，无 Next.js / SDK 运行依赖，可单测）

- `types.ts`
  - 类型：`AskUserQuestionOption`（value/label/detail?）、`AskUserQuestion`（id/question/detail?/options[]/multiple?）、`AskUserAnswer`（id/values[]/otherText?）、`AskUserSubmission`（answers[]）、`PendingAskUser`（askId/askedAt/questions[]）、`AskUserQuestionRecord`、`AskUserOutcome`（reason: submitted|cancelled|superseded、questions[]、answeredCount、unansweredIds、summary）。
  - 常量：`ASK_USER_ANSWERS_CUSTOM_TYPE = "pi-web.ask.answers"`、`ASK_USER_QUESTION_LIMIT=20`、`ASK_USER_OPTION_LIMIT=12`、`ASK_USER_ID_MAX_LENGTH=128`、`ASK_USER_TEXT_MAX_LENGTH=1000`、`ASK_USER_OTHER_TEXT_MAX_LENGTH=4000`。
- `store.ts`：`PendingAskStore` 类（进程级单例，`Map<sessionId, PendingAskUser>`）
  - `open(input)` → `{ ask, superseded? }`：校验问题集，关闭旧 ask 并返回其 outcome，登记新 ask。
  - `submit(sessionId, askId, submission)` → `{ status:"closed", outcome } | { status:"stale" }`：先校验答案（未知 question id / 重复答案 / 选项不存在 / multiple 冲突 / 超长 / 空答案丢弃），校验失败抛 `PendingAskValidationError`（模型侧变 error tool result），ask 保持打开。
  - `cancel(sessionId, askId)`：同上，outcome 全部未答。
  - `cancelOpen(sessionId)`：用户发普通消息时作废 open ask。
  - `forgetSession(sessionId)`：会话销毁时清理。
  - `pendingAsk(sessionId)`：供 `get_state` 投影。
  - 渲染函数：`renderAskUserAnswersText(outcome)`（模型阅读，逐题列出 answered/unanswered）、`renderSupersededAskText(outcome)`。
- `tool.ts`：`createAskUserToolDefinition(deps: { open(input) })`，用 `defineTool`（`@earendil-works/pi-coding-agent` 导出）注册 `ask_user`：
  - TypeBox schema：`questions`（min 1 / max 20，字段带长度限制与描述，`options` max 12，`multiple` 可选）。
  - `execute`：`await deps.open({ sessionId: ctx.sessionManager.getSessionId(), questions })` → 返回 `{ content: [text: postedText], details: result, terminate: true }`。postedText 说明"已回答将以 follow-up 唤醒，不要重复提问"，superseded 时附加旧 ask 未答提示。
- `index.ts`：统一导出。

### 2. `lib/rpc-manager.ts`（服务端集成，AgentSessionWrapper）

- **注入**：`startRpcSession` 的 `createAgentSessionFromServices({ ..., customTools })`——非 chatOnly 且启用开关时传 `[createAskUserToolDefinition({ open })]`。`open` 绑定 wrapper 的 `openAsk`。
- **开关**：模块级 `isAskUserEnabled()` 读 `process.env.PI_WEB_ASK_USER`（默认启用；`0/false` 关闭）。
- **store 生命周期**：进程级单例（放 `globalThis.__piAskUserStore`，与 `__piSessions` 同模式防 Next.js 热重载丢失）。
- **wrapper 能力**（AgentSessionWrapper 内新增）：
  - `openAsk(input)`：`store.open` → 若有 superseded 先 emit `ask.closed`（旧卡片的浏览器要先知道）→ emit `ask.opened` → 返回结果。emit 类型复用现有 `emit(event)` 通道（与 `extension_ui_request` 一样用结构类型断言）。
  - `submitAsk(askId, submission)` / `cancelAsk(askId)`：`store.submit/cancel` → stale 直接返回 `{ result:"stale", state }`；closed 则 emit `ask.closed` + `inner.sendCustomMessage({ customType, content: renderAskUserAnswersText(outcome), display:true, details:outcome }, { triggerTurn:true, deliverAs:"followUp" })`。
  - `voidOpenAskForUserMessage()`：`store.cancelOpen` → 有 outcome 则 emit `ask.closed` + `sendCustomMessage(..., { triggerTurn:false, deliverAs:"followUp" })`（搭用户消息的便车，不单独唤醒）。**在 `send()` 的 `prompt` 命令入口调用**。
  - `destroy()`：`store.forgetSession`。
  - `get_state` 返回新增 `pendingAsk` 字段。
- **命令**：`send()` switch 新增 `case "ask_submit"` / `case "ask_cancel"`（参数 `askId`、`answers`），错误经现有错误通道返回；校验失败（畸形答案）返回错误语义而非崩溃。
- **browser-notifications**：`ask.opened` 纳入需要注意力的事件（`onAttentionNeeded`），与 blocking extension ui 一致。

### 3. `lib/types.ts`（客户端共享类型）

- 新增 `AskUserQuestionOption / AskUserQuestion / AskUserAnswer / AskUserSubmission / PendingAskUser / AskUserOutcome`（结构镜像自 `lib/ask-user/types.ts`，客户端 import 路径避免引服务端模块）。
- `AgentEvent` 相关事件类型新增：`{ type:"ask.opened"; ask: PendingAskUser }`、`{ type:"ask.closed"; askId: string; reason: "submitted"|"cancelled"|"superseded" }`。
- `get_state` 响应类型加 `pendingAsk?: PendingAskUser`。

### 4. `hooks/useAgentSession.ts`

- `handleAgentEvent` 新增 `ask.opened` / `ask.closed` case：维护 `pendingAsk` state（opened 设置、closed 时若 askId 匹配则清除）。
- 暴露 `submitAsk(askId, answers)` / `cancelAsk(askId)`：`sendAgentCommand(sid, { type:"ask_submit", askId, answers })` / `ask_cancel`，成功后清 state；stale 响应时从返回的 state 重水合。
- 挂载时 `get_state` 响应中的 `pendingAsk` 用于刷新后重水合。

### 5. `components/AskUserCard.tsx`（新组件）

- 属性：`ask: PendingAskUser`、`onSubmit(askId, submission)`、`onCancel(askId)`。
- 渲染：问题列表（标题 + detail + 选项单/多选 + "其他"文本框）、已答计数、提交（允许部分作答）/ 取消按钮；提交时把答案组装为 `AskUserSubmission`。
- 草稿（localStorage）可选做，首版可省略（参考项目有，但非验收必需）。
- 样式沿用现有 CSS 变量（--bg-panel/--border/--accent 等）。

### 6. `components/ChatWindow.tsx`

- 在输入框上方渲染 `AskUserCard`（存在 `pendingAsk` 时）；提交/取消回调接到 `useAgentSession` 暴露的方法。
- 卡片关闭后不再渲染。

## 关键数据流与语义

1. **提问**：模型调 `ask_user` → 工具 execute（wrapper.openAsk）→ store 登记 → emit `ask.opened` → 浏览器卡片出现；工具返回 `terminate: true`，run 正常结束（不 streaming、不悬挂 tool call）。
2. **回答**：用户提交 → `ask_submit` → store 校验并关闭 → emit `ask.closed` → `sendCustomMessage(..., triggerTurn:true, followUp)` → 模型被唤醒，读到答案文本（含未答列表）继续工作。
3. **作废**：用户发普通消息 → `prompt` 入口先 `voidOpenAskForUserMessage` → store 关闭 + 告知模型（不单独触发一轮）。
4. **取代**：新 `ask_user` → store.open 内部先关闭旧 ask → 先 emit 旧 `ask.closed` 再 emit 新 `ask.opened`；模型被告知旧问题未答。
5. **stale**：浏览器提交的 askId 已不是 open ask（已提交/被取代/会话销毁）→ 返回 stale，浏览器按返回的 `pendingAsk` 重水合，不视为错误。
6. **刷新重水合**：`get_state.pendingAsk` 返回 open ask，浏览器恢复卡片。

## 边界与限制

- Chat-only 会话（`chatOnly`）不注入工具：无 ask_user，行为不变。
- 畸形问题集 / 畸形答案：抛 `PendingAskValidationError` → 模型 error tool result（可自纠重发） / 命令返回错误（浏览器可修正），ask 保持打开。
- 答案自定义消息 `display: true` 进 transcript 但不归属用户（custom message，非 user message）。
- 会话销毁（wrapper.destroy / 进程退出）：store 清理对应 sessionId，不残留。
- 多浏览器标签页：同一会话的 ask 以服务端 store 为准，提交以 askId 匹配，天然防重复。
- 不使用 pi 官方 `ctx.ui` 阻塞通道；不改变现有 extension_ui 行为。

## 验证方案

- 单元测试：`lib/ask-user/store.test.mjs`（node:test 风格，参照仓库现有 `lib/*.test.mjs`）覆盖状态机与校验全分支；`tool.test` 覆盖 schema 常量与 postedText。
- 类型检查：`node_modules/.bin/tsc --noEmit`。
- 手动端到端：dev server 按 Acceptance Criteria 逐条验证。
- lint：变更文件。
