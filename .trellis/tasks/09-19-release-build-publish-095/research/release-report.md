# 发布报告：@xup3ng/pi-web 0.9.5

> 状态：**B1–B7 已完成并全绿；B8 批准门待用户决策**。真实 `npm publish`（B9）尚未执行。
> 所有命令都在隔离 release root 内，主 checkout 未被 build/install 触碰。

## 0. 结论摘要

| 项 | 值 |
|---|---|
| 版本 | `0.9.5`（patch） |
| 源码基线 `H` | `e47ac5692d524e533c3a64d434b41b409fdf4bee`（`personal` HEAD） |
| `H` 树 hash | `10e6fef6609bb6593b0eccd212ad4eccf2151c3d`（见 `evidence/H-tree.txt`，已与 `git rev-parse HEAD^{tree}` 复核一致） |
| 代码基线等价证明 | `git diff --name-only fc2323e..H -- bin public next.config.ts package.json package-lock.json pnpm-lock.yaml` = **空** |
| 隔离 root | `/home/xupeng/dev/personal/forked/.pi-web-v095-release-20260919-220023` |
| BUILD_ID | `sDkZvINGJKQuzWOOBAf0c` |
| tgz | `artifacts/xup3ng-pi-web-0.9.5.tgz`，6,092,922 B，**706 条目** |
| tgz sha256 | `19f52aafb5b279773e9cfad0b7c51711b63fb06885b10285cde48d67937b75b8` |
| tgz SRI | `sha512-EnTszgQwUntXZAf5+oIY7cRpAhMQJAg3zeCQRt7qFb9mkeeKdXRc0Pue32GUED2HE+P4oQ6JIlm4mvgu7x2RSQ==` |
| unpackedSize | 33,871,076 B |
| **字体许可** | ✅ 两文件在 tgz 内（AC4 达成，见 §4） |
| registry 前置 | `0.9.5` **仍 E404**；`latest` = `0.9.4`；`npm whoami` = **E401（需用户重新登录）** |

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
- **已知披露项**：`.next` 产物内嵌隔离构建路径 `$ROOT/src`（122 处，形态为
  `a.exports=d(".../src/node_modules/next/dist/...")` 的模块解析路径）。
  与 0.9.2/0.9.3/0.9.4 同类行为，运行不依赖该路径存在，属可接受项。

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

## 6. B8 批准门（待用户决策）

真实发布（B9）由用户在**自己终端**执行，因为需要 2FA/OTP：

```bash
bash /home/xupeng/dev/personal/forked/.pi-web-v095-release-20260919-220023/b9-publish.sh
```

该脚本先 `sha256sum -c` 校验上述 sha256，再 `exec npm publish` **同一个** tgz
（不重新构建、不重新打包）。脚本自检已通过（`...tgz: OK`）。

发布前置（用户侧）：`npm whoami` 当前 **E401**，需先在终端 `npm login`。

## 7. 待办（B9–B12）

- [ ] B9 用户执行 `b9-publish.sh`，agent 只记录脱敏回执
- [ ] B10 有界核验（≤10 分钟）：version / latest / integrity / shasum / fileCount 与本地逐字一致
- [ ] B11 主 checkout bump 提交（仅 `package.json`/`package-lock.json`）+ `git push origin personal`
- [ ] B12 回填本报告的发布回执、核验对照、push 结果与未覆盖项

## 8. 未覆盖项与残余风险

- **UI 交互层未经真实浏览器验证**：按用户决定本次不跑 `npm run test:e2e`；可拖拽侧栏、
  PDF `#page=` 链接、markdown 图片预览、文件面板全宽切换只有单测与类型检查覆盖。
  上游新增的 `e2e/file-panel.mjs`、`e2e/pdf-page-fragment.mjs` 亦未执行。
- **node 版本偏差**：本机 `v26.1.0`，`engines`/CI 参照 22.19.0；未做低版本验证。
- **构建路径内嵌**：见 §3 已知披露项。
- **未验证 Windows**：本仓库有 Windows 相关修复（npm.cmd shim、路径分隔符），本次未在 Windows 验证。
