# Append instructions 退役验收

日期：2026-10-06。功能工作在 `remove-append-instructions`，base 为 `personal@06a80df`。
实现子代理：`01a11022-db3c-753b-a8de-d7cbd5dc6b3b`；全范围检查子代理：`01a11028-390d-753b-a8de-d7ce220a87f4`。

## 依赖树与候选来源

- 独立 worktree：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/append-instructions-validation-20261006`。
- 安装：该 worktree 的 `06a80df` 上执行一次干净 `npm ci --include=dev`，906 packages，退出 0；没有复制或链接原开发 checkout 的 node_modules。
- baseline 为 `06a80df`；同一 worktree/依赖树 checkout 无 ref 的候选快照 `2d201669587daf8981de8c63ed0b9c5d7f9ab65a`，tree `8b5169c8ac3e094ca458ae86407d55d697d8b30f`。快照由独立临时 index 精确收集本任务 23 个代码/测试/文档路径产生，未修改主 index。
- Node `v24.21.0`、npm `11.19.0`、Pi SDK `1.0.0`。两轮 package-lock SHA-256 均为 `18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f`。
- 安装报告已有 17 vulnerabilities（6 low/4 moderate/7 high）；未在本任务修改依赖或执行 audit fix。
- 最终 spec 的验收/隔离说明补充发生在候选 gate 之后，仅文档不同，产品与测试树没有后续修改；最终 `git diff --check` 通过，六个变更文档的 Markdown 本地链接检查无新增悬空链接。浏览器运行后在候选树再次执行 tsc，退出 0。

## 三件套（源码/SDK/运行时单测，不是浏览器证据）

复算入口：`research/run-verification.mjs`。命令：

```sh
PI_VALIDATION_TMP_BASE=/var/tmp ~/.pi/agent/bin/pi-tmp-run --keep-on-failure append-retirement-baseline -- \
  node .trellis/tasks/10-06-remove-append-instructions/research/run-verification.mjs baseline \
  ../agegr-pi-web-worktrees/append-instructions-validation-20261006
# 候选使用相同命令，stage 改为 candidate。
```

| 门禁 | baseline | candidate |
|---|---|---|
| `tsc --noEmit --incremental false` | exit 0 | exit 0 |
| `npm run lint -- --format=json` | 703 文件，0 error/0 warning，exit 0 | 698 文件，0 error/0 warning，exit 0 |
| `npm test` | 2870/2870，0 fail/skip/cancel，exit 0 | 2853/2853，0 fail/skip/cancel，exit 0 |

计数归因：删除编辑器 8、API 6、helper/原生旧测试 9、SettingsPanel 专属 trust 测试 1，共 24；新退役测试 6（4 个 SDK 原生态 + 2 个残留断言），导航回归新增 1，共 7。`2870 - 24 + 7 = 2853`。六个文件删除、新增一个测试文件，lint `703 - 6 + 1 = 698`。

原生回归真实调用 SDK loader，不复刻加载规则：缺失文件、全局文件、未受信项目读取全局、受信项目覆盖全局。断言 resolver trust true/false、来源路径及未选中文件内容不变。关闭无关 context/skills/extensions/prompts/themes，未提供 append override。

全量测试涵盖现有 project-trust、chat-only、subagent prompt/runtime/snapshot 与 rpc-manager 回归。检查子代理另外实测局部六文件 62/62、targeted ESLint 和 diff-check；这些局部结果不替代上述三件套。

日志与机读计数：`research/verification/{baseline,candidate}.json`；lint 摘要为 `*-lint.log`，原始 tsc/test 输出以 `*-{tsc,test}.log.gz` 无损压缩保留（`gzip -n`，内容未改写），解压即可核对。Node 失败输出含空白缩进，因此归档为压缩证据而非修改原始输出；最终 staged diff-check 无需放宽 whitespace 规则。

## 验证 harness 的修正（无产品修改）

- 首次 baseline 将 HOME 指向缓存内 fixture，却把 fixture TMPDIR 留在真实 HOME 下面。SDK 扫描所有祖先 `.agents/skills`，把真实用户 skills 作为项目祖先资源，产生 23 个 trust 相关失败；全局 `PI_OFFLINE=1` 又阻断 4 个 plugin-update mock 测试，首次共 27 fail。
- 保留首次日志为 `baseline-harness-first*`，没有把它报作产品基线，也没有修复无关产品代码。改为显式在磁盘 `/var/tmp` 下创建唯一自有 fixture TMPDIR/HOME/agentDir，避免任何真实 HOME 祖先技能树。全量测试删除全局 PI_OFFLINE；各离线 fixture 自行配置。相同 baseline/ref/lock 此后 2870/2870。
- 使用 `/var/tmp` 是祖先资源隔离所需的明确主磁盘落点，不是回退 `/tmp`；pi-tmp-run 仍包裹有限验证命令。输出证据持久化至本 research；所有成功的外部 fixture 当轮删除。
- 浏览器两次启动错误来自已安装 Chromium revision 的目录/文件名变化；核对磁盘后使用 `chrome-headless-shell-linux64/chrome-headless-shell`。首次真实 browser 误断言 Models 请求 `/api/models`；实际 owner 是 `/api/models-config`，修正 harness 并等待真实 200 响应。原始报告/log 保留为 `first/second-launch-*`、`first-browser-*`。
- Next 在进程组停止后曾留下本任务自己的 lock。核对记录 PID 已不存在、端口无 listener 后只移除该 lock；runner 此后只对自己的 port/PID 执行同样清理。不重启或操作其他服务。

## 实际 HTTP 与 Chromium

入口：`research/browser-retirement.mjs`；独立候选 checkout 的 `next dev`，未在开发目录运行 build，也未争用主目录的 `.next/dev/lock`。服务 HOME/agentDir/TMPDIR 全隔离，设置 API 只读；唯一 PUT 是已经退役的路径，返回 404，明确断言没有创建 APPEND_SYSTEM.md。

```sh
PI_VALIDATION_TMP_BASE=/var/tmp \
E2E_CHROMIUM_EXECUTABLE=/home/xupeng/.local/share/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell \
~/.pi/agent/bin/pi-tmp-run --keep-on-failure append-retirement-browser -- \
  node .trellis/tasks/10-06-remove-append-instructions/research/browser-retirement.mjs \
  ../agegr-pi-web-worktrees/append-instructions-validation-20261006
```

- GET `/api/append-system` → 404；PUT 同路径 → 404。
- Chromium 1280×800 无项目、390×844 无项目、1280×800 有项目三场景均通过。
- 六个现行 section，桌面 tabs 与移动 options 无退休入口/编辑控件。
- 旧 localStorage section 回退 General，Models/MCP remembered selections 在回退写入后保留。
- Models `/api/models-config`、MCP `/api/mcp` 实际响应 200；无 cwd 的 MCP 可打开并在关闭/重开后恢复。
- visited General 在切 pane 后仍挂载但隐藏；Escape/close 正常，桌面焦点归还 Settings opener。
- 所有场景旧 API request 数均为 0，pageerror 为空。脚本没有发送 prompt、重建会话或执行 MCP/模型配置写入。
- 机读报告及六张最终截图：`research/verification/browser/report.json`、`*-general.png`、`*-mcp.png`。实际服务 PID/port 在 `server-metadata.json`，日志在 `server.log`；脚本收尾停止其进程组并清理 fixture。

## 保护与文档核对

- SDK/rpc-manager/chat-only/subagent-runtime/subagent-prompt/project-trust/subagents/demo snapshot owner、package/lock 全部无 diff；用户文件不参与本任务的读写/删除/迁移。
- 三语各精确删除 21 个专属 key。生产递归残留断言包括组件/API/DTO/旧section/helper/CSS/key；允许退休测试/spec/ADR与历史留痕。
- AGENTS file map、目录树、索引更新；spec/ADR明确 Retired，原生加载行为保留，另一份 `0005` ADR 与 archive/journal 未动。
- 最终 spec 写入退役后 signatures、API/导航/原生四态矩阵、wrong/correct 和隔离 gotcha；历史编辑契约不是现行接口。

## 未覆盖项

未运行 Safari/iOS 16.2、Windows、完整 `npm run test:e2e`；未在浏览器执行 trust decision 或 reload/config 写入。这些边界仅有全量单测/源码保留证据，不能宣称相应浏览器/平台验证通过。

## 清理

所有本任务浏览器服务已停止（runner `serverStopped: true`），进程检查无任务 dev server；外部 `/var/tmp` fixture 及遗留空 home 外壳已按确切自有路径删除。五个本任务失败 cache wrapper 已删除，成功 wrapper 当轮自动清理；会话 TMPDIR 从 24 MiB 降到 5.3 MiB，没有宽泛清理其他会话缓存。

validation worktree 在确认 `git status --short` 干净后通过 `git worktree remove` 移除，完整安装树与 `.next` 不再保留。原有四个其他任务 worktree 未动；证据/截图/复算脚本唯一正式副本保留于本 research（日志压缩后约 0.6 MiB），随任务交付。

## 交付授权

用户于 2026-10-06 批准此前展示的 work → spec → task artifacts → archive → journal 提交顺序，并要求提 PR、自动合并。目标锁定 `github.com/xupeng/agegr-pi-web`，base `personal`，head `remove-append-instructions`；`for-sync` 只作为来源对照，不是 PR 目标。提交前再次核对产品与测试内容和成功候选快照完全一致（含新测试 blob），复用上述验证；仅后续 spec/任务交付说明有文档差异。

仓库原生 `allow_auto_merge` 为 false；不修改仓库级设置，创建 ready PR 后等待 GitHub checks/e2e，再合并经过检查的确切 head。远程结果以最终 PR 状态为准。
