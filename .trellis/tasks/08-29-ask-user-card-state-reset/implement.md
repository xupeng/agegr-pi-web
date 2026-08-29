# 实现清单

1. `components/ChatWindow.tsx`：`<AskUserCard key={ask.askId} ...>`。
2. `hooks/useAgentSession.ts`：
   - 导出 `resolvePendingAskAfterClose(current, submittedAskId, response)`。
   - `syncPendingAsk(response, submittedAskId?)` 用该函数解析。
   - `submitAsk`/`cancelAsk` 传 askId。
3. 测试：ChatWindow 源码断言 key；`hooks/useAgentSession.test.mjs` 新增 resolve 四象限。
4. 验证：tsc、npm test、用户实机连续两次 ask。
