# 实施计划：回复中的文件路径可点击 + 产物卡片

依据 `design.md`。按 A→E 顺序执行，每步都有独立可验证的产物；**不要跳步**，B 依赖 A 的契约。

验证命令（全程使用，勿执行 `npm install`）：

```bash
node_modules/.bin/tsc --noEmit
npm run lint
npm test                     # node --experimental-strip-types --test "app/**/*.test.mjs" ...
```

---

## A. 提取层（R1 + R2 的数据面）

- [ ] A1 新增 `lib/written-file-sources.ts`（纯函数，无 React、无 cwd 之外的状态）
  - `isRecord` 运行时守卫（参照 `lib/trellis-subagent-records.ts` 的既定模式）
  - `parseApplyPatchDetails(details: unknown): RawWrittenFile[] | null`：优先 `details.preview.files[]`（丢弃 `operation === "delete"`，`move` 取 `movePath`，取 `added/removed`），无 `preview` 时用 `details.result.appliedFiles`
  - `parseApplyPatchSummaryText(text: string): RawWrittenFile[]`：仅 `^(add|update): (.+)$` 与 `^move: (.+) -> (.+)$`，明确不匹配 `delete:` 与失败行 `- <path> (<op>): msg`
  - `parseEditDiffCounts(details: unknown): {added, removed} | null`：从 `details.patch` 数 `+`/`-` 行
  - `extractTrellisWrittenFiles(details: unknown): RawWrittenFile[]`：遍历 `details.runs[].tools[]` **全量**（不经 `decodeTools`），取 `name` 命中 write/edit 谓词且 `status === "succeeded"` 的 `JSON.parse(args).path ?? .file_path`；`JSON.parse` 失败跳过
  - `extractSubagentSnapshotWrittenFiles(details: unknown): RawWrittenFile[]`：读新增的 `details.writtenFiles`
  - `extractWrittenFilesFromEntries(entries, cwd): WrittenFile[]`：先扫 assistant toolCall 建 `toolCallId → {name, input}`，再扫 `toolResult` 配对；供服务端快照复用
  - `buildFileIndexLookup` 不在此文件（在 `lib/path-linkify.ts`）
- [ ] A2 `lib/tool-names.ts` 新增 `isApplyPatchToolName`（**不要**改 `isEditToolName` / `isWriteToolName`）
- [ ] A3 `lib/turn-written-files.ts`：`WrittenFile` 扩展为 `{filePath, operation?, added?, removed?, origin?}`；主循环改为「toolCall → `WrittenFile[]` → flatten → 跨调用按 filePath 去重保序」，并支持补齐首见条目的 `added/removed`
- [ ] A4 新增 `lib/written-file-sources.test.mjs`：apply_patch 的 add/update/delete/move、部分失败只取 details、解析失败（isError）、details 缺失走文本回退、trellis >32 条轨迹不丢路径、畸形 args 跳过、快照字段解析；fixture 取自真实会话片段
- [ ] A5 `lib/turn-written-files.test.mjs`：**既有 15 例必须全绿不改**，追加 apply_patch 与子代理用例
- [ ] **验证点**：`npm test`（A 相关文件）+ `tsc --noEmit`

## B. 服务端快照（R2 的内建 Agent 面）

- [ ] B1 `lib/subagents.ts`：`SubagentRunInfo` 增加可选 `writtenFiles?: WrittenFile[]`
- [ ] B2 `lib/subagent-extension.ts`：`SubagentToolDetails` 增加可选 `writtenFiles?`，由 `subagentToolDetails()` 透传（保持纯增量）
- [ ] B3 `lib/subagent-runtime.ts`：在子代理完成分支（复用 `:531` 已取的 `sessionManager.getEntries()`）调用 `extractWrittenFilesFromEntries(entries, childCwd)`，写回 run 信息；确认前台（`Agent` toolResult.details）与背景（`notifyParent` → `custom_message.details`）两条出口都带上
- [ ] B4 为 `extractWrittenFilesFromEntries` 补单测（含 >32 条轨迹场景 ⇒ AC5）；检查并对齐任何对 details 做整体断言的既有测试（先 grep `subagent` 相关 `.test.mjs`）
- [ ] **验证点**：`npm test`（subagent 相关）+ `tsc --noEmit`

## C. 索引与判定（R3/R7 的判定面）

- [ ] C1 在 `lib/file-links.ts` 中把路径归一化逻辑（`normalizeLocalPath` / `normalizeFilePathSlashes`）抽为可导出的共享纯函数，**不改行为**；`lib/file-links.test.mjs` 保持全绿
- [ ] C2 新增 `lib/path-linkify.ts`：`buildFileIndexLookup(files, cwd)`、`linkifyToken(token, ctx)`、`linkifyPlainText(text, ctx)`，按 `design.md` §3.2 的 7 步规则实现（含 `truncated` 时禁用唯一匹配补全）
- [ ] C3 新增 `lib/path-linkify.test.mjs`：`:line` 剥离、尾随标点、URL/协议/`import.meta` 排除、相对/绝对命中、basename 唯一命中、同名多义不链接、`truncated` 降级、`lookup === null` 不链接、Windows 盘符/UNC 大小写
- [ ] C4 新增 `hooks/useFileIndex.ts`：模块级 `Map<cwd, state>` + 订阅者 + `useSyncExternalStore`，TTL 10s 对齐服务端，单 cwd 单并发请求，错误态返回 `lookup: null`
- [ ] C5 新增 `components/FileIndexContext.tsx`：`FileIndexProvider` + `useFileIndexContext()`（默认 `null`）
- [ ] **注意**：C 阶段结束时 UI 行为必须与今天**完全一致**（还没消费索引）——这是可独立验证的检查点

## D. 渲染层（R3 + R4）

- [ ] D1 新增 `components/PathText.tsx`：纯文本 → 分段渲染，命中索引的片段渲染为 `<a>` 并复用 `shouldOpenLocalFileInApp`；`useMemo`（deps: text + lookup）
- [ ] D2 `components/MarkdownBody.tsx`
  - inline `code` 分支：命中 → `<a className="markdown-inline-code markdown-file-link">`；未命中 → 现状；**两个分支都 `delete props.node`**
  - 覆盖 `p` / `li` / `td` / `th`，把字符串 children 交给 `PathText`（不处理 `h1`–`h6`、`a`、`code`）
  - `useMemo` deps 增加 `lookup`
- [ ] D3 `components/ChatWindow.tsx`：`useFileIndex(messageCwd)` → `FileIndexProvider` 包住消息区
- [ ] D4 `components/MessageView.tsx`：`PairedResult` 结果 `<pre>`（主要）、`CustomMessageView` details `<pre>`、tool input `<pre>` 改用 `PathText`；**不动容器结构与默认折叠行为**
- [ ] D5 测试：`components/MarkdownBody.test.mjs` 追加 inline code 链接用例（既有 a 分支断言保持）；`components/MessageView.test.mjs` 既有结构断言保持全绿
- [ ] **验证点**：`npm test`（C/D 相关）+ 人工验证 trellis 会话正文里的 `` `prd.md` `` 可点（见 design §9）

## E. 呈现层（R5）

- [ ] E1 新增文件类型分类纯函数（`lib/file-types.ts` 扩展或新文件）：`getFileExt` → `document | code | image | data | config | other`
- [ ] E2 i18n：`lib/i18n/messages/{en,zh-CN,zh-TW}.ts` 同时新增 `chat.writtenFilesCount`、`chat.fileType.*`(6)、`chat.openFilePreview`、`chat.openFileDiff`、`chat.copyFilePath`、`chat.copyFilePathDone`、`chat.writtenFileActions`；占位符集合三语一致
- [ ] E3 重写 `components/TurnWrittenFiles.tsx` 为卡片：图标 + 文件名 + 类型行 + `+N/-M`（仅当有值）+ `⋯` 动作（内联展开：打开预览 / 以 Diff 打开 / 复制路径）；组标题显示数量，仅当全部条目有数字时显示合计；`files` 为空返回 `null`
- [ ] E4 字号使用 `calc(Xpx + var(--chat-font-size-offset, 0px))`；颜色优先用 CSS 变量
- [ ] E5 若 Diff 动作需要传 `modeHint`，优先扩展既有 `onOpenFile` 回调形态或复用 `AppShell.handleOpenFile`，不新造打开通道
- [ ] E6 重写 `components/TurnWrittenFiles.test.mjs`：保留「文件名可见 + `title` 为绝对路径」两个语义断言，新增卡片结构/动作/数字显示条件（无数字时不渲染数字）用例
- [ ] **验证点**：`npm test`（E 相关）+ 目视卡片效果

## F. 收尾（全量门禁与记录）

- [ ] F1 `node_modules/.bin/tsc --noEmit` 退出码 0
- [ ] F2 `npm run lint` 退出码 0
- [ ] F3 `npm test` 全绿；与基线逐项对照（文件数/用例数/诊断数），把对照记录写入 `research/verification-baseline.md`（按 `.trellis/spec/frontend/quality-guidelines.md`）
- [ ] F4 人工端到端：① trellis 09-18 会话正文路径可点开右栏；② 回复下方列出子代理产物卡片；③ 仅 `apply_patch` 的回合有卡片且 `delete` 不出现；④ `write`/`edit` 老会话不回归；⑤ 索引失败（断网/403）时行为与今天一致
- [ ] F5 如实现过程中形成了稳定契约（新组件/新 hook 的约定），按 `.trellis/spec/frontend/index.md` 的登记方式补 spec 条目

---

## 高风险文件（改前先读、改后重点回归）

| 文件 | 风险 |
|---|---|
| `components/MessageView.tsx` | 既有结构断言多（`:161-208`）；`<pre>` 替换要保 `pre-wrap` 与容器结构 |
| `components/MarkdownBody.tsx` | `a` 分支是既有能力，绝不能回归；`props.node` 泄漏问题 |
| `lib/turn-written-files.ts` | 既有 15 例是回归基线；改循环结构易破坏顺序/去重语义 |
| `lib/file-links.ts` | 是点击语义与路径归一化的唯一实现，抽取时不得改行为 |
| `lib/subagent-runtime.ts` | 子代理生命周期，改动要只加不删、失败不得影响子代理本身完成 |
| `components/TurnWrittenFiles.tsx` | 必然要改测试；卡片结构要同时满足移动端与键盘可达 |

## 回滚点

1. E（卡片）可单独回滚：数据层与渲染层不受影响。
2. D 的回滚开关是 `FileIndexProvider`：去掉 Provider ⇒ `lookup` 为 `null` ⇒ 渲染与今天一致。
3. B（服务端快照）可单独回滚：不再写 `details.writtenFiles`，客户端读不到即忽略。
4. A 是纯增量（新文件 + 谓词新增），仅 `lib/turn-written-files.ts` 的主循环结构变化需要连同单测一起回退。

## 开工前检查

- [ ] `research/` 三份报告已读（尤其 `tool-path-extraction.md` F1–F11 与 `subagent-file-extraction.md` §1.2 的 32 条截断）
- [ ] `design.md` D5（`±` 只取本轮数字）已获用户确认
- [ ] 未修改 `.pi/extensions/trellis`（producer 契约）
- [ ] 未改动 `lib/git-changes.ts` / `GitFileStatus` / `FileExplorer`
