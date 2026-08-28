# 为 Pi Web 实现 ask_user 提问支持

## Goal

参照 /home/xupeng/dev/personal/forked/pi-web 的异步 ask_user 设计（自定义工具 terminate 结束 run + daemon store + follow-up 唤醒 + 浏览器卡片），在 agegr-pi-web 中实现向用户提问能力

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
# 为 Pi Web 实现 ask_user 提问支持

## Goal

参照 `/home/xupeng/dev/personal/forked/pi-web` 的异步 ask_user 设计，在 agegr-pi-web 中让模型可以通过 `ask_user` 工具向用户提问：问题以浏览器卡片形式呈现，用户提交答案后以 follow-up 消息唤醒模型继续，运行过程不被 pin 住。

## Background（已确认的事实）

- 参考项目（pi-web fork）实现了 `ask_user` 自定义工具：参数为问题集（`id/question/detail/options[]/multiple`），执行时把问题存入 daemon 级 store，返回 `terminate: true` 结束本轮运行；用户提交后通过 `session.sendCustomMessage(..., { triggerTurn: true, deliverAs: "followUp" })` 把答案作为系统级 follow-up 唤醒模型。
- 纯扩展方案（GitHub 现有 ask_user 扩展）全部是 TUI 渲染向（`ctx.ui.custom()`），官方 RPC 模式下 `custom()` 返回 `undefined`，且语义为阻塞式（pin 住 run、状态易失），体验达不到参考项目标准。
- agegr-pi-web 底层能力已确认具备：pi SDK 0.84.3 的 `defineTool`、`createAgentSessionFromServices({ customTools })`、`AgentSession.sendCustomMessage({ deliverAs: "followUp" })`、现有 SSE 事件通道与命令协议。

## Requirements

### 服务端（领域层 + rpc-manager 集成）

- 提供 `ask_user` 工具定义（TypeBox schema、长度/数量限制、prompt 提示），执行时把问题集登记为会话的 open ask 并返回 `terminate: true` 结束运行；畸形问题集抛错成为模型的 error tool result。
- 提供纯领域 store：每会话至多一个 open ask；支持 open / supersede / submit / cancel / cancelOpen / forgetSession 转换；校验答案必须匹配 open ask（未知 id、重复、超限、multiple 冲突均拒绝）；渲染给模型阅读的答案文本（明确列出未答问题）。
- 答案经 `sendCustomMessage` 以 follow-up 唤醒模型（`triggerTurn: true, deliverAs: "followUp"`），不归于用户署名；用户直接发聊天消息时作废 open ask 并告知模型（`triggerTurn: false`，搭普通消息的便车）。
- 通过现有 SSE 通道发布 `ask.opened` / `ask.closed` 事件；`get_state` 返回当前 pendingAsk 供浏览器刷新后重水合。
- 通过现有命令协议（`POST /api/agent/[id]`）提供 `ask_submit` / `ask_cancel` 命令；stale 提交返回 `{ result: "stale" }` 而非报错。
- 默认启用，可通过 `PI_WEB_ASK_USER` 环境变量关闭；Chat-only 会话不注入该工具。

### 客户端

- 浏览器以卡片表单呈现 open ask：问题按顺序展示，支持选项单选/多选、"其他"自定义文本、部分作答；显示已答计数；支持提交与取消。
- 提交/取消经 `ask_submit` / `ask_cancel` 命令回传；收到 `ask.closed` 时关闭卡片；页面刷新后从 `get_state.pendingAsk` 重水合。

## Constraints

- 复用现有 `lib/rpc-manager.ts`、`hooks/useAgentSession.ts`、`components/ChatWindow.tsx` 通道，不引入新路由（命令协议已足够）。
- 领域逻辑（schema、校验、store、答案渲染）放在与 Next.js 无关的 `lib/ask-user/` 纯模块，便于单测与将来复用/打包成扩展。
- 限制常量与参考项目一致：最多 20 个问题、每题最多 12 个选项、id ≤ 128、文本 ≤ 1000、自定义文本 ≤ 4000。
- 不改变 pi 官方 `ctx.ui` 行为；本功能是 Pi Web 自有能力。

## Acceptance Criteria

- [ ] `lib/ask-user/` 领域模块有单测覆盖：open/supersede/submit/cancel/cancelOpen/forgetSession、全部校验分支、答案文本渲染、工具 schema 常量。
- [ ] 手动端到端验证（dev server）：
  - 让模型调用 `ask_user` → 浏览器出现问题卡片，agent 运行结束（不保持 streaming）；
  - 提交答案 → 模型收到 follow-up 并继续回答，transcript 可见答案记录但不署名用户；
  - 取消卡片 → 模型被告知所有问题未答；
  - 不答卡片直接发消息 → 卡片作废，模型被告知未答且不额外触发一轮；
  - 新 ask 顶掉旧 ask → 旧卡片关闭，模型被告知旧问题未答；
  - 页面刷新 → 卡片从 `get_state` 恢复。
- [ ] `PI_WEB_ASK_USER=0` 时工具不可见（`get_tools` 不含 ask_user），会话可用性不受影响。
- [ ] TypeScript 类型检查通过；变更文件 lint 通过；全量单测通过。

## Notes

- 参考项目文件：`src/server/sessions/askUserTool.ts`、`pendingAskStore.ts`、`piSessionService.ts`（openAsk/submitAsk/cancelAsk/voidOpenAskForUserMessage）、`src/client/src/components/AskUserCard.ts`、`src/shared/apiTypes.ts`。
- 本任务的异步语义（terminate + follow-up 唤醒）是参考项目特意设计、区别于 pi 阻塞式 `ctx.ui` 的核心点，实现时必须保持。
