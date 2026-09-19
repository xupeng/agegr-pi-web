# 实现清单

## 步骤

1. `components/AskUserCard.tsx`
   - 外层 div：删除 `maxHeight: "min(640px, calc(100vh - 160px))"`。
   - 内容区 div：删除 `flex: "1 1 auto", minHeight: 0, overflowY: "auto"`，保留 `padding: "12px 14px"` 与 `display: grid; gap: 14`。
   - 头部/底部栏 `flexShrink: 0` 保留。
2. `components/ChatWindow.tsx`
   - `askUserCardElement`：去掉外层 `padding: "0 16px 12px"` / `paddingRight` 包装（宽度对齐交给消息列），仅保留底部间距（如 `paddingBottom: 12`）。
   - 非空会话分支：把 `{askUserCardElement}` 从底部 `<div className="relative">` 移到消息滚动容器内、`messageContentRef` 内 `{rendered.slice(startIndex)}` 之后（与 streaming 区块之间）。
   - 底部固定区只保留 `{chatInputElement}` 与 `<ExtensionStatusBar ... />`。
   - 空会话分支（isEmptyNew）不变。
3. 测试（源码断言风格）：
   - 新增/扩充 ChatWindow 测试：断言 `askUserCardElement` 出现在滚动容器（`messageContentRef` 所在 div）内、底部固定 div 内不再引用它；AskUserCard 源码无 `maxHeight` 与 `overflowY: "auto"`。

## 验证

- `node_modules/.bin/tsc --noEmit`
- `npm run lint`（若仓库既有 React Compiler memoization 报错阻塞，则对变更文件单独 lint）
- `npm test`
- 浏览器手动验证（dev server :30141）：
  - 非空会话触发 ask_user → 卡片在消息流末尾，滚动跟随、可视区域最大化；
  - 问题多时卡片自然展开、整页滚动；
  - 输入框仍固定底部；空会话行为不变。
