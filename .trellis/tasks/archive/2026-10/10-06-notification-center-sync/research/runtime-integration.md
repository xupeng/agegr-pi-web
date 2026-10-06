# 通知中心服务端接入研究

来源：只读子代理 `01a11082-1e84-7540-97bf-c3bf66d1d36d`，2026-10-06。这是规划证据，不是实现或测试验收；未修改产品代码、启动服务或访问真实 agent 数据。

## 推荐边界

- 服务端实例级通知状态源，提供全局快照/订阅；通知中心与项目侧栏复用同一客户端状态。
- 完成记录持久化，pending 交互从原状态机投影；不复制 ask 或扩展交互状态机。
- 不为每个会话建立 SSE：现有会话 events 路由会重建 wrapper 并持有 liveness lease（`app/api/agent/[id]/events/route.ts:16-26`，`lib/agent-event-stream.ts:174`）。
- 聚合元数据只读取通知涉及的会话，使用 `getRpcSessionInfos()`、`readSessionById()`、`attachSessionProjectInfo()`（`lib/rpc-manager.ts:2490`，`lib/session-reader.ts:361,163`），保留项目按需加载。

## 完成出口

- `AgentSessionWrapper.notifyAgentRunCompleteIfIdle()` 使用 completion flag 去重并等待整个 run idle，是现有统一完成出口（`lib/rpc-manager.ts:571-579`）；`isRunning()` 包含 pending prompt、streaming、compaction、bash（`:397-399`）。
- 入口包括 SDK `agent_settled`（`:428-441`）及 prompt promise 完成后的 pending count 释放（`:1022-1028,1081-1099`）。服务端 Web Push 已使用该出口（`:2785-2795`），不依赖浏览器在线。
- 不应以单个 `turn_end`、`agent_end` 或 `prompt_done` 作为全局完成记录；已有测试覆盖中间 agent_end、无 SSE 的扩展注入 run 与通知抑制（`lib/rpc-manager-shutdown.test.mjs:162,201,323`）。
- 该出口需要额外分类：ask 发出会结束 run 但仍待交互；accepted/handled 可能未运行模型；失败和 Stop 也会进入 finish 路径（`lib/rpc-manager.ts:584-609,1004-1013,1074-1099`）。产品规则现已收敛到 `../prd.md`；该现有出口本身不是精确完成分类器。
- 保留内置 subagent 抑制（`lib/rpc-manager.ts:2283-2293,2793`）及 Trellis 记录不参与通知计数的既有约束。

## Pending 权威源与恢复

| 类型 | 权威源 | 恢复能力 |
| --- | --- | --- |
| ask_user | `PendingAskStore.open/submit/cancel/cancelOpen`（`lib/ask-user/store.ts:83,105,119,129`）；wrapper 的 ask.opened/closed（`lib/rpc-manager.ts:591-605,635-686`） | 已有 best-effort 磁盘镜像，可跨 wrapper/服务重启重水合 |
| select/confirm/input/editor | wrapper `pendingUiRequests`、`pendingUiResponses`，统一 `requestExtensionUi()`（`lib/rpc-manager.ts:2003-2051`） | 仅存活 wrapper；服务重启后不能恢复原 Promise continuation |
| custom UI | `activeCustomUis` 与最新 render（`lib/rpc-manager.ts:1871-1907,1982-1989`） | 仅存活 wrapper；不能序列化后声称恢复组件和运行 |

- `loadOpenAsks()` 可批量读取磁盘 pending（`lib/ask-user/persist.ts:70-85`）；重建保留 askId（`lib/rpc-manager.ts:2272-2278`）；无 wrapper 的状态 API 已有镜像回退（`app/api/sessions/[id]/state/route.ts:20-29`）。
- 存活 wrapper 的状态覆盖磁盘，包括“无 ask”，否则清盘失败可能复活旧问题。ask 镜像写失败静默降级，不是可靠 outbox（`lib/ask-user/persist.ts:86-102`）。
- 扩展交互在销毁时取消并清 maps（`lib/rpc-manager.ts:1548-1552`）；重启后重新发出的请求是新请求，旧请求不应继续呈现为可操作。
- `wrapper.onEvent()` 已回放 pending UI（`lib/rpc-manager.ts:899-906`）；现有 SSE 的订阅→缓冲→快照→放行顺序可作参考（`lib/agent-event-stream.ts:234-281`）。FIFO/id 去重/custom 重绘更新已有 helper（`lib/extension-ui-queue.ts:13-48`）。

## 一致性和生命周期

- 查看完成必须携带已观察的 completion revision，不可按 sessionId 无条件清除，否则旧查看会清掉新完成。
- 看过 pending 提醒只改变通知元数据，绝不能隐式 ask_submit/ask_cancel 或 extension response；custom 重绘不能重复通知。
- 全局 SSE 和快照需要 revision、断线重取及 online/visibility 恢复，不改变会话运行状态或续 idle lease。
- 记录须绑定 wrapper generation/run identity；旧 wrapper 销毁后的迟到 prompt completion 不得误报。registry replacement 防护位于 `lib/rpc-manager.ts:2261-2270`，原完成 gate 尚无同等保护（`:397-399,571-579`）。
- 会话删除必须清理实际删除集合（含 subagent 后代），防止异步 shutdown/unlink 窗口里的迟到事件重建记录；普通 fork 被重挂而非一律删除（`app/api/sessions/[id]/route.ts:272-281,318-334,386-396`）。部分删除失败需对齐实际结果。
- 可复用私有原子写 helper（`lib/atomic-file.ts:9-34`）；完成记录不能照搬 ask 的静默写失败策略却许诺可靠保存。持久化失败要设计可见降级和重试边界。
- 持久化目录需遵守 agent dir 和单进程部署边界，不误称支持多个进程写同一文件（`lib/ask-user/persist.ts:22-29`）。

## 决策收敛与后续精确研究

- 最终产品/风险规则以 `../prd.md` 为唯一owner：摘要跳转、每会话最新完成、无已读历史、批量只处理完成、结果真实可视后ack、新run保留旧项、正常实际run分类均已确认。
- SDK公开boundary、Web-only tracker与特殊收尾异常限制的精确反证复核见 `completion-contract.md`；用户已接受该首版限制，不把“SDK必须改造”当成实现前置。
- 页面关闭期间的完成应收集；崩溃发生在完成与提交之间的窗口不建exactly-once journal，不从transcript猜测。
- 普通扩展交互不具备重启恢复能力，已纳入明确范围边界；新快照不得继续保留失效可操作请求。
