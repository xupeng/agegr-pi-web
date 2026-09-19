# 合并执行报告：upstream/main → personal

日期：2026-09-19。范围：把 `upstream/main`（`5e9b997`，27 提交）合并进 `personal`，
产出冻结提交 `H`。**未** build / pack / publish / push / 改版本号。

## 1. 结论摘要

| 项 | 值 |
|---|---|
| `BASE`（合并前 personal HEAD） | `2415bdb32847ff1ae5842d84efc049678b846ae9` |
| `TARGET`（合并目标） | `5e9b997d9bb22be7dee099d351816b97cd08bc53` |
| `MERGE_BASE` | `860698a6573e63a2432157676a5ac9bc9ce54044` |
| merge commit | `628683a4ffc6548799720dc5d21b3b521e7f8d60`（树 `3637d447ad0c0be45998cdf02f759f2659231347`） |
| 检查修复提交 | `fc2323ef95261af77cdeeb3d945bc0114f8b64db` |
| **`H`（发布基线 = personal HEAD）** | **`fc2323ef95261af77cdeeb3d945bc0114f8b64db`** |
| **`H` 树 hash** | **`6b5a684b25089c96a18aec6684605d14bb8c39d1`** |
| 上游提交可达数 | **27**（`git rev-list --count HEAD^1..HEAD^2`） |
| 提交形态 | `--no-ff` merge commit，parents = `2415bdb` + `5e9b997` |
| 变更规模 | 81 文件 / +3098 −571 |
| 冲突文件 | **14 个，全部 `UU`**（与研究预测一致） |
| 删除文件 | **0**（`git diff --diff-filter=D HEAD^1..H` 为空） |
| 依赖/配置漂移 | **0**（`package.json`/两个锁文件/`next.config.ts`/`tsconfig`/eslint/`.github` 均未变） |
| 用户资产 | 3 个 `.pi/agents/*.md` SHA-256 **前后逐字一致** |
| 验证 | `tsc --noEmit` 0；`npm run lint` 0（=基线）；`npm test` **1383/1383**；定向 158/158 |

环境偏差（如实记录）：本机 `node v26.1.0`，而 `engines`/CI 参照为 22.19.0。

> **发布基线以 `H` = `fc2323e` 为准，不是 merge commit `628683a`。** 独立检查在 merge commit 上
> 发现两个 fork 回归（见 §4.1），修复以追加提交形式落在 `H`；`628683a` 保持原样以维持
> `check-report.md` 中 hash 引用的有效性（未 amend、未改写历史）。

## 2. 冲突解决逐项记录（14 个文件）

解决总则：逐处读三方（`:1:` base / `:2:` ours / `:3:` theirs）后写并集；
**未使用** `-X ours` / `-X theirs` / `git checkout --ours|--theirs`。

| # | 文件 | 处数 | 解决决定 |
|---|------|------|----------|
| 1 | `lib/tool-names.ts` | 1 | 取上游实现（含 `apply_patch_` 前缀分支），保留 personal 的 doc 注释 |
| 2 | `lib/turn-written-files.ts` | 3 | import 取 personal 的 sources 抽象；**删除上游自动合并进来的 `writtenPathsFromFiles` / `collectApplyPatchDeletePaths` / `readApplyPatchPaths` 与相应 import**；循环体取 personal（去掉冗余的 `&& !isApplyPatchToolName(...)`，恢复「No result yet」注释） |
| 3 | `lib/turn-written-files.test.mjs` | 1 | 两侧测试全部保留（personal 5 个 + 上游 3 个），补上被冲突吃掉的 `});`；上游第 3 个测试按合并语义改写（见 §3） |
| 4 | `lib/rpc-manager.ts` | 1 | 两者都保留：先 `emit({type:"session_shutdown"})` 通知 SSE 断流，再 `forgetSession()` 清理 ask 状态 |
| 5 | `app/api/sessions/[id]/route.ts` | 1 | 保留 personal 的 `jsonResponse(req, {...})` 单参数形态与 `trellisSubagentRecords`，并入上游 `...(wrapperRebuilt ? {wrapperRebuilt:true} : {})` |
| 6 | `hooks/useAgentSession.ts` | 3 | ①类型并集（`trellisSubagentRecords` + `wrapperRebuilt`）；②保留 personal 的 Trellis scope 大段，`loadSession` 签名并入上游 `options?: {force?: boolean}`（其内部 `options?.force`→`?force=1` 与 `d.wrapperRebuilt` 处理已由自动合并就位）；③`liveState` 的 `pendingAsk` 与 `autoCompactionEnabled` 都同步 |
| 7 | `components/ChatInput.tsx` | 1 | import 并集：`ImagePreview` + `useIsMobile, useIsTouchDevice` |
| 8 | `components/MarkdownBody.tsx` | 4 | import 并集；外部链接与内部链接分支都套 `MarkdownLinkContext.Provider` + `FileIndexProvider`；PDF `#page=` 与 fork 文件索引链接共存，`page` 改为 options 形态传递 |
| 9 | `components/MarkdownBody.test.mjs` | 1 | 两段测试都保留（personal 文件索引 4 个 + 上游图片预览 3 个） |
| 10 | `components/MessageView.tsx` | 6 | 采用上游 `ResultImages` 抽取 + `PairedResult` 收参数结构；`PairedResult` 保留 personal 的 `PathText`/`onOpenFile` 增强；三处 `onOpenFile` 类型统一为 `OpenWrittenFileHandler` |
| 11 | `components/SessionSidebar.tsx` | 2 | 保留 personal 的 `listViewportHeight` 命名与 `refreshKey={searchRefreshKey}`；保留上游新增的 `sessionPaneRef` 外层容器与 pane resizer；**修掉一处 patch 引入的重复 `SessionSearch` 行** |
| 12 | `components/AppShell.tsx` | 1 | `handleOpenLinkedFile` 合并签名：`options?: {modeHint?, sourceSessionId?, page?}`，把 `page` 透传给 `handleOpenFile`（后者已含上游 `page` 支持） |
| 13 | `components/ChatWindow.tsx` | 1 | `onOpenFile?: OpenWrittenFileHandler`（personal，已扩展含 `page`） |
| 14 | `e2e/run.mjs` | 1 | 保留 personal 的 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` launch 选项，把上游「external append 可见性」测试块插在其前 |

## 3. 语义冲突与设计判断（不止「无冲突」的部分）

### 3.1 `onOpenFile` 通道统一为 options 形态（决定性改动）

两侧对「打开文件」的通道定义不同：

- personal：`OpenWrittenFileHandler = (filePath, options?: {modeHint?, sourceSessionId?})`
- 上游：`(filePath, page?: number)`（PDF `#page=` 定位）

两者第二参数语义互斥。判断：personal 的 options 通道承载 fork 的「打开 diff」与子会话授权，
**必须保留**；上游的 `page` 是正交能力。因此：

1. `OpenWrittenFileHandler` 扩展为 `{modeHint?, sourceSessionId?, page?}`（单一类型定义点，
   `components/TurnWrittenFiles.tsx`）；
2. `MarkdownBody` / `MessageView` / `ChatWindow` / `AppShell` 统一使用该类型；
3. `MarkdownBody` 内调用改为 `openFile(filePath, { page: parsePdfPageFragment(href) ?? undefined })`；
4. `components/FileViewer.tsx` 保持上游的数值形态（`(filePath, page?: number) => void`）——
   它自成一条链（`AppShell:2511` 用内联适配函数桥接），不参与上面的通道。

`tsc --noEmit` 通过即为该统一的机械证明。

### 3.2 apply_patch 写入提取：保留 personal 的 sources 抽象

personal 的 `lib/written-file-sources.ts` 已完整实现 apply_patch 提取
（`details.result.summaries` → `appliedFiles` → `preview` 富化行数 → summary 文本回落，
含删除排除与来源标记），粒度高于上游 `lib/apply-patch.ts` 的 `readApplyPatchPaths`。

→ 保留 personal 实现；**删除**上游在 `lib/turn-written-files.ts` 中新增的
`writtenPathsFromFiles` / `collectApplyPatchDeletePaths` / `readApplyPatchPaths`
（否则成为未使用死代码，且形成两套并行逻辑）。
`lib/apply-patch.ts` 文件本身保留 —— 它仍服务 `MessageView` 的 apply_patch 分栏 diff 渲染。

### 3.3 preview-only 语义冲突（真正对立，取 personal）

上游新增测试要求：`details` 只有 `preview`（无 `result`）时，按 preview 的 `newPath` 列出文件。
personal 有一条**专门的回归测试**（`lib/written-file-sources.check.test.mjs`）断言相反结论：
preview-only 不得确立写入。

personal 的理由（源码注释）：`preview` 由**解析后的补丁**生成，部分失败时仍会包含
**hunk 未落地**的文件；没有 `result` 就没有「确实写入」的证据。

判断：**采用 personal 的严格语义**。理由：
- 上游行为会把失败的文件列进「本轮写入」卡片 —— 是**正确性缺陷**，不只是 UX 差异；
- personal 行为的最坏后果只是漏列（旧扩展构建下少显示一个文件）；
- personal 有专门测试守护该边界，删除它是主动削弱已建立的回归保护。

处置：不引入 preview 回落；把上游那条测试改写为
`apply_patch preview-only details write nothing without a confirming result`，
保留其「planned deletes 被忽略」的覆盖意图（删除排除的覆盖同时存在于
`written-file-sources.check.test.mjs` 与 `turn-written-files.test.mjs` 的 appliedFiles 用例）。
这是本次唯一一处「某侧测试期望被有意改写」的地方。

### 3.4 其他自动合并点的复核结论

| 复核项 | 结论 |
|---|---|
| `lib/session-reader.ts` `sliceActiveBranch` | 采用上游「只计可见消息 + `rawWindowCap`」循环（`countsTowardTail`），personal 的分页 `excludeLeaf` 语义保留；`readLatestSessionEntryId` 等上游新函数已并入 |
| `lib/i18n/messages/{en,zh-CN,zh-TW}` | 上游新 key 三语齐全（`commandAutoCompact`/`truncatedByOutputLimit`/`resizeSidebarSections`/`expandPanel` 各 1） |
| `e2e/run.mjs` 上游接线 | `appendFileSync`/`checkFilePanel`/`filePanelFixture`/`APPEND` 共 15 处命中，`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 保留 |
| 上游新增测试文件 | 9 个单测 + `e2e/file-panel.mjs` + `e2e/pdf-page-fragment.mjs` 均在位，由既有 glob 自动收集 |

## 4. 验证结果（退出码即判据）

| 层 | 命令 | 结果 | 证据 |
|----|------|------|------|
| 类型 | `node_modules/.bin/tsc --noEmit` | **exit 0** | 见 §5 偏差 D-1 |
| 静态 | `npm run lint` | **exit 0，0 错误**（基线同为 0） | `evidence/lint-after.txt` |
| 单测 | `npm test` | **1382/1382，exit 0** | `evidence/test-after.txt` |
| 定向 | `node --test <16 个定向文件>` | **158/158，exit 0** | `evidence/targeted-after.txt` |

lint 基线为**实测**：合并前在 `2415bdb` 上跑 `npm run lint` = exit 0、0 错误
（`evidence/lint-baseline.txt`）。研究报告中提到的「历史 14 条
`react-hooks/preserve-manual-memoization`」在当前 HEAD **已不存在**，故门槛为「保持 0」，
合并后仍为 0。

定向清单中 `lib/tool-names.test.mjs` **不存在**（该模块无独立测试），已从清单剔除；
其余 16 个文件全部存在并通过。

## 5. 偏差、未覆盖项与遗留

### 4.1 独立检查发现的问题与修复（Phase 2.2）

`trellis-check` 独立复核（报告：`check-report.md`）确认合并拓扑、零漂移、用户资产与全部验证结果
可信，同时发现两处 fork 行为回退。两处**均已修复并复验**（提交 `fc2323e`）：

| 编号 | 严重度 | 问题 | 修复 |
|------|--------|------|------|
| F1 | 中 | `MessageView.tsx` 的 `expanded && result && patchFiles && isError` 分支创建 `PairedResult` 时漏传 `onOpenFile`；`PathText` 在无 handler 时退回纯文本，因此 apply_patch 部分失败时 fork 的文件索引链接失效 | 补 `onOpenFile={onOpenFile}`；新增回归测试 `keeps fork path links on an expanded apply_patch failure result`（已用「移除修复则失败」验证其有效性） |
| F2 | 低 | 上游新增的截断提示使用固定 `fontSize: 12`，违反 `.trellis/spec/frontend/quality-guidelines.md` 的对话区字号契约 | 改为 `calc(12px + var(--chat-font-size-offset, 0px))` |

修复后复验：`tsc --noEmit` 0；`npm run lint` 0；`npm test` **1383/1383**
（新增 1 个测试）；证据 `evidence/{lint-final.txt,test-final.txt}`。

检查报告的其他结论（均独立复现）：27 个短 hash 与研究报告 §2 清单**逐项按顺序一致**；
`git diff --diff-filter=D` 为空；依赖/锁/CI/`.pi`/`public` 零变更；`git ls-files -u` 为空；
全仓库无残留冲突标记；preview-only 严格语义的选择被检查方认可，且删除排除覆盖仍完整
（`written-file-sources.check.test.mjs` 与 `turn-written-files.test.mjs` 双处覆盖）。

检查方同时指出其证据边界：复用既有 `node_modules`，**未**做干净 `npm ci`，因此只能证明
「同一现存环境可复现」，不能宣称干净安装 / Node 22.19 / Windows 均已验证。该限制继承到
本任务的残余风险，发布子任务的 B3（隔离 `npm ci`）+ B4（隔离 build）正是对该缺口的补齐。

- **D-1（命令无输出）**：`tsc --noEmit` 在合并过程中曾输出 6 条错误（`onOpenFile` 签名不一致）
  与 1 条 `sessionListVersion` 未定义、1 条 `SessionSearch` 未闭合，均已修复；
  最终一次运行为 exit 0、无输出。类型检查的中间失败未单独留档，最终状态以 exit 0 为准。
- **D-2（一次测试失败并修复）**：首次全量 `npm test` 为 1381/1382，失败项是
  `lib/written-file-sources.check.test.mjs` 的 preview-only 用例 —— 由我最初吸纳上游
  preview 回落所致。按 §3.3 撤回该吸纳后为 1382/1382。
- **D-3（用户资产）**：`.pi/agents/trellis-{check,implement,research}.md` 全程未暂存、未提交，
  合并前后 SHA-256 逐字一致（`evidence/user-agents-{before,after}.sha256`）。
- **U-1（e2e 未跑，用户已确认）**：按用户 2026-09-19 的决定，本次不跑 `npm run test:e2e`
  （主 checkout 有陈旧 `.next/dev/lock`、30141 无监听，且 e2e 历史存在间歇失败）。
  **残余风险**：UI 交互层（可拖拽侧栏、PDF `#page=` 链接、markdown 图片预览、文件面板全宽切换）
  仅由单测与类型检查覆盖，未在真实浏览器验证。该风险需在发布批准门提交给用户。
- **U-2（e2e 新用例未验证）**：上游新增的 `e2e/file-panel.mjs`（被 `run.mjs` import）与
  `e2e/pdf-page-fragment.mjs` 未实际执行。
- **U-3（node 版本偏差）**：本机 node v26.1.0 vs engines 22.19.0；未做低版本验证。
- **U-4（`upstream/main` 已前进）**：合并期间未再 fetch；`H` 冻结于 `5e9b997` 的合并结果，
  发布必须引用 `H` 的 hash 而非分支名。

## 6. 发布基线交接

- **`H` = `fc2323ef95261af77cdeeb3d945bc0114f8b64db`**，树 hash `6b5a684b25089c96a18aec6684605d14bb8c39d1`（merge commit 为 `628683a`，修复提交 `fc2323e`）。
- `09-19-release-build-publish-095` 的 B2 必须用该 hash 导出源码；`H` 变化则已封存 tgz 作废。
- 本次**未 push**（按用户 Git 边界决定，push 在发布核验成功后与 bump 提交一起进行）。
