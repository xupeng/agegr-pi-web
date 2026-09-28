# 移动端运行状态行折行时末行被输入框遮挡

## Goal

agent 运行期间，消息列表尾部的**临时状态行**（`phaseLabel(agentPhase)`）在 bash 工具运行、进度文本
较长时折成多行，其最后一行被消息滚动容器底边裁掉——视觉上就是"被下方输入框遮挡"。修复目标：只要读者
仍贴在列表尾部，这个块变高后立刻把尾部带回视野；读者已上滚时不得抢走滚动位置。

## Background

### 状态行是什么

- 渲染点：`components/ChatWindow.tsx:1256-1259`，条件 `agentRunning && !hasStreamingContent && agentPhase`，
  文本来自 `phaseLabel`（`components/ChatWindow.tsx:78-90`）。样式 `break-words py-2 text-[13px] text-text-muted`
  ——**允许折行**，`py-2` 给出上下各 8px 内边距。
- `running_tools` 带 `progress` 时文本是 `Running bash... <最后一行输出>`（`lib/i18n/messages/en.ts:386`）；
  `progress` 来自 `getToolExecutionProgress()`（`lib/tool-execution-progress.ts`，取 partialResult 的
  最后一行非空文本、压平空白、上限 500 字符）。bash 边跑边出输出 → 这个字符串不断变长 → 折行。
  用户真机截图里圈出的 `Waiting for model...` 是同一元素的 `waiting_model` 形态。
- 位置：它是滚动流里的最后一个可见块，位于 `components/ChatWindow.tsx:1281` 的 `promptAnchorSpacerRef`
  空 div 之前。**它不是消息**（不进 `messages`，不产生 `entryIds`）。

### 为什么没有跟随

消息列表的跟随只有两处，都不覆盖它：

1. 消息数量变化：`hooks/useAgentSession.ts:2841-2857` 的 `useLayoutEffect`，最后一支带
   `!agentRunningRef.current` 门禁（运行中由流式跟随负责）。
2. assistant 流式 delta：`hooks/useAgentSession.ts:1850-1857`，只在 `assistant_message_event`
   分支里，靠 `isNearBottomRef` + rAF 跟尾部。

状态行既不是消息、也不产生 assistant delta（工具运行期间模型在等待），所以运行中它变高时没有任何机制
把尾部重新带进视野：`scrollTop` 停在旧内容的底部，新增的行盒落到可视区之外。

### 复现证据（修复前，隔离副本 + Playwright 390×844 + `isMobile/hasTouch` 触摸视口）

脚本：`test-results/repro-status-tail.mjs`（不入库，隔离副本内运行）。用 mock `EventSource` 把
`agent_start` / `tool_execution_start` / `tool_execution_update` 灌进应用自己的 SSE 处理链，因此
不需要模型即可复现真实运行态。

| 阶段 | 状态行行数 | 末行 bottom | 滚动容器 bottom | 裁切 | `scrollerAtBottom` |
|------|-----------|------------|----------------|------|--------------------|
| `waiting_model`（一行） | 1 | 728 | 739 | -10px（可见） | true |
| bash 长进度（折行后） | 3 | 767 | 739 | **+29px（末行被裁）** | **false** |
| 手动滑到底（对照） | 3 | 728 | 739 | -10px（可见） | true |

对照行证明内容是**可到达**的，属于「尾部增长后没跟随」，而不是「内容不可达」。

## 决策（2026-09-28 用户确认）

1. **只修跟随，不改版**：状态行继续留在滚动流内（`askUserCardElement` 同款策略：临时块随会话滚动，
   消息视口保住整高），**不**改成钉在输入框上方的固定条。用户已确认问题位置就是这一行。
2. **跟随门禁复用流式跟随的语义**：`isNearBottomRef`（读者在尾部）且没有待执行的
   `pendingScrollToUserRef` 请求；节流复用同一个 `liveFollowFrameRef` + rAF，不新增第二套滚动机制。
3. **跟随原语只有一份**：把流式 delta 里那段内联判断抽成 `followTailIfAttached`，流式路径与新触发器
   共用，避免两处规则漂移。
4. **触发点放在渲染点旁边**：由 `ChatWindow`（唯一知道状态行渲染条件与文案的地方）在 layout effect 里
   声明"这个块变了"，由 hook 决定"要不要滚"。不在 hook 里重复推导 `agentPhase` 文案。
5. **验收方式**：确定性浏览器回归（mock SSE）由本任务跑；真机（iOS PWA standalone）人工验收由用户完成。

## Requirements

- 状态行**出现或文本变化**后，若读者在尾部且无 pending 的"滚到用户消息"请求，则把尾部带回视野。
- 读者已上滚时不得改变滚动位置（不得抢走用户手势）。
- 状态行不存在（`agentRunning` 为假、或流式内容已接管 `hasStreamingContent`）时不得产生额外滚动。
- 不改状态行文案、字号、折行行为、间距；不改 `shouldShowScrollToLatest` / `getLiveFollowAttached`
  语义；不改消息数量触发的跟随（含其 `!agentRunningRef` 门禁）。
- 不新增第二套滚动/节流机制；`followTailIfAttached` 必须是流式路径与新触发器共用的同一实现。

## Acceptance Criteria

- [x] AC1 复现脚本在修复后：bash 长进度状态行折行（`lineCount >= 2`）时 `clippedPx <= 0`，
      且此时 `scrollerAtBottom: true`。
- [x] AC2 未贴在尾部时不被抢走位置：先手动上滚（`isNearBottomRef` 变 false）再推状态行更新，
      `scrollTop` 保持不变。
- [x] AC3 未变化的临时块不产生额外滚动。行为侧在"已贴尾但差 4px"的状态下验证（重复推相同文本后
      `scrollTop` 不变，而推变化文本后回到尾部，避免断言空过）；"键取自渲染文本而非 phase 对象身份"
      这一实现不变量由 `components/ChatWindow.status-tail-follow.test.mjs` 的源码级断言钉住。
- [x] AC4 `e2e/run.mjs` 增加确定性回归断言（mock SSE + 长会话 fixture），并在隔离副本里实际跑通，
      证据（命令、退出码、失败前置数/断言通过数）写入 `research/verification.md`。
- [x] AC5 门禁三件套 `node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test` 退出码 0。
- [x] AC6 用户真机（iOS PWA standalone）人工验收：运行中状态行折行时末行完整可见。
      （2026-09-28 通过；过程与证据类型见 `research/verification.md` 的"用户人工验收"小节。）

## Notes

- 参考规范：`.trellis/spec/frontend/component-guidelines.md`（样式渠道与对话区字号）、
  `.trellis/spec/frontend/hook-guidelines.md`（`useLayoutEffect` 使用判据、依赖数组与 cleanup）、
  `.trellis/spec/frontend/quality-guidelines.md`（门禁、验证基线）。
- 已知环境约束：本 checkout 的 8505 服务持有 `.next/dev/lock`，`e2e/run.mjs` 会 assert 该锁不存在，
  因此浏览器验证在 `/home/xupeng/dev/personal/forked/.piweb-repro`（`git archive` + 硬链接
  `node_modules` 的隔离副本）内进行；这与 `09-28-chat-minimap-typography` 同一处境。
- 真机症状是「单行时正常、两行时下面一行被部分遮挡」：多出来的高度正是 `py-2` 的 8px 底内边距 +
  末行行盒的一部分，与本任务复现的 `+29px` 同源。

## Out of Scope

- 不改工具结果输出框（`PairedResult`）的 `maxHeight: 400` + 内层滚动设计，也不给它加"还有 N 行"
  提示（真机核对的结论是：用户报的位置不是它）。
- 不改 `messages.length` 跟随的 `!agentRunningRef.current` 门禁（运行中的消息增长由流式 delta 跟随
  负责，属既有设计）。
- 不改 prompt anchor spacer 的高度计算与 `scrollUserMsgToTop`。
- 不改 `components/ChatMinimap*`、不改输入框布局，也不动 `safe-area` / `--app-viewport-height`。
- 不改 `demo/` 下的静态演示副本（与本任务同源但独立发布，另行同步）。

## Acceptance Status

- AC1–AC5 已完成，测量值、命令与退出码见 `research/verification.md`。
- AC6 已由用户在 iOS PWA standalone 上验收通过（2026-09-28）：状态行折行时末行完整可见并自动贴底。
  首次尝试失败的原因是已安装 PWA 仍在跑缓存 bundle，划掉重开后同一轮观察即通过。
