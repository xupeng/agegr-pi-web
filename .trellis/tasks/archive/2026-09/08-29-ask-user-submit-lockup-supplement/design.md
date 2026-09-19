# 设计决策

## 提交锁定

- `AskUserCard` 新增 `const [submitted, setSubmitted] = useState(false)`。
- `handleSubmit`：`setSubmitted(true)` → `onSubmit(ask.askId, answers, supplement)`（answers 组装不变，supplement 单独携带）。
- `submitted` 时：选项按钮 `disabled`、自定义输入与补充输入 `readOnly`、操作栏替换为"已提交 ✓"状态条，并在每题下渲染提交摘要（`selected values` / `custom: otherText`）。
- 正常路径：响应 `syncPendingAsk(response)`（pendingAsk undefined）→ 卡片卸载；竞态残留时组件保持 submitted 锁定，不会复活可编辑态。
- cancel 同样进入锁定态（`cancelling`），防重复请求。

## 补充输入项

- UI：卡片问题列表下方新增"补充信息（可选）"多行 textarea，`maxLength` 4000，占位"补充问题之外的信息（可选）"。
- 协议：`AskUserSubmission.supplement?: string`；store `validateSubmission` 校验长度（>4000 抛 `PendingAskValidationError`）、trim 空则丢弃；`AskUserOutcome.supplement?` 记录；`renderAskUserAnswersText` 末尾附加 `Supplement: ...`。
- 多选问题自定义输入框占位改为"补充说明（可与选项同时提交）"，单选保持"自定义答案（将替换所选选项）"。

## 单选互斥

- 现有 `toggleOption`（单选清 otherText）与 `setOtherText`（单选清 values）逻辑保留；本次通过提交摘要与占位文案消除"不确定提交了什么"的困惑，并用测试锁定互斥行为。

## 验证

- `lib/ask-user/store.test.mjs`：supplement 校验（长度/空白）、outcome 记录、模型文本含 Supplement。
- `components/AskUserCard` 相关测试（源码断言或状态逻辑）：submitted 锁定、补充输入框存在。
- `tsc --noEmit` + 变更文件 eslint + `npm test`。
- 用户实机（iPad）：提交后锁定+摘要+消失；补充文本送达模型。
