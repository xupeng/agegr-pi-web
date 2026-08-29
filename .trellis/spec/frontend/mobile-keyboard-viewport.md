# 移动端键盘与视口高度协议

> 软键盘弹出时 app 高度如何跟随 visual viewport，以及原生壳（WKWebView）下的兜底策略。

## 机制（`hooks/useViewportHeight.ts`）

- app 根节点高度 = `var(--app-viewport-height, 100dvh)`（`AppShell.tsx` 的 `#pi-app-root`）。
- 键盘打开时设置 `--app-viewport-height` 为 `visualViewport.height`，关闭时移除（回退 `100dvh`）。
- 判定（纯函数 `shouldUseVisualViewportHeight`）：焦点在可编辑元素（INPUT/SELECT/TEXTAREA/contentEditable）且未缩放且 `innerHeight - viewportHeight > 1`。
- 驱动事件：visualViewport resize/scroll、window resize、focusin/focusout、pageshow，全部经 rAF 节流。

## 关键决策

- **focus 后延迟重试**（`KEYBOARD_RETRY_DELAYS = [300, 700, 1200]`）：iOS 键盘滑入动画约 250-300ms，原生壳（无 keyboard avoidance 的 WKWebView）可能在动画期间不派发 visualViewport resize。focusin 后立即 rAF 读取会看到全高而误判"无键盘"，延迟重试覆盖动画窗口，保证点击输入框后 ≤500ms 内收缩，无需等用户输入文字。
- **keydown/input 兜底**（capture）：对完全不派发 resize 的壳，首次按键/IME 输入再检查一次已稳定的视口高度。
- **滚动恢复仅发生在开/关转换**：iOS 会推动布局视口，键盘开/关时 `window.scrollTo(0,0)` 一次；不在每个 visualViewport 事件恢复，避免与消息列表顶部 rubber-band overscroll 打架导致 jitter（`e91c965` 修复）。
- **设置幂等**：重复设置/移除 CSS 变量无害，因此 rAF 与延迟重试可自由叠加。

## 原生壳（WKWebView）注意事项

- 壳未做键盘避让时，webview 布局视口不收缩、`100dvh` 保持全高，键盘会盖住 composer——必须依赖上面的 visualViewport 兜底。
- 壳侧可选增强（自有壳）：iOS 15+ 用 `webView.keyboardLayoutGuide` 约束 webview 底边到键盘顶部。此时布局视口随键盘收缩、`100dvh` 自然生效，`innerHeight - viewportHeight ≈ 0`，web 侧兜底自动不干预，二者兼容。
- 修改 hook 内部结构时，同步更新 `components/MobilePwaLayout.test.mjs`（PWA 键盘契约断言）与 `hooks/useViewportHeight.test.mjs`。

## 输入语义：触屏设备 Enter 必须换行

- `ChatInput.handleKeyDown` 的发送判定使用 `isMobileOrTouch = isMobile || isTouchDevice`：`isMobile` 是 `max-width: 640px` 宽度断点，**iPad mini 竖屏 744px 会漏判**（此前导致微信输入法等第三方键盘的"换行"键直接发送）。`useIsTouchDevice()` = `matchMedia("(pointer: coarse)")` 按主指针类型覆盖 iPad/平板。
- 触屏设备：Enter（含换行键）插入换行，不发送；发送只通过发送按钮或 Ctrl/Cmd+Enter（外接键盘）。
- composer textarea 设置 `enterKeyHint="enter"`（标准值，"enter" = 插入换行；不要用非标准的 "newline"，React 类型不接受）。
- 不把 `pointer: coarse` 并入 `MOBILE_QUERY`：JS 移动布局与 CSS `@media (max-width: 640px)` 保持一致，仅发送语义纳入触屏判定。
- 回归测试：`components/ChatInput.send-shortcut.test.mjs`。
