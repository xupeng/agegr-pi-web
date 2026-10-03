# Pi SDK 输入接收契约

## 1. 适用范围

历史起点是 Pi 0.99.1 的 disposition 迁移；当前四个 direct Pi pin 与 portable 的两个 Pi peer 均为 **1.0.0**（`package.json:63-66`、`lib/ask-user/portable/package.json:12-15`）。本契约仍约束 SDK -> RPC wrapper -> HTTP/SSE -> hook 的接收与完成边界，不因升版本改写历史。
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

升级还须从 `package-lock.json` 的干净 `npm ci` 树检查四个 direct Pi pin、portable peer pin、真实 SDK 构造/资源加载、类型/lint/单测及隔离 e2e。真实构造冒烟不等于真实模型 completion；未发模型请求应明确记录。

## 7. 错误与正确方式

错误：`preflightResult: (success: boolean) => { if (success) ack(); }`，或把任意回调参数理解为一次 agent completion。
正确：按成功接收契约确认 admission；运行完成仍由 prompt promise、SDK 事件与 wrapper pending/idle 状态判定。
不要通过 `any`、双重断言或降低编译配置来掩盖 SDK 签名变化；先修窄适配面，再复验所有消费者。
