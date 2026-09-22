# Research：本仓库改动锚点（实证）

> 注意：本文的行号是**规划期（改动前）**的锚点。改动落地后 `lib/rpc-manager.ts` 有约 6 行位移，最新锚点以 `.trellis/spec/frontend/stall-watchdog.md` 为准。

所有路径与行号均在本仓库（`@xup3ng/pi-web` 0.9.5，分支 `personal`）中逐行核对过。

## 1. 事件入口（观测点，唯一真相）

- `lib/rpc-manager.ts:340` `start()` → `:341` `this.inner.subscribe((event: AgentEvent) => { ... })`：**所有** agent 事件都经这里。
- `:247` `private activeToolEvents = new Map<string, AgentEvent>()`；`:349` 在 `tool_execution_start` / `tool_execution_update` 写入，`:351` 在 `tool_execution_end` 删除 → **in-flight 工具已是现成数据结构**。
- `:313` `isRunning()` = `pendingPromptCount > 0 || inner.isStreaming || inner.isCompacting || inner.isBashRunning`。
- `:139` `IDLE_RESET_EVENT_TYPES`（仅 `agent_end` / `agent_settled` / `auto_compaction_end` / `compaction_end`）；`:354` 命中才 `resetIdleTimer()`。
- 注意：现有 idle 计时管的是「会话包装器还需不需要活着」（到点 `shutdown()` 会话），**不是**「agent 还有没有进展」。看门狗是第二件事，别混用同一个计时器。

## 2. 既有 idle 计时器（可照搬的范式）

- `lib/rpc-manager.ts:623 resetIdleTimer()`；清理在 `:624` 与 `:1207 destroy()`（其中同时 `activeToolEvents.clear()`）。
- 配置范式：`:156 export function resolveSessionIdleTimeoutMs()` 读 `PI_WEB_IDLE_TIMEOUT_MS`，默认 10 分钟，`0` 关闭，非法值回落默认并 `console.warn`，**导出以便单测**。
- 对应测试：`lib/rpc-manager-idle-timeout.test.mjs`（`node:test` + `jiti`）。

## 3. 中止路径（Stop 的既有实现，复用不重造）

- HTTP：`POST /api/agent/[id]`，body `{ type: "abort" }`（`app/api/agent/[id]/route.ts`）
- 分发：`lib/rpc-manager.ts:708 send()` → `:834 case "abort":`
  - `this.forceShutdownOnIdle = true`
  - `this.extensionUiAbortController.abort(new DOMException("Extension UI cancelled by Stop", "AbortError"))`
  - `await this.withFinalIdleReset(() => this.inner.abort())`

## 4. 配置层

- 配置文件 `~/.pi/agent/pi-web-settings.json`；读写范式 `lib/ask-user-settings.ts`（`getAskUserSettingsPath()` = `join(getAgentDir(), "pi-web-settings.json")`、`writePrivateFileAtomicSync`、`readAskUserSetting` / `writeAskUserSetting` / `isAskUserEnabled`）。
- 环境变量优先先例：`PI_WEB_ASK_USER`、`PI_WEB_IDLE_TIMEOUT_MS`。
- 设置 API 路由范式：`app/api/settings/ask-user/`。

## 5. 事件出口与显示契约（R4 的落点）

- SSE：`app/api/agent/[id]/events/route.ts`；事件整形 `lib/agent-event-wire.ts`（`toClientAgentEvent`、`OMITTED_EVENT_TYPES`、`isEventIncludedInSnapshot`）。
- `destroy()` 先 `this.emit({ type: "session_shutdown" })`，说明「服务端主动补发一条事件」是既有模式。
- Trellis 子代理记录已有投影层：`lib/trellis-subagent-records.ts`（25.2K，`TrellisRunStatus` / `TrellisToolStatus` 等）+ `lib/trellis-subagent-history.ts`；契约见 `.trellis/spec/frontend/trellis-subagent-records.md`（明确：不要在组件里重复 producer 接口，**不要**把 `.pi/extensions/trellis` 导入浏览器）。

## 6. 被验证的「卡死」链路（为什么不动 Trellis 也能修）

- 卡死的子进程由 turn abort 连带杀死：在 `/home/xupeng/dev/personal/personal-assistant/.pi/extensions/trellis/index.ts:1514` 的 `runPi()`，子进程 Promise 只在 close / error / 父级 AbortSignal 三处 resolve；AbortSignal 一触发就 SIGTERM → 1.5s 后 SIGKILL（同文件 `:1544`）。
- pi SDK 只提供 turn 级 abort（工具签名 `execute(toolCallId, params, signal, onUpdate, ctx)` 里的 `signal` 即 turn 的 abort signal；pi docs `extensions.md:1021`）。**没有**按 toolCallId 中止单个工具的公开 API。
- pi json 事件没有 keepalive（pi docs `json.md`），长 bash 命令的合法静默与真卡死在「没有事件」上同形 → 阈值必须按工具分层。

## 7. 同仓库既有的相邻能力（不要重造）

- `lib/session-liveness.ts`：会话存活租约（`SESSION_LIVENESS_LEASE_TTL_MS = 90_000`），`hasActiveSessionLivenessProvider()` 已用于 idle shutdown 判定。
- `lib/session-timing.ts`：从 append-only 日志估算活跃墙钟（剔除人工 idle 间隔）。
- `lib/subagent-runtime.ts` / `lib/subagent-extension.ts` / `lib/rpc-manager.ts:1936 SUBAGENT_CONTROLLER.abort(sessionId)`：本仓库**自带**的子代理运行时（与项目扩展的 `trellis_subagent` 是两条不同路径，本任务不碰）。

## 8. 验证命令（本仓库 CI 门禁）

```bash
npm run lint
npx tsc --noEmit
npm test                    # node --experimental-strip-types --test "**/*.test.mjs"（node:test + jiti，不是 vitest）
npm run build && npm run test:e2e   # playwright
npm run dev                 # next dev -H 127.0.0.1 -p 30141
```

本机在跑的是 mise 安装的 0.9.5 发布包，验证本地改动需跑 dev（或本地 pack 安装）。本仓库无 `.changeset`。
