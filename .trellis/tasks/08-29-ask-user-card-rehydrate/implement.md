# 实现清单

## 步骤 1：客户端重水合（R1）

- `hooks/useAgentSession.ts`：
  - `loadSession` includeState 分支（`liveState` 处理块）加 `if (liveState.pendingAsk !== undefined) setPendingAsk(liveState.pendingAsk ?? null);`
  - 挂载 effect 的 `agentState.state` 处理块加同样的 `pendingAsk` 恢复。

## 步骤 2：持久化模块

- 新增 `lib/ask-user/persist.ts`：`loadOpenAsks` / `writeOpenAsks`（0600 + 原子写，损坏降级）+ 高层编排 `persistOpenAsk` / `forgetPersistedAsk` / `rehydrateOpenAsk`（统一 try/catch）。
- `lib/ask-user/store.ts`：`PendingAskStore.restore(sessionId, ask)`（保留 askId、跳过已有、轻量结构检查）。

## 步骤 3：wrapper 钩子

- `lib/rpc-manager.ts`：
  - `openAsk()` 成功后 `persistOpenAsk(...)`。
  - `closeAsk()` closed 后 / `voidOpenAskForUserMessage()` 有 outcome 时 `forgetPersistedAsk(...)`。
  - `startRpcSession` 创建 wrapper 后、`registerRpcWrapper` 前 `rehydrateOpenAsk(...)`。

## 步骤 4：路由磁盘回退 + 删除清理

- `app/api/sessions/[id]/state/route.ts`：wrapper 缺失时读持久化返回 `{ running: false, state: { pendingAsk } }`。
- `app/api/agent/[id]/route.ts`（GET）：同上。
- `app/api/sessions/[id]/route.ts`（DELETE）：成功后 `forgetPersistedAsk(id)`。

## 步骤 5：测试

- `lib/ask-user/persist.test.mjs`：读写往返、原子写、损坏降级、replace/delete。
- `lib/ask-user/store.test.mjs` 追加 restore 用例。
- `hooks/useAgentSession.pending-ask-rehydrate.test.mjs`：源码断言两处恢复。
- 路由回退可用 `app/api/sessions/runtime-route.test.mjs` 同款 jiti 方式补充（若成本低）。

## 步骤 6：验证

- `node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test`（相关文件）。
- dev server 手工验证：切会话、刷新、等 idle 销毁后重开、作答/取消/删除会话。
