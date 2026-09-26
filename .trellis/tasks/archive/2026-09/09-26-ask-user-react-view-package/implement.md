# 执行顺序

## 前置

- A 已合并：`lib/ask-user/portable/view-controller.ts` 可用且测试全绿。
- 不要改动 `lib/ask-user/mcp-view-html.ts` 与 `components/AskUserAppHost.tsx`。

## 步骤

1. **`copy.ts` + `copy.test.mjs`**：抄录 `lib/i18n/messages/{en,zh-CN,zh-TW}.ts:394-403` 的 12 键文本，`answered` 保留 `{count}`/`{total}` 模板。断言三语键集合相等、无空串。抄录时不要顺手改措辞 —— 一致性比「更好」的值重要。

2. **`keyboard.ts` + `keyboard.test.mjs`**：roving tabindex 取值与方向键落点。重点断言：无选中时第一项 `0`、已选项 `0`、其余 `-1`；空组时两个方向键各自的落点；`Home`/`End`；返回 `null` 的键不改变状态。

3. **`view-css.ts` + `AskUserView.tsx`**：按 design 的变量表与度量实现。注意：
   - 只读 `--pi-ask-*`，不读 `--bg` / `--text` 等宿主命名；
   - `:focus-visible` 走样式表，输入控件不得内联 `outline:none`；
   - 锁定摘要只在 `isLocked(state)` 且 `questionSummary` 非空时渲染；
   - 单选与多选的自定义输入框占位文案不同（`otherPlaceholder` / `multipleOtherPlaceholder`）；
   - 状态字符 `aria-hidden="true"`；
   - `role="dialog"` 不带 `aria-modal`。

4. **`AskUserView.test.mjs`**：结构断言覆盖 design 的 a11y 表每一项，外加兜底着色断言（`<style>` 含 `--pi-ask-*` 与 `light-dark(`），以及源码断言「不含 `@/` / `useI18n` / `node:`」（照 `components/AskUserAppHost.test.mjs:76` 的 `assert.doesNotMatch` 风格）。

5. **fixture + 证据**：最小入口渲染组件，命令与输出写入 `research/`。若能在本地浏览器打开 fixture，手工核对一次键盘操作（Tab 进组一次、方向键移动并选中、多选 `Space`、锁定后焦点落点），把观察结果与「未在自动化中断言」的说明一起记录。

6. **`README.md`**：CSS 变量清单（含 Pi Web 的映射示例）、labels 清单、locale 与覆盖规则、a11y 契约、PA 接入步骤、未验证项（真实浏览器键盘、iOS 字体放大后的观感、非 React 宿主如何自行用 controller 渲染）。

7. **`portable/package.json`**：`peerDependencies` 增加 `react`，并在 README 说明 `react-dom` 由宿主提供。不要把它加进 `dependencies`。

8. **把「文案不构成双写点」的原因写进 `README.md`** —— 否则后来者会把包内默认表与 `lib/i18n` 当作需要同步的两份。

## 验证命令

```bash
node --test lib/ask-user/portable/react/*.test.mjs
node_modules/.bin/tsc --noEmit
npm run lint
XDG_STATE_HOME= npm test
```

## 风险与回滚

- 风险：组件里出现 `@/`、`useI18n`、Next 导入。用源码断言挡住。
- 风险：为了「能用」而在组件里读宿主变量名（`--bg-panel` 等）。那会把 Pi Web 的内部命名变成跨仓库契约；只允许 `--pi-ask-*`。
- 风险：照着被删卡片把 `✓` 写成 `#10b981`。用 `#16a34a`（父 design 有依据）。
- 风险：为了测键盘而在测试里搭 DOM stub。这正是要避免的路线；先检查契约是否真的需要 DOM，需要就把它抽成纯函数。
- 回滚：删目录 + 撤销 `portable/package.json` 的 peer 声明。
