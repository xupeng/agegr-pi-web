# 合并预演证据（2026-09-18，只读）

所有命令都在主 checkout 执行，除 `git fetch upstream`（只更新 remote-tracking ref）
与 `git merge-tree --write-tree`（不写工作区、不写 index）外没有任何写操作。
本文只记录可复现的命令与原始输出摘要，不含推测。

## 1. 引用与拓扑

```
$ git remote -v
origin    https://github.com/xupeng/agegr-pi-web.git
upstream  https://github.com/agegr/pi-web.git

$ git fetch upstream --prune
   8366762..860698a  main -> upstream/main

$ git rev-parse origin/personal upstream/main
391c141260a6c8eb5dfc9a8457bcbfcf72055aad   # personal
860698a6573e63a2432157676a5ac9bc9ce54044   # upstream/main

$ git merge-base origin/personal upstream/main
8366762fa4b4ef3327f1b19e8ff7bf891a14c06c   # == upstream tag v0.9.1

$ git merge-base --is-ancestor 8366762 origin/personal && echo YES
YES

$ git rev-list --left-right --count origin/personal...upstream/main
67	9
```

结论：personal 已含 v0.9.1；待合入的是 v0.9.1 → 上游 `860698a` 的 9 个线性提交。
上游无新 tag（`git tag --sort=-creatordate | head` 首项仍是 `v0.9.1`）。

## 2. 9 个提交与逐条文件清单

```
$ git log --reverse --format='## %h %s' --name-status origin/personal..upstream/main
```

| # | 提交 | 内容摘要 | 文件 |
|---|------|----------|------|
| 1 | `135517b` | 新会话品牌区对齐：`π` 文字 → `next/image` 静态图标；外层 `mx-auto w-full + maxWidth` → 内层 `maxWidth + margin:0 auto`；padding → `16 / (isMobile ? 16 : 52)` | `M components/ChatWindow.tsx` |
| 2 | `c04bab7` | 文件 API 保留 UNC 根路径 | `M AGENTS.md`, `A lib/file-paths.test.mjs`, `M lib/file-paths.ts`, `M lib/paths.test.mjs` |
| 3 | `c1e544b` | `pi_web_session` cookie `Strict` → `Lax`（修 #806 移动端外部顶层跳转掉登录） | `M app/api/web-auth/route.test.mjs`, `M app/api/web-auth/route.ts` |
| 4 | `fcd94bf` | 扩展对话框标题保留换行（对齐 pi TUI） | `M components/ChatWindow.extension-request.test.mjs`, `M components/ChatWindow.tsx` |
| 5 | `e5a2434` | `next`/`eslint-config-next` 16.3.1 → 16.3.5；`images: { unoptimized: true }` 关闭 `/_next/image`（GHSA-2xp9-vwfh-vxw4 / GHSA-p293-qw3h-jr36） | `M next.config.ts`, `M package-lock.json`, `M package.json` |
| 6 | `ed0eea9` | 扩展下拉键盘选中项加 `scroll-margin`，focus ring 不被 overflow 裁切 | `M components/ChatWindow.tsx` |
| 7 | `20ad98b` | `lib/auth-throttle.ts`：`POST /api/web-auth` 全局指数退避（1s 翻倍至 60s，成功或闲置 5 分钟重置），429 + `Retry-After`，登录页展示等待 | `M AGENTS.md`, `M app/api/web-auth/route.test.mjs`, `M app/api/web-auth/route.ts`, `M app/login/page.tsx`, `A lib/auth-throttle.test.mjs`, `A lib/auth-throttle.ts`, `M lib/i18n/messages/{en,zh-CN,zh-TW}.ts` |
| 8 | `744ee93` | worktree：`git()` 超时可配置（`worktree add` 5 分钟）；新分支优先从 `refs/remotes/origin/<branch>` 起，缺失回落 HEAD；显式不 fetch | `M lib/worktree.ts` |
| 9 | `860698a` | 扩展 widget 字号跟随聊天字号（PR 内撤销独立设置项后的最终版） | `M app/globals.css` |

`860698a` 的实际 diff（唯一一行）：

```diff
--- a/app/globals.css
+++ b/app/globals.css
@@ -620,7 +620,7 @@ button.extension-widget-trigger:focus-visible {
-  font-size: 14px;
+  font-size: calc(14px + var(--chat-font-size-offset, 0px));
```

## 3. 文件交集与合并预演

```
$ comm -12 <(git diff --name-only 8366762..origin/personal | sort) \
           <(git diff --name-only 8366762..upstream/main | sort)
AGENTS.md
app/globals.css
components/ChatWindow.tsx
lib/i18n/messages/en.ts
lib/i18n/messages/zh-CN.ts
lib/i18n/messages/zh-TW.ts
lib/worktree.ts
package.json
package-lock.json

$ git merge-tree --write-tree --name-only origin/personal upstream/main
feb9782c7e1dac7630e8795af5682e9ec4955351
components/ChatWindow.tsx
Auto-merging AGENTS.md
Auto-merging app/globals.css
Auto-merging components/ChatWindow.tsx
CONFLICT (content): Merge conflict in components/ChatWindow.tsx
Auto-merging lib/i18n/messages/en.ts
Auto-merging lib/i18n/messages/zh-CN.ts
Auto-merging lib/i18n/messages/zh-TW.ts
Auto-merging lib/worktree.ts
Auto-merging package-lock.json
Auto-merging package.json
```

唯一文本冲突在 `components/ChatWindow.tsx`，冲突标记位于该文件的 1351–1403 行
（`<<<<<<< origin/personal` 在 1351，`=======` 在 1385，`>>>>>>> upstream/main` 在 1403）。
冲突本质是同一个 JSX 块被两侧同时改：

- **personal 侧**：为把 ask_user 卡片放进空会话消息列，把品牌区从
  `<div className="relative shrink-0">` 包装层里提出来，并在其后插入 `{askUserCardInColumn}`；
  品牌区保留 `π` 文字 logo 与 `mx-auto w-full + maxWidth` 外层。
- **upstream 侧**：品牌区留在 `relative shrink-0` 内，内容改为
  `<Image src="/icons/apple-touch-icon.png" width={32} height={32} alt="" priority />`，
  外层改 `mb-3 w-full + padding 16/(16|52)`，`maxWidth + margin: 0 auto` 下移到 flex 行。

## 4. 自动合并部分的语义核对

```
$ git show <merged>:app/globals.css | grep -n 'chat-font-size-offset|extension-widget-content'
652: .extension-widget-content {
657:   font-size: calc(14px + var(--chat-font-size-offset, 0px));
700:   --chat-font-size-offset: calc(var(--chat-content-font-size, 14px) - 14px);
710:   font-size: calc(14px + var(--chat-font-size-offset, 0px));
834:   font-size: calc(13px + var(--chat-font-size-offset, 0px));
```

personal 早已落地 `--chat-font-size-offset`（来自聊天字号功能），因此 `860698a`
不需要任何额外改动即语义成立：消息正文、代码块、扩展 widget 共用同一 offset。

```
$ git diff 8366762..origin/personal -- lib/worktree.ts
+clearCachedProjectsOnDisk        # personal：10 分钟 TTL + 磁盘项目缓存失效
-const PROJECT_CACHE_TTL_MS = 60_000;
+const PROJECT_CACHE_TTL_MS = 600_000;

$ git show <merged>:lib/worktree.ts | grep -n 'timeoutMs|WORKTREE_TIMEOUT|refs/remotes/origin'
57: async function git(cwd, args, timeoutMs = 10_000)
59:   timeout: timeoutMs
214: // already-fetched remote tip when available, else local HEAD). We do not
230: // New branch: prefer the remote-tracking tip (refs/remotes/origin/<branch>)
234: await git(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${trimmed}`]);
235: startFrom = `refs/remotes/origin/${trimmed}`;
（WORKTREE_TIMEOUT = 5 * 60_000 定义在使用处，见 `addWorktree` 内）
```

personal 的缓存改动与上游的超时/起点改动正交，合并结果同时保留，未发现语义叠加问题。

```
$ git show <merged>:components/ChatWindow.tsx | grep -n 'next/image|askUserCardInColumn'
3:   import Image from "next/image";
925: const askUserCardInColumn = isEmptyNew && askUserCardElement ? (
1408: {askUserCardInColumn}
```

即：`next/image` 导入自动合入（personal 未动 import 区），personal 的
`askUserCardInColumn` 结构保留。personal 的该包装已是
`padding: 0 16px 12px; paddingRight: isMobile ? 16 : 52`（注释注明 "same padding as ChatInput"），
与上游品牌区新 padding 完全一致 —— 采用上游新布局不会破坏列对齐。

```
$ git show <merged>:next.config.ts | grep -n images
18: images: { unoptimized: true },

$ git diff 8366762..origin/personal -- next.config.ts      # 空输出
```

personal 未改过 `next.config.ts`，`images.unoptimized` 干净落入。

```
$ git diff <merged> upstream/main --stat | tail
lib/worktree.ts        |   7 +-
package-lock.json      |  22 +-
package.json           |  24 +-
pnpm-lock.yaml         | 8016 ----
...（其余全部是 personal 独有文件）330 files changed

$ git diff <merged> upstream/main -- package-lock.json | head
-  "name": "@xup3ng/pi-web", "version": "0.9.2"    # 合并结果（personal）
+  "name": "@agegr/pi-web", "version": "0.9.1"     # 上游
   少数 "peer": true 标记差异（personal 曾用 npm 重生成过锁）
```

合并结果与上游的差异全部是 personal 自有内容；`package-lock.json` 的合并后差异
只涉及 fork 包名/版本与 `peer` 标记，未出现 next 相关条目丢失。

## 5. 依赖与锁现状

```
$ node -v; npm -v; pnpm -v
v26.1.0 / 11.13.0 / 10.33.0

$ node -p "require('./node_modules/next/package.json').version"
16.3.1

$ node -p "require('./package.json').version" ; git show HEAD:package.json | grep '"version"'
0.9.2 / 0.9.2

$ grep -n 'next@16.3\|eslint-config-next@16.3' pnpm-lock.yaml | head
2016: eslint-config-next@16.3.1:
2990: next@16.3.1:
```

两个锁文件都被 personal 跟踪（`git ls-tree origin/personal` 列出
`package-lock.json` 与 `pnpm-lock.yaml`）。pnpm 锁**确实被使用**：
`.github/workflows/release-personal.yml` 用 `pnpm/action-setup@v4`（version 10）+
`pnpm install --frozen-lockfile` 构建 GitHub Release 产物，Node 22。
本机 `pnpm` = 10.33.0 可用。

### 5.1 pnpm 锁同步方式的隔离探针（在 /tmp 副本上实测，不触碰仓库）

把 `package.json`（`next`/`eslint-config-next` 改为 16.3.5）与仓库 `pnpm-lock.yaml`
复制到 `/tmp/pnpmprobe` 后分别实测三条路径：

| 命令 | 结果 |
|------|------|
| `pnpm update next eslint-config-next --lockfile-only --no-save` | 退出 0，但**大量无关漂移**：`@typescript-eslint/*` 8.68.0→8.70.0、`zod` 4.4.3→4.6.5、`@napi-rs/wasm-runtime` 1.2.3→1.2.4、`@tybys/wasm-util` 0.10.3→0.10.4 …（`--depth`/`--no-save` 都无法阻止范围型依赖被重新解析） |
| `pnpm install --lockfile-only`（默认 highest 解析） | 同类无关漂移 |
| `pnpm install --lockfile-only --config.resolutionMode=time-based` | 退出 0，**只有 next 家族变化**；结构化比对（按 block key）结果：新增 block 全部是 `next@16.3.5` / `eslint-config-next@16.3.5` / `@next/env` / `@next/eslint-plugin-next` / `@next/swc-*`，移除 block 全部是对应 16.3.1；内容变化的 block 只有根 `.`（importer 的 specifier/version）。文件末尾新增 `time: {}`，`lockfileVersion` 仍为 `'9.0'` |

结论：D4 的 pnpm 同步采用 **`pnpm install --lockfile-only --config.resolutionMode=time-based`**，
它是三条路径里唯一不引入无关依赖漂移的。`time: {}` 是 pnpm 10 写出的常规字段，
CI 同为 pnpm 10，兼容。

## 6. 发布相关事实（D3 = bump_publish）

```
$ npm view @xup3ng/pi-web version dist-tags --json
{ "version": "0.9.3", "dist-tags": { "latest": "0.9.3" } }

$ npm whoami
npm error 401 Unauthorized - GET https://registry.npmjs.org/-/whoami

$ df -h ~ | tail -1
/dev/sda2  98G  29G  65G  31% /
```

- registry 上 latest 已是 **0.9.3**，本地 `package.json` 仍是 **0.9.2**
  （09-13 任务明确未提交 bump），因此本次发布目标是 **0.9.4**，本地 git 会跨过 0.9.3。
- 当前 npm 会话**未认证（401）**，真实 publish 前必须由用户重新登录并完成 2FA。
- 09-13 的隔离发布目录 `../.pi-web-v093-release-20260913` 仍存在，含可复用件：
  `env.sh`（隔离 HOME/XDG/npm cache/registry 锁定）与 `check-run.py`
  （`python3 check-run.py <name> <cwd> <cmd...>`，把 exit code 与元数据写成
  `check/<name>.{log,json}`）。本次应新建独立 release root，不复用其 state。

## 7. 未验证项（本次调研未覆盖）

- 合并结果**未做过**任何编译/类型检查/测试；`merge-tree` 只证明无文本冲突。
- 未在真实浏览器验证品牌区新布局、扩展下拉 `scroll-margin`、对话框标题换行。
- 未验证 `images.unoptimized` 对静态 logo 之外资源的实际影响（上游结论仅基于
  "next/image 只用于静态 logo"）。
- 未验证 auth 限流在真实多标签/多客户端下的表现。
- 未生成/审计任何 tgz，未做隔离 build。
