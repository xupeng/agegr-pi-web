# 0.9.3 历史准备报告（旧产物 superseded，未 publish/未 commit）

> **独立检查更正**：下述旧 tgz 不可发布；新私有 npm ci 重建的新包才是有效候选，见 [check-report.md](check-report.md)。主依赖/.next目录mtime不足以证明子文件未变，旧共享store生命周期影响缺少前后hash，不能宣称零污染。旧报告未验证非空Trellis历史/UI，新包已补齐。`.next/trace` 实际随包包含，不是not included。未来commit必须包括两package和两public/fonts许可文件。历史日志/旧tgz完整保留，不将旧hash用作新包证据。

日期：2026-09-13。范围：本委派只做隔离准备、构建、打包审计与安装 runtime smoke，
**没有**真实 publish、没有 commit、没有 push/tag、没有升级真实安装、没有重启服务。

## 1. 结论摘要

| 项目 | 结果 |
|---|---|
| 源码基线 | 精确 `8ad6e95d1f2755a9094f68943b2081b62e65f8b0`（`git archive` 导出） |
| 版本 | `package.json` / `package-lock.json` 仅三处 0.9.2→0.9.3；pnpm-lock 不变 |
| 字体许可阻塞 | 已解除（见 `research/license-fonts.md`），新增 2 个许可/notice 文件 |
| build | `TURBOPACK= npm run build`（next build --webpack 16.3.1）exit 0，BUILD_ID `HpNoCyvhTfX8JSrIk0BmZ` |
| pack | dry-run 与真实 pack 逐字节一致，698 files / 6,111,437 B；唯一 tgz 已封存 |
| runtime smoke | 生产安装 0.9.3 + 首页/API/字体/静态资源/版本 + node-pty 终端 SSE，全部通过 |
| 主仓库 | HEAD、index、三个用户 agent 文件、`.next`/`node_modules` 均未变化 |
| registry/auth | 0.9.3 仍 E404（未占用），latest=0.9.2，`npm whoami`=xup3ng |
| 后续 | publish + 可选本地 commit 留给主会话/独立 check（见第 9 节） |

## 2. 隔离边界与路径

- 隔离发布根：`/home/xupeng/dev/personal/forked/.pi-web-v093-release-20260913`
  - `src/`：精确 H 的 `git archive` 导出 + 许可/版本补丁
  - `artifacts/`：`source-patch.diff`、`package*.json.before`、封存 tgz
  - `evidence/`：构建/打包/冒烟日志与 `evidence.json`
  - `logs/`、`home/`、`xdg-*`、`agent/`、`npm-cache/`、`tmp/`
- 冒烟隔离：`/tmp/piweb-v093-smoke`（tmpfs），含独立 prefix/HOME/XDG/agent/fixture。
- 主 checkout 仅只读使用；**未**在其中 build/install/改 `.next`。

磁盘限制（重要）：根分区仅约 0.3–0.4 GB 可用。为此：
1. build 依赖用 `pnpm install --frozen-lockfile --offline --store-dir <全局 pnpm store>`
   以硬链接方式安装（锁文件未改，真实新增磁盘约 74 MB），替代计划中的 `npm ci`
   （完整 npm 安装约需 1.5–2 GB，当前磁盘不可行）。
2. 第一次 build 因 webpack 文件系统缓存在 `.next/cache` 写满磁盘（ENOSPC）被监控中止；
   重跑时**仅**把 `.next/cache` 软链到 tmpfs，构建完成后已移除，未改任何配置/脚本。
3. runtime smoke 的真实 `npm install` 部署到 tmpfs（约 952 MB prefix + 433 MB cache），
   磁盘占用基本为 0，并在内存/磁盘双阈值监控下完成。

若后续需要重跑更严格的 `npm ci` 式构建，请先释放磁盘（例如清理
`~/.cache/pi-web-0.9.2-*` 两个历史临时安装目录，约 2.35 GB；本委派未擅自删除）。

## 3. 源码补丁（仅 4 个文件）

`artifacts/source-patch.diff`（sha256 `a9496e320d385b0c2c50400b7250b56d040d7aeccdd01fbffee8c18e8d11d32c`）：

- `package.json`：`version` 0.9.2 → 0.9.3
- `package-lock.json`：根 `version` 与 `packages[""].version` 0.9.2 → 0.9.3
- `public/fonts/LICENSE-cascadia-code.txt`：新增（OFL 1.1 逐字节）
- `public/fonts/NOTICE.txt`：新增（来源/哈希/URL）

补丁后源码内容清单 sha256（排除 `node_modules`/`.next`，778 文件）：
`aa9322d6201664b0cb8ae6eedc99d56ccde9c5403a85a7510349357151bfdb21`。
pnpm-lock sha256 保持 `b1d2d7457fb408298598f7459f2578f28be6d3b69f0e5cd0643f13055d2f1f57`。

## 4. 构建结果

- 命令：`TURBOPACK= npm run build`（隔离 `src/`，仅此目录）。
- 输出：编译成功，生成 `.next/BUILD_ID`、server/static/manifests/prerender；
  构建过程日志见 `evidence/build.log` 与 `evidence/resource-during-build.log`。
- `.next` 落盘（不含 cache）约 37 MB。
- 版本已嵌入：`0.9.3` 出现在 `.next/server/app/page.js` 与
  `.next/static/chunks/app/{page,layout}-*.js`（UI 渲染 `v0.9.3`，并带 `0.9.3p0.85.1`）。
- 注意事项：`required-server-files.json` 的 `outputFileTracingRoot` 内嵌隔离构建路径
  `/home/xupeng/dev/personal/forked/.pi-web-v093-release-20260913/src`（非主仓库路径）。
  历史 0.9.2 包同样内嵌其构建路径（`/tmp/pi-web-0.9.2-verify`），运行不依赖该路径存在。

## 5. 打包与审计

- `npm pack --dry-run --json --ignore-scripts` exit 0；
  `npm pack --json --ignore-scripts` 生成唯一 tgz，两者 integrity/size 完全相同。
- 封存产物：`artifacts/xup3ng-pi-web-0.9.3.tgz`
  - size `6,111,437` B；`unpackedSize` `35,450,604` B；`entryCount` 698
  - sha256 `e273a96990225dfb5ee3823fc0797dd3bb80572288d3b786812f6fad8d762b9e`
  - sha512 `3ab35da0be5916500ddd024aa6b1fe3c7f00ac77b5f55dfbcefcc1859cc7f4c00812ea89356776230adff59a899ad0f3172036a9a6bf0bc91ec41e45f8040289`
  - SRI `sha512-OrNdoL5ZFlAN3QJKprH+PH8ArHe19V37zvzBhZzH9MAIEuqJNWd2Iwrf9ZqJmtDzFyA2qaa/C8kexB5F+AQCiQ==`
  - 归档清单排序后 sha256 `0fbc52c9b177c2c7fae6e396b94aeec1d69aea4c0e0ed2fbe0d5409411896ca8`
- 结构安全：0 绝对路径、0 `../` 穿越、0 软链；顶层仅
  `bin/.next/public/next.config.ts/package.json/LICENSE/README*`。
- 内容审计：
  - 不含 `.pi`/`.trellis`/`.git`/`.env`/`.npmrc`/auth/token/OTP/session/attachments/cache/dev/`.js.map`。
  - 不含三个用户 agent 文件（`trellis-{check,implement,research}.md`）。
  - 不含真实主仓库路径（`agegr-pi-web` 仅作为 README/package.json 的 GitHub URL 出现）。
  - 无 `npm_*`/`ghp_*`/`sk-*`/私钥/Bearer/API key 命中；`auth.json` 仅是源码字符串。
  - 自带：`LICENSE`、`README*.md`、`bin/*`（含 `prepare-terminal.js` 等）、
    `.next`、`next.config.ts`、4 个 Cascadia woff2 + 新增许可/notice、
    catppuccin 许可。
- `not included`：`.next/trace` 存在（1.37 MB，Next 构建 trace，0.9.2 同样包含）；
  未发现其中含凭据或真实数据。

## 6. Runtime smoke（生产安装同一 tgz）

- 环境：`/tmp/piweb-v093-smoke`，独立 prefix/HOME/XDG/`PI_CODING_AGENT_DIR`/fixture git 项目；
  允许列表 env，清除 provider/npm/git 凭据；`NEXT_TELEMETRY_DISABLED=1`、
  `PI_WEB_SKIP_VERSION_CHECK=1`、`--no-open`。
- 安装：`npm install <封存 tgz> --omit=dev` exit 0，361 个包；安装版本 0.9.3。
- 校验：
  - `node bin/pi-web.js --help` exit 0。
  - `next start` 302 ms 就绪，动态 loopback 端口（38507 / 33379），不冲突既有 30141/8505/26812。
  - `/` 200；`/api/projects` 200（返回 fixture 项目，`sessionCount=1`）；
    `/api/sessions` 与 `?projectKey=` 200 且含合成会话 `synth0001`；`/manifest.webmanifest` 200。
  - 字体 `/fonts/cascadia-code-latin-400-normal.woff2` 200 且 29452 B（与源一致）；
    `/fonts/LICENSE-cascadia-code.txt`、`/fonts/NOTICE.txt` 200。
  - 首页引用的 `app/page-*.js` 均 200，且其中含 `0.9.3` 与 `0.85.1`。
  - 生产依赖可用：`node-pty`、`undici`、`web-push`、`@earendil-works/pi-coding-agent` 均可加载；
    `next.config.ts` 在只有生产依赖时成功解析。
  - 终端基础冒烟：`POST /api/terminal` 200 → `GET .../events` SSE 流入 shell 提示与回显 →
    `POST {type:input echo PIWEB_TERMINAL_OK}` 200，SSE 命中 `PIWEB_TERMINAL_OK` → `DELETE` 200。
  - **未**请求任何真实 provider/Agent；仅 fixture 合成数据。
  - 冒烟结束后释放全部自己启动的进程/端口（`ports_released` 已验证）。

## 7. 主仓库与用户文件保护

- HEAD 仍为 `8ad6e95d1f2755a9094f68943b2081b62e65f8b0`；`git diff --cached` 为空。
- index 聚合 sha256 前后一致：`1acc56e9ed9aa169b92bd9b1f7c55f71590a8adf97a6aeaa18f566082addafef`。
- 三个用户 agent 文件 sha256/mode 前后一致（600）：
  - check `1404a40a04b3dd9664fbf2072d2c80cc96c70625065bf2b9bbeabcaf762ceabf`
  - implement `0fa8906a609cf36c9b30c233281273e69114d0307f0bdf68c89864e15a99600e`
  - research `9af8acee27ee8dd1149174d34bbefe3022209812684e981ec62e9bc3f13159d3`
- 主 `package.json` 仍 0.9.2；主 `.next`/`node_modules` mtime 仍为 2026-09-09（未触碰）。
- 既有服务 415138(:8505, dev) 与 1539(:26812, 已安装 0.9.2) 未停止/未重启。

## 8. registry / 认证现状

- `npm view @xup3ng/pi-web version dist-tags`（显式 npmjs）：`0.9.2`，`latest=0.9.2`。
- `npm view @xup3ng/pi-web@0.9.3`：E404（截至本次仍未占用；非永久预留）。
- `npm whoami`：`xup3ng`（用户已在本机完成 npm 登录）。未读取/输出 token，未改全局 auth。
- 2FA 是否就绪未知；真实 publish 需用户在终端完成浏览器授权。

## 9. 待独立 check / 主会话事项（本委派未做）

1. 独立 cdhe check：复核封存 tgz 的 sha256/SRI 与文件表，可另行复跑安装+smoke。
2. publish 前再确认 HEAD、index、三 agent 哈希未漂移，0.9.3 仍未被占用、latest 仍 0.9.2。
3. 对**同一 tgz** 显式 `--registry/--@xup3ng:registry/--access public --tag latest` 执行
   `npm publish --dry-run`（本委派未执行，因委派要求不 publish）。
4. 用户在终端完成 2FA 的真实 publish；随后有界核验 exact/latest/`dist.integrity` 与本地一致。
5. 可选本地 commit（用户已批准）：仅 `package.json`、`package-lock.json` 及逐文件审核的
   任务文档；保持三用户 agent 文件不变；无 push/tag；主 package 更新可能触发 HMR。
6. 真实发布成功前不得移回主版本；commit 失败不重发。

## 10. 本委派明确未做

publish（含 dry-run 之外的任何上传）、commit、push、tag、GitHub Release、归档旧任务、
升级/重启真实安装或服务、修改其他 task、删除既有隔离目录/worktree、改动字体或业务代码。
