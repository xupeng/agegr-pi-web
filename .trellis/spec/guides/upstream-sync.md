# 上游同步（agegr/pi-web → 本 fork）

> 本仓库是 `agegr/pi-web` 的 fork（npm 包名 `@xup3ng/pi-web`）。上游持续前进，我们必须周期性
> 把 `upstream/main` 合并进 `personal`，同时**逐字保住 fork 行为**。
> 本文记录真实做过的合并（见 §7 记录）里成立的做法与被验证过的坑。

## 1. 何时用

- 准备发一个新的 npm 版本之前（惯例是「先同步上游，再发布」）。
- `git rev-list --count HEAD..upstream/main` 不为 0，且需要把上游修复纳入。
- 收到上游 PR 的具体 bug 修复、需要立刻跟进时。

## 2. 前置事实收集（先做，别直接 merge）

```bash
git fetch upstream main                       # 注意：这会推进 refs/remotes/upstream/main
git rev-parse HEAD upstream/main              # 记录 BASE / TARGET
git merge-base HEAD upstream/main             # 上次同步点
git rev-list --count HEAD..upstream/main      # 落后提交数
git diff --shortstat "$(git merge-base HEAD upstream/main)"..upstream/main
git diff --name-status "$(git merge-base HEAD upstream/main)"..upstream/main --diff-filter=D
```

必查三项：

- **落后提交数会过时**：任务书/记忆里的数字常常已经不是当前值（本仓库出现过「20 个」实际是
  「27 个」）。一律以 `git rev-list --count` 的实测为准。
- **`--diff-filter=D` 是否为空**：上游是否删除了本 fork 仍在用的文件。
- **依赖与配置是否漂移**：`package.json`、`package-lock.json`、
  `next.config.ts`、`tsconfig*`、eslint 配置、`.github/`。若上游改过其中任何一项，本次同步
  就必须同时处理锁文件/依赖升级，规划时要显式写出来（零漂移的同步可以跳过 `npm install`）。

**冲突预判不要靠猜**：在**临时 worktree** 里做一次 dry-run，拿到真实冲突文件清单，
写进任务的研究文档。绝不能为了预判而污染主 checkout 的工作树与 index。

## 3. 合并执行（硬性禁令）

```bash
git merge --no-ff upstream/main
```

- 用 `--no-ff` 保留 merge commit：上游提交保持可达，回滚只需 `git reset --hard <BASE>`。
- **禁止 `-X ours` / `-X theirs`**，**禁止 `git checkout --ours|--theirs <file>`**。
  本仓库的冲突几乎全是「fork 特性 × 上游同文件新特性」落在不同代码位置，正确产物是**并集**；
  整侧取值会静默丢掉 fork 行为（受害最重的文件：`e2e/run.mjs`、`components/SessionSidebar.tsx`、
  `lib/turn-written-files*`）。
- **禁止 `git add -A` / `git add .`**：工作树里常有用户未提交的 `.pi/agents/*.md` 等资产。
  按路径显式 `git add`，提交前用 `git status --short` 人工过一遍。

每个冲突文件的处理流程：

```bash
git show :1:<file> > /tmp/base.txt     # 共同祖先
git show :2:<file> > /tmp/ours.txt     # 本 fork
git show :3:<file> > /tmp/theirs.txt   # 上游
grep -nE '^(<<<<<<<|=======|>>>>>>>)' <file>   # 解决后必须无输出
```

**顺序**：先底层库（`lib/`）→ 再 API 路由/`hooks/` → 再 `components/` → 最后 `e2e/`。
上层类型依赖未定的下层签名，反过来做会反复返工。

## 4. 冲突解决的五条判断规则

1. **同一行为两侧实现不同 → 先问「哪个是 fork 的用户可见契约」**。fork 的一方保留语义，
   上游的一方可以吸收其实现细节（命名、结构、性能）。
   - 实例：`components/SessionSidebar.tsx` 的 `listViewportH` → fork 改名 `listViewportHeight`，
     上游新增代码仍用旧名；保留 fork 命名，把上游新增行改成新名。
2. **共享通道的签名分叉 → 统一到 fork 的 options 通道，把上游新参数并进去**。
   - 实例：fork 的 `OpenWrittenFileHandler = (filePath, options?: {modeHint?, sourceSessionId?})`
     vs 上游 `(filePath, page?: number)`。做法是给 options 增加 `page?`，让
     `MarkdownBody` / `MessageView` / `ChatWindow` / `AppShell` 统一使用该类型，
     只有 `components/FileViewer.tsx:42` 保持数值形态（它自成一条链，由
     `components/AppShell.tsx:2504` 的内联函数桥接）。**不要制造第三种签名。**
3. **一侧实现是另一侧的超集/更完善版 → 留一个，删掉另一个的死代码**。
   - 实例：fork 的 `lib/written-file-sources.ts` 已完整实现 apply_patch 提取
     （`details.result.summaries` → `appliedFiles` → `preview` 富化 → summary 文本回落，
     含删除排除）。上游在同文件引入了 `readApplyPatchPaths` 等三个 helper；保留 fork 实现，
     **删除上游 helper 及其 import** —— 否则留下两套并行逻辑 + 未使用死代码。
   - 注意区分「文件级保留」与「函数级删除」：`lib/apply-patch.ts` 本身要留（它服务
     `components/MessageView.tsx` 的 apply_patch 分栏 diff 渲染）。
4. **上游测试与 fork 的专用回归测试语义对立 → fork 的专用测试赢，改写上游测试并写明理由**。
   - 实例：上游要求 `apply_patch` 的 `details` 只有 `preview`（无 `result`）时按 preview 列出文件；
     fork 的 `lib/written-file-sources.check.test.mjs` 断言 preview-only **不得**确立写入
     （`preview` 由解析后的补丁生成，部分失败时仍含未落地的文件 → 会把失败文件谎报为「已写入」）。
     处置：不引入 preview 回落，把上游那条用例改写成
     `apply_patch preview-only details write nothing without a confirming result`。
   - 这是**唯一**允许改写某一侧测试期望的场景；改写必须在任务研究文档里留档。
5. **两侧各自新增的测试 → 都保留**。测试文件冲突（如 `components/MarkdownBody.test.mjs`、
   `lib/turn-written-files.test.mjs`）默认并集，冲突标记只删分隔行；注意 diff3 常常把最后一行
   `});` 留在冲突区之外，合并后要补回，否则 `tsc`/`node --check` 会报未闭合。

## 5. 「无冲突」不等于没问题

自动合并成功、但**双方都改过同一文件甚至同一函数**的位置必须人工复核。历次同步的高价值复核点：

| 文件 | 为什么要看 |
|------|-----------|
| `lib/session-reader.ts` | `sliceActiveBranch` 双方都改过：上游改计数逻辑（只计可见消息 + `rawWindowCap`），fork 有分页 `excludeLeaf` 与增量扫描增强 |
| `app/api/auth/providers/route.ts` | 上游 `createModelRuntimeWithExtensions()` 与 fork `collectProviderListingInputs()` 必须配套 |
| `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | 上游新 key 必须三语齐全（`npm test` 的 i18n 一致性用例会兜底） |
| `e2e/run.mjs` | 上游新 import/fixture/调用是否都进来，fork 的 `PLAYWRIGHT_EXECUTABLE_PATH` 是否还在 |
| `bin/pi-web.js`、`instrumentation*.ts` | 上游包装/拆分不得破坏 fork 启动链 |

验证顺序（退出码即判据）：

```bash
node_modules/.bin/tsc --noEmit ; echo "tsc=$?"
npm run lint 2>&1 | tee /tmp/lint-after.txt ; echo "lint=${PIPESTATUS[0]}"
npm test 2>&1 | tee /tmp/test-after.txt ; echo "test=${PIPESTATUS[0]}"
```

- **lint 基线必须现场实测**，不要复用记忆里的数字（本仓库曾把「历史 14 条
  `react-hooks/preserve-manual-memoization`」当作基线，实测当前基线是 **0 条**）。
  门槛是「错误集合与基线完全相同」，新增任何一条即失败。
- 单测默认不跑 `test:e2e`（依赖 `.next/dev/lock` 空闲、浏览器可用，且历史有间歇失败）；
  不跑就必须在任务记录里写明**残余风险**（UI 交互层只有单测与类型检查覆盖）。

## 6. 提交与冻结

```bash
git show --stat HEAD            # 核对变更规模与上游 shortstat 是否量级一致
git diff --diff-filter=D --name-only HEAD^1..HEAD     # 必须为空：没丢 fork 文件
git diff --name-only HEAD^1..HEAD -- package.json package-lock.json \
  next.config.ts 'tsconfig*' '*eslint*' .github        # 零漂移证明
git rev-list --count HEAD^1..HEAD^2                    # 上游提交数
sha256sum .pi/agents/*.md                              # 用户资产前后一致
```

**冻结 `H` = 合并后的 personal HEAD 的 commit hash**（不是分支名），后续构建/发布引用该 hash；
`H` 一变，已封存的产物作废。

**独立检查发现的修复用追加提交，不要 amend 已合并的 commit**：check 报告会按 hash 引用被检对象，
amend 会让那些引用失效。修复提交 + 复验记录比重写历史更可信。

## 7. 记录

| 日期 | 上游点 | 落后 | 冲突文件 | 冻结 H | 记录 |
|------|--------|------|----------|--------|------|
| 2026-09-19 | `5e9b997` | 27 | 14（全 `UU`） | `fc2323e`（merge `628683a`） | `.trellis/tasks/archive/…` 与 `.trellis/tasks/09-19-merge-upstream-pre-095/research/merge-execution.md` |

本次同步暴露的两个「测试看不见」的回归（独立检查才发现），作为复核提醒：

- 采用上游重构后的组件结构时，**新分支可能漏传 fork 的 handler**（`MessageView` 的
  `patchFiles && isError` 分支漏了 `onOpenFile`，导致部分失败的 apply_patch 结果里
  已确认路径退化为纯文本）。
- 上游新增的对话区排版可能写死字号，违反
  [quality-guidelines.md](../frontend/quality-guidelines.md) 的
  `calc(Xpx + var(--chat-font-size-offset, 0px))` 契约。
