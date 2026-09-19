# 独立检查报告

## 结论

**合并拓扑、资产保护、主要语义及验证结果可信，但不是“无问题通过”。** 发现一处可复现的 fork 路径链接回归、一处字号规范违反，建议主会话决定修复后再冻结发布基线。按委派约束，本检查未修改源码、未提交或改写 H。

- H：`628683a4ffc6548799720dc5d21b3b521e7f8d60`
- tree：`3637d447ad0c0be45998cdf02f759f2659231347`
- 检查环境：当前 checkout，Node `v26.1.0`，既有 node_modules；未安装依赖、未 build / pack / publish / push，未运行浏览器 e2e。
- 独立原始输出：`research/evidence/check-{integrity,tsc,lint,test,targeted,targeted-16}.txt`。

## 发现（需主会话决定，不直接修源码）

### F1 / 中：apply_patch 错误结果丢失文件打开回调

**问题**：`components/MessageView.tsx:1208–1214` 的 `expanded && result && patchFiles && isError` 分支创建 `PairedResult` 时没有传 `onOpenFile`。相邻普通结果分支传了该参数。`PairedResult` 虽保留 `PathText`，但 `components/PathText.tsx:25` 在缺回调时明确退回纯文本，因此此路径实际丢失 fork 的文件索引链接。

**证据**：读取 `git diff 628683a^1 628683a -- components/MessageView.tsx` 后，用内联 Node/Jiti + `renderToStaticMarkup` 独立复现：

- `setToolCallExpanded('check-path', true)`，`FileIndexProvider` 的 lookup 为 `buildFileIndexLookup(['src/a.ts'], '/repo')`；外层 MessageView 提供 `onOpenFile`。
- 返回内容 `failed src/a.ts`、`isError: true`。
- 普通 bash tool：HTML 含 `path-text-link`。
- apply_patch tool，输入为包含 `src/a.ts` Update 的合法 patch：HTML **不含** `path-text-link`，只有纯文本 `failed src/a.ts`。

这是服务端组件渲染复现，不冒充浏览器点击验证。相同回调在进入新分支后丢失；全量测试未覆盖该分支的文件链接行为。

**建议修法**：给该 `PairedResult` 补 `onOpenFile={onOpenFile}`；新增带文件索引和展开状态的错误/部分失败 apply_patch 渲染回归测试，断言已确认路径仍生成链接。

### F2 / 低：新增截断提示不随聊天字号调整

**问题与证据**：`components/MessageView.tsx:890` 新增的 `chat.truncatedByOutputLimit` 提示使用 `fontSize: 12`，违反 `.trellis/spec/frontend/quality-guidelines.md` 对聊天排版字号的要求。相邻 `PairedResult` 已使用 `calc(12px + var(--chat-font-size-offset, 0px))`。

**建议修法**：同样接入 `--chat-font-size-offset`，补字号设置断言。此项来自上游新增代码，不是原有历史噪声。

## 独立验证结果

| 命令 | 本次退出码 / 计数 | 与执行证据比较 |
|---|---|---|
| `node_modules/.bin/tsc --noEmit` | 0，无输出 | 一致 |
| `npm run lint` | 0，0 诊断 | 一致；基线多出的 `lint_exit=0` 记录尾行剔除后文本完全相同 |
| `npm test` | 0，1382 tests / 1382 pass，0 fail / skip | 一致 |
| implement.md D5 清单，剔除不存在的 `lib/tool-names.test.mjs` | 0，14 文件 / 148 pass | 这是计划清单的真实计数 |
| 上述清单再加 `components/TurnWrittenFiles.test.mjs`、`lib/written-file-sources.check.test.mjs` | 0，16 文件 / 158 pass | 与原 `targeted-after.txt` 的测试名及计数一致 |

九个上游新增单测文件均包含在本次定向清单中，也由 `npm test` 既有目录 glob 收集。全量测试还覆盖 Trellis、provider listing、文件链接、字体资源等 fork 测试。定向执行有 Node 的 `MODULE_TYPELESS_PACKAGE_JSON` 提示，与原证据同类，不是 lint 诊断，不需为消除提示改 package.json。

**依赖证据限制**：复用既有 node_modules，未做干净 `npm ci` 或锁文件与完整安装树一致性的独立证明。原报告也未写清该安装树的安装来源。因此只能确认同一现存环境可复现，不能宣称已证明干净安装/Node 22.19/Windows 均通过。历史“14 条”不应再被当作本次实测基线；本次实测确实为 0。

## 合并完整性与资产

实际命令及输出已保存到 `check-integrity.txt`：

- `git show -s --format=%H%n%T%n%P 628683a`：parents 精确为 `2415bdb32847ff1ae5842d84efc049678b846ae9`、`5e9b997d9bb22be7dee099d351816b97cd08bc53`。
- `git merge-base 628683a^1 628683a^2`：`860698a6573e63a2432157676a5ac9bc9ce54044`。
- `git rev-list --count 628683a^1..628683a^2`：27。读取研究报告 §2 的 27 个短 hash，与 `git log --format=%h --reverse 628683a^1..628683a^2` **逐项按顺序完全相同**；第二 parent 可达即全部可达。注意若使用 `BASE..H` 会额外包含 merge commit，不能期待该计数为 27。
- `git diff --stat 628683a^1 628683a`：81 文件、+3098/−571。
- `git diff --diff-filter=D --name-only 628683a^1 628683a`：空。
- `git diff --name-only 628683a^1 628683a -- package.json package-lock.json pnpm-lock.yaml next.config.ts 'tsconfig*' '*eslint*' .github .pi public`：空。包名、锁、CI、字体资产及用户 agent 提交内容未变化。
- `sha256sum -c research/evidence/user-agents-before.sha256`（使用任务目录完整路径）：三个 agent 全部 OK。当前三个文件仍为 ` M`，index 无暂存文件，未进入 merge 变更。
- `git ls-files -u`：空。扫描所有 tracked + 未忽略 untracked 文本，`^(<<<<<<<|>>>>>>>|\|\|\|\|\|\|\| )` 无命中；不扫描 node_modules/.git 等非项目数据。
- 工作区只含三个用户 agent 及 `.trellis/tasks/` 改动。另有 `09-19-font-license-in-next-release/task.json` 的 parent 字段修改，但它**已经出现在 status-before.txt**，不是本次检查或合并引入。未触碰。

历史“14 个 UU、逐处人工解决”的过程不能仅从最终提交倒推出操作手法；最终树、原冲突证据与 dry-run 清单相容，但不把执行者的历史操作声明冒充本次独立观察。

## fork 语义复核

| 检查点 | 实际代码/命令证据与判断 |
|---|---|
| sources 与 turn-written-files | `git diff H^1 H -- lib/written-file-sources.ts lib/turn-written-files.ts` 为空，两文件逐字保留 personal；`git show H:lib/turn-written-files.ts` 确认只有共享 sources 提取链，无 `writtenPathsFromFiles` / `collectApplyPatchDeletePaths` / `readApplyPatchPaths` 或对应残留 import。 |
| apply_patch 确认链 | 阅读 `lib/written-file-sources.ts:180–249,365–385`：summaries 优先、appliedFiles 回落、preview 只富化/排除删除；仅 details 缺失时使用 summary 文本回落。子代理来源及 sourceSessionId 路径未丢。 |
| 文件打开参数 | `TurnWrittenFiles.tsx:18` 的 options 含 page；MarkdownBody 用 `{page}`；MessageView/ChatWindow 使用共享 handler；AppShell 从 linked handler 到 openFileTab 到 initialPage 透传；FileViewer 保持数值签名，AppShell 的 `(filePath,page)` 适配为 `{sourceSessionId,page}`，没有混传对象/数值。唯一发现为 F1 的分支漏传。 |
| SessionSidebar | `git grep` 确认仅 `2072` 一处 `<SessionSearch`，`refreshKey={searchRefreshKey}`，不存在独立标识符 `listViewportH`；保留 listViewportHeight 和新增 resizer。 |
| useAgentSession | diff 确认 SessionData 同时保留 trellisSubagentRecords/wrapperRebuilt；loadSession 含 options.force，转为 force=1；applyTrellisHistory 在读取后保留，wrapperRebuilt 后重建事件连接；pendingAsk/autoCompactionEnabled 均同步。 |
| 分页读取 | diff 确认 countsTowardTail + rawWindowCap，while 仅累计 user/assistant/compaction；原 excludeLeaf、增量扫描部分未移除。分页、外部写入、尾部探测用例均通过。 |
| MessageView | image-mentions import 与渲染保留；ResultImages 在 expanded 条件之外渲染；PairedResult 使用 PathText（但 F1 指出新分支缺回调）；apply-patch.ts 被 getApplyPatchFiles 等实际调用，不是死文件；截断提示、展开状态保存均存在。 |
| Auth / CLI / 三语 | auth/providers 同时调用 createModelRuntimeWithExtensions 和 collectProviderListingInputs；bin 仅新增 getNextNodeArgs 接线，原 fork 启动逻辑保留；三语 diff 各 +7/−0，一致性单测通过。 |
| e2e 接线 / instrumentation | e2e/run 的 diff 保留个人分页与 Chromium executablePath，并新增 appendFileSync、APPEND、filePanelFixture/checkFilePanel 调用；Node/Edge instrumentation 拆分保留。这里只确认接线，未运行浏览器。 |

## preview-only 测试改写判断

**支持该决定，未发现删除排除覆盖缺口。**

- 上游 preview-only 期望从计划产生已写文件；personal 的 `preview-only and malformed details cannot establish successful writes` 明确要求相反结果，两种期望确实不能同时满足。
- 已解析 patch 的 preview 不证明对应 hunk 落地。保留“result 确认成功，preview 只辅助”的既有 fork 契约，比为了通过上游测试放宽成功判定更合理。
- 改写后的测试只证明 preview-only 什么也不确立，**不能单独证明有成功文件时的删除排除**；该独立覆盖仍在：`empty summaries are authoritative and applied fallback excludes known deletions` 用 appliedFiles `[gone.md,kept.md]` + preview delete，明确只返回 kept.md；`apply_patch uses appliedFiles and drops deletes` 也覆盖保留成功文件、排除删除；后续 delete/move 覆盖仍在。上述测试已独立重跑通过。
- 不应表述为完全兼容上游 preview-only 行为；这是有意维持 fork 的严格成功证据语义。缺 result 的旧扩展可能漏列，执行报告已指出该代价。

## 文档准确性与待补证据

1. **主要结果与原证据一致**，没有发现测试通过计数夸大。原报告没有展开 16 文件命令；本次从原测试名识别出新增的 TurnWrittenFiles 和 written-file-sources.check 两文件并复现 158，建议写明实际清单。
2. **设计文档尚未同步最终决定**：design.md §3 #13 仍要求将上游 parser 接入 sources，而实际为保留原 sources；§4 未逐项打勾；语义裁决仅在 execution.md，不满足 PRD R3/AC4 的字面落盘位置要求。建议更新设计为最终裁决，并引用本报告证据。
3. PRD 尾部仍有旧的“20 个提交”及 TBD 模板，建议删除，避免与有效的 27 提交要求冲突。
4. execution.md 的 U-4 标题“upstream/main 已前进”有歧义：本次 `git rev-parse upstream/main` 仍是 5e9b997，未 fetch，不能证明目标冻结后远端又前进。建议明确仅研究阶段从 d11d344 前进到 5e9b997，冻结后远端状态未查询。
5. 原报告“jsonResponse(req,{...}) 单参数形态”措辞自相矛盾（实际两个参数），不影响实现；实际类型 owner 在 components/TurnWrittenFiles.tsx，也不同于初始 design 的 lib 设想。
6. Node 版本、未跑 e2e、没有低版本验证均如实披露；本次维持这些限制。既有安装树来源未交代，应补安装来源或在独立发布核验环境干净安装验证，不能仅用当前 lint 为 0 证明安装树一致。

## 交接

只新增本报告及 `research/evidence/check-*.txt` 验证日志；H 与源码保持原样。建议主会话先处理 F1，并一并处理 F2/同步设计记录，再决定是否产生新基线；若 H 改变，发布任务必须引用新的提交与树 hash。浏览器交互仍为未覆盖，不把本次单测和 SSR 复现视为端到端批准。
