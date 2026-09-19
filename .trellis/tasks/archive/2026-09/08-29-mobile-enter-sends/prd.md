# 移动端微信键盘换行键误发送

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
# 移动端键盘换行键误发送（iPad 触屏设备）

## Goal

修复触屏设备（iPad mini 竖屏视口 744px > 640px 断点）上键盘"换行"键被当作发送键的问题：微信输入法（第三方键盘）显示"换行"键，点击却直接发送消息，导致用户输入不完整内容被误发。

## Requirements

- 触屏设备（`pointer: coarse`，iPad/手机等）上，键盘 Enter（换行键）默认插入换行，不发送；发送只通过显式操作（发送按钮、Ctrl/Cmd+Enter 外接键盘）。
- 桌面设备（鼠标指针）行为不变：Enter 直接发送。
- 不改变 iPad 等触屏设备的整体布局断点（`useIsMobile` 640px 不变），避免 JS 移动布局与 CSS `@media (max-width: 640px)` 不一致。
- 输入框设置 `enterKeyHint="newline"`，提示键盘保持"换行"键类型（iOS 15.4+ WKWebView 与主流第三方键盘支持）。

## Acceptance Criteria

- [ ] iPad mini 竖屏 + 微信输入法：点击"换行"键插入换行，不发送；发送按钮正常发送。
- [ ] 手机（<640px）行为不回归：单 Enter 换行、Ctrl/Cmd+Enter 发送（保持现状）。
- [ ] 桌面 Enter 发送不回归。
- [ ] 新增/更新源码断言测试覆盖触屏发送判定与 enterKeyHint。
- [ ] TypeScript 类型检查、变更文件 lint、现有测试全部通过。

## Notes

- 根因：`ChatInput.handleKeyDown` 的 `sendShortcut` 依赖 `isMobile`（`max-width: 640px`），iPad mini 竖屏 744px 判定为非移动端 → Enter 直接发送。iOS 第三方键盘（微信输入法）在 textarea 上显示"换行"键，但 keydown Enter 无修饰键仍被发送分支消费。
- 修复不全局扩展 isMobile 断点（会与 CSS 640px 断点错位），只在发送判定中纳入 `pointer: coarse` 触屏检测。
