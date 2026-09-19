# 真实浏览器复核（2026-09-19）

## 结论

AC7、AC8 浏览器面、AC10、AC11 卡片/动作/Diff/双视口检查通过；**AC6 背景通知浏览器面仍未覆盖**。没有发现需要修改产品代码的新 bug。本报告补充旧 `check-report.md`，不把旧报告中的全范围 AC6 问题自动改判通过。

新增可重复脚本：`e2e/clickable-file-paths.mjs`。执行 `node e2e/clickable-file-paths.mjs`，最终退出 **0**。机器可读断言见 `browser-results.json`，原始输出见 `browser-assertions.log`。截图路径均相对于本目录。

> **截图未纳入版本库**：下文引用的 7 张 `browser-*.png` 是本机验证产物，未提交；需要复核时在本机重跑 `node e2e/clickable-file-paths.mjs` 重新生成即可。报告与断言输出（JSON / log / 本文）已入库。

## 环境与真实数据

- 按要求先查 `30141`，无 listener；执行标准 `npm run dev` 后 Next 提示同 checkout 已有 PID 1533706（8505），新进程自行退出，未产生第二个 dev server。
- 既有服务仅绑定 `192.168.11.47:8505`，直接 API 请求返回 200，因此复用它，**没有停止、重启或更改该服务**。默认脚本地址与此一致，可用 `CLICKABLE_BASE` 覆盖。
- Playwright 默认寻找未安装的 revision 1243；显式使用已安装的 `chromium_headless_shell-1194/chrome-linux/headless_shell` 成功。脚本允许 `CLICKABLE_CHROMIUM` 覆盖，没有安装任何依赖或浏览器。
- 主数据是任务给定真实会话 `01a0b31b-c1c4-70fe-9c01-21d8ed51577c`。拦截 detail GET 仅把 `tail` 调为 API 已支持的 `1000`，返回真实服务响应，没有替换消息内容或修改 session 文件。
- `09-18-sync-upstream-post-v091` 目录已归档，旧全路径不在当前索引；因此 AC7 使用当前存在的 `lib/auth-throttle.ts`，不强迫已失效路径成为链接。
- Diff 使用另一真实历史会话 `01a040c0-9c31-767e-a1db-d15e640d0961` 的 `app/globals.css` 卡片，该文件当前有工作树差异。

## 逐条断言与证据

| 请求项 | 结果 | 浏览器断言与截图 |
|---|---|---|
| 1 / AC7 | PASS | `a.markdown-inline-code` 中 `lib/auth-throttle.ts` 真实点击后，`.file-viewer-path[title]` 精确后缀为 `/lib/auth-throttle.ts`，`.file-viewer-shell` 内容包含 `recordAuthFailure`。`browser-inline-open.png` |
| 2 / AC8 未就绪 | PASS | 用 Playwright 暂缓真实 `/api/file-index` 请求，已加载卡片时断言 inline-code anchor 数为 0；释放请求后等待 anchor 实际出现。`browser-index-loading.png` |
| 2 / AC8 索引外 | PASS | 正文 `/tmp/baseline-lint.txt` 是 `code`，无祖先 anchor，页面无对应 anchor；真实滚动到该节点截图。`browser-missing-plain.png` |
| 3 / AC10 | PASS | 展开 process 与 bash 工具，严格从 `pre[style*="max-height: 400px"] a`（结果容器，非 input pre）点击 `.pi/agents/trellis-check.md`；右栏 title 为完整对应绝对路径。`browser-tool-result-open.png` |
| 4 / AC11 卡片 | PASS | 真实 `prd.md` 卡片包含 `Document · MD`、`+6/-0`；点击 File actions 后有 Open preview / Open diff / Copy path 三按钮。`browser-cards-desktop.png` |
| 4 / AC11 Diff | PASS | 从另一个真实会话的 `app/globals.css` 卡片点击 Open diff，右栏 title 为该文件，Diff 按钮 `aria-pressed=true`。`browser-card-diff.png` |
| 5 / AC11 视觉 | PASS | 已实际读取 1280×800 与 390×844 截图：文件名、类型、数字与菜单均无可见重叠或异常字号；移动卡片 bbox `{x:16,y:363.6875,width:358,height:91.5}`，横向完全落在视口内，`scrollWidth <= clientWidth`。`browser-cards-desktop.png`、`browser-cards-mobile.png` |
| 6 / AC6 通知 | 未覆盖 | 主会话早于新增 writtenFiles producer，未找到可稳定使用的新格式背景通知；未启动 Agent、未伪造持久化通知。没有可声称为该断言证据的截图。 |

说明：给定会话当前加载的 `prd.md` 卡片实际为 `+6/-0`，并非数据脚本汇总的 `+81/-10`。本次验证的是实际可见回合的数字与结构，**未覆盖精确 +81/-10 那张历史卡片**，未改造历史数据来迎合预期。卡片中的 `/tmp/pi-web-merge-msg.txt` 仍可点击符合设计（卡片不做索引校验）；不能用它判断正文 AC8。

## 探索阶段失败及归因

1. 在 clean `package.json` 上点击 Open diff 后无 Diff 按钮。文件当前没有工作树差异，FileViewer 按既有 `gitDiffResolved && !hasGitDiff` 逻辑回退 Source；不能据此判定 modeHint 链路失效。改用真实有差异的 `app/globals.css` 后断言通过。
2. 两个候选历史会话当前加载上下文里没有目标卡片，定位超时。这是样本选择失败，不是已证实的功能缺陷。最终脚本选用确实含目标卡片的历史会话。
3. 初次实验在 URL 恢复尚未完成时 reload 导致样本不稳定；最终脚本等待真实卡片到达，不用固定 sleep 判断会话已加载。

未修复产品代码，未新增 Node 单测；新增的是上述 Playwright 真实浏览器回归脚本。

## 最终质量门与基线

在最后一次脚本变更之后执行：

| 命令 | 退出码 | 结果 / 对照 |
|---|---:|---|
| `node_modules/.bin/tsc --noEmit` | 0 | 0 诊断 |
| `npm run lint` | 0 | 0 errors / 0 warnings |
| `npm test` | 0 | 1311 tests / 1311 pass / 0 fail / 10 suites / 0 skipped；与交接基线 1311 相同，增减 0 |
| `git diff --check` | 0 | 无空白诊断 |

日志保存为 `browser-tsc.log`、`browser-lint.log`、`browser-unit-tests.log`。基线 1311 来自本轮交接；本轮在现有 checkout/node_modules 独立复跑确认同样数字，没有运行 install/ci，没有修改锁文件或 ESLint 配置。这不是隔离 npm ci 一致性证明，沿用旧报告的依赖树可信度限定。

## 范围保护与未覆盖

- 没有修改产品源码、任何 session 文件、`.pi/extensions/trellis`、被禁止的五个源码路径或 `.trellis/spec/`；没有 commit、build、子代理派发、模型调用。
- `AGENTS.md` 无新增 diff，既有服务保留原状。
- 未覆盖：AC6 真实前后台生命周期、精确历史 +81/-10 卡片、点击复制按钮读取剪贴板、Ctrl/Cmd 点击交互及字号滑块动态变化。菜单存在与当前双视口视觉已验证，不冒充这些额外行为也已测试。
