# 会话停滞看门狗（Stall Watchdog）

## 1. Scope / Trigger

本文件是「turn 长时间不再产生任何 agent 事件时被自动中止」这一能力的唯一 spec owner：阈值来源与优先级、生效规则、`stall_aborted` 事件契约、生命周期不变量，以及它与相邻机制的边界。

触发同步本文件的条件：新增或修改 `stallTimeoutMs` / `stallToolTimeouts` / `PI_WEB_STALL_TIMEOUT_MS`，改 `stall_aborted` 的字段，改 `pi-web.stall.abort` 持久化契约，改 arm / disarm / dispose 时机或阈值优先级。

实现：`lib/stall-watchdog.ts`（纯逻辑，可单测）+ 接入点 `lib/rpc-manager.ts:346`（`start()`）。

**明确不属于本文件**

- **会话空闲回收**：由 `PI_WEB_IDLE_TIMEOUT_MS` + `lib/rpc-manager.ts:157 resolveSessionIdleTimeoutMs()` / `:707 resetIdleTimer()` 负责，命中会 `shutdown()` 整个会话。看门狗命中只 abort 当前 turn。**两者各自独立计时，不合并、不共享状态**（`lib/rpc-manager.ts:171` 与 `:157` 是两套常量）。
- **中止序列本身**：`send()` 的 `case "abort"`（`lib/rpc-manager.ts:792` → `:919`）与看门狗共用 `lib/rpc-manager.ts:433 abortTurn()`，不存在第二条中止实现。
- **Trellis 子代理记录**：投影与只读面板归 `trellis-subagent-records.md`。`stall_aborted` 不是 subagent producer，也不写入任何 Trellis 记录字段。
- **工具级精确中止**：pi SDK 只提供 turn 级 abort，因此同 turn 内其它 in-flight 工具会被一起中止。这是已记录的取舍，不是缺陷。

内置子代理运行时（`lib/subagent-runtime.ts` / `lib/subagent-extension.ts` / `SUBAGENT_CONTROLLER.abort`）不受本机制管辖。

## 2. Signatures

`lib/stall-watchdog.ts` 的实际导出：

```ts
export const DEFAULT_STALL_TIMEOUT_MS: number;                                  // 900_000
export const DEFAULT_STALL_TOOL_TIMEOUTS: Readonly<Record<string, number>>;     // { bash: 1_800_000 }

export type StallTimeoutSource = "env" | "config" | "default";

export interface StallWatchdogSettings {
  stallTimeoutMs: number;
  stallToolTimeouts: Record<string, number>;
  timeoutSource: StallTimeoutSource;
}

export interface StallWatchdogStall {
  toolName: string | null; toolCallId: string | null;
  timeoutMs: number; timeoutSource: StallTimeoutSource; toolOverride: boolean;
  silentMs: number; elapsedMs: number; toolElapsedMs: number | null;
}

resolveStallWatchdogSettings(options?: ResolveStallWatchdogOptions): StallWatchdogSettings
// options: { envValue?: string; settingsPath?: string; stored?: Record<string, unknown>;
//            warn?: (message: string) => void }

export class StallWatchdog {
  constructor(options: { settings: StallWatchdogSettings;
                         onStall: (stall: StallWatchdogStall) => void;
                         getActiveTool?: () => { toolCallId: string; toolName: string } | null;
                         now?: () => number });
  get isArmed(): boolean;            // 是否正在观察一个 turn
  get isEnabled(): boolean;          // stallTimeoutMs > 0
  get hasPendingTimer(): boolean;    // 测试用：timer 是否真的被 clear
  get lastEventAtMs(): number;       // 诊断/测试
  effectiveTimeoutMs(toolName?: string | null): number;
  arm(): void; disarm(): void; dispose(): void;
  observe(event: { type: string; toolCallId?: unknown; toolName?: unknown }): void;
}
```

共享设置读写（`lib/pi-web-settings.ts`，`ask-user-settings.ts` 已改为复用）：

```ts
getPiWebSettingsPath(agentDir?): string          // ~/.pi/agent/pi-web-settings.json
readPiWebSettings(settingsPath?): Record<string, unknown>   // 文件不存在 → {}；非对象 → throw
writePiWebSettings(patch, settingsPath?): Record<string, unknown>  // 原子写，保留未知字段
```

线上事件（`emit` → SSE → 浏览器）：

```ts
{ type: "stall_aborted"; toolName: string | null; timeoutMs: number;
  timeoutSource: "env" | "config" | "default"; toolOverride: boolean;
  silentMs: number; elapsedMs: number; toolElapsedMs: number | null }
```

客户端渲染入口：`lib/message-display.ts` 的 `formatStallAbortNotice(payload, translate)` + `hooks/useAgentSession.ts` 的 `case "stall_aborted"`（`addNotice({ type: "error" })`）。刷新后的 transcript 走同一函数：`components/MessageView.tsx` 的 `CustomMessageView` 对 `customType === STALL_ABORT_CUSTOM_TYPE` 用本地化正文，不展开裸 JSON `details`。文案 key `chat.stalledTurnAborted` / `chat.stalledTurnAbortedNoTool`，三语必须同时存在。

持久化（会话 `.jsonl`，刷新仍可见）：

```ts
STALL_ABORT_CUSTOM_TYPE = "pi-web.stall.abort"   // lib/message-display.ts
renderStallAbortText(details): string            // 英文一句摘要，落盘 `content`；服务端不知道浏览器语言

// handleStall() 在 abortTurn() 之前 fire-and-forget：
inner.sendCustomMessage(
  { customType: STALL_ABORT_CUSTOM_TYPE, content: renderStallAbortText(details),
    display: true, details: StallAbortNoticeDetails },
  { triggerTurn: false },
)
```

`details` 七字段与 `stall_aborted` 对齐：`toolName` / `timeoutMs` / `timeoutSource` / `toolOverride` / `silentMs` / `elapsedMs` / `toolElapsedMs`。SDK 在 streaming + `triggerTurn: false` 时把条目挂到 `_pendingCustomMessages`（同步 push，不 await）；`_runAgentPrompt` 的 `finally` 与 `turn_end` 都会 flush。写入失败只 `console.error`，不阻止中止。

## 3. Contracts

### 阈值来源与优先级（主阈值）

| 来源 | 位置 | 语义 |
|---|---|---|
| 1. env | `PI_WEB_STALL_TIMEOUT_MS` | 非空即生效，盖过配置文件 |
| 2. 配置文件 | `~/.pi/agent/pi-web-settings.json` 的 `stallTimeoutMs` | env 未设/空白时生效 |
| 3. 默认 | `DEFAULT_STALL_TIMEOUT_MS` = 900000 | 前两者都未提供时 |

解析规则（与 `resolveSessionIdleTimeoutMs()` 刻意保持一致）：

- 未设 / `""` / 全空白 → 落到下一个来源。
- `0` → 关闭看门狗（`isEnabled === false`，`arm()` 直接返回）。**`0` 连工具级宽限一起关掉**，见 Validation 表。
- 非法或超范围（非数字、负数、`NaN`、`Infinity`、> `2147483647`）→ `console.warn` 并回落**默认**（不是回落到配置值）。
- 配置文件缺失 → `{}`；文件不是 JSON 对象 → `warn` 后用默认值，**不阻塞服务启动**。

### 工具级宽限

`effectiveTimeout = stallToolTimeouts[最后 in-flight 工具的 toolName] ?? stallTimeoutMs`；没有 in-flight 工具时用主阈值。

- 解析 `stallToolTimeouts` 时**合并到默认表之上**（默认 `{ bash: 1800000 }`），不是整体替换。
- 某工具的值为 `0` → 删除该覆盖，该工具回到主阈值（这是移除默认 `bash` 宽限的唯一方式）。
- 值非法 → `warn` 并忽略该项；表本身不是对象 → `warn` 并整表回落默认。

### 进度定义与计时模型

- **任何 agent 事件都算进度**，不区分「有用/没用」：模型 delta、`tool_execution_start|update|end`、`agent_settled` 等，全部经 `lib/rpc-manager.ts:346 start()` 里那**唯一**的 `inner.subscribe` 回调进入 `observe()`。
- 观测与 pi-web 看到的事件完全一致，**不引入第二套真相**：在-flight 工具直接复用既有 `lib/rpc-manager.ts:251 activeToolEvents`（`lastActiveToolCallId` 只做「最近被触碰的工具」指针，不重排 map，因为 `onEvent()` 会把该 map 重放给重连的浏览器）。
- 计时是**每次事件重新 arm 一个 `setTimeout`**（`lib/stall-watchdog.ts:290 reschedule()`），超时时长取当前 `effectiveTimeoutMs`。触发前再次核对 `now - lastEventAt >= timeoutMs`（`:298 fire()`），所以定时器晚到不会误杀。
- 判定按「无事件时长」而非 turn 总时长：pi 事件流**没有 keepalive**，一条合法的长命令可以长时间零事件，这正是工具级宽限存在的原因。

### 生命周期不变量（R6）

| 时机 | 动作 | 位置 |
|---|---|---|
| `agent_start` | `arm()`（重置时钟、清 latch） | `lib/rpc-manager.ts:370` |
| 任意事件 | `observe()` + 重新 arm | `:369` |
| `agent_settled` | `disarm()` | `:371` |
| prompt 收尾且 `!isRunning()` | `disarm()` | `:861` |
| 用户 Stop / 看门狗命中 | `abortTurn()` 内先 `disarm()` | `:434` |
| `destroy()` | `dispose()` + 清指针 | `:1293` |
| 再次 `start()` | 先 `unsubscribe?.()` + `dispose()` 再重建 | `:347-349` |

- **`agent_end` 不 disarm**：一个逻辑 prompt 在 retry / compaction / extension 入队时会多次 `agent_end`，真正的结束信号是 `agent_settled`（同一判断在 `hooks/useAgentSession.ts` 与 `lib/rpc-manager-shutdown.test.mjs` 里已有先例）。若在 `agent_end` 停表，provider 重连卡死这类目标场景会出现保护空窗。
- 触发**幂等**：`fire()` 先置 `triggered`/`armed` 再回调 `onStall`，回调里再 `observe()` 也不会二次开火。
- `disarm()` / `dispose()` 必须真的 `clearTimeout`（`lib/stall-watchdog.ts:337 clearTimer()`）。只把 `armed` 置 false 会**泄漏定时器**：回调变成 no-op，但 timer 仍会响——这正是 `hasPendingTimer` 断言要挡住的情形。

### 触发后的行为与可观测

`lib/rpc-manager.ts` 的 `handleStall()`：写 `[pi-web]` 前缀 `console.warn`（sessionId、静默秒数、最后工具名与其已运行时长、turn 总时长、阈值与来源、是否工具覆盖）→ `emit` 一条 `stall_aborted` → fire-and-forget `sendCustomMessage(..., { triggerTurn: false })` → `void abortTurn()`。`abortTurn` 与用户 Stop 完全同路径，因此扩展侧 AbortSignal → SIGTERM → 1.5s SIGKILL 的既有链路会连带回收卡死的子进程；扩展/子代理的回调抛错会被 catch 并只记日志。

## 4. Validation & Error Matrix

| 输入 | 结果 |
|---|---|
| `PI_WEB_STALL_TIMEOUT_MS` 未设 / 空白 / 配置文件无 `stallTimeoutMs` | 默认 900000，`timeoutSource: "default"` |
| env `"0"` | `stallTimeoutMs: 0`，`timeoutSource: "env"`，看门狗整体关闭（含工具覆盖） |
| env `"abc"` / `"-5"` / `"NaN"` / `"Infinity"` / `"2147483648"` | `warn` + 回落默认；**不抛异常、不阻塞启动** |
| 配置文件 `stallTimeoutMs: "300000"`（字符串） | `warn` + 回落默认 |
| 配置文件不是 JSON 对象 / JSON 解析失败 | `warn` + 默认阈值；读设置失败不影响会话创建 |
| `stallToolTimeouts` 不是对象 | `warn` + 整表回落默认 `{ bash: 1800000 }` |
| `stallToolTimeouts.bash: 0` | 删除 `bash` 覆盖，`bash` 回到主阈值 |
| `stallToolTimeouts.bash: -1` / 非法 | `warn` + 忽略该项 |
| 有 in-flight 工具 | 用该工具的 `stallToolTimeouts` 或主阈值，`toolOverride` 标记来源 |
| 无 in-flight 工具 | 用主阈值，payload `toolName: null`（文案切到 NoTool 变体） |
| turn 已结束（`agent_settled` / `!isRunning()` 收尾） | 已 disarm，晚到的定时器不触发 |
| 用户在运行中 Stop | `abortTurn()` 内 disarm，看门狗不再二次开火 |
| `destroy()` | `dispose()` 释放 timer 与 `toolStartedAt`，之后不再触发 |
| `stallTimeoutMs: 0` | `arm()` 直接返回，`observe()` 不建 timer |
| 停滞回调抛错 | 捕获并 `console.error`，不影响 turn 的中止流程 |

## 5. Good / Base / Bad Cases

- **Good**：`trellis_subagent` 派发后子进程静默 90s（阈值 90000，env 来源）→ 收到 `stall_aborted`（`silentMs: 90009`、`toolElapsedMs: 95388`、`timeoutSource: "env"`）→ 62ms 后 `agent_settled`、`prompt_done`，`isStreaming: false`，`pgrep` 无 `pi --mode json` 残留。见 `research/ac5-events.jsonl`。
- **Base**：默认阈值下真实派发 174.7s、期间 11 次进度事件 → 无 `stall_aborted`，工具 `isError: false` 正常结束，会话 `stopReason: "stop"`。见 `research/ac6-events.jsonl`。
- **Bad**：把 `disarm()` 写成只置 `armed = false` → 测试仍绿但 timer 泄漏（必须靠 `hasPendingTimer` 断言挡住）。把 `agent_end` 当 turn 结束 → 静默期落在 retry 空窗里，看门狗形同虚设。

## 6. Tests Required (assertion points)

`lib/rpc-manager-stall-watchdog.test.mjs`（`node:test` + jiti + `t.mock.timers`）：

- **AC1**：活跃 turn + in-flight 工具越过阈值 → `inner.abort()` 被调用、发出 `stall_aborted`、payload 带工具名 / 静默时长 / 工具运行时长；无 in-flight 工具时 `toolName: null`；带工具覆盖的工具在主阈值内不触发（AC1/R3）；`onStall` 内部再 `observe()` 不得二次开火。
- **AC2**：持续 `tool_execution_update` 或 `message_update` delta → 无论怎么推进都不触发。
- **AC3**：默认值、env 优先、配置文件（含**真读磁盘**用例，不得用 `stored` 注入冒充）、`0` 关闭、非法值回落 + `warn` 次数、工具表合并 / `0` 移除 / 非法忽略、畸形配置文件回落。
- **AC4**：`agent_settled`、用户 abort、`destroy()`、dispose / disarm 后推进越过阈值 → `onStall` 未被调用**且** `hasPendingTimer === false`（后者是防 timer 泄漏的关键断言）；`stallTimeoutMs: 0` 时即使 in-flight 工具带覆盖也不触发；连续两次 `start()` 不得让旧 timer / 旧订阅生效。

相关：`lib/ask-user-settings.test.mjs` 锁住共享设置文件的 JSON 形状（字节级，含未知字段保留），`lib/message-display.test.mjs` 覆盖 `formatStallAbortNotice` / `renderStallAbortText` 的畸形 payload（`null` / 字符串 / `NaN` / 负数不得产生 `NaN` 或负分钟）。AC7：`lib/rpc-manager-stall-watchdog.test.mjs` 断言 `sendCustomMessage` 的 `customType` / `display: true` / `triggerTurn: false` / `details` 七字段，以及写入失败仍中止；`components/MessageView.test.mjs` 对该 customType 有正向本地化文案 + 负向不渲染裸 JSON / 英文 `content`；`lib/session-reader.test.mjs` 断言 `custom_message` 回读为 `role: "custom"` 且 `details` 保留。

端到端脚本（任务 `09-22-stall-watchdog` 的 `research/verify-ac5.mjs` / `verify-ac6.mjs`）走 HTTP + SSE 真派发，属于**数据链路证据**：它证明服务端链路与 SSE payload，**不**证明浏览器 toast 渲染。凡把它写成「浏览器已验证」即违反 `quality-guidelines.md` 的证据分层要求。

## 7. Wrong vs Correct

```ts
// Wrong: 复用 idle 计时器，命中就 shutdown 会话；或按 turn 总时长判定。
this.idleTimer = setTimeout(() => this.shutdown(), SESSION_IDLE_TIMEOUT_MS);

// Correct: 独立计时、按无事件时长、只 abort 当前 turn，并复用既有中止序列。
this.stallWatchdog = new StallWatchdog({
  settings: STALL_WATCHDOG_SETTINGS,
  getActiveTool: () => /* 复用 activeToolEvents */ null,
  onStall: (stall) => this.handleStall(stall),
});  // handleStall → emit("stall_aborted") + sendCustomMessage(triggerTurn:false) + void this.abortTurn()
```

```ts
// Wrong: 只丢 armed 标记，timer 仍在跑（回调变 no-op，但这是真泄漏）。
disarm(): void { this.armed = false; }

// Correct: 标记 + clearTimeout，两件事都要做。
disarm(): void { this.armed = false; this.clearTimer(); }
```

**Wrong**：把 `stallTimeoutMs` 与工具覆盖当字符串比较或直接相加；让校验失败阻塞会话启动；为看门狗新造一条 abort 实现或第二个 subagent 记录 producer。

**Correct**：单一 `resolveStallWatchdogSettings()` 解析 + `0`/空白/非法三态明确；复用 `abortTurn()`；原因经既有 `emit` → SSE → notice 通道传播，并以 `pi-web.stall.abort` custom message 落盘到会话记录。

## 8. 已知边界（技术债，如实记录）

- **toast 仍只亮 5 秒**：`stall_aborted` 走既有 notice（`NOTICE_VISIBLE_MS = 5000`），负责「立刻引起注意」。刷新后的可读原因走持久化的 `pi-web.stall.abort` custom message（`CustomMessageView` 本地化渲染，不展开裸 JSON）；pi 自己那条 `stopReason: "error"` / `errorMessage: "This operation was aborted"` 仍会留在 transcript 里，但不再是唯一叙述。
- **该条目会进入下一轮模型上下文**：`sendCustomMessage` 写入 `agent.state.messages`（与 `pi-web.ask.answers` 同机制）。这是有意的：模型因此知道上一轮为何被截断。`triggerTurn: false` 保证它不额外起 turn。
- **静默分钟数取整**：`formatStallAbortNotice` 用 `Math.max(1, Math.round(silentMs / 60000))`，因此 90s 显示为「2 分钟」。默认 15 分钟阈值下不影响，但小阈值调试时会显得偏大。
- **子进程存活不由本机制断言**：卡死子进程的回收依赖扩展的 AbortSignal → SIGTERM/SIGKILL 链路（`.pi/extensions/trellis` 的 `runPi`）。看门狗只保证 turn 被中止。
