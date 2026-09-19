# upstream/main → personal 合并分析（为 @xup3ng/pi-web 0.9.5 建立基线）

- 分析对象：`upstream`（https://github.com/agegr/pi-web.git）`main` 相对 `personal`（本地 fork，https://github.com/xupeng/agegr-pi-web.git）落后的提交。
- 分析性质：**只读**。未 push、未 publish、未改版本号、未修改主 checkout 的任何被跟踪文件。
- 分析时间基线：`personal` = `2415bdb`；`origin/main` = `main` = `d11d344`；dry-run 使用的 `upstream/main` = `5e9b997`。
- 所有命令均在 `/home/xupeng/dev/personal/forked/agegr-pi-web` 执行。

---

## 0. TL;DR（给决策用）

| 项 | 结论 |
|---|---|
| 落后提交数 | **任务书写的 20 个**（边界 commit `d11d344`）已过时；本次 `git fetch` 后 `upstream/main` 实际为 **27 个**（`5e9b997`） |
| merge commit | **0 个**（27 个全是普通提交，无上游合并历史） |
| 合并体积 | 81 个文件，+3173 / −587；新增 18 文件，**删除 0 文件** |
| `package.json` / 锁文件 / next/eslint/tsconfig / `.github` | **range 内全未被改动** → 合并零依赖漂移，不需要 `npm install` 升级、不需要重生成锁 |
| 真实冲突 | 27 提交：**14 个文件**；20 提交：12 个文件（多出的 2 个由 `#841` PDF 链接引入） |
| 冲突性质 | 几乎全是「personal 的 fork 特性」×「上游同文件新特性」的空间并存（签名扩展、import 表、组件分支），**没有 `package.json` 冲突、没有 add/add 冲突、没有 deleted-by-us/them** |
| fork 资产风险 | 包名/版本/bin/`public/fonts`/`.trellis`/`.pi` 全部**不在**上游改动范围内；`.pi/agents/trellis-*.md` 的未提交本地修改**不被触碰** |
| 主要真实风险 | ① `sliceActiveBranch` 这类「同一函数双方都改」的自动合并需逐条复核；② `lib/model-runtime.ts`（上游新增）与 `lib/provider-listing-runtime.ts`（personal 自有）并存，需确认职责；③ 14 个冲突文件里 `components/MessageView.tsx`（6 处）与 `hooks/useAgentSession.ts`（3 处）解冲突成本最高 |
| 建议 | 合并目标锁定**当前** `upstream/main`（27 个），一次做完，避免二次同步；先打本地 tag 锚点，冲突在隔离 worktree 预演过（tree `54e53ad8bf709594e23f0aab41dacf0e21ccb821`） |

---

## 1. 事实快照与前置核对

```text
$ git branch --show-current                      → personal
$ git rev-parse HEAD                             → 2415bdb32847ff1ae5842d84efc049678b846ae9
$ git merge-base personal upstream/main          → 860698a6573e63a2432157676a5ac9bc9ce54044
$ git log -1 --format='%h %s %ci' 860698a        → 860698a feat: add extension widget font size setting (#733) 2026-09-16 23:38:02 +0800
$ git rev-list --count personal..upstream/main   → 27   （fetch 前为 20）
$ git rev-list --count upstream/main..personal   → 107  （fork 侧独有提交）
$ git log --merges --oneline personal..upstream/main → （空：无 merge commit）
$ git diff --shortstat 860698a..upstream/main    → 81 files changed, 3173 insertions(+), 587 deletions(-)
$ git diff --name-status 860698a..upstream/main --diff-filter=D → （空：上游未删除任何文件）
```

### 1.1 「20 个提交」与「27 个提交」的关系

任务书里的 20 个提交 = `personal..d11d344`（`origin/main`、本地 `main` 当前所指）。本次为取得上游最新状态执行了一次 fetch，`upstream/main` 前进到 `5e9b997`，增量 7 个：

| # | 短 hash | 标题 |
|---|---|---|
| 21 | `f2d600b` | feat(chat): add /auto-compact slash command to toggle auto-compaction (#828) |
| 22 | `79894b9` | fix(models): include extension-registered providers in settings and auth routes (#833) |
| 23 | `c844973` | fix: surface when a response is truncated by the output limit (#830) |
| 24 | `afd2575` | fix(plugins): run npm update checks without the npm.cmd shim on Windows (#837) |
| 25 | `002400d` | fix(streaming): stop duplicating the first streamed chunk (#835) |
| 26 | `8df5132` | fix: preserve extension widget order on updates (#839) |
| 27 | `5e9b997` | fix(file-viewer): honor #page= fragments in PDF links (#841) |

影响：多出 **2 个冲突文件**（`components/AppShell.tsx`、`components/ChatWindow.tsx`，均由 `#841` 改 `onOpenFile` 签名引起）。其余 5 个为小范围修复。

### 1.2 本次分析对仓库状态的唯一改动（必须知情）

- `git fetch upstream main:refs/heads/tmp-upstream-probe` 拉取了上游新提交：`refs/remotes/upstream/main`、`refs/remotes/upstream/HEAD` 从 `d11d344` 更新为 `5e9b997`；随后已 `git branch -D tmp-upstream-probe` 删除临时分支。
- **未改动**任何被跟踪文件、`HEAD`、`personal`、`main`、`origin/*`。
- 该 ref 更新是有意保留的（否则与真实远端不一致）；如执行者希望回到「20 个提交」的旧视图，可用 `git update-ref refs/remotes/upstream/main d11d344` 还原（不推荐）。

---

## 2. 27 个提交完整清单

模块归属按主改动文件判定；`files` = `git show --stat --format= --name-only | grep -c .`。

| # | hash | 标题 | merge? | files | 模块归属 / 主要路径 |
|---|------|------|--------|-------|--------------------|
| 1 | `b42d3f4` | Keep user-opened tools expanded across streaming updates (#743) | 否 | 3 | 消息渲染：`components/MessageView.tsx`、`lib/tool-call-expansion.{ts,test.mjs}` |
| 2 | `e70c367` | Render apply_patch tool calls (GPT) as split diffs (#744) | 否 | 7 | apply_patch：`lib/apply-patch.*`、`lib/tool-names.ts`、`lib/turn-written-files.*`、`MessageView` |
| 3 | `d2056b6` | feat: preview image attachments in the chat composer (#735) | 否 | 2 | 输入框：`components/ChatInput.tsx`、`ImagePreview.test.mjs` |
| 4 | `3f07a5f` | Show the reasoning level of the running turn (#777) | 否 | 13 | 模型/推理级别：`app/api/models/route.ts`、`ChatInput`、`ChatWindow`、`useAgentSession`、`models-cache`、i18n×3 |
| 5 | `b44017a` | fix: see sessions written by another pi process (#796) | 否 | 12 | 会话读取/流：`app/api/sessions/[id]/route.ts`、`lib/session-reader.ts`、`lib/rpc-manager.ts`、`lib/agent-event-stream.ts`、`useAgentSession`、`e2e/run.mjs` |
| 6 | `5b96a9d` | docs(AGENTS): document PI_WEB_IDLE_TIMEOUT_MS… (#819) | 否 | 1 | 文档：`AGENTS.md` |
| 7 | `6edbecb` | docs(AGENTS): sync API file map with app/api routes (#820) | 否 | 1 | 文档：`AGENTS.md` |
| 8 | `ed7a4d7` | docs(AGENTS): list plugin-updates helper in lib file map (#821) | 否 | 1 | 文档：`AGENTS.md` |
| 9 | `ffb2daf` | Add a full-width toggle to the file panel (#790) | 否 | 8 | 文件面板：`AppShell.tsx`、`globals.css`、i18n×3、`e2e/file-panel.mjs`（新）、`e2e/run.mjs` |
| 10 | `47a0bb2` | fix: use crypto randomUUID for manual-code tokens (#811) | 否 | 1 | 认证：`app/api/auth/login/[provider]/route.ts` |
| 11 | `1f79174` | fix: close SSE streams on shutdown so Next 16 drain cannot strand a zombie node (#809) | 否 | 2 | 生命周期：`instrumentation.ts`、`lib/agent-event-stream.ts` |
| 12 | `50a2fd4` | fix: count only visible messages toward the session tail budget (#810) | 否 | 2 | 会话读取：`lib/session-reader.ts`、`session-reader.pagination.test.mjs` |
| 13 | `eac6f14` | fix(e2e): size the compacted fixture for the visible-message tail | 否 | 1 | e2e：`e2e/run.mjs` |
| 14 | `974c8bb` | Name sessions from a bounded transcript (#807) | 否 | 2 | 会话标题：`lib/session-title.{ts,test.mjs}` |
| 15 | `a84093e` | fix: keep the shutdown hook out of the Edge instrumentation entry | 否 | 2 | 生命周期：`instrumentation-node.ts`（新）、`instrumentation.ts` |
| 16 | `58c1a21` | chore: ignore .agents/ and skills-lock.json | 否 | 1 | 仓库配置：`.gitignore` |
| 17 | `ed50d88` | feat(sidebar): make conversation and file panes resizable (#825) | 否 | 8 | 侧边栏：`SessionSidebar.tsx`、`globals.css`、`useResizablePanel.*`、i18n×3 |
| 18 | `404923e` | fix(cli): disable Wasm lazy compilation on RISC-V (#823) | 否 | 3 | CLI/bin：`bin/pi-web.js`、`bin/pi-web-node-args.js`（新）、`lib/pi-web-node-args.test.mjs` |
| 19 | `fce666a` | fix(plugins): normalize relativePath separators for Windows (#827) | 否 | 1 | 插件：`app/api/plugins/route.ts` |
| 20 | `d11d344` | Show tool-result images while the tool card is collapsed (#826) | 否 | 5 | 消息渲染：`ImagePreview.tsx`、`MarkdownBody.*`、`MessageView.*` |
| 21 | `f2d600b` | feat(chat): add /auto-compact slash command (#828) | 否 | 7 | 聊天命令：`ChatInput.tsx`、`useAgentSession.ts`、i18n×3、测试 |
| 22 | `79894b9` | fix(models): include extension-registered providers… (#833) | 否 | 5 | 模型/认证：`lib/model-runtime.ts`（新）、4 个 `app/api/auth/*/route.ts` |
| 23 | `c844973` | fix: surface output-limit truncation (#830) | 否 | 8 | 消息展示：`ChatWindow.tsx`、`MessageView.tsx`、`lib/message-display.ts`、i18n×3 |
| 24 | `afd2575` | fix(plugins): npm update checks without npm.cmd shim on Windows (#837) | 否 | 4 | 进程调用：`lib/node-cli.{ts,test.mjs}`（新）、`lib/npx.ts`、`lib/plugin-updates.ts` |
| 25 | `002400d` | fix(streaming): stop duplicating the first streamed chunk (#835) | 否 | 2 | 流式：`lib/streaming-message.{ts,test.mjs}` |
| 26 | `8df5132` | fix: preserve extension widget order on updates (#839) | 否 | 3 | 扩展 UI：`lib/extension-widgets.{ts,test.mjs}`（新）、`useAgentSession.ts` |
| 27 | `5e9b997` | fix(file-viewer): honor #page= fragments in PDF links (#841) | 否 | 13 | 文件查看：`AppShell.tsx`、`ChatWindow.tsx`、`FileViewer.tsx`、`MarkdownBody.tsx`、`MessageView.tsx`、`TabBar.tsx`、`file-tab-state.ts`、`lib/file-links.ts`、`e2e/pdf-page-fragment.mjs`（新） |

**上游新增文件（18，全部为新增，无同名 add/add）：**

```text
A bin/pi-web-node-args.js
A components/ChatInput.streaming-thinking.test.mjs
A e2e/file-panel.mjs
A e2e/pdf-page-fragment.mjs
A hooks/useResizablePanel.test.mjs
A instrumentation-node.ts
A lib/apply-patch.test.mjs
A lib/apply-patch.ts
A lib/extension-widgets.test.mjs
A lib/extension-widgets.ts
A lib/model-runtime.ts
A lib/node-cli.test.mjs
A lib/node-cli.ts
A lib/pi-web-node-args.test.mjs
A lib/session-reader-external-write.test.mjs
A lib/session-reader-latest-entry.test.mjs
A lib/tool-call-expansion.test.mjs
A lib/tool-call-expansion.ts
```

---

## 3. 依赖与配置漂移

### 3.1 `package.json`：range 内 0 改动

```bash
$ git log --oneline personal..upstream/main -- package.json        # 空
$ git log --oneline personal..upstream/main -- package-lock.json pnpm-lock.yaml \
    next.config.ts tsconfig.json eslint.config.mjs postcss.config.mjs \
    .github .npmignore .npmrc                                      # 空
```

结论：**上游这 27 个提交没有碰任何构建/依赖/CI 配置文件**。`personal` 与 `upstream/main` 的 `package.json` 差异（24 行）全部是 fork 长期分叉的产物，**不会**在合并中产生冲突或回退。

fork 独有、合并后必须保持的字段（已逐项确认不会被覆盖）：

| 字段 | personal 值 | upstream 值 | 合并后 |
|---|---|---|---|
| `name` | `@xup3ng/pi-web` | `@agegr/pi-web` | personal |
| `version` | `0.9.4` | `0.9.1` | personal |
| `homepage` / `author` / `keywords` / `repository` / `bugs` | xupeng/agegr-pi-web | agegr/pi-web | personal |
| `publishConfig.access` | `"public"` | 无 | personal |
| `bin.pi-web` | `bin/pi-web.js` | 同 | 不变 |
| `files` | `bin`、`.next`、`public`、`next.config.ts`、`package.json` | 同 | 不变 |
| `scripts.test:e2e` | `node e2e/run.mjs && node e2e/subagents.mjs` | `node e2e/run.mjs` | **personal**（`subagents.mjs` 是 fork 自有 e2e） |
| `scripts.test:e2e:subagents` | 有 | 无 | personal |
| `scripts.release` | `npm version patch && build && publish` | 同 | 不变 |

### 3.2 关键依赖版本：两侧完全一致

| 包 | personal (`0.9.4`) | upstream/main | 差异 |
|---|---|---|---|
| `@earendil-works/pi-agent-core` | `0.85.1` | `0.85.1` | 无 |
| `@earendil-works/pi-ai` | `0.85.1` | `0.85.1` | 无 |
| `@earendil-works/pi-coding-agent` | `0.85.1` | `0.85.1` | 无 |
| `@earendil-works/pi-tui` | `0.85.1` | `0.85.1` | 无 |
| `next` | `16.3.5` | `16.3.5` | 无 |
| `eslint-config-next` | `16.3.5` | `16.3.5` | 无 |
| `node-pty` | `1.2.0-beta.15` | `1.2.0-beta.15` | 无 |
| `react` / `react-dom` | `^19.2.4` | `^19.2.4` | 无 |
| `@xterm/xterm` | `6.0.0` | `6.0.0` | 无 |

→ **合并后无需 `npm install` 升级依赖，无需 `pnpm install --lockfile-only`。** 这与 09-18 那次合并（需要把 next 16.3.1 → 16.3.5）不同，本次没有锁同步阶段。

### 3.3 锁文件

- `package-lock.json`：range 未改动。`personal..upstream/main` 的 22 行差异仅为 `name`/`version` 两处 + 14 处 `"peer": true` 标记（上游 lock 比 personal 略旧），**不参与合并**，合并后保持 personal 原样（`@xup3ng/pi-web 0.9.4`）。
- `pnpm-lock.yaml`：**personal 独有**（上游仓库不跟踪该文件）。range 未改动 → 保持原样，且**不应**在本次合并里被删除。

### 3.4 其它配置

| 文件 | range 内改动 | 合并后预期 |
|---|---|---|
| `next.config.ts` | 无 | personal 的 `images.unoptimized` 等保持不变 |
| `tsconfig.json` / `postcss.config.mjs` | 无 | 不变 |
| `eslint.config.mjs` | 无 | personal 独有的 `{ ignores: [".agents/**", ".pi/**", ".trellis/**"] }` 保留（上游没有这行，但上游未改该文件，不会被覆盖） |
| `.github/workflows/ci.yml` | 无 | 不变；仍跑 `npm ci && lint && tsc && npm test` + e2e job |
| `.github/workflows/release-personal.yml` | 无（personal 独有） | 保留 |
| `AGENTS.md` | 3 个 docs 提交（#819/#820/#821） | **auto-merge，对 personal 为 +20/−1**：只补齐上游路由/`lib` 文件表与 `PI_WEB_IDLE_TIMEOUT_MS` 说明，personal 的 fork 章节（Web password throttling、model-scope、provider-listing、built-in subagents 等）全部保留 |
| `.gitignore` | `58c1a21` 加 `/.agents/`、`/skills-lock.json` | **auto-merge，对 personal 为 +2**：personal 的 `.codegraph/`、`.pi-web/`、`*.tgz` 忽略项保留 |

---

## 4. 实际冲突预判（隔离 worktree dry-run，实测）

### 4.1 方法（不污染主 checkout）

```bash
# 基线
git status --short ; git worktree list
# 隔离 worktree（detached at personal），不切主工作树、不动主 index
TMP=$(mktemp -d /tmp/piweb-merge-XXXXXX)
git worktree add --detach "$TMP/wt" personal
cd "$TMP/wt" && git merge --no-commit --no-ff upstream/main
git diff --name-only --diff-filter=U
git merge --abort && git worktree remove --force "$TMP/wt" && git worktree prune
```

补充交叉验证（完全不落盘、不建工作树）：

```bash
git merge-tree --write-tree personal upstream/main
# → 54e53ad8bf709594e23f0aab41dacf0e21ccb821（27 提交合并结果树）
```

### 4.2 冲突文件清单

**目标 = 当前 `upstream/main`（27 提交）：14 个冲突文件**

| # | 冲突文件 | 冲突处数 | 冲突性质 | 解决方向（建议） |
|---|---|---|---|---|
| 1 | `app/api/sessions/[id]/route.ts` | 1 | personal 的 `jsonResponse(req, { ...trellisSubagentRecords })` vs 上游新增 `...(wrapperRebuilt ? { wrapperRebuilt: true } : {})` | 取 personal 的 `jsonResponse` 形态，把上游的 `wrapperRebuilt` 展开项并入同一对象 |
| 2 | `components/AppShell.tsx` | 1 | `handleOpenLinkedFile` 签名三方发叉：personal `options?: {modeHint?, sourceSessionId?}` / base `(filePath)` / 上游 `(filePath, page?)` | 合并签名：保留 personal 的 options，并接受上游 `page?: number`（PDF 定位），内部透传 |
| 3 | `components/ChatInput.tsx` | 1 | import 行：personal `useIsMobile, useIsTouchDevice` vs 上游新增 `ImagePreview` | 两侧 import 都保留 |
| 4 | `components/ChatWindow.tsx` | 1 | `onOpenFile?` prop 类型：personal `OpenWrittenFileHandler` vs 上游 `(filePath, page?) => void` | 扩展 personal 的 handler 类型以容纳 `page` |
| 5 | `components/MarkdownBody.test.mjs` | 1 | 双方各自追加测试块（personal 文件索引链接测试 vs 上游图片预览测试） | 两段测试都保留，去掉 `=======` 分隔 |
| 6 | `components/MarkdownBody.tsx` | 4 | personal 的 `FileIndexProvider`/`PathText`/`Children` vs 上游 `ImagePreview`/`MarkdownLinkContext`/`parsePdfPageFragment` | 4 处逐处合并：import 并集、anchor 分支同时套 `FileIndexProvider` 与 `MarkdownLinkContext.Provider` |
| 7 | `components/MessageView.tsx` | **6** | personal 的 `lib/image-mentions`、`OpenWrittenFileHandler` vs 上游 `apply_patch` 渲染、`isAssistantTruncated`、`isToolCallExpanded`、`ResultImages` 抽取 | 本文件解冲突成本最高：import 并集；`PairedResult` 改为上游「images 抽成 `ResultImages` + `PairedResult` 收参数」结构，同时保留 personal 的 image-mentions 与 onOpenFile 透传 |
| 8 | `components/SessionSidebar.tsx` | 2 | personal 把 `listViewportH` 重命名为 `listViewportHeight`；上游新增 resizer（仍用 `listViewportH`）与 `SessionSearch refreshKey` | 保留 personal 命名，把上游新增代码里的 `listViewportH` 改为 `listViewportHeight`；`refreshKey={searchRefreshKey}` 与上游新增块并存 |
| 9 | `e2e/run.mjs` | 1 | personal 的 `chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })` vs 上游在其前插入「external append 可见性」测试块 | 保留 personal 的 launch options，并在其前插入上游测试块（该块依赖已 auto-merge 的 `appendFileSync`/`APPEND`/`checkFilePanel`，见 §4.4） |
| 10 | `hooks/useAgentSession.ts` | 3 | ① 类型注释：personal `trellisSubagentRecords` vs 上游 `wrapperRebuilt`；② personal 大段 Trellis scope 逻辑 vs 上游 `loadSession(..., options?: {force?})` 签名；③ personal `liveState.pendingAsk` vs 上游 `liveState.autoCompactionEnabled` | 三处都要并集：类型加 `wrapperRebuilt`、`loadSession` 加 `force`、两个 liveState 字段都同步 |
| 11 | `lib/rpc-manager.ts` | 1 | personal `getAskUserStore().forgetSession(...)` vs 上游 `this.emit({ type: "session_shutdown" })` | 两者都保留（一个清理 ask store，一个通知 SSE 断流） |
| 12 | `lib/tool-names.ts` | 1 | `isApplyPatchToolName` 实现：personal 少 `name.startsWith("apply_patch_")` 分支，注释不同 | 取上游实现（超集）并保留 personal 的 doc 注释 |
| 13 | `lib/turn-written-files.ts` | 3 | personal 的 `written-file-sources.ts`（`extractRawWrittenFiles`/`resolveAndMergeWrittenFiles`/subagent 来源）vs 上游的 `lib/apply-patch.ts` 路径解析 | 三处并集：保留 personal 的 sources 抽象，把上游的 `apply_patch` 分支接进 sources 层（否则 `apply_patch` 写文件不被记录） |
| 14 | `lib/turn-written-files.test.mjs` | 1 | 双方各自新增 apply_patch 测试（personal 用 `details.preview`/`details.result`，上游用 `MULTI_FILE_PATCH` + `appliedFiles`） | 需要**人工去重+合并**：两套断言针对不同实现路径，不能直接二选一 |

**若只合并原 20 提交（`d11d344`）：12 个冲突文件**

```text
app/api/sessions/[id]/route.ts        components/SessionSidebar.tsx
components/ChatInput.tsx              e2e/run.mjs
components/MarkdownBody.test.mjs      hooks/useAgentSession.ts
components/MarkdownBody.tsx           lib/rpc-manager.ts
components/MessageView.tsx            lib/tool-names.ts
                                      lib/turn-written-files.test.mjs
                                      lib/turn-written-files.ts
```

差集 = `components/AppShell.tsx`、`components/ChatWindow.tsx`（由 #841 的 `onOpenFile(filePath, page?)` 签名变更引入）。

### 4.3 结构性结论（来自 dry-run 的 `git status --short`）

- 冲突标记类型只有 **`UU`（both modified）**：`git ls-files -u` 仅列出上述 14 个路径。
- **无 `AA`（add/add）**、**无 `DU`/`UD`（deleted by us/them）**。
- `git diff --cached --diff-filter=D` → **空**：合并不会删除个人仓库的任何一个文件（`pnpm-lock.yaml`、`.github/workflows/release-personal.yml`、`docs/release-npm.md`、`scripts/release-*.sh`、`.pi/**`、`.trellis/**`、`public/fonts/*`、`.agents/**` 全部安全）。
- 自动合并成功文件数 = 81 − 14 = **67**；其中 `package.json`、`package-lock.json`、`bin/pi-web.js`、`AGENTS.md`、`.gitignore`、i18n×3 均在此列（即「上游改了但个人没改」或「双方改动不重叠」）。

### 4.4 自动合并文件中的「语义复核」清单（必须人工确认，不能只看无冲突）

| 文件 | 复核点 | 已核实结论 |
|---|---|---|
| `app/api/auth/providers/route.ts` | personal 的 `collectProviderListingInputs()` + 上游 `createModelRuntimeWithExtensions()` 是否配套 | ✅ 合并结果同时 import `provider-listing`、`provider-listing-runtime`、`model-runtime`，`GET` 用上游 factory + personal 列表构建，语义自洽（`lib/model-runtime.ts` 与 `lib/provider-listing-runtime.ts` 职责互补，非重复实现） |
| `app/api/auth/{api-key,login,logout}/[provider]/route.ts` | 同上 | 上游改动自动落入，personal 未改这些文件 → 无需人工合并 |
| `lib/session-reader.ts` | `sliceActiveBranch` **双方都改过同一函数**（personal 改注释/大段增强，上游 `50a2fd4` 改计数逻辑） | ✅ 合并结果采用上游的「只计可见消息 + `rawWindowCap`」循环，personal 的 196 行增强（增量扫描、外部写入探测等）保留；`readLatestSessionEntryId` 等上游新函数已并入 |
| `lib/file-links.ts` | 上游 #841 加 `parsePdfPageFragment`，personal 有本地链接解析 | ✅ 对 personal 为纯新增（diff 中 0 行删除） |
| `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | 上游 5 个提交新增 key，personal 有整语言包 | ✅ 纯新增：merged−personal 为 +N/−0（已逐文件核对无删除行） |
| `components/SessionSidebar.test.mjs`、`AppShell.mobile-toolbar.test.mjs`、`ChatInput.test.mjs`、`MessageView.test.mjs`、`useAgentSession.test.mjs`、`runtime-route.test.mjs` | 测试断言是否与 personal 命名/行为冲突 | ⚠️ 建议在解冲突后定向运行这些测试（见 §6.3）；`SessionSidebar.test.mjs` 需确认是否引用了 `listViewportH` 旧名 |
| `e2e/run.mjs` | 上游新增 `appendFileSync` import、`APPEND` fixture、`checkFilePanel` import/调用是否都进入了合并结果 | ✅ 合并结果同时含 `appendFileSync`(L5)、`checkFilePanel`(L12)、`filePanelFixture`(L27)、`APPEND`(L34/L124/L169)、`checkFilePanel(page, previewFile)`(L409)，personal 的 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`(L200) 也保留 |
| `AGENTS.md` / `.gitignore` | 是否回退 personal 章节 | ✅ 分别为 +20/−1、+2/−0，纯新增 |
| `bin/pi-web.js` | 上游 `getNextNodeArgs` 包装是否破坏 fork bin | ✅ 仅 2 行新增（require + 调用替换），`bin/pi-web.js` 无包名硬编码 |
| `instrumentation.ts` / `instrumentation-node.ts` | 上游拆分 Edge/Node 入口 | ✅ personal 未改这两文件，直接采用上游 |

---

## 5. fork 特有资产风险

| fork 资产 | 是否在 81 个上游改动文件中 | 风险 | 结论 |
|---|---|---|---|
| `package.json` 的 `name: @xup3ng/pi-web`、`version`、`homepage/author/keywords/repository/bugs`、`publishConfig.access: public`、`files` | 否 | 无 | 合并后保持（无冲突、上游 range 未改） |
| `bin/pi-web.js` + `bin/pi-web-node-args.js` | **是**（`bin/pi-web.js` M，`pi-web-node-args.js` A） | 低：auto-merge 干净；fork 的 bin 名/启动路径未变 | 安全，新增 `lib/pi-web-node-args.test.mjs` 会在 `npm test` 中被收集 |
| `public/fonts/LICENSE-cascadia-code.txt`、`NOTICE.txt`、4 个 woff2、`public/fonts.test.mjs` | 否（上游 range 完全未碰 `public/`） | 无 | 合并不会影响 09-19-font-license-in-next-release 的核验前提；0.9.5 打包清单可继续按该任务断言 |
| 中文文案（`lib/i18n/messages/zh-CN.ts`、`zh-TW.ts`、en） | **是** | 低：实测纯新增（0 删除行） | 安全；但 3 个 locale 需确认上游新 key 三语齐全（`layout.resizeSidebarSections`、`chat.truncatedByOutputLimit`、`chat.commandAutoCompact`、`files.expandPanel` 等已落入 zh-CN） |
| `.pi/**`（`agents/trellis-{check,implement,research}.md`、`extensions/trellis/index.ts`、`prompts/*`、`settings.json`） | 否（81 文件中无 `.pi/` 路径） | 无 | **`git merge` 不会触碰这些路径**，即使主工作树里它们在脏状态也不会被覆盖/报错 |
| `.pi/agents/trellis-*.md` 未提交修改（用户资产） | 否 | 无 | 合并前后必须保持原样；建议按 09-18 的做法记录 SHA256（本次已记录，见 §10.3） |
| `.trellis/**`（scripts/spec/tasks/workflow） | 否 | 无 | 安全。注意个人仓库把 `.trellis/tasks/**` 也纳入跟踪，上游不认识这些路径 |
| `.agents/skills/trellis-*`（personal 已跟踪） | 否（上游只在 `.gitignore` 里加了 `/.agents/`） | 低：已跟踪文件不受 ignore 影响 | 安全；但合并后新增的 `.agents/` 内容会被 ignore，属预期 |
| `docs/release-npm.md`、`scripts/release-npm.sh`、`scripts/release-personal.sh`、`.github/workflows/release-personal.yml`、`.gitattributes` | 否 | 无 | 安全（上游无这些文件，不会删） |
| `pnpm-lock.yaml` | 否 | 无 | 安全，保持 |
| 个人专有 e2e：`e2e/subagents.mjs`、`e2e/clickable-file-paths.mjs` | 否 | 中：上游 `e2e/run.mjs` 是重写过的版本，若解冲突时误用 `--theirs` 会丢 personal 的 run.mjs 结构 | **解冲突必须手工，禁止整文件取上游**（`-X theirs` / `checkout --theirs` 会破坏个人分页/trellis 断言） |
| 个人专有 lib：`lib/provider-listing*.ts`、`lib/session-list-cache.ts`、`lib/trellis-subagent-*.ts`、`lib/written-file-sources.ts`、`lib/ask-user/**`、`lib/file-index-*.ts`、`lib/path-linkify.ts` 等 | 否 | 无 | 安全；唯一交叉点是 `lib/turn-written-files.ts` 与 `lib/session-reader.ts`（见 §4.2/§4.4） |

---

## 6. 上游新增测试与 E2E

### 6.1 新增测试文件（11 个：9 单测 + 2 e2e）

| 类型 | 文件 | 覆盖 |
|---|---|---|
| 单测 | `lib/tool-call-expansion.test.mjs` | 用户手动展开的工具卡片在流式更新中保持展开 |
| 单测 | `lib/apply-patch.test.mjs` | apply_patch 输入的解析与文件抽取 |
| 单测 | `lib/pi-web-node-args.test.mjs` | RISC-V `--no-wasm-lazy-compilation` |
| 单测 | `lib/node-cli.test.mjs` | 绕过 npm.cmd shim 定位 npm/npx CLI |
| 单测 | `lib/session-reader-external-write.test.mjs` | 外部进程写入的 session 文件在 `?force=1` 下可见 |
| 单测 | `lib/session-reader-latest-entry.test.mjs` | 尾部探测取最新 entry id |
| 单测 | `lib/extension-widgets.test.mjs` | 扩展 widget 顺序保持 |
| 单测 | `hooks/useResizablePanel.test.mjs` | 可拖拽面板尺寸与持久化 |
| 单测 | `components/ChatInput.streaming-thinking.test.mjs` | 运行中显示推理级别 |
| e2e | `e2e/file-panel.mjs` | 文件面板全宽切换；导出 `checkFilePanel` / `filePanelFixture`，**被 `e2e/run.mjs` import 并调用**（fixture 写到 `previewFile`） |
| e2e | `e2e/pdf-page-fragment.mjs` | PDF `#page=` 片段；独立脚本，需手工执行（注释给出 `node e2e/pdf-page-fragment.mjs`） |

单测由既有 glob 自动收集（`npm test` 的 `"lib/**/*.test.mjs"` 等），**不需要改 `package.json`**。

### 6.2 e2e 接线差异（解冲突时必须保住）

- 上游 `e2e/run.mjs`（432 行）新增：`appendFileSync` import、`filePanelFixture`/`previewFile`、`APPEND` 会话 fixture、`checkFilePanel(page, previewFile)` 调用、`PASS: external session-file appends...`。
- personal `e2e/run.mjs`（387 行）：`chromium.launch({ executablePath: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })`、Trellis 相关段落、不 import `file-panel.mjs`。
- `package.json` 的 `test:e2e` 仍是 personal 版（`run.mjs && subagents.mjs`），因此合并后 `npm run test:e2e` 会同时跑上游新增用例与 fork 的 subagents 套件。
- `E2E_SERVER_MODE=start` 在 CI 中用于对 `next start` 跑 e2e（见 `.github/workflows/ci.yml`）。

### 6.3 合并后建议验证命令（按顺序）

```bash
# 0) 环境（node 22.19.0，与 engines/CI 一致）
node -v

# 1) 类型
node_modules/.bin/tsc --noEmit ; echo "tsc=$?"

# 2) lint（对照基线：预期仍为历史 14 条 react-hooks/preserve-manual-memoization，
#    不得新增；数量相同也要逐条比对）
npm run lint 2>&1 | tee /tmp/merged-lint.txt ; echo "lint=${PIPESTATUS[0]}"

# 3) 单测（全量；会收集上游 9 个新测试文件）
npm test 2>&1 | tail -60 ; echo "test=${PIPESTATUS[0]}"

# 4) 定向复核（自动合并的语义点 + 冲突文件对应测试）
node --test \
  lib/turn-written-files.test.mjs \
  lib/session-reader.pagination.test.mjs \
  lib/session-reader-external-write.test.mjs \
  lib/session-reader-latest-entry.test.mjs \
  lib/pi-web-node-args.test.mjs \
  lib/node-cli.test.mjs \
  lib/extension-widgets.test.mjs \
  lib/tool-call-expansion.test.mjs \
  lib/apply-patch.test.mjs \
  hooks/useAgentSession.test.mjs \
  hooks/useResizablePanel.test.mjs \
  components/MessageView.test.mjs \
  components/MarkdownBody.test.mjs \
  components/SessionSidebar.test.mjs \
  components/ChatInput.test.mjs \
  app/api/sessions/runtime-route.test.mjs

# 5) 资源与许可（承接 09-19-font-license-in-next-release 的回归保护）
node --test public/fonts.test.mjs

# 6) e2e（需要 playwright chromium；不要与 dev server 抢 .next/dev/lock）
npx playwright install chromium
npm run build                      # 仅在隔离 release root，不在开发 checkout
E2E_SERVER_MODE=start npm run test:e2e
npm run test:e2e:subagents         # fork 专有
node e2e/pdf-page-fragment.mjs     # 上游新增独立脚本（若需要本地复现 #841）
npm run test:terminal              # 需要 postinstall 的 node-pty 就绪
```

已知历史噪声/注意项：

- lint 历史 14 条 `react-hooks/preserve-manual-memoization`（来自 09-18 记录）——判据是「无新增」，不是「变 0」。
- e2e 需要在无活跃 dev server 的 checkout 上运行（`.next/dev/lock` 冲突）；CI 用独立 job + `next start`。
- `npm test` 使用 `--experimental-strip-types`，node 版本需 ≥ 22.19。
- 上游 `e2e/file-panel.mjs` 会写 `filePanelFixture` 到临时目录，不需要模型凭据。
- 若 `components/SessionSidebar.test.mjs` 在上游侧断言 `listViewportH`，需随 personal 的重命名一并调整（见 §4.2 #8）。

---

## 7. 风险清单

| 等级 | 风险 | 证据 | 缓解 |
|---|---|---|---|
| 高 | `components/MessageView.tsx` 6 处冲突：personal 的 image-mentions/onOpenFile/subagent 路径 × 上游 apply_patch/truncation/tool-expansion 重构，解错会静默丢功能（不是编译错误） | §4.2 #7 | 按「import 并集 → `ResultImages` 结构取上游 → personal 的 `PathText`/image-mentions 透传保留」逐 hunk 落地；改完跑 `components/MessageView.test.mjs` + `lib/turn-written-files.test.mjs` |
| 高 | `lib/turn-written-files.ts` 与 `written-file-sources.ts` 的抽象冲突：上游 `apply_patch` 解析若没接进 personal 的 sources 层，apply_patch 写的文件不会被「本轮写文件」记录 | §4.2 #13/#14 | 明确把 `lib/apply-patch.ts` 作为 personal sources 的一个输入源；测试取并集（personal 的 `details.preview` 路径 + 上游的 `appliedFiles` 路径都要过） |
| 高 | `hooks/useAgentSession.ts` 3 处冲突横跨 personal 的 Trellis projection 与上游 `wrapperRebuilt`/`force`/`autoCompactionEnabled`——这是 SSE 重连与 `#796` 修复的核心 | §4.2 #10 | 三处并集；解完跑 `hooks/useAgentSession.test.mjs`、`useAgentSession.trellis.test.mjs`、`app/api/sessions/runtime-route.test.mjs` 与上游 e2e 的 external-append 用例 |
| 中 | 解冲突时误用 `-X theirs` / 整文件取上游，会连带丢 personal 的 `e2e/run.mjs`、`SessionSidebar` 重命名、i18n key | §5、§4.2 #8/#9 | 禁止 `-X theirs`；逐 hunk 处理；解冲突后 `grep -rn '<<<<<<<'` 必须为空 |
| 中 | `SessionSidebar.tsx` 重命名冲突（`listViewportH` → `listViewportHeight`）在上游新增的 resizer 代码里未被改名 → TS 编译失败或运行时引用错变量 | §4.2 #8 | 解冲突后 `grep -n 'listViewportH\b' components/SessionSidebar.tsx` 应为空 |
| 中 | `lib/model-runtime.ts`（上游新增）与 `lib/provider-listing-runtime.ts`（personal）并存，长期看是重复抽象 | §4.4 | 本次不重构：确认调用点分别是 `app/api/auth/*` 与 `providers` 列表构建即可；记为后续收敛项 |
| 中 | 上游 `#841` 把 `onOpenFile` 扩成 `(filePath, page?)`，personal 用 `OpenWrittenFileHandler`（带 `sourceSessionId`/`modeHint`），三处签名要一致，否则 TS 报错或 PDF 链接丢 `#page=` | §4.2 #2/#4/#7 | 统一为「personal 的 options + 可选 `page`」，并跑 `lib/file-links.test.mjs`、`components/FileViewer.test.mjs`、`file-tab-state.test.mjs`、`AppShell.file-viewer-state.test.mjs` |
| 低 | 合并目标若继续用旧的 20 提交，会漏掉 7 个上游修复（含 streaming 重复首块 `#835`、输出截断提示 `#830`、扩展 widget 顺序 `#839`、Windows npm shim `#837`） | §1.1 | 合并目标 = 当前 `upstream/main`（27） |
| 低 | `public/fonts` 许可回归（0.9.4 缺件）被本次合并破坏 | 上游未碰 `public/` | 合并后跑 `node --test public/fonts.test.mjs`；发布任务仍按 09-19-font-license 的 `tar -tzf` 断言核验 |
| 低 | lint/单测基线漂移被当成本次引入 | 09-18 记录 | 合并前先跑一次基线（tsc/lint/test）留档，再与合并后逐条比对 |
| 低 | 本地 `upstream/main` ref 已从 `d11d344` 前进到 `5e9b997`，与任务书「20 个」不一致造成误解 | §1.2 | 本报告已披露；执行前用 `git rev-parse upstream/main` 重新确认 |

---

## 8. 合并顺序建议

1. **[GATE] 冻结前置状态**
   ```bash
   git status --porcelain          # 期望：仅 3 个 .pi/agents/*.md + 3 个 09-19 任务目录（untracked）
   git rev-parse HEAD              # 2415bdb32847ff1ae5842d84efc049678b846ae9
   git rev-parse upstream/main     # 5e9b997...
   sha256sum .pi/agents/trellis-*.md > /tmp/agents.sha256.before
   ```
   出现其它脏的被跟踪文件 → 停止询问。
2. **打本地回滚锚点**（不推送）
   ```bash
   git tag pre-upstream-5e9b997-$(date +%Y%m%d-%H%M%S) 2415bdb
   ```
3. **基线验证**（依赖未变，但要有对照）：`tsc --noEmit`、`npm run lint`（记录 14 条历史诊断逐条）、`npm test`。落盘到任务 `research/`。
4. **[GATE] 在真实 checkout 执行合并**
   ```bash
   git merge --no-commit --no-ff upstream/main
   git diff --name-only --diff-filter=U    # 期望：与 §4.2 的 14 个文件一致
   ```
   若冲突集合超出 14 个 → `git merge --abort`，回到本报告重新评估（说明上游又前进了或 personal 有新提交）。
5. **按依赖顺序解冲突**（先底层后上层，减少来回）：
   1. `lib/tool-names.ts` → 2. `lib/turn-written-files.ts` → 3. `lib/turn-written-files.test.mjs` → 4. `lib/rpc-manager.ts` → 5. `app/api/sessions/[id]/route.ts` → 6. `hooks/useAgentSession.ts` → 7. `components/SessionSidebar.tsx` → 8. `components/ChatInput.tsx` → 9. `components/ChatWindow.tsx` → 10. `components/AppShell.tsx` → 11. `components/MarkdownBody.tsx` → 12. `components/MarkdownBody.test.mjs` → 13. `components/MessageView.tsx` → 14. `e2e/run.mjs`
6. **自动合并语义复核**（§4.4 表格逐条给证据），重点 `lib/session-reader.ts`、`app/api/auth/providers/route.ts`、i18n×3、`AGENTS.md`、`.gitignore`。
7. **验证**：§6.3 全流程；`grep -rn '<<<<<<<\|>>>>>>>' --include='*.ts' --include='*.tsx' --include='*.mjs' . | grep -v node_modules` 必须空；`sha256sum .pi/agents/trellis-*.md` 与 before 一致。
8. **[GATE] 提交**（等用户确认；禁止 `--amend`、禁止 `git add -A`）：
   - `merge: integrate upstream v0.9.1..5e9b997`
   - `chore(task): record upstream v0.9.1..5e9b997 merge`
9. 后续 0.9.5 发布按 `09-19-release-build-publish-095` 在隔离 release root 进行，**不在开发 checkout 里 `next build`**。

---

## 9. 回滚方案（不破坏 personal）

| 时点 | 动作 | 说明 |
|---|---|---|
| 合并前 | `git tag pre-upstream-5e9b997-<ts> 2415bdb` | 锚点（不推送） |
| 冲突处理中 / 尚未 commit | `git merge --abort`；若已解一半再想放弃 → `git reset --hard pre-upstream-5e9b997-<ts>`，注意 `reset --hard` 会丢掉未提交的 `.pi/agents/*.md` 修改，**必须先备份这 3 个文件**；更安全的是 `git checkout -- .` + `git merge --abort` 组合，或仅在解冲突前复制 `cp .pi/agents/trellis-*.md /tmp/` | 保留用户未提交资产是第一优先 |
| 已 commit 但验证失败 | 不改写历史：`git revert -m 1 <merge-commit>` 生成反向提交；或 `git reset --hard pre-upstream-...`（仅限尚未 push／未发布） | 已 push 的历史绝不 `reset` |
| 已发布 npm 之后 | **不可回滚**：同版本号不可重发；如实记录，用后续补丁版本修复 | 与 09-18 的结论一致 |
| 只想撤销上游 ref 前进 | `git update-ref refs/remotes/upstream/main d11d344` | 不建议，仅用于恢复「20 个」旧视图 |

额外保险：执行合并前先把 `personal` 备份分支或 tag push 到 origin（`git push origin personal:refs/heads/backup/pre-merge-095`）——**本任务未执行任何 push**，由执行者决定。

---

## 10. 证据附录

### 10.1 worktree dry-run 前后状态（原始输出）

**前（baseline）**

```text
$ git status --short
 M .pi/agents/trellis-check.md
 M .pi/agents/trellis-implement.md
 M .pi/agents/trellis-research.md
?? .trellis/tasks/09-19-merge-upstream-pre-095/
?? .trellis/tasks/09-19-npm-release-095/
?? .trellis/tasks/09-19-release-build-publish-095/

$ git worktree list
/home/xupeng/dev/personal/forked/agegr-pi-web 2415bdb [personal]

$ git rev-parse HEAD
2415bdb32847ff1ae5842d84efc049678b846ae9
```

**dry-run 执行（27 提交，临时目录 `/tmp/piweb-merge-0oF3pt`）**

```text
$ git worktree add --detach $TMP/wt personal      # → worktree added
$ git merge --no-commit --no-ff upstream/main     # → exit=1
Auto-merging .gitignore / AGENTS.md / app/api/sessions/[id]/route.ts ... 
CONFLICT (content): Merge conflict in app/api/sessions/[id]/route.ts
CONFLICT (content): Merge conflict in components/AppShell.tsx
CONFLICT (content): Merge conflict in components/ChatInput.tsx
CONFLICT (content): Merge conflict in components/ChatWindow.tsx
CONFLICT (content): Merge conflict in components/MarkdownBody.test.mjs
CONFLICT (content): Merge conflict in components/MarkdownBody.tsx
CONFLICT (content): Merge conflict in components/MessageView.tsx
CONFLICT (content): Merge conflict in components/SessionSidebar.tsx
CONFLICT (content): Merge conflict in e2e/run.mjs
CONFLICT (content): Merge conflict in hooks/useAgentSession.ts
CONFLICT (content): Merge conflict in lib/rpc-manager.ts
CONFLICT (content): Merge conflict in lib/tool-names.ts
CONFLICT (content): Merge conflict in lib/turn-written-files.test.mjs
CONFLICT (content): Merge conflict in lib/turn-written-files.ts
Automatic merge failed; fix conflicts and then commit the result.

$ git diff --cached --name-status | wc -l        # 81（上游全部改动均已 staged）
$ git diff --cached --diff-filter=D              # （空）
$ git diff --name-only --diff-filter=U | wc -l   # 14
```

**dry-run 执行（20 提交，临时目录 `/tmp/piweb-merge20-mHdVKt`）**

```text
$ git merge --no-commit --no-ff d11d344          # → exit=1，12 个冲突文件
$ comm -3 <(sort 20-conflicts) <(sort 27-conflicts)
	components/AppShell.tsx
	components/ChatWindow.tsx
```

**清理与恢复（两个 worktree 均已移除）**

```text
$ (cd $TMP/wt && git merge --abort) && git worktree remove --force $TMP/wt
$ (cd $TMP2/wt && git merge --abort) && git worktree remove --force $TMP2/wt
$ git worktree prune
$ git branch -D tmp-upstream-probe                # Deleted branch tmp-upstream-probe (was 5e9b997)
$ rm -rf $TMP $TMP2

$ git worktree list
/home/xupeng/dev/personal/forked/agegr-pi-web 2415bdb [personal]      ← 与 baseline 完全一致

$ git status --short
 M .pi/agents/trellis-check.md
 M .pi/agents/trellis-implement.md
 M .pi/agents/trellis-research.md
?? .trellis/tasks/09-19-merge-upstream-pre-095/
?? .trellis/tasks/09-19-npm-release-095/
?? .trellis/tasks/09-19-release-build-publish-095/

$ git rev-parse HEAD
2415bdb32847ff1ae5842d84efc049678b846ae9                          ← 未变
```

### 10.2 三方树合并（不落盘）交叉验证

```text
$ git merge-tree --write-tree personal upstream/main
54e53ad8bf709594e23f0aab41dacf0e21ccb821
$ git show 54e53ad:e2e/run.mjs | grep -n 'appendFileSync\|checkFilePanel\|PLAYWRIGHT_CHROMIUM'
5:import { appendFileSync, createWriteStream, ... } from "node:fs";
12:import { checkFilePanel, filePanelFixture } from "./file-panel.mjs";
27:writeFileSync(previewFile, filePanelFixture);
34:const APPEND = "e2e-external-append-session";
200:  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
409:    await checkFilePanel(page, previewFile);
```

### 10.3 `.pi/agents` 未提交资产基线 SHA256（本次分析前后未变）

```text
1404a40a04b3dd9664fbf2072d2c80cc96c70625065bf2b9bbeabcaf762ceabf  .pi/agents/trellis-check.md
0fa8906a609cf36c9b30c233281273e69114d0307f0bdf68c89864e15a99600e  .pi/agents/trellis-implement.md
9af8acee27ee8dd1149174d34bbefe3022209812684e981ec62e9bc3f13159d3  .pi/agents/trellis-research.md
```

### 10.4 关键派生数据

```text
merge-base                                = 860698a6573e63a2432157676a5ac9bc9ce54044
personal HEAD                             = 2415bdb32847ff1ae5842d84efc049678b846ae9
upstream/main（分析时）                    = 5e9b997d9bb22be7dee099d351816b97cd08bc53
origin/main = main                        = d11d344（20 提交边界）
range 文件数                                = 81（M 63 + A 18 + D 0）
range 行数                                  = +3173 / −587
personal 独有提交数                         = 107
冲突文件数（27/20 提交）                     = 14 / 12
无冲突自动合并文件数                          = 67
```

---

## 11. 本任务边界（自证）

- **未** `git push`、**未** `npm publish`、**未** 改动 `package.json` 版本号。
- **未** 修改主 checkout 的任何被跟踪文件（§10.1 前后 `git status --short` 一致）。
- 临时 worktree 两个，均已 `git merge --abort` + `git worktree remove` + `git worktree prune`，与 baseline 一致（§10.1）。
- 唯一环境变更：`refs/remotes/upstream/main` 由 `d11d344` 更新为 `5e9b997`（fetch 结果），临时分支已删除（§1.2）。
- 本报告只写入 `.trellis/tasks/09-19-merge-upstream-pre-095/research/upstream-merge-analysis.md`。
