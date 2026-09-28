# Implement — 尾部状态行跟随

- [x] 1. `hooks/useAgentSession.ts`：把流式 delta 里的内联跟随判断
      （`1850-1857`）抽成 `followTailIfAttached`（`useCallback`，无依赖漂移），
      流式路径改为调用它，并在返回值里导出。

      语义必须保持一模一样：

      ```ts
      if (pendingScrollToUserRef.current) return;
      if (!isNearBottomRef.current) return;
      if (liveFollowFrameRef.current !== null) return;
      liveFollowFrameRef.current = requestAnimationFrame(() => {
        liveFollowFrameRef.current = null;
        if (isNearBottomRef.current) scrollToBottom("auto");
      });
      ```

      注意：`return` 与原来的 `if (...) { ... }` 在行为上等价，但**不要**顺手改动
      `pendingScrollToUserRef` / `isNearBottomRef` / `liveFollowFrameRef` 的任何写入时机。

- [x] 2. `components/ChatWindow.tsx`：
      a. 把状态行文案提成常量 `statusText`，JSX 与触发键共用同一结果
         （`agentRunning && !hasStreamingContent && agentPhase ? phaseLabel(agentPhase, t) : null`）；
      b. 组一个尾部状态键：`statusText` + `bashRunning && !pendingBash`（"Running command…" 行）
         + `pendingBash?.command`（pending 的 bash 卡片），三者都为空串时表示没有尾部临时块；
      c. `useLayoutEffect`：键非空时调用 `followTailIfAttached()`（从 hook 取）。

      不改 JSX 结构、className、字号与间距。

- [x] 3. `components/ChatWindow.status-tail-follow.test.mjs`（新增，沿用
      `ChatWindow.scroll-to-latest.test.mjs` 的源码级断言风格）：钉住
      ① `followTailIfAttached` 在 `useAgentSession` 返回值里导出且流式路径调用它；
      ② `ChatWindow` 的 layout effect 只在尾部状态键非空时调用它；
      ③ hook 里 `isNearBottomRef` / `pendingScrollToUserRef` 仍是跟随门禁。

- [x] 4. `e2e/run.mjs`：新增 `e2e/status-tail.mjs`（或内联到现有套件）——长会话 fixture +
      mock `EventSource` 灌 `agent_start` / `tool_execution_start` / `tool_execution_update`，
      断言折行状态行的最后一行矩形完全落在滚动容器可视区内，并断言"先上滚再更新则不动"。
      必须在隔离副本里实际执行（本 checkout 有 8505 dev 锁）。

- [x] 5. 规范更新（Phase 3.3）：把「尾部临时块必须跟随增长」的契约写进
      `.trellis/spec/frontend/component-guidelines.md`（或新增 `chat-scroll.md` 并在索引登记），
      含禁止模式（在滚动流末尾渲染会折行的临时块却不触发跟随）与本任务证据。
      → 实现为新增 `.trellis/spec/frontend/chat-tail-follow.md` 并登记进 `index.md`（主题独立于
      组件约定，避免把 19.7KB 的 component-guidelines 撑成混装文档）。

- [x] 6. 门禁三件套并记录：`node_modules/.bin/tsc --noEmit`、`npm run lint`、
      `env -u NODE_PATH XDG_STATE_HOME= npm test`；复现脚本的前后数值、e2e 结果写入
      `research/verification.md`（含未覆盖项）。

## 实施记录

- 除第 1–2 步外，还改了 `hooks/useAgentSession.ts` 的 `handleAgentEvent` 依赖数组
  （`scrollToBottom` → `followTailIfAttached`；后者不再直接调用 `scrollToBottom`，留着会让
  `react-hooks/exhaustive-deps` 报 "unnecessary dependency"，破坏 0 warning 基线），
  以及 `hooks/useAgentSession.test.mjs` 里两条钉住旧内联条件的断言（改为钉住原语，语义未放宽）。
- e2e 断言比第 4 步多了一条"已贴尾但差 4px 时，未变化的临时块不得滚动"的探测，
  用来让"不产生额外滚动"这条要求可被真实观测（见 `research/verification.md` 的突变验证）。

## Gates

```bash
node_modules/.bin/tsc --noEmit
npm run lint
env -u NODE_PATH XDG_STATE_HOME= npm test
# 隔离副本内（本 checkout 有 .next/dev/lock）：
E2E_SERVER_MODE=dev node e2e/run.mjs
```

不执行 `next build`（会污染 `.next/` 并让 `npm run dev` 失败）。

## Rollback

改动集中在 3 个文件（hook / 组件 / 测试）。回滚 = 撤销 `followTailIfAttached` 的抽取与
`ChatWindow` 的 layout effect；无数据迁移、无持久化状态、无接口变更。
