# 设计决策

## 现状

`hooks/useViewportHeight.ts` 通过 visualViewport 监听 + `focusin`/`focusout` + `resize`/`scroll` 事件驱动，检测到键盘打开时把 `--app-viewport-height` 设为 `visualViewport.height`，否则移除（回退 `100dvh`）。

竞态：iOS 键盘弹出是动画（~250-300ms）。`focusin` 后 rAF 立即执行时 `visualViewport.height` 仍是全高 → 移除 CSS 变量；若键盘动画期间 WKWebView 不派发 visualViewport resize 事件，则没有后续更新，界面保持全高被键盘遮挡。用户输入第一个字符时键盘布局稳定触发事件 → 才恢复。

## 方案：延迟重试 + 输入兜底（web 侧，主修复）

1. `focusin` 时：立即 rAF 检查（保留），并安排 300/700/1200ms 三次延迟重试，覆盖键盘动画完成窗口；每次重试调用同一 `applyKeyboardHeight`（设置/移除 CSS 变量幂等）。
2. `focusout` 时：取消未执行的重试，立即检查（键盘关闭路径不变）。
3. 新增 `keydown` 兜底触发（focus 期间开始输入时再检查一次）。
4. 滚动位置恢复保持"仅在 keyboardOpen 状态转换时 scrollTo(0,0)"，不做逐事件恢复，防 jitter 不回退。
5. 清理：组件卸载时清空所有重试 timer。

实现要点：把 update 逻辑提取为 `applyKeyboardHeight()`（可由 rAF、延迟重试、keydown 共用）；重试 timer 用 Set 管理，focusout/卸载时清理。

## 壳侧可选增强（不影响 web 侧独立性）

用户自有 iOS 壳可设置 `webView.keyboardLayoutGuide`（iOS 15+）约束 webview 底边到键盘顶部：布局视口随键盘收缩，`100dvh` 自然生效，`innerHeight - viewportHeight ≈ 0` 时 web 侧 visualViewport 兜底自动不干预，二者兼容。

## 验证

- `hooks/useViewportHeight.test.mjs` 扩展：导出调度辅助逻辑（如延迟检查序列），断言 focus 后延迟检查能纠正"过早读取全高"的误判。
- `tsc --noEmit` + 变更文件 eslint + `npm test`。
- 用户实机验证：原生壳中点击输入框 ≤500ms 内界面收缩，输入框可见；Safari/PWA 无回归。
