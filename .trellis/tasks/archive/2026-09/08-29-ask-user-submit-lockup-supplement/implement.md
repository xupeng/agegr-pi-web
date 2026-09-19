# 实现清单

## 步骤

1. `lib/ask-user/types.ts`
   - `AskUserSubmission` 增加 `supplement?: string`。
   - `AskUserOutcome` 增加 `supplement?: string`。
2. `lib/ask-user/store.ts`
   - `submit()`：从 `submission.supplement` 校验（`normalizeSupplement`：≤4000 否则抛错；trim 空 → undefined），传给 `requireClose`/`close`/`askUserOutcome`。
   - `askUserOutcome` 记录 supplement；`renderAskUserAnswersText` 末尾附加 `Supplement: <json>`。
   - cancel/supersede 不携带 supplement。
3. `hooks/useAgentSession.ts`
   - `submitAsk(askId, answers, supplement?)`：payload `{ type: "ask_submit", askId, answers, ...(supplement ? { supplement } : {}) }`。
4. `components/AskUserCard.tsx`
   - 新增 `supplement` draft 状态与多行输入框（"补充信息（可选）"）。
   - 新增 `submitted`（及 `cancelling`）状态：提交/取消后锁定交互、显示"已提交 ✓"、每题渲染提交摘要。
   - 多选问题自定义输入占位文案区分。
5. 测试
   - `lib/ask-user/store.test.mjs`：supplement 长度/空白校验、outcome 记录、渲染含 Supplement。
   - `components/` 下 AskUserCard 源码/逻辑断言：submitted 锁定、补充输入框、多选占位。
6. 验证
   - `node_modules/.bin/tsc --noEmit`；`npm test`；变更文件 eslint。
   - 用户实机（iPad）：提交锁定与摘要、补充文本送达。
