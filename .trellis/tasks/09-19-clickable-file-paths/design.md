# 设计：回复中的文件路径可点击 + 产物卡片

对应 `prd.md` 的 R1–R5、R7（R6 已迁出）。全部事实依据见 `research/` 三份报告；本文只写设计方案与取舍。

---

## 1. 架构与边界

四个层次，彼此只通过纯函数与一个共享索引通道耦合：

```
① 提取层（纯函数，无 React）
   lib/written-file-sources.ts   从 details / 结果文本 / 工具入参 提取「写入文件」
   lib/turn-written-files.ts     编排：遍历一轮的 toolCall + toolResult → WrittenFile[]
   lib/subagent-runtime.ts（服务端）子代理完成时快照进 details.writtenFiles

② 索引层（一个共享通道）
   hooks/useFileIndex.ts         按 cwd 取 /api/file-index，模块级缓存 + useSyncExternalStore
   lib/path-linkify.ts（纯）     候选 token → 索引命中判定；buildFileIndexLookup()

③ 渲染层
   components/FileIndexContext.tsx   ChatWindow 提供索引，深层组件消费
   components/PathText.tsx           纯文本 → 分段（文本/链接），用于 <pre> 与 markdown 文本节点
   components/MarkdownBody.tsx       inline code 与文本节点链接化（R3）
   components/MessageView.tsx        工具结果 / process details 的 <pre> 改用 PathText（R4）

④ 呈现层
   components/TurnWrittenFiles.tsx   chips → 增强卡片（R5）
```

**明确不做的事**（与 PRD Out of Scope 一致）：不改 `lib/git-changes.ts` / `GitFileStatus` / `FileExplorer`；不做 `Undo`/`Review`；不做「在文件树中定位」；不改 `lib/trellis-subagent-records.ts` 的展示上限（36% 截断只在**新的提取函数**里绕开）；不改 `.pi/extensions/trellis`（producer 契约见 `.trellis/spec/frontend/trellis-subagent-records.md`）。

---

## 2. 提取层（R1、R2）

### 2.1 工具谓词

`lib/tool-names.ts` **新增** `isApplyPatchToolName(name)`（`apply_patch` / `*_apply_patch` / `*.apply_patch`，小写比较）。

> 不把 `apply_patch` 加进 `isEditToolName`：该谓词还有第二个消费方 `components/MessageView.tsx:1071,1140`，用它决定是否隐藏 tool input `<pre>`；改它会顺带隐藏 patch 正文（研究 F11）。

### 2.2 契约：`WrittenFile`

```ts
export type WrittenFileOperation = "add" | "update" | "move" | "write" | "edit";

export interface WrittenFile {
  /** 解析后的绝对路径（无 cwd 时相对路径直接丢弃） */
  filePath: string;
  operation?: WrittenFileOperation;
  /** 仅当来源能给出「本轮」增删时才有值（apply_patch 的 preview、edit 的 patch） */
  added?: number;
  removed?: number;
  /** 来源标记，仅用于调试与测试断言 */
  origin?: "tool-input" | "apply-patch-details" | "apply-patch-text" | "subagent-trellis" | "subagent-snapshot";
}
```

既有消费方只读 `filePath`（`components/TurnWrittenFiles.tsx`），新增字段向后兼容；`lib/turn-written-files.test.mjs` 现有 15 个用例的断言全部保持成立（AC3）。

### 2.3 各来源的取值规则（`lib/written-file-sources.ts`）

所有 `details` 是 `unknown`，一律走运行时守卫（`isRecord` 模式，参照 `lib/trellis-subagent-records.ts`），禁止直接 cast。

| 工具 | 来源 | 规则 | origin |
|---|---|---|---|
| `write` / `edit` | toolCall 入参 | `input.file_path ?? input.path`（现状不变） | `tool-input` |
| `apply_patch` | `details.result.summaries` **优先** | 逐行解析 `add:` / `update:` / `move: <old> -> <new>`（自带 `operation`、天然排除 delete）；`preview.files[]` **仅用于补 `added`/`removed`**（按 `filePath` 关联） | `apply-patch-details` |
| `apply_patch` | `details.result.appliedFiles` | 仅在 `summaries` 缺失时兜底（无 `operation`/数字）；若 `summaries` 非空但全是 `delete`，返回 `[]` 而**不**回退到 `appliedFiles`（后者含 delete 目标） | `apply-patch-details` |
| `apply_patch` | 结果文本回退 | 仅当 `details` 缺失：逐行匹配 `^(add|update): (.+)$` 与 `^move: (.+) -> (.+)$`；**不匹配** `delete:`，**不匹配** 失败行 `- <path> (<op>): <msg>` | `apply-patch-text` |

> **实现期修正（阶段 A 发现，已核实源码）**：`preview` **不能**当首选路径来源。它由 `createPendingPatchUpdate(ctx.cwd, input, initialProgress, undefined, parsedHunks)` 在**应用之前**用解析出的**全部** hunk 构建（`/home/xupeng/dev/personal/pi-extensions/pi-apply-patch/src/index.ts:1432,1441,1490`），因此部分失败时 `preview.files[]` 会包含**失败**的文件。正确规则是「`result.summaries` 提供成功的文件清单与 operation，`preview` 只提供该文件的 `added/removed`」。已落单测：`a stale preview cannot resurrect a file whose hunk failed`。
| `trellis_subagent` | `details.runs[].tools[]`（**全量，不经 `decodeTools`**） | `name` 命中 `isWriteToolName`/`isEditToolName` 且 `status === "succeeded"` → `JSON.parse(args)` 取 `path ?? file_path`；`JSON.parse` 失败跳过该条 | `subagent-trellis` |
| `Agent` | `details.writtenFiles`（**本次新增的可选字段**） | 直接取，已是绝对路径 | `subagent-snapshot` |

**明确排除**：

- 不用 `trellis_subagent` 的 `finalText` 生成清单（它混有 `:行号`、命令片段、`import.meta`、gitignored 产物；清单坚持「以工具调用为准」，与 `lib/turn-written-files.ts` 既有注释立场一致）。这些正文路径由 R3 负责可点。
- 不解析 patch 正文头部（`*** Add File:` 等）——部分失败时它不等于实际写入的文件。

### 2.4 多文件与去重

现有实现是「一个 toolCall → 一个文件」。改为「toolCall → `WrittenFile[]` → flatten」，再跨调用按 `filePath` 去重，**保留首次出现顺序**（沿用现有语义）。同一路径第二次出现时，若首次没有 `added`/`removed` 而本次有，则补齐数字（不改变顺序）。

### 2.5 服务端快照（内建 `Agent` 的 R2 主路径）

- 提取函数：`extractWrittenFilesFromEntries(entries, cwd)`，输入是子会话 entry 数组，内部复用 2.3 的规则（先扫 assistant 的 toolCall 建 `toolCallId → {name, input}`，再扫 `toolResult` 配对）。
- 接入点：`lib/subagent-runtime.ts` 子代理完成分支（该文件 `:531` 已在用 `wrapper.inner.sessionManager.getEntries()`）。用 `childCwd`（`isolatedWorktree?.path ?? parent.cwd`，`:153,218-220`）作为解析基准——它就是文件真实写入位置。
- 契约：`lib/subagents.ts` 的 `SubagentRunInfo` 增加可选 `writtenFiles?: WrittenFile[]`；`lib/subagent-extension.ts` 的 `SubagentToolDetails` 增加可选 `writtenFiles?: { filePath, operation?, added?, removed? }[]`，由 `subagentToolDetails()` 透传。
- 覆盖面：前台（`Agent` 的 toolResult.details）、背景（`notifyParent` 复用同一 `subagentToolDetails`，落在 `pi-web:subagent-notification` 的 `custom_message.details`）、历史回放（details 已持久化）一次覆盖；**旧会话没有该字段 → 该来源为空，不报错**（向后兼容）。
- 为什么不做「渲染期按 `sessionId` 回读子会话」：`tail` 默认 50 会漏（40 个有写入的子会话里 39 个只部分命中），且要引入缓存与管理成本（研究 §5 对照表）。

---

## 3. 索引层（R3/R7 的判定基础）

### 3.1 `hooks/useFileIndex.ts`

```ts
interface FileIndexLookup {
  cwd: string;
  /** 归一化后的 cwd 相对路径集合（Windows 风格 cwd 时大小写折叠） */
  relative: Set<string>;
  /** 小写 basename → 该 basename 的全部相对路径（R7 用） */
  byBaseName: Map<string, string[]>;
  truncated: boolean;
}
useFileIndex(cwd?: string): { lookup: FileIndexLookup | null; status: "idle" | "loading" | "ready" | "error" };
```

- 模块级 `Map<cwd, {lookup, fetchedAt, status, promise}>` + 订阅者集合；`useSyncExternalStore` 暴露快照。理由：一个会话里会有大量 `MarkdownBody` 实例，必须去重请求；不引入 Provider 层级也能让深层组件用一个 hook 拿到。
- TTL 与 `/api/file-index` 的 10s 服务端缓存对齐（`app/api/file-index/route.ts:33`）；同一 cwd 并发只发一次请求。
- `files` 数组经 `buildFileIndexLookup(files, cwd)`（纯函数，放在 `lib/path-linkify.ts`，便于单测）转成 `relative` + `byBaseName`。
- 失败（403/网络）→ `status: "error"`、`lookup: null`，渲染层退化为**完全当前行为**（不链接）。

### 3.2 判定规则（`lib/path-linkify.ts`，纯函数）

`linkifyPlainText(text, { cwd, lookup })` / `linkifyToken(token, { cwd, lookup })`：

1. **候选识别**：token 形态需像路径。匹配 `./x`、`../x`、`a/b/c`、`/abs/x`、`C:\x`、`x.md`、可选 `:line`/`:line:col` 后缀；上限长度（如 300）以防误匹配超长文本。
2. **排除**：含协议（`http:`、`https:`、`mailto:`、`pi-web:` 等）、`@` 开头的 mention、纯 `#`/`?`、`import.meta` 之类带 `.` 但不是文件名的短 token（例如 `import.meta`、`e.g`）、以及 basename 无扩展名又无 `/` 的裸词。
3. **裁剪**：去掉包裹的引号/反引号与尾随标点（`,.;:!?)]}`），再剥离 `:line(:col)`（文本来源才剥；href 来源不经过这里）。
4. **解析**：`resolveLocalFilePath(token, cwd)`（**不是** `resolveLocalFileHref`：前者不剥 `:line`、不 URL 解码，正是工具/文本路径的语义，见研究 F-4.1）。无 cwd 且为相对路径 → 放弃。
5. **命中**：`relative(cwd, abs)` 归一化后查 `lookup.relative`；命中即返回该相对路径（用于 `href` 与打开）。
6. **R7 唯一匹配补全**：仅当 5 未命中、`lookup.truncated === false`、且 token 是**裸 basename**（无 `/`）或解析失败时，查 `byBaseName`：**恰好 1 条**才命中，多条 → 纯文本。
7. **索引缺失/截断**：`lookup == null` → 不链接（AC8：不做「形状像路径就链接」）；`truncated` → 跳过第 6 步但保留第 5 步精确命中。

### 3.3 大小写与分隔符

归一化复用 `lib/file-links.ts` 已有的 `normalizeLocalPath`/`normalizeFilePathSlashes` 语义（抽取为可导出的共享纯函数，或新增同语义函数并在单测里对齐）。Windows 风格（盘符/UNC）时大小写折叠。**不要**手写字符串前缀比较；`lib/path-security.ts` 的 `isPathWithinRoots` 仍是唯一安全边界，本层只用于 UI 判定。

---

## 4. 渲染层（R3、R4）

### 4.1 索引如何到达渲染点：React Context

新增 `components/FileIndexContext.tsx`：`FileIndexProvider`（在 `ChatWindow` 用 `useFileIndex(messageCwd)` 取值并提供）+ `useFileIndexContext()`（默认 `null`）。

选 Context 而不是 prop 下传的理由：

- `MessageView` 有十几层子组件，prop 下传改动面最大；
- Context 更新**不受 `memo` 比较器阻挡**，天然解决「索引异步到达后必须重渲染」的问题（研究风险 5）；
- `MarkdownBody` 在 `FileViewer` 的 markdown 预览里也被复用（`components/FileViewer.tsx`），那边不提供 Provider → 取到 `null` → 行为不变（该处重复的链接处理本次不动）。

### 4.2 `MarkdownBody` 的改动

1. 新增可选 prop 无需（走 Context）；`components` 的 `useMemo` deps 增加 `lookup` 与其版本号。
2. inline `code` 分支：命中索引 → 渲染 `<a className="markdown-inline-code markdown-file-link" href=... onClick=...>`（保留等宽/底色，避免流式期间视觉跳动）；未命中 → 维持今天的 `<code>`。**两个分支都必须 `delete props.node`**（react-markdown 10.1.0 `passNode: true` 会注入，实测当前 inline code 已带 `node="[object Object]"` DOM 属性）。
3. 裸文本（R3.3）：覆盖 `p` / `li` / `td` / `th` 四个组件，把**直接为字符串的 children** 经 `linkifyPlainText` 分段渲染为 `<PathText>`；`h1`–`h6`、`a`（其子节点由 `a` 分支渲染）、`code`（自有分支）不处理，避免噪声与嵌套链接。
4. 点击语义：新链接复用 `shouldOpenLocalFileInApp(event)`（`lib/file-links.ts:8-15`），保持「Ctrl/Cmd 点击 = 右栏打开」与现有 `<a>` 一致（AC9）。
5. CSS 走 sanitize schema 之外的 React 组件路径（sanitize 会剥离 rehype 插入的标签，研究 §1.2）。

### 4.3 `PathText`（共享，R3.3 与 R4 共用）

```tsx
<PathText text={...} style={...} className={...} />
```

- 在**纯文本**（`<pre>` 内容、markdown 文本节点）里把命中索引的片段替换成 `<a>`，其余原样输出；`<pre>` 场景只输出行内元素，且 `whiteSpace: "pre-wrap"` 保持不变（不破坏对齐与自动换行）。
- 内部分段结果用 `useMemo`（deps: `text` + `lookup` 引用）缓存，避免每条消息每次渲染重算。

### 4.4 R4 的具体落点

| 位置 | 现状 | 改动 |
|---|---|---|
| `components/MessageView.tsx:1459-1477` `PairedResult` 结果 `<pre>` | 纯文本 | 换 `PathText`（**R4 主要落点**） |
| `components/MessageView.tsx:1705-1723` `CustomMessageView` details `<pre>` | `safeJson` 纯文本 | 换 `PathText` |
| `components/MessageView.tsx:1140-1156` tool input `<pre>` | 纯文本 | 换 `PathText`（`edit` 的 input 里有 `path`；`apply_patch` 的 patch 正文里也有路径） |

保持「工具结果默认折叠」不变（`components/MessageView.tsx:1068`）——展开后才可见，但产物卡片本身已在折叠外可见，用户不需要为了点链接而展开。

---

## 5. 呈现层（R5 卡片）

`components/TurnWrittenFiles.tsx` 就地升级（保留文件名与导出名，减少波及面）：

```
┌──────────────────────────────────────────────────────────┐
│ 📄  prd.md                    Document · MD     +81 -10  │  ← 点卡片主体 = 右栏预览
│     ⋯ 动作                                                 │
└──────────────────────────────────────────────────────────┘
```

- **主体**：`getFileIcon(name, 16)` + 文件名 + 类型行（`\`${typeLabel} · ${EXT}\``，`EXT` 取 `lib/file-types.ts` 的 `getFileExt` 大写）+ 右侧 `+N`/`-M`（绿/红，沿用 `FileExplorer` 的 `added/deleted` 配色风格；CSS 变量优先）。
- **数字来源**：只显示 `WrittenFile.added/removed`（D5）；缺失即不显示。卡片头部（组标题）显示 `N 个文件`，并仅当**所有**条目都有数字时显示合计，避免部分合计造成误读。
- **动作**：卡片右侧一个 `⋯` 按钮（`aria-label` 走 i18n），点开后在该卡片**下方内联展开**一行动作：`打开预览` / `以 Diff 打开`（`modeHint: "diff"`，复用 `AppShell.handleOpenFile` 的既有能力）/ `复制路径`（`lib/clipboard.ts` 的 `copyText`）。
  - 选择内联展开而不是浮层弹窗：避免 z-index/overflow/移动端定位问题（`.trellis/spec/frontend/settings-dialog-mobile.md` 的约束），也更容易做键盘可达。
  - 打开动作统一走既有回调 `onOpenFile(filePath)`（`AppShell.handleOpenLinkedFile`），Diff 需要新的可选回调或 props 扩展（`onOpenFile(filePath, { modeHint: "diff" })`）——具体签名在实现时以 `AppShell.handleOpenFile` 的现有形态为准，优先复用而非新造通道。
- **字号**：对话区排版必须用 `calc(Xpx + var(--chat-font-size-offset, 0px))`（spec 硬约束）。
- **无动作时**：`files` 为空 → 返回 `null`（现状保持）。

### i18n（三语必须齐备，`lib/i18n/registry.test.mjs:39-55` 强校验）

新增：`chat.writtenFilesCount`、`chat.fileType.document|code|image|data|config|other`、`chat.openFilePreview`、`chat.openFileDiff`、`chat.copyFilePath`、`chat.copyFilePathDone`、`chat.writtenFileActions`。占位符集合三语必须一致。

---

## 6. 兼容性与迁移

- **零迁移**：不新增会话文件字段（`details.writtenFiles` 只是 toolResult details 里的新可选键，旧文件读不到就是空）；不改 `.jsonl` 格式；不改任何既有 API 的响应语义（`/api/file-index` 只读复用）。
- **旧会话**：R1（`apply_patch` 文本回退）对历史 `.jsonl` 立刻生效；R2 的 trellis 轨迹对历史会话也生效（数据本就在文件里）；R2 的内建 `Agent` 快照只对**本次改动之后**完成的子代理生效（旧会话无字段 → 该来源为空，不报错）。
- **默认行为不变性**：`lookup === null`（索引未就绪/失败、或在 `FileViewer` 内）时，`MarkdownBody` 与 `<pre>` 的渲染与今天完全一致。这是本次最重要的降级保证。
- **并发/时序**：新写入的文件在 `git ls-files --others` 中立即可见，但 `/api/file-index` 有 10s 服务端缓存 + 客户端 TTL ⇒ 刚写完的瞬间可能查不到；因为产物卡片**不做索引校验**（文件存在性由工具调用证明），卡片不会因此丢条目，只有正文链接会稍晚出现（可接受，写入 PRD Notes）。
- **子代理隔离 worktree**：父会话索引按父 `cwd` 取，隔离 worktree 内的产物不在其中 ⇒ 卡片里这类条目**跳过索引校验**（存在性由工具调用证明），点击时以 `sourceSessionId` 打开（`AppShell.handleOpenFile` 已支持 `sourceSessionId`）。

## 7. 取舍记录

| 取舍 | 选择 | 理由 |
|---|---|---|
| 内建 Agent 的文件来源 | 完成时快照进 `details` | 覆盖前台/背景/历史/实时，零额外 I/O；回读受 `tail=50` 限制且有缓存成本 |
| trellis 轨迹提取 | 新写不截断的提取函数 | 复用 `TrellisSubagentRecord.tools` 会系统性丢 36% 路径；改 `decodeTools` 上限会动既有面板行为 |
| 链接化判定 | 索引校验 | 避免死链（D2）；代价是索引未就绪时暂不链接 |
| 索引分发 | Context + 模块级缓存 | 不受 `memo` 阻挡；深层组件零 prop 穿透 |
| `±` 来源 | 本轮数字（preview/patch），不回退 git | 避免同一卡片两种语义（D5） |
| 卡片动作 UI | 内联展开 | 规避浮层定位/移动端/z-index 陷阱，键盘可达更好 |
| 不改 `isEditToolName` | 新增独立谓词 | 该谓词同时控制 `MessageView` 的 patch 正文可见性 |

## 8. 风险与回滚

**主要风险**

1. **过度链接化噪声**：正文里像路径的普通文本被链接（例如讨论 `package.json` 时）。缓解：只链接索引中真实存在的文件；`import.meta`/命令片段/无扩展名裸词被排除；`truncated` 时禁用唯一匹配补全。
2. **`<pre>` 分段渲染影响既有断言**：`components/MessageView.test.mjs:161-208` 断言工具调用渲染结构（绿边、`aria-label`）→ 改动时只替换文本节点，不动容器结构。
3. **`TurnWrittenFiles.test.mjs` 必然失败**：卡片化会改标签/属性结构 → 属于**预期的测试更新**，需同步重写用例（保留 `title`=绝对路径与文件名可见性这两个语义断言）。
4. **细节解析的版本漂移**：`write` 结果文本历史上变过（研究 F10）⇒ 只把 `details` 当首选、文本仅作回退，且回退路径必须有单测。
5. **性能**：每条消息的文本都过一遍正则。缓解：`PathText` 分段结果 memo 化；`MarkdownBody` 的 `components` 已 memo；链接化只在 `lookup` 就绪后发生。
6. **子代理 details 契约变更**：新增可选字段，需同步 `lib/subagent-extension.ts` 类型与任何对 details 做整体相等断言的测试（实现时先 grep 相关 `.test.mjs`）。

**回滚点**

- 呈现层与数据层、渲染层解耦：回滚卡片 = 只回退 `components/TurnWrittenFiles.tsx` + i18n 新增 key（数据层可保留，仅多出未使用的字段）。
- 渲染层回滚 = 移除 `FileIndexProvider`（`lookup` 变 `null`）即回到今天的行为，无需回退 `MarkdownBody` 代码。
- 服务端快照回滚 = 不再写 `details.writtenFiles`（客户端读不到即忽略），trellis 路径不受影响。

## 9. 验证设计

- **纯函数单测**（jiti 加载 `.ts` 的既有模式）：`lib/written-file-sources.test.mjs`、`lib/path-linkify.test.mjs`、`lib/turn-written-files.test.mjs`（既有 15 例必须全绿 + 新增 apply_patch/子代理用例）；fixture 直接取自真实会话片段（研究附录已给出行号），避免凭空构造。
- **服务端快照**：为 `extractWrittenFilesFromEntries` 加单测（含 >32 条轨迹的 trellis 用例，AC5）。
- **组件**：`components/TurnWrittenFiles.test.mjs`（重写）、`components/MarkdownBody.test.mjs`（新增 inline code 链接用例，既有 a 分支断言保持）、`components/MessageView.test.mjs`（既有结构断言保持）。
- **i18n**：`lib/i18n/registry.test.mjs` 必须过（三语 key/占位符一致）。
- **质量门**：`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test` 三者退出码 0；按 `.trellis/spec/frontend/quality-guidelines.md` 记录基线来源与计数对照到 `research/`。**本任务不执行 `npm install`**。
- **端到端人工验证**：① 打开 trellis 09-18 那次规划的会话，正文里的 `` `prd.md` `` 可点并在右栏打开；② 回复下方出现子代理产物的卡片；③ 一轮只有 `apply_patch` 时卡片有内容；④ 打开一个 `write`/`edit` 老会话，行为不回归。
