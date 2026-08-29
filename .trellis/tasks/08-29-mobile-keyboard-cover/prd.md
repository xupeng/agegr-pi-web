# 移动端键盘遮挡输入框（原生壳 webview）

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
# 移动端键盘遮挡输入框（原生壳 webview）

## Goal

修复 iOS 原生壳（WKWebView）中点击聊天输入框后软键盘弹出、消息列表底部与输入框被键盘遮挡的问题。当前表现为：点击输入框后界面不随键盘上移，输入任意文字后才恢复正常。

## Requirements

- 点击输入框（textarea）后，键盘弹出过程中或完成后尽快（≤500ms）让 app 高度收缩到键盘上方，无需等用户输入文字。
- 不回归 PWA / Safari 场景：保留现有 visualViewport 监听、滚动位置恢复（仅键盘开/关转换时 scrollTo）、防顶部 overscroll jitter 行为。
- 键盘关闭后 app 高度恢复全高，滚动位置正确。
- 不依赖壳侧改动也能工作；壳侧 keyboardLayoutGuide 修复作为可选增强，二者兼容（壳收缩布局视口后，`innerHeight - viewportHeight ≈ 0`，web 侧自动不干预）。

## Acceptance Criteria

- [ ] 原生壳 webview 中点击输入框，键盘弹出后 app 高度收缩到键盘上方，输入框与消息底部可见，无需输入文字触发。
- [ ] Safari / PWA 场景行为不回归（现有 useViewportHeight 测试全部通过）。
- [ ] 键盘关闭后恢复全高，无 jitter、无残留 CSS 变量。
- [ ] 新增单元测试覆盖"focusin 后延迟检查能补上键盘高度"的时序逻辑。
- [ ] TypeScript 类型检查、变更文件 lint、现有测试全部通过。

## Notes

- 根因假设：`focusin` 后 rAF 立即读取 `visualViewport.height` 时键盘动画未开始（全高），判定 keyboardOpen=false 并移除 CSS 变量；WKWebView 中键盘弹出动画期间 visualViewport resize 事件可能不派发，直到输入文字（键盘布局稳定）才触发更新。
- 修复：focus 后延迟重试检查（覆盖键盘动画窗口），并在 `keydown`/`input` 兜底触发；CSS 变量设置幂等、scrollTo 仅在开/关转换时执行。
- 壳侧可选增强（用户自有壳）：iOS 15+ `WKWebView.keyboardLayoutGuide` 约束让 webview 高度随键盘收缩，web 侧兜底自动让位。
