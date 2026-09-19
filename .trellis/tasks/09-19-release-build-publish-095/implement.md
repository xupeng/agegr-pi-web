# 执行手册：0.9.5 隔离构建、审计与发布

> 前置：`09-19-merge-upstream-pre-095` 已完成，`H` 已冻结；`prd.md` R1–R13 已读。
> 主 checkout：`/home/xupeng/dev/personal/forked/agegr-pi-web`（下称 `$MAIN`）。
> 证据根：`.trellis/tasks/09-19-release-build-publish-095/research/`（下称 `$EV`）。

## B0 前置门

```bash
cd "$MAIN"
H=$(cat "$EV/evidence/H.txt" 2>/dev/null || cat ../09-19-merge-upstream-pre-095/research/evidence/H.txt)
test "$(git rev-parse HEAD)" = "$H" || { echo "FAIL: H 已变化，停止"; }
git status --porcelain            # 期望仅有用户 3 个 .pi/agents/*.md 与 .trellis/ 任务目录
npm view @xup3ng/pi-web@0.9.5 version   # 期望 E404（版本仍可用）
npm view @xup3ng/pi-web dist-tags --json # 期望 latest = 0.9.4
df -h /                            # 期望 ≥10 GB 可用
```

任一不符即停止报告，不自行变通。

## B1 建立隔离 release root

```bash
ROOT=/home/xupeng/dev/personal/forked/.pi-web-v095-release-$(date +%Y%m%d-%H%M%S)
mkdir -p "$ROOT"/{src,install,fixture,artifacts,evidence,logs,check,home,xdg-config,xdg-data,xdg-cache,npm-cache,tmp}
echo "$ROOT" | tee "$EV/evidence/release-root.txt"
realpath "$ROOT"      # 必须不在 $MAIN 内
```

`$ROOT/env.sh`（可照抄 09-18 版本，只改版本注释）：

```bash
#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; export ROOT
export HOME="$ROOT/home"
export XDG_CONFIG_HOME="$ROOT/xdg-config"
export XDG_DATA_HOME="$ROOT/xdg-data"
export XDG_CACHE_HOME="$ROOT/xdg-cache"
export PI_CODING_AGENT_DIR="$ROOT/agent"
export TMPDIR="$ROOT/tmp"
export NPM_CONFIG_CACHE="$ROOT/npm-cache"
export NPM_CONFIG_USERCONFIG="$ROOT/npmrc"
export NEXT_TELEMETRY_DISABLED=1
export PI_WEB_SKIP_VERSION_CHECK=1
unset NPM_TOKEN NODE_AUTH_TOKEN NODE_OPTIONS HTTP_PROXY HTTPS_PROXY http_proxy https_proxy 2>/dev/null || true
```

`$ROOT/npmrc`：仅 `registry=https://registry.npmjs.org/`（**不得含任何 token**）。

`$ROOT/check-run.py`：读 `os.environ["ROOT"]`，`subprocess.run(cmd, cwd=cwd)`，
stdout/stderr 写 `logs/<name>.log`，写 `check/<name>.json`
（`{name, cwd, cmd, exit, duration_s, log, registry, home}`），`sys.exit(proc.returncode)`。

判据：`env | grep -E 'NPM_TOKEN|NODE_AUTH_TOKEN'` 无输出；`realpath` 不在 `$MAIN` 内。

## B2 导出源码

```bash
source "$ROOT/env.sh"
echo "$H" > "$ROOT/evidence/H.txt"
git -C "$MAIN" rev-parse "$H^{tree}" > "$ROOT/evidence/H-tree.txt"
git -C "$MAIN" archive --format=tar "$H" | tar -x -C "$ROOT/src"
find "$ROOT/src" -type f | wc -l | tee "$ROOT/evidence/src-file-count.txt"
test ! -e "$ROOT/src/.git" && echo "no .git: ok"
```

## B2b 打包前 bump（强制，0.9.4 的历史缺口）

```bash
cd "$ROOT/src"
npm version 0.9.5 --no-git-tag-version --ignore-scripts   # 期望 exit 0
node -p "require('$ROOT/src/package.json').version"       # 期望 0.9.5
grep -c '"version": "0.9.5"' "$ROOT/src/package-lock.json" # 期望 ≥2
diff <(git -C "$MAIN" show "$H:pnpm-lock.yaml") "$ROOT/src/pnpm-lock.yaml" \
  && echo "pnpm-lock 0 行差异: ok"
```

若 `npm version` 改动了 `version` 以外字段 → 停止并解释。

## B3 私有依赖安装

```bash
source "$ROOT/env.sh"
sha256sum "$ROOT/src/package-lock.json" > "$ROOT/evidence/lock-before.sha256"
python3 "$ROOT/check-run.py" b3-npm-ci "$ROOT/src" npm ci --cache "$ROOT/npm-cache"
sha256sum "$ROOT/src/package-lock.json" > "$ROOT/evidence/lock-after.sha256"
diff "$ROOT/evidence/lock-before.sha256" "$ROOT/evidence/lock-after.sha256"   # 期望空
```

## B4 隔离构建

```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b4-build "$ROOT/src" env TURBOPACK= npm run build
cp "$ROOT/src/.next/BUILD_ID" "$ROOT/evidence/BUILD_ID.txt"
grep -rl '0\.9\.5' "$ROOT/src/.next/server/app/page.js" "$ROOT/src/.next/static/chunks" | head
```

**绝不在 `$MAIN` 执行 build。** 构建前后记录主 checkout 证据：

```bash
stat -c '%y %n' "$MAIN/.next" | tee "$EV/evidence/main-next-mtime-after-build.txt"
git -C "$MAIN" status --porcelain | tee "$EV/evidence/main-status-after-build.txt"
```

## B5 打包与逐项审计（含字体许可 AC4）

```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b5-pack-dry "$ROOT" npm pack --dry-run --json --ignore-scripts "$ROOT/src" \
  > "$ROOT/logs/b5-pack-dry.json"
python3 "$ROOT/check-run.py" b5-pack "$ROOT/src" npm pack --ignore-scripts
mv "$ROOT/src"/xup3ng-pi-web-0.9.5.tgz "$ROOT/artifacts/"
TGZ="$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz"
sha256sum "$TGZ" | tee "$ROOT/artifacts/SHA256SUMS"
openssl dgst -sha512 -binary "$TGZ" | base64 -w0 > "$ROOT/artifacts/SHA512.b64"
tar -tzf "$TGZ" | sort > "$ROOT/artifacts/filelist.txt"
wc -l < "$ROOT/artifacts/filelist.txt"
```

逐项审计（每项都要有输出证据）：

```bash
# 1) 元数据
tar -xzOf "$TGZ" package/package.json | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["name"], d["version"], d["license"], d["bin"])'
# 2) 启动链与静态资源
tar -tzf "$TGZ" | grep -E '^package/(bin/|next.config.ts|public/)' | head -20
# 3) ★ 字体许可（AC4 核心，必须命中 2 条）
tar -tzf "$TGZ" | grep -E 'public/fonts/(LICENSE-cascadia-code\.txt|NOTICE\.txt)$' | tee "$ROOT/evidence/font-license-in-tgz.txt"
test "$(wc -l < "$ROOT/evidence/font-license-in-tgz.txt")" = 2 && echo "AC4 count: ok"
# 4) tgz 内许可文件与仓库文件逐字节一致
for f in LICENSE-cascadia-code.txt NOTICE.txt; do
  diff <(tar -xzOf "$TGZ" "package/public/fonts/$f") "$MAIN/public/fonts/$f" && echo "$f identical: ok"
done
# 5) 无泄漏/无危险项
tar -tzf "$TGZ" | grep -E '^/|\.\./|\.npmrc|\.env$' ; echo "suspicious listing exit=$?"
tar -tvzf "$TGZ" | grep -E '^l' ; echo "symlink check exit=$?"
```

伴随的源码树测试（AC4 第二半）：

```bash
cd "$ROOT/src" && node --test public/fonts.test.mjs | tee "$ROOT/evidence/fonts-test.txt"
```

## B6 生产安装 smoke

```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b6-install "$ROOT" npm install -g --prefix "$ROOT/install" \
  "$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz"
node -p "require('$ROOT/install/lib/node_modules/@xup3ng/pi-web/package.json').version"  # 0.9.5

# 独立 git fixture（非 linked worktree）
mkdir -p "$ROOT/fixture/demo" && cd "$ROOT/fixture/demo"
git init -q . && echo "# demo" > README.md && git add README.md && git -c user.email=a@b -c user.name=a commit -qm init
```

以动态端口起服务（cwd = fixture，后台），把端口写 `evidence/smoke-port.txt`，然后
`bash "$ROOT/smoke.sh" "$(cat "$ROOT/evidence/smoke-port.txt")"`。`smoke.sh` 结构照 09-18 版本：
首页/`/api/models`/`/api/sessions`/字体许可文件/版本串/node-pty 终端 SSE，
`/api/default-cwd` 405 属预期；结束时断言 `listeners left: 0`、`installed-server processes left: 0`。

## B7 publish dry-run

```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b7-publish-dry-run "$ROOT" npm publish --dry-run \
  --registry=https://registry.npmjs.org/ --tag=latest --access=public \
  "$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz"
grep -E 'total files|package size|unpacked size' "$ROOT/logs/b7-publish-dry-run.log"
```

判据：exit 0（**禁止 `|| true`**）；`total files` 与 `filelist.txt` 行数一致。

## B8 ★ 批准门（停下）

准备 `$ROOT/b9-publish.sh`（**由用户在自己终端执行**）：

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="<ROOT>"
TGZ="$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz"
EXPECT_SHA256="<审计值>"
echo "$EXPECT_SHA256  $TGZ" | sha256sum -c -     # 先校验同一 tgz
exec npm publish "$TGZ" --registry=https://registry.npmjs.org/ --tag=latest --access=public
```

向用户报告 `design.md` §6 的固定表格（`H`/tgz hash/每步退出码/字体许可 2 条输出/registry 前置/命令），
并请求批准。**未获批准不得发布。**

## B9 用户终端执行发布（不可逆）

用户执行 `bash "$ROOT/b9-publish.sh"`。agent 只读取用户提供的 npm debug log 中**脱敏关键行**
（`notice version/integrity/total files`、`PUT 202`、`exit 0`），不读取、不输出任何凭据或 OTP。
EOTP/401 属正常前置失败（不产生不可逆后果），提示用户重新登录后重试。

## B10 有界核验（≤10 分钟）

```bash
npm view @xup3ng/pi-web@0.9.5 version dist.integrity dist.shasum dist.fileCount --json \
  | tee "$EV/evidence/remote-0.9.5.json"
npm view @xup3ng/pi-web dist-tags versions --json | tee -a "$EV/evidence/remote-0.9.5.json"
```

对照 `dist.integrity` / `dist.shasum` / `dist.fileCount` 与 B5 审计值，必须逐字一致。
超时未可见 → 记为「待核验」，**不重发**。

## B11 主 checkout bump 提交与 push

仅在 B10 全部通过后：

```bash
cd "$MAIN"
git status --short                       # 人工确认无意外条目
git add package.json package-lock.json   # 逐路径；如 pnpm-lock 有变化再单独 add
git status --short                       # 再次确认 3 个 .pi/agents/*.md 仍是未暂存的 M
git commit -m "chore: release 0.9.5"
git push origin personal
test "$(git rev-parse personal)" = "$(git rev-parse origin/personal)" && echo "push: ok"
git tag -l 'v0.9.5'                      # 必须为空（本次不打 tag）
```

**禁止 `git add -A` / `git add .`。**

## B12 写 `research/release-report.md`

按 `prd.md` R13 的清单落盘；显式写明：

> `0.9.4` 缺失的 `public/fonts/LICENSE-cascadia-code.txt` 与 `public/fonts/NOTICE.txt`
> 已由本版本（0.9.5）修复，证据见 B5 的 `tar -tzf` 原始输出与 `fonts.test.mjs` 2/2 通过记录。

并覆盖：偏差、遗留、未覆盖项（如 e2e 未跑及原因）、`required-server-files.json` 内嵌隔离路径的披露。

## 边界

不 push upstream、不打 tag、不发 GitHub Release、不改写 0.9.4、不在主 checkout build、
不升级真实安装、不重启开发服务、不修 lint 历史噪声。
