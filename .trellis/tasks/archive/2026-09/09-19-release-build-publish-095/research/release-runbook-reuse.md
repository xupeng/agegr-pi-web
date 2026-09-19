# 0.9.5 隔离构建与发布 runbook（可复用研究）

> 研究日期：2026-09-19。只读研究：未执行 build / pack / publish，未改动任何被跟踪文件，
> 未动 0.9.4。文中所有命令均可在隔离 release root 内照做；唯一实际执行的写操作是把本文件
> 写入 `research/`，以及运行只读回归测试 `node --test public/fonts.test.mjs`。
>
> 证据来源：`archive/2026-09/09-18-sync-upstream-post-v091/research/`（含可复现脚本与 check/log）、
> `archive/2026-09/09-13-npm-patch-release/research/`、`09-19-font-license-in-next-release/prd.md`、
> 当前仓库实测、registry 只读查询。

---

## 0. 结论摘要（本次发布前的新鲜事实）

| 项 | 实测值 | 说明 |
|----|--------|------|
| 历史 release root（0.9.4 / 0.9.3） | **均已删除**（磁盘上不存在） | 脚本已提取为 archive 证据，可重建 |
| 当前 HEAD | `2415bdb32847ff1ae5842d84efc049678b846ae9`（`personal`） | |
| `upstream/main` | `5e9b997d9bb22be7dee099d351816b97cd08bc53` | |
| `merge-base HEAD upstream/main` | `860698a6573e63a2432157676a5ac9bc9ce54044` | 上一次 merge 上游点 |
| personal 落后上游 | **27 个提交**（PRD 写的 20 已过时） | `git rev-list --count personal..upstream/main` |
| 主 checkout 版本 | `package.json` = **0.9.4**（B11 已提交） | 0.9.5 需在隔离 `src/` 内 bump |
| 主 checkout 依赖 | next `16.3.5`、SDK `0.85.1` | |
| registry `latest` | **0.9.4** | `npm view @xup3ng/pi-web dist-tags` |
| `@xup3ng/pi-web@0.9.5` | **E404（版本可用）** | 可发布 |
| `npm whoami` | **E401（当前未登录）** | 发布前需用户重新登录 + 2FA |
| 字体许可文件 | **已在仓库**（`5129887`，ancestor of HEAD） | `public/fonts/` 4 woff2 + 2 许可文件 |
| `public/fonts.test.mjs` | **2/2 通过**（exit 0） | 已实际运行 |
| 磁盘 | `/` 98G，**可用 65G**；`/tmp` 是 2.0G tmpfs（可用 1.7G） | 上次省盘变通本次**不需要** |

---

## 1. 历史 release root 与脚本重建

### 1.1 存活状态

```
$ ls -d /home/xupeng/dev/personal/forked/.pi-web-v0*
（无匹配）
```

- `.pi-web-v094-release-20260918-182408`：**已按 09-18 报告 §13 删除**（3.5 GB）。
- `.pi-web-v093-release-20260913`：09-18 报告 §13 明确"未触碰"，但**现在磁盘上已不存在**
  （后续清理删除）。
- 结论：本次必须**从 archive 记录重建**全部隔离脚本，不要尝试复用旧 root。

### 1.2 脚本要点（来源：`09-18-.../research/evidence/evidence/`；这是 0.9.4 真正用过的版本）

四个脚本原文件保存在 archive 里，是本次最直接的模板。关键内容摘录与可复用性判断：

#### `env.sh`（可直接照抄，几乎零修改）

```bash
#!/usr/bin/env bash
# Isolated release environment for @xup3ng/pi-web 0.9.4
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; export ROOT

export HOME="$ROOT/home"
export XDG_CONFIG_HOME="$ROOT/xdg-config"
export XDG_DATA_HOME="$ROOT/xdg-data"
export XDG_CACHE_HOME="$ROOT/xdg-cache"
export XDG_STATE_HOME="$ROOT/xdg-state"
export PI_CODING_AGENT_DIR="$ROOT/agent"
export TMPDIR="$ROOT/tmp"

export NPM_CONFIG_USERCONFIG="$ROOT/npmrc"
export NPM_CONFIG_CACHE="$ROOT/npm-cache"
export NPM_CONFIG_REGISTRY="https://registry.npmjs.org/"
export NPM_CONFIG_AUDIT=false
export NPM_CONFIG_FUND=false
export NPM_CONFIG_UPDATE_NOTIFIER=false
export NPM_CONFIG_PREFIX="$ROOT/install"
export npm_config_registry="https://registry.npmjs.org/"

# 防止调用方 shell 的真实凭据/代理泄漏进来
unset NPM_TOKEN NODE_AUTH_TOKEN NODE_OPTIONS NPM_CONFIG__AUTH NPM_CONFIG_ALWAYS_AUTH 2>/dev/null || true
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy NO_PROXY no_proxy 2>/dev/null || true

mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" \
         "$PI_CODING_AGENT_DIR" "$TMPDIR" "$ROOT/npm-cache" "$ROOT/logs" "$ROOT/check" \
         "$ROOT/artifacts" "$ROOT/install" "$ROOT/fixture" "$ROOT/evidence"

export PATH="$ROOT/install/bin:$PATH"
```

**可复用性：高。** 只需把注释里的 0.9.4 改成 0.9.5（可选），其余原样。
配套的 `$ROOT/npmrc` 只需一行 `registry=https://registry.npmjs.org/`（无任何凭据）。

#### `check-run.py`（可直接照抄）

```python
#!/usr/bin/env python3
"""Run a command inside the isolated release env and record exit code + metadata.
Usage: python3 check-run.py <name> <cwd> <cmd> [args...]
Writes logs/<name>.log and check/<name>.json, then exits with the command's code."""
# 关键行为：
# - root = os.environ["ROOT"]，未 source env.sh 时报错退出 2
# - subprocess.run(cmd, cwd=cwd, stdout=log, stderr=STDOUT)，写 logs/<name>.log
# - 写 check/<name>.json：{name, cwd, cmd, exit, duration_s, log, registry, home}
# - return proc.returncode（退出码即判据）
```

**可复用性：高。** 每个 B 步骤都通过它执行，产出 `check/b*-*.json` 作为
"命令 + 退出码 + 耗时 + registry + home" 的结构化证据；这是"退出码判据"的落盘机制。

#### `smoke.sh`（B6 生产安装 smoke，结构可复用、内容需按 0.9.5 调整）

关键设计（0.9.4 实测通过）：

- 用法 `bash smoke.sh <port>`，输出写 `$ROOT/evidence/b6-smoke.txt`（`tee -a`）。
- 两个函数：`probe <label> <url>` 记录 HTTP code + size；`body <label> <url>` 记录响应前 200 字节。
- **顺序陷阱（必须保留）**：凡带 `?cwd=` 的路由，要求该 cwd 已通过 `POST /api/cwd/validate`
  注册为允许根，否则 403 `Access denied`。所以 fixture 必须先 validate 再打这些 API。
  `GET /api/default-cwd` 是 POST-only，返回 405 是**预期**，不是失败。
- 覆盖：`/`、`/login`、`/manifest.webmanifest`；从渲染 HTML 中 grep 出 4 个
  `/_next/static/{css,chunks}/*` 再逐个 probe；cwd 无关 API（`/api/home`、`/api/projects`、
  `/api/agent/running`、`/api/tools/settings`、`/api/subagents/settings`）；
  fixture API（models/skills/plugins/files/worktrees/sessions）；
  node-pty 终端 `POST/GET/DELETE /api/terminal`（32-hex 随机 id）。
- 清理断言：按端口找 listener PID → 按 PGID `kill -TERM -pgid` → 轮询 20s 等端口释放 →
  打印 `listeners left` 与残留安装版进程数，两者都应为 0。

**可复用性：中高。** 结构、顺序、清理断言照搬；端口与期望字节数自然会变。

#### `b9-publish.sh`（由用户在**自己终端**执行；可照抄，只需换路径与 SHA256）

```bash
#!/usr/bin/env bash
# B9: publish the frozen, audited tarball as @xup3ng/pi-web@0.9.4 (irreversible).
# Run this in YOUR terminal so npm can prompt for the 2FA one-time password.
set -euo pipefail

TGZ="/home/xupeng/dev/personal/forked/.pi-web-v094-release-20260918-182408/artifacts/xup3ng-pi-web-0.9.4.tgz"
EXPECTED_SHA256="eb6bb81cea02bf278caa727f55f51015e65bafe784b3e8a950b1ce0ed4a551f1"

sha256sum "$TGZ"
ACTUAL="$(sha256sum "$TGZ" | cut -d' ' -f1)"
if [ "$ACTUAL" != "$EXPECTED_SHA256" ]; then
  echo "!! SHA256 与已审计值不一致，已中止（不要发布）"; exit 1
fi
echo "OK: SHA256 与审计值一致"

npm whoami --registry=https://registry.npmjs.org/

exec npm publish "$TGZ" \
  --registry=https://registry.npmjs.org/ \
  --tag=latest --access=public
```

**可复用性：高。** 核心价值 = 发布前先校验 tgz SHA256 与审计值一致，再发布**同一个 tgz**
（不重新 build / 不重新 pack）；用 `exec` 让退出码就是 npm 的退出码。

### 1.3 目录布局（照 B1 重建）

```
ROOT=../.pi-web-v095-release-$(date +%Y%m%d-%H%M%S)   # 位于 /home/xupeng/dev/personal/forked/
├── env.sh  npmrc  check-run.py  smoke.sh  b9-publish.sh
├── src/         # git archive H | tar -x（无 .git）
├── install/     # npm install -g --prefix
├── fixture/demo # 独立 git fixture（非 linked worktree）
├── artifacts/   # 唯一 tgz + SHA256SUMS + SHA512.b64 + filelist.txt
├── evidence/    # H.txt / H-tree.txt / b6-index.html / b6-smoke.txt / smoke-port.txt
├── logs/ check/ # 每步 log 与 JSON
├── home/ xdg-*/ agent/ tmp/ npm-cache/
```

创建命令：

```bash
ROOT=../.pi-web-v095-release-$(date +%Y%m%d-%H%M%S)
mkdir -p "$ROOT"/{src,home,xdg-config,xdg-data,xdg-cache,xdg-state,agent,npm-cache,check,artifacts,install,fixture,logs,evidence}
```

---

## 2. 0.9.5 runbook（B1 → B12；每步命令 / 退出码判据 / 证据命名 / 隔离边界）

前置：本 runbook 消费**合并后冻结的 `H`**（`09-19-merge-upstream-pre-095` 产出的个人分支 HEAD）。
若 `upstream/main` 在冻结后前进，**停止并重新评估**，不要顺手合并。

> **`H` 必须先冻结**：进入 B 段后不改业务代码；`git status --porcelain` 在导出前应只含
> 用户未提交文件（3 个 `.pi/agents/trellis-*.md` 与 `.trellis/` 任务目录），不得有业务改动。

### 步骤总表

| 步 | 目的 | 命令（在 `$ROOT` 语义内） | 退出码判据 | 证据文件 |
|----|------|---------------------------|-----------|----------|
| B1 | 建隔离 root | 见 §1.3；写 `env.sh`/`npmrc`/`check-run.py`/`smoke.sh` | `mkdir -p` 0 | `research/` 记录 `ROOT` 路径 |
| B2 | 从 H 导出源码 | `git archive "$H" \| tar -x -C "$ROOT/src"` | 0 | `evidence/H.txt`、`evidence/H-tree.txt`、源文件计数 |
| B2b | **打包前 bump** | 在 `$ROOT/src` 内 `npm version 0.9.5 --no-git-tag-version --ignore-scripts` | 0 | `check/b2b-npm-version.json` |
| B3 | 私有依赖安装 | `source env.sh; npm ci --cache "$ROOT/npm-cache"` | 0，锁未改 | `check/b3-npm-ci.json`、`logs/b3-npm-ci.log` |
| B4 | **隔离构建** | `source env.sh; TURBOPACK= npm run build`（**仅 `$ROOT/src`**） | 0 | `check/b4-build.json`、`logs/b4-build.log`、`evidence/BUILD_ID.txt` |
| B5 | 打包 + 审计 | `npm pack`、`sha256sum`、`tar -tzf`、字体过滤 | 0；见 §3/§4 判据 | `artifacts/*.tgz`、`SHA256SUMS`、`SHA512.b64`、`filelist.txt` |
| B6 | 生产安装 smoke | `npm install -g --prefix "$ROOT/install" <tgz>`；`bash smoke.sh <port>` | 0；所有 probe 200 | `check/b6-install.json`、`logs/b6-install.log`、`evidence/b6-smoke.txt`、`evidence/smoke-port.txt` |
| B7 | publish dry-run | `npm publish --dry-run <tgz> --registry=… --tag=latest --access=public` | 0，清单与 B5 一致 | `check/b7-publish-dry-run.json`、`logs/b7-publish-dry-run.log` |
| B8 | 用户批准门 `[GATE]` | 停下来问用户；核对 §5 前置 | 全部满足 | `research/release-report.md` 草稿 |
| B9 | 真实发布（不可逆） | 用户在**自己终端** `bash "$ROOT/b9-publish.sh"` | 0（若已受理见 §5） | 脱敏 npm debug log 关键行 |
| B10 | 有界核验 | 轮询 `npm view` + 下载远端 tgz 比对 | 全部字段一致；≤10 分钟 | `evidence/remote-0.9.5.json` |
| B11 | 本地 bump 提交（B10 成功后） | 主 checkout `git add package.json package-lock.json pnpm-lock.yaml`（如变更）→ commit | commit 成功 | `git show --stat` 记录 |
| B12 | 收尾报告 | 写 `research/release-report.md` | — | 报告文件 |

### 每步细化

**B1 隔离环境**
- 判定：`realpath "$ROOT"` 不在主 checkout 内；`unset` 列表生效（可 `env | grep -E 'NPM_TOKEN|NODE_AUTH_TOKEN|PROXY'` 应无输出）。
- 边界：`HOME`/`XDG_*`/`PI_CODING_AGENT_DIR`/`TMPDIR`/`NPM_CONFIG_CACHE`/`NPM_CONFIG_USERCONFIG`
  全部指向 `$ROOT`；不复制任何真实凭据/会话/设置。

**B2 源码导出**
```bash
H="$(git -C /home/xupeng/dev/personal/forked/agegr-pi-web rev-parse HEAD)"
git -C /home/xupeng/dev/personal/forked/agegr-pi-web rev-parse "$H^{tree}" > "$ROOT/evidence/H-tree.txt"
echo "$H" > "$ROOT/evidence/H.txt"
git -C /home/xupeng/dev/personal/forked/agegr-pi-web archive --format=tar "$H" | tar -x -C "$ROOT/src"
cd "$ROOT/src" && (git rev-parse --verify HEAD 2>&1 || echo "(无 .git，预期)")
find "$ROOT/src" -type f | wc -l
```
- 证据命名规范：`evidence/H.txt`（提交 hash）、`evidence/H-tree.txt`（树 hash）。
- 0.9.4 参照：787 文件、树 hash `2d004dffcde2f4d12aaf0cf3196963385f9a9b2b`。

**B2b 打包前 bump（0.9.4 报告的已知计划缺口，必须显式保留）**
```bash
cd "$ROOT/src" && npm version 0.9.5 --no-git-tag-version --ignore-scripts
git diff --no-index /dev/null /dev/null; # 仅用于确认预期
node -p "require('$ROOT/src/package.json').version"   # 期望 0.9.5
```
- 判据：仅 `package.json`（1 行）与 `package-lock.json`（2 行）变化；`pnpm-lock.yaml` 无版本字段、0 行差异。
- 若 `npm version` 改了其他字段 → 停止并解释，不随手接受 churn。

**B3 私有 npm ci**
```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b3-npm-ci "$ROOT/src" npm ci --cache "$ROOT/npm-cache"
```
- 判据：exit 0；`src/` 无锁变化（`git`-less，用前后 `sha256sum package-lock.json` 比对）。
- 0.9.4 参照：`added 937 packages in 56s`。

**B4 隔离构建（最重要约束）**
```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b4-build "$ROOT/src" env TURBOPACK= npm run build
cp "$ROOT/src/.next/BUILD_ID" "$ROOT/evidence/BUILD_ID.txt"
```
- **绝对不许在主 dev checkout 执行 `next build`**（AGENTS.md：dev 期间不 build，会污染 `.next/` 并
  破坏 `npm run dev`；主 checkout 的 `.next` 与 `node_modules` 必须保持不变）。
- 判据：exit 0；`.next` 内含 BUILD_ID、server/static、路由/prerender、manifests；
  版本号 0.9.5 已嵌入 `.next` 产物。
- 0.9.4 参照：190s；0.9.3 参照 BUILD_ID `HpNoCyvhTfX8JSrIk0BmZ`。
- 构建后核验主 checkout `.next` mtime 未变（`git -C … status --porcelain` 不受影响，但要另行核对）。

**B5 打包与审计**：见 §3（字体许可）与 §4（命令清单）。

**B6 生产安装 smoke**
```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b6-install "$ROOT" npm install -g --prefix "$ROOT/install" "$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz"
# 起服务（fixture cwd、动态端口、NEXT_TELEMETRY_DISABLED=1、PI_WEB_SKIP_VERSION_CHECK=1、--no-open），
# 把端口写 evidence/smoke-port.txt，然后：
bash "$ROOT/smoke.sh" "$(cat "$ROOT/evidence/smoke-port.txt")"
```
- 判据：安装 exit 0；安装版本 0.9.5；`smoke.sh` 全部 probe 200（`/api/default-cwd` 405 属预期）；
  末尾 `listeners left: 0` 且 `installed-server processes left: 0`。
- fixture 必须是独立 git 项目（**非 linked worktree**），避免 projectRoot 指回主仓库。
- 0.9.4 参照：`added 361 packages in 60s`；port 46885；全部 200。

**B7 publish dry-run**
```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b7-publish-dry-run "$ROOT" npm publish --dry-run \
  --registry=https://registry.npmjs.org/ --tag=latest --access=public \
  "$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz"
```
- 判据：exit 0（禁止 `|| true`）；`total files` 与 `filelist.txt` 行数一致。
- 0.9.4 参照：`total files: 703`。

**B8 用户批准门 `[GATE]`** — 必须单独确认：`H`/tgz hash 已记录；B3–B7 全绿；
`npm view @xup3ng/pi-web@0.9.5 version` 仍 E404；`npm whoami` = `xup3ng`（**当前 401，需重新登录**）。

**B9–B12**：见 §5。

---

## 3. 字体许可核验（重点，本次发布的独立验收点）

来源任务：`09-19-font-license-in-next-release`（R3–R5、AC1–AC4）。

### 3.1 仓库现状（实测）

| 文件 | 字节数 | SHA-256 | 状态 |
|------|--------|---------|------|
| `public/fonts/LICENSE-cascadia-code.txt` | 4395 | `82c05d6c53dfa0c9025985c19e371810020b74ed2c61d51d370f2a8ab2506d52` | 存在 |
| `public/fonts/NOTICE.txt` | 1477 | `9834f87fdc368ab330c20814c78e032ae3e73dd86b6603ae1e38a2ab50b574db` | 存在 |
| `public/fonts.test.mjs` | 1936 | `b7890fb8dd63f5f567dc3a0cd38f133991fa79f2df16ae6a05a3b470559abfd6` | 存在 |

- 两文件的 SHA-256 与 `09-13-npm-patch-release/research/license-fonts.md` 记录的
  `LICENSE=82c05d6c…`、`NOTICE=9834f8…` **逐字节相同** → 确认是当年 0.9.3 包里那份文件，
  由 `5129887 fix(fonts): ship the Cascadia Code license text and notice` 恢复进仓库，
  且 `5129887` 是当前 HEAD 的 ancestor（`git merge-base --is-ancestor 5129887 HEAD` → true）。
- 内容摘要：
  - `LICENSE-cascadia-code.txt` = SIL OFL 1.1 全文，含
    `Copyright (c) 2019 - Present, Microsoft Corporation, with Reserved Font Name Cascadia Code.`
  - `NOTICE.txt` = 来源与哈希声明：4 个 woff2 来自 `@fontsource/cascadia-code@5.3.0`
    （上游 Google Fonts `ofl/cascadiacode`），并逐个列出 SHA-256；末尾给 OFL 与上游 URL。

### 3.2 NOTICE 声明的 4 个 woff2 SHA-256 vs 仓库实际文件（逐个核对）

| 文件 | NOTICE 声明 | 仓库实际 | 一致？ |
|------|-------------|----------|--------|
| `cascadia-code-latin-400-normal.woff2` | `923fd5a61f1618f4597422b66172d0d8615577f81eb9382724390ec8cb8bfd5d` | 同左 | ✅ |
| `cascadia-code-latin-500-normal.woff2` | `d4994c01c11d6b9a49a2b44e0a3711934c99a35268ab9303a7b9dcc30495341e` | 同左 | ✅ |
| `cascadia-code-latin-600-normal.woff2` | `be5e5cbe3958e21cf2c7404e09853dcc83cf667e71327264274dd26fc8d92d9b` | 同左 | ✅ |
| `cascadia-code-latin-700-normal.woff2` | `db2452f9551ba42a0b2b5ef27a3e9438737922fbdaabd71a2446eaf96fe81ad9` | 同左 | ✅ |

**4/4 一致。** woff2 字节数：29452 / 29888 / 30356 / 30244。

### 3.3 回归测试（已实际运行）

```
$ node --test public/fonts.test.mjs
✔ public/fonts ships the license text and provenance notice next to the webfonts (10.8ms)
✔ NOTICE.txt declares the SHA-256 of every bundled webfont (16.6ms)
ℹ tests 2   ℹ pass 2   ℹ fail 0   EXIT=0
```

`public/fonts.test.mjs` 断言两件事：
1. 两个许可文件存在、含 OFL 1.1 与 Reserved Font Name、且 NOTICE 提到全部 4 个字体与 `@fontsource/cascadia-code@5.3.0`；
2. NOTICE 对每个字体声明的 SHA-256 与文件实际 SHA-256 相等（**漂移即失败**）。

> 该测试也在 `npm test` 的 glob `"public/**/*.test.mjs"` 内，所以 B4 后的任何全量测试都会跑到它。

### 3.4 0.9.4 缺陷复现（基线反证）

已下载 registry 上的 0.9.4 tarball 并只读检查：

```bash
curl -sS -o /tmp/pi-web-0.9.4.tgz https://registry.npmjs.org/@xup3ng/pi-web/-/pi-web-0.9.4.tgz
sha256sum /tmp/pi-web-0.9.4.tgz        # eb6bb81cea02bf278caa727f55f51015e65bafe784b3e8a950b1ce0ed4a551f1 ✅
tar -tzf /tmp/pi-web-0.9.4.tgz | grep 'public/fonts/'          # 只有 4 个 woff2
tar -tzf /tmp/pi-web-0.9.4.tgz | grep -E 'public/fonts/(LICENSE-cascadia-code\.txt|NOTICE\.txt)$'
# → 0 命中（0.9.4 缺陷确认）
```

### 3.5 0.9.5 必须执行的 tgz 核验命令（AC1）

在 B5 后、发布前执行；期望**恰好命中 2 条**：

```bash
tar -tzf "$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz" \
  | grep -E 'public/fonts/(LICENSE-cascadia-code\.txt|NOTICE\.txt)$'
# 期望输出：
# package/public/fonts/LICENSE-cascadia-code.txt
# package/public/fonts/NOTICE.txt
# 计数：tar -tzf <tgz> | grep -cE '...'  == 2
```

补充：对 tgz 内两文件做 SHA-256 抽取比对，确保与仓库值一致（可选但推荐）：

```bash
tar -xzOf "$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz" package/public/fonts/NOTICE.txt | sha256sum
# 期望 9834f87f…b574db
tar -xzOf "$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz" package/public/fonts/LICENSE-cascadia-code.txt | sha256sum
# 期望 82c05d6c…506d52
```

**同时**在 `$ROOT/src` 内运行 `node --test public/fonts.test.mjs`，2/2 通过（AC2）。

---

## 4. 打包与审计命令清单

### 4.1 打包命令与一致性判据

```bash
cd "$ROOT/src"
source "$ROOT/env.sh"
# 1) dry-run（结构化）
npm pack --dry-run --json --ignore-scripts > "$ROOT/artifacts/pack-dryrun.json"; echo "exit=$?"
# 2) 真实 pack（唯一 tgz；无 prepack lifecycle，故 ignore-scripts 安全）
npm pack --json --ignore-scripts --pack-destination "$ROOT/artifacts"
# 3) dry-run 与真实 pack 一致性判据：
#    - 两者 JSON 中同一文件的 "size"、"unpackedSize"、"entryCount"、"integrity" 必须一致
#    - 真实 tgz 的 tar 条目数 == dry-run 的 entryCount == filelist.txt 行数
```

判据：`sha512-<SRI>`（dry-run 输出）与真实 tgz 计算值相同；`entryCount` 两处相同；
`package.json` 的 `name/version` 为 `@xup3ng/pi-web/0.9.5`。

### 4.2 sha256 / sha512 / SRI 记录方式

```bash
cd "$ROOT/artifacts"
sha256sum xup3ng-pi-web-0.9.5.tgz | tee SHA256SUMS
base64 -w0 <(openssl dgst -sha512 -binary xup3ng-pi-web-0.9.5.tgz) | sed 's/^/sha512-/' | tee SHA512.b64
# 或等价 Node：
node -e 'const c=require("crypto"),f=require("fs");console.log("sha512-"+c.createHash("sha512").update(f.readFileSync(process.argv[1])).digest("base64"))' xup3ng-pi-web-0.9.5.tgz
# 归档清单
tar -tzf xup3ng-pi-web-0.9.5.tgz > filelist.txt
wc -l filelist.txt
```

命名规范（沿用 0.9.4）：`artifacts/SHA256SUMS`（单行 `<sha256>  <tgz>`）、
`artifacts/SHA512.b64`（纯 base64，B10 比对用）、`artifacts/filelist.txt`（tar 条目清单）。

### 4.3 fileCount / unpackedSize / entryCount 对比方法

| 指标 | 来源 A | 来源 B | 判据 |
|------|--------|--------|------|
| `entryCount` / `fileCount` | `npm pack --json` 的 `entryCount` | `wc -l filelist.txt`；`npm publish --dry-run` 的 `total files` | 三者相同 |
| `unpackedSize` | `npm pack --json` 的 `unpackedSize` | `npm view …@0.9.5 dist.unpackedSize`（发布后） | 与 B5 一致 |
| `size`（tgz 字节） | `ls -l` | `npm pack --json` 的 `size` | 相同 |

### 4.4 必须逐项核对的内容清单（0.9.4 漏审教训：每项都要有逐项证据）

- [ ] `package.json`：`name=@xup3ng/pi-web`、`version=0.9.5`、`files` 白名单
      （`bin`/`.next`/排除 `!.next/cache` `!.next/dev` `!.next/**/*.js.map`/`public`/`next.config.ts`/`package.json`）、
      `license=MIT`、`bin={"pi-web":"bin/pi-web.js"}`、`engines.node>=22.19.0`。
- [ ] `bin/`：入口 `bin/pi-web.js` 及全部 helpers（含 `bin/prepare-terminal.js`，postinstall 引用）。
- [ ] `next.config.ts` 在包内（`outputFileTracingRoot`、`images.unoptimized`、
      `serverExternalPackages`）；`.next/BUILD_ID`、server/static/manifests 齐全。
- [ ] `public` 图标：`public/icons/apple-touch-icon.png`（以及 catppuccin 许可）。
- [ ] **字体与许可文件**：4 个 woff2 + `public/fonts/LICENSE-cascadia-code.txt` +
      `public/fonts/NOTICE.txt`（见 §3.5，期望 grep 命中 2 条）。
- [ ] 不含 `.git`/`.pi`/`.trellis`/`.env`/`.npmrc`；不含凭据（token/`_auth`/OTP/私钥/
      `npm_*`/`ghp_*`/`sk-*`）；不含真实会话/附件。
- [ ] 不含主目录绝对路径（`/home/xupeng`、`/Users/`）；无绝对路径条目、无 `..` traversal；
      **无 symlink 条目**（0.9.4 审计明确 0 symlink）。
- [ ] 未包含 `.next/cache`、`.next/dev`（白名单排除项，0 命中）。
- [ ] 未包含 3 个用户 agent 文件（`.pi/agents/trellis-{check,implement,research}.md`）。
- [ ] `next.config.ts` 的 `required-server-files.json` 会内嵌**隔离构建路径**——这是既有现象
      （0.9.2/0.9.3 同样内嵌），不阻塞，但如实记录；禁止主仓库路径出现在**非构建路径**位置。

### 4.5 0.9.4 实际审计数值（参照基线）

| 项 | 0.9.4 | 0.9.3（对照，含许可文件） |
|----|-------|--------------------------|
| tgz | `artifacts/xup3ng-pi-web-0.9.4.tgz`（唯一） | `xup3ng-pi-web-0.9.3.tgz` |
| tgz 字节 | 6,052,906（下载实测） | 6,111,437 |
| SHA-256 | `eb6bb81cea02bf278caa727f55f51015e65bafe784b3e8a950b1ce0ed4a551f1` | `e273a96990225dfb5ee3823fc0797dd3bb80572288d3b786812f6fad8d762b9e` |
| SRI（sha512） | `sha512-WX+LIbwPxXCMnTZlK1xirhq9JZnU5UX4QugcoZ2J/X801ba+PCh7lqXpQRxiJKVe4APe4b1DOunaehLoEzwXmw==` | `sha512-OrNdoL5ZFlAN3QJKprH+PH8ArHe19V37zvzBhZzH9MAIEuqJNWd2Iwrf9ZqJmtDzFyA2qaa/C8kexB5F+AQCiQ==` |
| sha1(shasum) | `2229931fff28561aace0903206174f453afd972d` | — |
| fileCount / entryCount | 703 | 698 |
| unpackedSize | 33,807,514 | 35,450,604 |
| `npm pack` 依赖安装耗时 | `npm ci` 56s / build 190s / install 60s | — |
| files 白名单 | 见 §4.4 | 同 |

> 0.9.4 的 703 条清单里 `public/fonts/` 只有 4 个 woff2（第 680–683 行），
> 无许可文件 → 这就是本次 0.9.5 必须补回的缺口。

---

## 5. publish 环节：可复用知识与边界

### 5.1 上次的真实经过（0.9.4，2026-09-18）

1. **agent 侧 EOTP 失败**：agent 在隔离环境执行 `npm publish …`，在写入 registry **之前**
   返回 `npm error code EOTP / This operation requires a one-time password`（exit 1）。
   随后实测 `0.9.5`（当时是 0.9.4）仍 E404、`latest` 仍 0.9.3 → 确认**无任何不可逆后果**。
2. **改由用户在自己终端执行**：因为 2FA 的 OTP 不应进入任何日志。用户执行
   `bash <ROOT>/b9-publish.sh`，npm 走 web 授权 + 2FA（`PUT 401 → 浏览器授权 → PUT 202`），
   exit 0，`21:47:53 CST` 受理。
3. **脚本逻辑**：先 `sha256sum "$TGZ"` 与 `EXPECTED_SHA256` 比对，不一致立即 `exit 1` 且不发布；
   一致才 `exec npm publish "$TGZ"`——**发布的就是 B5 审计过的同一个 tgz**，不重新 build/pack。
4. **传播延迟**：受理后约 6 分钟内 `npm view` 与 registry 原始 API 都 404，用户期间
   `mise use -g npm:@xup3ng/pi-web@0.9.4` 也失败；直到
   `2026-09-18T13:53:41.691Z（21:53:41 CST）` 才可见。**这不是失败，不得重发。**

### 5.2 发布后必须有界核验的字段（B10）

轮询预算：**最多 10 分钟**（0.9.4 实测约 5 分钟）；每请求超时 20s、0 重试。
在可见之前**不得判定失败、不得重发**。

```bash
npm view @xup3ng/pi-web@0.9.5 name version dist.tarball dist.integrity dist.shasum dist.fileCount dist.unpackedSize --json
npm view @xup3ng/pi-web dist-tags --json
npm view @xup3ng/pi-web versions --json
npm view @xup3ng/pi-web maintainers --json
npm view @xup3ng/pi-web time --json | grep 0.9.5     # 发布时间
```

| 检查项 | 期望（0.9.5） | 0.9.4 实测 |
|--------|---------------|-----------|
| exact version | 0.9.5 | 0.9.4 ✅ |
| `dist-tags.latest` | 0.9.5 | `{"latest":"0.9.4"}` ✅ |
| `versions` 含新版本 | 含 0.9.5 | `0.9.0…0.9.4` ✅ |
| `dist.integrity` | 与 B5 SRI 逐字相同 | `sha512-WX+LIbwPx…EzwXmw==` ✅ |
| `dist.shasum` | 与 B5/B7 一致 | `2229931f…d972d` ✅ |
| `dist.fileCount` / `unpackedSize` | 与 B5 一致 | 703 / 33,807,514 ✅ |
| `maintainers` | `["xup3ng"]` | ✅ |
| 发布时间 | 记录 | `2026-09-18T13:53:41.691Z` |
| 下载远端 tgz 的 SHA-256 | 与本地审计一致 | 逐字节相同（`cmp` 无差异）✅ |

额外（本次因字体缺陷必须做）：确认远端 tgz 内 `public/fonts/LICENSE-cascadia-code.txt`
与 `NOTICE.txt` 各有 1 条命中（local 审计通过后，远端只需确认与本地 `cmp` 相同即可传递）。

### 5.3 边界

- 失败或结果歧义 → **不重发**，记录状态后向用户报告；只有明确未上传且 exact 查询确认未占用
  才考虑重试（人工确认）。
- 不把 unpublish / deprecate / dist-tag 移动当自动回退。
- 发布日志只保留脱敏时间 / exit code / name / version / registry / hash；**OTP/token/授权 URL 不入日志**。

---

## 6. 资源与磁盘

### 6.1 现状实测

```
/          98G total, 29G used, 65G avail, 31%   (/dev/sda2)
/tmp       2.0G tmpfs, 407M used, 1.7G avail
主 checkout: node_modules 2.8G, .next 1.6G（其中 .next/dev ~1.6G）
pnpm store: ~/.local/share/pnpm/store/v10 (1.9G)；~/.npm 1.3G
```

### 6.2 上次为省盘的变通是否仍需要

| 上次变通（09-13，当时仅 ~0.4GB 可用） | 本次是否需要 | 理由 |
|----------------------------------------|--------------|------|
| `pnpm install --frozen-lockfile --offline --store-dir <全局 store>` 硬链接替代 `npm ci` | **不需要** | 65G 可用，`npm ci` 约 1.5–2GB 完全可行；且 `npm ci` 与 npm 锁/CVE 审计更一致，是 0.9.4 采用的正路 |
| 把 `.next/cache` 软链到 tmpfs 绕过 ENOSPC | **不需要，且不建议** | `/tmp` 只有 2G tmpfs，`.next` 本身可达 1.6G+；tmpfs 是内存盘，反而更容易 ENOSPC 并挤占内存 |

**建议本次直接用正常磁盘路径**：`npm ci` + 普通 `TURBOPACK= npm run build`，
不做任何软链/硬链接/离线变通；只在构建时用 `df -h /` 监控可用空间。

### 6.3 磁盘预算建议

| 项目 | 估算 |
|------|------|
| `src/` 导出（787 文件） | ~50–300 MB |
| `src/node_modules`（npm ci，937 包） | ~1.5–2.5 GB |
| `src/.next`（生产 build，排除 cache 前） | ~1.5–2.0 GB |
| `install/` 生产前缀（361 包） | ~0.5–1.0 GB |
| `npm-cache` | ~0.5–1.0 GB |
| `artifacts` + `evidence` + logs | ~10–50 MB |
| **合计** | **≈ 4–7 GB（建议预留 10 GB）** |

65G 可用 → 充裕。发布完成后可整目录删除回收（0.9.4 报告 §13 的做法）。

---

## 7. 本次必须遵守的边界与禁做清单

**硬边界（研究/构建/发布全程）**

- [ ] **绝不在主 dev checkout 执行 `next build`**（AGENTS.md：dev 期间不 build 会污染 `.next/`
      并使 `npm run dev` 失效）；构建只在 `$ROOT/src`。
- [ ] 不改主 checkout 的 `.next` 与 `node_modules`（B4 后核对 mtime/存在性）。
- [ ] 不改主 checkout 的任何**被跟踪**业务文件；不碰 3 个用户未提交的
      `.pi/agents/trellis-{check,implement,research}.md`（保持未提交、内容/SHA256 不变）。
- [ ] **不 push、不打 tag、不建 GitHub Release**；不跑 `scripts/release-personal.sh`。
- [ ] **不覆盖已发布的 0.9.4**（不 unpublish/deprecate/移动 dist-tag；其 registry integrity
      必须仍为 `sha512-WX+LIbwPxXCMn…EzwXmw==`）。
- [ ] 不以历史 dev 测试替代发布产物测试：必须做隔离 build + `npm pack` + 同 tgz 生产安装 smoke；
      dev E2E 结果不能充当 B6。
- [ ] 不跑 `npm run release` / `scripts/release-npm.sh`（`|| true` 吞退出码、只看聚合 version、
      失败无法区分、commit 非可选）。
- [ ] 不 `git stash` / `git clean` / `git add -A` / `git commit --amend`。
- [ ] 纯 bump 的 `pnpm-lock.yaml` 无版本字段 → 预期 0 改；若 npm 改动其他字段 → 停止解释。
- [ ] 隔离环境不继承任何真实凭据/会话/设置；`unset NPM_TOKEN NODE_AUTH_TOKEN NODE_OPTIONS
      NPM_CONFIG__AUTH NPM_CONFIG_ALWAYS_AUTH` 与代理变量。
- [ ] OTP/token/授权 URL 不写入日志或任务文件。
- [ ] 发布后传播延迟 ≤10 分钟；可见前不判定失败、不重发。
- [ ] B9 为不可逆操作，**必须单独获得用户批准**，并由用户在**自己终端**执行 `b9-publish.sh`。
- [ ] 归档旧任务、删除既有 worktree/目录等收尾动作，需单独授权。

**允许的只读动作**

- `git status/rev-parse/log/ls-tree/archive`、`npm view`、`npm whoami`、`curl` 下载 registry tgz、
  `node --test public/fonts.test.mjs`。

---

## 8. 0.9.5 实际发布后的补充（2026-09-19 实跑修正）

本节是 0.9.5 真实发布后的**实测修正**，下次照做时优先于前文的推断。

### 8.1 smoke 探测 public 资源的 URL 必须去掉 `public/`

Next.js 把 `public/` 的内容挂在站点根，所以：

| 文件系统路径 | 正确 URL |
|---|---|
| `public/fonts/LICENSE-cascadia-code.txt` | `/fonts/LICENSE-cascadia-code.txt` |
| `public/fonts/NOTICE.txt` | `/fonts/NOTICE.txt` |
| `public/offline.html`、`public/sw.js`、`public/provider-icons.svg` | `/offline.html`、`/sw.js`、`/provider-icons.svg` |

0.9.5 首跑把 probe 写成 `/public/fonts/...` 得到 **404**，误报为「字体许可缺失」；
改成 `/fonts/...` 后为 **200**（4395 B / 1477 B）。**产物本身没有问题** ——
`tar -tzf` 审计（§3）才是字体许可的权威判据，HTTP probe 只是运行时可访问性的补充。

### 8.2 `npm view <pkg>@<不会存在的版本>` 在 E404 时也输出 JSON

轮询脚本若只判断「输出非空」，会把**错误信封**当作「已可见」而提前退出：

```json
{"error":{"code":"E404","summary":"No match found for version 0.9.5", ...}}
```

判据必须是有没有 `version` 字段（或 `dist.integrity` 非空），例如：

```bash
INFO="$(npm view @xup3ng/pi-web@0.9.5 version dist.integrity --json 2>/dev/null || true)"
echo "$INFO" | grep -q '"version"' || { sleep 30; continue; }
```

### 8.3 `pgrep -f` 会匹配到自己的 shell 包装

清理断言 `installed-server processes left` 用 `pgrep -f '<root>/install/bin/pi-web'` 时，
**当前 bash 命令行本身**（其中含该字符串）也会被计入，造成假残留。
判据取「真实 node 进程」更稳：

```bash
ps -eo pid,cmd | grep -E 'install/bin/pi-web' | grep -v grep | grep -v 'bash -c'
```

另外，若曾在烟测之外手动起过服务，务必先关掉再跑最终 smoke，否则残留会被算进断言。

### 8.4 0.9.5 实测数值（下次的参照基线）

| 项 | 0.9.5 | 0.9.4（对照） |
|---|---|---|
| `entryCount` / `total files` / `filelist` 行数 | **706** | 703 |
| tgz 字节 | 6,092,922 | 6,052,906 |
| `unpackedSize` | 33,871,076 | 33,807,514 |
| sha256 | `19f52aaf…37b75b8` | `eb6bb81c…a551f1` |
| SRI | `sha512-EnTszgQw…x2RSQ==` | `sha512-WX+LIbwPx…EzwXmw==` |
| `sha1`(shasum) | `c184c639…808046c` | `2229931f…fd972d` |
| `npm ci` / `build` / 安装 smoke 耗时 | 58.5s / 199.8s / 63.4s | 56s / 190s / 60s |
| BUILD_ID | `sDkZvINGJKQuzWOOBAf0c` | — |
| `node` | v26.1.0（本机） | — |
| 字体许可两文件 | **在包内（2 条）** | **缺失（0 条）** |

### 8.5 发布受理 → 可见的时间

0.9.5：`npm publish` 受理 `2026-09-19T21:56:30Z`，registry 于
`2026-09-19T22:01:05.113Z` 可见（约 **4.5 分钟**）。与 0.9.4 的约 6 分钟同量级，
继续按「可见前不判失败、不重发、上限 10 分钟」执行。

## 9. 证据索引（archive 里可复现的原件）

回执字段与本地审计的对照位置见本次发布报告
`09-19-release-build-publish-095/research/release-report.md` §6A–§6B。

```
.trellis/tasks/archive/2026-09/09-18-sync-upstream-post-v091/
├── implement.md                                   # 原始 A/B runbook（B1..B12）
├── research/release-report.md                     # 0.9.4 全程报告（含 §14 勘误）
└── research/evidence/
    ├── evidence/env.sh / check-run.py / smoke.sh / b9-publish.sh   # 4 个脚本原件
    ├── evidence/H.txt / H-tree.txt / SHA256SUMS / SHA512.b64 / filelist.txt
    ├── evidence/b6-smoke.txt / b6-index.html / smoke-port.txt / remote-0.9.4.json
    ├── check/b2b-npm-version.json … b7-publish-dry-run.json         # 退出码/耗时
    └── logs/b3-npm-ci.log … b7-publish-dry-run.log

.trellis/tasks/archive/2026-09/09-13-npm-patch-release/
└── research/license-fonts.md / preparation-report.md / release-plan.md / check-report.md
```

**本文件写入路径**：`.trellis/tasks/09-19-release-build-publish-095/research/release-runbook-reuse.md`
（当前 active task 是 `09-19-npm-release-095`，本子任务的 PRD 位于
`09-19-release-build-publish-095/prd.md`；两者为父子关系。）
