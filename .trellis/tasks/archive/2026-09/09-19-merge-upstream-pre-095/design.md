# 设计：把 upstream/main（27 提交）合并进 personal

## 1. 合并拓扑

```
860698a (merge-base, 上次同步点)
   ├── personal: 2415bdb ──┐
   └── upstream/main:      ├─ 27 commits ── 5e9b997
                           ▼
                   merge commit M (--no-ff)
                           │
                        H = personal HEAD（发布基线）
```

- 合并形态固定为 `git merge --no-ff upstream/main`：显式 merge commit 让 27 个上游提交
  保持可达（`git log upstream/main` 可追溯），并使回滚只需 `git reset --hard 2415bdb`。
- 研究对象树 `54e53ad8bf709594e23f0aab41dacf0e21ccb821` 是 dry-run 的**预期结果树**，
  但不作为验收值：dry-run 用默认策略自动解冲突失败即停在冲突态，最终树由人工解决决定。
  该值仅用于「解决后与 dry-run 的自动合并部分是否一致」的抽样比对。
- 合并前记录锚点 `BASE = 2415bdb`、三个用户文件的 SHA-256（见 `implement.md` D1）。
  **不建 tag**（用户边界：不打 tag），锚点以文本形式落在证据文件里。

## 2. 冲突解决总则

1. **禁止整侧取值**：不允许 `-X theirs` / `-X ours` / `git checkout --theirs <file>`。
   实测冲突的绝大多数是「personal 的 fork 特性」与「上游同文件新特性」在**不同代码位置**，
   正确产物是并集。
2. **先看三方**：每处冲突都读 `git show :1:<file>`（base）、`:2:`（ours=personal）、
   `:3:`（theirs=upstream）三份，理解双方意图后再写结果，而不是在标记里挑一边。
3. **保留 fork 语义优先**：当同一行为两侧有不同实现（真正语义冲突）时，先判断哪个是
   「用户可见的 fork 行为」，则该行为取 personal 实现；上游的实现细节（命名、结构、性能）可吸收。
4. **import 并集**：import 行冲突一律并集，随后由 `tsc --noEmit` 与 lint 验证是否有未使用符号。
5. **测试文件不二选一**：两侧新增的断言针对不同实现路径时，**两段测试都保留**（必要时改名去重），
   让测试同时守住 fork 行为与上游行为。
6. **每解一个文件立即核对**：避免最后一次性检查导致错误归因困难。

## 3. 14 个冲突文件逐项处置（来自实测 dry-run）

| # | 文件 | 处数 | 冲突性质 | 处置决定 | 依据 |
|---|------|------|----------|----------|------|
| 1 | `app/api/sessions/[id]/route.ts` | 1 | personal 用 `jsonResponse(req, {...trellisSubagentRecords})`；上游新增 `...(wrapperRebuilt ? { wrapperRebuilt: true } : {})` | 保留 personal 的 `jsonResponse` 形态，把 `wrapperRebuilt` 展开项并入同一对象 | 两者都改变响应体，互不排斥；`jsonResponse` 是 fork 的响应封装（含 CORS/压缩约定），不能退回 `NextResponse.json` |
| 2 | `components/AppShell.tsx` | 1 | `handleOpenLinkedFile` 签名三方发叉：personal `(path, options?: {modeHint?, sourceSessionId?})` / base `(path)` / 上游 `(path, page?)` | 合并签名：`(filePath, options?: {modeHint?, sourceSessionId?, page?})`，内部把 `page` 透传给文件标签 | 上游 `page` 用于 PDF `#page=` 定位，与 fork 的 `modeHint/sourceSessionId` 是正交参数 |
| 3 | `components/ChatInput.tsx` | 1 | import 行：personal `useIsMobile, useIsTouchDevice` vs 上游 `ImagePreview` | 两侧 import 都保留 | 纯并集，无行为冲突 |
| 4 | `components/ChatWindow.tsx` | 1 | `onOpenFile?` prop 类型：personal `OpenWrittenFileHandler` vs 上游 `(filePath, page?) => void` | 扩展 personal 的 `OpenWrittenFileHandler` 定义以容纳可选 `page`，`ChatWindow` 保持引用 personal 类型 | 单一类型定义点应在 `lib/`；避免同一 prop 两套内联签名 |
| 5 | `components/MarkdownBody.test.mjs` | 1 | 双方各自追加测试块（personal 文件索引链接 vs 上游图片预览） | 两段测试都保留，删除冲突分隔行，必要时调整块间空行 | 测试覆盖不同功能，不冲突 |
| 6 | `components/MarkdownBody.tsx` | 4 | personal `FileIndexProvider`/`PathText`/`Children` vs 上游 `ImagePreview`/`MarkdownLinkContext`/`parsePdfPageFragment` | 4 处逐处：import 并集；anchor 渲染分支同时套 `FileIndexProvider` 与 `MarkdownLinkContext.Provider`；链接点击优先判定 PDF `#page=` 再回落 fork 的文件索引 | PDF 片段解析是新能力，fork 的路径链接是既有能力；`parsePdfPageFragment` 未命中时不得吞掉 fork 行为 |
| 7 | `components/MessageView.tsx` | **6** | personal `lib/image-mentions`、`OpenWrittenFileHandler` vs 上游 `apply_patch` 分栏渲染、`isAssistantTruncated`、`isToolCallExpanded`、`ResultImages` 抽取 | import 并集；采用上游把图片抽成 `ResultImages` + `PairedResult` 收参数的结构，同时保留 personal 的 image-mentions 与 `onOpenFile` 透传；截断提示与工具展开状态都保留 | 成本最高文件。上游重构了 `PairedResult` 结构，直接保留 personal 旧结构会与 `ResultImages` 的调用点不匹配 |
| 8 | `components/SessionSidebar.tsx` | 2 | personal 把 `listViewportH` 重命名为 `listViewportHeight`；上游新增 resizer 仍用旧名，并新增 `SessionSearch refreshKey` | 保留 personal 命名，把上游新增代码里的 `listViewportH` 全部改写为 `listViewportHeight`；`refreshKey={searchRefreshKey}` 与上游新增块并存 | fork 的重命名是刻意的可读性改进；必须同步检查 `SessionSidebar.test.mjs` 是否引用旧名 |
| 9 | `e2e/run.mjs` | 1 | personal 的 `chromium.launch({ executablePath: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })` vs 上游在其前插入「external append 可见性」测试块 | 保留 personal 的 launch options，把上游测试块插入其前 | 该文件被 `--theirs` 破坏风险最高：个人的分页/trellis 断言与 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 必须存活 |
| 10 | `hooks/useAgentSession.ts` | 3 | ① 类型注释 personal `trellisSubagentRecords` vs 上游 `wrapperRebuilt`；② personal 大段 Trellis scope 逻辑 vs 上游 `loadSession(..., options?: {force?})`；③ personal `liveState.pendingAsk` vs 上游 `liveState.autoCompactionEnabled` | 三处并集：类型同时含两字段；`loadSession` 保留 personal 逻辑并新增 `force` 形参（内部需要时透传到 fetch）；`liveState` 两个字段都同步 | 三处均为正交扩展；`force` 用于上游「外部进程写入的会话可见」 |
| 11 | `lib/rpc-manager.ts` | 1 | personal `getAskUserStore().forgetSession(...)` vs 上游 `this.emit({ type: "session_shutdown" })` | 两者都保留 | 一个清理 ask 状态，一个通知 SSE 断流，职责不同 |
| 12 | `lib/tool-names.ts` | 1 | `isApplyPatchToolName` 实现：personal 缺 `name.startsWith("apply_patch_")` 分支，注释不同 | 取上游实现（超集），保留 personal 的 doc 注释 | 上游分支覆盖 `apply_patch_` 前缀变体；fork 无相反约束 |
| 13 | `lib/turn-written-files.ts` | 3 | personal 的 `written-file-sources.ts` 抽象 vs 上游 `lib/apply-patch.ts` 路径解析 | 三处并集：保留 personal 的 sources 抽象，把上游 `apply_patch` 解析接入 sources 层 | 不接入则 `apply_patch` 写入的文件不会出现在 fork 的「已写文件」卡片中，属功能回退 |
| 14 | `lib/turn-written-files.test.mjs` | 1 | 双方各自新增 apply_patch 测试（personal 用 `details.preview`/`details.result`，上游用 `MULTI_FILE_PATCH` + `appliedFiles`） | 人工去重合并：保留两套断言（不同实现路径），共享 fixture 时提取为局部常量，避免重复定义 | 两套断言分别守住 fork 与上游路径，删任一侧都会留下回归盲区 |

## 4. 语义复核清单（自动合并但双方都改过）

这些文件**没有冲突**，但双方改动落在同一文件甚至同一函数，必须人工确认。

| 文件 | 复核点 | 通过判据 |
|------|--------|----------|
| `lib/session-reader.ts` | `sliceActiveBranch` 双方都改过 | 采用上游「只计可见消息 + `rawWindowCap`」循环，同时 fork 的增量扫描/外部写入探测增强仍在；`lib/session-reader.pagination.test.mjs` 与 `lib/session-reader-external-write.test.mjs` 均通过 |
| `app/api/auth/providers/route.ts` | 上游 `createModelRuntimeWithExtensions()` + personal `collectProviderListingInputs()` 是否配套 | `GET` 同时 import `provider-listing`、`provider-listing-runtime`、`model-runtime`，语义自洽；`app/api/auth/providers` 相关测试通过 |
| `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | 上游新 key 是否三语齐全 | 上游新增 key（如 `layout.resizeSidebarSections`、`chat.truncatedByOutputLimit`、`chat.commandAutoCompact`、`files.expandPanel`）在 zh-CN 存在；`git diff` 对 personal 无删除行 |
| `bin/pi-web.js` | 上游 `getNextNodeArgs` 包装是否破坏 fork 启动 | `bin/pi-web.js` 无包名硬编码；`lib/pi-web-node-args.test.mjs` 通过 |
| `e2e/run.mjs` | 上游新接线是否完整 | 合并结果同时含 `appendFileSync`、`checkFilePanel`、`filePanelFixture`、`APPEND`、`checkFilePanel(page, previewFile)`，且 personal 的 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 保留 |
| `instrumentation.ts` / `instrumentation-node.ts` | 上游拆分 Edge/Node 入口 | personal 未改这两文件，直接采用上游；`tsc --noEmit` 通过 |
| `components/*.test.mjs`、`hooks/useAgentSession.test.mjs`、`lib/runtime-route.test.mjs` | 断言是否引用 personal 旧命名 | 全量 `npm test` 通过；特别确认 `SessionSidebar.test.mjs` 未引用 `listViewportH` |

## 5. 验证设计

分层门槛（全部在 `implement.md` D5 执行，退出码即判据）：

| 层 | 命令 | 判据 |
|----|------|------|
| 类型 | `node_modules/.bin/tsc --noEmit` | exit 0 |
| 静态 | `npm run lint` | 错误集合 == 基线 14 条 `react-hooks/preserve-manual-memoization`，逐条比对；新增任何一条即失败 |
| 单测 | `npm test` | exit 0；且输出包含上游新增的 9 个单测文件 |
| 定向 | 见 `implement.md` D5 的定向清单 | exit 0，重点覆盖 `session-reader*`、`turn-written-files`、`tool-names`、`node-cli`、`extension-widgets`、`useResizablePanel`、`ChatInput.streaming-thinking` |
| e2e | `npm run test:e2e`（可选、按需） | 需 `.next/dev/lock` 空闲；历史存在间歇失败，若跑需记录而非当作门槛 |

lint 基线必须先**测量**再比对：合并前在主 checkout（2415bdb、工作区干净状态）跑一次
`npm run lint` 记录输出，作为基线文件，而不是直接信任「14 条」这个历史数字。

## 6. 回滚设计

| 阶段 | 回滚动作 | 代价 |
|------|----------|------|
| 冲突解决中 | `git merge --abort` | 回到 `2415bdb`，无残留 |
| 合并完成、未 commit | `git merge --abort` 或 `git reset --hard 2415bdb` | 同上 |
| merge commit 已产生、未 push | `git reset --hard 2415bdb` | 本地历史回退，无远端影响 |
| 已 push 到 `origin/personal` | `git revert -m 1 <merge-commit>`（不改写已推送历史） | 产生一个反向提交，历史保留 |
| 已发布 npm 0.9.5 | **不可回滚** | 只能发新版本修复；这是发布子任务必须设批准门的原因 |

## 7. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 用 `--theirs` 误丢 fork 行为（`e2e/run.mjs`、`SessionSidebar.tsx`、`turn-written-files*`） | 解决总则第 1 条硬禁令；每文件解决后跑对应定向测试 |
| `MessageView.tsx` 6 处冲突合并出结构错配 | 以上游 `ResultImages`/`PairedResult` 结构为骨架，逐个调用点核对；`tsc` + `MessageView.test.mjs` 双保险 |
| 自动合并的 `session-reader.ts` 丢 fork 增强 | 列入 §4 必查项，用分页测试 + 外部写入测试守住 |
| lint 历史噪声掩盖新错误 | 先测基线再比对，禁止用「历史就有 14 条」当借口跳过 |
| 用户未提交的 3 个 `.pi/agents/*.md` 被误提交 | 合并与提交时**按路径显式 add**，绝不 `git add -A`；SHA-256 前后比对 |
| 合并后 `upstream/main` 前进导致基线歧义 | R1 冻结；发布子任务引用 `H` 的 hash 而非分支名 |
