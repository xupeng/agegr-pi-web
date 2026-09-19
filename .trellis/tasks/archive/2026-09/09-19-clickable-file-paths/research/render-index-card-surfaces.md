# 研究：渲染层链接化 / 文件索引可用性 / 产物卡片改造面 / R6 编辑入口落点

任务：`.trellis/tasks/09-19-clickable-file-paths`
范围：PRD R3 / R4 / R5 / R6 / R7。所有结论均给出 `file:line` 锚点。本次只做研究，未改动任何源码。

---

## 0. 结论速览

- **能拿到索引**：`GET /api/file-index?cwd=` 返回 cwd 相对路径列表（`app/api/file-index/route.ts:117-165`），但**消息渲染链上目前完全没有索引**；唯一消费者是 `ChatInput`（`@` 补全）与 `FileExplorer`（搜索），且**没有共享 hook / context**（`components/ChatInput.tsx:707-733`、`components/FileExplorer.tsx:573`）。R3/R4/R7 需要新增一条「按 cwd 取索引并缓存」的通道。
- **inline code 已经能改造成链接**：`MarkdownBody` 是自定义 `components` 渲染（`components/MarkdownBody.tsx:22-93`），`code` 分支可返回 `<a>`；但 react-markdown v10 以 `passNode: true` 调用组件（`node_modules/react-markdown/lib/index.js:346-352`），当前 `code` 分支把 `node` 一起 spread 到 DOM 上（实测 SSR 输出 `node="[object Object]"`，见第 1.4 节）——**新写 `code` 分支必须像 `a` 一样先 `delete props.node`**。
- **纯文本路径（R3.3 / R4）没有现成链接化能力**：工具结果、过程详情、思考、大消息兜底都渲染成 `<pre>`（`components/MessageView.tsx:1140 / 1459 / 1705 / 159`），没有正则或组件可复用；需要新增「文本分段 + 路径判定 + 索引校验」的共享组件。工具结果默认折叠，只有展开 `ToolCallBlock` 才出现（`components/MessageView.tsx:1159-1172`）。
- **产物卡片**：`TurnWrittenFiles`（`components/TurnWrittenFiles.tsx:21-49`）+ `WrittenFile`（`lib/turn-written-files.ts:5-8`）是唯一改造点；打开动作已有两条可用通道——`onOpenFile(filePath)`（`AppShell.handleOpenLinkedFile`，`components/AppShell.tsx:1039-1041`）与 `modeHint:"diff"`（`components/AppShell.tsx:1018-1037`、`components/file-tab-state.ts:8-38`）。**「打开方式」菜单已有全部底层能力**（复制路径可用 `lib/clipboard.ts`，diff 用 `modeHint`）。
- **每文件 ± 统计不存在**：`getGitStatus` 把 `--numstat` **聚合为仓库/子树总量**（`lib/git-changes.ts:57-87`、`lib/git-changes.ts:129-140`），`GitFileStatus` 无 per-file 数字（`lib/git-types.ts:9-15`）。`FileExplorer` 拿到的也是聚总量（`components/FileExplorer.tsx:541 / 774-793 / 1011-1012`）。加字段是**纯增量、低风险**，但需要处理 rename/binary/untracked 三类 numstat 边界。
- **i18n 校验会强制三语同步**：`lib/i18n/registry.test.mjs:39-55` 断言 zh-CN/zh-TW 的 key 集合与占位符集合必须与 en 完全一致。新增任何 key 必须同时改 3 个文件。
- **R6 落点**：pi 的原生机制要求**项目级优先并覆盖全局**，且项目级需项目受信（`node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js:820-832`）。pi-web 普通会话不传 `appendSystemPrompt`，因此全局 `~/.pi/agent/APPEND_SYSTEM.md` 天然生效（`lib/rpc-manager.ts:2222-2240`）；chat-only 用 `appendSystemPromptOverride: () => []` 清空（`lib/chat-only.ts:6-18`），子代理显式传入自己的 append 数组（`lib/subagent-prompt.ts:19-25`）。**若只做「全局」方案，不需要改 `chat-only.ts` 与 `subagent-prompt.ts`**。

---

## 1. 渲染链路

### 1.1 `MarkdownBody`（`components/MarkdownBody.tsx`）

- 组件签名：`{ children, className, isStreaming, cwd, onOpenFile }`（`:11-16`）。
- `components` 用 `useMemo`，deps = `[cwd, isStreaming, onOpenFile]`（`:94`）。注意：**新增索引依赖必须进 deps**，否则索引到达后不会重渲染。
- `code` 分支（`:23-45`）：
  - block 判定：`className?.includes("language-") || raw.includes("\n")`（`:27`）。
  - block → `MermaidBlock` / `CodeBlock`（`:29-39`）；inline → `<code className="markdown-inline-code" {...props}>`（`:40-45`）。
  - **这里就是 R3.2 的落点**：inline 分支改为「先用索引校验 `raw` 是否为真实文件，是则渲染成链接/按钮」。
  - 当前 `...props` 里含 react-markdown 注入的 `node`（见 1.4），未 delete。
- `pre({ children }) => <>{children}</>`（`:46-48`）：因为 block `code` 自己渲染了容器，`pre` 被“透明化”。**inline code 不会经过 `pre`**。
- `a` 分支（`:50-77`）：已有 R3.1 能力。`resolveLocalFileHref(href, cwd)`（`:53`）→ `onOpenFile(filePath)`；`delete props.node`（`:52`）；`shouldOpenLocalFileInApp(event)` 决定是否 in-app 打开（`:64`）。
- `img` 分支（`:78-88`）：`resolveLocalFileHref` 后走 `/api/files/...?...type=read`。
- `ReactMarkdown` 装配：`remarkPlugins=markdownRemarkPlugins`、`rehypePlugins=markdownRehypePlugins`、`urlTransform={onOpenFile ? markdownUrlTransform : undefined}`（`:98-105`）。
- 另有两个使用点需要一起考虑（R3 一致性）：
  - `components/MessageView.tsx:941-943` `TextBlock` → `SafeMarkdownBody`；
  - `components/MessageView.tsx:514 / 520` 用户消息也用 `MarkdownBody`；
  - `components/FileViewer.tsx:1720-1755` **自己复制了一份 markdown 链接处理**（`markdownUrlTransform` + `resolveLocalFileHref` + `onOpenFile`），不走 `MarkdownBody`。

### 1.2 `lib/markdown.ts` 插件与 `urlTransform`

- `markdownUrlTransform(value)`：`/^file:/i` 原样放行，否则 `defaultUrlTransform`（`:22-24`）。
- remark 插件：`[remarkFrontmatter, ["yaml"]]`、`[remarkGfm, {singleTilde:false}]`、`remarkMath`（`:364-368`，preview 版 `:369-373`）。
- rehype 插件：`rehypeRaw` → `[rehypeSanitize, markdownSanitizeSchema]` → `[rehypeKatex, {throwOnError:false, strict:false}]`（`:375-379`，preview 版 `:381-385`）。
- **sanitize schema 会剥离未知标签/属性**（`markdownSanitizeSchema` 定义在 `:9-20`，`strip` 增加 `iframe/object/style/form`，`protocols.href` 增加 `file`）。含义：**不要用 rehype 插件往 HTML 里插 `<a>`**，会被 sanitize 清掉；R3 走 React `components.code` 覆盖更安全（在 sanitize 之后由 react-markdown 渲染组件）。
- `normalizeDisplayMath`（`:37-`）在渲染前预处理数学，不改路径。

### 1.3 `MessageView` 中工具结果 / 过程详情的渲染（R4 落点）

- `ToolCallBlock`（`components/MessageView.tsx:1066`）：
  - 结果文本拼装：`resultText`（`:1075-1077`），diff 提取 `getResultDiff(result)`（调用 `:1072`，定义 `:1396-1411`）。
  - 输入参数 `<pre>`（`:1140-1156`，展开时）。
  - 结果分支（`:1159-1172`）：有 diff → `PairedDiffResult`（`:1181-1195`）→ `SplitPatchView`（`:1196`）/ `PatchTextView`（`:1335`）；否则 `PairedResult`（定义 `:1413-1478`）。
  - `PairedResult` 的文本 `<pre>`：`:1459-1477`（**R4 的主要落点**）。
  - 展开状态 `const [expanded, setExpanded] = useState(false)`（`:1068`），结果区仅在 `expanded && result` 时渲染（`:1159`）。**折叠时看不到任何路径**，R4 的链接化只在展开后有意义。
- 过程详情 `CustomMessageView`（`:1565`）：`details` 被 `safeJson`（`:1752-1759`）后渲染进 `<pre>`（`:1705-1723`），展开开关 `detailsExpanded`（`:1569`）。这是「process details」的另一个 R4 落点（扩展/压缩等 custom message）。
- 大消息兜底 `SafeMarkdownBody` 也是 `<pre>`（`:159-172`），阈值为 `MAX_MARKDOWN_CHARS = 100_000`（`:116`、`:132`）。
- `ThinkingBlock` 内容也是纯文本/`whiteSpace:pre-wrap` 的 div（`:1035-1043`），不是 `<pre>` 但同理是纯文本。

### 1.4 react-markdown 版本与 `node` 传递（实测）

- `node_modules/react-markdown/package.json`：`10.1.0`。
- `node_modules/react-markdown/lib/index.js:346-352` 调用 `toJsxRuntime({ ..., passKeys: true, passNode: true })`。
- `node_modules/hast-util-to-jsx-runtime/lib/index.js:99 / 339-340`：`passNode` 为真时给自定义组件 props 注入 `node`。
- 实测（`renderToStaticMarkup(MarkdownBody)` 渲染 `` see `prd.md` ``）：
  ```
  <code class="markdown-inline-code" node="[object Object]">prd.md</code>
  ```
  即当前 inline code 已经带了一个无意义的 DOM 属性。**新增 `code` 分支时必须 `delete props.node`**（与 `a` 分支 `:52` 一致）。

### 1.5 `ChatWindow` 传给 `MessageView` 的 `cwd` 与 `toolResultsMap`

- `toolResultsMap`：`useMemo`，先塞 `activeToolResults`，再遍历已保存 `messages` 里的 `toolResult` 消息（`components/ChatWindow.tsx:729-737`）；注释说明其稳定身份是为了不破坏 `MessageView` 的 `memo`。
- `cwd`：`const messageCwd = session?.cwd ?? newSessionCwd ?? undefined`（`components/ChatWindow.tsx:757`），是**已选会话的 cwd，或新建会话的 cwd**。
- 逐条渲染：`renderMessage` → `<MessageView ... toolResults={toolResultsMap} cwd={messageCwd} onOpenFile={onOpenFile} writtenFiles={options.writtenFiles} .../>`（`components/ChatWindow.tsx:1074-1091`）。
- 本回合文件清单：把 `userIdx+1..finalAssistantIdx` 的 assistant blocks 拼成 `turnContent`，再 `extractTurnWrittenFiles(turnContent, toolResultsMap, messageCwd)`（`components/ChatWindow.tsx:1193-1204`），作为 `writtenFiles` 传给最终回复的那条 `MessageView`。
- 流式消息单独渲染（`components/ChatWindow.tsx:1228`），此时 `writtenFiles` 不传（流式期间卡片不显示）。
- `onOpenFile` 的来源：`AppShell` 传 `onOpenFile={handleOpenLinkedFile}`（`components/AppShell.tsx:2323`）。
- Props 类型：`components/ChatWindow.tsx:60` `onOpenFile?: (filePath: string) => void`。
- `MessageView` 的 props/比较器：`components/MessageView.tsx:203-231`、`:299-338`（比较器包含 `writtenFiles` 引用比较 `:336`）。

### 1.6 现有 R3.1 端到端链路（保持不回归）

`MarkdownBody` `<a>` → `resolveLocalFileHref`（`lib/file-links.ts:95-139`）→ `onOpenFile` → `AppShell.handleOpenLinkedFile`（`components/AppShell.tsx:1039-1041`）→ `handleOpenFile`（`:1018-1037`）→ `openFileTab`（`components/file-tab-state.ts:12-55`）→ 右栏 `FileViewer`（`:2449-2470`）。
`resolveLocalFilePath`（`lib/file-links.ts:141-167`）是「工具参数路径」版本（不解析 URL/`:line` 后缀语义），`turn-written-files.ts` 用它。

---

## 2. 文件索引可得性（R3 校验 / R7 补全）

### 2.1 API 形状

`app/api/file-index/route.ts`：

- 参数：`cwd`（必须是绝对路径，`:119-121`，否则 400）、可选 `q`（截断到 `MAX_QUERY_LENGTH=500`，`:123`）。
- 允许根校验：`getAllowedFileRoots()` + `isFilePathAllowed` / `isExistingFilePathAllowed`（`:125-141`），未授权 403。
- 无 `q` 响应：`{ files: string[]（相对 cwd、"/" 分隔、上限 MAX_FILES=5000）, truncated: boolean }`（`:161-164`；常量 `:27`，`truncated` 同时考虑 hard cap 与 MAX_FILES）。
- 有 `q` 响应：`{ matches: { path, isDir }[] }`，排序后取 `AT_RESULT_LIMIT=20`（`:157-159`；`lib/file-fuzzy.ts:118-136`）。
- 列表来源：`git ls-files --cached --others --exclude-standard -z`（`:62-78`，`GIT_HARD_CAP=200_000` `:29`），失败回退 `listWithWalk`（`:80-108`，`WALK_HARD_CAP=50_000` `:30`、`MAX_WALK_DEPTH=8`、忽略 `node_modules/.git/.next/...`）。
- 缓存：`globalThis.__piFileIndexCache`（`:53-59`），`CACHE_TTL_MS=10_000`（`:33`）、`CACHE_MAX_ENTRIES=20`（`:34`），过期即重建（`:143-152`）。
- 语义（`lib/file-fuzzy.ts:14-18`）：`FileIndexEntry.path` = 相对 cwd、`/` 分隔、无尾斜杠；`isDir` 由 `buildEntriesFromFiles` 从文件路径推导出目录条目（`:59-80`）。
- **索引只含文件与推导目录**；不含 gitignored 文件。已核对本仓库：`.trellis/` 未被忽略，`prd.md` 在 `git ls-files` 输出中；`research/*.md` 属 untracked 但未被忽略，所以会进索引（`.trellis/.gitignore` 只忽略 `.developer/.current-task/.runtime/.agents/...`）。

### 2.2 现有调用方与可复用性

- `ChatInput`（`components/ChatInput.tsx`）：
  - 状态：`fileIndex: { cwd, entries, truncated }`、`fileIndexLoading`、`atServerResult`（`:707-709`）；refs：`fileIndexMetaRef`（含 `fetchedAt`）、`fileIndexFetchingRef`（`:732-733`）。
  - 拉取：菜单打开时若同 cwd 且 `Date.now()-fetchedAt < 10_000` 则跳过（`:1298-1326`）；`truncated` 时再按 query 请求服务端（`:1260-1283`，150ms debounce）。
  - 本地匹配：`filterFileEntries(fileIndex.entries, atQueryText)`（`:1249-1253`）。
  - **这是一个组件内部实现，没有导出 hook，也没有模块级缓存**；`FileExplorer` 只能重新 `fetch`（`components/FileExplorer.tsx:573-574`）。
- `FileExplorer` 搜索：`/api/file-index?cwd=&q=`，只取 `matches` 中的 `!isDir`（`components/FileExplorer.tsx:561-585`）。
- `hooks/` 下没有 `useFileIndex`（`hooks/` 只有 `useAgentSession/useAudio/useChatAppearance/useDragDrop/useI18n/useIsMobile/useKeyboardShortcuts/useResizablePanel/useTheme/useViewportHeight`）。

### 2.3 在「消息渲染期」取得索引的可行方式

候选（研究结论，非设计定稿）：

1. **模块级缓存 + hook（推荐候选）**：新增 `hooks/useFileIndex.ts`，内部持有 `Map<cwd, {entries, truncated, fetchedAt}>`，用 `useSyncExternalStore` 或 `useState+useEffect` 暴露 `{ entries, ready }`；TTL 对齐服务端 10s（`app/api/file-index/route.ts:33`）。多个 `MarkdownBody` 同时挂载时由模块级 Map 去重，避免 N 次请求。可复用 `buildEntriesFromFiles`（`lib/file-fuzzy.ts:59`）。
2. **React Context**：在 `ChatWindow`（或 `AppShell`）包一层 `FileIndexProvider value={messageCwd}`，`MarkdownBody`/文本链接组件 `useContext` 读取。优点：一次请求、无 prop drilling；缺点：`MarkdownBody` 在 `FileViewer` 等处被复用，需要默认空 context 兜底。
3. **prop 下传**：`ChatWindow` 算好 `fileIndex` 后经 `MessageView` → `BlockView`/`TextBlock` → `MarkdownBody`，以及工具结果组件。改动面最大（`MessageView` 有十几层子组件），但依赖明确、便于 `memo` 比较。

共同约束：
- 索引是**异步**的；第一帧可能没有索引，之后到达必须触发重渲染（所以 `MarkdownBody` 的 `useMemo` deps 与 `MessageView` 的 `memo` 比较器都要覆盖新依赖）。
- 校验需要「候选路径 → cwd 相对路径」：可复用 `getRelativeFilePath(filePath, cwd)`（`lib/file-paths.ts:34-43`）；但**大小写/`..`/Windows 分隔符**不够鲁棒，`lib/file-links.ts` 的 `normalizeLocalPath`/`isPathInside`（`:38-71`）更完整，建议抽一个共享的「路径归一 + 索引命中」纯函数并加单测。
- R7 的唯一匹配补全：用索引中 basename 相同的文件集合。多义保守规则（研究建议）：仅当**唯一命中**时才补全/链接；否则保留纯文本（避免误链）。注意 `MAX_FILES=5000` 截断时（`truncated=true`）唯一性不可靠，建议在 `truncated` 时**不执行 R7 补全**（避免把「被截断掉的其他同名文件」误判为唯一）。

### 2.4 cwd 在三种场景下的取值来源

- **普通会话**：`session.cwd`（`components/ChatWindow.tsx:757`；`SessionInfo.cwd` 定义 `lib/types.ts:379`），来自 `.jsonl` 头部/`session-reader`（`lib/session-reader.ts:287`）。
- **worktree**：`session.cwd` 就是 worktree 路径（工作树自己的 cwd），`lib/worktree.ts` 用 `resolveProject`（`:90-129`）把它解析回主仓库 `projectRoot`（`lib/worktree.ts:20-29`，`SessionInfo.projectRoot` 见 `lib/types.ts:397-400`）。
  - 对 `/api/file-index` 而言传的是 `cwd`，`git ls-files` 在 worktree 里跑，返回的是 worktree 自己的相对路径——**与 worktree 内文件一致**，这部分没问题。
  - 风险：如果索引用 `projectRoot` 而非 `session.cwd` 去拉，worktree 文件会全部命中失败。**必须用会话自己的 `cwd`**（即 `messageCwd`）。
- **子代理**：
  - 内建 `Agent` 的结果 `details` 带 `sessionId`（`lib/subagent-extension.ts:20-33 / 89-99`），点「打开子会话」会切到子会话，此时 `messageCwd = 子会话.session.cwd`。
  - 子代理运行 cwd：`const childCwd = isolatedWorktree?.path ?? parent.cwd`（`lib/subagent-runtime.ts:153`），services 用 `childCwd`（`:183-184`），`SessionManager.create(childCwd, ...)` 在隔离时用 worktree path（`:218-220`）。因此**子会话的 cwd 就是文件真实写入位置**。
  - 风险：父会话的索引（cwd=parent.cwd）**不包含**隔离 worktree 里的产物；如果在父回合的产物卡片里对子代理路径做索引校验，会全部判为「不存在」。R2/R3/R7 对子代理产物要么放宽校验（只对「正文/结果文本」强制索引），要么对子代理产物单独以其 session cwd 取索引。
- `ChatWindow` 的 `newSessionCwd` 兜底与 `session?.cwd` 等价语义（`components/ChatWindow.tsx:757`）。

---

## 3. 产物卡片改造面（R5）

### 3.1 `TurnWrittenFiles` 现状

`components/TurnWrittenFiles.tsx`：

- Props `{ files: WrittenFile[]; onOpenFile? }`（`:12-15`），空数组返回 `null`（`:18`）。
- 容器 `aria-label={t("chat.filesWritten")}`（`:21`）；逐文件渲染 `<button title={filePath} aria-label={t("chat.openWrittenFile", { name })} onClick={() => onOpenFile?.(filePath)}>`（`:24-48`），内容 = `getFileIcon(name, 12)` + basename（`:41-46`），内联样式 chip（`background: var(--bg-subtle)`，圆角 6）。
- 无类型行、无 ±、无打开方式菜单。
- 测试 `components/TurnWrittenFiles.test.mjs`：
  - `renders a button per file showing the basename and full path`：断言 `<button`、basename、`title="<abs>"`（`:22-31`）。
  - `renders nothing when no files were written`：空数组 == `""`（`:33-35`）。
  - **冲突点**：升级成卡片后，若把 `<button title=...>` 改成 `<a>` 或移动 title/aria-label，这两个断言会失败，需要同步更新测试（或保留 `title` 与 `aria-label` 语义）。

### 3.2 `WrittenFile` / `extractTurnWrittenFiles`

- `interface WrittenFile { filePath: string }`（`lib/turn-written-files.ts:5-8`）——**目前只有一个字段**，卡片需要的 basename/type/± 都可在渲染期从 `filePath` 现算（`getFileName` `lib/file-paths.ts:20`、`getFileExt` `lib/file-types.ts:48`）。
- `extractTurnWrittenFiles(content, toolResults, cwd)`（`:30-59`）：只认 `isWriteToolName || isEditToolName`（`:11-13`）、要求结果已返回且非 error（`:49-51`）、用 `readToolPath`（`file_path ?? path`，`:19-23`）、`resolveLocalFilePath` 归一（`:56`）、去重保序。
- 单测 `lib/turn-written-files.test.mjs` 覆盖 15 个场景（`write/edit`、MCP 装饰名、error、streaming、去重、相对路径、Windows、特殊字符、text-only 不算写入）。**升级卡片不应改动这些语义**；R1（`apply_patch`）与 R2（子代理）会新增测试而不是改这些断言。

### 3.3 打开入口

- `FileViewer` props（`components/FileViewer.tsx:39-49`）：`filePath / cwd / sourceSessionId / onOpenFile / initialDisplayMode / initialState / onStateChange / watchEnabled / ...`。
- 读文件 URL：`getFileApiUrl`（`:211-224`，`/api/files/<encoded>?type=...`，带 `sessionId`）。
- `resolveInitialFileDisplayMode(initialState, initialDisplayMode)`（`lib/file-viewer-state.ts:8-14`）：`initialState?.displayMode ?? initialDisplayMode ?? "source"`；diff 模式标签 `:63-67`。所以 `modeHint:"diff"` 直接打开 Diff 视图。
- `AppShell.handleOpenFile` 签名（`components/AppShell.tsx:1018-1023`）：
  ```ts
  (filePath: string, fileName: string, options?: { sourceSessionId?: string | null; modeHint?: "diff" }) => void
  ```
  行为：`tabId = "file:"+filePath`，`setFileTabs(openFileTab(...))`、`setActiveFileTabId`、`setRightPanelOpen(true)`、移动端关抽屉（`:1024-1036`）。
- `openFileTab`（`components/file-tab-state.ts:12-55`）：已存在 tab 且无 `modeHint`/source 变化时**不重开**（`:24-30`），带 `modeHint` 时重置 `viewerState.displayMode` 并递增 `viewerRevision`（`:41-52`）。
- `handleOpenLinkedFile`（`components/AppShell.tsx:1039-1041`）只传 `sourceSessionId`，即「默认点击 = 右栏预览」已经成立。
- `FileExplorer` 的现成范例：`ChangeRow.onClick` → `onOpenFile(status.filePath, name, { modeHint: "diff" })`（`components/FileExplorer.tsx:484`）。
- 右栏状态管理：`fileTabs`/`activeFileTabId`/`rightPanelOpen`（`components/AppShell.tsx:479-486`、`:1144`、`:2455`）。
- **复制路径**：仓库有 `lib/clipboard.ts`（`copyText`，被 `MessageView` 复制按钮使用 `components/MessageView.tsx:736 / 8`），卡片菜单可直接复用。
- **无「在外部编辑器打开」「在文件树定位」**：`FileExplorer.expandedPaths` 是内部 `useState`（`components/FileExplorer.tsx:537`），无对外 reveal 接口 —— 与 PRD Out of Scope 一致。

### 3.4 相关 spec 原文要点

- `.trellis/spec/frontend/component-guidelines.md`、`hook-guidelines.md`、`state-management.md`：**目前全是 "(To be filled by the team)" 空模板**，没有任何强制约定；改造时以既有同类组件（`TurnWrittenFiles` / `FileExplorer.ChangeRow` / `ConfigPanelShell`）为准。
- `.trellis/spec/frontend/settings-dialog-mobile.md`（有实效内容）：设置弹窗小屏全屏（`≤640px`，`.settings-dialog-surface`）、浮层居中必须 `margin:auto` 而非 `align-items:center`、`position:absolute` 不受父 padding 影响需叠加 `env(safe-area-inset-top)`、滚动容器必须 `height:100%; min-height:0; overflow-y:auto`、对话区字号统一 `calc(Xpx + var(--chat-font-size-offset, 0px))`。**产物卡片属于对话区，字号若新增排版表面必须走该变量**（`settings-dialog-mobile.md` "对话区字号与内容宽度模式"节）。
- `.trellis/spec/frontend/index.md` / `quality-guidelines.md` / `type-safety.md` 建议在实现前一并扫一眼（本次未逐字引用）。

---

## 4. 每文件 ± 统计（R5 的 `+N/-M`）

### 4.1 `getGitStatus` 与 `--numstat` 解析细节

`lib/git-changes.ts`：

- `readTrackedLineStats(repositoryRoot, cwd)`（`:57-87`）：
  - `relativeCwd = toGitPath(path.relative(repositoryRoot, cwd))`，`pathspec = relativeCwd || "."`（`:61-62`）。
  - `git diff --no-color --no-ext-diff --numstat HEAD -- <pathspec>`（`:64-72`）。
  - 逐行 `line.split("\t", 2)` 取 `[added, deleted]`，`Number.isInteger` 才累加（`:75-82`）。**binary 的 `-` 会被 `Number` 成 `NaN` 而跳过**；rename 的行格式含 `old => new` / `{old => new}`，这里不解析路径所以当前无害，但**加 per-file map 时必须解析**。
  - `catch` 返回 `{0,0}`（`:84-86`）。
- `countUntrackedTextLines(filePath)`（`:89-101`）：untracked 文件单独按行数计新增（`TEXT_PREVIEW_MAX_BYTES` 上限、含 NUL 视为二进制）。
- `getGitStatus(cwd)`（`:102-141`）：
  - `findRepositoryRoot`（`:30-35`）→ 非 git 返回空（`:103-111`）。
  - `Promise.all([readStatusEntries, readTrackedLineStats])`（`:114-117`）。
  - `files` 由 porcelain 条目构建，过滤 `isWithinPath(cwd, filePath)`，附加 `classifyGitStatus` + `indexStatus/worktreeStatus`（`:118-128`）。**per-file `additions/deletions` 就在这里回填**。
  - 聚合返回 `additions = trackedLineStats.additions + untrackedAdditions`，`deletions = trackedLineStats.deletions`（`:129-140`）。
- porcelain 解析/分类：`lib/git-status.ts:13-37`（`-z`、rename 的 `originalPath`）、`:39-53`（`classifyGitStatus`）。

### 4.2 types 与影响面

`lib/git-types.ts`：

- `GitFileStatus`（`:9-15`）：`filePath/status/code/indexStatus/worktreeStatus` —— **无 ±**。
- `GitStatusResponse`（`:17-23`）：仓库级 `additions/deletions`。

把 per-file 加进 `GitFileStatus` 的影响面：

- `app/api/git/status/route.ts`：`GET` 直接 `NextResponse.json(await getGitStatus(cwd))`（`:31`），**无需改**，新字段自动下发。
- `components/FileExplorer.tsx`：
  - `fetchGitStatus` 类型 `Promise<GitStatusResponse>`（`:105-110`）。
  - `gitLineStats` 仍是聚合（`:541`、`:774-793`），渲染在变更面板头部 `+additions/-deletions`（`:998-1013`）。**加字段后可以顺带让 `ChangeRow`（`:468-505`）显示每文件 ±，但要区分「工作树状态」与「本轮 delta」的措辞（PRD R5 明确要求）**。
  - `GIT_STATUS_COLORS` 已有 `added:#4ade80 / deleted:#f87171` 可复用（`:121-128`）。
- `app/api/git/diff/route.ts`：走 `getGitFileDiff`（`:33`），与 `GitFileStatus` 无关，**不受影响**。
- 测试：
  - `lib/git-changes.test.mjs` 实际 import 的是 `./git-status.ts`（`:5-6`），只测 `parseGitPorcelainV1` 与 `classifyGitStatus`，**不测 `getGitStatus`/numstat**，加字段不回归。
  - 无其它测试断言 `GitStatusResponse` 形状（grep `GitStatus|git/status|numstat` 只命中 `lib/git-changes.test.mjs` 与 `lib/patch.test.mjs` 的无关用例）。
  - **建议新增** `lib/git-changes.test.mjs`（或新文件）对 numstat 行解析做纯函数单测：`12\t3\tpath`、binary `-\t-\tpath`、rename `12\t3\t{old => new}/x` / `old => new`。

### 4.3 实现建议（研究结论）

- 新增一个**纯函数** `parseNumstat(output): Map<string, {additions,deletions}>`（key 用 git 相对路径，rename 需要同时映射 old/new 或统一到 new path），`readTrackedLineStats` 返回 `{ totals, byPath }`。
- 在 `getGitStatus` 的 `files.flatMap` 里用 `toGitPath(path.relative(repositoryRoot, filePath))` 查表回填。
- untracked 的 `countUntrackedTextLines` 已经 per-file 可得（`:129-132`），可直接填 `additions`、`deletions=0`。
- **必须遵守 PRD R5**：UI 上标注该数字是 git 工作树累计（可能包含别人/上一轮的改动），不是本轮 delta。

---

## 5. i18n

- 结构：`lib/i18n/messages/{en,zh-CN,zh-TW}.ts`，每个导出 `LocalePlugin`（`lib/i18n/types.ts:8-16`），`messages: Record<string,string>`；`Locale = "en"|"zh-CN"|"zh-TW"`（`types.ts:2`）。
- 现有相关 key（`lib/i18n/messages/en.ts`）：
  - `"chat.filesWritten": "Files changed"`（`:371`）
  - `"chat.openWrittenFile": "Open {name}"`（`:372`）
  - `"files.changedCount"/"files.changeStats"`（`:346-347`）
  - 三语对应：`zh-CN.ts:371-372`、`zh-TW.ts:371-372`，以及 `:347` 的 `changeStats`。
- 使用点：仅 `components/TurnWrittenFiles.tsx:21 / 29`（`aria-label`/`title`）。无别处消费。
- 校验测试 `lib/i18n/registry.test.mjs`：
  - `:39-55`：`built-in locale packages have the complete English key and required placeholder sets` —— 断言非 en 语言的 **key 集合完全等于 en**，且每个 key 的 `{placeholder}` 集合一致，唯一豁免表 `optionalPlaceholders = { "files.conflictSummary": ["countSuffix"] }`（`:44`）。
  - 含义：**新增 key 必须三语同时加**；占位符不能少也不能多（除非加进豁免表）。
- 其它测试：`lib/i18n/format.test.mjs`（插值/回退）、`components/SettingsPanel.test.mjs:73-74 / 133-136`（用正则从 en/zh 源码里找特定文案）。R5 新增文案若进了 `settings.*` 命名空间，注意别踩 `SettingsPanel.test.mjs` 的源码正则（它只断言已列出的几项，新增不受影响）。
- 建议新增 key 命名（参考既有）：`chat.writtenFilesTitle`、`chat.fileType.*`（或用 `getFileExt` + 大写）、`chat.copyPath`、`chat.openInDiff`、`chat.worktreeStatsHint` 等，并保持 3 语。

---

## 6. R6：提示词层落点

### 6.1 pi 原生 `APPEND_SYSTEM.md` 语义（node_modules 锚点）

- 接口：`ResourceLoader.getAppendSystemPrompt(): string[]` / `getAppendSystemPromptSources(): {path}[]`（`node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.d.ts:39-47`）。
- 加载逻辑：`DefaultResourceLoader.load()` 在未显式传 `appendSystemPrompt` 时调用 `discoverAppendSystemPromptFile()`，把结果作为唯一 append source 读取（`.../dist/core/resource-loader.js:386-398`）；显式传入 `appendSystemPrompt` 时**不再发现文件**（`:386` 的 `if (!appendSources)`）。
- 发现逻辑（`.../dist/core/resource-loader.js:820-832`）：
  ```
  projectPath = <cwd>/.pi/APPEND_SYSTEM.md
  if (settingsManager.isProjectTrusted() && existsSync(projectPath)) return projectPath
  globalPath = <agentDir>/APPEND_SYSTEM.md
  if (existsSync(globalPath)) return globalPath
  return undefined
  ```
  → **项目级优先并“覆盖”全局**（只返回一个路径，不是叠加）。
- 项目受信依据：`APPEND_SYSTEM.md` 属于需要信任的项目资源（`.../dist/core/trust-manager.js:5-15` 的 `TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES`）。
- `CONFIG_DIR_NAME` 即 `.pi`（`.../dist/config.js` 导出；`.../dist/index.d.ts:2`）。
- 本机现状（PRD 已述）：`~/.pi/agent/APPEND_SYSTEM.md` 已存在且在用（当前内容为「始终使用中文回答…」）。

### 6.2 pi-web 侧 append 的处理位置（证明「仅全局」方案无需改这些文件）

- **普通会话**：`lib/rpc-manager.ts:2222-2240` 的 `resourceLoaderOptions` 在非 subagent、非 chatOnly 分支**不设置 `appendSystemPrompt`** → 走 discover → 全局文件生效。
- **chat-only**：`lib/chat-only.ts:6-18` 的 `CHAT_ONLY_RESOURCE_LOADER_OPTIONS` 含 `appendSystemPrompt: [" "]` + `appendSystemPromptOverride: () => []`（`:15-17`），**清空所有 append**；被 `lib/rpc-manager.ts:2237-2238` 使用。单测 `lib/chat-only.test.mjs:17` 断言 override 返回 `[]`。→ R6 只做全局时，chat-only 继续不生效，**无需改**。
- **子代理**：`lib/subagent-prompt.ts:19-25` 显式构造 `appendSystemPrompt = [profileSystemPrompt, inheritedParentContext]`，由 `lib/subagent-runtime.ts:200` / `lib/rpc-manager.ts:2235` 传入，覆盖 discover。→ 全局文件天然不生效，**无需改**。
- 因此「仅全局」方案的真实改动面 = 一个读写 `~/.pi/agent/APPEND_SYSTEM.md` 的 API + 一个设置 UI；**不触碰 chat-only / subagent-prompt**。若将来扩展到项目级/生效范围，才需要动这两处。

### 6.3 pi-web 现有设置类模态/路由的实现模式（作为参照）

- **设置面板本体**：`components/SettingsPanel.tsx`：
  - section 列表 `sections`（`:520-`），tab 渲染（`:586-603`），`sectionHost(id, content)` 惰性挂载 + `hidden` 切换（`:553-562`），各 section 内容（`:610-614`）。
  - 新增 section 需同时改 `lib/settings-navigation.ts:1-6` 的 `SETTINGS_SECTION_VALUES` 与 `SettingsSectionIcon`（`components/SettingsPanel.tsx:46-63`）。
  - 注意：`components/SettingsPanel.test.mjs` 用源码正则断言 tab/sidebar 行为（`:15-24`），新增 section 不应破坏这些断言。
- **弹窗外壳/控件**：`components/SettingsUi.tsx` 的 `ConfigPanelShell`（`:19-69`，`is-embedded` vs `is-modal`，移动端 CSS 见 3.4）、`ConfigButton`（`:189-210`）、`ConfigSwitch`（`:212-229`）、`ConfigField` / `ConfigDetail` / `ConfigFooter` 等。
- **API 路由模式**（两种可选）：
  - 「JSON 配置 + 私有原子写」：`app/api/subagents/settings/route.ts`（GET/PUT，`isApiRequestAllowed` + `hasJsonContentType` 校验，`:24-57`）+ `lib/subagent-settings.ts`（`mkdirSync` + `writePrivateFileAtomicSync`，`:64-91`）。
  - 「整文件读写」：`app/api/models-config/route.ts`（`:1-15`，GET/PUT 直接 `readModelsConfig/writeModelsConfig`）+ `lib/models-config-store.ts`（import `writePrivateFileAtomicSync`，`:1-6`，`getModelsConfigPath()` `:60`）。
  - 开关类：`app/api/tools/settings/route.ts`（GET/PUT，`:1-49`）。
- **原子私有写工具**：`lib/atomic-file.ts:9-33` `writePrivateFileAtomicSync(path, contents)` —— 要求**调用方先建父目录**（注释 `:6-8`）；`mode 0o600`、临时文件 `wx`、`renameSync` 原子替换、finally 清理。R6 写 `APPEND_SYSTEM.md` 应直接复用（`await mkdirSync(dirname(path),{recursive:true})` + 该函数）。
- `getAgentDir()` 从 `@earendil-works/pi-coding-agent` 根导出（`.../dist/index.d.ts:2`）；pi-web 已在多处使用（`app/api/project-trust/route.ts:4`、`app/api/models/route.ts:3`、`lib/subagent-settings.ts:3` 等）。
- **项目级信任判断**可复用 `getProjectTrustStatus(cwd, agentDir)`（`lib/project-trust.ts:4-13`），与 pi 的 `isProjectTrusted()` 语义对齐——如果 Q2 选择「含项目级」，需用它来显示「项目覆盖全局」的来源与受信状态。
- 现有仓库**没有任何 APPEND_SYSTEM 相关 UI/读取代码**（grep `APPEND_SYSTEM` 无命中；只有散落的 `appendSystemPrompt` 结构体字段如 `app/api/sessions/runtime-route.test.mjs:248`），所以 R6 是纯新增。

---

## 7. 改造点清单（按 PRD R 编号）

| # | 改造点 | 主要文件 | 既有能力复用 |
|---|---|---|---|
| R3.1 | 保持 markdown 链接不回归 | `components/MarkdownBody.tsx:50-77`、`lib/file-links.ts:95` | 现有 |
| R3.2 | inline code 路径→链接 | `components/MarkdownBody.tsx:23-45`（`code` 分支） + 索引通道 | `getFileName/getFileExt/getRelativeFilePath`、`resolveLocalFilePath` |
| R3.3 | 裸文本路径→链接 | 新增共享 `PathText`（`MarkdownBody` 的 `p/li/td` 等需覆盖，或后处理 text 节点） | 无（需自建判定 + 索引校验） |
| R3/R4 | 索引获取与缓存 | 新增 `hooks/useFileIndex.ts`（或 context） | `/api/file-index`、`buildEntriesFromFiles` |
| R4 | 工具结果/过程详情路径 | `components/MessageView.tsx:1140 / 1459 / 1705 / 1335`（`<pre>` 分段） | 新增 `PathText` 组件 |
| R5 | 产物卡片升级 | `components/TurnWrittenFiles.tsx`、`lib/turn-written-files.ts` | `getFileIcon/getFileExt`、`onOpenFile`、`modeHint:"diff"`、`copyText` |
| R5 | per-file ± | `lib/git-changes.ts:51-145`、`lib/git-types.ts:9-15`、`components/FileExplorer.tsx`（可选） | `--numstat` 已在跑 |
| R6 | 提示词编辑入口 | 新 API + `components/SettingsPanel.tsx` section 或独立 modal | `writePrivateFileAtomicSync`、`getAgentDir`、`ConfigPanelShell` |
| R7 | `prd.md` 唯一匹配补全 | 与 R3.2 共用索引 | `filterFileEntries` 思路（basename 匹配需另写） |

## 8. 风险清单

1. **索引可能不包含目标文件**：`git ls-files`/walk 会跳过 gitignored 与超过 `MAX_FILES=5000`（`truncated`）的文件。若目标目录被 ignore，R3.2/R3.3/R7 会静默不链接——符合 AC6「无死链」，但会与用户预期冲突。需要在实现里对 `truncated` 做降级（见 2.3）。
2. **子代理隔离 worktree 的产物不在父会话索引里**（`lib/subagent-runtime.ts:153` + `:218-220`）。R2 清单与 R3/R7 校验要分开处理。
3. **大小写/分隔符/`..` 归一**：`getRelativeFilePath`（`lib/file-paths.ts:34-43`）不做大小写折叠，Windows 上可能误判；应复用 `lib/file-links.ts:38-71` 的归一逻辑并抽纯函数。
4. **react-markdown `node` 注入**：新 `code` 分支不 `delete props.node` 会污染 DOM（实测见 1.4）。
5. **`MarkdownBody`/`MessageView` 的 memo 依赖**：索引异步到达，若不加进 `components` 的 `useMemo` deps（`components/MarkdownBody.tsx:94`）与 `MessageView` 比较器（`:318-337`），链接不会出现。
6. **工具结果默认折叠**（`components/MessageView.tsx:1068 / 1158`）：R4 只在展开后可见；若期望「默认就能点」，需要改默认展开策略（可能影响滚动/性能，慎改）。
7. **per-file numstat 的 rename/binary**：`--numstat` 行路径字段含 `{old => new}` / `old => new`，binary 为 `-`；不做专门解析会产生错 key 或 NaN。`git diff HEAD` 默认开启 rename detection（仓库 `LC_ALL:"C"` 在 `lib/git-changes.ts:26`）。
8. **`+N/-M` 语义误读**（PRD R5 明确）：数字是工作树相对 HEAD 的累计，不是本轮 delta。UI 必须标注。
9. **i18n key 三语强校验**（`lib/i18n/registry.test.mjs:39-55`）：漏一个语言即测试失败。
10. **R6 只做全局时，chat-only 与子代理不生效**（`lib/chat-only.ts:17`、`lib/subagent-prompt.ts:19-25`）：需要在 UI 文案里写清生效范围，否则用户会以为子代理也遵守。
11. **R6 项目级若纳入**：项目级覆盖全局（`resource-loader.js:820-832`），且需要项目受信；编辑入口必须显示「来源」与受信状态，否则会与 pi 的 `SYSTEM.md`（替换基础提示）语义混淆。
12. **CSS 字号规范**：卡片/链接新增对话区排版表面必须用 `calc(Xpx + var(--chat-font-size-offset, 0px))`（`.trellis/spec/frontend/settings-dialog-mobile.md`）。

## 9. 与既有测试的冲突点 / 需同步更新的测试

- `components/TurnWrittenFiles.test.mjs:22-31`：断言 `<button>`、basename、`title="<abs>"`。卡片化若换标签/属性需同步更新。
- `components/MessageView.test.mjs:33-36`：`MessageView.compare` 对 `writtenFiles` 引用敏感；只要保持「引用变化即重渲」即可，不受字段扩展影响，但若把比较器改成按内容比较则需调整。
- `components/MessageView.test.mjs:161-208`：断言工具调用渲染（绿色边框、`Agent/Explore`、`aria-label="Open sub-agent session"`），R4 改 `<pre>` 为分段渲染时**不要破坏这段结构**。
- `components/MarkdownBody.test.mjs:34-53`：断言本地文件 markdown 链接仍留在 app（无 `target/rel`）；R3.2 不要影响 `a` 分支，否则回归。
- `lib/turn-written-files.test.mjs`：15 个用例，R1/R2 只应新增，不应改动既有断言。
- `lib/file-links.test.mjs`：`shouldOpenLocalFileInApp` 行为（含 Cmd/Ctrl 点击），R3.2/R3.3 的新链接必须继续走它。
- `lib/i18n/registry.test.mjs:39-55`：新增 key 必须三语齐备。
- `components/SettingsPanel.test.mjs`：源码正则断言设置面板结构与文案；新增 R6 section 前先读该文件避免踩中。
- `lib/git-changes.test.mjs`：目前只测 `git-status.ts`，per-file numstat 需要新增覆盖（不冲突）。
- 运行命令：`node --experimental-strip-types --test "app/**/*.test.mjs" "components/**/*.test.mjs" "hooks/**/*.test.mjs" "lib/**/*.test.mjs"`（`package.json` `scripts.test`），以及 `node_modules/.bin/tsc --noEmit`、`npm run lint`。

---

## 10. 证据附录（本次实测）

- 会话 `~/.pi/agent/sessions/--home-xupeng-dev-personal-forked-agegr-pi-web--/2026-09-18T06-02-15-877Z_01a0b31b-c1c4-70fe-9c01-21d8ed51577c.jsonl`：工具计数 `bash 270 / apply_patch 41 / read 11 / ask_user 9 / trellis_subagent 2`；`apply_patch` 结果文本形如 `update: /abs/x.md`、`add: /abs/y.md`、失败时 `Invalid patch format: ...`。
- `trellis_subagent` 结果：`content[].text` 为终稿（含 `` `.trellis/tasks/.../research/merge-check.md` ``），`details.kind === "trellis-subagent-progress"`，`details.runs[].tools[]` 每项含 `{id,name,args,status,startedAt,finishedAt}`（`args` 是 JSON 字符串），另有 `finalText`。解码器见 `lib/trellis-subagent-records.ts:63-71 / 251-320`。
- `git diff --numstat HEAD -- .` 实测输出 `13\t5\t.pi/agents/trellis-check.md`（制表符分隔，第三列路径）。
- `.trellis/tasks/09-19-clickable-file-paths/prd.md` 在 `git ls-files --cached --others --exclude-standard` 输出中，`git check-ignore` exit=1（未被忽略）。
