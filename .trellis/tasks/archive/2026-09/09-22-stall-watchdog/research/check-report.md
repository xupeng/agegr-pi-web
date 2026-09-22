# Check report：09-22-stall-watchdog（最终 2.2，独立复核）

复核时间：2026-09-22。仓库 `/home/xupeng/dev/personal/forked/agegr-pi-web`，分支 `personal`。本 pass **不采信**前一次 2.2 的结论，按 PRD/design/implement + `check.jsonl` 全范围重审。未 commit / 未 push；未跑 `next build`；未改 `~/.pi/agent/pi-web-settings.json`（mtime 仍为 2026-08-28）；未改 `.pi/agents/trellis-*.md`；复核结束时 30141 未监听，无 `pi --mode json` 残留。

## 结论

**有条件通过。**

AC1–AC4 单测与本次 `npm test` 全绿对得上；AC5 不是脚本自证——会话文件 `01a0c7ab-7b76-7331-981f-e16b5d353d81` 的持久化字段与「看门狗中止」一致，jsonl 时间戳独立量出约 90.012s 静默。产品代码未触 Out of Scope。tsc 0 错。改动文件 eslint 0。

条件（必须向用户原样报告，不要美化）：

1. **R4「原因可见」的真实边界**：可读原因（「因 N 分钟无输出中止」+ 工具名 + 已运行时长）只活在 **5 秒 toast**（`NOTICE_VISIBLE_MS = 5000`）和 **服务端 `console.warn`**。transcript / 会话 jsonl **不保存**这条原因；刷新或错过 SSE 后只剩 `cancelled` + `This operation was aborted`。
2. **AC6 不能从产物自身证明「当时阈值是 15 分钟」**：174.7s 且每 ~25s 有进度，在 90s 阈值下也不会触发。它证明的是「有进度的长派发不被中止」。
3. **lint 14 error 是未改动文件上的既有诊断**，与 2026-09-18 spec 记录的幻影诊断同形；本次 **未做**干净树 `npm ci` 复核。

## 审过的文件

| 文件 | 结论 |
|---|---|
| `lib/stall-watchdog.ts` | 观测/arm/disarm/dispose、env>config>default、`0` 关闭、非法回落 + warn；与 idle 计时器独立 |
| `lib/pi-web-settings.ts` | 抽出共享 settings 读写，原子写，未知字段保留 |
| `lib/rpc-manager.ts` | subscribe 单点观察；复用 `abortTurn()`（原 `case "abort"`）；`destroy()`/`agent_settled`/用户 abort 停表；`start()` 先 `unsubscribe?.()` + dispose 旧 watchdog |
| `hooks/useAgentSession.ts` | `stall_aborted` → `addNotice` error toast；`useI18n` 只为这条文案 |
| `lib/message-display.ts` + test | 边界 `unknown` + 手写守卫；三语文案 |
| `lib/ask-user-settings.ts` + test | 改为走 `pi-web-settings`，历史 JSON 形状测试仍在 |
| `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | 两 key、占位符集合一致 |
| `lib/rpc-manager-stall-watchdog.test.mjs` | 覆盖 AC1–AC4，含 start 两次、回调重入、bash 宽限、`0` 关闭 |
| `lib/agent-event-wire.ts` | `stall_aborted` 不在 `OMITTED_EVENT_TYPES`，会原样出 SSE |
| `README.md` / `AGENTS.md` | 键、默认值、关闭方式、与 idle 的职责分离 |
| `research/verify-ac5.mjs` + `ac5-events.jsonl` | 见 A 节 |
| `research/verify-ac6.mjs` + `ac6-events.jsonl` | 见 A 节 |
| AC5/AC6 会话 jsonl（`~/.pi/agent/sessions/--home-xupeng-dev-personal-personal-assistant--/`） | 见 A 节 |
| 未改：`lib/subagent-runtime.ts` / `lib/subagent-extension.ts` / `SUBAGENT_CONTROLLER.abort` / Trellis 框架 | diff 为零 |

## A. 证据完整性

### A.1 脚本会不会恒真

`passed = Object.values(checks).every(Boolean)`：**缺字段 = 失败**（`undefined` 是 falsy）。不会出现「没发生的事件因为没赋值反而通过」。

**AC5 `stallSilentMs` / `stallToolRanLongEnough`**：绑定的是 **SSE payload** 的 `silentMs` / `toolElapsedMs` ≥ `0.9 * AC5_STALL_MS`，**不是**把 env 阈值抄进断言。若 watchdog 从未开火，两字段为 false。弱点：它们信任服务端自报数字，脚本没有用时间线做独立测量。这不是恒真，但单独看脚本弱于 jsonl。

本 pass 对 `ac5-events.jsonl` 做了独立算术（脚本未改、未重跑）：

| 量 | 值 |
|---|---|
| `tool.start` | 1790056310313 |
| 最后一条 stall 前 `tool.update` | 1790056312754（pre-stall 共 2 条） |
| `stall_aborted.at` | 1790056402766 |
| **独立静默** `stall.at - lastPreUpdate` | **90012 ms** |
| payload `silentMs` | 90009（差 3ms，同一次 90s 命中） |
| payload `timeoutMs` / `timeoutSource` | 90000 / **`env`** |
| payload `toolElapsedMs` | 95388 |
| 客户端 `stall.at - tool.start` | 92453 |

`toolElapsedMs` 比客户端起算大约 2.9s，与会话文件 `details.startedAt=1790056307397` 对齐（`6402766-6307397=95369`），更像 watchdog 从更早的 in-flight 工具事件起算，不是把阈值写进 payload。两条都 ≥ 81s。

**SSE 分帧**：脚本按 `\n\n` + 每条 `data: ` 前缀 `JSON.parse`。pi-web 的 SSE 是单行 `data: ${JSON.stringify(event)}`。多行 `data:` 拼接不支持，但本事件形状用不到。`agent_settled` 后 `controller.abort()` → `streamEvents` 在 `signal.aborted` 时 return，`.catch` 吞掉 abort；不会在 `await sse` 上挂死。未 settle 则 480s deadline abort。

**子进程过滤**：`ps -eo pid,args` 含 `--mode json` 且排除 `ps` 自身。与 research 里 Trellis `runPi` 的 `pi --mode json` 一致；不会把 pgrep 自己算进去。残留风险：若泄漏进程 argv 不含 `--mode json` 会漏检。AC5/AC6 的 `children.after` 均为 `total: 0, leaked: []`。

**AC6**：`noStallEvent = stallEvent === null` 在「SSE 根本没连上」时也会为 true，但同对象还有 `toolStarted` / `toolCompleted` / `progressEventsFlowed` / `dispatchRanForMinutes`，缺事件会把 `passed` 拉倒。jsonl 里 11 次 `tool.update`、`tool.end isError:false`、无 `stall_aborted`。

### A.2 AC5 会话文件交叉验证

文件：`~/.pi/agent/sessions/--home-xupeng-dev-personal-personal-assistant--/2026-09-22T05-51-39-384Z_01a0c7ab-7b76-7331-981f-e16b5d353d81.jsonl`

id 与脚本声明一致：`01a0c7ab-7b76-7331-981f-e16b5d353d81`。

关键字段（原文）：

- 助手 toolCall `trellis_subagent`，`stopReason: "toolUse"`，`id: call_00_iWUytFw5dGrJLbfDTbdU9843`（与 ac5-events 的 toolCallId 一致）。
- **toolResult**（`id: 5b80d2cd`，`timestamp: 2026-09-22T05:53:22.808Z`）：
  - `isError: true`
  - `details.kind: "trellis-subagent-progress"`，`final: true`
  - `runs[0].status: "cancelled"`
  - `runs[0].errorMessage: "cancelled"`
  - `runs[0].tools[0]`: `name: "bash"`, `args: "{\"command\":\"sleep 240\"}"`, **`status: "running"`**（子代理还在 sleep 时被取消）
  - `startedAt: 1790056310311`，`finishedAt: 1790056402803`
- **随后空助手消息**（`id: 51aee84d`）：
  - `content: []`
  - **`stopReason: "error"`**
  - **`errorMessage: "This operation was aborted"`**

会话 jsonl **没有** `stall_aborted` 条目（该事件只走 SSE，不落盘）。持久化层能证明「被 abort 取消」，不能证明「因为静默 N 分钟」——那一句只在 live toast / 服务端日志 / `ac5-events.jsonl` 的 SSE 记录里。

### A.3 阈值与 dev server 对应关系

| 验收 | 阈值来源 | 产物里能证明什么 | 不能证明什么 |
|---|---|---|---|
| AC5 | 脚本注释 + payload `timeoutSource:"env"` + `timeoutMs:90000` | 当时进程读到了 `PI_WEB_STALL_TIMEOUT_MS=90000`，并在约 90s 静默后开火 | — |
| AC6 | 脚本注释要求 `npm run dev` **不带**该 env | 174.7s 派发、11 次进度、工具 succeeded、无 `stall_aborted` | **不能**证明当时主阈值是 15 分钟。同样的进度间隔在 90s 阈值下也不会开火 |

AC5 结束约 13:53，AC6 开始约 13:56，中间应重启过不带 env 的 dev。本 pass **没有**重启 30141 去复核（任务要求不要长期占用；复核结束时端口空闲）。

两份脚本都是 **任务证据 / 数据链路**，不是产品代码，也 **不是** Playwright。

### A.4 AC6 会话文件

`.../2026-09-22T05-56-12-503Z_01a0c7af-a654-7122-8590-d7b56038e200.jsonl`

- toolResult `trellis_subagent`：`runStatus: succeeded`，5 条工具，无 `isError`
- 随后助手 `stopReason: "stop"`（正常结束，不是 aborted）

与「默认阈值下有进度的长派发不被中止」相容，且与 AC5 的 aborted 形态可区分。

## B. R1–R7 与 spec

| 需求 | 证据 | 边界 |
|---|---|---|
| R1 停冻结 turn | AC1 单测 `inner.abortCalls===1`；AC5 会话 `This operation was aborted` + cancelled | 粒度是 turn，不是单个 toolCall（PRD 已接受） |
| R2 可配置 | `resolveStallWatchdogSettings` 测试：env>config>default、`0`、非法 warn | 模块加载时解析一次，改文件需重启进程（与 idle 相同） |
| R3 工具宽限 | 单测 bash 60s 不死、120s 才死；默认 `bash: 30min` | 无 `PI_WEB_STALL_TOOL_TIMEOUTS` env，只走配置文件 |
| R4 原因可见 | SSE `stall_aborted` + `formatStallAbortNotice` 三语 + `console.warn` | **见下节，不要美化** |
| R5 事件重置 | AC2：`tool_execution_update` / `message_update` 推进永不触发 | 任何 agent 事件都算进度 |
| R6 生命周期 | AC4：settled / 用户 abort / destroy / `0` / start 两次 / 回调重入 | `agent_end` 未单独 disarm，依赖 `agent_settled` 与 prompt `finally` |
| R7 可观测 | handleStall 的 `[pi-web] aborting stalled session ...` 含 session/tool/时长/source | 单测跑 AC1 时能看到这条 warn |

**R4 可见性边界（已知取舍，不是实现疏漏的美化说法）：**

实现者 **没有** 把停滞原因写入 `lib/trellis-subagent-records.ts` 投影，也 **没有** 在会话 jsonl 里追加一条可读消息。做了：

1. 服务端补发一次性 SSE `stall_aborted`（不进 snapshot replay，重连/刷新看不到）。
2. `useAgentSession` 把它变成 `type: "error"` notice，**5 秒后消失**（另 180ms 退场动画）。
3. `console.warn` 打在跑 pi-web 的终端。

刷新后用户在 transcript 里能看到的是：工具结果 `cancelled` / `isError: true`，助手 `stopReason: "error"` + `"This operation was aborted"`。子代理面板若打开，会通过 **既有** trellis 投影显示 last-reported `cancelled`（这满足「不新造通道、不把扩展导入浏览器」），但卡片文案 **不会** 出现「连续 N 分钟无输出」。

90s 静默被 `Math.max(1, Math.round(silentMs/60000))` 显示成「2 分钟」，与「已运行 1m 35s」并列，略夸大。未改（产品设计冻结）。

**Out of scope**：diff 不含 `lib/subagent-runtime.ts`、`lib/subagent-extension.ts`、`SUBAGENT_CONTROLLER`、Trellis 模板。`.pi/agents/trellis-{check,implement,research}.md` 的工作区改动是另一件事，本 pass 未碰。

**新边界输入**：`resolveStallWatchdogSettings()` 对畸形 JSON 文件、非法 env、非法/缺字段 tool 表有测试，非法值 warn + 默认，不抛、不阻塞启动。缺一条「`stallToolTimeouts` 为 array/null」的专门用例，代码分支在。

`start()` 里的 `this.unsubscribe?.()`：生产路径 `registerRpcWrapper` 只 start 一次；这是防二次订阅泄漏。配套测试「start 两次后旧 timer 不开火」成立。二次 start 若发生在 turn 中途，新 watchdog 要等下一次 `agent_start` 才 arm——生产不走这条路径。

## C. 门禁与 lint 基线归因

依赖树：当前 checkout 的已有 `node_modules`（**不是**本次 `npm ci` 的干净树）。

| 门禁 | 命令 | 结果 |
|---|---|---|
| tsc | `node_modules/.bin/tsc --noEmit` | **exit 0** |
| 改动文件 eslint | `npx eslint` 12 个本次 TS/MJS 文件 `-f json` | **0 error / 0 warning**（`useAgentSession.ts` 仅有两条 **既有** `eslint-disable-next-line react-hooks/exhaustive-deps`，不在本 diff） |
| 全仓 lint | `npm run lint` | **14 error / 0 warning / 495 files**，exit 1 |
| 单测 | `npm test` | **1407 pass / 0 fail / 0 skipped**，duration ~142s，exit 0 |
| e2e Playwright | 未跑 | 见未覆盖项 |

全仓 14 条全部是 `react-hooks/preserve-manual-memoization`，文件：

- `components/ChatInput.tsx` × 7
- `components/ChatMinimap.tsx` × 5
- `components/SessionSidebar.tsx` × 2

这三文件 **不在** 本次 `git diff --name-only HEAD` 里。不能用「数字没变大」当通过；归因如下：

| 项 | 本次实测 | spec 历史记录（quality-guidelines / 2026-09-18） |
|---|---|---|
| 规则 | `react-hooks/preserve-manual-memoization` | 同规则 |
| `--print-config` severity（ChatInput） | `[2]`（error） | error |
| `eslint-plugin-react-hooks` | `eslint-config-next@16.3.5` 嵌套 **7.0.1** | 7.0.1 |
| 覆盖文件数 | **495** | 当时案例 462；spec 概览约 474。文件数随仓库增长，不是本次引入 |
| 干净 `npm ci` | **未做** | 当时干净树该规则为 **0** |

未做干净树复核的原因：需要仓库同级 worktree + 完整 `npm ci`（禁止把带 `node_modules` 的树放 `/tmp`），成本高，且 14 条的规则/文件/插件版本与已记录的「旧树幻影诊断」同形；本次改动文件已单独证明 0 诊断。**不允许**据此改那三个组件（超范围）。

其它清单：新产品 TS 无 `any` / `@ts-expect-error` / `enum` / 文件级 eslint-disable；边界走 `unknown` + 手写守卫；无 jsdom/testing-library；新文案三语 + 占位符一致；未跑 `next build`（`git status` 无 `.next` 提交）。

## D. 发现并已修复

无。本 pass 未改产品代码、未改证据脚本、未重跑 AC5/AC6（重跑要占 30141，且现有会话文件 + jsonl 已足够交叉验证）。

## E. 发现未修

1. **R4 不持久化原因**（见上）。建议：若用户要「刷新后仍能读到为什么中止」，另开任务把 `stall_aborted` 写成 session custom message，或把原因写入 toolResult/errorMessage；不要塞进 trellis producer。
2. **AC6 未锁定 15min 阈值**。建议：以后在脚本里 `GET` 某个能反映 resolved timeout 的诊断，或在启动日志里抓 `timeoutSource`。
3. **AC5 脚本信任 payload 静默时长**。独立 jsonl 已补上；未改脚本以免与已落盘 runner 分叉。
4. **toast 分钟四舍五入**：90s →「2 分钟」。
5. **`stallToolTimeouts` 为 array/null** 无专门测试（代码有分支）。
6. **lint 14 条未做 npm ci 证伪**。下次合入前可用同级 worktree `npm ci` 确认仍是幻影。

## F. 未覆盖项（数据链路 ≠ 浏览器）

| 项 | 状态 |
|---|---|
| AC5/AC6 HTTP API + SSE + 会话文件 | 有（数据链路脚本 + 本 pass 读 jsonl） |
| `stall_aborted` toast 在真实浏览器里的渲染、5s 消失、三语文案上屏 | **未覆盖**（未跑 Playwright；脚本只在 Node 里调 `formatStallAbortNotice`） |
| 子代理面板「Last reported / cancelled」在 stall 后的 UI | **未覆盖**（会话 details 可投影，无截图/e2e） |
| 刷新后 toast 不再出现（live-only） | **未覆盖**（由代码阅读得出，无浏览器证据） |
| AC6 人工「约 10 分钟量级不被杀」 | 本次只到 174.7s；PRD 标非阻断。更长回归未跑 |
| `npm run test:e2e` 全套 | **未跑**（禁止 `next build`；本任务无 UI e2e 门禁要求） |

## G. 质量检查清单对照

- [x] `tsc --noEmit` exit 0
- [x] 改动文件 lint 0；全仓 14 条已归因；未做 npm ci 已声明
- [x] `npm test` 1407/1407
- [x] 本文件记录基线来源（当前 checkout `node_modules`，非干净 ci）
- [x] 无新增 any / ts-expect-error / enum
- [x] 新边界 `unknown` + 守卫
- [x] 无新增 eslint-disable
- [x] 三语文案
- [x] 未跑 next build
- [ ] Playwright toast：**未覆盖**
