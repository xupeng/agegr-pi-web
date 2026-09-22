# Design：会话停滞看门狗

## 1. 边界与归属

- 实现位置：本仓库（`@xup3ng/pi-web` 0.9.5，即当前环境运行的版本）。
- 职责单一：只回答「这个 turn 是不是已经不再产生任何事件了？」。不做重试、不做恢复、不改工具语义、不改既有 idle shutdown 语义。
- 不动 Trellis 框架：子进程回收由既有 AbortSignal 链路负责（`.pi/extensions/trellis` 的 `runPi` abort → SIGTERM → SIGKILL），pi-web 只需中止 turn。
- 显示层受 `.trellis/spec/frontend/trellis-subagent-records.md` 约束：停滞原因应通过既有投影层（`lib/trellis-subagent-records.ts` / 会话记录）呈现，不在组件里重复 producer 接口，也不把 `.pi/extensions/trellis` 导入浏览器。

## 2. 数据流与契约

```
AgentEvent ──► AgentSessionWrapper.start() 的 subscribe 回调（lib/rpc-manager.ts:340-358）
                  │
                  ├──► (既有) activeToolEvents / IDLE_RESET_EVENT_TYPES → emit → SSE
                  │
                  └──► 新增：lastEventAt 记录                 ← 只读观测，不改事件语义
                              ▼
                      独立定时器（arm/disarm）
                              │  now - lastEventAt > effectiveTimeout(最后 in-flight 工具) ?
                              ▼
                      复用 case "abort" 的既有序列（lib/rpc-manager.ts:834）
                              │  → inner.abort() → 扩展收到 AbortSignal → SIGTERM/SIGKILL 子进程
                              └──► 补发一条可读事件 + console 日志
```

契约要点：

- **观测点**：`AgentSessionWrapper.start()` 里那一个 `inner.subscribe(...)` 回调（`lib/rpc-manager.ts:340-358`），保证「pi-web 看到的事件」与「看门狗看到的事件」完全一致，不引入第二套真相。
- **进度定义**：任何 agent 事件都算进度（模型 delta、`tool_execution_start|update|end`、`agent_settled` 等），不区分「有用/没用」。
- **in-flight 工具**：直接复用既有 `activeToolEvents`（`:247`），不新建平行映射表。
- **动作**：复用 `case "abort"`（`:834`）已有序列，不新增第二条中止实现；原因通过一次性事件 + 日志传播。
- **与既有 idle 计时器的关系**：`resetIdleTimer()`（`:623`）管「会话包装器能否回收」，命中会 `shutdown()` 整个会话；本看门狗管「agent 有无进展」，命中只 abort 当前 turn。两者必须各自独立计时，不合并、不共享状态。

## 3. 阈值策略

- 主阈值 `stallTimeoutMs`（默认 **900000 = 15 分钟**，`0` 关闭）。
  - 依据：健康的长 run 会持续产生事件（子代理每起一个工具就有一次 `tool_execution_update`）；历史 p90 运行时长 1204s、最长正常完成 1857s，但那是**运行时长**而非**静默时长**。15 分钟静默在健康会话里几乎不可能出现。
- 工具级宽限 `stallToolTimeouts`（默认 `{"bash": 1800000}` = 30 分钟）。
  - 依据：一条合法长命令（整套 e2e）会长时间零事件；30 分钟覆盖历史上最长的测试类命令，同时仍能捞回真正卡死的 shell。
- **v1 不设整体墙钟上限**：turn 总时长在正常使用里可能长达一小时（多轮工具 + 多次派发），墙钟阈值误杀风险显著高于收益。若后续需要，作为独立键再加。
- 生效规则：`effectiveTimeout = stallToolTimeouts[最后 in-flight 工具的 toolName] ?? stallTimeoutMs`；无 in-flight 工具时用主阈值。

## 4. 配置与兼容

- 配置键落在既有配置文件 `~/.pi/agent/pi-web-settings.json`，读写沿 `lib/ask-user-settings.ts` 的范式（`getAgentDir()` + 原子写）。
  - `stallTimeoutMs`（number，可空，`0` 关闭）
  - `stallToolTimeouts`（object<string, number>，可空）
- 环境变量覆盖优先，命名沿 `PI_WEB_*` 先例（如 `PI_WEB_STALL_TIMEOUT_MS`）；解析函数写成导出函数以便单测，语义照 `resolveSessionIdleTimeoutMs()`：未设/空白 → 默认；`0` → 关闭；非法/超范围 → 回落默认 + `console.warn`。
- 兼容性：默认值即生效（不要求用户配置）。旧配置文件缺键时回落默认；非法值不阻塞启动。
- 迁移：无数据迁移、无 schema 版本变更。

## 5. 取舍（诚实记录）

| 取舍 | 代价 | 为什么接受 |
|---|---|---|
| turn 级中止而非工具级 | 同一 turn 里其它 in-flight 工具会被一起中止 | SDK 只有 turn 级 abort；且用户今天手动 Stop 的效果相同 |
| 按「无事件」判定而非「总时长」 | 需要工具级宽限表 | 事件流无心跳，长命令的合法静默与卡死同形，只能分层宽限 |
| 不改 Trellis | Trellis 在 Codex / Claude / opencode 等宿主下仍无保护 | 用户明确要求不动 Trellis；宿主侧看门狗覆盖面更宽（provider 流停滞也治） |
| 默认开启 | 可能中止用户其实在等的长命令 | 15/30 分钟量级 + 可配置关闭；比「无限挂起」代价小 |

## 6. 可观测与回滚

- 可观测：每次触发写日志（sessionId、阈值来源、最后工具名与已运行时长、静默时长），并在会话里补发一次可读事件。
- 回滚：`stallTimeoutMs: 0` 或撤掉看门狗接入即回到今天的行为；本改动不改既有 abort / idle shutdown / 归档语义，无数据面回滚。

## 7. 验证策略

- 单测（AC1–AC4）：`node:test` + `jiti` + 可控时间推进，测试文件 `lib/rpc-manager-stall-watchdog.test.mjs`，风格照 `lib/rpc-manager-idle-timeout.test.mjs`。
- 端到端（AC5/AC6）：在 `/home/xupeng/dev/personal/personal-assistant` 实跑（真实 `trellis_subagent` 派发）。本机在跑的是 mise 安装的发布包，验证本地改动需 `npm run dev` 或本地 pack 安装。
- 持久化（AC7）：扩展 AC5 驱动，跑完后直接读会话 `.jsonl` 断言 `custom_message` 条目存在且 `details` 字段完整；渲染层用组件/纯函数测试覆盖（本仓库无 jsdom，走 `renderToStaticMarkup` + 源码断言）。

## 8. R4 持久化（返工追加）

### 机制（已核实到 SDK 源码）

- 写入用 SDK 的 `AgentSession.sendCustomMessage(message, options)`（`pi-coding-agent/dist/core/agent-session.js:1099`），**不是** `sessionManager.appendCustomEntry`：后者写的是 `type: "custom"` 的纯数据条目，`session-reader.ts` 不会把它映射成可渲染消息；`appendCustomMessageEntry` 写的是 `type: "custom_message"`，正是 `session-reader.ts:879` 映射为 `role: "custom"` 消息的那一类。
- 调用时机：`handleStall()` 在 `abortTurn()` **之前**以 `{ triggerTurn: false }` 排队。此时 agent 正在 streaming，SDK 走「Streaming + triggerTurn false → 挂起到 `_pendingCustomMessages`，在 turn 结束时落盘」这条路径；abort 后 `_runAgentPrompt` 的 `finally`（`:783`）必定 flush，因此条目一定会写入。
- 落盘后 SDK 会 emit `message_start` / `message_end`（custom 角色）。客户端对 custom 角色的 live 插入有 guard，但 `agent_end` / `agent_settled` / `prompt_done` 三个事件都会触发 `refreshViewedSession()`，刷新即从会话文件读到这条条目，所以**无需手动刷新**就能在 transcript 里看到，刷新后也仍在。
- `customType`：`pi-web.stall.abort`（常量 `STALL_ABORT_CUSTOM_TYPE` 放在浏览器安全的 `lib/message-display.ts`，与它的渲染函数同处）。
- `content`：给模型看的一句英文摘要（与 `pi-web.ask.answers` 的 `renderAskUserAnswersText` 同类，服务端不知道浏览器语言）。`details` 带 `toolName` / `silentMs` / `timeoutMs` / `timeoutSource` / `toolOverride` / `elapsedMs` / `toolElapsedMs`，供客户端本地化渲染。
- 渲染：`components/MessageView.tsx` 的 `CustomMessageView` 已经会渲染任意 customType（标题 + content + 可折叠 details JSON）。为这个 customType 加一个分支，改用 `formatStallAbortNotice(details, t)` 输出本地化文本，并隐藏裸 JSON details——与既有 `pi-web:subagent-notification` 的特化渲染同一范式。

### 有意接受的后果

- 该条目会进入 `agent.state.messages`，即**模型在下一轮会看到它**（与 `pi-web.ask.answers` 同一机制）。这是有意的：模型因此知道自己上一轮为何被截断。它不会触发新 turn（`triggerTurn: false`）。
- toast 保留：它是「立刻引起注意」的信号，持久卡片才是「留下原因」的载体。两者文案同源（`formatStallAbortNotice`），不会互相矛盾。
