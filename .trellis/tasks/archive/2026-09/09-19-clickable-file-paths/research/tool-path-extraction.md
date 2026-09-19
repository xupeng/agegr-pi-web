# 研究：写入类工具及其结果文本中的文件路径提取（PRD R1 / R4）

> 研究日期：2026-09-19。范围：只读调研，未修改任何源码。
> 结论全部带 `file:line` 或真实会话证据锚点。会话文件根目录
> `~/.pi/agent/sessions/--home-xupeng-dev-personal-forked-agegr-pi-web--/`（下称 `$SESS`）。

---

## 0. 结论速览（先看这张表）

| # | 结论 | 锚点 |
|---|------|------|
| F1 | `apply_patch` **不是 pi 内建工具**，而是外部扩展 `pi-apply-patch@0.1.2` 注册的；pi 0.85.1 的 dist 内**没有任何 `apply_patch` 实现**。 | `~/.pi/agent/settings.json` 的 `packages` 含 `../../dev/personal/pi-extensions/pi-apply-patch`；`grep -rl apply_patch node_modules/@earendil-works/pi-coding-agent/dist` 无命中 |
| F2 | `apply_patch` 的 toolCall 入参字段是 **`input`**（整个 patch 文本字符串），不是 `path`/`file_path`。256/256 真实样本均为 `{"input": "*** Begin Patch\n..."}`。 | `pi-apply-patch/src/index.ts:18-22`；会话样本见 §2 |
| F3 | `apply_patch` 成功结果文本 = 每个 hunk 一行 summary，`\n` 连接。行前缀共 4 种：`add: `、`update: `、`delete: `、`move: <old> -> <new>`。 | `pi-apply-patch/src/index.ts:1159,1165,1182,1189,1493` |
| F4 | summary 里的路径是 **patch 原文里的原始路径**（`hunk.filePath`），**不是**解析后的绝对路径。真实样本里 282 次绝对、**23 次相对**。PRD 里「结果文本逐行给出绝对路径」的说法**不成立**，提取时必须用 cwd 解析相对路径。 | `pi-apply-patch/src/index.ts:1354`（`path.resolve(cwd, filePath)` 只用于落盘）；样本见 §2.3 |
| F5 | 部分失败时，结果文本**只列失败行**，不列已成功文件的 summary；已成功文件的路径只在 `details.result.summaries` / `details.result.appliedFiles` 里。只解析文本会漏文件。 | `pi-apply-patch/src/index.ts:1462-1489` vs `1230-1233` |
| F6 | 解析失败（envelope/`+` 行格式错误）会 throw → toolResult `isError=true`，文本形如 `Invalid patch format: Add File lines must start with '+'`，不含任何 `add:`/`update:` 行。 | `pi-apply-patch/src/index.ts:928,950,1418-1424`；会话样本 §2.4 |
| F7 | `details.preview.files[]` 提供 **每文件 `{filePath, operation, diff, added, removed, movePath?}`**，`added`/`removed` 是该 patch 的净增删行数——比 `git --numstat` 更贴近「本轮」语义。 | 会话 `2026-09-18T06-02-15-877Z_...jsonl:68` 实测 `added:81, removed:10`；`pi-apply-patch/src/index.ts:57-62` |
| F8 | pi 内建 `write`：入参 `{path, content}`，结果文本 `Successfully wrote to ${path}`（0.85.1）。`details: undefined`。 | `node_modules/@earendil-works/pi-coding-agent/dist/core/tools/write.js:10,24,51,52` |
| F9 | pi 内建 `edit`：入参 `{path, edits[]}`，成功文本 `Successfully replaced ${n} block(s) in ${path}.`，`details={diff,patch,firstChangedLine}`；失败文本带路径但 `isError=true`（含 `Could not find the exact text in <path>.` / `Could not edit file: <path>.`）。 | `dist/core/tools/edit.js:18,84,135,138`；失败样本 §2.5 |
| F10 | **版本漂移**：同仓库旧会话（8/26）里 `write` 结果文本是 `Successfully wrote 4190 bytes to <path>`，而 0.85.1 已改为 `Successfully wrote to <path>`。**解析结果文本不可靠**，绝不能作为唯一路径来源。 | 会话 `2026-08-26T12-15-39-737Z_...jsonl:67` vs `write.js:51` |
| F11 | `isEditToolName` 有**第二个消费方**：`components/MessageView.tsx:1071,1140` 用它决定是否隐藏展开后的 tool input `<pre>`。若把 `apply_patch` 加进 `isEditToolName`，会顺带隐藏 apply_patch 的 patch 正文（行为变更，需设计决策）。 | `components/MessageView.tsx:1071,1140` |
| F12 | `/api/file-index` 无 `q` 时返回 **cwd 相对路径**列表，数据源是 `git ls-files --cached --others --exclude-standard`（未跟踪但未忽略的新文件也包含），本仓库 834 个文件，远低于 `MAX_FILES=5000`。`.trellis/tasks/**/…md` 不在 `.gitignore` 里，**会被索引到**（R3/R7 可行）。 | `app/api/file-index/route.ts:19,48-60,117-120`；`git check-ignore` 实测 NOT ignored |

---

## 1. pi 写入类工具的真实实现

### 1.1 内建 `write`

`node_modules/@earendil-works/pi-coding-agent/dist/core/tools/write.js`

```js
// :9-12
const writeSchema = Type.Object({
    path: Type.String({ description: "Path to the file to write (relative or absolute)" }),
    content: Type.String({ description: "Content to write to the file" }),
});
// :24 name: "write"
// :30-32  execute(_toolCallId, { path, content }, ...)
//   const absolutePath = resolveToCwd(path, ctx?.cwd || cwd);
// :51   content: [{ type: "text", text: `Successfully wrote to ${path}` }],
// :52   details: undefined,
```

- 入参字段：**`path`**，不是 `file_path`。
- 结果文本只回显 **模型传入的原始 `path`**（可能是相对路径），不是 `absolutePath`。
- `details` 永远 `undefined`。
- `writeSchema` 无 `file_path`；现有 `readToolPath` 的 `input.file_path ?? input.path` 对 `write` 依 `path` 分支即可。

### 1.2 内建 `edit`

`dist/core/tools/edit.js`

```js
// :18 path: Type.String({ description: "Path to the file to edit (relative or absolute)" })
// :84 name: "edit"
// :135 text: `Successfully replaced ${edits.length} block(s) in ${path}.`,
// :138 details: { diff: diffResult.diff, patch, firstChangedLine: diffResult.firstChangedLine },
```

失败分支（同文件 execute 内）：
- 文件不可写/不存在：`throw new Error(\`Could not edit file: ${path}. ${errorMessage}.\`)`
- oldText 匹配不到：真实会话里是 `Could not find the exact text in <abs path>. The old text must match exactly including all whitespace and newlines.`（`$SESS/2026-08-26T12-15-39-737Z_...jsonl:638`，`isError=true`）。

注意：`prepareEditArguments`（`edit.js:66`）会把 legacy 单条 `{oldText,newText}` 归一到 `edits[]`。**真实会话里出现过 `arguments` 只有 `{edits:[...]}`、没有 `path` 的失败调用**（同 session `:637`）。对失败调用不解析即可规避，但说明「edit 一定有 path」不成立。

### 1.3 `apply_patch`（外部扩展，非 pi 内建）

来源：`~/.pi/agent/settings.json` → `packages` 第 7 项 `../../dev/personal/pi-extensions/pi-apply-patch`。
仓库 `/home/xupeng/dev/personal/pi-extensions/pi-apply-patch`，版本 0.1.2，`package.json` 的 `pi.extensions` 指向 `./src/index.ts`。

**触发条件**（`src/index.ts:isApplyPatchCapableModel`，`:336-350`）：官方 DeepSeek / `deepseek-*` id 无条件启用；GPT 家族需 provider/api 命中。它启用时会 **替换掉 `write`/`edit`**（`STANDARD_EDIT_TOOL_NAMES = ["edit","write"]`，`:308`）。本机 `settings.json.defaultModel = "cliproxyapi/deepseek-flash"` → apply_patch 是主力写入路径，这与 PRD 判断一致。

**工具定义**

```ts
// :18-22
const APPLY_PATCH_PARAMS = Type.Object({
  input: Type.String({ description: "The entire contents of the apply_patch command" }),
});
// :1398-1403
name: "apply_patch", label: "ApplyPatch",
parameters: APPLY_PATCH_PARAMS,
prepareArguments: normalizeApplyPatchArguments,
```

**入参归一化**（`:298-311`）：`prepareArguments` 接受两种形态——grammar 工具下的**裸 patch 字符串**，或 function tool 下的 `{input: "<patch>"}`；两者都会被包成 `{input}`。因此落到 `ToolCallContent.input` 的**总是 `{input: string}`**。会话实证：256/256 全部 `arguments = {"input": "*** Begin Patch..."}`。

**路径解析**（`:1354-1356`）：

```ts
function resolvePatchPath(cwd: string, filePath: string): string {
  return path.resolve(cwd, filePath);
}
```

只在落盘时用；summary 里写的是 `hunk.filePath`（原文）。

**成功结果文本**（`:1493`）：`result.summaries.join("\n")`，summary 由 `applySingleHunk` 生成（`:1155-1191`）：

| operation | summary 行格式 | appliedFile |
|-----------|----------------|-------------|
| add | `add: <filePath>` | `<filePath>` |
| delete | `delete: <filePath>` | `<filePath>` |
| update | `update: <filePath>` | `<filePath>` |
| move（update + `*** Move to:`） | `move: <filePath> -> <movePath>` | `<movePath>` |

一个 patch 多个 hunk → 多行，按 patch 顺序 `\n` 拼接。真实样本（delete + add 同路径，`:48`）：

```
delete: .trellis/tasks/08-29-sidebar-session-list-empty/prd.md
add: .trellis/tasks/08-29-sidebar-session-list-empty/prd.md
```

**部分/全部失败结果文本**（`:1462-1489`）：

```ts
if (result.failures.length > 0) {
  const failureLines = result.failures.map(
    (failure) => `- ${failure.filePath} (${failure.operation}): ${failure.message}`,
  );
  return { content: [{ type: "text", text: [
    result.hasPartialSuccess ? "apply_patch partially failed." : "apply_patch failed.",
    "Failed:", ...failureLines,
    mustReadFiles.length > 0 ? `Recovery: MUST read ${mustReadText} before retrying.` : "",
    result.appliedFiles.length > 0 ? "Earlier file actions in this patch were already applied."
                                   : "No file actions were applied.",
    ...
  ].join("\n") }], details: preview ? { preview, result } : { result } };
}
```

⇒ **失败文本用 `- <path> (<op>): <msg>`，与成功行前缀不同；success 行不会出现在失败分支里**。要拿全「已写入」文件，必须读 `details.result.summaries` / `details.result.appliedFiles`。

**解析失败**：`parseNonEmptyPatch` 在 `:941-950` 抛 `PatchParseError`（`Invalid patch format: ...`），`execute` 中该异常未被捕获（`:1418-1424` 的 try/catch 只包 `createPendingPatchUpdate` 的渲染），最终冒泡成 `isError=true`。

**details 结构**（成功与失败都带，`:1451/1490`）：

```ts
type ApplyPatchToolDetails = {
  preview?: { files: ApplyPatchPreviewFile[]; added: number; removed: number },
  progress?: { applied: number; failed: number; total: number },
  result?: { summaries: string[]; appliedFiles: string[]; failures: [...];
             hasPartialSuccess: boolean; recoveryInstructions: {...}; details: { fuzz: number } },
};
type ApplyPatchPreviewFile = { filePath; movePath?; operation: "add"|"update"|"delete"; diff: string; added: number; removed: number };
```

pi-web 的 `ToolResultMessage` 已带 `details?: unknown`（`lib/types.ts:83-92`），session-reader 原样透传（`lib/session-reader.ts:815`）。所以 `details` 在客户端可用（现有 `getResultDiff` 已在用，`components/MessageView.tsx:1396-1408`）。

### 1.4 版本漂移证据

| 时期 | write 成功文本 | 锚点 |
|------|----------------|------|
| 旧会话 2026-08-26 | `Successfully wrote 4190 bytes to /abs/...` | `$SESS/2026-08-26T12-15-39-737Z_01a03dff-...jsonl:67` |
| 当前 0.85.1 | `Successfully wrote to ${path}` | `dist/core/tools/write.js:51` |

⇒ 任何「正则匹配成功文本抽取路径」的方案都必须容错，且不能作为唯一来源。

---

## 2. 真实会话证据（$SESS，本仓库项目目录）

统计口径：遍历本目录 30 个 `.jsonl`，配对 assistant `toolCall` 与 `toolResult`。

| 工具 | 调用次数 | 结果成功 | 结果 isError |
|------|---------:|---------:|-------------:|
| apply_patch | 256 | 251 | 5 |
| edit | 308 | 292 | 16 |
| write | 82 | 82 | 0 |
| bash | 2385 | — | — |

apply_patch 结果分类：`update` 193、`add` 44、`delete` 2、失败 17（其中 5 个 isError=true 的解析失败，12 个 isError=false 的 apply 失败）；**`move:` 0 例**（代码支持但本目录样本未出现）。

### 2.1 update（绝对路径）

`$SESS/2026-09-18T06-02-15-877Z_01a0b31b-c1c4-70fe-9c01-21d8ed51577c.jsonl`

- `:67` toolCall `apply_patch`，`arguments.input` 首行 `*** Begin Patch`，随后 `*** Update File: /home/xupeng/dev/personal/forked/agegr-pi-web/.trellis/tasks/09-18-sync-upstream-post-v091/prd.md`
- `:68` toolResult `isError=false`，文本 `update: /home/xupeng/.../prd.md`
- `:68` `details.preview.files[0] = { filePath: "/home/xupeng/.../prd.md", operation: "update", diff: "<...>", added: 81, removed: 10 }`，`details.preview.added=81, removed=10`

### 2.2 add

`$SESS/2026-08-28T13-18-02-303Z_01a04885-...jsonl`
- `:232` toolCall `*** Add File: /home/xupeng/.../design.md` → `:233` `add: /home/xupeng/.../design.md`

### 2.3 delete + add 同路径、**相对路径**

`$SESS/2026-08-29T09-06-15-316Z_01a04cc5-...jsonl`
- `:47` toolCall：`*** Delete File: .trellis/tasks/08-29-sidebar-session-list-empty/prd.md` + `*** Add File: .trellis/tasks/08-29-sidebar-session-list-empty/prd.md`（相对路径！）
- `:48` toolResult：`delete: .trellis/tasks/…/prd.md\nadd: .trellis/tasks/…/prd.md`

`$SESS/2026-08-29T09-06-15-316Z_...jsonl:56`：`add: .trellis/tasks/08-29-sidebar-session-list-empty/implement.md`

⇒ 相对路径必须用 cwd 解析。解析后应指向 `/home/xupeng/dev/personal/forked/agegr-pi-web/.trellis/...`。

### 2.4 解析失败（isError=true，无路径行）

`$SESS/2026-08-28T13-18-02-303Z_01a04885-...jsonl`
- `:230` toolCall：`*** Add File: /home/.../design.md`，正文缺 `+` 前缀
- `:231` toolResult `isError=true`：`Invalid patch format: Add File lines must start with '+'`

⇒ 不得从错误文本里抽路径当作「已写入」。

### 2.5 apply 部分失败（isError=false，含成功但不列）

`$SESS/2026-08-29T07-39-11-015Z_01a04c75-...jsonl:433`，文本：

```
apply_patch partially failed.
Failed:
- /home/xupeng/.../hooks/useAgentSession.ts (update): Failed to find expected lines in ...:
...
Recovery: MUST read /home/xupeng/.../hooks/useAgentSession.ts before retrying.
Earlier file actions in this patch were already applied.
Recovery: MUST NOT reread other files from this patch unless a specific dependency requires it.
```

同 `:433` 的 `details.result`：

```json
{"summaries":["add: /home/.../lib/ask-user/resolve-pending-ask.ts",
              "update: /home/.../hooks/useAgentSession.pending-ask.test.mjs"],
 "appliedFiles":["/home/.../lib/ask-user/resolve-pending-ask.ts",
                 "/home/.../hooks/useAgentSession.pending-ask.test.mjs"],
 "failures":[{"filePath":"/home/.../hooks/useAgentSession.ts","operation":"update", ...}],
 "hasPartialSuccess":true, ...}
```

⇒ 2 个成功文件在文本里**完全看不到**；只在 `details.result.appliedFiles` / `summaries`（以及 `details.preview.files`）。

### 2.6 write / edit 成功与失败样本

- write 成功：`$SESS/2026-08-26T12-15-39-737Z_...jsonl:67`，args `{path, content}`，结果 `Successfully wrote 4190 bytes to /abs/...`（旧版文本）。
- edit 成功：同文件 `:81`，args `{path, edits}`, 结果 `Successfully replaced 2 block(s) in /abs/...index.md.`，`details={diff,patch,firstChangedLine}`。
- edit 失败：同文件 `:637` toolCall args **只有 `{edits:[...]}`（无 path）**，`:638` `isError=true` 文本 `Could not find the exact text in /abs/.../lib/session-reader.test.mjs. ...`。

---

## 3. `lib/tool-names.ts` / `lib/turn-written-files.ts` 现状与全部消费方

### 3.1 谓词语义（`lib/tool-names.ts:9-27`）

```ts
isWriteToolName: name === "write" || startsWith("write_") || endsWith(".write") || endsWith("_write")
isEditToolName:  name === "edit" || startsWith("edit_") || endsWith(".edit") || endsWith("_edit")
                 || includes("str_replace") || includes("replace_editor")
```

- 两者都**不认 `apply_patch`**（也不认 `applyPatch`）。
- 只做小写化，不做去空白/去命名空间前缀的归一。

### 3.2 `extractTurnWrittenFiles`（`lib/turn-written-files.ts:30-62`）

- 只遍历传入的 assistant `content` 里的 `toolCall` 块；`isFileWritingToolName = isWriteToolName || isEditToolName`（`:10-12`）。
- 通过 `toolResults.get(block.toolCallId)` 取结果；`!result || result.isError` 直接跳过（`:44-46`）。
- 用 `readToolPath` 读 `input.file_path ?? input.path`（`:14-19`）。
- 用 `resolveLocalFilePath(rawPath, cwd)` 解析，`Set` 去重，保持首次出现顺序。
- 返回 `WrittenFile[]`，目前**只有 `filePath` 一个字段**（`:5-7`）。
- 注释明确立场：文件清单只来自成功工具调用，不扫描回复正文（`:21-29`）。

⇒ R1 缺口：`apply_patch` 不在谓词里；即使加进谓词，`readToolPath` 也读不到路径（入参是 `input` patch 文本，没有 `path`/`file_path`）。必须新增「从 apply_patch 结果文本 / details 提取多路径」的分支。

### 3.3 全部消费方

| 消费方 | 位置 | 依赖的字段 |
|--------|------|-----------|
| 调用者 | `components/ChatWindow.tsx:1200`（在最终 assistant 渲染时 `extractTurnWrittenFiles(turnContent, toolResultsMap, messageCwd)`） | 返回 `WrittenFile[]` |
| 透传 props | `components/ChatWindow.tsx:1053,1080`；`components/MessageView.tsx:231,667` | `WrittenFile[]` |
| 渲染 | `components/MessageView.tsx:872-874` → `components/TurnWrittenFiles.tsx:13-45` | **只用 `filePath`**（`getFileName(filePath)`、`title`、`onOpenFile(filePath)`） |
| i18n | `lib/i18n/messages/{en,zh-CN,zh-TW}.ts:372` `chat.openWrittenFile`；`chat.filesWritten` 为 aria-label | — |
| 测试 | `lib/turn-written-files.test.mjs`（13 用例，见 §3.4）；`components/TurnWrittenFiles.test.mjs`（2 用例） | `filePath` |

`isEditToolName` 的第二个消费方：`components/MessageView.tsx:1071` → `isEditTool`，在 `:1140` 条件 `expanded && (isStreamingInput || !isEditTool)` 控制是否显示 tool input `<pre>`。这是**共享谓词的隐式耦合**：改谓词会改 UI。`apply_patch` 当前 `isEditTool=false`，所以展开时会显示完整 patch 正文。

### 3.4 现有测试基线（`lib/turn-written-files.test.mjs`）

覆盖：write 的 `file_path`、edit 的 `input.path`、MCP 命名（`write_file`/`fs.edit`/`str_replace_editor`）、error 跳过、流式无结果跳过、去重 write+edit、相对路径、无扩展名/点文件、特殊字符（`#`/`?`/`:42`）、Windows 相对路径、非写工具跳过、只认工具调用不认正文、缺 path 跳过、空输入。**没有任何 apply_patch 用例**，也没有「一个工具调用产出多个文件」的用例。AC2 要求这些不回归。

`npm test` 脚本：`node --experimental-strip-types --test "app/**/*.test.mjs" "components/**/*.test.mjs" "hooks/**/*.test.mjs" "lib/**/*.test.mjs" "public/**/*.test.mjs"`（`package.json`）。

---

## 4. `lib/file-links.ts` 路径解析边界

### 4.1 `resolveLocalFilePath`（`:141-166`）——工具参数用，非 href

- 判定 windowsStyle：路径或 baseDir 命中 `^[a-zA-Z]:[\\/]` 或 `\\\\` 开头，则统一把 `\` 换 `/`。
- 分支：
  1. `C:/...` 或 `//...`（UNC）→ 直接当绝对路径；
  2. 普通 `/...` 绝对路径 → 若 baseDir 是 Windows 盘符/UNC，则**把盘符根拼到前面**（`/repo/x` + `C:/repo` → `C:/repo/x`）；
  3. 相对路径 → **必须有 baseDir**，否则返回 `null`（`:161`）。
- 最后走 `normalizeLocalPath`：折叠 `.`/`..`，保留 UNC 双斜杠，保留 Windows 盘符（`:44-73`）。
- **不去 URL 解码、不 strip `:line` 后缀**（对比 `resolveLocalFileHref`）。这是有意的：工具参数里的 `#`/`?`/`:42` 是文件名字符（见测试 `preserves path characters…`）。

### 4.2 `resolveLocalFileHref`（`:95-139`）——markdown href 用

- 先 `split("#")`/`split("?")` 去锚点，再 `safeDecode`，再判断协议/`file:`/绝对/相对。
- 关键排除：`/api/`、`/_next/`、普通协议（http/file 除外）、`//host/...` 网络路径（除非是反斜杠 UNC）。
- 相对路径仅在 `baseDir` 存在且 `looksLikeRelativeFileHref` 时拼 baseDir，并做 `isPathInside(root)` 防逃逸。
- **会 strip `:line`/`:line:col`**（`stripLineSuffix`，`:41-43`），会 URL 解码。

### 4.3 对本改动的含义

- R1 提取：apply_patch/ write / edit 的路径是**文件系统路径**，应走 `resolveLocalFilePath(rawPath, cwd)`，与现有 turn-written-files 一致。
- R3/R4 从**正文/结果文本**里识别路径并链接：若来源是 markdown href，用 `resolveLocalFileHref`；若是裸文本/inline code/`<pre>`，必须用 `resolveLocalFilePath`（否则 `a.md#L1`、`data?.json` 会被错切）。两者不要混用。
- UNC 与 Windows：`resolveLocalFilePath` 已覆盖（baseDir 为 Windows 时相对路径也转正斜杠）。`lib/paths.ts` 的 `toNativePath`/`samePath` 是另一个层面（服务端 git 路径），不要重复实现。

已覆盖测试：`lib/file-links.test.mjs`（点击语义、绝对/相对、逃逸、app/外链排除、file URL 解码、Windows/UNC file URL）。**缺**：`resolveLocalFilePath` 的专门用例（现有覆盖在 `turn-written-files.test.mjs` 里间接测）。

---

## 5. 相关 spec 约束（原文要点）

- `.trellis/spec/frontend/index.md`：frontend 规范多数 `To fill`；已写的有 quality-guidelines、trellis-subagent-records、ask-user-protocol、mobile-keyboard-viewport、session-list-refresh、settings-dialog-mobile。新增文件/能力若形成稳定契约，应在 index 表登记。
- `.trellis/spec/frontend/quality-guidelines.md`「验证基线必须来自与锁文件一致的依赖树」：报告 lint/单测通过前必须给出**基线来源**（哪个依赖树、哪次安装）；诊断数变化要做归因（规则级别/覆盖文件数/插件版本/依赖树一致性），不能只看数字变小。提交前最小集合：`tsc --noEmit`、`npm run lint`、`npm test` 三者退出码 0，计数与基线逐项对照记录在任务 `research/` 下。**注意**：本任务不要 `npm install`，避免污染依赖树。
- `.trellis/spec/frontend/type-safety.md`：仍是占位模板，无强约束。但 `lib/types.ts` 的 `ToolResultMessage.details?: unknown` 是既有约定——新增对 `details` 的结构化解码应放纯 helper + 运行时类型守卫（参考 `lib/trellis-subagent-records.ts`、`MessageView.tsx:1396` 的 `isRecord` 模式），不要把 unknown 直接 cast。
- `.trellis/spec/frontend/component-guidelines.md`：占位。既有实际约定可从 `TurnWrittenFiles.tsx` 归纳：`"use client"`、props 内联类型、`useI18n()`、`onOpenFile?` 可选回调、无 UI 库的 inline style。

---

## 6. 对 design 的建议

### 6.1 提取来源优先级（R1）

1. **首选 `toolResult.details`（结构化）**：`apply_patch` 用 `details.result.appliedFiles`（含部分失败里成功的文件）+ `details.preview.files[]`（`operation`/`added`/`removed`/`movePath`）；`delete:` 的文件从 `appliedFiles` 里排除（operation 为 delete）。`write`/`edit` 仍用 `input.path`。
2. **回退到结果文本行**：仅当 `details` 缺失（旧扩展版本 / 其它 runtime / 未来格式变化）时，按行解析 `^(add|update|move): (.+)$`，`delete:` 行丢弃；`move` 取 `->` 右侧目标。**不要**把 `- <path> (<op>): msg` 失败行当作写入。
3. 无论哪条来源，都用 `resolveLocalFilePath(rawPath, cwd)` 解析（相对路径必须能拿到 `cwd`）。

### 6.2 谓词与多文件返回（R1）

- 新增独立谓词（如 `isApplyPatchToolName`），**不要**直接把 `apply_patch` 塞进 `isEditToolName`：`isEditToolName` 还被 `MessageView.tsx:1071,1140` 用来隐藏输入 `<pre>`，会顺带改 UI。
- `WrittenFile` 需扩展为多文件、带元信息的形态，例如：
  ```ts
  interface WrittenFile {
    filePath: string;                                     // 解析后绝对路径
    operation?: "add" | "update" | "move" | "write" | "edit";
    added?: number; removed?: number;                     // 仅 apply_patch 有
  }
  ```
  但注意 §3.3 的渲染消费方只读 `filePath`，扩展字段是向后兼容的；`WrittenFile` 是导出类型，改字段要同步 `lib/turn-written-files.test.mjs`、`components/TurnWrittenFiles.test.mjs`。若要保留旧签名，可新增 `extractTurnWrittenFilesDetailed()` 并让旧函数做投影。
- `apply_patch` 单次调用可产出多个文件 → 现有「一个 toolCall 一个文件」的循环结构需改为「toolCall → WrittenFile[] 再 flatten，最后跨调用去重（保留首见）」。

### 6.3 每文件 `+N/-M`（R5 相关）

- **优先 `details.preview.files[].added/removed`**：它是该次 patch 的净增删，语义比 git `--numstat` 更接近「本轮」，且天然 per-file、无需再跑 git。仅 `apply_patch` 有。
- `write`（新文件/整写）与 `edit` 没有等价的 per-file 数字（`write` details 为 undefined；`edit` details 只有 diff/patch，需数 `+`/`-` 行）。若统一展示，需明确「apply_patch 用 patch 统计、write/edit 用 git 工作树统计」两套来源，并按 PRD R5 在 UI 上标注工作树语义。

### 6.4 路径链接化 / 索引校验（R3/R4，与本次 R1 共享解析器）

- 判定源统一为 `resolveLocalFilePath`（裸文本/inline code/`<pre>`）与 `resolveLocalFileHref`（markdown href），再用 `/api/file-index?cwd=` 的白名单校验：客户端已有 `?cwd=` 无 `q` 的完整列表（相对路径），可建 `Set<relativePath>` 与 `basename → relativePaths[]` 映射。
- 校验时注意**相对/绝对归一**：索引给的是相对 cwd 的路径，候选解析结果多为绝对路径，需 `path.relative(cwd, candidate)` 或服务端再确认；统一走 `lib/paths.ts` 的既有比较工具，避免手写字符串前缀。
- `MAX_FILES=5000`（`route.ts:19`）会截断超大仓库；本仓库 834，无风险，但设计应说明超限时的降级（例如用 `?q=<basename>` 逐个确认，或只对可见消息校验）。

### 6.5 测试策略

- 纯函数单测（`lib/*.test.mjs`，jiti 加载 `.ts` 的既有模式）覆盖：apply_patch 结果文本 `add/update/delete/move` 四态、相对路径、部分失败只从 details 取、解析失败 isError、edit 失败文本带路径但被跳过、`details` 缺失时的文本回退、delete 排除。
- 用真实 session 片段作为 fixture（可从 §2 摘取，去除无关内容），避免凭空构造格式。
- 保留 `lib/turn-written-files.test.mjs` 全部现有用例为回归基线。

---

## 7. 风险清单

| 风险 | 说明 | 缓解 |
|------|------|------|
| R-1 delete 语义 | `delete:` / operation=delete 的文件已不存在，链接化会变成死链（且索引校验会挡掉，因为文件已删）。 | 明确排除 delete；R1 只列 add/update/move/write/edit。AC1 要求「delete 不出现或不可打开」。 |
| R-2 move 语义 | `move: <old> -> <new>` 行含**两个**路径，正则要取目标；且样本为 0，无实测格式（只从源码读）。 | 单测覆盖 `move` 行；优先用 `details.preview.files[].movePath`。 |
| R-3 相对路径 | summary 原文可能是相对路径（实测 23 次），必须用 cwd 解析；`cwd` 来自 message 的 cwd，可能为空。 | 传入 `messageCwd`；无 cwd 且是相对路径时不列（与现有 `resolveLocalFilePath` 行为一致）。 |
| R-4 版本漂移 | write 文本已从「带 bytes」变为「不带」（F10）；apply_patch 扩展未来也可能改 summary。 | 结构化 `details` 优先，文本只作回退；解析保持宽松并加测试。 |
| R-5 details 丢失 | 若其它 runtime/扩展版本不写 `details`，或 pi 未来不持久化 details，回退文本必须能工作。 | 双通道 + 单测覆盖 details 缺失路径。 |
| R-6 共享谓词副作用 | 把 apply_patch 加进 `isEditToolName` 会隐藏 MessageView 的 input `<pre>`（F11）。 | 新增独立谓词，不动现有 `isEditToolName` 语义；如需 apply_patch 折叠展示单独改 UI。 |
| R-7 Windows 路径 | summary 可能含 `C:\...` 或 `\\host\share`；`resolveLocalFilePath` 已处理，但 baseDir 若为空则相对 Windows 路径返回 `null`。 | 沿用 `resolveLocalFilePath`，不要自写正则；补 Windows cwd 单测。 |
| R-8 patch 正文反推不可靠 | 从 `*** Add File:`/`*** Update File:` 头部反推文件 ≠ 实际应用成功的文件（部分失败、hunk 顺序、`*** Move to:`）。PRD R1 已要求以结果文本为准。 | 只用 summary/details，不解析 patch 正文头部。 |
| R-9 索引截断/时序 | 新写入的文件在 `git ls-files --others` 中应立即可见，但 `/api/file-index` 有 10s 服务端缓存（`route.ts:24,117-129`）；刚写完立刻校验可能拿到旧列表。 | 校验前 invalidate 或允许「本轮写入文件」绕过索引（已知真实写过，不需索引证明）。 |
| R-10 edit 缺 path | 失败 edit 调用可能没有 `path`（§2.6）。 | 仅成功调用解析 path；失败一律跳过（现有逻辑已是）。 |

---

## 附：关键锚点快速索引

- pi write：`dist/core/tools/write.js:10,24,51,52`
- pi edit：`dist/core/tools/edit.js:18,66,84,135,138`
- apply_patch 扩展：`/home/xupeng/dev/personal/pi-extensions/pi-apply-patch/src/index.ts:18-22,298-311,1155-1191,1206-1233,1354-1356,1400-1403,1418-1424,1462-1493`
- pi-web 现状：`lib/tool-names.ts:9-27`、`lib/turn-written-files.ts:5-62`、`components/TurnWrittenFiles.tsx:13-45`、`components/MessageView.tsx:872,1071,1140,1396`、`components/ChatWindow.tsx:1200`、`lib/types.ts:83-92`、`lib/session-reader.ts:815`、`lib/file-links.ts:95-166`、`app/api/file-index/route.ts:19,48-60`
- 会话证据：`$SESS/2026-09-18T06-02-15-877Z_01a0b31b-c1c4-70fe-9c01-21d8ed51577c.jsonl:67-68`；`$SESS/2026-08-28T13-18-02-303Z_01a04885-2c3f-7340-b6b7-d0d05f519b7e.jsonl:228-233`；`$SESS/2026-08-29T09-06-15-316Z_01a04cc5-0494-7249-a8f0-c6ef7db46ed5.jsonl:47-56`；`$SESS/2026-08-29T07-39-11-015Z_01a04c75-4d27-7ca5-95d8-33e71f306b55.jsonl:432-433`；`$SESS/2026-08-26T12-15-39-737Z_01a03dff-58d9-7033-ba9f-266212181019.jsonl:67,81,637-638`
