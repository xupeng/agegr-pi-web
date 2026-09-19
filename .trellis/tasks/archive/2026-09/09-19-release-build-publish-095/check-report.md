# 0.9.5 发布独立检查报告

## 结论

**发布产物身份、registry 元数据、字体许可与版本 bump 均通过独立核验；不能签署“全部交付与声明均无问题”。** 发现核验脚本不能真正落实失败/超时门禁、运行时路径独立性缺证、报告计数与当前分支同步状态不符，以及历史证据保存不足等问题。未改源码、脚本、产物或发布报告；唯一写入为本文件。未 commit/amend/push/publish，未删除或移动隔离 root。

检查时：`HEAD/personal=c55359699a88e9df620df2b77dbc4e464e499109`，`origin/personal=86088d9bc00aedd6a46df13d2429fe9bf2ebc361`。所有结论均以本次读取的磁盘/公开 registry 为准，不把发布报告自身当作独立历史凭据。

约定：

```bash
MAIN=/home/xupeng/dev/personal/forked/agegr-pi-web
ROOT=/home/xupeng/dev/personal/forked/.pi-web-v095-release-20260919-220023
TGZ="$ROOT/artifacts/xup3ng-pi-web-0.9.5.tgz"
REMOTE="$ROOT/evidence/remote-0.9.5.tgz"
H=e47ac5692d524e533c3a64d434b41b409fdf4bee
```

## 1. 数值与来源逐项复核

| 项目 | 独立实测 | 判定/来源 |
|---|---|---|
| H | `e47ac5692d524e533c3a64d434b41b409fdf4bee` | 与 `$ROOT/evidence/H.txt`、报告一致 |
| H tree | `10e6fef6609bb6593b0eccd212ad4eccf2151c3d` | `git rev-parse "$H^{tree}"` 与 evidence、报告一致 |
| 源码文件数 | 941 | `git ls-tree -r --name-only "$H"` 行数，与报告一致 |
| BUILD_ID | `sDkZvINGJKQuzWOOBAf0c` | evidence 与 `src/.next/BUILD_ID` 一致 |
| tgz SHA-256 | `19f52aafb5b279773e9cfad0b7c51711b63fb06885b10285cde48d67937b75b8` | 实际 bytes 计算、SHA256SUMS、报告一致 |
| tgz SHA-1 | `c184c639805f8c93aee460b6f808f32ac808046c` | 实际 bytes 计算、dry-run、报告一致 |
| SRI | `sha512-EnTszgQwUntXZAf5+oIY7cRpAhMQJAg3zeCQRt7qFb9mkeeKdXRc0Pue32GUED2HE+P4oQ6JIlm4mvgu7x2RSQ==` | 实际 SHA-512/base64、SHA512.b64、报告一致 |
| 压缩大小 | 6,092,922 B | 读取实际 tgz 长度，与 dry-run、报告一致 |
| 条目数 | 706 | tar 成员数、filelist 行数、dry-run、真实 pack/B7 日志一致 |
| 解包大小 | 33,871,076 B | tar 成员 size 求和、dry-run、报告一致 |
| lock 前后 SHA-256 | `8ac4bdeb228836da7fd8fdcdba0c7d1f74979ea8e3b261d07f853f8bf7a7fcb6` | lock-before 与 lock-after 一致 |
| `agegr-pi-web` 内容命中 | 7 次 | 解包内容 bytes.count，与报告一致 |
| 隔离 `src` 路径内容命中 | **3,842 次 / 187 文件 / 232 行** | **不等于报告笼统的“122 处”**，见 F3 |

计算使用 Python `hashlib.sha256/sha1/sha512`、`base64.b64encode` 与 `tarfile.getmembers()`，未解包写入磁盘。可复核命令：

```bash
git -C "$MAIN" rev-parse "$H^{tree}"
sha256sum "$TGZ" "$REMOTE"
sha1sum "$TGZ"
openssl dgst -sha512 -binary "$TGZ" | base64 -w0
stat -c%s "$TGZ"
wc -l "$ROOT/artifacts/filelist.txt"
tar -tzf "$TGZ" | wc -l
```

`evidence/b5-dry-run.json` 是提取后的对象；原始 `logs/b5-pack-dry.log` 在 JSON 前有 npm warning。跳过 warning 后解析原始数组，六个字段（size/unpackedSize/entryCount/integrity/shasum/version）与提取件和实际产物一致。真实 pack 日志仅打印截断 SRI，但实际 tar 的全量 SHA-512 与 dry-run 相同，补足了证明。

`check/*.json` 全部现有 **6 个**记录 exit=0：

| 记录 | duration_s | cwd |
|---|---:|---|
| b3-npm-ci | 58.54 | ROOT/src |
| b4-build | 199.81 | ROOT/src |
| b5-pack-dry | 5.74 | ROOT |
| b5-pack | 4.80 | ROOT/src |
| b6-install | 63.36 | ROOT |
| b7-publish-dry-run | 7.28 | ROOT |

上述耗时与报告/runbook 一致。**没有 B2、B2b 或 smoke 的 check JSON**，不能把“现有六条 exit=0”扩展为“每个步骤退出码都有独立保存”。六条记录的 registry 均为 null；B7 cmd 显式指定官方 registry，npmrc 内容独立验证为且仅为 `registry=https://registry.npmjs.org/`。

## 2. 同一产物与实时 registry

已实际执行 `cmp "$REMOTE" "$TGZ"`：exit **0**。另通过公开 HTTPS GET 将 registry tarball 重新下载到内存（不读 npm 配置、不落 cache），其 SHA-256 同上，bytes 与本地封存件相同。

实时查询方式：Python `urllib.request.build_opener(ProxyHandler({})).open(url, timeout=20)`，只读 GET：

- `https://registry.npmjs.org/@xup3ng%2fpi-web/0.9.5`
- `https://registry.npmjs.org/@xup3ng%2fpi-web`
- `https://registry.npmjs.org/@xup3ng%2fpi-web/0.9.4`
- `https://registry.npmjs.org/@xup3ng/pi-web/-/pi-web-0.9.5.tgz`

| 字段 | 实时结果 | 与 §6B |
|---|---|---|
| version | 0.9.5 | 一致 |
| latest | 0.9.5 | 一致 |
| versions | 0.9.0 至 0.9.5，含 0.9.5 | 一致 |
| dist.integrity | 上述完整 SRI | 一致 |
| dist.shasum | 上述完整 SHA-1 | 一致 |
| dist.fileCount | 706 | 一致 |
| dist.unpackedSize | 33871076 | 一致 |
| maintainers | xup3ng，recordus@gmail.com | 一致 |
| time[0.9.5] | `2026-09-19T22:01:05.113Z` | 一致 |
| 0.9.4 integrity | `sha512-WX+LIbwPxXCMnTZlK1xirhq9JZnU5UX4QugcoZ2J/X801ba+PCh7lqXpQRxiJKVe4APe4b1DOunaehLoEzwXmw==` | 一致，未发现旧产物被改写 |

没有重新发布或调整 dist-tag。实时相同的 integrity 能证明旧内容未变，不能单凭该字段证明历史上绝无任何 registry 元数据操作。

## 3. AC4 字体许可

对本地封存件和磁盘远端件，均实际运行：

```bash
tar -tzf "$TGZ" | grep -E 'public/fonts/(LICENSE-cascadia-code\.txt|NOTICE\.txt)$'
tar -tzf "$REMOTE" | grep -E 'public/fonts/(LICENSE-cascadia-code\.txt|NOTICE\.txt)$'
```

**两份各自原始输出均为以下两行：**

```text
package/public/fonts/LICENSE-cascadia-code.txt
package/public/fonts/NOTICE.txt
```

对两份 tgz 各执行两个 `diff <(tar -xzOf "$t" "package/public/fonts/$f") "$MAIN/public/fonts/$f"`，四次均无输出、exit=0。4 个 woff2 全在 tgz。

独立复跑 `(cd "$ROOT/src" && node --test public/fonts.test.mjs)`：**tests=2、pass=2、fail=0、exit=0**。因此 0.9.4 的字体许可缺项确实已由本版本修复，而非仅报告声称修复。

## 4. 隔离、smoke 与提交

- `stat -c '%y %n' .next node_modules`：`.next = 2026-09-19 14:07:32.295883681 +0800`，与报告完全一致；node_modules 当前为 `2026-09-18 16:57:02.540642111 +0800`，但缺发布前快照作独立对照。
- `git status --short` 检查开始时只含三个用户 `.pi/agents/trellis-{check,implement,research}.md`；已查看 diff，未修改它们。
- root 是主 checkout 兄弟目录；`src` 下无指向主 checkout 的 symlink；tgz 内容中主 checkout 绝对路径命中 0。无绝对/穿越 tar 条目、无软/硬链接，无 `.git/.pi/.trellis/.env/.npmrc/auth.json` 条目及 `.next/cache/.next/dev` 条目。NPM_TOKEN、_authToken 字面量均 0。此检查不是任意凭据形式的完备检测。
- tgz 元数据 name/version/files/license/bin 全与 §3 相同；六个 bin helper 均存在；page.js 含 0.9.5。
- 安装版 package.json 版本 0.9.5；fixture 的 `git rev-parse --git-common-dir` 为 `.git`，是独立仓库。
- 保存的 b6-smoke.txt 确有报告列出的 HTTP 200/405、字体 4395/1477 bytes、terminal 创建/GET/DELETE 与清理 0。但日志尾部重复、单独 `0` 与残片并存；b6-smoke-rerun.txt 在 cwd validate 标题处截断。见 F5。
- 本次只读 `lsof` 检查 evidence 记录端口 35743、46207：均 exit=1、无 listener；按 `ps` 的真实进程 comm 过滤（避免匹配当前 shell）未发现该 install 路径下 node 服务。未重新启动服务。
- `git show --format= --name-only 86088d9` 仅 package-lock.json、package.json，`.pi/agents` 0 命中；差异仅 version 三行 0.9.4→0.9.5。
- 主 checkout 的 package.json/package-lock.json/pnpm-lock.yaml 与 ROOT/src 三文件逐字节相同；主版本 0.9.5；`git tag -l v0.9.5` 无输出。
- `git ls-remote origin refs/heads/personal` 为 `86088d9bc00aedd6a46df13d2429fe9bf2ebc361`。发布 bump 已在远端，但本地后来增加两个记账提交，当前并不等于 origin/personal（F4）。

## 5. 问题 / 证据 / 建议修法 / 严重度

### F1 — B10 脚本既不保证十分钟上限，也不因比对失败而失败（高）

**证据**：ROOT/b10-verify.sh 为 `set -u`；20 次循环中 npm 请求未设置超时和禁重试，另每次 sleep 30。字段不符仅输出 `NO`，随后仍 `exit 0`；latest 也只打印不断言。20×30 秒不是包含请求耗时的墙钟上限。§7A 所述第一次 mismatch “退出”不能解释为非零失败退出。

**影响**：本次实时字段全部匹配，所以不否定已发布内容；但“脚本落实有界核验、退出码即判据”的可复用流程声明不成立。

**建议**：使用单调墙钟 deadline；每次请求设置剩余预算与零重试；所有字段断言一致才 exit 0，否则非零并保存待核验/不一致状态；不得重发。补超时、E404、错误 SRI、错误 latest 的离线脚本测试。

### F2 — “运行不依赖隔离路径存在”未经验证（高，发布可移植性风险未排除）

**证据**：tgz 的 `.next/server/chunks/2430.js` 含实际模块代码，例如 `a.exports=d("/home/xupeng/dev/personal/forked/.pi-web-v095-release-20260919-220023/src/node_modules/next/dist/client/components/client-page.js")`。smoke 时该路径确实存在。没有隔离构建树不可见时的安装运行证据。

**建议**：将报告改为“已知内嵌路径，独立运行尚未验证”，不要断言无依赖。另行授权后，在不挂载 release src 的容器/命名空间或另一台机器验证同一个 tgz 的启动与路由。不能用现有 root 上通过 smoke 推断删除 root 后必可运行。本次按边界未移动/删除 root，也未尝试修包或重发。

### F3 — §3 的“122 处隔离路径”计数错误或未定义统计口径（中）

**证据**：对 tar 每个普通文件执行 `bytes.count(str(ROOT / 'src').encode())`，得到 3,842 次、187 文件、232 含匹配行；其中 `.next/trace` 单文件 3,532 次，JS 共 246 次。报告把所有内嵌路径概括为 122 处且同一种模块解析形态，不符合包内实际内容。

**建议**：写清字面出现次数、文件数、行数及排除项；分别列 trace/manifest 元数据与 JS 模块路径。若 122 是某个 regex 子集，明确该 regex，不能作为全量统计。

### F4 — 当前本地与远端 personal 不相等（中，收尾状态）

**证据**：本地 c553596…，origin 与实时 ls-remote 均 86088d9…。差值是 e327ff9（发布报告/runbook/docs）与 c553596（字体任务归档），不含额外产品代码。

**建议**：§6C 可保留“B11 当时 push 到 86088d9”的历史记录，但补当前记账提交尚未 push 的说明；若要求当前 AC8 相等，由主会话取得授权后按流程提交/推送预期记录，再复核。本检查不 push。此项不是认定历史 B11 没有成功。

### F5 — smoke 是打印器而非断言器，证据不能支撑全部运行语义（中）

**证据**：ROOT/smoke.sh 只有 `set -u`，probe 不检查 HTTP 值/curl 退出码，body 截前 200 bytes，terminal SSE 内容被丢弃；cleanup 仅打印数量；`pgrep -fc ... || echo 0` 在零匹配时产生两行 0，并未采用文档声称应有的 shell 排除。日志存在重复与截断；无 smoke check JSON。

**建议**：区分“日志观察到 200”与“自动断言 exit 0”，不要用安装 exit 0 代替 smoke exit。补状态码、JSON、SSE 事件内容及清理的失败断言，分离 tee 目标与 stdout 重定向，完整保留原始日志。现有 HTTP 200 证明端点可达，不足以证明 PTY 成功输出 shell 数据。

### F6 — 隔离 env 只清除部分变量，“全部代理/真实环境不继承”声明过强（中）

**证据**：env.sh 只 unset NPM_TOKEN/NODE_AUTH_TOKEN/NODE_OPTIONS/HTTP_PROXY/HTTPS_PROXY/http_proxy/https_proxy；未清除 ALL_PROXY/all_proxy/NO_PROXY/no_proxy、NPM_CONFIG__AUTH 等研究文档列出的变量；未约束 NPM_CONFIG_GLOBALCONFIG 或小写配置覆盖。check 元数据 registry 全 null。本次未发现产物中实际 token 泄漏，但脚本本身不能保证所宣称的全面隔离。

**建议**：白名单构造子进程环境，或补全并验证大小写 npm 配置与代理入口、globalconfig；只记录变量名和是否存在，不输出敏感值。将历史环境“实测无 token”的证明与脚本保证能力分开。

### F7 — 历史门禁与部分验收证据未完整落盘（中）

**证据**：任务 research 下只有两个 Markdown；权威产物和 check 仍仅保存在 root。无发布前后完整 stat/status 快照，无 B2/B2b/smoke 的独立退出记录。remote-0.9.5.json 实为串联的两个 JSON 对象，不是单个合法 JSON，且不含 versions/maintainers/time/unpackedSize。报告中用户批准、whoami 登录后身份、轮询第8次和受理时间主要是文字记录；此次未读取用户私有 npm 日志/会话，不能独立认证这些历史事件。

此外，`21:56:30.327Z` 是报告引用的 npm debug 日志文件起始时间，所摘 PUT 202 行没有绝对时间；不能据此精确宣称该秒就是“受理时刻”。到 registry time 的差为约275秒，作为“从命令开始到发布时间约4.6分钟”合理，作为精确受理后时延缺证。

**建议**：补保存已有脱敏原始证据及来源链接，不要重造历史记录；无法补的标“仅操作记录，未独立复核”。把拼接输出改称 JSON stream 或分文件。受理时间使用真正带时间的 PUT 202 记录，否则修改时间口径。

### F8 — 冻结基线合同与实际交接有记账例外，需显式闭合（低）

**证据**：前置任务 evidence/H.txt 是 fc2323ef…，本发布 evidence/H.txt 是 e47ac569…。前置任务 `merge-execution.md` 经 52f12c1 明确允许导出当时 HEAD，但 PRD AC1 仍要求与子任务 H 相同；报告仅以白名单路径 diff 空解释。独立检查完整 `git diff --name-only fc2323e..e47ac56` 确认全部是 `.trellis/**`，产品源码未变，因此未发现实际代码基线漂移。

**建议**：报告 §7A 明确登记“交接代码基线 fc2323e → 仅记账 HEAD e47ac56”的批准例外与完整 diff 证据，避免把原始 AC1 逐字判全绿。§0 中 `git rev-parse HEAD^{tree}` 应改为固定 `git rev-parse "$H^{tree}"`，当前 HEAD tree 已是 `1b3422de94ce3c43626197ab2e3ec47391d81521`。

## 6. 文档准确性及未覆盖项

`docs/release-npm.md` 新增章节中的 B2b、public URL、E404 JSON、pgrep 自匹配、字体单独审计原则正确且与现有证据相容。H 的旧版本为 0.9.4，故本次 B2b 确实必需；主与隔离版本三行差异证明其效果。当前 smoke 仍使用易误判 pgrep，故“文档建议正确”不等于“脚本已落实”。传播时长应修正时间口径（F7）。

旧章节仍置顶推荐脚本/在工作目录 build，后部才声明不再使用；FAQ 的“tarball 和版本页立即可见、2–4分钟”也比本次证据支持的结论更强。建议把现行隔离流程提前并把旧入口显著标注废弃；不能让读者只读快速开始就破坏 dev checkout。

报告诚实列出 UI e2e、低版本 Node、Windows 未验证：本次未发现能把它们升级为已验证的证据。当前 `node --version=v26.1.0` 与报告相同。构建路径虽披露，但其“无运行依赖”结论过强（F2）。

本次是只读交付审计，没有产品 TS/JS 修改；独立运行字体 2/2，不重跑 build/install/pack/smoke，不触碰主 node_modules/.next。**未独立重跑 lint、tsc、全量单测或浏览器 e2e**，不将历史检查当作本次通过；尤其 tsc 默认增量缓存可能写入 checkout，不适合本次只读边界。构建 exit=0、既有质量记录与运行 smoke 的覆盖面分开认定。

## 7. 最终判定

- **通过**：产物核心 hash/版本/大小/条目、真实 registry 字段、实时远端字节一致、AC4 字体许可、旧版 integrity、bump 提交范围、当前无观察到的发布服务残留、主 `.next` mtime。
- **需修订/补证**：F1–F8；尤其不能把运行路径独立性、十分钟脚本门禁、smoke 自动断言及当前分支同步写成无条件通过。
- 已发布版本不应重发；上述建议应由主会话按权限处理文档/未来脚本或另开验证，不在本检查中修改产物。
