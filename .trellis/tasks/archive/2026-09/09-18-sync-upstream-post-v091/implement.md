# 执行手册：同步上游 9 个提交并发布 0.9.4

配套文档：[prd.md](./prd.md)（要求/验收）· [design.md](./design.md)（技术设计）·
[research/merge-forecast.md](./research/merge-forecast.md)（实测证据）。

约定：

- 所有命令在 `/home/xupeng/dev/personal/forked/agegr-pi-web` 执行（除阶段 B 的隔离目录）。
- `[GATE]` 是停止点：不满足即停，向用户报告，不"绕过继续"。
- `[REC]` 是必须落盘到 `research/` 的证据（真实命令 + 退出码 + 关键输出）。
- 阶段 A 结束前不改业务代码之外的东西；阶段 B 不改业务代码。

---

## 阶段 A：合并与验证

### A0 前置核对 `[GATE]`

```bash
git status --porcelain                       # 期望：仅 3 个 .pi/agents/*.md + 09-13 任务目录
git rev-parse HEAD                            # 期望：391c141260a6c8eb5dfc9a8457bcbfcf72055aad
git rev-parse upstream/main                   # 期望：860698a6573e63a2432157676a5ac9bc9ce54044
git merge-base HEAD upstream/main             # 期望：8366762fa4b4ef3327f1b19e8ff7bf891a14c06c
sha256sum .pi/agents/trellis-check.md .pi/agents/trellis-implement.md .pi/agents/trellis-research.md
git branch --show-current                     # 期望：personal
```

- [ ] `upstream/main` 仍为 `860698a...`；若已前进，**停止**并重新评估增量（新提交=新范围）。
- [ ] 工作区脏文件集合与上表一致；出现其它脏文件 → 停止询问。
- [ ] 3 个 agent 文件的 SHA256 已写入 `research/merge-execution.md`（见 A6）。

### A1 备份锚点

```bash
git tag pre-upstream-860698a-$(date +%Y%m%d-%H%M%S) 391c141260a6c8eb5dfc9a8457bcbfcf72055aad
git tag --list 'pre-upstream-*'
```

- [ ] 本地 tag 已创建（不推送）。回滚锚点 = `391c141...`。

### A2 基线验证（合并前，依赖仍是 16.3.1）`[REC]`

```bash
node_modules/.bin/tsc --noEmit ; echo "tsc=$?"
npm run lint 2>&1 | tee /tmp/baseline-lint.txt ; echo "lint=${PIPESTATUS[0]}"
npm test 2>&1 | tail -40 | tee /tmp/baseline-test.txt ; echo "test=${PIPESTATUS[0]}"
node -p "require('next/package.json').version"
```

- [ ] 记录：tsc 退出码、lint 诊断**逐条清单**（预期历史 14 条 `react-hooks/preserve-manual-memoization`，以实测为准）、单测 passed/failed 计数、基线 next 版本。
- [ ] 基线本身若有失败：**先如实记录**，判定哪些属于既有失败（不能算作本次通过），再继续。

### A3 执行 merge 与解冲突 `[GATE]`

```bash
git merge upstream/main            # 期望：仅 components/ChatWindow.tsx 冲突
git status --short
```

解决 `components/ChatWindow.tsx`：按 [design.md §2.3](./design.md) 的表格逐项落：

- 位置取 personal（`{isEmptyNew && (...)}` 块在 `{askUserCardInColumn}` 之前、`relative shrink-0` 之外）。
- 内容取上游：`<Image src="/icons/apple-touch-icon.png" width={32} height={32} alt="" priority />`、外层 `className="mb-3 w-full"` + `paddingLeft: 16, paddingRight: isMobile ? 16 : 52`、内层 `maxWidth: "var(--chat-content-max-width, 820px)", margin: "0 auto"`、`alignItems: "center"`。
- 保留：`NewSessionUpdateLink`、web/pi 版本行、`{askUserCardInColumn}`、`relative shrink-0` 里的 `chatInputElement` + `ExtensionStatusBar`。
- 删除全部冲突标记；确认 `import Image from "next/image"` 存在（上游自动合入）。

```bash
grep -n '<<<<<<<\|=======\|>>>>>>>' components/ChatWindow.tsx   # 期望无输出
git diff --check                                                # 期望无 whitespace error
```

- [ ] 冲突已消、无残留标记。
- [ ] **若冲突文件超出 `ChatWindow.tsx`** → `git merge --abort`，回到干净 `personal` 重新评估。

### A4 自动合并文件的语义复核 `[GATE]` `[REC]`

按 [design.md §2.4](./design.md) 表格逐行核对以下 8 个文件，每条给出"看到什么"的原文证据（写进 `research/merge-execution.md`）：

| 核对项 | 期望 |
|--------|------|
| `app/globals.css` | `.extension-widget-content` = `calc(14px + var(--chat-font-size-offset, 0px))`；`--chat-font-size-offset` 定义仍在 |
| `lib/worktree.ts` | `PROJECT_CACHE_TTL_MS = 600_000`、`clearCachedProjectsOnDisk()`、`git(..., timeoutMs=10_000)`、`WORKTREE_TIMEOUT = 5*60_000`、`refs/remotes/origin/<branch>` 优先 |
| `components/ChatWindow.tsx` | 扩展对话框标题换行修复、扩展下拉 `scroll-margin` 均在；personal 的 ask_user/trellis 相关 hunk 未丢失 |
| `AGENTS.md` | 上游 UNC 段落 + auth 限流段落存在；personal 章节仍在 |
| `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | 三语各自含新的登录限流文案，key 名一致 |
| `package.json` | `next`/`eslint-config-next` = 16.3.5；fork 包名、版本 0.9.2、发布脚本、personal 依赖齐全 |
| `package-lock.json` | 根 name/version 为 personal；next 相关条目为 16.3.5 |
| `next.config.ts` | `images: { unoptimized: true }` |

```bash
git diff --stat 8366762fa4b4ef3327f1b19e8ff7bf891a14c06c..HEAD -- app/globals.css lib/worktree.ts AGENTS.md next.config.ts
```

- [ ] 8 项逐条确认，任何一项缺失 → 停止并报告（不自行补写"看起来应该有的"代码）。

### A5 依赖与锁同步（D4）

```bash
npm install                                       # 期望退出 0，更新 node_modules
node -p "require('next/package.json').version"    # 期望 16.3.5
npm ls next 2>&1 | head
pnpm install --lockfile-only --config.resolutionMode=time-based
grep -c "next@16.3.1" pnpm-lock.yaml              # 期望 0
grep -c "next@16.3.5" pnpm-lock.yaml              # 期望 > 0
git diff --stat package.json package-lock.json pnpm-lock.yaml
```

- [ ] `next` = 16.3.5，`npm ls next` 无 unmet/peer 报错。
- [ ] `pnpm-lock.yaml` 不再含 `next@16.3.1`；`git diff` 中 pnpm 锁**只**涉及 next 家族（若出现 `@typescript-eslint`、`zod` 等无关变化 → 回退该文件、改用 time-based 重跑，见 research 5.1）。
- [ ] 未改 `package.json` 中 dependencies 版本以外的字段。

### A6 候选验证（D5）`[GATE]` `[REC]`

```bash
node_modules/.bin/tsc --noEmit ; echo "tsc=$?"
npm run lint 2>&1 | tee /tmp/merged-lint.txt ; echo "lint=${PIPESTATUS[0]}"
npm test 2>&1 | tail -40 | tee /tmp/merged-test.txt ; echo "test=${PIPESTATUS[0]}"
node --test lib/auth-throttle.test.mjs lib/file-paths.test.mjs lib/paths.test.mjs \
  app/api/web-auth/route.test.mjs components/ChatWindow.extension-request.test.mjs
sha256sum .pi/agents/trellis-check.md .pi/agents/trellis-implement.md .pi/agents/trellis-research.md
```

- [ ] tsc 退出 0。
- [ ] lint 诊断与 A2 基线**逐条**对照：无新增；历史诊断若仍在，逐条列出（不得只看总数）。
- [ ] 全量单测全绿；5 个上游测试文件专项全绿。
- [ ] 3 个 agent 文件 SHA256 与 A0 完全一致。
- [ ] 把 A2/A6 的真实命令、退出码、计数、lint 逐条对照写入 `research/merge-execution.md`。

`[GATE]` 任何新失败：停止 → 回到 A3/A4 复核 → 不得改测试断言或放宽判据来换绿。

### A7 提交并冻结 `[GATE]`

按 workflow 3.4 一次性给出提交计划，等用户确认后执行（禁止 `--amend`、禁止 `git add -A`）：

1. `merge: integrate upstream v0.9.1..860698a`（merge 提交）
2. `chore: sync lockfiles for next 16.3.5`（若 A5 的锁改动未包含在 merge 提交里）
3. `chore(task): record post-v0.9.1 upstream sync`（本任务目录 + 归档 09-09 的目录移动）

```bash
git log --oneline -4
git status --porcelain        # 期望空
git rev-parse HEAD            # 记作冻结提交 H
```

- [ ] 用户已确认提交计划。
- [ ] 工作区干净，`H` 已记录到 `research/merge-execution.md`。
- [ ] 3 个 agent 文件仍未被提交（保持用户的未提交状态，或由用户自行处理）。

### A8 归档 09-09（D1）

```bash
python3 ./.trellis/scripts/task.py archive 09-09-sync-upstream-release
python3 ./.trellis/scripts/task.py current --source      # 期望仍指向 09-18
git status --porcelain
```

- [ ] 09-09 已移入 `.trellis/tasks/archive/<yyyy-mm>/`，当前会话仍指向 09-18。
- [ ] 该移动进入 A7 的第 3 个提交（若已提交则追加一个任务记录提交，不 amend）。

---

## 阶段 B：发布 0.9.4

> 进入本阶段的前提：A7 的 `H` 已冻结且 A6 全绿。本阶段只消费 `H`，不改业务代码。
> **不可逆操作（B9 真实 publish）必须单独获得用户批准。**

### B1 隔离环境（新建，不复用 09-13 的 state）

```bash
ROOT=../.pi-web-v094-release-$(date +%Y%m%d-%H%M%S)
mkdir -p "$ROOT"/{src,home,xdg-config,xdg-data,xdg-cache,xdg-state,agent,npm-cache,check,artifacts,install,fixture,logs,evidence}
```

- [ ] `ROOT` 路径记录到 `research/release-report.md`。
- [ ] 参考 09-13 的 `env.sh` / `check-run.py` 模式重建隔离脚本，但使用**全新的**私有 HOME/XDG/cache/TMPDIR/PI_CODING_AGENT_DIR；不复制任何真实凭据/会话/设置。

### B2 从 H 导出源码

```bash
git archive --format=tar "$H" | tar -x -C "$ROOT/src"
cd "$ROOT/src" && (git rev-parse --verify HEAD 2>&1 || echo "(无 .git，预期)")
```

- [ ] `src/` 不含 `.git`，文件清单与 `H` 一致（记录文件数 + 树 hash）。

### B3 私有依赖安装 `[GATE]`

```bash
source "$ROOT/env.sh"   # HOME/XDG/NPM_CONFIG_* 全部指向 $ROOT
npm ci --cache "$ROOT/npm-cache"
```

- [ ] 退出 0；`npm ci` 不改锁（`src/` 无锁变化）。

### B4 隔离构建 `[GATE]` `[REC]`

```bash
TURBOPACK= npm run build        # 仅在 $ROOT/src 执行；主 checkout 绝不 build
```

- [ ] 退出 0；构建日志落 `$ROOT/logs/`。
- [ ] 主 checkout `.next` 未被本步骤改动。

### B5 打包与产物审计 `[GATE]` `[REC]`

```bash
npm pack                        # 生成唯一 tgz
sha256sum xup3ng-pi-web-0.9.4.tgz | tee "$ROOT/artifacts/SHA256SUMS"
tar -tzf xup3ng-pi-web-0.9.4.tgz > "$ROOT/artifacts/filelist.txt"
```

- [ ] 唯一 tgz 与其 SHA256 记录在 `artifacts/`。
- [ ] 内容审计：含 `package.json`/`bin`/`next.config.ts`/字体与许可文件；**不含** `.git`、`.pi`、`.trellis`、`.env`、`.npmrc`、凭据、真实会话/附件、主仓库绝对路径、越界 symlink；解包路径无 traversal。
- [ ] 审计通过后 tgz 冻结：后续步骤只用它；若需重 pack → 返回 B4 重新审计。

### B6 生产安装 smoke `[GATE]` `[REC]`

```bash
npm install -g --prefix "$ROOT/install" "$ROOT/src/xup3ng-pi-web-0.9.4.tgz"
# 动态端口 + 独立 fixture git 项目；结束清理进程组与端口
```

- [ ] CLI 可启动；页面静态资源可访问；fixture 项目 API 冒烟通过；Trellis/终端基础冒烟通过。
- [ ] smoke 结束后无残留进程/端口占用。

### B7 publish dry-run `[GATE]`

```bash
npm publish --dry-run --registry=https://registry.npmjs.org/ \
  --@xup3ng:registry=https://registry.npmjs.org/ --tag=latest --access=public
```

- [ ] 退出 0；清单与 B5 一致（禁止 `|| true` 之类吞掉退出码的写法）。

### B8 用户批准门 `[GATE]` — 必须单独确认

确认后**停下来问用户**：

- [ ] `H` 与 tgz hash 已记录；
- [ ] B3–B7 全绿；
- [ ] `npm view @xup3ng/pi-web@0.9.4 version` 仍 E404；
- [ ] `npm whoami` = `xup3ng`（**当前为 401，需用户重新登录并准备 2FA**）。

### B9 真实发布（不可逆）

```bash
npm publish --registry=https://registry.npmjs.org/ \
  --@xup3ng:registry=https://registry.npmjs.org/ --tag=latest --access=public
```

- [ ] 用户已在交互终端完成 2FA；不在日志中记录任何凭据/OTP。
- [ ] 失败或结果歧义 → **不重发**，记录状态后向用户报告。

### B10 有界核验 `[REC]`

```bash
npm view @xup3ng/pi-web@0.9.4 name version dist.tarball dist.integrity dist.shasum --json
npm view @xup3ng/pi-web dist-tags --json
# 下载远端 tarball → 计算 SHA512 SRI 与本地审计值比对
```

- [ ] 轮询上限 10 分钟；exact = 0.9.4，latest = 0.9.4。
- [ ] 远端 tarball 的 SHA512 与 B5 记录的本地 tgz 一致。
- [ ] 超时/不一致 → 记录"已上传但核验待定"，不重发、不改 latest。

### B11 本地 bump 提交（仅在 B10 成功后）

```bash
# 在主 checkout：仅 package.json / package-lock.json / pnpm-lock.yaml 三处 0.9.2 → 0.9.4
git add package.json package-lock.json pnpm-lock.yaml
git commit -m "chore: release 0.9.4"
```

- [ ] 只有版本元数据变化（`git diff` 逐行确认）；3 个 agent 文件仍未提交。
- [ ] 不 push、不打 tag、不建 GitHub Release（另行授权）。

### B12 收尾记录

- [ ] `research/release-report.md`：`H`、tgz hash、B3–B11 的命令与退出码、核验结果、遗留问题。
- [ ] `research/merge-execution.md`：A0–A8 的命令与结果。

---

## 回滚点速查

| 时点 | 回滚动作 |
|------|----------|
| merge 冲突超出预期 | `git merge --abort` |
| 解冲突/验证失败、尚未提交 | `git reset --hard 391c1412...` + `git tag -d pre-upstream-*` |
| A7 已提交但 A6 结果被推翻 | 另起 revert 提交（不改写已发布历史） |
| 阶段 B 构建/审计/smoke 失败 | 废弃该 release root 重建；主 checkout 不动 |
| B9 已发布后发现问题 | **无回滚**；如实记录，后续补丁版本修复（需重新授权） |

## 不做清单

- 不 push / 不打 tag / 不建 GitHub Release / 不跑 `release-personal.sh`。
- 不动 `scripts/**`、不改 `next.config.ts` 构建语义、不跑 `npm run release`。
- 不 `git stash` / `git clean` / `git add -A` / `git commit --amend`。
- 不在主 checkout 执行 `next build`。
- 不归档除 09-09 以外的任务，不改 09-13 的状态与未提交文件。
