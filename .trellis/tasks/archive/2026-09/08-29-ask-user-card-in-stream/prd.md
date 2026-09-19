# ask_user 卡片进入消息流跟随滚动

## Goal

TBD.

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
# ask_user 卡片进入消息流跟随滚动

## Goal

解决 ask_user 问题卡片固定在输入框上方、不随对话滚动导致消息可视区域被压缩的问题：卡片移入消息滚动流，滚动对话时卡片跟随滚动；卡片高度自然展开，由整个滚动区承担滚动。

## Requirements

- 非空会话：AskUserCard 渲染进消息滚动区（消息流末尾），不再固定在输入框上方；滚动对话时卡片跟随滚动，消息可视区域 = 输入框以上全高。
- 空会话（新会话页）：卡片保持现状（已在滚动流内），仅移除高度上限后的自然展开行为与其一致。
- 卡片移除 `maxHeight: min(640px, calc(100vh - 160px))` 内部滚动限制，按内容自然展开；问题较多时由整个消息滚动区滚动。
- 卡片宽度与消息列对齐（820px 列、16px 边距），不引入双重 padding，桌面端不溢出、移动端可用。
- 输入框与扩展状态栏保持固定在底部，布局层级不变。
- ask 出现时（run 结束）若用户停留在底部附近，卡片自动进入视野；复用现有 scrollToBottom 机制，不新增强制滚动，用户已上滚查看历史时不打扰。

## Acceptance Criteria

- [ ] 非空会话 ask_user 出现时卡片位于消息流末尾，随消息一起滚动；可视区域 = 输入框以上全高。
- [ ] 卡片不再有固定高度上限，问题多时自然展开、整页滚动。
- [ ] 卡片与消息列宽度对齐，桌面端不溢出、移动端可用。
- [ ] 输入框仍固定在底部。
- [ ] 空会话行为不变。
- [ ] TypeScript 类型检查、变更文件 lint、现有测试全部通过。

## Notes

- 关键改动：`components/ChatWindow.tsx` 中 `askUserCardElement` 从底部固定 div 移入滚动容器（`messageContentRef` 内、消息渲染之后）；`components/AskUserCard.tsx` 移除 maxHeight 与内部滚动。
- `ask.opened` 事件本身不触发滚动；run 结束时（`prompt_done`/`agent_end` → `agentRunning` 为 false）现有 `useLayoutEffect` 在 `isNearBottom` 时 `scrollToBottom`，足以让卡片进入视野。
- ChatWindow 测试为源码断言风格（`ChatWindow.notices.test.mjs` 等），可加一条断言：卡片渲染位置在滚动容器内、底部固定区不再包含卡片。
