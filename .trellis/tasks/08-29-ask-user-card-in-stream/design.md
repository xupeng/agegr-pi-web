# 设计决策

## 现状

- 非空会话：`askUserCardElement` 渲染在底部固定 `<div className="relative">`（AskUserCard + ChatInput + ExtensionStatusBar），卡片不随消息滚动；AskUserCard 自带 `maxHeight: min(640px, calc(100vh - 160px))` + 内部 `overflowY: auto`，固定占掉大片高度，压缩消息滚动区。
- 空会话：卡片已在滚动流内（外层 `overflow-y-auto`），无固定占位问题。

## 改动

1. `ChatWindow.tsx`：把 `askUserCardElement` 移入消息滚动容器，放在 `messageContentRef` 内、`{rendered.slice(startIndex)}` 之后（streaming/过程提示之前，`promptAnchorSpacer` 之前）；去掉其外层 `padding: 0 16px` 的独立留白，宽度直接由消息列（820px + CHAT_COLUMN_PADDING 16px）对齐，底部保留小间距。底部固定区只保留 ChatInput + ExtensionStatusBar。
2. `AskUserCard.tsx`：移除外层 `maxHeight` 与内部内容区 `overflowY: auto`（自然展开）；头部/底部栏 `flexShrink: 0` 保留。
3. 不改 `useAgentSession.ts` 的滚动逻辑：`prompt_done`/`agent_end` 使 `agentRunning` 置 false 后，现有 `useLayoutEffect`（依赖 `agentRunning`，`isNearBottom` 时 `scrollToBottom("auto")`）已覆盖"卡片进入视野"；ask 与 agent running 不同时存在，`promptAnchorSpacer` 测量不受影响。

## 验证

- 源码断言测试：卡片在滚动容器内、底部固定区不再含 askUserCardElement、AskUserCard 无 maxHeight。
- `node_modules/.bin/tsc --noEmit` 类型检查。
- 变更文件 eslint 检查 + `npm test` 现有测试。
