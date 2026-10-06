# 执行计划（2026-10-06 已批准）

## 进入实现的门禁

- [x] 用户同意创建任务，来源证据与完整边界研究完成。
- [x] PRD 收敛、design/implement 完成，implement/check manifests 含真实 context。
- [x] 用户在最新摘要之后明确批准“仅退役 fork 编辑器及 API，保留 SDK 原生加载”。
- [x] 检查工作区/当前任务，创建 `remove-append-instructions` 特性分支（base `personal`），执行 `task.py start` 后派发实现。

## 顺序

1. 按 `research/provenance-and-scope.md` 再确认变更 owner 与当前文件位置；阅读有关规范、notes 与完整源文件，不按旧行号机械打补丁。
2. 将两条 SDK 原生加载测试迁入退役回归测试，fixture 直接写文件；增加专属文件/引用缺失断言与旧 section 回退、其他 selections 保留测试。
3. 精确删除组件/API/helper 的六个专属文件，并局部清理 SettingsPanel、section 枚举、DTO、专属 CSS 和三语文案。
4. 更新关联 SettingsPanel 测试与 AskUser retirement 断言，保留 MCP、General、reload、trust、Escape/focus 等已有覆盖。
5. 更新当前 file map/目录树，退役专属 spec/ADR 并同步索引及 tools note，保留历史产物与用户数据。
6. 派发 `trellis-check` 做全范围审查与修复；复核不是整文件 ours/theirs、不是粗暴全文删 `APPEND_SYSTEM.md` 或 `appendSystemPrompt`。
7. 执行验证并记录依赖树/ref、命令、退出码、用例/文件计数与 baseline/candidate 对比、浏览器证据、未覆盖平台及清理情况。
8. 检查 diff、完成规范更新与总结。若进入提交/PR交付，遵循 work → spec → task artifacts → archive → journal → PR，全部在任务分支；推送明确 `git push origin <branch>`。

## 验证环境

- 干净安装 `npm ci --include=dev`，不以已有混合 node_modules 为基线；尽量复用同一 baseline/candidate 的验证环境。
- 运行时测试在隔离 HOME/`PI_CODING_AGENT_DIR` 下执行，可用 `PI_OFFLINE=1`、`JITI_FS_CACHE=false`；真实 agent 文件不参与读写测试。
- 临时资源遵循实际 `TMPDIR`，优先 `~/.pi/agent/bin/pi-tmp-run --keep-on-failure <label> -- <command...>`，大规模源码/依赖或需要保留的 worktree 用主磁盘独立路径，不放 `/tmp` 或自动清理缓存内。
- 禁止在开发目录跑 `next build`。浏览器服务先查端口 30141 并复用健康进程；不得额外起争用同一 `.next/dev/lock` 的进程。隔离候选实例需独立 checkout/.next、agent HOME 与记录端口/PID；本任务结束停止本任务服务、移除干净 worktree，持久证据归入任务 research。

## 自动化命令（实现之后）

```sh
node_modules/.bin/tsc --noEmit --incremental false
npm run lint
node --experimental-strip-types --test \
  components/SettingsPanel.test.mjs \
  components/SettingsPanel.ask-user-retirement.test.mjs \
  lib/settings-navigation.test.mjs \
  lib/append-system-retirement.test.mjs \
  lib/i18n/registry.test.mjs \
  lib/project-trust.test.mjs \
  lib/chat-only.test.mjs \
  lib/subagent-prompt.test.mjs \
  lib/subagents.test.mjs \
  lib/subagent-runtime.test.mjs \
  lib/rpc-manager.test.mjs
npm test
```

以上命令运行在隔离验证环境，而非真实用户 agent HOME。研究目录存放具体包装命令和实测结果。扫描 `AppendSystemConfig`、`/api/append-system`、`settings.appendSystem`、`.append-system-` 时分别检查生产引用、退役文档/测试和历史记录，不能把历史留痕误当实现残留。

## HTTP / 浏览器验收

- 桌面和移动设置均无入口；旧 localStorage section 恢复到 General，其他 selections 未丢失；Models 与无项目 MCP 正常打开。
- 打开/切换设置时网络不再请求 `/api/append-system`；隔离候选服务直接 GET/PUT 该路径不暴露编辑协议（正常情况下路由缺失为 404）。
- 保留 trust 和 Escape/focus 相关周边回归。不在真实 dev server 上进行配置写入测试。
- 可在任务 research 下保存针对本任务的 Playwright 脚本/截图；仅失败保留 trace，默认不录像。源码/SDK 单测与实际浏览器结果分开报告；不能以单测替代浏览器验收。

## 回滚点

- 若发现入口移除需要修改 SDK/会话注入/真实用户数据，暂停回规划；不扩大范围。
- 若 baseline 本身失败，先记为 baseline 问题并分析依赖来源，不静默修复无关问题。
- 仅还原本任务精确变更；禁止 `git reset --hard` 或批量删除其他任务临时目录/进程。

## 执行结果

- 实现与全范围检查完成；用户文件、原生 runtime owners、依赖与历史目录无改动。
- 干净锁一致树 baseline/candidate 三件套均通过；候选 2853/2853 单测、698 lint 文件且无诊断。
- HTTP 与 Chromium 桌面/移动/项目三场景通过；细节、harness 修正及未覆盖项见 `research/verification.md`。
- 规范退役状态与可执行边界已同步；用户于 2026-10-06 批准 batched commit plan，要求提交、归档、提 PR 并自动合并。归档和会话日志提交均在任务分支，先于 PR。
