# Pi SDK 输入接收契约

## 1. 适用范围

历史起点是 Pi 0.99.1 的 disposition 迁移；当前四个 direct Pi pin 均为 **1.0.0**（`package.json`）。AskUser portable Pi 包及其 peer 声明已退役；系统安装扩展由 SDK 原发现链加载，Web 仅拥有版本化 host 协议。本契约仍约束 SDK -> RPC wrapper -> HTTP/SSE -> hook 的接收与完成边界，不因升版本改写历史。
结构适配归 `lib/pi-types.ts:167`，接收串行化与完成归 `lib/rpc-manager.ts` 的 `send()` prompt 分支。
这不是新增浏览器响应格式；不能把 SDK 的 disposition 当作整个 agent run 已完成。

## 2. 签名

`AgentSessionLike` 的窄适配面（`lib/pi-types.ts:167`）：

```ts
prompt(text: string, options?: {
  preflightResult?: (disposition: "started" | "queued" | "handled") => void;
}): Promise<void>;
steer(text: string, images?: ImageContent[]): Promise<"handled" | "queued">;
followUp(text: string, images?: ImageContent[]): Promise<"handled" | "queued">;
```

这是节选，不替代该文件已有的 images/source/streamingBehavior 字段。
真实 SDK `PromptDisposition` 包含三种成功接收结果，`QueuedInputDisposition` 包含后两种。

## 3. 契约

- SDK `preflightResult` 仅在接收成功时调用，值不是旧版 boolean；拒绝通过 prompt promise 的 rejection 传播。
- `AgentSessionWrapper.send({ type: "prompt", message, ... })` 等待接收闸门再返回 `null`；不等待整个模型回合结束（`lib/rpc-manager.ts` 的 admission promise）。
- 接收后才作废旧的 open ask；接收前错误不应作废问题。生命周期仍遵循 [ask_user 协议](./ask-user-protocol.md)。
- prompt promise 完成负责释放 pending count、检查运行状态及通知；接收后失败走 `prompt_error`，非 streamingBehavior 的终态走 `prompt_done`（`lib/rpc-manager.ts` 的 prompt completion 分支）。
- 并发 prompt 只串行化 admission；已经接收的输入不持锁等待整个 agent run。
- MCP prepare 在 SDK admission 之前：空闲 prompt 按 extension invocation 分类为 wait/register/none，wait 仅等待有 direct 声明的服务器；Stop 在此时拒绝未发送消息并保留旧 ask。`/mcp` register-only 不代表模型回合开始，extension handled 也不代表模型 completion。分类与生命周期细节由 [mcp-codemode](./mcp-codemode.md) 单独拥有（`rpc-manager.ts:1038`、`mcp-command.ts:70`）。
- 新会话文件可在第一个用户消息写入后已存在，不能以目录是否为空判断 clone 取消；应比较 clone 前后的文件集合（`lib/rpc-manager.test.mjs` 的 assistant-free clone 用例）。

## 4. 校验与错误矩阵

| 情况 | wrapper 结果 |
| --- | --- |
| 等待 extension binding/preflight | POST 不提前成功，pending run 保持跟踪 |
| `started` / `queued` / `handled` 接收回调 | 释放 admission，确认接收，不据此宣布整个 run 结束 |
| 接收前 validation/preflight reject | POST reject；不制造重复的异步 prompt_error/done |
| 接收后 prompt reject | 清理 pending count，通过异步错误与终态事件收敛 |
| SDK 完成但未调用接收回调 | 兼容回落在完成时确认，不提前确认 |

## 5. 正常、边界、错误案例

正常：`started` 回调出现后 POST 成功，但直到 prompt promise 完成才结束运行。
边界：第二个输入通过 SDK 的 `queued` 接收，不能阻塞到前一个输入完成；extension `handled` 同样是成功接收。
错误：认证失败在回调前 reject，POST 报错而旧 ask 保留；已接收后失败由 SSE 通知，不重新解释为未接收。

## 6. 必测断言

`lib/rpc-manager-shutdown.test.mjs:59` 起的用例覆盖：接收前不确认、三种 disposition 均确认、接收前拒绝、接收后错误、重叠 prompt admission、completion 通知的 idle 门禁。
mock 必须传 disposition 字符串；只修类型不更新 boolean mock，会让错误假设继续留在测试里。

升级还须从 `package-lock.json` 的干净 `npm ci` 树检查四个 direct Pi pin、真实 SDK 构造/资源加载、类型/lint/单测及隔离 e2e。真实构造冒烟不等于真实模型 completion；未发模型请求应明确记录。

## 7. 错误与正确方式

错误：`preflightResult: (success: boolean) => { if (success) ack(); }`，或把任意回调参数理解为一次 agent completion。
正确：按成功接收契约确认 admission；运行完成仍由 prompt promise、SDK 事件与 wrapper pending/idle 状态判定。
不要通过 `any`、双重断言或降低编译配置来掩盖 SDK 签名变化；先修窄适配面，再复验所有消费者。

## 未落盘会话的恢复与拒绝协议

### 1. 范围 / 触发

SDK 延迟落盘，`ensure_session` 的原 runtime 被 idle 回收后，缓存的计划路径可能不存在。SDK `open()` 在缺失文件上会新建 ID，并回落到进程 cwd；Web 恢复不能使用该创建分支。冷恢复、冷工具修改、readiness 与尚未接收 prompt 的 composer 共同拥有此边界，不改变 SDK pin、idle budget 或显式 URL 优先级。

### 2. 签名

- `resolveSessionPath(id: string): Promise<string | null>`：缓存路径先验证非空普通文件及 header ID；正常 header 使用有界读取，超大 legacy header 回落到 `readSessionInfoFast()`，不借 SDK 打开/迁移文件验证身份。
- `openPersistedSessionManager(path: string, sessionId?: string): SessionManager`：缺失/空/非普通文件在 SDK open 前抛 `SessionUnavailableError`；传入期望 ID 时，SDK manager ID 必须一致。RPC restore 与 cold `set_tools` 必须传入期望 ID，且保持 closing wait/start lock 与 alive wrapper 优先。
- `isUnavailableAgentSessionError(error: unknown)`：只接受 `AgentCommandError.sessionUnavailable === true && accepted === false`。

### 3. 请求 / 响应契约

- `POST /api/agent/[id]` 缺失会话的 prompt：HTTP 404，`{ code: "prompt_rejected", accepted: false, reason: "session_unavailable", error }`。非 prompt 命令使用 `code: "session_unavailable"`，仍显式 `accepted: false`。
- `GET /api/agent/[id]/events` 的不可恢复冷启动：建立 SSE，发送 `{ type: "startup_error", code: "session_unavailable", prePromptRejected: true, errorMessage }` 后关闭；拒绝 payload 不包含文件路径或 cwd。
- `AgentEventConnection` 只有在 `connected` 前且 marker 严格为 true 时才创建 negative admission。无 marker、一般 transport/timeout/404 或 connected 后错误不能反向拒绝既有接收。
- 仅当前 hook 仍拥有的、未 promotion 的 new composer 可清除失效绑定；保留草稿与 cwd/model/thinking/tools。`newSessionRetiredRef` 阻止恢复后的 slash palette/control 被动 ensure，仅下一次显式 send（包括 Web builtin slash 入口）解除闸门，重新 ensure 并绑定返回的真实 ID。没有新增环境配置。

### 4. 校验与错误矩阵

| 情况 | 结果 |
| --- | --- |
| alive 未落盘 runtime | 原 wrapper、ID、cwd 复用，不冷 open |
| 删除 alive/closing 未落盘 runtime | 从 wrapper 保留其计划路径用于 shutdown 后清理，不把它当成 saved history |
| 缺失/空/非普通路径，无 alive runtime | 不进入 SDK 自动创建；明确拒绝，不提交 prompt |
| 有效文件、header ID 匹配、filename UUID 不同 | 按 header 身份正常恢复，不创建 alias |
| 缓存 key 与 header ID 不一致 | 清理旧 cache key；旧 ID 的详情/重命名不能访问新 header 的历史 |
| lookup 后 header 变化，cold open 得到别的 ID | 在 resource/provider 构造前 typed refusal；原请求不接收 |
| unpromoted new composer 收到严格拒绝 | 草稿恢复、退掉旧 SSE/ID；下次显式发送创建 |
| explicit selected session 或模糊 post-dispatch 失败 | 不隐式换 ID/URL，不自动重发 |

### 5. 正常 / 边界 / 错误案例

正常：有效 persisted header 控制恢复 cwd，filename 可不匹配；活跃空会话继续使用原内存 manager。
边界：大于有界 header 读取预算但有效的历史仍可恢复；closing/start waits 不因路径检查绕过。
错误：把 cached planned path 当落盘证明，或对失效的新会话自动补发原 prompt，都会破坏身份/接收契约。

### 6. 必测断言

- `lib/unsaved-session-recovery.test.mjs`：真实 SDK 无模型 create/open 漂移探针、计划路径 cache、缺失/空文件 SDK open 零调用、alive 优先、有效 header/filename mismatch、超大 legacy header、错身份 fresh cache 的详情 GET 与 PATCH 404 且文件不变、lookup 后 identity replacement 的 HTTP/SSE typed refusal。
- `hooks/useAgentSession.unsaved.test.mjs`：执行生产 callback，断言无自动 ensure/resend（含 restored slash draft 的被动 palette load）、草稿与显式 cwd/model/thinking/tools 保留、下一次 send/promote 使用实际新 ID、deep-link 不改绑、post-dispatch transport failure 不当成拒绝、readiness timeout 不清身份。`app/api/sessions/runtime-route.test.mjs` 保留未落盘 runtime 的删除验收（shutdown 不写与 shutdown 首次落盘两种）。
- `lib/agent-client.test.mjs` / `lib/agent-event-connection.test.mjs`：strict negative marker、additive HTTP reason、connected 后不产生 negative admission。
- 以上不是 React/browser/Safari 验收；后续 PR 的 fast/slow CI 与浏览器 coverage 仍须单独报告。

### 7. 错误与正确方式

错误：`return cachedPath` 不检查 header；`SessionManager.open(missingPlannedPath)` 用作恢复；在 timeout/404 后自动重发。
正确：活跃 wrapper 优先 → 校验 persisted path/header → guarded cold open；明确负确认后仅退掉未接收 new composer 的 binding，下次由用户主动 send。
