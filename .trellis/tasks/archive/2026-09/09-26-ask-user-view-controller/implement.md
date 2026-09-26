# 执行顺序

## 前置

- 本任务不需要任何其他子任务先完成，可以立即开始。
- 不要删除 `lib/ask-user/mcp-view-html.test.mjs` 或 `lib/ask-user/mcp-view-html.ts`；本任务只新增。

## 步骤

1. **整理断言清单。** 读 `lib/ask-user/mcp-view-html.test.mjs`（510 行，17 条顶层 test）与 `git show 367d18c^:components/AskUserCard.tsx`，按 `design.md` 的归属分类（behavior → controller / view → B / pipeline → C / 混合需拆分）建立工作清单。

2. **写 `lib/ask-user/portable/view-controller.ts`。** 纯 reducer + 选择器，按 `design.md` 的接口签名。关键点：
   - `drafts` 用 `Map`，避免模型给出的 `__proto__`/`constructor` 之类 id 破坏状态。
   - reducer 不抛异常、不改入参（每次返回新对象/新 Map）。
   - `questionSummary` 与 `buildAskUserSubmission` 的 trim/省略规则严格照 `design.md` 的语义表。

3. **写 `lib/ask-user/portable/view-controller.test.mjs`。** 覆盖语义表的每一行，重点是：
   - 单选互斥的两个方向（选选项清自定义、输自定义清选项）；
   - 多选与自定义共存；
   - 摘要在 `locked` 前的空字符串与 `locked` 后的 `✓ a · b · 自定义`；
   - `buildAskUserSubmission` 的省略规则（空问题跳过、`otherText` 空省略字段、supplement 空 → `undefined`）；
   - 在途锁定：`submit-requested` / `cancel-requested` 之后 `isLocked` 为真且 `error` 被清空；`action-failed` 之后 `status` 复位 `idle`（解锁）且 `error` 保留。这与 `mcp-view-html.ts:605-623` 一致 —— 不要照抄被删卡片「catch 里不解锁」的写法，那会让提交失败后卡片永久卡死；
   - `__proto__`/`toString` 作为 question id 时的正确性与原型未被污染。
   - 源码断言：controller 文件不含 `react`、`@/`、`node:` 导入（照 `lib/ask-user/extension.test.mjs` 的源码断言风格）。

4. **写 `research/assertion-migration.md`。** 逐条列出旧 test 名 → 归属 → 新断言名 → 语义等价说明；缺口单列。`:137` 与 `:148` 必须写明拆成了哪两条。

5. **更新 `lib/ask-user/portable/index.ts`**：导出 controller 的 reducer、选择器与类型；既有导出与签名不动。

6. **记录比例证据。** 在 `research/assertion-migration.md` 末尾记一行：controller + 视图行为代码行数 vs 被判定为 pipeline 的代码行数（用 `wc -l`），作为父任务「行为 vs 管线」的证据。不要下结论，只记数字与口径。

## 验证命令

```bash
node --test lib/ask-user/portable/view-controller.test.mjs
node_modules/.bin/tsc --noEmit
npm run lint
XDG_STATE_HOME= npm test
```

`lib/ask-user/mcp-view-html.test.mjs` 必须仍然原样通过（本任务不删它）。开发期间不运行 `next build`。

## 风险与回滚

- 风险：把 controller 写成需要问题对象才能工作的半纯函数，会让 B 的 React 组件不得不再包一层。若发现 reducer 需要 `AskUserQuestion`，先回到 `design.md` 的 `multiple` 入参设计，不要就地打补丁。
- 风险：断言平移做成了"看起来覆盖了"。以 `research/assertion-migration.md` 的逐条映射为交付物，check 阶段核对条数与语义。
- 回滚：删除 `view-controller.ts`、`view-controller.test.mjs`、`research/assertion-migration.md` 与 `portable/index.ts` 的导出行即可，没有其他文件被改动。
