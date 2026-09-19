# 研究：子代理写入文件的数据来源（PRD R2）

> 研究日期：2026-09-19。只读调研，未修改任何源码。
> 范围：PRD R2（子代理产物纳入本轮文件清单）+ 与之交织的「数据在渲染期是否可达」。
> R1/R4（`apply_patch` / 工具结果路径提取）见同目录 `tool-path-extraction.md`；
> R3/R5/R6/R7（渲染层链接化 / 索引 / 卡片 / 提示词）见 `render-index-card-surfaces.md`。
> 本文不重复这两份的结论，只在本文件内部给出 R2 所需的交叉引用。
>
> 会话根目录：`~/.pi/agent/sessions/`（下文称 `$SESSIONS`）。
> 抽样口径：全机 350 个 `.jsonl`，其中 55 个 session 含 `trellis_subagent` 轨迹，
> 16 个 session 含内建 `Agent`（`pi-web-subagent`）details。

---

## 0. 结论速览

| # | 结论 | 锚点 |
|---|------|------|
| C1 | **trellis 侧数据源成立且已在磁盘上**：`trellis_subagent` 的 toolResult `details.runs[].tools[]` 里 `write`/`edit` 条目携带 `{"path": "..."}`，足以提取文件路径；`runs[].finalText` 是每个 run 的终稿。 | `lib/trellis-subagent-records.ts:45`（`TrellisToolTrace`）、`.pi/extensions/trellis/index.ts:589`（`summarizeToolArgs`）；真实样本见 §1.3 |
| C2 | **但客户端解码器只保留最后 32 条工具轨迹**，会系统性丢路径：296 个含写入的 run 中，原始 1897 条不同路径被截到 1220 条（64%），117 个 run 丢路径，最坏 27→4。 | `lib/trellis-subagent-records.ts:20,276-282`；统计见 §1.2 |
| C3 | trellis 生产者 `summarizeToolArgs` 只抽取 `path`/`file_path`/`command`/`pattern`/`limit`/`offset`/`edits`/`content`，**不抽取 `apply_patch` 的 `input`**。当前 3 个 trellis agent 的 `tools` 里也没有 `apply_patch`，所以现状无碍，但一旦加了就会静默丢路径。 | `.pi/extensions/trellis/index.ts:589-607`、`.pi/agents/trellis-implement.md:4` |
| C4 | **内建 `Agent` 的子会话是真实 session 文件**，`details.sessionId` 等于子会话 `.jsonl` 头部 `id`，可服务端按 id 回读。实测 61 个已结束的内建 run 里 40 个在子会话中写了文件（551 `edit` + 129 `write`，504 相对 / 176 绝对路径，0 `apply_patch`）。 | `lib/subagent-extension.ts:20-32`、`lib/subagent-runtime.ts:261-277`、`lib/session-reader.ts:498`；真实样本见 §2.2 |
| C5 | **回读路径有实质缺陷**：`GET /api/sessions/[id]` 与 `/context` 默认只取 **最后 50 个 entry**。40 个有写入的子会话里 39 个末 50 条能命中至少一个 `write`/`edit`，但大量是「部分命中」（28 个变更只命中 9 个、20 个只命中 5 个），1 个完全落在窗口外。 | `app/api/sessions/[id]/route.ts:41-43`、`app/api/sessions/[id]/context/route.ts:24-25`；统计见 §2.3 |
| C6 | **推荐方案（对 R2）**：trellis 走「不截断的工具轨迹提取」；内建 `Agent` 走「子代理完成时在服务端把写入清单快照进 `details`」（`subagent-runtime.ts` 完成点已有 `inner.sessionManager`），而不是渲染期回读。 | §6 |
| C7 | 背景态（`run_in_background: true`）内建子代理的完成 details 落在 **`custom_message`（`pi-web:subagent-notification`）**，不是原 `Agent` toolResult；同轮归属会断。前台态（默认）无此问题。 | `lib/subagent-runtime.ts:558-565`、`lib/session-reader.ts:809-819`；见 §2.4 |
| C8 | **`finalText` 不是可靠路径源**：真实终稿里同一批路径会以 `src/style.scss:5891`（带行号）、`` `prd.md` ``（裸名）、`dist/index.html`（gitignored）、`npx sass src/style.scss`（命令片段）、`import.meta`（假阳性）等形态混杂出现。可作补充线索，不能作为唯一真相，且必须过索引校验。 | 真实样本 §1.3；索引校验见 `render-index-card-surfaces.md` |
| C9 | 索引侧无阻塞：`/api/file-index` 用 `git ls-files --cached --others --exclude-standard`，**未跟踪但不被 ignore 的文件（含当前 task 的 `prd.md`）也在内**，所以 trellis 场景的文件是可校验、可链接的。 | `app/api/file-index/route.ts`（`listWithGit`）；实测 `git ls-files` 输出见 §1.4 |

---

## 1. 数据源 A：`trellis_subagent` 轨迹

### 1.1 生产者结构（`.pi/extensions/trellis/index.ts`）

```ts
interface ToolTrace {                 // index.ts:123-133
  id: string;
  name: string;                       // 原始工具名，如 "write" / "edit"
  args: string;                       // 已是 JSON 字符串
  status: "running" | "succeeded" | "failed";
  startedAt: number;
  finishedAt?: number;
}
interface RunState {                  // index.ts:134-152
  id: string; agent: string; prompt: string; step?: number;
  status: "pending"|"running"|"succeeded"|"failed"|"cancelled";
  finalText: string; textTail: string; thinkingTail: string; stderrTail: string;
  tools: ToolTrace[]; usage: Usage; model?: string; thinking?: string; errorMessage?: string;
}
interface ProgressDetails {           // index.ts:150-158
  kind: "trellis-subagent-progress";
  agent: string; mode: "single"|"parallel"|"chain";
  startedAt: number; updatedAt: number; final: boolean;
  runs: RunState[];
}
```

`args` 由 `summarizeToolArgs(name, args)` 生成（`index.ts:589-607`），只挑白名单键：

```ts
if ("path" in a) summary.path = oneLine(a.path, 240);
if ("file_path" in a) summary.file_path = oneLine(a.file_path, 240);
if ("command" in a) summary.command = oneLine(a.command, 240);
...
if (name === "write" && "content" in a) summary.content = `<${len} chars>`;
// 无匹配键时退化为 {"tool": name}
```

写入点在 `tool_execution_start`（`index.ts:1354-1371`），状态在 `tool_execution_end` 改写为 `succeeded`/`failed`（`index.ts:1376-1387`）。因此：

- `write`/`edit` 的 trace 一定带 `path` 或 `file_path`（二者是 pi 内建 `write`/`edit` 的入参名）。
- 上限：`MAX_TOOL_ARG_CHARS = 2048`（`index.ts:93`，超长直接 `json.slice`，**可能把 JSON 切坏**）；`oneLine` 把路径截到 **240 字符**且无省略标记（`index.ts:583-587`）；每 run `MAX_TOOLS = 256`（`index.ts:94`）。
- `apply_patch` 的入参键是 `input`（整段 patch 文本），不在白名单里 → 若将来给 trellis agent 开 `apply_patch`，trace 只会得到 `{"tool":"apply_patch"}`。
- 当前 trellis agent 白名单不含 `apply_patch`：`.pi/agents/trellis-implement.md:4` / `trellis-check.md:4` 为 `read, write, edit, bash, find, grep`，`trellis-research.md:4` 为 `read, write, bash, find, grep`。

### 1.2 客户端解码边界——**这是本主题最大的坑**

`lib/trellis-subagent-records.ts` 是消费侧契约：

- `MAX_RETAINED_TOOL_TRACES = 32`（`:20`），`decodeTools` 只 `value.slice(-MAX_RETAINED_TOOL_TRACES)`（`:276-282`）→ **只保留每个 run 的最后 32 条工具轨迹**。
- `MAX_EXCERPT_LENGTH = 2_048`（`:24`），`decodeToolTrace` 对 `args` 取**头部** 2048（`:255-274`）。`argsTruncated` 会标记。
- `TrellisToolStatus = "running" | "succeeded" | "failed" | "unknown"`（`:39`）：原始 `status` 缺失/非法 → `unknown`（`:261-263`），**不会猜成成功**。
- `toolsOmitted`（`:110`、`:282`）= `原始数组长度 − 成功解码数`，既包含超 32 的部分，也包含未通过 `boundedId` 的畸形条目（`:255-258`）。它是「未保留数」，不是「超上限数」，不要当 `>=0 && toolsOmitted===0` 才可信。
- 历史投影 `projectTrellisSubagentHistory` 走同一解码器，所以**历史回放与实时流一样只看到末 32 条**。

全机 55 个含轨迹 session 的实测损失：

```
runs 总数                                     386
含 write/edit 的 run                          296
这些 run 原始不同路径数                        1897
经 32 条截断后剩下的不同路径数                  1220   (64.3%)
丢路径的 run                                  117
最坏一例（trellis-implement-1, 193 条工具）     27 → 4
tools.length > 32 的 run                       331 / 386
生产者侧 tools 最大值                           256（= MAX_TOOLS，已到顶）
路径长度最大                                   185 字符（240 截断未触发）
args ≥ 2048 的条数                              0（切坏 JSON 未实际发生）
```

**推论**：如果 R2 直接复用 `TrellisSubagentRecord.tools`，会系统性漏文件。要完整，需要一条**独立于展示上限**的提取：在 `decodeTools` 之前（或另开一个 helper）扫描原始 `details.runs[].tools[]` 的全部条目（生产者已封顶 256，可安全遍历），只取 `name ∈ {write, edit}` 且 `status === "succeeded"` 的 `path`/`file_path`。

### 1.3 真实数据验证

样本 1（本仓库，PRD 直接引用的 session）：
`$SESSIONS/--home-xupeng-dev-personal-forked-agegr-pi-web--/2026-09-18T06-02-15-877Z_01a0b31b-c1c4-70fe-9c01-21d8ed51577c.jsonl`

```json
{"kind":"trellis-subagent-progress","agent":"trellis-check","mode":"single","final":true,
 "runs":[{"id":"trellis-check-1","agent":"trellis-check","status":"succeeded","tools":[
   {"id":"...","name":"write",
    "args":"{\"path\":\".trellis/tasks/09-18-sync-upstream-post-v091/research/merge-check.md\",\"content\":\"<14588 chars>\"}",
    "status":"succeeded", ...}
 ], "finalText":"报告已写入：\n`.trellis/tasks/09-18-sync-upstream-post-v091/research/merge-check.md`\n\n**总判定：..."}]}
```

要点：**相对路径** `.trellis/...`，JSON 可解析，`path` 直接可用。

样本 2（跨项目，`write`/`edit` 混合）：

```
edit | {"path":"/home/xupeng/dev/douban/xupeng/doupi/packages/chat/src/ui/ChatScreen.tsx","edits":"3 edit(s)"} | succeeded
write| {"path":".trellis/tasks/08-28-introduce-vitest/design.md","content":"<... chars>"} | succeeded
edit | {"path":"src/style.scss","edits":"1 edit(s)"} | succeeded
```

样本 3（`finalText` 的路径形态，同一份终稿里全都有）：

```
未发现阻断性问题... `src/feed-content-font.test.mjs:54` ...（带行号）
普通回复正文与引用在 `src/style.scss:5891` 共用 ...（带行号）
... 见 `.trellis/tasks/08-30-ipad-mini-font-size/prd.md:62` ...（相对 + 行号）
生成 `dist/index.html`；...（gitignored 产物）
`NODE_ENV=test TZ=Asia/Shanghai npm run test:classification`（命令片段）
```

对 294 个「末 32 条内含写入」的 run 做轨迹 vs 终稿对比，可见两边互补、且两边都不完整：

```
轨迹有、终稿没提：  /tmp/subject-marking-width-check.py, /tmp/cdp-probe.js, ...
终稿提到、轨迹没有：src/layoutMode.ts, AppShell.test（无扩展名）, import.meta（假阳性）,
                    dist/index.html, .search-page__header/.tabs/...（CSS 类名）, npx sass src/style.scss
```

**所以：`finalText` 只能当补充信号，且必须过索引校验 + 去掉 `:行号` 后缀 + 过滤 `/tmp` 等 cwd 外路径。**

### 1.4 trellis 路径的可解析性

- `path` 相对形（`src/style.scss`、`.trellis/...`）以 **trellis root** 为基准。
  trellis root 由 `findRoot(ctx.cwd)` 决定——向上找最近的含 `.trellis/` 目录（`.pi/extensions/trellis/index.ts:975-990`）。
  本仓库 session 的 cwd 就是仓库根，所以 root == cwd；**若 session cwd 是项目子目录，两者会不同**，这是相对路径解析的一个真实风险。
- 绝对形（`/home/xupeng/...`、`/tmp/...`）需要过滤到 cwd 之内（或用 `isPathWithinRoots`）。
- 索引可校验：本仓库 `git ls-files --cached --others --exclude-standard` 输出 836 条，其中包含未跟踪的任务文件：
  ```
  .trellis/tasks/09-19-clickable-file-paths/prd.md
  .trellis/tasks/09-19-clickable-file-paths/task.json
  ```
  即 R3/R7 的「先索引校验再链接」对本场景成立。`/api/file-index` 的 `listWithGit` 用的正是这条命令（`app/api/file-index/route.ts` 的 `listWithGit`）。

---

## 2. 数据源 B：内建 `Agent` 的子会话回读

### 2.1 `details` 结构与 `sessionId` 语义

```ts
export interface SubagentToolDetails {        // lib/subagent-extension.ts:20-32
  kind: "pi-web-subagent";
  sessionId: string;
  profile: string; description: string;
  status: SubagentRunInfo["status"];          // starting|running|completed|failed|aborted|interrupted|queued
  runInBackground: boolean;
  createdAt: string; completedAt?: string; error?: string;
  worktreePath?: string; worktreeBranch?: string; worktreeCleanupError?: string;
}
export function subagentToolDetails(run: SubagentRunInfo): SubagentToolDetails { ... }  // :89-101
```

来源链路：

- `Agent` 工具的 `execute` 在完成时返回 `{ content:[{type:"text",text:subagentFinalText(run)}], details: subagentToolDetails(run) }`（`lib/subagent-extension.ts:208-213`）。
- `run.sessionId` 在 `subagent-runtime.ts` 的 `initialRun` 里赋值为 `inner.sessionId`（`lib/subagent-runtime.ts:261-277`），`inner` 由 `createAgentSessionFromServices(...)` + `SessionManager.create(parent.cwd, ..., { parentSession: parent.sessionFile })` 创建（`lib/subagent-runtime.ts:236-258`）。
- 所以 `details.sessionId` **就是子会话 `.jsonl` 头部 `id`**。真实样本佐证：
  ```
  父 session: --home-xupeng-dev-douban-xupeng-banban--/2026-09-11T03-44-06-428Z_01a08e90-...jsonl
    toolResult details: {"kind":"pi-web-subagent","sessionId":"01a08e91-4df7-73bc-ae8b-e73c82d997e6", ...}
  子 session 头: {"type":"session","version":3,"id":"01a08e91-4df7-73bc-ae8b-e73c82d997e6",
                  "cwd":"/home/xupeng/dev/douban/xupeng/banban","parentSession":".../2026-09-11T03-44-06-428Z_01a08e90-....jsonl"}
  ```
- 另有更强的关联键：子会话 `.jsonl` 里有 `pi-web:subagent` 自定义 entry（`SUBAGENT_META_TYPE`，`lib/subagents.ts:12,44`），携带 `parentSessionId` + `parentToolCallId`；`readSubagentRun` 可据此还原（`lib/subagents.ts:566`）。即「没有 sessionId 也能反查」，但 `sessionId` 本就够用。
- `SubagentRunInfo` 还带 `sessionPath`（`lib/subagents.ts:90-105`），但 `subagentToolDetails` **没有把它发给客户端**——客户端只有 `sessionId`。

### 2.2 真实数据验证（写入确实发生在子会话里）

全机 61 个 `status !== "running"` 的内建 run，按 `details.sessionId` 定位子文件后统计：

```
子会话中工具名计数: bash 1583, read 2316, grep 16, edit 551, write 129, ls 26, find 10
含 write/edit 的 run: 40 / 61
路径形态: 相对 504, 绝对 176, apply_patch 0
样本: edit: src/api.ts / edit: src/App.tsx / write: src/homeAuthRecovery.test.mjs / edit: package.json
```

结论：**内建 `Agent` 的写入明细不在父会话里，只在子会话文件里**；`Agent` toolResult 的 `content[].text` 只有终稿（`subagentFinalText`），`details` 只有元数据（见 2.1），所以 R2 必须靠回读子会话（或等价的服务端快照）。

### 2.3 回读路径与缺陷：默认 `tail=50`

可用的服务端读取能力：

- `resolveSessionPath(sessionId)`（`lib/session-reader.ts:498-514`）→ 先走 `findSessionPathById`（`:413-450`，按文件名后缀 `_<id>.jsonl` 逐项目目录 readdir + 读 header 校验），失败再 `listAllSessions()` 全量扫描。命中后写入 `globalThis.__piSessionPathCache`。
- 实测成本：`$SESSIONS` 全部 `readdir`（26 个项目目录 / 350 文件）约 **1ms**；`findSessionPathById` 不做文件内容全读，只读 header 首行，成本极低。
- 路由：
  - `GET /api/sessions/[id]`（`app/api/sessions/[id]/route.ts:41`）→ `buildSessionContext(entries, leafId, { tail })`，`tail` 默认 **50**、上限 1000（`:41-43`）。
  - `GET /api/sessions/[id]/context`（`app/api/sessions/[id]/context/route.ts:24-25`）同样 `tail` 默认 50、上限 1000。
  - `lib/session-reader.ts:621-643` 的 `buildSessionContext` 只把 `sliceActiveBranch(entries, leaf, tail)` 转成 UI 消息。

**关键缺陷**：`tail=50` 会丢变更。40 个有写入的子会话实测：

```
全部 40 个都至少有一个 write/edit 落在「末 50 entry」之外？                    1 个 run 完全落在窗口外
部分命中举例:
  entries=215, 28 个变更 → 只有 9 个在末 50
  entries=158, 20 个变更 → 只有 5 个
  entries=171, 11 个变更 → 只有 4 个
子会话最大 entry 数: 422（> 1000 上限的样本未出现）
```

即便把 `tail` 提到 1000 能覆盖现有样本，也意味着**每次渲染都要为一个可能几百条消息的子会话传回整段上下文**（含工具结果、图片、thinking），代价与缓存复杂度都不可接受。

### 2.4 背景态断链（重要边界）

- 前台（`run_in_background: false`，默认）：`Agent` toolResult 直接带 completed details → 与调用同轮，可归入本轮文件清单。
- 背景（`runInBackground: true`）：toolResult 是 `"Subagent started in background. Session ID: ..."`，`status: "running"`，**没有写入信息**。真正的完成 details 通过 `notifyParent` → `sendCustomMessage({ customType: "pi-web:subagent-notification", details: subagentToolDetails(run) }, { deliverAs:"followUp", triggerTurn:true })`（`lib/subagent-runtime.ts:558-565`）在**后续轮次**送达。
- 该完成 details 会持久化为 `custom_message` entry，`session-reader` 映射为 `{role:"custom", customType:"pi-web:subagent-notification", content, display, details}`（`lib/session-reader.ts:809-819`）。真实样本：
  ```json
  {"type":"custom_message","customType":"pi-web:subagent-notification","display":true,
   "content":"只读审查发现 2 个问题；...",
   "details":{"kind":"pi-web-subagent","sessionId":"01a09d8d-...","status":"completed",
              "runInBackground":true,"createdAt":"...","completedAt":"..."}}
  ```
- 含义：**背景子代理的文件无法归属到发起它的那个回合**（跨轮），任何「本轮文件清单」方案都要先明确这一点（要么不列入、要么在通知轮展示）。

### 2.5 更优替代：完成时快照进 `details`（推荐）

不需要渲染期回读。子代理完成点已经有子会话的完整 entry：

- `lib/subagent-runtime.ts:531` 已在用 `wrapper.inner.sessionManager.getEntries()`（`get()` 路径）。
- `AgentSessionLike.sessionManager: SessionManager` 是声明字段（`lib/pi-types.ts:142`），`inner` 在 `execute()` 的 `finally` 前后都可用（`lib/subagent-runtime.ts:340-372`）。
- 因此可在构造 `result` 时顺手扫一遍子会话 entries，把 `write`/`edit`/`apply_patch` 的成功路径写进 `SubagentRunInfo`，再由 `subagentToolDetails` 增列一个可选字段（如 `writtenFiles: string[]`）。
- details 会被持久化（`toolResult.details` 与 `custom_message.details` 都保留），所以**实时流、历史回放、前台、背景四种情况一次性覆盖**，且零额外 I/O、零新路由、零 tail 截断。
- 代价：需要改 `lib/subagent-extension.ts`（details 契约，纯增量可选字段）+ `lib/subagent-runtime.ts`（完成时提取）；旧会话无该字段 → 降级为「不列/只靠 finalText 线索」。
- `writtenFiles` 的提取逻辑可与 R1 的 `extractTurnWrittenFiles` 共用同一套「工具调用 → 路径」纯函数（见 `tool-path-extraction.md`）。

---

## 3. 父回合渲染期数据是否可达

### 3.1 `hooks/useAgentSession.ts`

- `messages: AgentMessage[]`（`:317`）+ `activeToolResults: Map<string, ToolResultMessage>`（`:318`）。
- `activeToolResults` **只缓存流式过程中的 bash/powershell 部分结果**（`:1750-1766`），不是通用 toolResult 仓库。
- 完成消息在 `message_end` 落 `messages`：`toolResult` 分支会 `normalizeToolCalls(completed)` 后 append（`:1729-1739`）。
- `lib/normalize.ts:44-52`：`normalizeToolCalls` **只重写 assistant**，非 assistant 角色（含 `toolResult`）原样返回 → **`details` 完整保留**。
- `custom_message` 不进 `activeToolResults`，而是作为 `{role:"custom", ...details}` 进 `messages`（§2.4）。
- SSE 侧还有 `ingestTrellisToolDetails(...)`（`:1735-1740`、`:1826-1846`），但那是给 Trellis 面板的独立 store，不是本轮的 toolResults。

**结论**：渲染期在 `messages` 里能拿到 `trellis_subagent` / `Agent` 的完整 `details`（含 `runs[].tools[]` 或 `sessionId`）。

### 3.2 `components/ChatWindow.tsx`

- `toolResultsMap`（`:729-738`）= `activeToolResults` + 所有 `role === "toolResult"` 的 `messages`，键为 `toolCallId`。**trellis/Agent 的 details 在此可见。**
- 回合文件清单调用点（`:1192-1204`）：
  ```ts
  const turnContent: AssistantContentBlock[] = [];
  for (let i = userIdx + 1; i <= finalAssistantIdx; i++)
    if (messages[i]?.role === "assistant")
      for (const b of messages[i].content ?? []) turnContent.push(b);
  const writtenFiles = extractTurnWrittenFiles(turnContent, toolResultsMap, messageCwd);
  ```
  `turnContent` 覆盖整轮所有 assistant toolCall 块，`toolResultsMap` 覆盖其所有结果 → **扩展示配 `trellis_subagent` / `Agent` 所需的一切输入都在手边**，无需新增 hook 或跨层传递。
- 渲染出口：`MessageView.tsx:872-874` → `TurnWrittenFiles`（`components/TurnWrittenFiles.tsx`）。

### 3.3 `lib/turn-written-files.ts` 现状

- `isFileWritingToolName`（`:13-15`）= `isWriteToolName || isEditToolName`，`lib/tool-names.ts` 只认 `write`/`edit` 家族，不含 `apply_patch`，也不含任何子代理工具。
- `readToolPath`（`:17-21`）只读 `input.file_path ?? input.path`。
- 循环只遍历 `content` 的 `toolCall` 块，且要求 `toolResults?.get(block.toolCallId)` 存在、`!result.isError`（`:40-46`）。

→ R2 的扩展点就是这里：为 `trellis_subagent` / `Agent` 的 toolCall 增加一条「从 toolResult.details 派生文件」的分支（并复用索引校验/去重/解析）。

### 3.4 `components/AgentSessionPanel.tsx` 拿不到

`Props` 只有 `rootSession: SessionInfo` + `subagents: SessionInfo[]`（`:7-13`）+ running/selected 集合。`SessionInfo` 只有元数据（`relation.profile/description/status`、`modified`、`name`、`firstMessage`），**没有任何工具轨迹或消息**。它只能证明「内建子代理是真实 session、有 relation」（`lib/session-family.ts:32-36`），不能作为文件明细来源。

---

## 4. 服务端「按 sessionId 读取任意会话（含子会话）」能力盘点

| 能力 | 位置 | 是否覆盖子会话 | 限制 |
|---|---|---|---|
| 按 id 解析路径 | `lib/session-reader.ts:498` `resolveSessionPath` | 是（`findSessionPathById` 按文件名 + header 校验；回退全量扫描） | 命中缓存于 `globalThis.__piSessionPathCache`；未命中要 `listAllSessions()` |
| 详情/上下文 | `GET /api/sessions/[id]`、`/api/sessions/[id]/context` | 是 | `tail` 默认 50、上限 1000（§2.3） |
| 单 entry 附件 | `/api/sessions/[id]/entries/[entryId]/thinking`、`/tool-result-image` | 是 | 仅按 entry 取附件，不能列 entry |
| 会话列表 | `listAllSessions()` + `lib/session-list-cache.ts` | 是（子会话在列表里，带 `relation`） | 只有 summary，无工具明细 |
| 「列出某 session 全部原始 entry」路由 | — | **不存在** | 需要新路由或改用 2.5 的快照 |
| 「Trellis 记录」投影 | `projectTrellisSubagentHistory`（`/api/sessions/[id]`、`/context` 附加字段） | 仅父会话 | 只为 `trellis_subagent` 服务，且受 32 条截断（§1.2） |

**成本评估（回读方案）**：
- 路径解析：冷启动 1 次 readdir + header 读，实测 ~ms 级；之后命中内存缓存。
- 内容读取：`SessionManager.open(path).getEntries()` 会**整文件解析**（子会话最大 422 entry，未测字节数；含工具结果与图片时可能数百 KB～MB 级）。若做成渲染期每次请求都读，需要按 `(sessionId, mtime)` 缓存已提取的 `writtenFiles`，否则成本随消息数线性放大。
- 在「完成时快照」（2.5）方案下，上述成本全部消失（提取只发生在子代理结束的那一刻，且此时 entries 已在内存）。

---

## 5. 可行性对照表

| 维度 | A. trellis 轨迹（`details.runs[].tools[]`） | B1. 完成时快照进 details（推荐，内建 Agent） | B2. 服务端按 id 回读子会话 | B3. 客户端按 id 回读（`/api/sessions/[id]`） |
|---|---|---|---|---|
| 数据现成度 | 已在持久化 JSONL 里 | 需小改 `subagent-extension.ts` + `subagent-runtime.ts` | 数据在子会话文件里 | 同 B2 |
| 覆盖前台 | 是 | 是（toolResult.details） | 是 | 是 |
| 覆盖背景 | 不涉及（trellis 自身机制） | 是，但落在 `custom_message`，跨轮（§2.4） | 是 | 是 |
| 实时流可用 | 是（partial details 已带 runs） | 是（完成时即有） | 否（要等落盘） | 否 |
| 历史回放可用 | 是 | 是（details 已持久化） | 是 | 是 |
| 完整性 | **受 32 条截断**（1897→1220，117 run 丢路径）；需绕开 `decodeTools` | 完整（子会话全量 entries 在内存） | 完整（若 `tail` 足够大） | 同 B2 |
| 每文件路径可靠性 | `write`/`edit` 高；`finalText` 低 | 高（直接读 toolCall input） | 高 | 高 |
| 额外 I/O / 路由 | 无 | 无 | 需新路由或 `tail=1000`，需缓存 | 复用现有路由，但要 `tail=1000` 大 payload |
| 改动面 | 仅 `lib/turn-written-files.ts`（+ 一个不截断的提取 helper） | 2 个 lib 文件（可选字段，向后兼容） | 1 个路由 + 缓存 + 客户端 | 客户端 + 缓存 |
| 旧会话回溯 | 是（已持久化即可） | 否（旧 details 无新字段） | 是 | 是 |
| 归属本轮 | 是（toolCall 同轮） | 前台是；背景跨轮 | 是（调用点同轮） | 是 |
| `apply_patch` 覆盖 | 生产者不抽 `input`，现状 agent 也未开该工具（C3） | 取决于提取函数（可覆盖） | 取决于提取函数 | 同 B2 |
| 成本稳定性 | O(256)/run | O(entries) 一次 | O(entries) 每次 + 缓存 | 同 B2 + 网络 |

### 交叉引用（本文不重复）

- 内建 `write`/`edit`/`apply_patch` 的入参/结果文本形态、`details.preview.files[]` 的 `added/removed`：
  见 `tool-path-extraction.md`（F1–F8）。**注意该文 F4 指出 apply_patch 结果路径既有绝对也有相对**，
  与本文 §1.4 trellis 侧同样的相对性问题一致。
- 索引获取与缓存通道、`<pre>` 分段渲染、卡片改造面：见 `render-index-card-surfaces.md`。

---

## 6. 推荐方案（R2）

**推荐组合：A（trellis 轨迹）+ B1（内建 Agent 完成时快照）。**

1. **trellis（A）**：在 `extractTurnWrittenFiles` 之外新增一个纯函数，直接从 toolResult.details 提取：
   - gate：`block.toolName === "trellis_subagent"` 且 `isTrellisSubagentDetails(details)`（严格双重 gate，沿用 `lib/trellis-subagent-records.ts:239-241` 的既定契约）；
   - 对 `details.runs[]` 的**全部** `tools`（不经过 `decodeTools` 的 32 条截断）取 `name ∈ {write, edit}` 且 `status === "succeeded"`；
   - `JSON.parse(args)` 取 `path ?? file_path`（`try/catch` 兜底；`argsTruncated` 时忽略或退化到正则）；
   - 若愿意，可增设上限常量（例如复用/新增 `MAX_EXTRACTED_TOOL_TRACES`）替代「末 32 条」，但要意识到生产者已有 256 封顶。
   - `finalText` 作为**可选补充**：抽 `\`...\`` 内的路径 token、剥掉 `:行号`、过 cwd 内 + 索引校验；仅用于轨迹缺失时兜底，绝不可作为唯一来源。
2. **内建 Agent（B1）**：在 `subagent-runtime.ts` 的完成分支把子会话的写入路径快照进 `SubagentRunInfo`，`subagentToolDetails` 增一个可选 `writtenFiles?: string[]`（向后兼容）；客户端优先读该字段，缺失时不回读（或按需回读，见下）。
   - 前台：`Agent` toolResult.details 直接可用。
   - 背景：完成 details 在 `pi-web:subagent-notification` 的 `custom_message` 上（`role:"custom"`, `customType`），客户端抽取时要额外遍历这类消息；归属到通知所在轮，并在 UI 上说明是「后台子代理产物」。
3. **不推荐 B2/B3 作为主路径**：`tail` 截断 + 大 payload + 需要缓存，收益低于 B1。若必须覆盖「B1 上线前的历史会话」，可做**惰性的、按 `(sessionId, mtime)` 缓存的**服务端回读，且显式接受 `tail` 上限带来的不完整。

---

## 7. 风险与「不可靠路径」清单

### 7.1 必须视为不可靠 / 需过滤的路径来源

| 来源 | 不可靠点 | 处理建议 |
|---|---|---|
| `runs[].finalText` 里的裸 token | `import.meta`、`.search-page__header/.tabs/...`、`AppShell.test`（无扩展名）、命令片段 `npx sass src/style.scss`、`src/foo:5891`（带行号） | 只在 `\`...\`` 内取、剥 `:行号`、要求有已知扩展名、过索引校验 |
| `finalText` 里的 gitignored 产物 | `dist/index.html`、`dist/.neogen-build.json`、`.env.local` 不在 `git ls-files` 索引里 | 索引校验天然过滤；不要为它们造链接 |
| trellis 轨迹里的 `/tmp/*` | 属 scratch 脚本，不在 cwd / 不在索引 | 用 `isPathWithinRoots`（cwd 内）+ 索引双重过滤 |
| trellis 轨迹里的相对路径 | 基准是 **trellis root**（`findRoot(ctx.cwd)`）；session cwd 是项目子目录时会与 cwd 不一致 | 校验解析结果是否落在 cwd；不一致时按 cwd 解析或丢弃 |
| 生产者 `oneLine(..., 240)` | 路径 > 240 字符**静默截断**，无标记 | 解析后用索引校验会自然失败；不要尝试修补 |
| 生产者 `json.slice(0, 2048)` | 极端超长 args 可能把 JSON 切坏 | `try/catch`，失败即跳过该 trace |
| `toolsOmitted` / `argsTruncated` | `toolsOmitted` 混了「超上限」与「畸形」两种语义 | 不要用它推断是否完整；完整性用「是否存在截断」单独表达 |
| `delete:` / `apply_patch` 的删除 | 删除不是「已写入的可打开文件」（AC1） | 只收 `add:`/`update:`（apply_patch）；trellis 只收 `write`/`edit` 成功 |
| `status` 非 `succeeded` | `running` 表示结果还没结束；`failed` 没写成；`unknown` 不可信 | 只收 `succeeded`；`unknown` 默认丢弃 |
| 内建 `Agent` 背景 run | 完成 details 在后续轮的 `custom_message`，**不在发起轮** | 归属通知轮；或在发起轮明确显示「后台运行中，完成后列出」 |
| 子代理被中断/会话中断 | 若 toolResult 从未落盘（如本仓库 2026-09-18 session 中 `trellis-implement` 的调用无结果），轨迹不存在 | 无数据即不列，不要从用户正文反推 |

### 7.2 工程风险

1. **重复/覆盖语义**：同一路径被多个子代理写、或父回合自己也写了，需要按「首次出现」或「最后一次」统一排序（现有 `extractTurnWrittenFiles` 是首次出现去重，`lib/turn-written-files.ts:36-57`）。
2. **Trellis 生产者契约**：`lib/trellis-subagent-records.ts` 的模块注释与 `.trellis/spec/frontend/trellis-subagent-records.md` 明确「producer 不被修改」「不新增 producer 接口」。R2 应**只消费** `details`，不要改 `.pi/extensions/trellis`；因此绕开 32 条截断应在 pi-web 侧新增提取函数，而不是改 `decodeTools` 的展示上限（后者会改变既有面板的行为与测试断言）。
3. **内建 `Agent` details 契约变更**：新增可选字段属纯增量；但要同步 `lib/subagent-extension.ts` 的 `SubagentToolDetails` 与任何基于它的测试/快照。背景通知详情同样要带上该字段（`notifyParent` 已复用 `subagentToolDetails`，自动一致）。
4. **索引在消息渲染链上缺失**：目前 `ChatWindow` 不取 `/api/file-index`（`render-index-card-surfaces.md` 已详述），R2 的提取要与 R3/R7 共享同一份索引/缓存通道，否则会出现「清单有文件但不可点」或反之。
5. **每文件 `±` 统计（R5）**：`--numstat` 是 git 工作树状态，不是本轮 delta；子代理写入的文件同样只能标工作树状态（`render-index-card-surfaces.md`）。R2 只负责「列出」，不要越界承诺 delta。

---

## 8. 证据索引

### 源码

- `lib/subagent-extension.ts:20-32,89-101,170,189,204-213,253` — 内建 Agent details 结构与产出点
- `lib/subagent-runtime.ts:236-277,340-372,531,541,558-565` — 子会话创建、`sessionId` 来源、`getEntries()` 与通知 details
- `lib/subagents.ts:12-14,44-56,90-105,566-590` — `pi-web:subagent` 元数据 / `SubagentRunInfo` / `readSubagentRun`
- `lib/pi-types.ts:131-142` — `AgentSessionLike.sessionManager/sessionId/sessionFile`
- `lib/trellis-subagent-records.ts:20,24,39,45-53,110,239-241,255-282` — 客户端解码契约与截断
- `.pi/extensions/trellis/index.ts:93-94,123-158,583-607,1354-1387` — 生产者 `ToolTrace`/`summarizeToolArgs`/上限/写入点
- `.pi/agents/trellis-implement.md:4`、`trellis-check.md:4`、`trellis-research.md:4` — trellis agent 工具白名单（无 `apply_patch`）
- `lib/turn-written-files.ts:13-21,30-59`、`lib/tool-names.ts` — 现状提取器与工具名谓词
- `hooks/useAgentSession.ts:317-318,1729-1740,1750-1766`、`lib/normalize.ts:44-52` — 消息/details 保留
- `components/ChatWindow.tsx:729-738,1192-1204`、`components/MessageView.tsx:872-874`、`components/TurnWrittenFiles.tsx` — 渲染接入点
- `components/AgentSessionPanel.tsx:7-13`、`lib/session-family.ts:32-36` — 面板数据面只有 `SessionInfo`
- `lib/session-reader.ts:413-450,498-514,621-643,809-819` — 按 id 解析、context 构建、`custom_message` 映射
- `app/api/sessions/[id]/route.ts:41-43`、`app/api/sessions/[id]/context/route.ts:24-25` — `tail` 默认 50 / 上限 1000
- `app/api/file-index/route.ts`（`listWithGit`）— 索引含 untracked 非 ignore 文件

### 会话证据（`$SESSIONS`）

- `--home-xupeng-dev-personal-forked-agegr-pi-web--/2026-09-18T06-02-15-877Z_01a0b31b-c1c4-70fe-9c01-21d8ed51577c.jsonl`
  — PRD 直接引用；`trellis_subagent` details 里 `write` 的 `path = .trellis/tasks/09-18-sync-upstream-post-v091/research/merge-check.md`；同 session 的 `apply_patch` 结果文本 `update: /abs/...md`（R1 证据，另见 `tool-path-extraction.md`）
- `--home-xupeng-dev-douban-xupeng-banban--/2026-09-11T03-44-06-428Z_01a08e90-...jsonl`
  — 内建 Agent 前台 run；`details.sessionId = 01a08e91-4df7-73bc-ae8b-e73c82d997e6`，子文件头 `id` 一致
- `--home-xupeng-dev-personal-jingwei--/2026-09-13T22-56-18-861Z_01a09cfc-...jsonl`
  — 背景 run 的完成详情落在 `custom_message`（`pi-web:subagent-notification`）的 `details`

### 统计口径复现

- trellis：全机 55 个含 `trellis-subagent-progress` 的 session → 386 runs / 296 含 write-edit / 1897 原始路径 / 1220 经 32 截断 / 117 runs 丢路径 / 最大 256 tools / 最大路径 185 字符
- 内建 Agent：61 个 `status !== "running"` run → 40 含写入 → 551 `edit` + 129 `write`（504 相对 / 176 绝对 / 0 `apply_patch`）；末 50 entry 命中 39/40（多为部分命中），子会话最大 422 entry
- 索引：`git ls-files --cached --others --exclude-standard` = 836 条，含未跟踪的 `.trellis/tasks/09-19-clickable-file-paths/prd.md`
