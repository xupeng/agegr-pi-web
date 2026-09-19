# 设计：0.9.5 的隔离构建、审计与发布

## 1. 总体流程

```
H (来自 09-19-merge-upstream-pre-095)
 └─ B1  隔离 root + env.sh/npmrc/check-run.py/smoke.sh/b9-publish.sh
    B2   git archive H → $ROOT/src
    B2b  在 src 内 npm version 0.9.5 --no-git-tag-version --ignore-scripts
    B3   私有 npm ci
    B4   TURBOPACK= npm run build（只在 $ROOT/src）
    B5   npm pack + 逐项审计（含字体许可 AC4）
    B6   生产安装 + runtime smoke（独立 git fixture）
    B7   npm publish --dry-run
    B8   ★ 批准门：停下向用户报告
    B9   用户在**自己终端**执行 b9-publish.sh（不可逆）
    B10  有界核验（≤10 分钟）
    B11  主 checkout bump 提交 + push origin/personal
    B12  release-report.md
```

`check-run.py` 为每步写 `check/<name>.json`（cmd/cwd/exit/duration/registry/home）与
`logs/<name>.log`；退出码本身即判据，禁止在命令末尾加 `|| true`。

## 2. 隔离设计

| 维度 | 方案 |
|------|------|
| root 位置 | `/home/xupeng/dev/personal/forked/.pi-web-v095-release-<YYYYMMDD-HHMMSS>`（主 checkout 的**兄弟**目录） |
| 环境 | `env.sh` 导出 `HOME`/`XDG_*`/`PI_CODING_AGENT_DIR`/`TMPDIR`/`NPM_CONFIG_CACHE`/`NPM_CONFIG_USERCONFIG` 到 `$ROOT`；`unset NPM_TOKEN NODE_AUTH_TOKEN NODE_OPTIONS` 与代理 |
| registry | `npmrc` 仅 `registry=https://registry.npmjs.org/`，无 token |
| 源码 | `git archive H` 导出，无 `.git` |
| 依赖 | `npm ci --cache "$ROOT/npm-cache"`（磁盘充足，**不需要** 09-13 的 pnpm 硬链接变通） |
| 磁盘预算 | 预计 4–7 GB（依赖 ~2 GB + `.next` ~40 MB + 安装前缀 ~1 GB + cache），当前可用 65 GB，无需 tmpfs 变通 |
| 目录 | `src/ install/ fixture/demo/ artifacts/ evidence/ logs/ check/ home/ xdg-*/` |

为什么不再用 tmpfs：`/tmp` 仅 2 G，上次把 `.next/cache` 软链到 tmpfs 是为规避根分区 0.3 GB 的
极端限制；现在根分区有 65 GB，tmpfs 反而更容易 ENOSPC 且引入额外失败模式。

## 3. 版本 bump 设计（B2b 是历史踩坑点）

0.9.4 的发布报告 §2.1 记录了计划缺口：直接从 `H` 打包会打出**旧版本号**。因此 B2b 是
**强制的独立步骤**，且必须在 B3（`npm ci`）之前执行，让锁文件的根版本与 `package.json` 一致。

判据：

```bash
node -p "require('$ROOT/src/package.json').version"     # 0.9.5
grep -n '"version"' "$ROOT/src/package-lock.json" | head -3
# pnpm-lock.yaml 无版本字段 → 0 行差异，符合预期
```

若 `npm version` 改动了 `version` 以外的字段（如 `gitHead`、依赖范围），**停止**并解释，
不把额外 churn 带进发布产物。

## 4. 审计清单设计（B5）

每一项都必须有独立证据，不接受「关键文件在位」这类概括结论（09-18 §14 的教训：
概括性结论把未检查的许可文件算作通过，导致 0.9.4 合规回退）。

| 审计项 | 判据 | 证据 |
|--------|------|------|
| tgz 唯一性 | 只存在一个 `artifacts/*.tgz` | `ls -l artifacts/` |
| dry-run 一致性 | dry-run 与真实 pack 的 `integrity`/`entryCount`/`unpackedSize` 相同 | `check/b5-pack.json` |
| hash 记录 | `sha256`、`sha512`、SRI、`total files` | `SHA256SUMS`、`SHA512.b64`、`filelist.txt` |
| 元数据 | `package.json` 的 `name=@xup3ng/pi-web`、`version=0.9.5`、`files`、`license=MIT`、`bin.pi-web` | tar 内抽取的 `package.json` |
| 启动链 | `package/bin/pi-web.js`、`package/next.config.ts` 存在 | `tar -tzf` |
| 图标/静态 | `package/public/` 下图标与 `public/fonts/*.woff2`（4 个）存在 | `tar -tzf \| grep public/` |
| **字体许可** | 命中 `LICENSE-cascadia-code.txt` 与 `NOTICE.txt` 各 1 条（共 2 条）；tgz 内两文件 SHA-256 与仓库文件一致 | 原始 `grep` 输出 + `tar -xzOf \| sha256sum` |
| 无泄漏 | 无 `.npmrc`/token/`NPM_TOKEN` 字面量；无真实 HOME 路径、无主 checkout 路径、无真实会话数据 | `tar -tzf` + `tar -xzOf \| grep -E` |
| 无危险项 | 无绝对路径条目、无 `../` 穿越、无软链 | `tar -tvzf` 分析 |

0.9.4 参照值（用于发现异常漂移，不作为必须相等的目标）：`total files` 703、
tgz 6,052,906 B、`unpackedSize` 33,807,514。0.9.5 因新增 27 个上游提交会**变大**，属预期。

## 5. smoke 设计（B6）

- 安装：`npm install -g --prefix "$ROOT/install" "$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz"`，
  装完核对 `$ROOT/install/lib/node_modules/@xup3ng/pi-web/package.json` 的 version = `0.9.5`。
- fixture：`$ROOT/fixture/demo` 是**独立 git 仓库**（`git init` + 一次提交），
  **不能是主仓库的 linked worktree**，否则 `projectRoot` 会指回主仓库。
- 起服务：动态端口（写入 `evidence/smoke-port.txt`），`NEXT_TELEMETRY_DISABLED=1`、
  `PI_WEB_SKIP_VERSION_CHECK=1`、`--no-open`，cwd = fixture。
- probe：首页 200、`/api/models` 200、`/api/sessions` 200、版本出现 `0.9.5`、
  `public/fonts/LICENSE-cascadia-code.txt` 200、node-pty 终端 SSE 可用；
  `/api/default-cwd` 返回 405 属预期。
- 清理断言：结束时 `listeners left: 0`、`installed-server processes left: 0`。

## 6. 批准门设计（B8）

**这是本任务唯一允许「不可逆动作」的位置，必须先停。** 向用户报告的固定内容：

| 项 | 值 |
|---|---|
| `H` | 提交 hash + 树 hash |
| tgz | 路径、`sha256`、SRI、`total files` |
| B3–B7 | 每步退出码 |
| 字体许可 | `tar -tzf` 的 2 条原始输出 |
| registry 前置 | `0.9.5` 仍 E404；`npm whoami` = `xup3ng` |
| 命令 | `bash $ROOT/b9-publish.sh`（用户在自己终端执行） |

用户未明确批准前，不得执行 R10 的发布；也不得代替用户登录 npm 或触碰全局 npm 配置。

## 7. 核验设计（B10）

轮询间隔 60 秒、上限 10 分钟（09-18 实测约 5 分钟可见）。轮询命令只读：

```bash
npm view @xup3ng/pi-web@0.9.5 version dist.tarball dist.integrity dist.shasum dist.fileCount --json
npm view @xup3ng/pi-web dist-tags versions --json
```

对照表（本地审计值 vs 远端）：`integrity`、`shasum`、`fileCount` 必须逐字一致；不一致则记录并
停止（不重发）。超时未可见 → 记录为「待核验」，**不重发**。

## 8. 提交与 push 设计（B11）

- 主 checkout 只 add：`package.json`、`package-lock.json`，以及（若确有变化）`pnpm-lock.yaml`。
- **禁止 `git add -A` / `git add .`**：工作区存在用户未提交的 3 个 `.pi/agents/*.md`，误提交即越权。
- commit 信息：`chore: release 0.9.5`。
- push：`git push origin personal`（origin = `xupeng/agegr-pi-web`）。**不 push upstream、不打 tag**。
- push 后核验 `git rev-parse origin/personal` == 本地 `personal`。

## 9. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 在主 checkout 误跑 build（破坏 dev 环境） | 所有 build 命令写死在 `$ROOT/src`；执行前后核对主 checkout `.next` mtime |
| 忘记 B2b → 打出 0.9.4 内容的 tgz | B2b 为独立判据步；B5 审计 tar 内 `package.json` 的 version 必须为 0.9.5 |
| tgz 与审计值不是同一个（重打包） | 封存后只对**同一 tgz** 做 dry-run 与真实发布；`b9-publish.sh` 先校验 SHA-256 |
| 许可文件再次漏出产物 | AC4 为独立门槛，必须有 `tar -tzf` 原始输出（不接受概括结论） |
| `PUT 202` 后不可见被误判为失败 | R11 明确「可见前不判失败、不重发」，上限 10 分钟 |
| 发布回执含凭据/OTP | 只记录脱敏关键行（`notice version/integrity/total files/PUT 202/exit 0`） |
| 误把用户 `.pi/agents/*.md` 提交 | B11 按路径显式 add + 提交前 `git status --short` 人工过一遍 |
| `.next` 内嵌隔离构建路径 | `required-server-files.json` 会含 `$ROOT/src` 路径；与 0.9.2/0.9.3/0.9.4 行为一致，运行不依赖该路径，属已知可接受项，在报告中披露 |
