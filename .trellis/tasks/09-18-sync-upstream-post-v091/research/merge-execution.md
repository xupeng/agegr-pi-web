# 合并执行证据（A0–A6，2026-09-18）

> 本文件只记录真实执行过的命令与原始结果，不含推测。
> A7（提交）、A8（归档 09-09）与阶段 B（发布）执行前，本文件是"已验证候选树"的凭证。

## 0. 结论摘要

| 项 | 结果 |
|----|------|
| merge 拓扑 | `personal`(391c141) + `upstream/main`(860698a) 普通 merge，19 个路径 staged，0 未解决 |
| 冲突 | 仅 `components/ChatWindow.tsx`（1 处），已按 design §2.3 解决 |
| tsc | 工作树与隔离候选树均 **exit 0**；真基线（clean install）**exit 0** |
| lint | 工作树与隔离候选树均 **0 problems / 462 files**；真基线 **0 problems**（见 §4 对 14→0 的解释） |
| 全量单测 | 工作树 **1239 pass / 0 fail**；隔离候选树 **1239 pass / 0 fail**；真基线 **1224 pass / 0 fail** |
| 上游 5 个测试文件专项 | **27 pass / 0 fail**（工作树与隔离候选树一致） |
| 独立质量检查（trellis-check） | 8 组代码项全部 PASS；提出 3 项范围/证据问题，处置见 §11–§13 |
| next | 16.3.1 → **16.3.5**（`npm ls next` 干净，node_modules 实测 16.3.5） |
| 双锁 | `package-lock.json` = 上游 e5a2434 的锁更新；`pnpm-lock.yaml` 仅 next 家族 + `time: {}` |
| 用户 3 个 agent 文件 | 未改（mtime 仍是 2026-09-13，SHA256 见 §2/§7） |
| 未提交并发改动 | `components/AskUserCard{,.test}.mjs`（**另一会话**在 16:53 编辑，见 §8） |

## 1. 环境

```
$ node -v; npm -v; pnpm -v          # v26.1.0 / 11.13.0 / 10.33.0
$ git branch --show-current          # personal
$ git worktree list                  # 主 checkout 位于 391c141 [personal]
```

## 2. A0 前置核对

```
$ git rev-parse HEAD                  # 391c141260a6c8eb5dfc9a8457bcbfcf72055aad
$ git rev-parse upstream/main         # 860698a6573e63a2432157676a5ac9bc9ce54044
$ git merge-base HEAD upstream/main   # 8366762fa4b4ef3327f1b19e8ff7bf891a14c06c
```

合并前工作区（与 implement.md A0 期望一致）：

```
 M .pi/agents/trellis-check.md
 M .pi/agents/trellis-implement.md
 M .pi/agents/trellis-research.md
?? .trellis/tasks/09-13-npm-patch-release/
?? .trellis/tasks/09-18-sync-upstream-post-v091/
```

3 个用户文件的 SHA256（合并后复核值，见 §7）：

```
1404a40a04b3dd9664fbf2072d2c80cc96c70625065bf2b9bbeabcaf762ceabf  .pi/agents/trellis-check.md
0fa8906a609cf36c9b30c233281273e69114d0307f0bdf68c89864e15a99600e  .pi/agents/trellis-implement.md
9af8acee27ee8dd1149174d34bbefe3022209812684e981ec62e9bc3f13159d3  .pi/agents/trellis-research.md
```

**说明**：中断的子代理没有落盘 A0 时刻的 hash；本次用 mtime 作为等价证据——
三个文件 mtime 均为 `2026-09-13 06:53:*`，早于本次 merge（`2026-09-18 14:19:52`），
且它们从未出现在 merge 的文件集合或 index 中（`git status` 始终为 ` M`，从未变成 `M `）。

## 3. A1 备份锚点

```
$ git tag pre-upstream-860698a-20260918-141723 391c141260a6c8eb5dfc9a8457bcbfcf72055aad
$ git tag --list 'pre-upstream-*'
pre-upstream-860698a-20260918-141723
```

## 4. A2/A6 验证对照（含"14 条 lint 诊断"的归因）

### 4.1 两次基线

| 运行 | 环境 | tsc | lint | 单测 |
|------|------|-----|------|------|
| R1（中断子代理，14:18–14:19） | 主 checkout 的**既有 ad-hoc node_modules** | 未记录 | **14 problems（14 errors）** 全部 `react-hooks/preserve-manual-memoization`，位于 `ChatInput.tsx`(7)/`ChatMinimap.tsx`(5)/`SessionSidebar.tsx`(2) | **1224 pass / 0 fail** |
| R2（本次补做，clean install 复现） | `git worktree add 391c141` + `npm ci`（next 16.3.1，锁一致） | **exit 0** | **0 problems** | **1224 pass / 0 fail** |

### 4.2 候选（合并后）验证

| 命令 | 退出码 | 结果 |
|------|--------|------|
| `node_modules/.bin/tsc --noEmit` | 0 | 无输出 |
| `npm run lint` | 0 | `eslint .`，**462 files linted / 0 messages** |
| `npm test`（全量） | 0 | **tests 1239 / pass 1239 / fail 0** |
| 5 个上游文件专项 `node --test lib/auth-throttle.test.mjs lib/file-paths.test.mjs lib/paths.test.mjs app/api/web-auth/route.test.mjs components/ChatWindow.extension-request.test.mjs` | 0 | **tests 27 / pass 27 / fail 0** |
| `npm ls next` | 0 | `└── next@16.3.5` |

### 4.3 为什么 lint 从 14 条变成 0 条（逐条核对结论）

不是"改了源码让诊断消失"，也不是被忽略跳过：

- 候选运行确实 lint 了 462 个文件（`npx eslint . -f json` 统计），`react-hooks/preserve-manual-memoization` 在 `--print-config` 中仍是 `[2]`（error）。
- 合并**没有改**那三个出问题的文件（`git diff --stat HEAD -- components/ChatInput.tsx components/ChatMinimap.tsx components/SessionSidebar.tsx` 为空）。
- `eslint-config-next` 的 `dist/index.js` 在 16.3.1 与 16.3.5 之间**逐字节相同**；`eslint-plugin-react-hooks` 版本两版都是 7.0.1（锁中嵌套路径一致）。
- 关键差异在主 checkout 的**既有 node_modules 是陈旧/混杂树**：本次 `npm install` 的摘要为
  `added 204 packages, removed 313 packages, changed 86 packages, and audited 938 packages in 47s`。
- 用 HEAD 的锁做干净安装（R2）后，同一份 391c141 源码得到 **0 条诊断**。

结论：那 14 条诊断来自 R1 时**主 checkout 里与锁不一致的依赖树**，不是合并带来的；
干净安装后基线与候选都是 0 条，本次合并**没有新增任何 lint 诊断**。
（历史任务报告里"14 条继承诊断"同源于此，本次不再把它当作源码状态。）

## 5. A3 merge 与冲突解决

```
$ git merge upstream/main
Auto-merging AGENTS.md
Auto-merging app/globals.css
CONFLICT (content): Merge conflict in components/ChatWindow.tsx
Auto-merging lib/i18n/messages/{en,zh-CN,zh-TW}.ts
Auto-merging lib/worktree.ts
Auto-merging package-lock.json
Auto-merging package.json
```

staged 的 19 个路径（`git diff --cached --name-only`）：
`AGENTS.md`、`app/api/web-auth/route.test.mjs`、`app/api/web-auth/route.ts`、`app/globals.css`、
`app/login/page.tsx`、`components/ChatWindow.extension-request.test.mjs`、`components/ChatWindow.tsx`、
`lib/auth-throttle.test.mjs`(A)、`lib/auth-throttle.ts`(A)、`lib/file-paths.test.mjs`(A)、
`lib/file-paths.ts`、`lib/i18n/messages/{en,zh-CN,zh-TW}.ts`、`lib/paths.test.mjs`、`lib/worktree.ts`、
`next.config.ts`、`package-lock.json`、`package.json`。

### 5.1 冲突解决过程与结果

- 冲突块 = `1351–1403` 行（`<<<<<<< ours` / `||||||| base` / `=======` / `>>>>>>> theirs`）。
- 过程中曾用 `git checkout --ours components/ChatWindow.tsx` 短暂取"我方整文件"，随即发现这会丢掉
  上游对同一文件的另外两处自动合并改动（`fcd94bf` 标题换行、`ed0eea9` `scrollMargin`），
  于是 `git checkout --merge components/ChatWindow.tsx` 恢复冲突态，改为只替换冲突块。
- 最终解决（保留 personal 位置 + 采用上游内容）：

```tsx
      {isEmptyNew && (
        <div className="mb-3 w-full" style={{ paddingLeft: 16, paddingRight: isMobile ? 16 : 52 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, maxWidth: "var(--chat-content-max-width, 820px)", margin: "0 auto", fontFamily: "var(--font-mono)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 7 : 10, minWidth: 0, flex: 1, lineHeight: 1.4, overflow: "hidden" }}>
              <Image src="/icons/apple-touch-icon.png" width={32} height={32} alt="" priority style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 22, color: "var(--text)", fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>Pi Web</span>
              <NewSessionUpdateLink label={(version) => t("appUpdate.releaseNotes", { version })} />
            </div>
            ...
          </div>
        </div>
      )}
      {askUserCardInColumn}
      <div className="relative shrink-0">
        {chatInputElement}
        <ExtensionStatusBar statuses={extensionStatuses} widgets={extensionWidgets} />
      </div>
```

- 残留标记检查：`grep -c '<<<<<<<|=======|>>>>>>>' components/ChatWindow.tsx` → `0`；
  全仓 `grep -rn '^<<<<<<< |^>>>>>>> '` → 无结果；`git diff --check` → 无 whitespace error。
- 与 merge-tree 自动合并结果（含冲突标记的 `feb9782c`）对比：**差异行只落在 1351–1403 这一个 hunk 内**，
  说明没有误伤同文件其它自动合并区域。

## 6. A4 自动合并文件的语义复核（8 项，逐条给出证据）

| # | 文件 | 期望 | 实测证据 |
|---|------|------|----------|
| 1 | `app/globals.css` | 扩展 widget 用同一 offset | `657: font-size: calc(14px + var(--chat-font-size-offset, 0px));`（`.extension-widget-content` 在 652 行）；`700: --chat-font-size-offset: calc(var(--chat-content-font-size, 14px) - 14px);`；另见 `710`、`834` 同为该 offset |
| 2 | `lib/worktree.ts` | 缓存 + 超时 + 远端 tip 共存 | `45: const PROJECT_CACHE_TTL_MS = 600_000;`；`54: clearCachedProjectsOnDisk();`；`57: async function git(cwd, args, timeoutMs = 10_000)`；`59: timeout: timeoutMs`；`226: const WORKTREE_TIMEOUT = 5 * 60_000;`；`234/235: refs/remotes/origin/<branch>` 优先 |
| 3 | `components/ChatWindow.tsx` | 上游两处扩展修复 + personal hunk 都在 | `1605/1607`：`Pi's TUI ...` 注释与 `whiteSpace: "pre-wrap"` 标题；`1691: scrollMargin: 14`；`925/1370: askUserCardInColumn`（裸卡片 + 列内包装）；`26: import type { TrellisSubagentRecordsSnapshot }` |
| 4 | `AGENTS.md` | 上游两段 + personal 章节 | `222`：UNC 路径段落；`239–242`：`### Web password throttling` 三条；personal 章节（`## Architecture`、`## File Map`、`## Key Design Decisions & Traps` 等）保留 |
| 5 | `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | 三语同 key | 三文件均在 `67` 行：`"auth.tooManyAttempts": ... {seconds} ...` |
| 6 | `package.json` | next 16.3.5 + fork 身份 | `3: "version": "0.9.2"`；`64: "next": "16.3.5"`；`85: "eslint-config-next": "16.3.5"`；scripts/release 脚本未变 |
| 7 | `package-lock.json` | 根是 fork，next 为 16.3.5 | `root name/version = @xup3ng/pi-web 0.9.2`；`node_modules/next -> 16.3.5`、`node_modules/eslint-config-next -> 16.3.5`；`16.3.1 相关条目数: 0` |
| 8 | `next.config.ts` | `images.unoptimized` | `18: images: { unoptimized: true },`，含上游注释（GHSA 说明） |

`git diff --stat 8366762..HEAD -- app/globals.css lib/worktree.ts AGENTS.md next.config.ts` 与上述一致，无缺项。

## 7. A5 依赖与锁（D4）

```
$ node -p "require('next/package.json').version"    # 安装前 16.3.1
$ npm install                                       # exit 0
  added 204 packages, removed 313 packages, changed 86 packages, and audited 938 packages in 47s
  found 0 vulnerabilities
$ node -p "require('next/package.json').version"    # 16.3.5
$ npm ls next                                       # exit 0, └── next@16.3.5（无 unmet/peer 报错）
$ pnpm install --lockfile-only --config.resolutionMode=time-based   # exit 0, Done in 8.7s
$ grep -c 'next@16.3.1' pnpm-lock.yaml              # 0
$ grep -c 'next@16.3.5' pnpm-lock.yaml              # 6
```

- `npm install` 对 `package-lock.json` 无额外改动（锁里已是上游合并进来的 16.3.5 版本），
  即锁文件的变化全部来自 `e5a2434` 本身。
- `package-lock.json`（相对合并前 HEAD）变化范围：`(root)` + next 家族（`next`/`@next/*`/`eslint-config-next`）
  + sharp 家族（0.35.3→0.35.4）+ 上游 `npm audit fix` 顺带带上的 `@humanfs/*`、`@xmldom/xmldom`(0.8.13→0.8.15)、
  `fastq`(1.20.1→1.20.3)、`@eslint/eslintrc/node_modules/js-yaml`(4.3.1→4.3.2)，以及新增 `node_modules/@humanfs/types`。
  这些都在上游 `e5a2434` 的提交范围内，不是本次安装引入的漂移。
- `pnpm-lock.yaml`（相对 HEAD）结构化 diff：新增/删除的 block 全部是 next 家族
  （`next@16.3.5` 及 `@next/*`、`eslint-config-next`），内容变化的 block 只有根 importer `.` 与尾部的 `time: {}`；
  `eslint-config-next` 的 peer 仍指向同一 `@typescript-eslint/parser@8.68.0`，无无关升版。
- `pnpm` 使用的是 `--config.resolutionMode=time-based`（探针结论见 `merge-forecast.md` §5.1），
  默认解析会带上与本次无关的升版，未采用。

## 8. 中断与并发写入记录（重要）

1. **子代理中断**：`trellis-implement` 于 14:17 建备份 tag、14:18 跑基线 lint、14:19 跑基线单测后
   执行 `git merge upstream/main`（`.git/MERGE_HEAD` mtime = 14:19:52），随后在**未解冲突的状态下中断**，
   未返回结果，也未写研究文件。A3 之后的全部工作由主会话在 16:54 之后继续完成。
2. **另一会话并发改同一 checkout**：16:53:04 有另一个 pi 会话（`~/.pi/agent/sessions/.../2026-09-18T03-10-36-488Z_*.jsonl`）
   修改了 `components/AskUserCard.tsx` 与 `components/AskUserCard.test.mjs`（去掉问题区 `maxWidth`，改为占满可用宽度），
   该会话自述"因仓库存在未解决的合并冲突，未运行全量类型检查；尚未提交"。
   这两个文件**不属于本次合并范围**，A7 提交计划中必须排除。
3. **运行中的 dev server**：本 checkout 上有一个 `next dev -H 192.168.11.47 -p 8505`（14:42 启动，PID 1349415/1349432），
   在冲突存在期间仍能响应（`GET / -> 200`、`GET /api/home -> 200`）。
   本次 `npm install` 把 `node_modules/next` 从 16.3.1 换成 16.3.5，该进程仍持有旧模块，
   **可能需要重启 dev server 才能与当前依赖一致**（未代为重启）。

## 9. 未覆盖项（如实列出，不以其它证据冒充）

- 未跑 `e2e/run.mjs` / `e2e/subagents.mjs`，未做浏览器手工 smoke（D5 的验证深度不含）：
  因此**品牌区新布局在真实浏览器中的表现、扩展下拉 `scroll-margin`、对话框标题换行、
  `images.unoptimized` 对静态 logo 之外资源的实际影响、auth 限流在真实多标签下的表现**
  均属未覆盖项。
- 未在隔离目录做 build（阶段 B 才会做，且只在隔离目录）。
- 未做发布相关任何动作（npm ci / pack / audit / smoke / publish）。

## 10. 下一步（待用户确认）

- A7：按 workflow 3.4 给出提交计划（merge 提交 + 锁文件跟进 + 任务记录），**排除**用户 3 个 agent 文件
  与另一会话的 `AskUserCard*.{tsx,mjs}`；确认后执行并记录冻结提交 `H`。
- A8：归档 `09-09-sync-upstream-release`。
- 阶段 B：隔离发布 `0.9.4`（前置门：`npm whoami` 需从当前 401 恢复为 `xup3ng`）。

## 11. 隔离候选树复验（A6 补强，回应检查项 3）

问题：§4.2 的验证在主 checkout 工作树执行，而工作树同时含有**另一会话**对
`components/AskUserCard{,.test}.mjs` 的未提交改动，因此那份"全绿"并非纯粹候选（index）状态。

做法（不写任何 ref、不动 HEAD）：

```
$ git write-tree
ef455ab48a24eb8cf7d1579c28f1f27d930ac68f          # staged index 的树
$ git commit-tree ef455ab -p 391c141 -p 860698a -m "tmp: candidate merge result (verification only, no ref)"
751a92587de52b1409fe50b00a5dcdc816f1bec6
$ git worktree add --detach /home/xupeng/dev/personal/forked/.pi-web-verify-candidate 751a925
$ cd .pi-web-verify-candidate && npm ci --prefer-offline   # exit 0, added 937 packages, next 16.3.5
```

该树只含 staged 内容：`diff` 确认其 `components/AskUserCard.tsx` 仍是 HEAD 版本
（保留 `maxWidth: "calc(72ch + 47px)"` 与 `maxWidth: "72ch"`），即不含另一会话的改动。

| 命令（在隔离候选树执行） | 退出码 | 结果 |
|--------------------------|--------|------|
| `node_modules/.bin/tsc --noEmit` | 0 | 无输出 |
| `npm run lint` / `npx eslint . -f json` | 0 | linted files 462，messages 0 |
| `npm test` | 0 | **tests 1239 / pass 1239 / fail 0**（73.2s） |
| `node --test lib/auth-throttle.test.mjs lib/file-paths.test.mjs lib/paths.test.mjs app/api/web-auth/route.test.mjs components/ChatWindow.extension-request.test.mjs` | 0 | **tests 27 / pass 27 / fail 0** |

结论：纯净候选树与工作树结果一致，说明"全绿"不是并发改动造成的假象；
`AskUserCard*.{tsx,mjs}` 的改动既不属于合并范围，也不影响本次验收结论。

## 12. 用户未提交文件的合并前 hash 溯源（回应检查项 1）

检查项：`merge-execution.md` 原稿用 mtime 代替字节一致性证据，不足以证明 R3/AC3。

本次补足到"合并前已有同值 hash 记录"：

```
$ grep -o 'sha256sum .pi/agents/trellis-check.md ... ' ~/.pi/agent/sessions/.../2026-09-13T05-07-15-548Z_*.jsonl
sha256sum .pi/agents/trellis-check.md .pi/agents/trellis-implement.md .pi/agents/trellis-research.md
1404a40a04b3dd9664fbf2072d2c80cc96c70625065bf2b9bbeabcaf762ceabf  .pi/agents/trellis-check.md
0fa8906a609cf36c9b30c233281273e69114d0307f0bdf68c89864e15a99600e  .pi/agents/trellis-implement.md
9af8acee27ee8dd1149174d34bbefe3022209812684e981ec62e9bc3f13159d3  .pi/agents/trellis-research.md
```

同样的三个值出现在 **2026-09-11** 与 **2026-09-13** 的会话日志里，与今天（合并后）实测值逐字相同：
即这些文件的内容自 09-11 起未变，跨越了本次 merge。

补充的拓扑证据：

```
$ git diff --name-only 8366762..860698a -- .pi/agents        # 0 个（上游从未改这些路径）
$ git diff --name-only 8366762..391c141 -- .pi/agents        # 3 个（personal 历史的已提交改动）
```

即：上游侧对该路径零改动，merge 结果就是 personal 已提交版本；工作区里那份未提交修改
因此不需要被 git 触碰（否则 merge 会以 "local changes would be overwritten" 中止，而它成功了）。
结合 §2 的 mtime 与 index 证据，R3/AC3 成立。

## 13. R4/AC4 的口径问题（回应检查项 2，**待用户裁定**）

AC4 原文为"两锁 diff 只涉及 next 家族"，实测：

- `pnpm-lock.yaml`：严格满足（只有 next 家族 + 根 importer + `time: {}`）。
- `package-lock.json`：除 next 家族外，还含上游 `e5a2434` 自带的
  `sharp` 0.35.3→0.35.4、`@img/sharp-*`、`@humanfs/*`、`@xmldom/xmldom`、`fastq`、
  `@eslint/eslintrc/node_modules/js-yaml` 与新增 `@humanfs/types`——**全部来自上游提交本身**，
  本次 `npm install` 没有产生任何额外改动（安装前后锁逐字节相同）。

两种处置口径：

1. **认定为范围内**（推荐）：这些条目属于要合入的上游提交 `e5a2434` 的内容，
   接受即可，把 AC4 的口径补注为"pnpm 锁仅 next 家族；npm 锁的额外条目全部来自上游提交"。
2. **要求剔除**：手工回退 npm 锁里这些非 next 条目。代价是与上游锁分叉，
   阶段 B 的 `npm ci` 与后续再合上游时都可能产生冲突，且不再是"上游原样"。

按 R7/流程要求，此项属于验收标准口径变更，需用户明确裁定后才进入 A7。

## 14. 事故与清理记录（透明性）

- 复现真基线时把临时 worktree 建在 `/tmp`，而 `/tmp` 是 **2.0 GiB tmpfs**，
  两个 `node_modules` 把它写满 → 隔离候选树的 `npm ci` 因 `ENOSPC` 失败（exit 1）。
- 处置：删除 `/tmp/pi-web-baseline-391c141`、`/tmp/pi-web-candidate`（均为本次临时树，
  非用户数据），把候选树改建到 `/home/xupeng/dev/personal/forked/.pi-web-verify-candidate`（大盘），
  重新 `npm ci` 成功。
- 事故后核验主 checkout 完好：`next 16.3.5`、`npm ls next` 正常、`git status` 与事故前完全一致。
- `/tmp` 仍占用 ~349 MiB，其中含 **上一个任务遗留** 的 worktree `/tmp/pi-web-0.9.2-verify`
  （本任务未创建、未删除）。
- 本次临时对象：tree `ef455ab`、commit `751a925`（无 ref 引用，验证完成后可被 gc；不进入提交历史）。
