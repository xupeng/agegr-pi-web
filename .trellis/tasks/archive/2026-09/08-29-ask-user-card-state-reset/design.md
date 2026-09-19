# 设计决策

## 根因

旧 ask 提交响应晚于新 ask 打开到达时，服务端 `store.submit(旧askId)` 返回 stale（open ask 已是新 ask），`syncPendingAsk(response.pendingAsk = 新ask)` 让 `pendingAsk` 从 ask A **直接切换**到 ask B（无 null 中间态）。React 复用 AskUserCard 组件实例，内部 `status="submitting"`（locked）、drafts、supplement 残留 → 新卡片被锁定。

## 修复

1. `ChatWindow.tsx`：`<AskUserCard key={ask.askId} ... />`——ask 变化强制重建，内部状态零残留。
2. `useAgentSession.ts`：
   - 提取纯函数 `resolvePendingAskAfterClose(current, submittedAskId, response)`：
     - `submittedAskId` 存在且 `current?.askId !== submittedAskId`（已有更新的 ask）→ 返回 `response.pendingAsk ?? current`（不清掉新 ask）。
     - 否则按原逻辑 `response.pendingAsk ?? null`。
   - `submitAsk`/`cancelAsk` 把本次 askId 传入 `syncPendingAsk`。

## 验证

- `components/ChatWindow.ask-user-layout.test.mjs` 或新测试：断言 AskUserCard 带 `key={ask.askId}`。
- `hooks/useAgentSession.test.mjs`：`resolvePendingAskAfterClose` 四象限（同 ask 清除 / 新 ask 保留 / 响应带 pendingAsk 以服务端为准 / submittedAskId 缺省）。
- `tsc --noEmit` + `npm test` + 用户实机连续 ask 验证。
