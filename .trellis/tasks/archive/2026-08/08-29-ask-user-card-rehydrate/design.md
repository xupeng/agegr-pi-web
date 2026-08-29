# ask_user 卡片恢复与持久化 — 设计

## 1. 现状与根因

```
open ask ──▶ PendingAskStore（globalThis 内存单例）──▶ get_state 投影 ──▶ 客户端
                 │
                 └─ destroy() 时 forgetSession() ❌ 10 分钟 idle / 重启即丢
```

客户端恢复路径（`loadSession` includeState 分支 + 挂载 effect）漏读 `state.pendingAsk`，导致任何重新挂载（切会话/刷新/其他设备）都不显示卡片。

## 2. 修复方案

### 2.1 层次 1 — 客户端重水合（R1）

`hooks/useAgentSession.ts` 两处补充 `pendingAsk` 恢复（与相邻 state 字段同样的 `if (x !== undefined) setPendingAsk(x ?? null)` 模式）：

1. `loadSession` includeState 分支（L495-520，从 `/api/sessions/[id]/state` 的 `liveState`）。
2. 挂载 effect 的 `agentState.state` 处理块（L1919-1928）。

客户端 `pendingAsk` 是 `null` 还是 `undefined` 的既有约定不变（`setPendingAsk(pendingAsk ?? null)`）。

### 2.2 层次 2 — 服务端持久化（R2）

**新增 `lib/ask-user/persist.ts`**（纯 Node 模块，无框架依赖，便于 jiti 测试）：

```ts
interface PersistedOpenAsk { askId: string; askedAt: string; questions: AskUserQuestion[] }
// 文件格式：{ version: 1, asks: Record<sessionId, PersistedOpenAsk> }
loadOpenAsks(file?): Map<string, PersistedOpenAsk>   // JSON 解析失败/单条损坏 → 降级跳过，不抛
writeOpenAsks(file, asks): void                       // 0600 + 原子写（tmp + rename），失败记录日志
```
- 默认路径 `~/.pi/agent/pi-web-open-asks.json`（可注入路径便于测试）。

**`PendingAskStore` 增加 `restore(sessionId, ask)`**（`lib/ask-user/store.ts`）：
- 保留原 `askId`、不触发 supersede、不做严格校验（数据来自此前 open 时的验证）；仅轻量结构检查（askId/askedAt/questions 数组存在），不合法则忽略。
- 若该 session 已有 open ask（内存态为准），restore 跳过（不覆盖）。

**`AgentSessionWrapper`（`lib/rpc-manager.ts`）**：

| 时机 | 动作 |
|---|---|
| `openAsk()` 返回后 | `persistOpenAsk(sessionId, ask)`（replace） |
| `closeAsk()` 结果 closed | `forgetPersistedAsk(sessionId)` |
| `voidOpenAskForUserMessage()`（cancelOpen）有 outcome | `forgetPersistedAsk(sessionId)` |
| `destroy()` | 内存 `forgetSession()` 保留（防泄漏）；**磁盘保留** |
| wrapper 重建（`startRpcSession` 内、`registerRpcWrapper` 前） | `rehydrateOpenAsk(sessionId)`：读磁盘 → `store.restore()` |

- 磁盘写失败只记日志；内存态继续工作（运行中不丢，只是重开时无法恢复）。
- 编排封装在 `persist.ts` 提供的高阶函数（`persistOpenAsk/forgetPersistedAsk/rehydrateOpenAsk`），内部统一 try/catch，不向调用方抛错。

**state 路由的磁盘回退（R2 的"wrapper 不存在仍可见"）**：
- `app/api/sessions/[id]/state/route.ts`：`getRpcSession(id)` 不存在/不存活 → 读持久化，若有该 session 的 ask，返回 `{ running: false, state: { pendingAsk } }`；否则维持现状 `{ running: false }`。
- `app/api/agent/[id]/route.ts`（GET）：同样回退。
- 注意：返回的 `state` 仅有 `pendingAsk` 字段即可满足客户端恢复；客户端 `if (liveState.pendingAsk !== undefined)` 判定通过。

**会话删除清理**：
- `app/api/sessions/[id]/route.ts` 的 DELETE 成功路径调用 `forgetPersistedAsk(id)`。

### 2.3 状态机与磁盘一致性

| 事件 | 内存 store | 磁盘 |
|---|---|---|
| open（含 supersede） | set 新 ask（旧 close） | write 新 ask |
| submit / cancel（closed） | delete | delete |
| cancelOpen（void） | delete | delete |
| wrapper destroy（idle/重启前） | forget | **保留** |
| wrapper 重建 | restore（磁盘 → 内存） | 保留 |
| 会话 DELETE | — | delete |

- `closeAsk` 返回 stale 时（askId 已非当前 open）不动磁盘——磁盘已由 open/close 维护正确。
- 答案随 `sendCustomMessage` 进 transcript 的既有逻辑不变，与持久化无关。

## 3. 竞态与风险

- **askId 一致性**：rehydrate 保留原 askId，浏览器卡片 key（`key={pendingAsk.askId}`）与 `ask_submit` 校验才能匹配；若重建时生成新 askId，卡片 key 变化触发组件重建但功能可用，因此必须保留。
- **写放大/并发**：文件极小（单会话一份），原子写避免半写；多进程各持内存态、各自 rehydrate 读磁盘，最终一致。
- **destroy 不清磁盘**：fork 会 destroy 源 wrapper，但源会话文件仍在，保留其 ask 合理（用户 fork 后仍可回来作答）。
- **不改变**：`resolvePendingAskAfterClose` 竞态、AskUserCard 内部状态机、subagent 会话（不注册 ask_user 工具，rehydrate 读到空自然跳过）。
- **dev server 热重载**：`globalThis.__piAskUserStore` 与 `__piSessions` 同模式，新增持久化模块被 server 端 import，改后需重启 dev server 验证。

## 4. 测试计划

- `lib/ask-user/persist.test.mjs`（jiti 导入）：读写往返、原子写、损坏 JSON/单条降级、replace/delete 语义。
- `lib/ask-user/store.test.mjs` 追加：`restore` 保留 askId、跳过已有 ask、非法数据忽略。
- `hooks/useAgentSession.pending-ask-rehydrate.test.mjs`（源码断言，参照 `ChatWindow.ask-user-layout.test.mjs` 风格）：断言 includeState 分支与挂载 effect 含 `pendingAsk` 恢复。
- 手工验证（dev server）：切会话/刷新/换设备/等 10 分钟 idle 后打开，作答、取消、被取代、删除会话等路径。

## 5. 改动文件清单

- `lib/ask-user/persist.ts`（新）
- `lib/ask-user/store.ts`（`restore`）
- `lib/rpc-manager.ts`（open/close/void/destroy/rehydrate 钩子）
- `app/api/sessions/[id]/state/route.ts`（磁盘回退）
- `app/api/agent/[id]/route.ts`（GET 磁盘回退）
- `app/api/sessions/[id]/route.ts`（DELETE 清理）
- `hooks/useAgentSession.ts`（客户端重水合）
- 测试文件若干
