# 会话停滞看门狗：无进展时自动中止冻结的 turn

## Goal

pi-web 会话里，一个 turn 一旦进入「不再产生任何事件」的状态——工具卡住、子代理子进程停摆、provider 流停滞——它会无限期挂着：UI 上只剩一个在跑的工具卡，用户除了手动 Stop 没有别的出路。本任务在 pi-web 侧加一个**停滞看门狗**：turn 进行中但连续超过阈值没有任何事件时，自动中止该 turn，并留下可读原因（含最后在跑的工具名与已运行时长）。

用户价值：不必再盯着屏幕等 40 分钟到 1.8 小时才敢取消；失败从「无限挂起」变成「一次带解释的中止」。

## Background

### 现场数据（在 /home/xupeng/dev/personal/personal-assistant 的历史会话实测）

| 指标 | 值 |
|---|---|
| `trellis_subagent` run 总数 | 85 |
| 结果分布 | 79 succeeded / 6 cancelled |
| 时长 min / p25 / median / p75 / p90 / max | 98s / 312s / 581s / 856s / 1204s / **6511s** |
| 超过 10 分钟 | 40 次 |
| 超过 30 分钟 | 3 次（6511s、2340s 两次是用户手动取消） |
| 子进程 errorMessage | `Stream ended without finish_reason` × 5、`503 status code (no body)` × 2、`503 ... Endpoint is unavailable` × 1 |

**核心结论**：工具/子代理卡死 与 provider 流停滞是**同一个失败类**——turn 在进行中但不再产生任何事件。手动 Stop/Esc 一直是唯一出路。

### 为什么本仓库单方面就能修（已核实的机制）

- **事件入口唯一**：`lib/rpc-manager.ts:340 start()` → `:341 this.inner.subscribe((event: AgentEvent) => …)`，所有 agent 事件（模型 delta、`tool_execution_start|update|end` 等）都过这里。
- **in-flight 工具已是现成结构**：`lib/rpc-manager.ts:247 private activeToolEvents`，`:349` 在 `tool_execution_start|tool_execution_update` 写入、`:351` 在 `tool_execution_end` 删除。
- **运行态判定已存在**：`lib/rpc-manager.ts:313 isRunning()` = `pendingPromptCount > 0 || inner.isStreaming || inner.isCompacting || inner.isBashRunning`。
- **既有 idle 计时器提供可照搬的范式**（但职责不同，不能混用：它是「会话包装器还能不能回收」，命中会 shutdown 会话）：`:139 IDLE_RESET_EVENT_TYPES`、`:354` 重置调用点、`:623 resetIdleTimer()`、`:1207 destroy()` 清理；env 解析范式 `:156 export function resolveSessionIdleTimeoutMs()`（`PI_WEB_IDLE_TIMEOUT_MS`，默认 10 分钟，`0` 关闭，非法值回落默认并 `console.warn`，导出以便单测）。
- **中止路径复用即可**：浏览器 `POST /api/agent/[id]` body `{type:"abort"}`（`app/api/agent/[id]/route.ts`）→ `lib/rpc-manager.ts:708 send()` 分发 → `:834 case "abort"`（`extensionUiAbortController.abort()` + `await this.withFinalIdleReset(() => this.inner.abort())`）。
- **事件出口**：SSE `app/api/agent/[id]/events/route.ts`；事件整形 `lib/agent-event-wire.ts`（`toClientAgentEvent`、`OMITTED_EVENT_TYPES`、`isEventIncludedInSnapshot`）；`destroy()` 先 `emit({type:"session_shutdown"})`，说明服务端主动补发事件是既有模式。
- **Trellis 子代理记录已有投影层**：`lib/trellis-subagent-records.ts`（25.2K，run/tool 状态投影）+ `lib/trellis-subagent-history.ts`；契约 owner 是 spec `.trellis/spec/frontend/trellis-subagent-records.md`（明确要求：不要在组件里重复 producer 接口，**不要把 `.pi/extensions/trellis` 导入浏览器**）。停滞原因若要显示在子代理面板/卡片上，应走这条既有通道，而不是新造一套。
- **配置层已存在**：配置文件 `~/.pi/agent/pi-web-settings.json`，读写范式 `lib/ask-user-settings.ts`（`getAskUserSettingsPath()`、`writePrivateFileAtomicSync`）；env 优先先例 `PI_WEB_ASK_USER` / `PI_WEB_IDLE_TIMEOUT_MS`；设置 API 路由范式 `app/api/settings/ask-user/`。
- **卡死的子进程由 turn abort 连带回收，不需要改 Trellis**：`.pi/extensions/trellis/index.ts:1514 runPi()` 的子进程 Promise 只在 close / error / 父级 AbortSignal 三处 resolve；AbortSignal 触发即 SIGTERM → 1.5s 后 SIGKILL（同文件 `:1544`）。
- **粒度限制**：pi SDK 只提供 turn 级 abort（工具签名 `execute(toolCallId, params, signal, onUpdate, ctx)` 里的 `signal` 即 turn 的 abort signal；pi docs `extensions.md:1021`），没有按 toolCallId 中止单个工具的公开 API。所以看门狗粒度是 turn——这是本方案的主要代价。

### pi 事件没有心跳

pi json 模式事件只有 `session` / `agent_start` / `turn_start` / `message_start` / `message_update` / `message_end` / `turn_end` / `agent_end`（pi docs `json.md`），**没有 keepalive**。含义：子进程正在跑一条长 bash 命令时会合法地长时间静默。看门狗必须按「无事件时长」而非「总时长」判定，并给 `bash` 这类工具单独的宽限值。

### 范围决策（用户已定）

- **不改 Trellis 框架**（不碰 trellis 模板 / fork / 其它仓库的 `.pi/agents/*.md`）。理由：pi-web 单方面可实现；且 Trellis 模板是通用框架产物，不应出现依赖某个宿主的能力描述。
- 因此「子代理 run 级精确看门狗」（只杀卡死的子进程、保住 turn）明确不做。若将来需要它在 Codex / Claude 等其它宿主下也生效，另开框架任务（且表述必须与宿主无关）。
- **不改本仓库工作区已有的未提交改动**：`.pi/agents/trellis-{check,implement,research}.md` 的 frontmatter 是用户在进行中的另一件事，实现时不得覆盖或顺带提交。
- 端到端验证（AC5/AC6）的执行现场在 `/home/xupeng/dev/personal/personal-assistant`（那里有真实的 `trellis_subagent` 派发场景）；本任务的产品与代码改动都在本仓库。

## Requirements

- **R1 停止冻结的 turn**：turn 进行中且连续超过阈值没有任何 agent 事件 → 自动中止该 turn（复用 `case "abort"` 的既有序列）。
- **R2 阈值可配置**：配置文件键 + `PI_WEB_*` 环境变量优先 + 默认值开箱可用；`0` 关闭；非法值回落默认并 warn。
- **R3 按工具宽限**：`bash` 这类合法长静默工具需要更长阈值，避免误杀长命令（如整套 e2e）。
- **R4 原因可见**：中止后留下可读原因（「因 N 分钟无输出中止」）并带上最后在跑的工具名与已运行时长；显示通道要与 `.trellis/spec/frontend/trellis-subagent-records.md` 的既有契约相容（优先复用该投影层/卡片，不新造通道）。
  - **追加（返工）**：原因必须**持久化在会话记录里**——刷新页面、换设备或事后回看时仍然可见，不能只活在瞬时 toast 与服务端日志里。目标场景恰恰是「用户离开屏幕等了很久」，回来时只能看到 `This operation was aborted` 等于没有留下原因。
- **R5 不误杀活跃会话**：任何 agent 事件都必须重置计时。
- **R6 生命周期正确**：只在 turn 活跃时计时；用户 abort、turn 正常结束（`agent_settled`/`agent_end`）、`destroy()` 都必须停表，不泄漏定时器、不重复触发。
- **R7 可观测**：按本仓库既有日志方式（`console.*` 前缀约定）记录触发信息（会话、阈值来源、最后工具与已运行时长、静默时长），便于事后判断是否误杀。

## Acceptance Criteria

- [x] **AC1** 单测（`node:test` + `jiti`，风格照 `lib/rpc-manager-idle-timeout.test.mjs`）：构造活跃 turn + 一个 in-flight 工具，不再产生任何事件，推进越过阈值 → 断言走了 abort 序列、发出了停滞事件、且带工具名与已运行时长。*（`lib/rpc-manager-stall-watchdog.test.mjs`；含无 in-flight 工具、回调重入、工具宽限三条补充用例。）*
- [x] **AC2** 单测：期间持续产生事件（`tool_execution_update` 或模型 delta）→ 无论推进多久都不触发。*（`tool_execution_update` 与 `message_update` 两条路径各一条用例。）*
- [x] **AC3** 解析测试：阈值来源优先级（env `PI_WEB_*` > 配置文件 > 默认）、`0` 关闭、非法值回落并 warn，风格与 `resolveSessionIdleTimeoutMs` 的既有测试一致。*（含真读磁盘的配置文件用例，未用 `stored` 注入冒充；工具表合并 / `0` 移除 / 非法忽略 / 畸形文件各有用例。）*
- [x] **AC4** 生命周期单测：turn 结束 / 用户 abort / `destroy()` 之后计时停止且不重复触发。*（另含 `hasPendingTimer` 断言以挡住「只置 armed=false 但 timer 泄漏」的假通过，以及连续两次 `start()` 不得复用旧 timer。）*
- [x] **AC5** 端到端（在 personal-assistant 实跑）：把阈值调到极小（如 60s），派发一个真实 `trellis_subagent`（耗时 > 阈值）→ 会话自动中止、原因可见，且 `pgrep -f 'pi --mode json'` 无遗留子进程。*（阈值 90s；`stall_aborted` 于 90009ms 静默命中，独立按时间线复算 90012ms；62ms 后 settle；子进程零残留；三语文案渲染正确。见 `research/ac5-result.json` / `ac5-events.jsonl`。注意「原因可见」的边界见 spec §8：5 秒 toast + 服务端日志，刷新后 transcript 只剩 `This operation was aborted`。）*
- [x] **AC6** 回归（人工观察，非阻断）：阈值恢复默认后，一次正常的长派发（历史 median ≈ 10 分钟量级）不被中止。*（默认阈值（dev server 不带 env、配置文件无 stall 键）下真实派发 657.6s ≈ 11 分钟、23 次进度事件 → 无 `stall_aborted`、工具 `isError: false`、零残留。见 `research/ac6-result.json` / `ac6-events.jsonl`。）*
- [x] **AC7** 持久化（返工追加）：停滞中止后，会话 `.jsonl` 里存在一条 `custom_message` 条目（`customType === "pi-web.stall.abort"`），其 `details` 带最后工具名、静默时长、阈值与来源；重新加载该会话时这条渲染为**可读原因**（三语，不是裸 JSON）；写入使用 `triggerTurn: false`，不额外触发新 turn。*（真实 90s 阈值派发：条目落在 `toolResult` 之后、被中止的 assistant 之前，七个 `details` 字段与 `stall_aborted` 事件逐字段相等；冷读 `buildSessionContext` 与 `GET /api/sessions/:id/context` 都能取回 `role: "custom"` 的原因；停滞之后没有 `agent_start`，且条目之后没有新 turn。见 `research/ac5-result.json`（14/14 checks）与 `ac5-events.jsonl`。渲染由 `components/MessageView.test.mjs` 的正向本地化断言 + 负向「不出现英文 content / 裸 JSON」覆盖，未跑 Playwright。）*

## Out of Scope

- 修改 Trellis 框架（模板、fork、其它仓库的 agent frontmatter）。
- 工具级精确中止（pi SDK 只提供 turn 级 abort）。
- 停滞后的自动重试、自动恢复或自动降级模型。
- 本仓库自带的子代理运行时（`lib/subagent-runtime.ts` / `lib/subagent-extension.ts` / `SUBAGENT_CONTROLLER.abort`）的行为变更。
- 修 provider 侧的 503 / `Stream ended without finish_reason` 本身。

## Open Questions

（空 — 范围与落点均已确认。）
