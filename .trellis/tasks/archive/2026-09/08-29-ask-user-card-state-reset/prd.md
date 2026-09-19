# ask_user 新卡片状态残留修复

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
# ask_user 新卡片状态残留修复

## Goal

修复连续两次 ask_user 时新卡片被旧组件状态锁定的 bug：提交上一个 ask 后，下一个 ask 打开时卡片复用同一组件实例，`status`（submitting/locked）、drafts、supplement 全部残留，导致新卡片选项点击无反应、输入框禁用、只能取消。

## Requirements

- ask 切换（`pendingAsk.askId` 变化）时，AskUserCard 内部状态必须清零重建（`key={askId}` 强制卸载/挂载）。
- 提交/取消命令的响应不得清掉更新的 ask：提交 ask A 的响应在 ask B 已打开后到达时，若响应无 pendingAsk，保留当前 ask B（不置 null）；若响应带 pendingAsk，以服务端为准。
- 行为不回归：正常单次提交后卡片消失、锁定态、补充输入项均保持。

## Acceptance Criteria

- [ ] 连续两次 ask_user：第二次卡片可正常交互（选项可点、输入可用），无锁定残留。
- [ ] 提交 A 响应晚于 ask B 打开到达时，B 卡片不被清除。
- [ ] 新增测试覆盖 key 重建与竞态解析逻辑。
- [ ] TypeScript 类型检查、变更文件 lint、现有测试通过。
