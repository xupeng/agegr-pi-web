# 设计决策

## 现状

`components/ChatInput.tsx` handleKeyDown：

```ts
const sendShortcut = e.key === "Enter" && !e.shiftKey && (!isMobile || e.ctrlKey || e.metaKey);
```

`isMobile` 来自 `useIsMobile()` = `matchMedia("(max-width: 640px)")`。iPad mini 竖屏 CSS 视口宽 744px → isMobile=false → 无修饰 Enter 直接 `handleSend()`。

## 方案：发送判定纳入触屏检测（最小侵入）

1. `hooks/useIsMobile.ts` 新增 `TOUCH_QUERY = "(pointer: coarse)"` 与 `useIsTouchDevice()`（`useSyncExternalStore`，同 isMobile 模式）。
2. `ChatInput.tsx`：
   - `const isMobileOrTouch = isMobile || isTouchDevice;`
   - `sendShortcut = e.key === "Enter" && !e.shiftKey && (!isMobileOrTouch || e.ctrlKey || e.metaKey)`
   - textarea 加 `enterKeyHint="newline"`。
3. 不改 `MOBILE_QUERY`（640px）与 CSS 断点：避免 iPad 上 JS 移动布局与 CSS 桌面样式错位；触屏设备布局维持现状（用户已适应的桌面布局），仅发送语义修正。

风险：触屏笔记本（主指针 fine）不受 `pointer: coarse` 影响；iPad 外接鼠标时主指针仍 coarse，Enter 仍换行（可接受，触屏设备以按钮发送为主）。

## 验证

- 源码断言：`useIsMobile.ts` 含 `pointer: coarse`；`ChatInput.tsx` 发送条件含 isTouchDevice、textarea 含 enterKeyHint="newline"。
- `tsc --noEmit` + 变更文件 eslint + `npm test`。
- 用户实机：iPad mini 竖屏微信输入法换行键插入换行、发送按钮正常；手机/桌面无回归。
