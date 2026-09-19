# 独立检查报告

> 浏览器复核补充（2026-09-19）：见 [browser-check-report.md](./browser-check-report.md) 与 `browser-results.json`。真实浏览器已验证 AC7、AC8 浏览器面、AC10、AC11 卡片/菜单/Diff/双视口；AC6 背景通知仍未覆盖。最终门禁 1311/1311、tsc/lint 均退出 0。以下保留前轮报告原始证据，不以新浏览器结果覆盖其历史判断。

## 总结

**不能整体验收通过。** 已直接修复 8 类问题，最终 tsc/lint/1298 个单测全部通过；但已确认的索引死链和隔离 worktree 来源标识缺口仍需主会话处理。浏览器点击、移动端视觉与真实前后台 Agent 运行没有实测，不把数据脚本称作浏览器 E2E。

已读取 check.jsonl 全部引用、PRD/design/implement、三份研究和相关技能/规范。以 design §2.3 实施期修正为准，implement.md 的 preview-first 步骤已过时。

## 本轮修复

1. `lib/written-file-sources.ts`：禁止 preview-only 生成成功产物；details 存在但不可解析时不再回退文本；空 summaries 也权威；appliedFiles 回退过滤 preview 明确的 delete；同一 patch 中先 add/update 后 delete/move 时移除旧路径。preview 仅补成功文件的统计。
2. 同文件：仅从有 unified hunk 的 `details.patch` 计数，不把旧版带行号的 `diff` 或无法识别的 patch 伪造为 `+0/-0`。
3. `components/MessageView.tsx`：背景完成通知原先只展示文本，未消费 writtenFiles。现在严格匹配 `pi-web:subagent-notification` 后复用共享解码器和卡片，在通知自身下方展示，避免错误归属发起轮。
4. `hooks/useFileIndex.ts`：原实现 TTL 只在 mount/cwd 切换时检查，已挂载会话中新文件永远不更新。增加可见页面定时刷新与 visibilitychange 刷新，仍由现有缓存去重。
5. `lib/path-linkify.ts`、`lib/file-links.ts`：修复裸 basename 的 `:line:col` 被当协议拒绝、UNC 根大小写不一致及 cwd 为 `/` 时相对路径失效。
6. `components/MarkdownBody.tsx`：现有 markdown anchor 内的 inline code 不再生成嵌套 anchor。code renderer 从最近的索引 Context 读取；原 anchor 用 null Provider 隔离其后代，不增加 DOM wrapper。
7. `components/TurnWrittenFiles.tsx`：动作省略号原先写死 15px，改用对话字号 offset。
8. `lib/i18n/messages/en.ts`：计数改为 `Files: {count}`，消除 `1 files`，不改变三语占位符集合。

测试文件改动：`lib/written-file-sources.check.test.mjs`（新增 4 例）、`lib/path-linkify.test.mjs`（新增 2 例）、`components/MessageView.test.mjs`（新增通知卡片 1 例）、`components/MarkdownBody.test.mjs`（新增禁止嵌套 anchor 1 例）、`components/TurnWrittenFiles.test.mjs`（调整计数字面值，并在既有用例补单数断言）。

## 剩余已确认问题 / 建议

### P1：索引不能证明文件仍存在（AC8 严格语义不通过）

`app/api/file-index/route.ts:63-74` 使用 `git ls-files --cached --others --exclude-standard`，没有检查工作树文件存在性。独立临时 git 仓库复现：创建并 `git add gone.md` 后删掉磁盘文件，原命令仍返回 `gone.md\n`。`linkifyToken` 正确遵守索引，但因此仍把已删除文件链接化。

建议在索引生产边界排除不存在的文件，并补 route 回归测试；不要在每个渲染器追加 I/O 或重复判定。本轮未改变既有 API 的生产语义/性能策略。已有 markdown 显式链接按 AC9 保留原行为，不受新索引校验；不能声称所有显式链接也有存在性保证。

### P2：隔离 worktree 卡片缺少子会话来源

`WrittenFile` 没有 sourceSessionId，`OpenWrittenFileHandler` 仅允许 modeHint；`components/AppShell.tsx:1039-1041` 总是传选中的父 session id。与 design §6 的“以子 session sourceSessionId 打开”不符。普通父 cwd 的前台/背景快照已有链路，但隔离 worktree 不应视为已验收。建议扩展共享产物来源契约并贯穿卡片到现有打开回调，另测文件 API 授权。此项涉及公共契约，留主会话决定，而非静默扩充。

### 其他已知边界

- 跨工具调用先写后删/移走时，当前 turn 合并只收写入，不会撤销先前条目；历史产物也可能已不存在。卡片按设计不查索引，不能承诺“永远无死链”。本轮修复覆盖同一 apply_patch 的顺序操作，不伪称覆盖跨调用状态重放。
- 只有 appliedFiles 而完全无 operation/summaries/preview 时，按 design 的兼容回退无法辨认 delete；需要 producer 契约或更保守产品决策才能保证所有未知格式均不列删除文件。
- 索引 hook 的定时刷新新增了生命周期行为，已通过类型/lint，但未补浏览器 fake-timer/异步挂载测试。
- 两处计划偏离可接受：PathText 无 style/className 避免无谓 wrapper；onOpenFile 可选第二参数复用既有 Diff 通道，正是设计允许的方案。

## AC1–AC13

“通过”仅针对注明的代码/自动测试证据；未做浏览器操作的项目不冒充端到端通过。

| AC | 判定 | 证据与范围 |
|---|---|---|
| AC1 | 通过 | `lib/turn-written-files.test.mjs` 多文件 apply_patch/相对路径；真实会话脚本 24 个产物，其中 23 个 apply-patch-details |
| AC2 | 通过（已知结构契约内） | `written-file-sources.ts` summaries 优先；stale preview/部分失败/delete-only/空 summaries/同 patch 先写后删的测试；未知格式与跨调用删除限制见上 |
| AC3 | 通过 | 原 `lib/turn-written-files.test.mjs` diff 为 +120/-0，既有 15 例未改；全部通过 |
| AC4 | 通过（数据面） | Trellis-only 构造用例；真实会话 `merge-check.md` 来源 subagent-trellis；原 session 不是纯 Trellis：23 个其他产物来自父 apply_patch，不能误归因 |
| AC5 | 通过 | 不调用 decodeTools；40 条构造用例；脚本 1242→1929，最坏 4→27；`lib/trellis-subagent-records.ts` 无改动 |
| AC6 | 不通过（完整范围） | 普通前台 snapshot/runtime 单测通过；背景通知 SSR 新增回归通过。隔离 worktree 来源遗漏已确认；真实前后台生命周期点击未实测 |
| AC7 | 未覆盖（浏览器） | inline code SSR 链接与唯一补全通过，AppShell 打开链静态核对；未实际点击右栏 |
| AC8 | 不通过 | null/缺失/截断索引的纯函数用例通过，Context 可更新；但 git 索引含已删除受跟踪文件已实证，异步刷新未浏览器验证 |
| AC9 | 通过（代码/组件） | 原 markdown 链接断言未改；inline code/PathText 复用 shouldOpenLocalFileInApp；node 被删除；新增嵌套 anchor 回归。Ctrl/Cmd 的 helper 测试通过，未真人点击 |
| AC10 | 未覆盖（浏览器） | `MessageView.tsx` input/result/details 三处 PathText 接线；expanded 初值仍 false，pre 容器原样；展开后点击未实测 |
| AC11 | 通过（组件/样式） | 类型行/动作标签/未知数字不显示/仅全条目计数时合计；字号全部 offset；复制与 Diff 菜单实际交互、移动端视觉未实测 |
| AC12 | 通过（纯函数） | 唯一 basename、多义、truncated 降级、line suffix、Windows/UNC 测试通过。按 design 不实现上文目录推理，多个任务 prd.md 仍纯文本 |
| AC13 | 通过（当前依赖树门禁） | 最终三命令退出 0，1298/1298；基线依赖一致性证明仍有限，见下面 |

## 独立验证

- 两次实际执行 `verify-e2e.mjs`：333 toolCalls / 332 toolResults / **24 文件**；origin 为 apply-patch-details=23、subagent-trellis=1。
- 两次执行 `verify-ac5.mjs`：391 runs，336 个 >32；截断 1242，全量 1929；最坏 193 tools，4→27。
- focused（最后补同 patch 删除用例之前）：**119/119**，退出 0。最终新增用例已包含在全量 1298 中。
- `git diff --check`：退出 0。

最终门禁（最后一次源码修改之后）：

| 命令 | 退出码 | 结果 |
|---|---:|---|
| `node_modules/.bin/tsc --noEmit` | 0 | 0 诊断 |
| `npm run lint` | 0 | 0 errors / 0 warnings |
| `npm test` | 0 | 1298 tests / 1298 pass / 0 fail / 10 suites / 0 skipped |

日志：`/tmp/clickable-tsc.log`、`/tmp/clickable-lint.log`、`/tmp/clickable-tests.log`；这些是临时文件，本报告保存计数。

### 基线对照与可信度

- 交接 A/B/C 基线 **1282** 是任务给定，不是本轮重新运行的干净基线。
- D/E 报告 **1290** = 1282 + 8；本轮新增 **8** = sources.check 4 + path-linkify 2 + MessageView 1 + MarkdownBody 1，最终 **1298 = 1282 + 16**。
- 本轮第一次完整验证（最后补顺序 delete 用例之前）1297/1297；补 1 个后最终 1298/1298。开始修复前没有独立跑 1290，不把实施者声称视为独立复核。
- 本轮与 D/E 均使用 checkout 现有 node_modules，没有安装依赖，没有改变 package/lock/lint 配置。HEAD 测试文件 194，当前 197（新增 sources、path-linkify、sources.check 三文件）；A/B/C→D/E 无新增测试文件，本轮 +1 文件。
- 比较 `package-lock.json` 与 `node_modules/.package-lock.json`：共有包版本差异 0，锁中另有 100 条目不在 hidden lock（可能含平台可选包等，未逐条归因）。**这不是干净 npm ci 或依赖文件内容一致性的证明**。既有基线文档的“本任务范围不要求”不足以消除 quality-guidelines 的锁一致性要求；建议主会话在允许的隔离 checkout 做严格基线复核。

## 范围保护

未修改 `.pi/extensions/trellis`、`lib/trellis-subagent-records.ts`、`lib/git-changes.ts`、`lib/git-types.ts`、`components/FileExplorer.tsx` 或 `.trellis/spec/`；未安装依赖、未提交、未派发子代理。已有 `.pi/agents/*` 和另一个 task 目录的改动未触碰。稳定契约登记由主会话 Phase 3.3 处理。
