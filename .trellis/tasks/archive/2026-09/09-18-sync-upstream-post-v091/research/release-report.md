# 发布报告：@xup3ng/pi-web 0.9.4（2026-09-18）

> 状态：**B2–B12 已全部完成**。B9 真实 publish 由用户在自己的终端执行并成功
> （2026-09-18 21:47:53 CST，`PUT 202` → 21:53:41 CST 在 registry 可见），B10 有界核验全部通过，
> B11 本地 bump 提交已完成（`57924e3`）。
> 所有命令、退出码、日志都在隔离 release root 内，未触碰主 checkout 的业务代码。

## 1. 版本语义

- registry `latest` 实测 = **0.9.3**；`@xup3ng/pi-web@0.9.4` 实测 **E404**（版本号可用）。
- 本地 `package.json` 是 0.9.2（09-13 发布 0.9.3 时未提交 bump，见 `prd.md` V1）。
- 本次发布 0.9.4，本地 git 版本序列**跨过 0.9.3**：bump 提交信息与本文都显式记录这一事实。

## 2. 源码来源（冻结提交）

| 名称 | 值 | 说明 |
|------|-----|------|
| `H_merge` | `b92d4b7f7a5de61bd0c9f9b996b778b1346684e5` | A7 冻结提交（merge + 锁 + 任务记录） |
| `H_release` | `ee672d7e2a305592e44569d55669dec34fb39c29` | 本次导出用的 HEAD（比 `H_merge` 多 docs/spec 提交） |
| 树 hash | `2d004dffcde2f4d12aaf0cf3196963385f9a9b2b` | `H_release^{tree}`，写入 `evidence/H-tree.txt` |
| 导出方式 | `git archive H_release \| tar -x -C src/` | 787 个文件，无 `.git` |

发布的 `files` 白名单是 `bin`、`.next`（排除 cache/dev/js.map）、`public`、`next.config.ts`、
`package.json` —— 因此 `H_release` 相对 `H_merge` 多出的 docs/spec/任务记录**不在产物内**。

### 2.1 计划缺口与处置（重要偏差记录）

`implement.md` 的 B 段**缺少"打包前置版本号"步骤**：若直接从 `H` 的源码 `npm pack`，产物仍是
`0.9.4`? ——不能，源码里是 `0.9.2`。处置：在**隔离 `src/` 内**先执行
`npm version 0.9.4 --no-git-tag-version`（`b2b-npm-version`，exit 0），只改
`package.json`（1 行）与 `package-lock.json`（2 行）；`pnpm-lock.yaml` **没有版本字段**
（实测 0 行差异），所以 B11 的"三处 0.9.2 → 0.9.4"实际只会改动 2 个文件。
主 checkout 至今未做任何 bump。

## 3. 隔离 release root

```
ROOT=/home/xupeng/dev/personal/forked/.pi-web-v094-release-20260918-182408
├── env.sh          # 私有 HOME/XDG/PI_CODING_AGENT_DIR/TMPDIR/npm-cache/userconfig；registry 锁 npmjs
├── npmrc           # registry=https://registry.npmjs.org/（无任何凭据）
├── check-run.py    # 运行命令并记录 exit/duration/cwd/registry/home → check/*.json + logs/*.log
├── smoke.sh        # B6 生产安装 smoke（HTTP + fixture API + node-pty 终端 + 清理断言）
├── src/            # 从 H_release 导出（787 文件）
├── install/        # 生产安装前缀（npm install -g --prefix）
├── fixture/demo/   # 独立 git fixture（非 linked worktree）
├── artifacts/      # 唯一 tgz + SHA256SUMS + SHA512.b64 + filelist.txt
├── evidence/       # H.txt / H-tree.txt / b6-index.html / b6-smoke.txt / smoke-port.txt
├── logs/ check/    # 每步日志与 JSON 记录
```

隔离要点：`HOME`、`XDG_*`、`PI_CODING_AGENT_DIR`、`TMPDIR`、`NPM_CONFIG_CACHE`、
`NPM_CONFIG_USERCONFIG` 全部指向 `$ROOT`；显式 `unset NPM_TOKEN/NODE_AUTH_TOKEN/NODE_OPTIONS/代理`；
未读取任何真实凭据、会话、设置。主 checkout 的 `.next` 与 `node_modules` 未被本阶段使用。

## 4. 执行记录（B2–B7）

| 步骤 | 命令 | 退出码 | 关键输出 |
|------|------|--------|----------|
| B2 | `git archive ee672d7 \| tar -x -C src/` | 0 | 787 文件，无 `.git` |
| B2b | `npm version 0.9.4 --no-git-tag-version`（在 src） | 0 | `package.json` 0.9.4、`package-lock` 0.9.4 |
| B3 | `npm ci --cache $ROOT/npm-cache` | 0 | `added 937 packages in 56s`；锁未被修改（仅版本行） |
| B4 | `TURBOPACK= npm run build`（=`next build --webpack`） | 0 | 190s；`.next` 产物含 `/login` 静态页 |
| B5 | `npm pack` | 0 | 唯一 `xup3ng-pi-web-0.9.4.tgz` |
| B6 | `npm install -g --prefix $ROOT/install <tgz>` | 0 | `added 361 packages in 60s`，安装版本 0.9.4 |
| B6 | `bash smoke.sh 46885` | 0 | 全部探测 200（见 §6），端口与进程清理干净 |
| B7 | `npm publish --dry-run <tgz> --registry=… --tag=latest --access=public` | 0 | `@xup3ng/pi-web@0.9.4`，`total files: 703` |

## 5. 产物审计（B5）

| 项 | 值 |
|----|-----|
| 文件 | `artifacts/xup3ng-pi-web-0.9.4.tgz`（唯一 tgz） |
| SHA256 | `eb6bb81cea02bf278caa727f55f51015e65bafe784b3e8a950b1ce0ed4a551f1` |
| SHA512(SRI) | `sha512-WX+LIbwPxXCMnTZlK1xirhq9JZnU5UX4QugcoZ2J/X801ba+PCh7lqXpQRxiJKVe4APe4b1DOunaehLoEzwXmw==` |
| sha1(shasum) | `2229931fff28561aace0903206174f453afd972d`（由 B7 dry-run 打印，与本地一致） |
| 条目数 | 703（`tar -tzf` 与 dry-run 的 `total files` 一致） |
| 内含版本 | `@xup3ng/pi-web 0.9.4` |

审计结论（全部通过）：

- 无 `.git` / `.pi` / `.trellis` / `.env` / `.npmrc` / 凭据 / 真实会话与附件；
  无 `/home/xupeng`、`/Users/` 等主目录绝对路径；无绝对路径条目、无 `..` traversal。
- **无 symlink 条目**；未包含 `.next/cache`、`.next/dev`（白名单排除项 0 命中）。
- 关键文件在位：`package/package.json`、`package/bin/pi-web.js`、`package/next.config.ts`、
  `package/public/icons/apple-touch-icon.png`、`.next/BUILD_ID`、315 个 server 与 217 个 static 条目。

## 6. B6 生产安装 smoke（`evidence/b6-smoke.txt`）

安装版 0.9.4（`next-server` 由 `$ROOT/install/lib/node_modules/@xup3ng/pi-web` 提供），
端口动态分配 **46885**，cwd = fixture 项目：

| 探测 | 结果 |
|------|------|
| `GET /`、`/login`、`/manifest.webmanifest` | 200（11663 / 11663 / 442 B） |
| 页面 HTML 引用的 4 个 `/_next/static/chunks/*.js` | 全部 200（98KB/241KB/201KB/15.7KB） |
| `/api/home`、`/api/projects`、`/api/agent/running`、`/api/tools/settings`、`/api/subagents/settings` | 200 |
| `POST /api/cwd/validate`（fixture） | `{"success":true,...}` |
| `/api/models?cwd=fixture` | 200（18622 B，真实模型列表） |
| `/api/skills`、`/api/plugins`、`/api/files...?type=read`、`/api/files...?type=list` | 200 |
| `/api/worktrees?cwd=fixture` | `isGit:true`、`isTopLevel:true` |
| `POST /api/terminal`（node-pty，32-hex id）→ `GET` → `DELETE` | id 返回 / 200 / 200 |
| 清理 | 端口 1 秒内释放，残留监听 0，残留安装版进程 0 |

探测过程中的两个**非缺陷**现象，如实记录以免误判：

1. 第一次（服务器刚启动）静态 CSS 曾返回一次 404，随后同一文件稳定 200；
   复核 4 个 CSS 与 4 个 chunk 全部 200，属冷启动瞬时现象。
2. 首版脚本在 `POST /api/cwd/validate` **之前**请求 `/api/models`、`/api/skills`、`/api/plugins`，
   得到 403 `Access denied`——这些路由要求 `?cwd=` 且该 cwd 已通过 validate 注册为允许根；
   调整顺序后全部 200。`GET /api/default-cwd` 的 405 同理：该路由是 POST-only。

## 7. B8 门禁（现已全部满足）

| 检查 | 结果 |
|------|------|
| `H_release`/树 hash/`tgz` SHA256+SHA512 已记录 | ✅ |
| B3–B7 全绿（退出码 0） | ✅ |
| `npm view @xup3ng/pi-web@0.9.4 version` | ✅ E404（发布前版本可用） |
| registry `latest` | ✅ 0.9.3（发布前） |
| `npm whoami --registry=https://registry.npmjs.org/` | ✅ `xup3ng`（用户于发布前重新登录） |
| 用户对真实 publish 的单独批准 | ✅ 明确批准 |

## 8. B9 真实发布

### 8.1 第一次尝试（agent 侧）：EOTP，未发布

```
$ npm publish artifacts/xup3ng-pi-web-0.9.4.tgz --registry=… --tag=latest --access=public
npm error code EOTP / This operation requires a one-time password.        → exit 1
```

在写入 registry 之前就退出：随后实测 `@xup3ng/pi-web@0.9.4` 仍 E404、`latest` 仍 0.9.3，
确认**没有任何不可逆后果**。按仓库约束（凭据/OTP 不入日志），改由用户在**自己的终端**执行发布。

### 8.2 用户终端执行（21:47:53 CST）：成功

用户执行 `bash <ROOT>/b9-publish.sh`（脚本先校验 tgz SHA256 与审计值一致，再发布**同一个 tgz**，
不重新打包、不重新构建）。npm 调试日志
`~/.npm/_logs/2026-09-18T13_47_53_808Z-debug-0.log` 关键行：

```
21 notice version: 0.9.4
25 notice shasum: 2229931fff28561aace0903206174f453afd972d
26 notice integrity: sha512-WX+LIbwPxXCMn[...]unaehLoEzwXmw==
27 notice total files: 703
30 notice Publishing to https://registry.npmjs.org/ with tag latest and public access
31 http fetch PUT 401 https://registry.npmjs.org/@xup3ng%2fpi-web 2903ms
32 verbose web auth opening url pair
33-40 http fetch GET 202/200 https://registry.npmjs.org/-/v1/done?authId=***
42 notice Your package is being processed and may take a few minutes to become available.
43 http fetch PUT 202 https://registry.npmjs.org/@xup3ng%2fpi-web 5169ms
48 verbose exit 0
49 info ok
```

即走的是 **web 授权 + 2FA** 流程（401 → 浏览器授权 → `PUT 202` 受理），退出码 0。

### 8.3 传播延迟造成的"假失败"（如实记录）

受理后约 6 分钟内，`npm view` 与原始 registry API 都返回 404 / `version not found`；
用户在此期间尝试 `mise use -g npm:@xup3ng/pi-web@0.9.4` 失败
（`aube install failed: no version of @xup3ng/pi-web matches 0.9.4`）。
这不是发布失败：`0.9.4` 于 **2026-09-18T13:53:41.691Z（21:53:41 CST）** 出现在 registry 上。
教训：web/2FA 授权的 `npm publish` 在 `PUT 202` 之后必须以 registry 实测可见为准，
可见前不得判定失败、也不得重发（R7）。

## 9. B10 有界核验（全部通过）

轮询：21:48:54–21:53:43，第 2 轮（21:53:43）首次可见，总计约 5 分钟 < 10 分钟上限。

| 检查 | 期望 | 实测 |
|------|------|------|
| `@xup3ng/pi-web@0.9.4` 版本 | 0.9.4 | ✅ 0.9.4 |
| `dist-tags.latest` | 0.9.4 | ✅ `{"latest": "0.9.4"}` |
| `versions` | 含 0.9.4 | ✅ `0.9.0,0.9.1,0.9.2,0.9.3,0.9.4` |
| 发布时间 | — | `2026-09-18T13:53:41.691Z` |
| maintainers | xup3ng | ✅ `['xup3ng']` |
| `dist.integrity` | `sha512-WX+LIbwPxXCMn…EzwXmw==` | ✅ 与本地审计值逐字相同 |
| `dist.shasum` | `2229931f…d972d` | ✅ 与 B5/B7 一致 |
| `dist.fileCount` / `unpackedSize` | 703 / 33807514 | ✅ 与审计一致 |
| 下载远端 tarball 的 SHA256 | `eb6bb81c…a551f1` | ✅ 相同 |
| 远端 tarball vs 本地审计产物 | 逐字节相同 | ✅ `cmp` 无差异 |

## 10. B11 本地 bump 提交

```
$ git log --oneline -1
57924e3 chore: release 0.9.4
$ git show --stat --oneline 57924e3
 package-lock.json | 2 +-
 package.json      | 1 +
 2 files changed, 3 insertions(+), 3 deletions(-)
```

- 逐行 diff 确认只改版本号（`package.json` 的 `version`、`package-lock.json` 的根与
  `packages[""]` 版本）；`pnpm-lock.yaml` 未变（无版本字段）。
- 提交信息写明"registry 0.9.3 已由 09-13 发布但本地从未提交 bump，故本地历史跨过 0.9.3"，
  并附 tgz SHA256 与远端 SHA512 SRI。
- 未 push、未打 tag、未建 GitHub Release；用户 3 个 `.pi/agents/trellis-*.md` 与另一会话的
  `components/AskUserCard{,.test}.mjs` 仍未提交，且未进入任何本次提交。

## 11. 计划偏差与遗留

1. **B 段缺"打包前 bump"步骤**（见 §2.1）：已在隔离 `src/` 内用 `npm version` 补齐，
   主 checkout 的 bump 按原计划留在发布成功后（B11）。
2. **B11 的"三处 0.9.2 → 0.9.4"实际只两处**：`pnpm-lock.yaml` 不含版本字段。
3. **发布由用户执行**（`b9-publish.sh`）：因 2FA 的 OTP 不应进入任何日志；脚本固定了产物路径
   与 SHA256 期望值，可复核。
4. 隔离 release root 与其中间产物（`src/`、`install/`、`node_modules`）仍在磁盘上，
   约 2–3 GB，保留供复核；如需回收可整目录删除。

## 12. 未覆盖项

- 未跑 `e2e/run.mjs`、未做浏览器交互 smoke（D5 深度不含）：品牌区新布局的真实渲染、
  字号滑块对扩展 widget 的视觉效果、auth 限流在真实多标签下的行为均未覆盖。
- B6 smoke 覆盖的是 HTTP/API 层与 node-pty 终端创建，**未**覆盖真实 LLM 会话
  （隔离 HOME 无任何 provider 凭据，属设计使然）。
- 主 checkout 的 dev server（8505）在 A 阶段尾声已用 next 16.3.5 重启并冒烟通过；
  它与本次发布产物无关。

## 13. 清理记录（2026-09-18，发布核验完成后）

用户确认发布成功后执行清理。**删除**：

- 隔离 release root `/home/xupeng/dev/personal/forked/.pi-web-v094-release-20260918-182408`
  （3.5 GB：`src/`、`node_modules/`、`install/`、`artifacts/`、`evidence/`、`logs/`、`check/`）。
- `/tmp` 中本次产生的中间文件（`pl-before.json`、`pnpm-before.yaml`、`npm-install.log`、
  `baseline-*.txt/log`、`merged-*.txt`、`candidate-*.txt/log`、`focused.txt`、
  `pi-release-root.txt`、`pi-web-merge-msg.txt`、`ecn1631/`、`pnpmprobe/`）。

**保留（提取为小体积证据）**：`research/evidence/`（240 KB）

- `evidence/`：`H.txt`、`H-tree.txt`、`SHA256SUMS`、`SHA512.b64`、`filelist.txt`（703 条目清单）、
  `b6-smoke.txt`（生产安装 smoke 原始输出）、`remote-0.9.4.json`（远端元数据）、`smoke-port.txt`；
  以及可复现脚本 `env.sh`、`check-run.py`、`smoke.sh`、`b9-publish.sh`。
- `check/`：`b2b`…`b7` 六步的退出码/耗时 JSON 记录。
- `logs/`：`b3-npm-ci`、`b4-build`、`b5-pack`、`b6-install`、`b6-smoke-server`、`b7-publish-dry-run`。
- 已扫描确认不包含 token / `_auth` / password / OTP 等敏感字段（唯一命中是 `b9-publish.sh`
  注释里的 "2FA one-time password" 字样）。

**产物来源不变**：`@xup3ng/pi-web@0.9.4` 以 registry 为准，可随时重新下载；
清理后复核 `npm view @xup3ng/pi-web@0.9.4 dist.tarball dist.integrity` 仍返回
`https://registry.npmjs.org/@xup3ng/pi-web/-/pi-web-0.9.4.tgz` 与
`sha512-WX+LIbwPxXCMn…EzwXmw==`（与 §5/§9 记录一致）。

**其它清理**：`git worktree prune -v` 移除了 3 条目录已不存在的陈旧 worktree 元数据
（`baseline`、`candidate`、`pi-web-0.9.2-verify`，均来自更早的任务），
现在 `git worktree list` 只剩主 checkout。

**未触碰**：3 个 `.pi/agents/trellis-*.md`（用户未提交改动）、`.trellis/tasks/09-13-npm-patch-release/`、
`../.pi-web-v093-release-20260913/`（09-13 任务的 release root）与 8505 dev server 的日志。
因此本文中出现的 `<ROOT>/…` 路径引用仅为历史记录，磁盘上已不存在。

## 14. 勘误（2026-09-19 追加）：B5 的"许可文件"子项未核实，实际不通过

`implement.md` 的 B5 要求：内容审计"含 `package.json`/`bin`/`next.config.ts`/**字体与许可文件**"。
本文 §5 只核对了 `package.json`、`bin`、`next.config.ts` 与一个 `public` 图标，
**没有核对许可文件**，因此当时"B5 审计通过"的结论对该子项不成立。事后核实：

- 已发布的 **0.9.3** tarball 含 `package/public/fonts/LICENSE-cascadia-code.txt`（4395 B，
  SIL OFL 1.1 全文）与 `package/public/fonts/NOTICE.txt`（1477 B，四个 woff2 的来源与 SHA-256）。
- 本任务 **0.9.4** 的 tgz（§5 的 703 条清单）与主仓库 `public/fonts/` 只有 4 个 woff2，
  **没有**这两个文件；`git log --all -- public/fonts/LICENSE-cascadia-code.txt
  public/fonts/NOTICE.txt` 为空 → 它们**从未进入仓库历史**。
- 成因：这两个文件是 09-13 任务在**隔离 src** 内补充的（其 check-report 的本地提交 allowlist
  第 3、4 项），从未同步回主仓库；0.9.4 从主 HEAD 构建，于是丢失。
- `NOTICE.txt` 声明的 4 个 woff2 SHA-256 与当前仓库文件 **4/4 一致**，说明该 NOTICE 对当前字体仍准确；
  两个文件可从 registry 的 0.9.3 tarball 无损恢复（09-13 release root 删除前已记录其 hash）。

影响：`@xup3ng/pi-web@0.9.4` 在分发 OFL 授权的 Cascadia Code 字体时**缺少许可证文本**，
相对 0.9.3 属于合规回退。功能无影响。处置由后续决定驱动（恢复文件并提交 / 是否发 0.9.5）。

教训（与 §11 同类）：审计清单里的每一项都要有**逐项证据**；
"关键文件在位"这类概括性结论容易把未检查的子项一起算作通过。
