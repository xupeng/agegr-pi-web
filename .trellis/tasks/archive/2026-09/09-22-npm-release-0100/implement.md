# 实施计划（B1 → B12）

前置（进入 B 段之前）：

- [ ] `git -C /home/xupeng/dev/personal/forked/agegr-pi-web status --porcelain` 为空（clean 起点）。
- [ ] `git rev-parse HEAD` 记录为 `H`；若已不是 `e91dda7`，重新冻结并把新值写进 `evidence/H.txt`。
- [ ] 用户已确认发布 **0.10.0**、渠道 **npm**、发布人 = 用户自己终端。

## B1 建隔离 root

```bash
ROOT="/home/xupeng/dev/personal/forked/.pi-web-v0100-release-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ROOT"/{evidence,logs,check,artifacts,fixture}
cp /home/xupeng/dev/personal/forked/.pi-web-v095-release-20260919-220023/{env.sh,npmrc,check-run.py,smoke.sh,b9-publish.sh,b10-verify.sh} "$ROOT/"
# 把脚本里的 0.9.5 / v095 root 路径改成 0.10.0 / 本 root 路径
```

- [ ] 判定：`realpath "$ROOT"` 不在主 checkout 内；`env | grep -E 'NPM_TOKEN|NODE_AUTH_TOKEN'` 无输出。
- [ ] 证据：`ROOT` 路径写入任务 `research/release-report.md`。

## B2 从 H 导出源码

```bash
H="$(git -C /home/xupeng/dev/personal/forked/agegr-pi-web rev-parse HEAD)"
echo "$H" > "$ROOT/evidence/H.txt"
git -C /home/xupeng/dev/personal/forked/agegr-pi-web rev-parse "$H^{tree}" > "$ROOT/evidence/H-tree.txt"
mkdir -p "$ROOT/src"
git -C /home/xupeng/dev/personal/forked/agegr-pi-web archive --format=tar "$H" | tar -x -C "$ROOT/src"
cd "$ROOT/src" && (git rev-parse --verify HEAD 2>&1 || echo "(无 .git，预期)")
find "$ROOT/src" -type f | wc -l
```

- [ ] 判定：导出成功、无 `.git`；文件数与 0.9.5 参照（787）同量级并记录实际值。

## B2b 打包前 bump（只在隔离 src 内）

```bash
cd "$ROOT/src" && npm version 0.10.0 --no-git-tag-version --ignore-scripts
node -p "require('$ROOT/src/package.json').version"   # 期望 0.10.0
```

- [ ] 判定：仅 `package.json` 与 `package-lock.json` 变化；出现其它 churn → 停止并解释。

## B3 隔离安装依赖

```bash
source "$ROOT/env.sh"
sha256sum "$ROOT/src/package-lock.json" > "$ROOT/evidence/lock-before.sha256"
python3 "$ROOT/check-run.py" b3-npm-ci "$ROOT/src" npm ci --cache "$ROOT/npm-cache"
sha256sum "$ROOT/src/package-lock.json" > "$ROOT/evidence/lock-after.sha256"
diff "$ROOT/evidence/lock-before.sha256" "$ROOT/evidence/lock-after.sha256"
```

- [ ] 判定：exit 0；锁文件前后一致。

## B4 隔离构建（唯一允许 build 的位置）

```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b4-build "$ROOT/src" env TURBOPACK= npm run build
cp "$ROOT/src/.next/BUILD_ID" "$ROOT/evidence/BUILD_ID.txt"
```

- [ ] 判定：exit 0；`BUILD_ID` 已记录；**主 checkout 的 `.next` mtime 未变**（B2 前后各记一次）。
- [ ] 禁止：在主 checkout 跑 `next build`。

## B5 打包与审计

```bash
cd "$ROOT/src" && npm pack --pack-destination "$ROOT/artifacts"
TGZ="$ROOT/artifacts/xup3ng-pi-web-0.10.0.tgz"
sha256sum "$TGZ" | tee "$ROOT/artifacts/SHA256SUMS"
tar -tzf "$TGZ" > "$ROOT/evidence/filelist.txt"
# 审计：版本号、字体许可、BUILD_ID、license/readme/bin
tar -xzOf "$TGZ" package/package.json | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version"   # 0.10.0
tar -tzf "$TGZ" | grep -E "LICENSE|README|bin/pi-web.js|fonts/(LICENSE-cascadia-code|NOTICE)" 
```

- [ ] 判定：包内版本 0.10.0；`LICENSE`/`README.md`/`bin/pi-web.js`/字体许可文件均在；`.next` 不含 cache/dev/`*.js.map`。

## B6 生产安装冒烟

```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b6-install "$ROOT" npm install -g --prefix "$ROOT/install" "$ROOT/artifacts/xup3ng-pi-web-0.10.0.tgz"
# 起服务（fixture cwd、动态端口、NEXT_TELEMETRY_DISABLED=1、PI_WEB_SKIP_VERSION_CHECK=1、--no-open）
bash "$ROOT/smoke.sh" "$(cat "$ROOT/evidence/smoke-port.txt")"
```

- [ ] 判定：安装 exit 0；探针全部 200；输出落 `evidence/b6-smoke.txt`。

## B7 publish dry-run

```bash
source "$ROOT/env.sh"
python3 "$ROOT/check-run.py" b7-publish-dry-run "$ROOT" npm publish --dry-run "$ROOT/artifacts/xup3ng-pi-web-0.10.0.tgz" --registry=https://registry.npmjs.org/ --tag=latest --access=public
```

- [ ] 判定：exit 0；清单与 B5 一致。

## B8 发布门 `[GATE]`

- [ ] 向用户展示：`H`、tgz 路径与 sha256、包内版本、BUILD_ID、dry-run 结论、冒烟结论。
- [ ] 确认 `npm whoami` = `xup3ng`（规划期为 E401，**用户需先 `npm login`**）。
- [ ] 用户明确批准前**不发布**。

## B9 真实发布（用户执行，不可逆）

```bash
bash "$ROOT/b9-publish.sh"   # 用户在自己终端执行；脚本先 sha256 校验封存件
```

- [ ] 证据：脱敏后的 npm debug log 关键行（授权链接会被 npm 脱敏）。

## B10 有界核验

```bash
bash "$ROOT/b10-verify.sh"   # npm view 轮询 + 远端 tgz 与本地封存件对比
```

- [ ] 判定：`npm view @xup3ng/pi-web version` = 0.10.0 且 `dist-tags.latest` 指向它；≤10 分钟。
- [ ] 远端/本地 tgz 差异若存在，必须在报告里解释（对比包内文件清单与版本号）。

## B11 本地 bump 提交

```bash
cd /home/xupeng/dev/personal/forked/agegr-pi-web
npm version 0.10.0 --no-git-tag-version --ignore-scripts
git add package.json package-lock.json
git commit -m "chore: bump version to 0.10.0"
git push origin personal
```

- [ ] 判定：提交与 push 成功；`node -p "require('./package.json').version"` = 0.10.0。

## B12 报告与收尾

- [ ] 写 `research/release-report.md`（命令/退出码/证据路径/参照值/偏差）。
- [ ] 询问用户是否删除 0.9.5 root（3.5G）与本次 root；**未获批准不删**。

## 危险点与回滚

| 步 | 危险点 | 回滚 |
|---|---|---|
| B4 | 误在主 checkout build | 不会发生（所有 build 都在 `$ROOT/src`）；若误操作，按 `AGENTS.md` 停 dev server、备份并重建 `.next` |
| B9 | 发布不可逆 | 发布前用 dry-run + sha256 封存；错发只能 `npm deprecate`，故门禁必须严格 |
| B11 | bump 提交进错分支 | 只在 `personal` 上提交；若错分支，`git reset --soft` 回到 `H` 并重做 |
