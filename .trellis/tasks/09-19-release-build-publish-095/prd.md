# 隔离构建并发布 @xup3ng/pi-web 0.9.5

## Goal

以 `09-19-merge-upstream-pre-095` 产出的冻结提交 `H` 为唯一源码基线，在**隔离 release root**
内构建、逐项审计并封存 `@xup3ng/pi-web@0.9.5` 的 tgz（含恢复 Cascadia Code 许可文件），
在用户批准门停下，由用户在自己终端执行不可逆的 `public/latest` 发布，随后完成有界核验、
本地 bump 提交与 push。

## 依赖与顺序（父/子结构不是依赖系统，此处显式声明）

- **必须先完成** `09-19-merge-upstream-pre-095`，并以它的 `H`（`research/evidence/H.txt`）
  作为导出源码的**唯一**输入。开始本任务前重新 `git rev-parse` 校验 `H` 仍等于 `personal` HEAD。
- 若 `H` 在构建开始后发生变化（例如又合并/提交），**已封存的 tgz 立即作废**，必须从新 `H` 重跑
  B2–B7；不得混用。
- 本任务**承接** `09-19-font-license-in-next-release` 的 R3/R4 与 AC1–AC4：该任务的验收点
  就是本任务 B5 的字体许可子项。发布成功后由父任务归档该任务（R10）。

## Requirements

- **R1 源码冻结**：`H` 必须是提交 hash（不是分支名），写入 `evidence/H.txt` 与 `evidence/H-tree.txt`。
  导出用 `git archive "$H" | tar -x -C "$ROOT/src"`（无 `.git`）。
- **R2 版本 bump 位置**：**只在隔离 `$ROOT/src` 内**执行
  `npm version 0.9.5 --no-git-tag-version --ignore-scripts`；主 checkout 在发布核验成功前
  保持 `0.9.4`。判据：仅 `package.json`（1 行）与 `package-lock.json`（2 行）变化，
  `pnpm-lock.yaml` 0 行差异；若改到别的字段，停止并解释。
- **R3 隔离边界**：`HOME`、`XDG_CONFIG_HOME`、`XDG_DATA_HOME`、`XDG_CACHE_HOME`、
  `PI_CODING_AGENT_DIR`、`TMPDIR`、`NPM_CONFIG_CACHE`、`NPM_CONFIG_USERCONFIG` 全部指向 `$ROOT`；
  显式 `unset NPM_TOKEN NODE_AUTH_TOKEN NODE_OPTIONS` 与代理变量；`npmrc` 只写 registry、
  **不含任何凭据**。`realpath "$ROOT"` 不得位于主 checkout 内。
- **R4 绝不在主 checkout 构建**：`npm ci` / `next build` / `npm pack` / 全局安装 smoke 只在 `$ROOT`
  内执行（AGENTS.md：dev 期间不 build，会污染 `.next/` 并破坏 `npm run dev`）。主 checkout 的
  `.next`、`node_modules`、被跟踪文件必须在发布操作前后保持状态一致（记录前后证据）。
- **R5 构建**：`TURBOPACK= npm run build`（即 `next build --webpack`）在 `$ROOT/src` 内，
  exit 0；记录 BUILD_ID；确认 `0.9.5` 已嵌入 `.next` 产物。
- **R6 打包与审计**：`npm pack --dry-run --json` 与真实 pack 的
  `integrity`/`entryCount`/`unpackedSize` 必须一致；封存唯一 tgz 并记录 `sha256`、`sha512`、
  SRI、`filelist.txt`、`total files`。逐项核对：`package.json` 的
  `name/version/files/license/bin`、`bin/`、`next.config.ts`、`public` 图标、
  **字体与两个许可文件**、无凭据/真实数据/主路径字符串。
- **R7 字体许可（承接 09-19-font-license-in-next-release 的 AC1/AC2）**：
  `tar -tzf <tgz> | grep -E 'public/fonts/(LICENSE-cascadia-code\.txt|NOTICE\.txt)$'`
  **命中 2 条**（原始输出写入报告），且该源码树内 `node --test public/fonts.test.mjs` 通过 2/2。
  报告中显式写明「0.9.4 的缺项已由本版本修复」。
- **R8 生产安装 smoke**：`npm install -g --prefix "$ROOT/install" <tgz>` exit 0；以**独立 git fixture**
  （非 linked worktree）为 cwd 起服务并跑 `smoke.sh`：HTTP 首页/静态资源/版本、fixture API、
  node-pty 终端、字体许可文件可访问；结束时无残留 listener 与残留服务进程。
- **R9 publish dry-run 与批准门**：`npm publish --dry-run <tgz> --registry=https://registry.npmjs.org/
  --tag=latest --access=public` exit 0（禁止 `|| true`），`total files` 与 `filelist.txt` 行数一致。
  随后进入 **B8 批准门**：停下来向用户报告并请求批准；前置条件包括
  `npm view @xup3ng/pi-web@0.9.5 version` 仍 E404、`npm whoami` = `xup3ng`（当前 E401，需用户重新登录）。
- **R10 发布执行者**：真实 `npm publish` 由用户在**自己终端**执行 `$ROOT/b9-publish.sh`。
  该脚本先校验 tgz 的 SHA-256 与审计值一致，再发布**同一个 tgz**（不重新构建、不重新打包）。
  agent 全程不读取、不输出、不存储任何凭据或 OTP。
- **R11 有界核验**：发布受理后轮询，上限 **10 分钟**，核验 exact version、`dist-tags.latest`、
  `versions` 含 `0.9.5`、`dist.integrity`、`dist.shasum`、`dist.fileCount`、`maintainers`、发布时间；
  未可见前**不得**判定失败、**不得**重发（`PUT 202` 受理不等于可见）。
- **R12 提交与 push**：核验成功后，在主 checkout 提交版本 bump（**按路径显式 add**，
  绝不 `git add -A`；不得包含 3 个用户 `.pi/agents/*.md`），然后 push 到 `origin/personal`。
  **不打 tag、不发 GitHub Release、不改写已发布的 `0.9.4`**。
- **R13 报告**：`research/release-report.md` 覆盖：`H` 与树 hash、隔离 root 路径、B2b–B7 每步命令与
  退出码、tgz 全部 hash 与审计逐项、字体许可证据（含 tar 原始输出）、smoke 结果、dry-run 结果、
  批准门记录、发布回执（脱敏）、核验字段对照、push 结果、偏差与未覆盖项。

## Acceptance Criteria

- **AC1（R1–R4）**：`evidence/H.txt` 记录的 `H` 与子任务产出一致；`realpath "$ROOT"` 不在主 checkout 内；
  `env | grep -E 'NPM_TOKEN|NODE_AUTH_TOKEN'` 无输出；主 checkout `.next`/`node_modules` mtime 与
  `git status --short` 在发布前后一致。
- **AC2（R2、R5）**：`$ROOT/src/package.json` 版本 = `0.9.5`；仅 2 个文件变化；build exit 0，
  `evidence/BUILD_ID.txt` 存在，`.next` 产物中出现 `0.9.5`。
- **AC3（R6）**：dry-run 与真实 pack 的 `integrity`/`entryCount`/`unpackedSize` 一致；
  tgz 的 `sha256`/`sha512`/SRI/`total files` 全部记录；审计清单逐项打勾且每项有证据。
- **AC4（R7，承接 font-license 任务）**：`tar -tzf` 过滤命中 **2 条**原样输出；
  `node --test public/fonts.test.mjs` 2/2 通过；报告写明 0.9.4 缺项已修复。
- **AC5（R8）**：安装 exit 0 且安装版本为 `0.9.5`；smoke 全部 probe 通过；残留 listener 与
  服务进程数均为 0。
- **AC6（R9、R10）**：publish dry-run exit 0 且清单与 B5 一致；B8 批准门有明确的用户批准记录；
  真实 publish 由用户终端执行且回执显示受理（脱敏）。
- **AC7（R11）**：registry 上 `0.9.5` 可见、`latest` = `0.9.5`；远端 `dist.integrity` /
  `dist.shasum` / `dist.fileCount` 与本地审计值**逐字一致**；耗时 ≤10 分钟。
- **AC8（R12、R13）**：主 checkout 出现 bump 提交（`git show --stat` 为证）且不含用户 3 个
  `.pi/agents/*.md`；`git rev-parse origin/personal` == 本地 `personal`；无 tag；发布报告完整。

## Out of Scope

- 重新发布/撤回 `0.9.4`；改变其 registry 内容。
- 打 tag、GitHub Release、changelog 文件。
- 依赖升级/锁重生成；修 lint 历史噪声。
- 在主 checkout 执行 build、升级真实安装、重启开发服务。
- 回滚已发布的 `0.9.5`（不可逆；只能后续版本修复）。

## Notes

- runbook 与脚本模板：`research/release-runbook-reuse.md`（含 `env.sh`/`check-run.py`/`smoke.sh`/
  `b9-publish.sh` 的可复用内容与 0.9.4 的参照数值）。
- 0.9.4 参照：tgz 6,052,906 B、`total files` 703、`unpackedSize` 33,807,514、
  SRI `sha512-WX+LIbwPxXCMnTZlK1xirhq9JZnU5UX4QugcoZ2J/X801ba+PCh7lqXpQRxiJKVe4APe4b1DOunaehLoEzwXmw==`。
- 历史教训（09-18 §8.3）：`PUT 202` 后有约 5–6 分钟不可见窗口，期间尝试安装会失败，
  这不是发布失败。
