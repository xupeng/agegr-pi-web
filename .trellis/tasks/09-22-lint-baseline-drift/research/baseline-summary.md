# lint 基线复核结果（2026-09-22）

## 结论一句话

现 checkout 的 14 条 `react-hooks/preserve-manual-memoization` 是**混合依赖树产物**，
不是源码状态：同一份源码用 `npm ci` 的干净树复跑为 **0 error / 0 warning**。

## 实测矩阵

| # | 树 | ref | 安装方式 | eslint 文件数 | error | warning | react-hooks 插件 |
|---|---|---|---|---|---|---|---|
| A | 工作 checkout | `personal@5402a5f` | pnpm 后又被 npm 写入 | 495 | **14** | 0 | 7.1.1 |
| B | 隔离 worktree | `personal@5402a5f` | `npm ci` | 495 | **0** | 0 | 7.0.1 |
| C | 隔离 worktree | `main@d11d344` | `npm ci` | 433 | **0** | 0 | 7.0.1 |

A 与 B 的文件覆盖数完全相同（495），规则严重级别均为 `[2]`（error），唯一差异是插件版本。

## 三件套退出码

| 树 | `npm ci` | `tsc --noEmit` | `npm run lint` | `npm test` |
|---|---|---|---|---|
| B `personal@5402a5f` | 0 | 0 | 0（495 文件 / 0 error / 0 warning） | 0（1411 pass / 0 fail，10 suites） |
| C `main@d11d344` | 0 | 0 | 0（433 文件 / 0 error / 0 warning） | 0（1085 pass / 0 fail，10 suites） |

两棵干净树上 `react` / `react-dom` / `eslint` / `next` / `eslint-config-next` 的
lock 与 installed 版本逐项 `ok`（无 DRIFT），确认 `npm ci` 真的把树对齐到了锁文件。

## 14 条的位置（现 checkout）

```
components/ChatInput.tsx      940:41  992:40  1445:41  1486:7  1489:5  1622:81  1622:93
components/ChatMinimap.tsx    308:36  318:36  440:36   456:41  500:39
components/SessionSidebar.tsx 1195:44 1223:30
```

## 为什么会这样

1. fork 同时跟踪 `package-lock.json`（插件 7.0.1，上游 CI 用）与 `pnpm-lock.yaml`
   （插件 7.1.1，fork 自有的 `release-personal.yml` 只 build 不 lint）。
2. 同一个 `node_modules` 被 pnpm 和 npm 先后写过，生效版本由最后一次写入决定。
3. 现树 `.pnpm/`（759 项）+ `.ignored/`（27 项）+ `.package-lock.json` 并存，
   生效插件是 `.pnpm/eslint-plugin-react-hooks@7.1.1_.../`，而 `package-lock.json`
   期望的 `eslint-config-next/node_modules/eslint-plugin-react-hooks@7.0.1` 不在现树中。

## 复跑方式

```bash
.trellis/tasks/09-22-lint-baseline-drift/research/clean-tree-verify.sh <git-ref> <label>
# worktree: /home/xupeng/dev/personal/forked/pi-web-lintclean-<label>
# log:      .trellis/tasks/09-22-lint-baseline-drift/research/clean-tree-<label>.log
```

worktree 刻意建在仓库同级的普通目录，不落 `/tmp`（本机 `/tmp` 是 2 GiB tmpfs）。

## 关键补充：pnpm 树从干净安装同样复现 14 条

只做 npm 侧复核会得出"这是旧树污染"的结论，但那是错的。用 `pnpm-lock.yaml` 干净安装
（worktree `pi-web-lintclean-pnpm`，commit `5402a5f`，命令
`CI=true npx --yes pnpm@10 install --frozen-lockfile`，即 `release-personal.yml:25` 钉的 pnpm 10）：

```
Done in 22s using pnpm v10.34.5
pnpm-tree files= 495 errors= 14
{ 'ChatInput.tsx': 7, 'ChatMinimap.tsx': 5, 'SessionSidebar.tsx': 2 }
```

⇒ 驱动变量是**用哪个 lockfile 装**，混合树只是它的一种表现形式。原 spec 的"旧树污染"归因
因此不完整，需要修正（见 prd R5）。

夹具注意事项：

- 本机 pnpm 12.5.1 会因 `ERR_PNPM_IGNORED_BUILDS`（未批准的 build scripts）退出 1，
  非 TTY 下还会因 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 直接中止；
  夹具统一用 `CI=true npx --yes pnpm@10 install --frozen-lockfile`。
- 夹具的 `node_modules` 不随 `git checkout` 变化，因此迭代时可直接在夹具里切到任务分支复跑 lint。
