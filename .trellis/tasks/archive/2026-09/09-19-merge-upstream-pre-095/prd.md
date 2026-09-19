# 合并 upstream/main 落后提交到 personal

## Goal

把 `upstream/main`（`agegr/pi-web`）冻结点 `5e9b997` 的 **27 个提交**合并进 `personal`，
逐处人工解决 14 个冲突文件，产出**可发布且回归可验证**的冻结提交 `H`，作为
`0.9.5` 发布的唯一源码基线。

## Requirements

- **R1 冻结上游点**：合并目标 = `5e9b997`（`git rev-parse upstream/main`）。记录其 hash 与
  `merge-base`（`860698a`）作为证据。合并开始后若上游前进，不并入，只在报告里记录。
- **R2 合并形态**：使用 `git merge --no-ff upstream/main` 生成 merge commit，保留上游历史；
  合并前先在本地打一个**仅供回滚的**锚点记录（记录合并前 HEAD 的 hash，不强制建 tag）。
- **R3 冲突解决原则**：
  - 逐处人工解决，**禁止 `-X theirs` / `-X ours` / `git checkout --theirs` 整文件取一侧**。
  - 冲突性质几乎全是「personal 的 fork 特性 × 上游同文件新特性」的空间并存 → 默认**并集**。
  - 语义冲突（同一函数的两种实现）必须判断哪一侧是正确实现，并在 `design.md` 记录判断依据。
  - 14 个冲突文件的建议解决方向见 `design.md` §冲突处置表（来自实测 dry-run）。
- **R4 依赖零漂移**：合并结果不得改动 `package.json`、`package-lock.json`、`pnpm-lock.yaml`、
  `next.config.ts`、`tsconfig`、eslint 配置、`.github/**`。若出现差异，停止核实，不随手接受。
- **R5 fork 资产与用户资产保护**：
  - 保留包名 `@xup3ng/pi-web`、`bin/**`、`public/fonts/**`（含 `LICENSE-cascadia-code.txt`、
    `NOTICE.txt`、`fonts.test.mjs`）、`.trellis/**`、`.pi/**`、个人专有 `lib/**` 与个人 e2e 用例。
  - `.pi/agents/trellis-{check,implement,research}.md` 是用户未提交修改，合并**不得**触碰；
    合并前记录三者 SHA-256，合并后逐一比对。
  - 合并不得删除任何个人文件：`git diff --cached --diff-filter=D --name-only` 必须为空。
- **R6 语义复核（不能只看「无冲突」）**：对自动合并但双方都改过的文件逐项确认，至少覆盖
  `lib/session-reader.ts`（`sliceActiveBranch`：必须采用上游「只计可见消息 + `rawWindowCap`」逻辑，
  同时保住 personal 的增量扫描增强）、`app/api/auth/providers/route.ts`（上游
  `createModelRuntimeWithExtensions` + personal `collectProviderListingInputs` 并存）、
  `lib/i18n/messages/{en,zh-CN,zh-TW}.ts`（纯新增、三语齐全）、`bin/pi-web.js`、
  `e2e/run.mjs` 的上游 import 接线。
- **R7 回归验证**：按 `implement.md` 的验证矩阵执行 `tsc --noEmit`、`npm run lint`、
  `npm test`、定向测试；lint 以「不新增错误」为门槛（历史基线 14 条
  `react-hooks/preserve-manual-memoization`），并逐条比对。
- **R8 证据落盘**：合并前的 `git status --short` / `git rev-parse HEAD` / 三个 agent 文件 SHA-256，
  合并后的 `git log --oneline -1`、`git show --stat`、`--diff-filter=D` 空证明、各验证命令的退出码，
  全部写入任务 `research/`（建议 `research/merge-execution.md`）。
- **R9 边界**：本子任务**不** build、**不** pack、**不** publish、**不** push、**不**改版本号；
  合并提交只包含「上游 27 提交 + 冲突解决结果 + 必要的任务记录」，不混入无关改动。

## Acceptance Criteria

- **AC1（R1、R2）**：`git log --oneline -1` 为 merge commit，parents =
  `2415bdb`（合并前 personal HEAD）与 `5e9b997`；`git rev-list --count 2415bdb..HEAD` 覆盖
  27 个上游提交。
- **AC2（R3、R5）**：14 个冲突文件全部解决且 `git status` 无未解决标记；三个
  `.pi/agents/trellis-*.md` 的 SHA-256 与合并前逐字一致；`--diff-filter=D` 为空。
- **AC3（R4）**：`git diff 2415bdb..HEAD -- package.json package-lock.json pnpm-lock.yaml next.config.ts tsconfig.json eslint.config.mjs .github` 输出为空。
- **AC4（R6）**：`design.md` 的语义复核清单逐项打勾，每项有实际命令或代码片段证据。
- **AC5（R7）**：`tsc --noEmit` exit 0；`npm run lint` 错误数与基线一致（14 条，逐条比对记录）；
  `npm test` exit 0 且包含上游新增的 9 个单测文件；定向复核测试清单按 `implement.md` 跑完并记录。
- **AC6（R8）**：`research/merge-execution.md` 含全部前后证据与退出码，且给出 `H` 的
  提交 hash 与树 hash（供发布子任务引用）。

## Out of Scope

- 版本号 bump、构建、打包、发布、push（属发布子任务）。
- 上游 range 之外的新功能开发；`09-19-append-system-editor` 的实现。
- 修 lint 历史噪声（只要求不新增）。
- 顺手升级依赖或重生成锁文件。

## Notes

- 研究：`research/upstream-merge-analysis.md`（含 27 提交清单、14 冲突文件逐处性质、
  dry-run 的合并结果树 `54e53ad8bf709594e23f0aab41dacf0e21ccb821`、回滚方案）。
- 已知环境变更：`refs/remotes/upstream/main` 已由 `d11d344` 前进到 `5e9b997`（研究阶段 fetch 所致，有意保留）。
- `e2e/run.mjs` 两侧都改过，是本次最容易被 `--theirs` 破坏的文件；个人分页/trellis 断言必须保住。

## Goal

把 agegr/pi-web upstream/main 相对 personal 的 20 个提交合并进 personal，处理冲突与依赖漂移，产出可发布基线并给出回归验证证据。

## Requirements

- TBD

## Acceptance Criteria

- [ ] TBD

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
