# 实现清单

## 步骤

1. `hooks/useIsMobile.ts`
   - 新增 `const TOUCH_QUERY = "(pointer: coarse)";`
   - 新增 `subscribeTouch` / `getTouchSnapshot` / `getServerSnapshot`（false）与 `export function useIsTouchDevice(): boolean`。
2. `components/ChatInput.tsx`
   - `import { useIsMobile, useIsTouchDevice } from "@/hooks/useIsMobile";`
   - `const isTouchDevice = useIsTouchDevice();`
   - `const isMobileOrTouch = isMobile || isTouchDevice;`，handleKeyDown 的 `sendShortcut` 用 `!isMobileOrTouch` 替代 `!isMobile`；依赖数组同步更新。
   - textarea 增加 `enterKeyHint="newline"`。
3. 测试（源码断言风格）
   - `components/ChatInput.send-shortcut.test.mjs`（新建或并入现有）：断言发送条件包含 `isMobileOrTouch`、textarea 有 `enterKeyHint="newline"`、useIsMobile 导出 `useIsTouchDevice` 且含 `pointer: coarse`。
4. 验证
   - `node_modules/.bin/tsc --noEmit`
   - `node --experimental-strip-types --test components/ChatInput.send-shortcut.test.mjs`
   - `npm test`
   - 用户实机验证（iPad mini + 微信输入法）。
