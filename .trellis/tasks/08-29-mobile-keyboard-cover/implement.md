# 实现清单

## 步骤

1. `hooks/useViewportHeight.ts`
   - 提取 `applyKeyboardHeight()`：现有 update 主体（读 visualViewport → 设/移除 CSS 变量 → 转换时 scrollTo）。
   - `scheduleUpdate()`：rAF 节流调用 `applyKeyboardHeight()`（保留）。
   - `scheduleRetries()`：focus 后安排 300/700/1200ms 三次 `applyKeyboardHeight`；用 Set 管理 timer；`clearRetries()` 在 focusout 与卸载时调用。
   - 监听 `keydown`（capture）触发 `scheduleUpdate()` 兜底。
   - 清理逻辑覆盖 retry timers。
2. `hooks/useViewportHeight.test.mjs` 扩展
   - 导出可测的纯逻辑（如 `getKeyboardRetryDelays()` 或让 `applyKeyboardHeight` 可注入），断言延迟检查序列存在且 focusout 会清理。
   - 保留并跑通现有 4 条测试。
3. 验证
   - `node_modules/.bin/tsc --noEmit`
   - `node --experimental-strip-types --test hooks/useViewportHeight.test.mjs`
   - `npm test`
   - 用户实机验证（原生壳 iOS）。
