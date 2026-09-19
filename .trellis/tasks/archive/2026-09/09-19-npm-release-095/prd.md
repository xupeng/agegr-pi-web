# npm 发布 0.9.5（先合并 upstream/main）

## Goal

把 `upstream/main`（`agegr/pi-web`，冻结点 `5e9b997`）相对 `personal` 落后的 **27 个提交**
合并进个人仓库并完成回归验证，然后在**隔离 release root** 内构建、逐项审计并发布
`@xup3ng/pi-web@0.9.5`，让已发布产物重新携带 Cascadia Code 许可文件
（修复 `0.9.4` 的合规回退）。

## 背景事实（2026-09-19 研究核实）

- `personal` HEAD = `2415bdb`，`upstream/main` = `5e9b997`，`merge-base` = `860698a`。
  任务创建时以为落后 20 个，实测 fetch 后为 **27 个**（多出 7 个，含 `/auto-compact`、扩展
  provider 鉴权、输出截断提示、Windows npm shim、流式首块去重、扩展 widget 顺序、PDF `#page=`）。
- 27 提交体量：81 文件 / +3173 −587，**删除 0 文件**，无 merge commit。
- **依赖与配置零漂移**：这 27 个提交没碰 `package.json`、`package-lock.json`、
  `pnpm-lock.yaml`、`next.config.ts`、`tsconfig`、eslint 配置、`.github`；两侧 pi SDK 均
  `0.85.1`、next 均 `16.3.5`。合并不需要 install 升级或锁重生成。
- 实测冲突：**14 个文件**，全部为 `UU`；无 `AA`、无 deleted-by-us/them。
- registry `latest` = `0.9.4`；`@xup3ng/pi-web@0.9.5` = E404（可用）；`npm whoami` = **E401**（需重新登录）。
- 字体许可两文件（`public/fonts/LICENSE-cascadia-code.txt` 4395 B、`NOTICE.txt` 1477 B）
  已在仓库（`5129887`，HEAD 的 ancestor），`public/fonts.test.mjs` 实测 2/2 通过；
  已下载的 `0.9.4` tarball 实测 **0 命中**许可文件，确认缺陷存在。
- 磁盘 `/` 可用 65 G，`/tmp` 为 2 G tmpfs；上次的省盘变通本次不需要。

## 用户决策（2026-09-19）

| 决策 | 结论 |
|---|---|
| 版本号 | `0.9.5`（patch） |
| 合并范围 | 锁定当前 `upstream/main` = `5e9b997`，**27 个提交一次做完** |
| 节奏 | 一次贯通：合并 → 验证 → 隔离构建 → 停下等用户发布 |
| Git 边界 | 发布核验成功后本地 commit，并 **push 到 `origin/personal`**；不打 tag、不发 GitHub Release |
| 字体许可任务 | 由本任务承接其 AC，发布成功后归档 `09-19-font-license-in-next-release` |

## Requirements

- **R1 合并范围冻结**：合并目标锁定 `5e9b997`。合并开始后若 `upstream/main` 前进，不顺手并入，
  在报告中记录并留待下次同步。
- **R2 零依赖漂移**：合并结果不得引入 `package.json` / `package-lock.json` / `pnpm-lock.yaml` /
  `next.config.ts` / CI 配置的变更。若出现，停止并解释，不随手接受。
- **R3 fork 资产完整**：`@xup3ng/pi-web` 包名与版本字段、`bin/`、`public/fonts/**`（含两个许可
  文件）、`.trellis/**`、`.pi/**`、个人专有 `lib/**` 与个人 e2e 用例必须保留。
  **禁止 `-X theirs` / `checkout --theirs` 整文件取上游**；`.pi/agents/trellis-{check,implement,research}.md`
  的用户未提交修改必须逐字保留（记录前后 SHA-256）。
- **R4 版本语义**：全局唯一版本变更是 `0.9.4 → 0.9.5`，且只在**隔离 `src/`** 内 bump
  （打包前，`npm version 0.9.5 --no-git-tag-version --ignore-scripts`）。主 checkout 的 bump
  提交在发布核验成功后进行。
- **R5 隔离发布**：所有 `npm ci` / `next build` / `npm pack` / 安装 smoke 都在隔离 release root 内，
  `HOME`/`XDG_*`/`PI_CODING_AGENT_DIR`/`TMPDIR`/`NPM_CONFIG_CACHE`/`NPM_CONFIG_USERCONFIG`
  全部指向该 root 并 `unset` 凭据类变量。**绝不在主 dev checkout 执行 `next build`**
  （AGENTS.md 约束）；主 checkout 的 `.next`、`node_modules`、被跟踪文件不得被发布操作修改。
- **R6 产物审计含字体许可**：`0.9.5` 的 tgz 清单必须同时含
  `public/fonts/LICENSE-cascadia-code.txt` 与 `public/fonts/NOTICE.txt`
  （承接 `09-19-font-license-in-next-release` 的 R3/R4 与 AC1–AC4，给出 `tar -tzf` 原始输出），
  且该次源码树内 `node --test public/fonts.test.mjs` 通过 2/2。
- **R7 发布由用户执行**：agent 只准备「封存 tgz + 校验过 SHA256 的 `b9-publish.sh`」，然后停下
  请求批准。真实 `npm publish` 由用户在**自己终端**执行（需 2FA/OTP）；全程不读取、不输出任何凭据。
- **R8 有界核验**：发布受理后轮询核验 exact version、`dist-tags.latest`、`versions`、
  `dist.integrity`、`dist.shasum`、`dist.fileCount`、maintainers、发布时间；上限 10 分钟，
  可见前**不得**判定失败、**不得**重发。
- **R9 Git 边界**：核验成功后本地 commit（上游 merge 提交 + 版本 bump 提交）并 push 到
  `origin/personal`；不打 tag、不发 GitHub Release、不改写已发布的 `0.9.4`。
- **R10 承接与归档**：`09-19-font-license-in-next-release` 的 AC 由本任务承接并在发布报告中给出
  证据，发布成功后归档该任务；不得让同一验收点被两个任务重复跟踪。
- **R11 报告**：终态证据（H、tgz hash、审计逐项、核验字段、push 结果、偏差与遗留）写入
  `09-19-release-build-publish-095/research/release-report.md`。

## 子任务映射

| 子任务 | 交付物 | 依赖与顺序 |
|---|---|---|
| `09-19-merge-upstream-pre-095` | 合并后的 `personal` 冻结提交 `H`（含 merge commit）+ 回归验证证据 | 必须先完成；`H` 是发布子任务的唯一输入 |
| `09-19-release-build-publish-095` | `@xup3ng/pi-web@0.9.5` 的封存 tgz、审计证据、发布核验报告、push | 依赖前者的 `H`；若 `H` 变化必须重跑构建与审计 |
| `09-19-font-license-in-next-release` | （承接）tgz 含两许可文件的证据 | AC 由发布子任务满足，成功后归档 |

父/子结构不是依赖系统：上面的顺序要求同时写在发布子任务的 `prd.md` / `implement.md` 里。

## Acceptance Criteria

- **AC1（R1、R2、R3）**：合并提交存在且 parent 为合并前的 `personal` HEAD 与 `5e9b997`；
  27 个上游提交全部可达；`package.json`/锁文件/CI 配置 0 变更；
  `git diff --diff-filter=D --name-only` 为空；3 个 `.pi/agents/trellis-*.md` 的 SHA-256 前后一致。
- **AC2（R2、R3）**：合并后 `node_modules/.bin/tsc --noEmit` 退出 0；`npm run lint` 不新增
  错误（对照基线历史 14 条 `react-hooks/preserve-manual-memoization`，需逐条比对）；
  `npm test` 通过；定向复核测试与新增的 11 个上游测试按 `implement.md` 的矩阵执行并记录。
- **AC3（R4、R5）**：隔离 root 记录在报告中（`realpath` 不在主 checkout 内）；B2b 后
  `src/package.json` = `0.9.5` 且仅 `package.json` + `package-lock.json` 变化；主 checkout 的
  `.next`/`node_modules` mtime 与 `git status` 在发布操作前后一致。
- **AC4（R6）**：`tar -tzf <tgz> | grep -E 'public/fonts/(LICENSE-cascadia-code\.txt|NOTICE\.txt)$'`
  命中 2 条（给出原始输出）；`node --test public/fonts.test.mjs` 2/2 通过；报告注明
  「0.9.4 缺项已由本版本修复」。
- **AC5（R5、R7）**：B3–B7 全绿且退出码为 0（禁止 `|| true`）；生产安装 smoke 全部 probe 通过、
  无残留 listener/进程；`npm publish --dry-run` 的 `total files` 与 `filelist.txt` 行数一致。
- **AC6（R7、R8）**：`0.9.5` 在 registry 可见，`latest` = `0.9.5`，远端 `dist.integrity` /
  `dist.shasum` / `dist.fileCount` 与本地审计值逐字一致；轮询上限 10 分钟。
- **AC7（R9）**：本地 `git log` 显示 bump 提交；`origin/personal` 与本地 `personal` 的
  `rev-parse` 一致；**无 tag、无 GitHub Release**。
- **AC8（R10、R11）**：`09-19-font-license-in-next-release` 已归档且其 4 条 AC 在报告中有对应证据；
  发布报告覆盖偏差、遗留与未覆盖项。

## Out of Scope

- 重新发布/撤回 `0.9.4`（其内容保持原样）。
- 打 git tag、创建 GitHub Release、改 changelog 文件。
- 依赖升级、锁文件重生成、`next` 或 pi SDK 版本变更（本 range 零漂移，不借机升级）。
- 上游未包含的功能开发与 `09-19-append-system-editor` 的实现（仍留 planning）。
- 主 checkout 的 `next build`、安装升级、服务重启。

## Notes

- 研究报告：`09-19-merge-upstream-pre-095/research/upstream-merge-analysis.md`、
  `09-19-release-build-publish-095/research/release-runbook-reuse.md`。
- 已知偏差（研究披露、有意保留）：`refs/remotes/upstream/main` 已从 `d11d344` 前进到 `5e9b997`。
- 发布不可逆：同一版本号不可重发，`0.9.5` 一旦 publish 就不能回滚内容。
