# npm 发布（fork 独立版本线）

本 fork 的独立 npm 包 **`@xup3ng/pi-web`** 发布说明（区别于 upstream 的
`@agegr/pi-web`）。

## 快速开始

```bash
./scripts/release-npm.sh              # patch 递增（0.9.0 → 0.9.1）
./scripts/release-npm.sh 0.10.0       # 指定版本
```

脚本自动完成：前置检查 → bump 版本 → build → dry-run → **确认后 publish**
（浏览器 2FA 授权）→ 验证 → 提交版本 bump。

## 前置要求

- 工作区干净（发布从干净起点开始；本轮功能/README 改动先提交）。
- npm 已以 `xup3ng` 登录：`npm whoami` 应输出 `xup3ng`；未登录则先
  `npm login`（新版为浏览器授权流程）。
- 账号已开启 2FA（npm 2026-05 起发布强制要求）。TOTP 即可，个人手动发布
  无需创建 bypass-2FA token（2027-01 起该类 token 将失去直接发布能力，
  自动化场景官方建议 OIDC trusted publishing / staged publishing）。
- **在自带终端执行**：2FA 下 `npm publish` 会打印
  `https://www.npmjs.com/auth/cli/...` 链接，需浏览器打开完成授权后自动
  继续上传；该 URL 在日志中会被 npm 脱敏为 `***`，无法由他人代跑。

## 手动发布（不用脚本时）

```bash
# 1. bump（写 package.json + package-lock.json）
npm version patch --no-git-tag-version

# 2. 构建（发布专用；TURBOPACK= 前缀防止 TURBOPACK=1 与 --webpack 冲突）
TURBOPACK= npm run build

# 3. 产物检查（应包含 LICENSE/README/bin/.next/public）
npm publish --dry-run

# 4. 真实发布（浏览器 2FA 授权）
npm publish --access public

# 5. 验证（注意传播延迟）
npm view @xup3ng/pi-web
npm view @xup3ng/pi-web dist-tags   # latest 应指向新版本
```

## 常见问题

- **发布后 `npm view` / `npx` 短暂 404**：npm 新包/新版本有最终一致性延迟，
  tarball 与版本页（`/-/pi-web-<v>.tgz`、`/<v>`）立即可见，但聚合文档与
  `@latest` 解析可能延迟约 2-4 分钟。稍等重试即可。
- **`EOTP` / 需要浏览器授权**：账号开了 2FA，属预期。按提示在浏览器完成
  `npmjs.com/auth/cli/...` 授权后 npm 自动继续。
- **版本号不可覆盖**：npm 禁止重发同版本；发布成功后发现错误只能 bump 新
  版本（如 0.9.1），不能修改已发布的 0.9.0（unpublish 仅限 72h 窗口，慎用）。
- **build 污染 `.next/`**：发布构建会重写 `.next/`，发布后若 `npm run dev`
  异常，按 `AGENTS.md` 的 dev 故障流程（备份 `.next` → 重启）处理。

## 渠道现状：只有 npm 一条

| 渠道 | 版本 | 命令 | 发布目标 |
| --- | --- | --- | --- |
| npm（本脚本） | `0.9.x` 稳定 semver | `./scripts/release-npm.sh` | registry.npmjs.org 公开包 |

历史上还曾有一条 `personal-0.8.11.*` 的 GitHub Release 渠道（`personal-*` tag 触发 CI 构建并
`gh release create`）。该渠道在 0.9.x 线上从未使用，已废弃，其 workflow 与脚本于 2026-09-22 删除
（连同只服务它的 `pnpm-lock.yaml`）。**历史 GitHub Release（`personal-0.8.11.*`）仍可下载，
但不再更新**；新版本一律走 npm。

## 实际采用的流程：隔离 release root（0.9.3 起的现行做法）

上面的 `scripts/release-npm.sh` 快捷流程**已经不再用于正式发布**。原因：

- 脚本用 `|| true` 吞掉退出码，只看聚合出的 `version`，失败与成功难以区分；
- 它在工作目录里 build 与 publish，会重写 `.next/`（打断正在跑的 `npm run dev`）、
  改动 `node_modules`，而 commit 不是可选项；
- 产物与审计之间没有「同一个 tgz」的强绑定，无法证明「发布的就是审计过的那一个」。

现行做法是**在隔离 release root 内构建、审计、封存同一个 tgz**，再由**用户在自己终端**
执行发布（2FA/OTP 不进入任何日志）。0.9.3 / 0.9.4 / 0.9.5 都走这条路。

### 目录与边界

```
../.pi-web-v<版本>-release-<时间戳>/     # 主 checkout 的兄弟目录，不在仓库内
├── env.sh          # HOME/XDG_*/PI_CODING_AGENT_DIR/TMPDIR/NPM_CONFIG_* 全部指向本 root
├── npmrc           # 只有一行 registry，绝不含凭据
├── check-run.py    # 逐步执行并记录 exit/duration → check/*.json + logs/*.log
├── smoke.sh        # 生产安装后的运行时探测与清理断言
├── b9-publish.sh   # 由用户在终端执行：先校验 sha256 再发布同一个 tgz
├── src/ install/ fixture/ artifacts/ evidence/ logs/ check/
```

硬约束：**绝不在主 checkout 执行 `next build`**（`AGENTS.md`）；`env.sh` 里
`unset NPM_TOKEN NODE_AUTH_TOKEN NODE_OPTIONS` 与代理变量。

### 步骤

| 步 | 做什么 | 判据 |
|----|--------|------|
| B1 | 建隔离 root 与脚本 | `realpath "$ROOT"` 不在主 checkout 内 |
| B2 | `git archive <H> \| tar -x -C "$ROOT/src"` | 记录 `H` 与树 hash |
| **B2b** | 在 `$ROOT/src` 内 `npm version <v> --no-git-tag-version --ignore-scripts` | **必须做**：否则打出旧版本号；只允许 `package.json` + `package-lock.json` 变化 |
| B3 | `npm ci --cache "$ROOT/npm-cache"` | exit 0；锁文件 sha256 前后一致 |
| B4 | `TURBOPACK= npm run build`（仅 `$ROOT/src`） | exit 0；记录 BUILD_ID；主 checkout `.next` mtime 不变 |
| B5 | `npm pack` + 逐项审计 | dry-run 与真实 pack 的 `integrity`/`entryCount`/`unpackedSize` 一致 |
| B6 | `npm install -g --prefix "$ROOT/install" <tgz>` + `smoke.sh` | 全部 probe 通过；`listeners left: 0`、残留进程 `0` |
| B7 | `npm publish --dry-run <tgz>` | exit 0；`total files` 与 `filelist.txt` 行数一致 |
| B8 | **批准门**：向用户报告并停下 | registry 上目标版本仍 404、`npm whoami` 正确 |
| B9 | 用户在终端执行 `b9-publish.sh` | 脚本先 `sha256sum -c`，再 `exec npm publish <同一个 tgz>` |
| B10 | 有界核验（≤10 分钟，可见前不判失败、不重发） | `dist.integrity`/`shasum`/`fileCount` 与本地逐字一致 |
| B11 | 主 checkout bump 提交（**按路径显式 add**）+ `git push origin personal` | 提交只含 `package.json`/`package-lock.json`；不打 tag |
| B12 | 写发布报告到任务 `research/` | 含偏差与未覆盖项 |

### 已踩过的坑（务必避开）

1. **B2b 不能省**：直接从 `H` 打包会带上旧版本号（0.9.4 报告 §2.1 记录过）。
2. **HTTP 探测 public 资源要去掉 `public/`**：Next 把 `public/` 挂在站点根，
   正确 URL 是 `/fonts/NOTICE.txt`，`/public/fonts/...` 会 404（0.9.5 首跑误报过）。
   产物是否含某文件**只有 `tar -tzf` 是权威判据**。
3. **`npm view <pkg>@<不存在的版本> --json` 在 E404 时也输出 JSON**
   （`{"error":{"code":"E404",...}}`），轮询脚本要判「有没有 `version` 字段」。
4. **`pgrep -f` 会匹配到自己的 shell 包装**，残留进程断言应过滤 `bash -c`，
   并确保烟测之外没有手动起的服务。
5. **传播延迟**：0.9.5 受理到可见约 4.5 分钟（0.9.4 约 6 分钟）。`PUT 202` 只是受理，
   可见前不得判定失败、不得重发。
6. **字体/许可类文件容易被漏**：`files` 白名单里 `public` 整体包含，但历史上出现过
   「文件只在隔离目录里补写、从未进仓库」的漏发（0.9.4 缺 `public/fonts/LICENSE-cascadia-code.txt`
   与 `NOTICE.txt`）。审计清单里**每一项都要有逐项证据**，不接受「关键文件在位」这类概括结论。

完整的逐步命令、参照数值与报告模板见归档任务的 `research/`（例如
`.trellis/tasks/archive/2026-09/09-18-sync-upstream-post-v091/`、`09-13-npm-patch-release/`）
以及 0.9.5 的 `09-19-release-build-publish-095/research/release-runbook-reuse.md`。
