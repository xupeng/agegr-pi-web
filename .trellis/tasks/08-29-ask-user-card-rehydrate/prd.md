# ask_user 卡片会话切换/重开丢失

## Goal

修复 ask_user 卡片在会话切换、页面刷新、其他设备打开后消失的问题：客户端重新挂载会话时没有恢复服务端 `get_state` 返回的 `pendingAsk`；且服务端 open ask 是进程级内存态，wrapper 空闲销毁（10 分钟 idle / 服务重启）后连同内存一起丢失，用户再也看不到也回答不了已发出的问题。

## Background（根因）

- `PendingAskStore`（`lib/ask-user/store.ts`）是进程级内存单例，`get_state` 一直返回 `state.pendingAsk`。
- 客户端 `loadSession(sid, showLoading, includeState=true)`（`hooks/useAgentSession.ts` L458）的 includeState 分支（L495-520）与挂载 effect（L1919-1928）恢复了 `contextUsage / systemPrompt / thinkingLevel / extensionStatuses / extensionWidgets / queuedMessages`，**唯独漏了 `pendingAsk`**。
- 切换会话时 AppShell 用 `<ChatWindow key={sessionKey}>` 整体卸载重挂，其他设备打开走同一条挂载路径，所以卡片消失。这违反 `ask-user-protocol.md` 中"`get_state` 返回 `pendingAsk`，浏览器刷新后重水合卡片"的设计意图。
- 服务端 `AgentSessionWrapper.destroy()` 调用 `PendingAskStore.forgetSession()`，10 分钟空闲超时后 open ask 从内存消失，且不可恢复。

## Requirements

### R1 客户端重水合（必做）

- `loadSession` 的 includeState 分支恢复 `state.pendingAsk`（`undefined` → 置 null，有值 → 置 ask）。
- 挂载 effect 中处理 `agentState.state.pendingAsk`，与其它 state 字段一致。
- 行为不回归：正在作答/已提交的卡片状态、锁定态、`resolvePendingAskAfterClose` 竞态逻辑不变。

### R2 服务端持久化（必做）

- open ask 在 `submit / cancel / supersede / cancelOpen` 之外不得因 wrapper 销毁而丢失：
  - open 时持久化，close（submit/cancel/supersede/cancelOpen）时清理，`destroy()` 不再等于丢弃 ask。
  - wrapper 重建（`startRpcSession`）时从磁盘 rehydrate 回 `PendingAskStore`，保留原 askId（浏览器卡片 key 与 `ask_submit` 的 askId 必须一致）。
  - wrapper 不存在时（已 idle 销毁 / 进程重启），`/api/sessions/[id]/state` 与 `/api/agent/[id]` 仍能返回持久化的 `pendingAsk`，供客户端挂载恢复。
- 会话删除（`DELETE /api/sessions/[id]`）时清理对应持久化记录。
- 持久化读写失败必须降级（日志 + 内存态继续工作），不得影响主流程。

## Acceptance Criteria

- [ ] 发出 ask_user 后切换到别的会话再切回，未回答的问题卡片恢复显示、可正常作答。
- [ ] 页面刷新后卡片恢复显示。
- [ ] 其他设备（同一服务）打开该会话，卡片恢复显示。
- [ ] 会话空闲超过 10 分钟（wrapper 被销毁）或服务重启后重新打开，卡片仍恢复显示且可作答（`ask_submit` 成功，不返回 stale）。
- [ ] 提交 / 取消 / 被新 ask 取代 / 用户直接发消息后，持久化记录被清理，再次打开不显示幽灵卡片。
- [ ] 删除会话后其持久化记录被清理。
- [ ] 新增测试：持久化模块读写与容错、`PendingAskStore.restore`、客户端恢复路径（源码断言）。
- [ ] TypeScript 类型检查、变更文件 lint、现有测试全部通过；`ask_user` 功能在 dev server 手工验证。

## Notes

- 持久化存储位置：`~/.pi/agent/pi-web-open-asks.json`（0600、原子写，与 session-list-cache 同风格），sessionId 键控。
- 内存态（`PendingAskStore`）仍是运行中的权威来源；磁盘是跨 wrapper 生命周期/进程的重水合来源。
- 相关活跃任务：08-29-ask-user-card-state-reset（组件内状态残留）、08-29-ask-user-submit-lockup-supplement（提交锁定）——本任务只改恢复/持久化，不动卡片组件内部状态机。
