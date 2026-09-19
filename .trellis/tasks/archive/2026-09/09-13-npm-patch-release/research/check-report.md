# 0.9.3 独立检查报告（2026-09-13，最终状态）

## 结论

**Ready-to-publish：是，限下述唯一新 tgz。尚未真实发布、commit、push/tag。**
已批准发布范围不变；真实 publish 前主会话仍须即时复核包未占用、HEAD/index/用户文件及 tgz hash，2FA 可能必须由用户在终端操作。dry-run 不证明写权限/2FA，也不证明远端已发布。

旧 pnpm 硬链接产物 **superseded / 不可发布**，原文件完整保留。此次使用真正私有 npm ci 从精确 H 重新导出源码构建，未改业务/字体/依赖版本/锁图。准备报告是历史，不能以旧 SHA 或旧 smoke 证明新包。

证据根 R：`/home/xupeng/dev/personal/forked/.pi-web-v093-release-20260913`；新证据 C：`R/check`。主要文件：`final-status.json`、`artifact-audit.json`、`source-manifest.json`、`tar-manifest.json`、各命令 `.json`/`.log`。命令记录含 cwd、严格允许列表环境、开始/结束时间和退出码；检查脚本也保留在 C，入口 `R/check-run.py`。没有派生代理。

## 唯一有效产物与源码映射

- **绝对路径**：`/home/xupeng/dev/personal/forked/.pi-web-v093-release-20260913/artifacts/final/xup3ng-pi-web-0.9.3.tgz`
- name/version：`@xup3ng/pi-web@0.9.3`；5,976,710 bytes，704 regular-file entries。
- **SHA256**：`f8d53d8351ce821da8d9477f1633ecdcdd8bbc36fd054580bf52c4c33cfd4491`
- **SHA512**：`fb136662643fbb5e88dfb1c8768c4bd8a5fe5afa3b4e41629cb4a2dc1c301177f9c019fe686489dc0d1eb766d4d6de23fd010f54f1f972f1f9b40d413ddefbfc`
- **SRI**：`sha512-+xNmYmQ/u16I37HIdoxL2KX+Wvo7TkFinLSi3BwwEXf5wBn+aGSJ3A0et2bU1t4j/QEPVPH5cvH5tA1BPd77/A==`
- 实际文件名/size/mode/逐文件 SHA256 清单：`C/tar-manifest.json`，其 SHA256 `ea8d8701decc14b4f2a7699555dc2f55095fe9b83228f400b355369c552a8535`。
- 源码 H：`8ad6e95d1f2755a9094f68943b2081b62e65f8b0`；新导出 `R/src-ci`，不是主工作区复制，也未重用旧共享依赖。逐个 archive 文件比对，只允许两 package 元数据变化及两新增许可文件。
- 四文件补丁内容与原准备补丁完全相同：`R/artifacts/source-patch.diff` SHA256 `a9496e320d385b0c2c50400b7250b56d040d7aeccdd01fbffee8c18e8d11d32c`。
- 新源码逐文件 SHA256 清单：`C/source-manifest.json` SHA256 `bddbb66923852c0d0aa4515493721af8113140a236c3b07a92c10d36500d8b75`；测试/dry-run 后全部重新比对不变。

| 文件（未来源码 commit 必须包含前四项） | SHA256 |
|---|---|
| package.json | `2cd8df900fcf1644e9d77e4a9c397eba05ba8b4b6290ef2b8db647a035fd7d67` |
| package-lock.json | `36cec7c234ec7b23fd670f34b39246ab318a95215efaf3924cc907f564097654` |
| public/fonts/LICENSE-cascadia-code.txt | `82c05d6c53dfa0c9025985c19e371810020b74ed2c61d51d370f2a8ab2506d52` |
| public/fonts/NOTICE.txt | `9834f87fdc368ab330c20814c78e032ae3e73dd86b6603ae1e38a2ab50b574db` |
| pnpm-lock.yaml（不修改/不需提交） | `b1d2d7457fb408298598f7459f2578f28be6d3b69f0e5cd0643f13055d2f1f57` |

旧 tgz 路径为 `R/artifacts/xup3ng-pi-web-0.9.3.tgz`，SHA256 仍 `e273a96990225dfb5ee3823fc0797dd3bb80572288d3b786812f6fad8d762b9e`；旁边 `SUPERSEDED.txt` 明确禁止发布，不删除旧证据。

## 修复与隔离证据

1. **共享 pnpm store 不符合私有 npm ci 门**：未接受准备 worker 的替代安装。磁盘复查根分区约 70GiB 可用（不是旧 0.4GB/传述 4.9GB），无须删除任何他人文件；收尾约 66GiB。使用新 `src-ci`、新私有 npm cache/HOME/XDG/agent/TMP，清除认证、provider、Git/代理环境，user/global npm config 指向不同的私有空路径。真实 npm ci 退出 0，未再写 pnpm store。`.next/cache` 是新目录内普通目录，不是 tmpfs symlink。
2. **依赖可写隔离**：遍历新 node_modules inode/link-count，4 个 esbuild 文件存在 npm postinstall 在新树内部创建的两对硬链接，所有链接都可在新树内完整计数；**外部硬链接为 0**。没有连接主依赖/全局 store。
3. **历史主依赖未变不可证明**：准备 evidence 声称旧 pnpm 命令带 `--ignore-scripts`，降低生命周期写风险，但报告与 evidence 命令描述不一致；缺少此前 store/主依赖逐文件 hash 和完整安装执行证据。硬链接不是只读隔离，后续写入/chmod 可能影响共享 inode。主 node_modules 或 .next 的目录 mtime 不能证明子文件未变。此次未尝试写/修复/清理全局 store 或主依赖；新包不使用旧 store。不能回溯保证旧 worker 对共享文件零影响，也没有证据断言实际发生污染。
4. **字体**：检查全文 OFL 与 NOTICE；重新经 HTTPS 获取 exact `@fontsource/cascadia-code@5.3.0` 和 Microsoft/Google Fonts 许可，4 个 woff2 逐字节匹配，Google OFL 与新增 LICENSE 逐字节相同、Microsoft 去 CRLF 后相同。版权完整保留，无新增杜撰版权。NOTICE 的来源、权重、hash、URL 正确。新包包含完整根 MIT、Catppuccin MIT、字体 OFL/NOTICE；运行时字体/许可与包中 bytes 一致。不是完整法律审计。
5. **包审计**：dry/real pack JSON 完全一致，实际 tar 文件表与 pack 列表一致。所有项是 regular file，零绝对归档路径/`..`/symlink/hardlink；先校验再安全解包。无主 checkout 绝对路径、用户 agent 文件、.git/.pi/.trellis/.env/.npmrc、node_modules、真实会话/附件/cache/dev/sourcemap。`api/attachments` 是合法编译路由，不能把该目录名误当真实附件。检查凭据格式/私钥未发现命中；源码里的 auth/session/API 路由名称不是凭据或真实数据。
6. `.next/trace` **确实包含在包里**（旧报告的 “not included” 文案错误）；已作为实际 tar 内容一起审查。`absolute-path-hits.json`/artifact audit 记录中性 release 构建目录 `R/src-ci` 嵌入 Next tracing/type/route metadata，不是主仓库或真实数据路径，路径含本机用户名这一公开构建位置元数据，不当作秘密。允许保留该隔离路径；smoke 期间将整个 `src-ci` 改名，原绝对路径不存在时安装包依然通过运行测试，证明所测路径不依赖它。未直接编辑 tgz 或 Next 输出。

## 新验证结果（均针对新依赖/新 tgz）

| 门 | 结果 / 证据 |
|---|---|
| npm ci | exit 0；`npm-ci-retry.*`。首次 harness 把 user/global config 同设 /dev/null，npm 拒绝 double-loading（exit 1），改为不同私有路径后一次成功；不是锁或安装失败绕过。 |
| 隔离 `TURBOPACK= npm run build` | exit 0，`build-retry.*`。第一次工具 200s 超时，未得到退出码/成功标记，进程检查无残留；仅一次改用 600s 上限重跑，194s 完成。不改 build/config。 |
| unit | 首次 exit 1：1221 pass / 1 fail，`skill-lock.test.mjs:27` 假定无 XDG_STATE_HOME；私有 state 路径与其硬编码 `/home/test/.agents` 预期冲突。仅在测试子进程 `env -u XDG_STATE_HOME npm test`，HOME/其余 XDG 仍私有，fallback 仍安全；exit 0，**1222/1222、10 suites**。保留失败记录，不修改测试/业务。 |
| tsc | `tsc --noEmit --incremental false` exit 0。 |
| lint | npm lock 环境此次 `npm run lint` exit 0。但 npm 的 ESLint 9.39.4 / hooks 7.0.1 与 pnpm 的 9.39.5 / hooks 7.1.1 不同；**不代表历史 14 个 preserve-manual-memoization errors 已修复**，不宣称项目跨环境 lint 全绿。依赖锁图均未改。 |
| pack | dry/real exit 0，实际清单与 integrity 相同；新包只 pack 一次。 |
| 生产安装 | 新 `C/production` prefix，`npm install <确切新tgz> --omit=dev` exit 0；独立安装锁中本地 tgz integrity 等于上述 SRI。不使用主/构建依赖运行服务。 |
| CLI/资源 | CLI --help exit 0；私有 fixture cwd、动态 127.0.0.1、--no-open 启动生产 CLI。首页所有引用 JS/CSS 均成功，内容含 0.9.3/0.85.1；全部 4 字体、2 许可逐字节通过。 |
| Trellis 非空历史 | 合成会话包含正确 tool+kind 的持久化结果，之后 60 条 filler；`?tail=50` 的 `context.messages` 不含旧结果，`trellisSubagentRecords` 却有 leafValid、hasRecords、精确 call ID 和唯一 durable result。保存 `history-envelope.json`，不是以 HTTP200 推断兼容。 |
| Trellis UI | 安装包生产服务，Chromium 1280/390 两尺寸，打开 Agents、点击 Succeeded 记录，显示 CHECK_DURABLE_RESULT，零 pageerror，截图保留。阻断所有外部浏览器请求；未发送 provider prompt。 |
| terminal | 真 node-pty 创建、SSE、输入 `printf 'CHECK_%s_OK\n' TERMINAL`、收到拼合后的 CHECK_TERMINAL_OK、DELETE 均断言成功；不是只匹配输入回显。 |
| smoke 清理 | 修正首次 harness 使用 `messages` 而非 `context.messages` 的 KeyError 后完整 smoke exit 0。每轮 finally 终止自己的进程组、端口关闭、恢复 build 目录；最终端口 44545 已释放。CLI 被 SIGTERM 退出 143 属预期清理。 |
| registry | 05:43 UTC 只读 whoami=xup3ng exit 0；exact 0.9.3=E404 exit 1（解析 error.code，不接受其他错误）；latest=0.9.2 exit 0。显式 registry/scoped registry，20s/0 retry；不读取/复制/修改 auth。 |
| publish dry-run | 对上述同一新 tgz，显式 `--dry-run --ignore-scripts --registry=https://registry.npmjs.org/ --@xup3ng:registry=https://registry.npmjs.org/ --access=public --tag=latest`，**exit 0**。在无认证隔离环境执行，无上传。 |
| 封存 | smoke 前后、publish dry-run 后 SHA256 完全一致；finalize exit 0，源码清单/锁/四文件映射、旧 tgz hash、主状态全部重新断言通过。 |

平台：Linux x64、Node26.1.0/npm11.13.0；不是 CI Node22.19.0 跨平台保证。浏览器 cache revision1234 而 Playwright 预期1243，保留环境差异；不是物理 iOS/WKWebView、live provider/auth/push 测试。历史 dev E2E 当次全过及间歇失败限制仍保留，不把本次 focused production smoke 称完整 E2E。

## 主仓库保护与未来提交 allowlist

主 HEAD 仍精确 H，index 的 `git ls-files --stage` SHA256 与检查起点一致、cached diff 为空；三个用户文件 content hash/mode 与 preparation 和本次前后记录一致（均 0600）：

- check：`1404a40a04b3dd9664fbf2072d2c80cc96c70625065bf2b9bbeabcaf762ceabf`
- implement：`0fa8906a609cf36c9b30c233281273e69114d0307f0bdf68c89864e15a99600e`
- research：`9af8acee27ee8dd1149174d34bbefe3022209812684e981ec62e9bc3f13159d3`

没有主 install/build/.next/node_modules 写操作、真实数据/provider 操作或现有服务 stop/restart/upgrade。主 package 仍 0.9.2，字体许可目前只在隔离源码；主变更限本任务文档。

**真实发布且 exact/integrity/latest 核验成功以后**，未来本地 commit 的源码 allowlist 必须是以下四项，不能漏两项字体许可：

1. `package.json`
2. `package-lock.json`
3. `public/fonts/LICENSE-cascadia-code.txt`
4. `public/fonts/NOTICE.txt`

任务记录可逐文件审核添加（根 `.trellis/tasks/09-13-npm-patch-release/`）：`prd.md`、`design.md`、`implement.md`、`release-scope.md`、`task.json`、`implement.jsonl`、`check.jsonl`、`research/release-plan.md`、`research/license-fonts.md`、`research/preparation-report.md`、`research/check-report.md`，以及真实发布后新写并脱敏审核的 `research/release-result.md`。不整目录 git add；不提交 generated config/.next/node_modules/tgz/外部日志；不暂存用户三 agent。HEAD/index/allowlist 若并发漂移则停止，不覆盖。成功后主版本同步可能触发 HMR，用户已批准；不 restart。

未解决的历史证据局限已明确，不存在阻塞该**新 tgz**的剩余产物问题。下一步仅由主会话/用户终端执行已批准的同 tgz 真实发布与有界远端验证；本代理到此停止，不重包、不上传、不 commit。
