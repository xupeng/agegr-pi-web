# 发布报告：@xup3ng/pi-web 0.10.0（npm）

状态：**B1–B12 全部完成，0.10.0 已发布、核验通过、证据已保留、隔离 root 已按用户决定清理。**

## 0. 关键标识

| 项 | 值 |
|---|---|
| 隔离 root | `/home/xupeng/dev/personal/forked/.pi-web-v0100-release-20260922-184342` |
| 冻结提交 `H` | `e91dda7efa3212286b8c7ae43c898aca73cffe6e`（`personal`） |
| `H^{tree}` | `db8d34388f1e2d628a5f53c9ca235ec861df70b4`（`evidence/H-tree.txt`） |
| 导出文件数 | 982（`git archive H`，无 `.git`） |
| 发布版本 | `0.10.0` |
| tgz | `artifacts/xup3ng-pi-web-0.10.0.tgz`（6,097,775 B） |
| tgz sha256 | `14c274de0956fef04277decc21eca09985a5e41a16adac011b2420d44a983f11` |
| tgz SRI(sha512) | `sha512-WAhPDXt1d5wFvimdvoOTHJCmrSOteIdMt227q3Dwnqbgg/fPGvNCOPF9Fh/qvIzINmfxpAgUf8S4z8hsDYj/5g==` |
| BUILD_ID | `NF_GCs4TJcsE0ZDwzzC0s` |

**AC1 核对**：B7 之后 `H` 仍等于 `personal` HEAD（`git rev-parse HEAD` 逐字相同）⇒ 未漂移，产物有效。

## 1. 逐步骤证据

| 步 | 命令（隔离 root 内） | 退出码 | 证据文件 | 关键数值 |
|---|---|---|---|---|
| B1 | 建 root + 从 0.9.5 root 复制并适配脚本 | 0 | 本文件 §0 | root 在仓库外；`0.9.5`/`v095` 残留引用 0；无凭据泄漏 |
| B2 | `git archive $H \| tar -x -C "$ROOT/src"` | 0 | `evidence/H.txt`、`evidence/H-tree.txt` | 982 文件；`src` 无 `.git`（预期） |
| B2b | `npm version 0.10.0 --no-git-tag-version --ignore-scripts`（仅 `$ROOT/src`） | 0 | 本表 | 仅 `package.json`（1 行）+ `package-lock.json`（2 行）变化；无其它文件被触碰 |
| B3 | `npm ci --cache "$ROOT/npm-cache"` | 0 | `check/b3-npm-ci.json`、`logs/b3-npm-ci.log`、`evidence/lock-{before,after}.sha256` | 193.6s；锁文件前后 sha256 一致 |
| B4 | `env TURBOPACK= npm run build` | 0 | `check/b4-build.json`、`logs/b4-build.log`、`evidence/BUILD_ID.txt` | 191.0s；0.10.0 已嵌入 `.next` |
| B5 | `npm pack --ignore-scripts` + 审计 | 0 | `artifacts/{pack-dryrun.json,pack-real.json,SHA256SUMS,SHA512.b64,filelist.txt}` | entryCount 706 = filelist 706；dry-run entryCount 706 |
| B6 | `npm install -g --prefix "$ROOT/install" <tgz>` + `smoke.sh` | 0 | `check/b6-install.json`、`logs/b6-install.log`、`evidence/b6-smoke.txt`、`evidence/smoke-port.txt` | 安装 61.8s；安装树版本 0.10.0；探针见 §3 |
| B7 | `npm publish --dry-run <tgz> --access public --tag latest` | 0 | `check/b7-publish-dry-run.json`、`logs/b7-publish-dry-run.log` | `total files: 706`；integrity 与本地 SRI 逐字相同 |

### B4 的隔离证明（AC2）

`stat` 对照 `evidence/main-checkout-{before,after}.txt`：主 checkout 的 `.next` 与
`node_modules` mtime **逐项未变**（`diff` 无输出），主 checkout 内不存在 `.next/BUILD_ID`
⇒ 发布构建没有触碰开发 checkout。

## 2. B5 审计逐项结果

| 检查 | 期望 | 实测 |
|---|---|---|
| 包内版本 | 0.10.0 | **0.10.0** |
| napi/name | `@xup3ng/pi-web` | `@xup3ng/pi-web` |
| 字体许可文件 | `public/fonts/LICENSE-cascadia-code.txt` + `NOTICE.txt` 各 1 | **2 条命中** |
| woff2 | 4 | **4** |
| `bin/pi-web.js` | 1 | **1** |
| `next.config.ts` | 1 | **1** |
| `.next/BUILD_ID` | 1 | **1** |
| 禁止项 | `.git` / `.pi` / `.trellis` / `.env` / `.next/cache` / `.next/dev` / `*.js.map` 全 0 | **全 0** |
| symlink 条目 | 0 | **0** |
| 凭据模式（token/ghp_/sk-） | 0 | **0** |
| filelist 中的主目录绝对路径 | 0 | **0** |
| dry-run 与真实 pack 一致性 | 一致 | entryCount 706/706，SRI 相同的 `sha512-WAhPDXt1d5wF…` |

### 已知现象（如实记录，不阻塞）

`.next/required-server-files.json` 内嵌**隔离构建路径**
`…/.pi-web-v0100-release-20260922-184342/src`。0.9.2 / 0.9.3 / 0.9.5 同样内嵌各自的构建路径，
属既有现象；非构建路径字段中没有主目录绝对路径。

## 3. B6 生产安装冒烟（完整证据 `evidence/b6-smoke.txt`）

- fixture：`$ROOT/fixture/demo` 是**独立 git 仓库**（`--git-common-dir` = `.git`，非 linked worktree）。
- 服务：`--hostname 127.0.0.1 --no-open`，动态端口（`evidence/smoke-port.txt`），隔离 `HOME`/`XDG`。
- 探针结果：**20 项 200**；唯一非 200 是 `GET /api/default-cwd → 405`（POST-only 路由，预期）。
  包含 `/`（11,663 B）、`/login`、`/manifest.webmanifest`、**`/fonts/LICENSE-cascadia-code.txt`（4,395 B）
  与 `/fonts/NOTICE.txt`（1,477 B）**、4 个 `/_next/static/chunks/*.js`、
  `/api/{home,projects,agent/running,tools/settings,subagents/settings}`、
  fixture 侧 `/api/{models,skills,plugins,files?type=read,files?type=list,worktrees,sessions}`、
  node-pty 终端 `POST → GET(200) → DELETE(200)`。
- 清理断言：`port released after 1s`、`listeners left: 0`、`installed-server processes left: 0`。

### 过程记录：smoke 首次运行的两次环境问题（如实记录）

1. **绑定地址被环境变量覆盖**：首次起服务时继承了会话里的 `PI_WEB_HOSTNAME=192.168.11.47`，
   服务绑到 LAN IP，导致 `127.0.0.1` 探针全为 `000`。改为显式 `--hostname 127.0.0.1` 并
   `unset PI_WEB_HOSTNAME` 后正常。**这是启动方式问题，不是产物问题。**
2. **清理阶段误杀调用方 shell**：服务与调用方 bash 同进程组，`smoke.sh` 的
   `kill -TERM -<pgid>` 连带终止了调用方 shell，导致第一次证据缺少清理断言。
   改为 `setsid` 让服务独立进程组后重跑，清理断言完整（见上）。

## 4. 0.9.5 参照对照

| 项 | 0.9.5 | 0.10.0 | 说明 |
|---|---|---|---|
| `H` | `e47ac569…` | `e91dda7e…` | 不同提交，正常 |
| BUILD_ID | `sDkZvINGJKQuzWOOBAf0c` | `NF_GCs4TJcsE0ZDwzzC0s` | 每次构建不同，正常 |
| tgz 字节 | 5,849,000 量级（参考 0.9.4：6,052,906） | 6,097,775 | 与 0.9.4 量级一致 |
| entryCount | 706（0.9.5 实测口径） | 706 | 一致 |
| 构建耗时 | ~190s | 191.0s | 一致 |
| 字体许可 | 已在包内（本版新增） | 仍在包内 2/2 | 未回归 |

## 5. B8 – B11 执行结果

### B8 发布门

真实环境 `npm whoami` = **xup3ng**（`~/.npmrc`，与隔离 root 无关）；`dist-tags.latest` = `0.9.5`；
`@xup3ng/pi-web@0.10.0` 仍 **E404（可用）**。用户明确批准发布。

### B9 真实发布（用户在自己终端执行）

发布记录：`~/.npm/_logs/2026-09-22T10_55_30_841Z-debug-0.log`（18:55:30 CST）。

| 日志行 | 内容 |
|---|---|
| `verbose title` | `npm publish /home/xupeng/dev/personal/forked/.pi-web-v0100-release-20260922-184342/artifacts/xup3ng-pi-web-0.10.0.tgz` |
| `notice shasum` | `9c274d9772e4e2a9964f2d0ce5c1e49f06dbf059` |
| `notice integrity` | `sha512-WAhPDXt1d5wFv[...]8S4z8hsDYj/5g==` |
| `notice total files` | `706` |
| `http fetch PUT 401` → web auth → `http fetch PUT 202` | 授权后受理 |
| `notice` | `Your package is being processed and may take a few minutes to become available.` |
| `verbose exit` | **0** |

即：发布的就是 B5 审计过的**同一个 tgz**（script 内 `sha256sum -c` 先行校验），
`b9-publish.sh` 的期望值在本轮已更新为 0.10.0 的
`14c274de0956fef04277decc21eca09985a5e41a16adac011b2420d44a983f11`。

### B10 有界核验

- 发布后 ~1 分钟的探测仍为 `latest=0.9.5` / `0.10.0 E404`（传播延迟，**不判失败、不重发**）。
- 约 5 分钟后核验通过（`evidence/remote-version.json`、`evidence/remote-dist-tags.json`）：

| 字段 | registry 值 | 本地审计值 | 一致 |
|---|---|---|---|
| `version` | `0.10.0` | `0.10.0` | ✅ |
| `dist.integrity` | `sha512-WAhPDXt1d5wFv…8S4z8hsDYj/5g==` | 同 | ✅ |
| `dist.shasum` | `9c274d9772e4e2a9964f2d0ce5c1e49f06dbf059` | 同（`sha1sum`） | ✅ |
| `dist.fileCount` | `706` | `706` | ✅ |
| `dist-tags.latest` | `0.10.0` | — | ✅ |

- **远端 tgz 与本地封存件逐字节相同**：下载 `artifacts/remote-0.10.0.tgz`（6,097,775 B），
  sha256 同为 `14c274de…83f11`，`cmp` 无差异。

#### 核验脚本的一处缺陷（已修，如实记录）

`b10-verify.sh` 从 0.9.5 root 复制而来，`EXPECT_SRI` / `EXPECT_SHASUM` 仍是 0.9.5 的值；
且本机**没有 `shasum` 命令**（只有 `sha1sum`），我第一版用它取值得到空串，
导致首轮报 `shasum match: NO (9c274d97…)` + `STATUS: MISMATCH`。
**这是夹具缺陷而不是 registry 不一致**：registry 报告的 shasum 与本地 `sha1sum` 逐字相同。
修正期望值后重跑 → `STATUS: VERIFIED`（exit 0）。

### B11 本地 bump 提交

```bash
npm version 0.10.0 --no-git-tag-version --ignore-scripts   # 仅 package.json + package-lock.json
git commit -m "chore: release 0.10.0"
git push origin personal
```

- 提交 `8f537d0`（`e91dda7..8f537d0`），变化面仅 3 行版本号；主 checkout 版本 = `0.10.0`；
  `origin/personal` = 本地 HEAD。
- **与 implement.md 的偏差**：implement.md 写的是 `chore: bump version to 0.10.0`
  （取自 `scripts/release-npm.sh` 的口径），实际采用 `chore: release 0.10.0`，
  因为仓库里 0.9.4（`57924e3`）与 0.9.5（`86088d9`）的真实发布提交都是这个形式。

## 6. B12 收尾（已完成）

用户决定：**保留最小证据集后删除两个 root**。执行结果：

- 证据保留到 `~/pi-web-release-artifacts/0.10.0/`（**6.3M / 37 文件**）：封存的
  `xup3ng-pi-web-0.10.0.tgz`（删除后复算 sha256 仍为 `14c274de…83f11`）、`artifacts/` 的
  `SHA256SUMS`/`SHA512.b64`/`filelist.txt`/`pack-*.json`、`evidence/`、`logs/`、`check/`、本次用到的
  `scripts/`（`env.sh`/`npmrc`/`check-run.py`/`smoke.sh`/`b9-publish.sh`/`b10-verify.sh`）与一份
  `README.md`（说明来源与复核命令）。
- 删除 `.pi-web-v095-release-20260919-220023`（3.5G）与
  `.pi-web-v0100-release-20260922-184342`（3.7G）；`/` 可用空间 49G → **56G**。

## 7. 验收清单（AC1–AC10）

| AC | 结论 | 证据 |
|---|---|---|
| AC1 `H` 已记录且发布时未漂移 | ✅ | `evidence/H.txt` = `e91dda7…`；B7 后与 `personal` HEAD 逐字相同（发布后 B11 才前进到 `8f537d0`，属设计内顺序） |
| AC2 隔离边界 | ✅ | `main-checkout-{before,after}.txt` diff 为空；主 checkout 内无 `BUILD_ID` |
| AC3 隔离构建 exit 0 + BUILD_ID | ✅ | `check/b4-build.json`（191.0s）、`evidence/BUILD_ID.txt` = `NF_GCs4TJcsE0ZDwzzC0s` |
| AC4 产物封存与审计 | ✅ | `artifacts/SHA256SUMS`、`filelist.txt`、`pack-*.json`；包内 0.10.0、字体许可 2/2、禁止项全 0 |
| AC5 生产安装冒烟 | ✅ | `evidence/b6-smoke.txt`：20 项 200、终端 200/200/200、`listeners left: 0` |
| AC6 dry-run 一致 | ✅ | `logs/b7-publish-dry-run.log`：`total files: 706` = filelist = `pack entryCount` |
| AC7 发布门 + 用户执行 | ✅ | `npm whoami` = xup3ng；用户批准并自行执行 `b9-publish.sh`（`PUT 202`、exit 0） |
| AC8 发布后核验 | ✅ | `evidence/remote-*`；integrity/shasum/fileCount/latest 全中；远端 tgz `cmp` 逐字节相同 |
| AC9 本地 bump 提交 | ✅ | `8f537d0 chore: release 0.10.0` 已 push；主 checkout 版本 0.10.0 |
| AC10 报告完整 | ✅ | 本文件（含两处夹具/环境缺陷与一处提交信息偏差的如实记录） |

发布命令（用户执行）：

```bash
bash /home/xupeng/dev/personal/forked/.pi-web-v0100-release-20260922-184342/b9-publish.sh
```

> 注意：本地 pnpm 12 / npm 全局配置不影响该脚本——它在**用户自己的 shell** 里运行，
> 使用用户的 npm 凭据与 2FA；`env.sh` 的隔离配置只用于构建与审计阶段。
