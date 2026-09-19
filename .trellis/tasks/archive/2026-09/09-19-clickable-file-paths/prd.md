# 回复中的文件路径可点击并在右栏打开（含子代理产物）

## Goal

Agent 产出文档后，用户应当能**直接在回复里点击该文档**并在右栏打开预览，无需去左侧 FileExplorer 逐级翻找。

对齐 Codex 的观感：正文里有内联链接（「可先查看 🌐本地页头预览。」），回复下方有结构化产物区（文件卡片 + `Open in` 动作 / `Edited N files` 汇总）。

用户实测痛点场景（trellis）：Phase 1 规划结束后，回复只写「产出在 `.trellis/tasks/09-18-xxx/`」加一张表格（`prd.md` / `design.md` / `implement.md` / `research/*.md`），这些路径既不可点，回复下方也没有任何文件列表，只能手动去 explorer 找。

## Background

### 现状链路（已存在的能力）

- 渲染层：`components/MarkdownBody.tsx:52` 的 `<a>` 经 `resolveLocalFileHref(href, cwd)`（`lib/file-links.ts:118`）解析 → `onOpenFile` → `AppShell.handleOpenLinkedFile`（`components/AppShell.tsx:1039`）→ `handleOpenFile`（`components/AppShell.tsx:1018`）在右栏 `FileViewer` 打开。**只对真正的 markdown 链接生效**；inline code 与裸文本一律不处理。
- 回复下方文件条：`lib/turn-written-files.ts:30` `extractTurnWrittenFiles()` 收集本轮 `write`/`edit` 工具调用写出的文件，由 `components/TurnWrittenFiles.tsx` 渲染成可点击 chips（i18n `chat.filesWritten` =「改动的文件」），挂载点 `components/MessageView.tsx:872`。
- 文件索引：`GET /api/file-index?cwd=` 无 `q` 时返回 **cwd 相对路径**列表（`lib/file-fuzzy.ts:20` 的 `FileIndexEntry.path`，上限 `MAX_FILES = 5000`，服务端有索引缓存）。`components/ChatInput.tsx:1309`（@ 补全）与 `components/FileExplorer.tsx:573` 已在消费它。

### 为什么现在不work（两个互相独立的根因）

**根因 A：`apply_patch` 不在识别范围内，导致原地写入也检测不到。**

`lib/tool-names.ts:9-27` 的 `isWriteToolName()` / `isEditToolName()` 只认 `write`/`edit` 及其 MCP 装饰形式（`write_*`、`*.write`、`str_replace*` 等），**不认 `apply_patch`**；而本仓库 `AGENTS.md` 明确要求「Use apply_patch for file edits」。实测 session `$SESS/2026-09-18T06-02-15-877Z_01a0b31b-...jsonl`（`$SESS` = 本仓库 session 目录）：`apply_patch` 41 次、`write`/`edit` 0 次。

`apply_patch` 是外部扩展 `pi-apply-patch@0.1.2` 注册的工具（pi 0.85.1 的 dist 内无任何实现，来源见 `~/.pi/agent/settings.json` 的 `packages`），因此它的形态必须按扩展契约处理（证据见 `research/tool-path-extraction.md` F1–F7）：

- 入参是 **`input`**（整段 patch 文本），没有 `path`/`file_path` ⇒ 现有 `readToolPath` 永远读不到路径。
- 成功结果文本每 hunk 一行：`add: ` / `update: ` / `delete: ` / `move: <old> -> <new>`；**路径是 patch 原文，可能相对**（实测 282 绝对 / 23 相对）。
- **部分失败时文本只列失败行（`- <path> (<op>): <msg>`），已成功文件只在 `details.result.appliedFiles` / `details.result.summaries` 里** ⇒ 只解析文本会漏文件。
- `details.preview.files[]` 提供每文件 `{filePath, operation, added, removed, movePath?}`（`added`/`removed` 是该 patch 的净增删），是**真正的「本轮 ±」**。

**根因 B：子代理写入的文件对父回合完全不可见。**

同一 session 中文件全部由 2 次 `trellis_subagent` 调用写入。`extractTurnWrittenFiles()` 只扫描父会话 assistant 自己的 `toolCall` 块（`lib/turn-written-files.ts:30-62`），`Agent`/`trellis_subagent` 调用本身不是写入工具，于是明细为空。

- `trellis_subagent`：`details.kind === "trellis-subagent-progress"`，`details.runs[].tools[]` 的 `write`/`edit` 条目携带 `{"path": "..."}`（真实样本：`path = .trellis/tasks/09-18-.../research/merge-check.md`，相对路径）。**陷阱**：客户端解码器 `lib/trellis-subagent-records.ts:20,276-282` 只保留每个 run 最后 **32** 条工具轨迹，全机实测 1897 条路径被截到 1220（丢 36%，117 个 run 丢路径）⇒ 不能复用 `TrellisSubagentRecord.tools`。
- 内建 `Agent`（`lib/subagent-extension.ts:20-32,89-101`）：`content[].text` 只有终稿，`details` 只有元数据（含子会话 `sessionId`）。写入发生在子会话里（实测 61 个已结束 run 中 40 个有写入：551 `edit` + 129 `write`）。按 `sessionId` 回读有硬伤：`GET /api/sessions/[id]` 默认只取**最后 50 entry**（`app/api/sessions/[id]/route.ts:41-43`），40 个有写入的子会话里 39 个只部分命中。

**根因 B 的推荐解法**：在子代理**完成时**用已在内存的 `wrapper.inner.sessionManager.getEntries()`（`lib/subagent-runtime.ts:531` 已在用）快照写入清单进 `details`（纯增量可选字段），一次覆盖实时/历史/前台/背景，零额外 I/O、零新路由、无 `tail` 截断。

### 其他相关事实

- pi-web **没有**任何「Open in 外部编辑器 / 在系统里打开」能力（全仓 grep `open in` / `vscode` / `reveal` 无命中）。既有等价动作只有右栏 `FileViewer`，另有 `FileExplorer` 的 diff 模式（`components/FileExplorer.tsx:484` `modeHint: "diff"`）。
- 每文件增删统计的**两种语义不可混用**：`lib/git-changes.ts:57-87` 的 `--numstat` 被聚合成仓库级总量（`GitStatusResponse.additions/deletions`，`lib/git-types.ts:17-23`），`GitFileStatus` 无 per-file 数字，且它表达的是 **git 工作树相对 HEAD 的累计**（含他人/上一轮改动），不是本轮 delta；而 `apply_patch` 的 `details.preview.files[].added/removed` 是本轮 delta。**本任务采用后者（见 D5），因此不修改 `lib/git-changes.ts` / `GitFileStatus` / `FileExplorer`。**
- 当前 chips 只在存在 `write`/`edit` 且结果已返回且非 error 时出现（流式期间不显示）。
- **原 R6（提示词层引导）已迁出为独立任务** `.trellis/tasks/09-19-append-system-editor`：pi 原生已有 `APPEND_SYSTEM.md` 机制（`discoverAppendSystemPromptFile()`，项目级 `<cwd>/.pi/APPEND_SYSTEM.md` 需受信且覆盖全局 `~/.pi/agent/APPEND_SYSTEM.md`；本机全局文件已存在且在用），R6 因此是「给已生效文件加编辑入口」的独立设置面，与对话渲染无耦合，独立验收更清晰。决策 D6 记录其范围选择。
- 「在文件树中定位」当前不存在：`FileExplorer` 的 `expandedPaths` 是内部 `useState`（`components/FileExplorer.tsx:537`），无对外 reveal/展开祖先/滚动定位接口。
- 工具结果文本以纯 `<pre>` 渲染（`components/MessageView.tsx:1459-1477`），既不是 markdown 也不是 `AnsiText`；要把路径变成链接必须在 `<pre>` 内做分段渲染。工具结果**默认折叠**（`components/MessageView.tsx:1068,1158`），R4 只在展开后可见。
- 渲染层的两个硬约束：react-markdown 10.1.0 以 `passNode: true` 给自定义组件注入 `node`（`node_modules/react-markdown/lib/index.js:346-352`），新分支必须 `delete props.node`；`lib/markdown.ts:9-20` 的 sanitize schema 会剥离 rehype 插入的标签 ⇒ 链接化必须走 React 组件覆盖，不能用 rehype 插件。
- 消息渲染链上**目前没有文件索引**：`ChatInput`（自带 TTL 缓存，`components/ChatInput.tsx:707-733,1298-1326`）与 `FileExplorer`（`components/FileExplorer.tsx:573`）各自 fetch，无共享 hook/context，`hooks/` 下也没有 `useFileIndex`。

## Requirements

### R1 写入工具识别补全（根因 A）

本轮文件清单必须识别 `apply_patch`，并支持**一次调用产出多个文件**。要求：

- 新增独立谓词（不改 `isEditToolName` 语义，因为它还被 `components/MessageView.tsx:1071,1140` 用来隐藏 tool input `<pre>`，改它会顺带隐藏 patch 正文）。
- 路径来源优先级：`details.result.appliedFiles` / `details.preview.files[]`（结构化、含成功文件与 `operation`）→ 仅当 `details` 缺失时回退结果文本行 `^(add|update|move): `。
- `delete` 的文件不是「可打开的产物」，必须排除；`move` 取目标路径。
- 禁止从 patch 正文（`*** Add File:` 等头部）反推文件——部分失败时它不等于实际写入的文件。
- 相对路径必须用 cwd 解析（实测存在相对路径）。

### R2 子代理产物纳入本轮文件清单（根因 B）

父回合里的子代理调用，其**实际写入的文件**必须进入本轮文件清单。至少覆盖：

- `trellis_subagent`（trellis 场景主干）：从 `details.runs[].tools[]` 提取 `write`/`edit` 且 `status === "succeeded"` 的 `path`/`file_path`。必须**绕开**客户端解码器的「末 32 条」截断（另写不截断的提取，不改 `decodeTools` 的展示上限，以免改变既有面板行为与断言）。
- `runs[].finalText` **不用于生成本轮文件清单**（它混有 `:行号`、命令片段、`import.meta`、gitignored 产物等不可靠形态）；终稿里提到的真实路径由 R3 的渲染层链接化负责可点。
- 内建 `Agent`：在子代理**完成时**把子会话的写入明细快照进 `details`（新增可选字段，向后兼容），覆盖前台与背景（背景的完成 details 落在 `pi-web:subagent-notification` 的 `custom_message`，归属通知所在轮）。
- 不被 `tail=50` 的会话回读所限（不采用「渲染期回读子会话」作为主路径）。

### R3 正文路径链接化

回复正文中的文件路径必须可点击并在右栏打开，覆盖三种形态：

1. 已是 markdown 链接（现有能力，保持不回归）；
2. **inline code 中的路径**（trellis 场景的主要形态，如 `` `prd.md` ``、`` `.trellis/tasks/09-18-xxx/design.md` ``）；
3. 裸文本路径。

判定「可点」必须经 `/api/file-index` 索引校验：**只有索引中真实存在的文件才变成链接**，避免死链。toolResult 与 process 详情中的路径同样适用（与 R4 合并实现）。

### R4 工具结果中的路径链接化

工具结果 / 过程详情（process details）中出现的文件路径也可点击打开。

### R5 产物呈现升级

回复下方的文件呈现从「chips」升级为 Codex 风格的**增强卡片**（已决策，见决策记录 D1）：

- 卡片内容：文件图标 + 文件名 + 类型行（如 `Document · MD`，由扩展名推导）+ 每文件 `+N/-M`。
- `+N/-M` 只取**本轮**可得的增删（`apply_patch` 的 `details.preview.files[]`，`edit` 的 `details.patch` 计数）；本轮数字不可得时**不显示数字**，而不是回退到语义不同的 git 工作树累计值（见 D5）。
- 卡片提供动作：默认点击 = 右栏 `FileViewer` 预览；次级动作（复制路径 / 以 Diff 打开）见 design.md。
- 不做 Codex 的 `Undo` / `Review`（见 Out of Scope）。

### R6 提示词层引导（已迁出）

已迁至独立任务 `.trellis/tasks/09-19-append-system-editor`（pi-web 设置里编辑 `~/.pi/agent/APPEND_SYSTEM.md`，仅全局、沿用 pi 原生生效范围）。本任务不再包含 R6 的任何实现或验收项，只保留 R3/R4 的渲染层兜底——即使提示词层不生效，正文与工具结果中的真实路径依然可点。

### R7 相对文件名补全

像 `prd.md` 这种只有文件名、目录在上文出现的路径，用索引做唯一匹配补全（同名唯一命中时补全为完整相对路径；多义时保守处理，具体规则见 design.md）。

## Acceptance Criteria

- [ ] AC1（R1）一轮中只有 `apply_patch` 写入时，回复下方也能列出这些文件（含一次调用写多个文件、含相对路径）。
- [ ] AC2（R1）`apply_patch` 部分失败时，**成功文件仍被列出、失败文件不被列出**；`delete` 的文件不出现。
- [ ] AC3（R1）`write`/`edit` 的现有行为与既有单测（`lib/turn-written-files.test.mjs` 全部用例）不回归。
- [ ] AC4（R2）trellis Phase 1 场景复现：只有 `trellis_subagent` 调用的回合，能列出子代理写入的 `prd.md` / `design.md` / `implement.md` / `research/*.md`。
- [ ] AC5（R2）一个 run 的工具轨迹超过 32 条时**不丢文件**（构造超过 32 条的用例，验证不经过 `decodeTools` 截断）。
- [ ] AC6（R2）内建 `Agent` 写入的文件同样能被列出（前台）；背景子代理的产物在其完成通知所在轮列出。
- [ ] AC7（R3）正文里的 `` `prd.md` `` 这类 inline code 路径可点击，点击后右栏打开正确文件。
- [ ] AC8（R3）**索引中不存在的路径不得变成链接**（不产生死链）；索引未就绪时不得误链接，索引到达后链接出现。
- [ ] AC9（R3）已是 markdown 链接的行为不回归（含 Ctrl/Cmd+点击），且 inline code 链接同样走 `shouldOpenLocalFileInApp`。
- [ ] AC10（R4）工具结果中的路径展开后可点击打开。
- [ ] AC11（R5）产物卡片具备类型行与动作入口，`+N/-M` 只在本轮数字可得时显示；视觉符合对话区规范（字号用 `--chat-font-size-offset`）。
- [ ] AC12（R7）`prd.md` 在上文已声明目录的唯一匹配场景下可正确补全并打开；同名多义或索引被截断时保持纯文本。
- [ ] AC13 类型检查（`node_modules/.bin/tsc --noEmit`）、lint（`npm run lint`）、全量单测（`npm test`）退出码 0，且诊断/计数与基线逐项对照记录在 `research/`。

## Out of Scope

- Codex 的 `Undo` / `Review` 回退本轮改动能力（决策 D1：用户确认不含）：需要在会话层保存可回放的文件快照才能真撤销本轮改动，还要处理与 git 工作树、其他会话改动的冲突，是独立任务。
- 「在外部编辑器中打开」：pi-web 无此能力，本次不新增。
- 「在文件树中定位」：`FileExplorer` 无 reveal 接口，属新增能力，本次不纳入（如需可另开任务）。
- R6 提示词层引导：已迁出为独立任务 `.trellis/tasks/09-19-append-system-editor`。
- 修改 `lib/git-changes.ts` / `GitFileStatus` / `FileExplorer` 以提供 per-file git numstat：本任务不为「±」引入与工作树语义耦合的第二套来源（见 D5）。
- `FileViewer` 自己那份重复的 markdown 链接处理（`components/FileViewer.tsx:1720-1755`）：不在本次统一范围内。
- 为 subagent 工具结果之外的历史会话做回溯重算：本次只保证新渲染逻辑对未来与已加载会话一致生效。

## 决策记录

- D1 产物呈现档位：**① 增强卡片**（类型行 + 打开方式菜单 + 每文件 `±` 统计），**不含** Undo/Review。
- D2 链接化判定：用原生能力强制的 `/api/file-index` **索引校验**，只有索引中真实存在的文件才可点（不允许「形状像路径就链接」）。
- D3 相对文件名（如 `prd.md`）：用索引做**唯一匹配补全**；多义时的保守规则在 design.md 定稿。
- D4 子能力范围：A 渲染层链接化、B 子代理产物、D 工具结果路径纳入本任务；C（提示词层）迁出（见 D6）。
- D5 「±」语义：**只显示本轮可得的增删**（`apply_patch` 的 `details.preview.files[]`、`edit` 的 `details.patch` 计数），不可得时不显示；**不**引入 git 工作树累计值作回退，避免同一卡片出现两种语义。此项为 Phase 1 研究后**修正**的方案（用户批准的原始选项文案写的是「来自 git 工作树并加标注」；研究证明本轮数字真实可得且语义更正确，故改采本轮数字，并在最终规划摘要中提请确认）。
- D6 R6 范围与归属：**仅全局** `~/.pi/agent/APPEND_SYSTEM.md`，沿用 pi 原生生效范围（chat-only 与子代理不生效，UI 需注明）；实现与验收迁至独立任务 `.trellis/tasks/09-19-append-system-editor`。

## Notes

- 本次避免引入「扫描正文即认定文件被写入」的语义：R3/R4 只解决「可点击」，文件清单仍以工具调用/工具结果为准（与 `lib/turn-written-files.ts` 现有注释的立场一致）。
- 渲染层对子代理**隔离 worktree** 的产物有一个已知边界：父会话的索引按父 `cwd` 取，隔离 worktree 里的文件不在其中（`lib/subagent-runtime.ts:153,218-220`）。子会话自己打开时用子会话 cwd，正常可点；在父回合的产物卡片里这些条目允许不受索引校验（它们由工具调用证明存在），细则见 design.md。
- 全部实现证据与锚点见 `research/tool-path-extraction.md`、`research/subagent-file-extraction.md`、`research/render-index-card-surfaces.md`。
