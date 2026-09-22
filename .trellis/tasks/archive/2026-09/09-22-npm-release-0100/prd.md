# 隔离构建并发布 @xup3ng/pi-web 0.10.0（npm）

## Goal

以 `personal` 的冻结提交 `H` 为唯一源码基线，在**仓库外的隔离 release root** 内构建、审计、
冒烟并封存 `@xup3ng/pi-web@0.10.0` 的 tgz；停在**发布门**由用户在自己终端完成不可逆的
`npm publish`（2FA），随后做有界核验、本地 bump 提交与 push，并留下完整报告。

版本号由用户定为 **0.10.0（minor）**：自 0.9.5 以来 `personal` 增加了 PR #2 的停滞看门狗特性
（转录内记录中止原因）与 PR #3 的 lint/规范收口。

## Background

### 规划期实测事实（2026-09-22）

| 项 | 实测值 | 说明 |
|---|---|---|
| `personal` HEAD | `e91dda7efa3212286b8c7ae43c898aca73cffe6e` | 冻结候选 `H`；进入 B 段前需重新校验 |
| `upstream/main` | `5e9b997d9bb22be7dee099d351816b97cd08bc53` | `personal` 落后上游 **0** 个提交、领先 136 个 |
| 主 checkout 版本 | `package.json` = **0.9.5** | 0.10.0 只在隔离 `src/` 内 bump，主 checkout 到 B11 才提交 |
| 主 checkout 依赖 | `next` 16.3.5、SDK 0.85.1 | |
| npm `latest` | **0.9.5** | `0.9.0`–`0.9.5` 均在 npm |
| `@xup3ng/pi-web@0.10.0` | **E404（版本可用）** | 可发布 |
| `npm whoami` | **未登录（E401）** | 发布门前置：用户需 `npm login`（2FA 已开启） |
| 发布包内容 | `files`: `bin` / `.next`（去掉 cache、dev、`*.js.map`）/ `public` / `next.config.ts` / `package.json` | `.trellis`、`.pi` 不进包 |
| 字体许可 | `public/fonts/` 4 个 woff2 + `LICENSE-cascadia-code.txt` + `NOTICE.txt` 仍在；`public/fonts.test.mjs` **2/2 通过** | 0.9.5 的独立验收点，本次降级为回归项 |
| 0.9.5 隔离 root | **仍存在**：`/home/xupeng/dev/personal/forked/.pi-web-v095-release-20260919-220023`（3.5G） | 内含 `env.sh` / `check-run.py` / `smoke.sh` / `b9-publish.sh` / `b10-verify.sh`，可直接复用 |
| 磁盘 | `/` 可用 53G | 新 root 预计 ~3.5G（含 src 的 `node_modules` 与 `.next`） |

### 可复用资产

- `09-19-release-build-publish-095` 的 `research/release-runbook-reuse.md`（B1→B12 全流程 + 脚本要点 +
  0.9.4/0.9.5 参照数值）与 `research/release-report.md`（报告模板）。
- 0.9.5 root 内的四个脚本是**可直接照抄**的模板；本次只需把版本串从 `0.9.5` 换成 `0.10.0`。

### 为什么必须隔离

- `AGENTS.md:11` 明令：开发期不得在主 checkout 跑 `next build`（会污染 `.next/` 并使 `npm run dev` 失败）。
- 主 checkout 的 `node_modules`/`.next` 还要继续用于开发与验证，不能被发布构建的产物覆盖。
- 发布必须对应一个**可复算的提交**（`H`），而不是"当时的工作区"。

## Requirements

### R1 冻结基线

进入构建段前记录 `H`（提交 hash）与 `H^{tree}`，写入 `evidence/H.txt` / `evidence/H-tree.txt`。
若 `personal` 在发布过程中前进、或主 checkout 出现业务改动，则已封存的产物**立即作废**，必须从新 `H` 重跑。

### R2 隔离边界

release root 建在仓库**外**（同级普通目录，不用 `/tmp`：本机 `/tmp` 是 2 GiB tmpfs）。
`HOME`、`XDG_*`、`PI_CODING_AGENT_DIR`、`TMPDIR`、`NPM_CONFIG_CACHE`、`NPM_CONFIG_USERCONFIG`
全部指向 root；不复制任何真实凭据/会话/设置。**绝不在主 checkout 执行 `next build`**。

### R3 版本 bump 的位置

只在隔离 `$ROOT/src` 内 `npm version 0.10.0 --no-git-tag-version --ignore-scripts`；
主 checkout 保持 `0.9.5` 直到 B10 核验成功后的 B11。判据：仅 `package.json`（1 行）与
`package-lock.json`（2 行）变化，出现其它字段 churn 则停止并解释。

### R4 产物审计

打包后必须记录并可复算：tgz 的 sha256、文件清单、`.next/BUILD_ID`、包内
`package.json` 的版本号（0.10.0）、以及字体许可文件确实在包内。缺任一项即阻断发布。

### R5 生产安装冒烟

用封存的 tgz 做全局安装（隔离 prefix），起服务并以 HTTP 探针验证页面与关键 API 返回 200，
端口与探针结果落 `evidence/`。

### R6 publish dry-run

`npm publish --dry-run <tgz> --access public --tag latest` 退出码 0，且其文件清单与 B5 的清单一致。

### R7 发布门（用户执行）

真实 `npm publish` 是**不可逆**动作，由用户在自己终端执行（2FA 需要浏览器授权，自动化无法代跑）。
Agent 只负责：准备 `b9-publish.sh`（内含本地 tgz 的期望 sha256 校验）、在门前停下、把要核对的
清单摆给用户。

### R8 有界核验

发布受理后 ≤10 分钟内有界轮询：`npm view @xup3ng/pi-web version` 为 `0.10.0`、
`dist-tags.latest` 指向它；下载远端 tgz 与本地封存件对比 sha256（若因 registry 重打包而不同，
必须解释差异并对比包内文件清单与版本号，不得含糊带过）。

### R9 本地 bump 提交

B10 成功后，在主 checkout 把 `package.json`（及必要时 `package-lock.json`）bump 到 0.10.0，
提交 `chore: bump version to 0.10.0` 并 push 到 `personal`。

### R10 报告与收尾

写 `research/release-report.md`：每一步的命令、退出码、证据文件、参照值与偏差。
旧 release root（3.5G）是否删除**必须先问用户**，不擅自删。

## Acceptance Criteria

- [ ] AC1 `H` 与 `H^{tree}` 已记录；发布受理时 `personal` 仍等于 `H`。
- [ ] AC2 release root 在仓库外，且主 checkout 的 `.next`/`node_modules` 未被发布构建触碰（有前后对照）。
- [ ] AC3 隔离构建退出码 0，`BUILD_ID` 已记录。
- [ ] AC4 tgz 已封存：sha256 + 文件清单 + 包内版本 0.10.0 + 字体许可文件在内。
- [ ] AC5 生产安装冒烟通过：全局安装成功、服务起得来、探针全部 200。
- [ ] AC6 publish dry-run 退出码 0，且清单与 AC4 一致。
- [ ] AC7 用户批准门：在用户明确批准且 `npm login` 完成后才发布；发布由用户终端执行。
- [ ] AC8 发布后核验：`npm view` 版本与 `latest` 正确；远端 tgz 与本地封存件的 sha256（或差异解释）已记录。
- [ ] AC9 `personal` 上有 `chore: bump version to 0.10.0` 提交并已 push；主 checkout 版本为 0.10.0。
- [ ] AC10 `research/release-report.md` 含全流程命令/退出码/证据路径，且与本 prd 的偏离都已说明。

## Out of Scope

- GitHub Release / `personal-*` tag 渠道：`release-personal.sh` 与 workflow 的"上一版 tag"硬编码 0.8.x，
  要支持 0.9.x 需单独适配，另开任务。
- 新增 CHANGELOG 文件（仓库当前没有该文件，发布说明不在本任务范围）。
- 上游同步（规划期实测 `personal` 落后上游 0 个提交，无需同步）。
- 修改任何产品代码：本任务只做版本号 bump 与发布产物。
