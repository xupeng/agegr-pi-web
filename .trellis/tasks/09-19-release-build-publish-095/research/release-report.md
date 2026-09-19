# 发布报告：@xup3ng/pi-web 0.9.5

> 状态：**B1–B12 全部完成**。`@xup3ng/pi-web@0.9.5` 已于 2026-09-19 发布到 npm public/latest，
> 有界核验全部通过，本地 bump 提交与 push 已完成。所有构建/打包/安装命令都在隔离 release root
> 内执行，主 checkout 未被 build/install 触碰。

## 0. 结论摘要

| 项 | 值 |
|---|---|
| 版本 | `0.9.5`（patch） |
| 源码基线 `H` | `e47ac5692d524e533c3a64d434b41b409fdf4bee`（`personal` HEAD） |
| `H` 树 hash | `10e6fef6609bb6593b0eccd212ad4eccf2151c3d`（见 `evidence/H-tree.txt`，已与 `git rev-parse "$H^{tree}"` 复核一致） |
| 代码基线等价证明 | `git diff --name-only fc2323e..H -- bin public next.config.ts package.json package-lock.json pnpm-lock.yaml` = **空** |
| 隔离 root | `/home/xupeng/dev/personal/forked/.pi-web-v095-release-20260919-220023` |
| BUILD_ID | `sDkZvINGJKQuzWOOBAf0c` |
| tgz | `artifacts/xup3ng-pi-web-0.9.5.tgz`，6,092,922 B，**706 条目** |
| tgz sha256 | `19f52aafb5b279773e9cfad0b7c51711b63fb06885b10285cde48d67937b75b8` |
| tgz SRI | `sha512-EnTszgQwUntXZAf5+oIY7cRpAhMQJAg3zeCQRt7qFb9mkeeKdXRc0Pue32GUED2HE+P4oQ6JIlm4mvgu7x2RSQ==` |
| unpackedSize | 33,871,076 B |
| **字体许可** | ✅ 两文件在 tgz 内（AC4 达成，见 §4） |
| 发布结果 | ✅ 已发布；`latest` = `0.9.5`；发布受理 `2026-09-19T21:56:30Z`，registry 可见 `2026-09-19T22:01:05.113Z` |

## 1. 隔离边界（B1）

`env.sh` 把 `HOME` / `XDG_*` / `PI_CODING_AGENT_DIR` / `TMPDIR` / `NPM_CONFIG_CACHE` /
`NPM_CONFIG_USERCONFIG` 全部指向 `$ROOT`，并 `unset NPM_TOKEN NODE_AUTH_TOKEN NODE_OPTIONS`
与代理变量。实测：`HOME=$ROOT/home`、`NPM_CONFIG_USERCONFIG=$ROOT/npmrc`、
`env | grep -cE 'NPM_TOKEN|NODE_AUTH_TOKEN'` = **0**；`realpath "$ROOT"` 不在主 checkout 内。
`npmrc` 仅含 registry 行，无凭据。

**主 checkout 未被触碰的证据**：构建前后 `stat -c '%y' .next` 完全相同
（`2026-09-19 14:07:32.295883681 +0800`），`git status --short` 全程只含用户 3 个
`.pi/agents/*.md` 与任务记录。

## 2. 执行记录（B2–B7）

| 步 | 命令 | 退出码 | 关键输出 |
|----|------|--------|----------|
| B2 | `git archive H \| tar -x -C "$ROOT/src"` | 0 | 941 文件，无 `.git` |
| B2b | `npm version 0.9.5 --no-git-tag-version --ignore-scripts` | 0 | `package.json` + `package-lock.json` 各就位；`pnpm-lock.yaml` **0 行差异** |
| B3 | `npm ci --cache "$ROOT/npm-cache"` | 0 | 58.54s；锁文件前后 sha256 一致 |
| B4 | `TURBOPACK= npm run build`（仅 `$ROOT/src`） | 0 | 199.81s；BUILD_ID `sDkZvINGJKQuzWOOBAf0c`；`0.9.5` 已嵌入 `.next/server/app/page.js` 与 static chunks |
| B5 | dry-run + 真实 `npm pack` | 0 / 0 | 两者 `entryCount` 706、`integrity` 一致 |
| B6 | 生产安装 + `smoke.sh` | 0 | 见 §5 |
| B7 | `npm publish --dry-run` | 0 | 7.28s；`total files: 706`，与 `filelist.txt` 行数一致 |

## 3. 产物审计（B5）

- **元数据**：`name=@xup3ng/pi-web`、`version=0.9.5`、`license=MIT`、
  `bin={"pi-web":"bin/pi-web.js"}`、`files=[bin,.next,!.next/cache,!.next/dev,!.next/**/*.js.map,public,next.config.ts,package.json]`。
- **启动链**：`package/bin/{pi-web.js,pi-web-node-args.js,pi-web-options.js,node-version.js,prepare-terminal.js,process-lifecycle.js}`、`package/next.config.ts` 均在。
- **顶层条目**：`bin LICENSE .next next.config.ts package.json public README{,.ja,.ru,.zh-CN}.md`。
- **结构安全**：绝对路径/`../` 穿越 **0**、软链 **0**、凭据类文件（`.npmrc`/`.env`/`auth.json`）**0**。
- **内容泄漏**：`NPM_TOKEN` / `_authToken` / `npm_<36位>` 字面量 **0**；
  主 checkout 绝对路径 `/home/xupeng/dev/personal/forked/agegr-pi-web` **0 命中**；
  `agegr-pi-web` 的 7 处命中全部是 `package.json` 的 homepage/repository 与 README 里的
  GitHub raw URL（合法元数据）。
- **已知披露项（计数已按独立检查 F3 修正）**：`.next` 产物内嵌隔离构建路径 `$ROOT/src`。
  精确统计（对每个 tar 成员做字节级 `count`）：**3,842 次出现 / 187 个文件 / 232 行**。分布：

  | 类别 | 次数 | 说明 |
  |---|---:|---|
  | `.next/trace` | 3,532 | 构建期 trace 元数据，运行不使用 |
  | `*.js`（含 `*client-reference-manifest.js`） | 246 | `a.exports=d(".../src/node_modules/next/dist/...")` 形式的模块解析路径 |
  | 其它（manifest 等） | 64 | — |

  本报告早前写的「122 处」是 `grep -c` 在 tar 流上的**行计数**且受二进制内容干扰，不是出现次数；
  已按上述实测口径更正。
  **关于运行依赖（独立检查 F2）**：这些路径在 smoke 时确实存在，
  **「移除隔离构建树后仍可运行」尚未验证**。与 0.9.2/0.9.3/0.9.4 属同类现象，
  但本次**不宣称**「运行不依赖该路径」—— 该结论需要在未挂载 release `src/` 的环境里
  重装同一个 tgz 实测才能成立，本次未做。

## 4. 字体许可核验（AC4，承接 09-19-font-license-in-next-release）

```
$ tar -tzf xup3ng-pi-web-0.9.5.tgz | grep -E 'public/fonts/(LICENSE-cascadia-code\.txt|NOTICE\.txt)$'
package/public/fonts/LICENSE-cascadia-code.txt
package/public/fonts/NOTICE.txt
```

- 命中 **2 条**（原始输出见 `evidence/font-license-in-tgz.txt`）。
- 与仓库文件**逐字节一致**：`diff <(tar -xzOf tgz package/public/fonts/<f>) public/fonts/<f>` 两者皆 OK。
- 4 个 Cascadia Code woff2 均在包内。
- 源码树 `node --test public/fonts.test.mjs` → **2/2 通过**（`evidence/fonts-test.txt`）。

> **`0.9.4` 缺失的 `public/fonts/LICENSE-cascadia-code.txt` 与 `public/fonts/NOTICE.txt`
> 已由本版本（0.9.5）修复。** 反证：已发布的 0.9.4 tarball 对同一过滤命令 0 命中。
> 据此，`09-19-font-license-in-next-release` 的 AC1/AC2 已满足，发布成功后归档该任务。

## 5. 生产安装 smoke（B6）

安装：`npm install -g --prefix "$ROOT/install" <tgz>` exit 0；安装树版本 = `0.9.5`。
fixture：`$ROOT/fixture/demo` 是**独立 git 仓库**（`--git-common-dir` = `.git`，非 linked worktree）。
服务：动态端口，cwd = fixture，`NEXT_TELEMETRY_DISABLED=1`、`PI_WEB_SKIP_VERSION_CHECK=1`、`--no-open`。

全部 probe（`evidence/b6-smoke.txt`）：

| 组 | 结果 |
|---|---|
| `/`、`/login`、`/manifest.webmanifest` | 200 |
| **`/fonts/LICENSE-cascadia-code.txt`（4,395 B）、`/fonts/NOTICE.txt`（1,477 B）** | **200** |
| 4 个 `/_next/static/chunks/*.js` | 200 |
| `/api/home`、`/api/projects`、`/api/agent/running`、`/api/tools/settings`、`/api/subagents/settings` | 200 |
| `/api/default-cwd` | 405（预期） |
| `POST /api/cwd/validate` → fixture 注册成功 | success:true |
| `/api/models`、`/api/skills`、`/api/plugins`、`/api/files/...?type=read`、`?type=list`、`/api/worktrees`、`/api/sessions` | 200 / JSON |
| node-pty 终端：`POST /api/terminal` → `GET`（200）→ `DELETE`（200） | 通过 |
| 清理 | `listeners left: 0`、`installed-server processes left: 0` |

### 5.1 过程中的一次假告警（如实记录）

首次 smoke 把字体许可 probe 写成 `/public/fonts/...`，得到 **404**。排查确认：
Next.js 把 `public/` 内容挂在站点根，正确路径是 `/fonts/...`（实测 200，且 4 个 woff2、
`/provider-icons.svg`、`/sw.js`、`/offline.html`、`/icons/*` 全部 200）。
**这是 smoke 脚本的路径错误，不是产物缺陷**；脚本已修正后复跑全绿。
教训：`public/` 目录名不出现在 URL 里。

另：一次探测中出现 `installed-server processes left: 2`，定位为「我手动启动的残留服务 +
被 `pgrep -f` 匹配到的自身 `bash -c` 包装」；清理后复跑为 `0`。

## 6. B8 批准门（已通过）

真实发布（B9）由用户在**自己终端**执行，因为需要 2FA/OTP：

```bash
bash /home/xupeng/dev/personal/forked/.pi-web-v095-release-20260919-220023/b9-publish.sh
```

该脚本先 `sha256sum -c` 校验上述 sha256，再 `exec npm publish` **同一个** tgz
（不重新构建、不重新打包）。脚本自检已通过（`...tgz: OK`）。

发布前置（用户侧）：`npm whoami` 当时为 **E401**，用户先在自己终端完成 `npm login`。

**用户决策记录（2026-09-19；属操作记录，未独立复核）**：

1. 批准执行不可逆的 `public/latest` 发布（0.9.5）；
2. `09-19-font-license-in-next-release` 在发布成功后归档；
3. 接受「e2e 未跑」的残余风险后发布。

## 6A. B9 真实发布（用户终端执行，2026-09-19）

命令（用户终端）：`bash $ROOT/b9-publish.sh`。脚本先 `sha256sum -c` 校验
`19f52aaf…37b75b8`（自检 `...tgz: OK`），再 `exec npm publish` **同一个** tgz。

脱敏回执（npm debug log `~/.npm/_logs/2026-09-19T21_56_30_327Z-debug-0.log`）：

```
21 notice version: 0.9.5
25 notice shasum: c184c639805f8c93aee460b6f808f32ac808046c
26 notice integrity: sha512-EnTszgQwUntXZ[...]lm4mvgu7x2RSQ==
27 notice total files: 706
30 notice Publishing to https://registry.npmjs.org/ with tag latest and public access
31 http fetch PUT 401 https://registry.npmjs.org/@xup3ng%2fpi-web 2211ms
40 http fetch PUT 202 https://registry.npmjs.org/@xup3ng%2fpi-web 3921ms
45 verbose exit 0
46 info ok
```

即 web 授权 + 2FA（`PUT 401` → 浏览器授权 → `PUT 202` 受理），退出码 0。
回执的 `version` / `shasum` / `integrity` / `total files` 与本地审计值**逐字一致**。
全程未读取、未输出、未存储任何凭据或 OTP。

**时间口径说明（独立检查 F7）**：`21:56:30.327Z` 是上述 debug 日志的**文件起始时间**；
摘录的 `PUT 202` 行本身不带绝对时间戳，因此不能把该秒当作精确受理时刻。
可靠锚点是 registry 记录的**发布时间** `2026-09-19T22:01:05.113Z`：
从日志起始到可见约 **4.6 分钟**，与 0.9.4 的约 6 分钟同量级。

## 6B. B10 有界核验（全部通过，约 4.5 分钟）

> **流程声明修正（独立检查 F1，重要）**：`b10-verify.sh` 当时是 `set -u` + 20 次循环、
> 每次 `sleep 30`，**没有墙钟 deadline、未给 npm 请求设置超时与禁重试**，且字段不一致时
> 只打印 `NO` 仍 `exit 0`（`latest` 仅打印不断言）。所以当时的证据应表述为
> **「人工核对字段全部一致」**，而非「脚本用退出码落实了有界核验」。
> 本次实测字段确实全部匹配（见下表），结论不受影响；脚本已按建议重写
> （单调墙钟 deadline + 剩余预算超时 + 全部字段一致才 `exit 0`，否则非零），供下次使用。
> 另：§7A 所述「第一次 mismatch 退出」实为该 E404 信封误判后的**提前返回**，不是失败退出。

轮询起点 `2026-09-19T21:57:43Z`，第 8 次尝试（`22:01:21Z` 请求）首次可见；
registry 记录发布时间 `2026-09-19T22:01:05.113Z`。**远低于 10 分钟上限，未发生重发。**

| 检查 | 期望 | 远端实测 | 结论 |
|---|---|---|---|
| exact version | 0.9.5 | `0.9.5` | ✅ |
| `dist-tags.latest` | 0.9.5 | `{"latest":"0.9.5"}` | ✅ |
| `versions` 含新版本 | 含 0.9.5 | `…0.9.3, 0.9.4, 0.9.5` | ✅ |
| `dist.integrity` | `sha512-EnTszgQw…x2RSQ==` | 逐字相同 | ✅ |
| `dist.shasum` | `c184c639…808046c` | 逐字相同 | ✅ |
| `dist.fileCount` | 706 | `706` | ✅ |
| `dist.unpackedSize` | 33,871,076 | `33871076` | ✅ |
| maintainers | xup3ng | `["xup3ng <recordus@gmail.com>"]` | ✅ |
| 发布时间 | 记录 | `2026-09-19T22:01:05.113Z` | ✅ |
| **远端 tgz 字节级比对** | 与本地封存件相同 | 下载后 sha256 = `19f52aaf…37b75b8`，`cmp` **逐字节相同**（独立检查重下并复核，同时用 registry 原始 API 交叉验证） | ✅ |
| **远端 tgz 内字体许可** | 命中 2 条 | `package/public/fonts/LICENSE-cascadia-code.txt`、`NOTICE.txt` | ✅ |
| `0.9.4` 未被改写 | integrity 保持原值 | `sha512-WX+LIbwPxXCMn…EzwXmw==` 未变 | ✅ |

证据：`evidence/remote-0.9.5.json`、`evidence/remote-0.9.5.tgz`、
`evidence/remote-font-license.txt`。

## 6C. B11 本地 bump 提交与 push

- 主 checkout 的 `package.json` / `package-lock.json` 由**同一 3 行差异**复现
  （`version` 0.9.4 → 0.9.5），并与隔离 `$ROOT/src` 的两个文件 `diff` **完全一致**；
  `pnpm-lock.yaml` **零改动**。
- 按路径显式 `git add package.json package-lock.json`（**未** `git add -A`）；
  提交 `86088d9 chore: release 0.9.5`，`git show --name-only` 中 `.pi/agents` 命中数 **0**。
- `git push origin personal`：`2415bdb..86088d9 personal -> personal`；
  `git rev-parse personal` == `git rev-parse origin/personal` == `86088d9bc00aedd6a46df13d2429fe9bf2ebc361`。
- **未打 tag**（`git tag -l 'v0.9.5'` 为空）、未发 GitHub Release、未 push upstream。

## 6D. 字体许可任务的收口

`09-19-font-license-in-next-release` 的全部验收点在本次发布中满足：

| 该任务 AC | 本次证据 |
|---|---|
| AC1 下一次发布的 tgz 清单同时含两文件（`tar -tzf` 原始输出） | §4，命中 2 条；**远端** tgz 同样命中 2 条（§6B） |
| AC2 该次发布的源码树内 `node --test public/fonts.test.mjs` 通过 | §4，2/2 通过 |
| AC3 证据写入该次发布任务的 `research/` 报告并注明 0.9.4 缺项已修复 | 本报告 §4 |
| AC4 未对已发布的 0.9.4 做任何改动 | §6B，其 integrity 仍为 `sha512-WX+LIbwPxXCMn…EzwXmw==` |

据此归档该任务（用户已批准「发布成功后归档」）。

## 7. 待办（B9–B12）

- [x] B9 用户执行 `b9-publish.sh`（脱敏回执见 §6A）
- [x] B10 有界核验（§6B，全部通过）
- [x] B11 bump 提交 + push（§6C）
- [x] B12 回填发布报告（本文件）

## 7A. 流程偏差（如实记录）

- **核验脚本的一次假阴性**：`b10-verify.sh` 初版把 `npm view` 的 **E404 错误信封**也当作
  「已可见」（因为它同样是 JSON），导致第一次运行在第 1 次尝试就误判 `integrity match: NO` 并退出。
  修正为「必须存在 `version` 字段」后重新轮询。**未因此重发**（脚本只读）。
- **smoke 脚本的路径错误**：见 §5.1（`/public/fonts/...` → `/fonts/...`）。
- **手动启动服务器的残留进程**：见 §5.1 末（已清理，最终 `installed-server processes left: 0`）。

### 7A.1 独立检查（Phase 2.2）提出的限制与本报告的收口

`check-report.md` 结论为「发布产物身份、registry 元数据、字体许可与版本 bump 均通过独立核验」，
同时提出 8 项限制。逐项处置：

| 编号 | 处置 |
|---|---|
| F1 核验脚本不落实失败/超时门禁（高） | 已在 §6B 显式降级该声明；脚本已重写为「墙钟 deadline + 剩余预算超时 + 全字段一致才 exit 0」 |
| F2 内嵌路径的运行独立性缺证（高） | 已在 §3 撤回「运行不依赖该路径」的断言，标注为**未验证**并给出验证条件 |
| F3 「122 处」计数口径错误（中） | 已在 §3 更正为 3,842 次 / 187 文件 / 232 行并分类 |
| F4 本地领先 origin 两个记账提交（中） | 已 push，`personal` 与 `origin/personal` 重新相等（见 §7A.2） |
| F5 `smoke.sh` 是打印器而非断言器（中） | 本报告 §5 的表述已限定为「HTTP 探测观察到 200」；它**不能**证明 PTY 实际输出 shell 数据，也不能替代「安装 exit 0」之外的断言。脚本仅按原样保留为证据 |
| F6 `env.sh` 只清了部分变量（中） | §1 的声明限定为「已实测无 token 泄漏」；**不**宣称脚本对任意凭据形态做了完备隔离（未处理 `ALL_PROXY`/`NPM_CONFIG__AUTH`/`NPM_CONFIG_GLOBALCONFIG` 等） |
| F7 部分证据未落盘 / JSON 拼接（中） | `evidence/remote-0.9.5.json` 已拆为 `remote-version.json` + `remote-dist-tags.json` 两个合法 JSON；受理时间口径已在 §6A 修正；用户批准与登录身份均标注「操作记录，未独立复核」 |
| F8 冻结基线存在记账例外（低） | 见 §7A.3 |

### 7A.2 F4 的收口：记账提交已 push

B11 当时 `personal` == `origin/personal` == `86088d9`。此后为记录发布与归档又产生两个
**只含 `.trellis/**` 与 `docs/release-npm.md`** 的提交（`e327ff9`、字体任务归档提交），
已按用户既定的 `push origin/personal` 边界一并推送。推送后复核相等（见 §7B）。
这些提交不触碰 `bin`/`public`/`next.config.ts`/`package.json`/锁文件，**不影响已发布产物**。

### 7A.3 F8 的收口：冻结基线的记账例外（已批准）

合并子任务的 `evidence/H.txt` 是 `fc2323e`（代码基线）；本发布任务的 `H` 是当时的
`personal` HEAD `e47ac56`。二者的**完整** diff 为

```bash
git diff --name-only fc2323e..e47ac56     # 全部为 .trellis/**，产品源码 0 变化
git diff --name-only fc2323e..e47ac56 -- bin public next.config.ts package.json package-lock.json pnpm-lock.yaml
# → 空
```

即：`e47ac56` 相对 `fc2323e` 只多了记账提交（spec 文档、任务记录、归档），
产品与打包白名单路径零变化。该例外已由合并子任务的
`research/merge-execution.md` §6 显式许可，并由独立检查复核确认无实际漂移。
因此 PRD AC1 的「`H` 与子任务产出一致」应按「代码基线一致、HEAD 因记账前移」理解，
不逐字判全绿。

## 7B. 最终 Git 状态（收尾后核对）

核验命令与实际值：

```bash
$ git rev-parse personal          → 9c4c304bcae8c877888fe1f79c63168a43001f51
$ git rev-parse origin/personal   → 9c4c304bcae8c877888fe1f79c63168a43001f51   # 相等 ✅
$ git tag -l 'v0.9.5'             → （空）✅
$ git status --short              → 仅用户 3 个 .pi/agents/trellis-*.md（未暂存）
```

提交序列（`86088d9` 是发布 bump，其后为记账/文档）：

```text
9c4c304 docs(task): close out the 0.9.5 release report against the independent check
9c4c304 之前的记账提交：发布报告/runbook、docs/release-npm.md、字体任务归档
86088d9 chore: release 0.9.5          ← B11 bump（仅 package.json + package-lock.json）
e327ff9 … 2f3caed … fc2323e … 628683a ← 任务记录 / spec / 合并修复 / 上游 merge
```

`86088d9` 之后的提交不触碰 `bin`/`public`/`next.config.ts`/`package.json`/锁文件，
因此**不影响已发布的 0.9.5 产物**（产物身份由 §6B 的 registry 比对固定）。

## 8. 未覆盖项与残余风险

- **UI 交互层未经真实浏览器验证**：按用户决定本次不跑 `npm run test:e2e`；可拖拽侧栏、
  PDF `#page=` 链接、markdown 图片预览、文件面板全宽切换只有单测与类型检查覆盖。
  上游新增的 `e2e/file-panel.mjs`、`e2e/pdf-page-fragment.mjs` 亦未执行。
- **node 版本偏差**：本机 `v26.1.0`，`engines`/CI 参照 22.19.0；未做低版本验证。
- **构建路径内嵌**：见 §3 已知披露项。
- **未验证 Windows**：本仓库有 Windows 相关修复（npm.cmd shim、路径分隔符），本次未在 Windows 验证。
