# 浏览器验证报告（2026-10-03）

候选 worktree：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-sync-20261003`（分支 `merge/upstream-20261003`，merge-in-progress，工作树无冲突标记）。
本报告只新增此文件，未改产品/测试/spec/AGENTS，未 `git add`/`commit`。

## 结论摘要

- **完整门禁 `npm run test:e2e`：PASS，exit 0**（2026-10-03 11:29–11:44，约 15.7 分钟）。
- **Settings › MCP 浏览器冒烟：PASS，exit 0**。主代理补跑独立脚本 `verify-settings.mjs`，1280px/390px 实际点击全局/项目列表、Code mode、Trust 与 Append instructions，确认提示转 active 且未保存草稿保留。

## 一、完整 e2e 门禁（已通过，可复现）

- 命令：`npm run test:e2e`（= `node e2e/run.mjs && node e2e/subagents.mjs`），candidate 根目录。
- 日志：`/var/tmp/pi-web-browser-run/full-e2e.log`（启动器 `/var/tmp/pi-web-browser-run/run-full-e2e.sh`）。
- 结果：`=== run-full-e2e exit=0 ===`；`PIPE_EXIT=0`。
- 关键点：上一轮失败项已修复并通过——
  - 1280px/390px 均 `PASS: ... AC6 MCP original labels/JSON and Code mode script/nested calls/offset typography`（不再依赖已删除的 `.tool-codemode-script .markdown-code-lang`，改用首个普通 `pre` 并逐字节校验 + 排版偏移断言）。
  - `FONT AC6 1280px` / `390px` 显示脚本 `[12,11.5,11,11] → [15,14.5,14,14]`，Code mode 排版随聊天字号偏移生效。
- run.mjs 全部子检查通过：bounded history/pagination、external append force 读、AC6 三项、file panel、extension dialogs、ask_user、session restore、chat appearance、minimap typography、touch enter；subagents.mjs 全部 744/1280/390 通过。
- 随机端口 `127.0.0.1:38153`，脚本自清理（server SIGTERM、agent 临时目录删除），未出现 `next build`/webpack。

## 二、安全环境（已确认）

- 独立干净根目录：`/var/tmp/pi-web-browser-run`（非嵌套 HOME）：
  - `HOME=/var/tmp/pi-web-browser-run/home`
  - `PI_CODING_AGENT_DIR=/var/tmp/pi-web-browser-run/agent`
  - `TMPDIR=/var/tmp/pi-web-browser-run/tmp`
  - `XDG_{STATE,CACHE,CONFIG,DATA}_HOME` 指向该根目录下子目录
  - 已 unset `PI_PROVIDER/PI_MODEL/PI_SESSION_ID/PI_SESSION_FILE/PI_REASONING_LEVEL`、`PI_WEB_HOSTNAME/PI_WEB_NO_OPEN/PI_WEB_PASSWORD`、常见 provider key。
- 浏览器：`PLAYWRIGHT_EXECUTABLE_PATH=/home/xupeng/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`，实测 `Google Chrome for Testing 153.0.8010.12`；candidate `playwright-core@1.63.0` 对应 revision 1243，匹配。
- 未发送任何模型消息、未做 OAuth、未连接外部服务。

## 三、候选自身服务/lock 处置

- 检查时**不存在** candidate 自己的 `next dev` 进程，也无 `.next/dev/lock`（`find`/`pgrep` 均无匹配；唯一同名 worktree 的 `next dev -p 30142` 属于 `upstream-pi-0991-20260930`，未触碰）。因此没有需要“优雅停止”的遗留服务。
- e2e 结束后同样无 lock 遗留。
- `AGENTS.md` 无 Next.js 生成的 `BEGIN:nextjs-agent-rules` 块（`grep` 未命中），`git status` 未出现工具注入内容。

## 四、Settings › MCP 冒烟（已由主代理补跑）

已在候选源码中确认冒烟所需的稳定 UI 契约（供后续脚本使用）：

- 打开 Settings：桌面 `getByRole("button",{name:"Settings",exact:true})`；移动端先点 `Show sidebar` 再点 `Settings`。
- 对话框：`role="dialog"`、`aria-label="Settings"`；移动端 section 用 `.settings-mobile-section-picker`（`<select>`，`max-width:640px` 时显示，桌面 tabs `display:none` 只在移动隐藏）。
- MCP 面板（`components/McpConfig.tsx`）：分组标签用 `skills.scope.global`="global" / `skills.scope.project`="project"（`mcpServerGroups` 在 `hasProject` 时返回 `["project","global"]`，空组显示 `mcp.group.empty`/`mcp.group.notListed`）；Code mode 行 `aria-label="Code mode: {state}"` 可点开 `McpCodemodeDetail`（Automatic / Always on）。
- 未信任提示：`mcp.trust.untrusted` + 按钮 `mcp.trust.trustButton`="Trust project…"；确认对话框 `role="dialog"`、标题 "Trust this project?"、确认按钮 `trust.trustProject`="Trust project"。
- Append 面板：tab 名 `settings.appendSystem`="Append instructions"；未信任提示 "…not trusted, so pi still reads the global file."，信任后 "A trusted project file at {path} overrides this global file."（`settings.appendSystemProjectOverrideActive`）。
- 修复链已实际点击验证：`cwd` 不变时先编辑未保存草稿，切到 MCP 信任该项目，再返回 Append，等待 `.append-system-override.is-active` 并逐字断言 textarea 草稿未变。两种宽度均通过，浏览器 `pageerror` 数为 0，无水平溢出。

执行与证据：

- 从候选根运行 `PLAYWRIGHT_EXECUTABLE_PATH=<已核实 Chromium> node .trellis/tasks/10-03-sync-upstream/research/verify-settings.mjs`，exit 0。
- 服务 `http://127.0.0.1:40951`；隔离 fixture `/var/tmp/pi-web-settings-smoke-HRgiSg`，独立 home/agent/tmp 子目录、Next 与 Chromium 的环境采用白名单。Playwright 父进程 TMPDIR 也指向该目录，避免 `/tmp` 用户配额。
- 所有全局/项目 MCP fixture 条目均 `enabled:false`；只读列表、项目 trust POST 和页面交互，不发模型请求，不测试实际外部连接。
- 日志 `settings-smoke-final.log`；截图同目录 `settings-mcp-{1280,390}.png`、`settings-append-trusted-{1280,390}.png`。
- 前两次 probe 分别因 Playwright 父进程使用满额 `/tmp`、脚本在列表与详情间使用歧义定位失败；均非产品失败。修改 smoke 的临时目录/定位后重跑通过，未改产品行为来迎合断言。
- 最终服务由脚本 SIGTERM 清理；Next 自动附加的 `.next/dev/dev/types/**/*.ts` tsconfig include 已去除，保持原编译门禁。期间读取正在生成的 validator 曾出现瞬时解析失败，服务停止后最终 tsc 退出码 0。

## 五、失败/风险

- 失败：无最终未解决的浏览器产品失败。旧 Code mode 高亮盒断言已按批准的上游普通输入框语义适配，保留字节/嵌套调用/字号断言；完整门禁复跑通过。
- 风险：`freshFolderTrustBreadth`/allowed-roots 依赖 session 列表扫描，fixture 项目必须落在 `listAllSessions` 可见 session 的 cwd 之下；信任 POST 会拒绝 `hasBusyRpcSessionForCwd` 的项目，故冒烟不得触发 prompt。
- 未验证：Settings 内 MCP 每种新增/导入/测试/OAuth 的真实浏览器组合、真实第三方 OAuth/模型、Safari/Windows。它们的本地 API/fixture 测试由完整 Node 门禁覆盖，不能等同真实外部服务或真机验收。
