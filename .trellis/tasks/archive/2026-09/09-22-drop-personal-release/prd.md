# 废弃并清理 personal-* GitHub Release 渠道

## Goal

把已废弃的 `personal-*` GitHub Release 发布渠道从仓库里彻底移除：删掉 workflow 与脚本、
清掉它唯一的孤儿依赖 `pnpm-lock.yaml`，并把 docs / spec 里对它的引用改成"渠道已废弃 + 现役
npm 渠道"的单一事实。**历史 tag 与 GitHub Release 保留**（不可逆删除已由用户明确排除）。

用户判定："「personal-* GitHub Release」已废弃，帮我清理掉"。

## Background

### 渠道构成（规划期实测）

| 组成 | 位置 | 事实 |
|---|---|---|
| workflow | `.github/workflows/release-personal.yml`（3.5K） | `on.push.tags: personal-*` → pnpm 10 安装 → `npm run build` → `npm pack` → `gh release create`；**最后一次运行 2026-08-29**（run 33278173322，`personal-0.8.11.11`） |
| 脚本 | `scripts/release-personal.sh`（3.3K） | 版本校验与 tag 拼装**硬编码 `0.8.x-personal.N`**，与现役 `0.9.x/0.10.0` 线脱节；0.10.0 未使用它 |
| 锁文件 | `pnpm-lock.yaml`（被跟踪） | **唯一消费者就是该 workflow**（`package.json` 无 pnpm 脚本；上游 `upstream/main` 无此文件：`git cat-file -e upstream/main:pnpm-lock.yaml` 失败） |
| 文档 | `docs/release-npm.md:5`、`:66`（"personal 内部"一行）；`docs/release.md:6`（fork 加的"与本 fork 的 GitHub 发布流程不完全一致"注记） | `release-npm.md` 是 fork 独有；`release.md` 是上游文件，但那行注记由 `b4d7fc1`（xupeng）添加，删掉它**减少**与上游的差异 |
| spec | `.trellis/spec/frontend/quality-guidelines.md:82`、`:119`（"两套受跟踪 lockfile"机制段）；`.trellis/spec/frontend/directory-structure.md:50`（`scripts/` 清单）；`.trellis/spec/guides/upstream-sync.md`（锁文件漂移清单含 pnpm-lock） | 需与"删除 pnpm-lock"保持一致 |
| 历史产物 | 10 个 `personal-0.8.11.N` tag + 10 个 GitHub Release | **保留**（用户选择）：作为历史事实存在，不再更新 |

### 为什么 `pnpm-lock.yaml` 一并删除（用户已确认）

它只服务这个已废弃渠道；同时它正是 `09-22-lint-baseline-drift` 那批 14 条 lint 诊断分歧的
来源（pnpm 锁钉 7.1.1 vs npm 锁钉 7.0.1）。删掉它后仓库回到**单一 npm 锁**，
spec 里那段"两套 lockfile"机制说明也随之简化，混淆来源消失。

## Requirements

### R1 删除渠道文件

删除 `.github/workflows/release-personal.yml` 与 `scripts/release-personal.sh`。
不得改动 `.github/workflows/ci.yml` 与 `scripts/release-npm.sh`（现役 npm 渠道）。

### R2 删除孤儿锁文件

删除 `pnpm-lock.yaml`（git 跟踪文件）。删除后必须确认仓库内不再有 pnpm 安装/缓存相关的
workflow 步骤或脚本引用。

### R3 文档去引用并声明废弃

- `docs/release-npm.md`：删掉引入段里指向 `release-personal.sh` 的括注与"personal 内部"表格行，
  在 npm 渠道说明处补一句该渠道已废弃、下文只描述 npm 渠道。
- `docs/release.md:6`：删掉指向 `scripts/release-personal.sh` 的 fork 注记（回到上游原文）。
- 明确保留一句："历史 GitHub Release（`personal-0.8.11.*`）仍可下载，但不再更新。"

### R4 spec 与事实保持一致

- `.trellis/spec/frontend/quality-guidelines.md`：把"两套受跟踪 lockfile 钉了不同
  `eslint-plugin-react-hooks`"改写为"历史上曾有两套 lockfile（pnpm 锁已随渠道废弃在
  2026-09-22 删除）"；保留判定口径（同一次运行实测 + 给出基线来源），但恢复动作只留 `npm ci`。
  不得删除那批 14 条诊断的实测记录与其"已在 09-22-lint-baseline-drift 修掉"的注记。
- `.trellis/spec/frontend/directory-structure.md`：`scripts/` 清单改为只列 `release-npm.sh`。
- `.trellis/spec/guides/upstream-sync.md`：锁文件漂移清单去掉 `pnpm-lock.yaml`
  （保留"上游改过锁文件就必须同时处理依赖"的规则本身）。

### R5 历史产物保留

不删除任何 git tag、不删除任何 GitHub Release、不改 tag 指向；只把"渠道已废弃"写进文档。

### R6 验证

- 全仓不再有指向被删文件的活引用：`grep -rn "release-personal" --include="*" .` 的命中只能是
  `.trellis/tasks/archive/**`、`.trellis/workspace/**`（历史记录，按惯例不改）与本次任务自身。
- 删除后仓库仍可正常构建与验证：在 `npm ci` 的锁一致树上跑三件套
  （`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test`）退出码 0，
  计数与 `09-22-npm-release-0100` 记录的基线一致（495 lint 文件 / 1411 测试用例）。
- `pnpm-lock.yaml` 删除**不影响** `npm ci`（npm 只用 `package-lock.json`）；
  这一点必须用实跑证明，不能推断。

## Acceptance Criteria

- [ ] AC1 `.github/workflows/release-personal.yml` 与 `scripts/release-personal.sh` 已从工作树删除，
      且 `git ls-files` 中不再出现这两个路径。
- [ ] AC2 `pnpm-lock.yaml` 已删除；`git ls-files | grep -c pnpm-lock` 为 0。
- [ ] AC3 `docs/release-npm.md` 不含 `release-personal` 与 `personal 内部`；
      `docs/release.md` 不含 `release-personal`；两处都写明该渠道已废弃、历史 Release 仍可下载。
- [ ] AC4 `quality-guidelines.md` 的验证基线段不再把 pnpm 锁描述为**现役**锁文件，
      且保留 14 条诊断的实测记录与"已修"注记；`directory-structure.md` 与 `upstream-sync.md` 同步更新。
- [ ] AC5 除 `archive/`、`workspace/` 与本次任务目录外，全仓无 `release-personal` 引用。
- [ ] AC6 删除后在 `npm ci` 树跑三件套：tsc / lint / test 退出码 0，
      且 lint 495 文件 0 error 0 warning、test 1411 pass / 0 fail（与 0.10.0 发布基线一致）。
- [ ] AC7 10 个 `personal-*` tag 与 10 个 GitHub Release 均未被动过
      （`git tag -l 'personal-*' | wc -l` = 10；`gh release list` 仍为 10 条）。

## Out of Scope

- 删除历史 tag 与 GitHub Release（用户明确要求保留）。
- 改动 `scripts/release-npm.sh`、`.github/workflows/ci.yml` 或 npm 发布流程。
- 修改 `.trellis/tasks/archive/**` 与 `.trellis/workspace/**` 中的历史记录（它们如实记录了当时的流程）。
- 恢复/适配 `personal-*` 渠道到 0.9.x 线——该渠道已废弃，不做事后适配。
