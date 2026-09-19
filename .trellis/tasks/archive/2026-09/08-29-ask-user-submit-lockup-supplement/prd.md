# ask_user 提交锁定与补充输入项

## Goal

TBD.

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
# ask_user 提交锁定与补充输入项

## Goal

两项改进：① 提交答案后卡片显示"已提交"并锁定交互，随后消失——避免提交后残留卡片被误操作（用户曾改选答案却不确定最终提交了什么）；② 在问题之外提供自由补充输入项（多行、可选），让用户补充问题没覆盖的信息。

## Requirements

### 提交锁定

- 点击提交后：卡片立即进入"已提交"状态，锁定所有选项/输入交互（按钮 disabled），显示已提交反馈（如"已提交 ✓"）。
- 提交成功后卡片随 `ask.closed`/响应消失；若因竞态（SSE 关闭、重水合）卡片残留，仍保持锁定状态，用户不可再改选。
- 已提交状态下每题显示提交的答案摘要（选项值 / 自定义文本），让用户确认最终提交内容。
- 取消（cancel）同样锁定，防止重复操作。

### 补充输入项

- 卡片底部（问题列表与操作栏之间）新增"补充信息（可选）"多行输入框。
- 提交时作为独立补充字段随 answers 一起送达模型；为空时不产生字段。
- 长度上限沿用自定义文本的 4000；模型侧 follow-up 文本包含补充内容，明确标注。

### 单选互斥（澄清与增强）

- 单选问题：选选项清空自定义文本、输入自定义文本取消选项选中（现有逻辑保留并验证）。
- 多选问题：选项与自定义文本可共存（设计行为），补充输入框占位文案区分说明，避免"不确定提交了哪个"的困惑。
- 提交后摘要明确列出每题最终提交的内容。

## Acceptance Criteria

- [ ] 提交后卡片立即锁定并显示"已提交"，随后消失；残留时不响应交互。
- [ ] 补充输入项（多行、可选）可输入并随提交送达模型；为空不产生字段；超长被拒绝。
- [ ] 模型 follow-up 文本包含补充内容。
- [ ] 单选互斥行为正确；多选共存行为有文案说明。
- [ ] 协议层（types/store/tool）与浏览器层测试覆盖补充字段与锁定逻辑。
- [ ] TypeScript 类型检查、变更文件 lint、现有测试全部通过。

## Notes

- 协议扩展：`AskUserSubmission.supplement?`、`AskUserOutcome.supplement?`（≤4000、trim 非空才记录）；`renderAskUserAnswersText` 末尾附加 `Supplement: ...`。
- `useAgentSession.submitAsk` 签名扩展 `(askId, answers, supplement?)`；`AskUserCard` 内部 `submitted` 状态驱动锁定与摘要。
