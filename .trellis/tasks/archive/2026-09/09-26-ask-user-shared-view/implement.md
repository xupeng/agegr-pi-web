# 执行顺序

三个子任务依次进行，不并行。每一步的闸门是上一步验证全绿。

## 前置一次性检查

- `git status` 除本任务树的规划产物外干净；当前分支 `personal`，且它与 `origin` 一致（三个子任务分支都从它切出）。
- 不运行 `next build`。开发用 `npm run dev`（30141）；起服务前先 `lsof -nP -iTCP:30141 -sTCP:LISTEN` 复用已有进程。
- 推送一律写全 `git push origin <branch>`（本机 `push.default=matching`，裸 `git push` 会连带推 `main`）。

## 步骤

1. **A：抽 controller 并平移断言**（分支 `feat/ask-user-view-controller`）
   完成标准：`09-26-ask-user-view-controller` 验收全绿，`research/assertion-migration.md` 逐条映射完整。
   本步不切换渲染路径。合并后 `personal` 上仍走 iframe，Pi Web 行为零变化。

2. **B：共享 React 视图与契约**（分支 `feat/ask-user-react-view-package`，从 A 合并后的 `personal` 切出）
   完成标准：`09-26-ask-user-react-view-package` 验收全绿，fixture 证据落在 `research/`，`portable/react/README.md` 与实现一致。
   本步组件仍无 Pi Web 消费者，合并后 Pi Web 行为仍零变化。

3. **C：切换并删除 MCP Apps 渲染路径**（分支 `feat/ask-user-retire-mcp-apps`，从 B 合并后的 `personal` 切出）
   完成标准：`09-26-ask-user-retire-mcp-apps` 验收全绿，外加下面的手工全流程核对（**必须在删除文件之前先做一遍，删除之后再复核一遍**）：
   - 新会话触发 ask，视图出现在消息滚动流内并跟随滚动；空会话出现在 composer 上方的列对齐位置；
   - 单选：选选项后自定义框被清空；输入自定义文本后选项被取消；
   - 多选：选项与自定义文本可共存；自定义输入框占位文案与单选不同；
   - 提交后锁定：选项 disabled、每题摘要显示 `✓ values · otherText`、操作栏显示「已提交」；
   - 取消路径同样锁定并显示「取消中」；
   - 补充信息随提交送达（transcript 出现 `Supplement` 行）；
   - 切会话再切回：按原 `askId` 重水合，drafts 不跨 ask 泄漏（`key={pendingAsk.askId}` 语义）；
   - 另一个浏览器标签提交后，本端 3s 内关闭或切到新 ask；
   - 键盘：Tab 进入单选组一次、方向键移动并选中、多选 `Space` 切换、锁定时焦点落在状态行；
   - 5 套主题（light/dark/mist/rose/pine）下配色与对比度均可用。

4. **收尾提交**
   - A 分支：工作提交 → `docs(spec)`（若有）→ `chore(task): add ... planning/acceptance artifacts` → `chore(task): archive 09-26-ask-user-view-controller` → `chore: 记录会话日志` → push 并开 PR。
   - B 分支：同上，归档 B。
   - C 分支：同上，归档 C；**再额外归档父任务**。父任务没有独立 PR、没有自己的代码，它唯一的产物就是这棵任务树，因此它的归档随 C 的 PR 合并，理由写进提交信息。不要为了给父任务单独开一个空 PR。
   - 不要把 A、B 的归档或日志攒到 C 的分支：按根 `AGENTS.md`，每个任务的归档与会话日志必须落在**它自己**的特性分支上随自己的 PR 合并。

5. **父任务最终集成评审**（A、B、C 都合并进 `personal` 之后）
   - 全仓库搜索确认无残留：`@modelcontextprotocol`、`srcdoc`、`ASK_USER_VIEW_SCRIPT_HASH`、`theme-tokens`、`view-fonts`、`view-font-manifest`、`ask-view`；
   - `package.json` 与 `package-lock.json` 一致；
   - `.trellis/spec/frontend/ask-user-protocol.md` 与实现逐条对照；
   - 三语消息表键集合相等；
   - 三条标准验证命令通过。

## 验证命令（Pi Web 侧，每步之后）

```bash
node_modules/.bin/tsc --noEmit
npm run lint
XDG_STATE_HOME= npm test
```

## 风险与回滚

- 不可逆点是步骤 3。要回滚需要 revert C 的提交（可以，git 保留了全部被删实现），但需重跑 iframe 路径验证。
- 顺序约束：A 未落地前不得删除 `lib/ask-user/mcp-view-html.ts` 或 `mcp-view-html.test.mjs`。这是整条链上最容易被「顺手清理」破坏的一步。
- PA 仓库的接入不在本任务树的执行范围；B 的契约文档与 fixture 是它的前置，PA 的实现在它自己的仓库与 PR 里。
