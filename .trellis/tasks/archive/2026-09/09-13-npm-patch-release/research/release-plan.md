# npm 0.9.3 发布研究与审批后运行手册

> **最新状态：check完成，ready-to-publish**。用户已批准 build/public latest0.9.3/成功后本地commit/必要字体许可。旧pnpm硬链接候选已superseded并保留，不能发布；新 `src-ci` 私有npm ci重建产物通过完整审计/生产安装/Trellis历史envelope+UI/terminal smoke/publish dry-run，唯一tgz/hash见 [check-report.md](check-report.md)。真实publish/commit未执行。旧planning/E401/许可阻塞描述仅作历史，不是当前阻塞。旧store/主依赖未变缺少逐文件前后证据，不以mtime断言。

> **执行状态（2026-09-13 追加）**：本手册的 A–C 准备阶段已在隔离目录执行完成，
> 结果见 [`preparation-report.md`](./preparation-report.md)、[`license-fonts.md`](./license-fonts.md)
> 与隔离目录 `…/.pi-web-v093-release-20260913/evidence/`。D（真实 publish）与 E（可选 commit）
> **未执行**，留给主会话在独立 check 与认证确认后进行。用户已批准最终范围（含本地 commit
> 与必要许可文件扩围）。以下正文保留为历史规划与操作契约。
>
> 与正文的两处实际偏差需注意：① 磁盘仅约 0.4GB，build 依赖改用 pnpm 全局 store 硬链接
> （frozen/offline），smoke 安装部署到 tmpfs；② 首次 build 因 webpack 磁盘缓存 ENOSPC 中止，
> 重跑仅将 `.next/cache` 指向 tmpfs（未改配置/脚本）。

## 证据边界（2026-09-13）

本轮只读研究和任务文档写入；没有 bump/install/build/pack/publish/commit/push/tag、创建发布目录/worktree、认证修改、业务代码修改或服务操作。固定源码 H=`8ad6e95d1f2755a9094f68943b2081b62e65f8b0`。主目录三个 `.pi/agents/trellis-{check,implement,research}.md` 是用户修改，禁止覆盖、暂存或打包。

实际只读命令：`git status --short`、`git rev-parse HEAD`、`git diff --name-status 0a4cd3e69201f32950b8b5d68443fe363d349e99 HEAD`、受限 `npm config get`、显式 npmjs registry 的 whoami/view（fetch-retries=0，fetch-timeout=20000）。未读取 auth 配置全文或输出凭据/授权链接。

| 项目 | 新鲜结果 |
|---|---|
| HEAD | 精确 H；只有三个用户 agent 修改及本任务未跟踪 |
| npm view @xup3ng/pi-web version dist-tags --json | 0.9.2 / latest=0.9.2 |
| npm view @xup3ng/pi-web@0.9.3 version dist.integrity --json | E404；当前未查到，不是永久预留，不能排除曾发布后删除 |
| npm whoami --registry=https://registry.npmjs.org/ | E401；当前不可认证，不声称有发布权限或已确认 2FA 状态 |
| Node / npm | v26.1.0 / 11.13.0；engines >=22.19.0 |
| 配置 | registry=https://registry.npmjs.org/；@xup3ng:registry=undefined；tag=latest；access=null；ignore-scripts=false；项目 .npmrc 不存在 |
| 配置文件位置 | userconfig=~/.npmrc；globalconfig=当前 mise Node 26.1.0 的 etc/npmrc；未读取内容 |

后续隔离 cwd / HOME / 环境可能改变配置优先级（CLI、env、项目、用户、全局）。仅按键查询，registry URL 去除 userinfo/query/fragment 后记录；不使用 npm config list 或打印 env/auth 文件。安装/build/smoke 不继承认证环境；publish 独立交互终端仅获取必要 npm 权限。发布前重新检查 scoped registry，并明确覆盖 `--registry=https://registry.npmjs.org/ --@xup3ng:registry=https://registry.npmjs.org/ --tag=latest --access=public`，不依赖默认值。

## 实际脚本和产物契约

证据：`docs/release-npm.md` 全文、`scripts/release-npm.sh` 全文、cross refs `scripts/release-personal.sh`、`.github/workflows/release-personal.yml`、`docs/release.md`；`AGENTS.md` Quick Start、README.md:166-168。

- AGENTS 禁止 **during dev** next build；README 明确 leave builds for release work，docs/release.md 明确 release exception。因此不是绝对禁止发布构建。上个 09-12 任务的“即使 candidate 也不 build”是该合并/dev 验证任务的授权边界，不沿用为本任务发布许可。仍须本次最终审批明确：**仅隔离发布目录使用项目既有 `TURBOPACK= npm run build`，不得在主 dev checkout 执行**。如执行时新 instructions 绝对禁止则停止，不绕过。
- build 实际是 `next build --webpack`，不是 standalone 构建命令。`next.config.ts` 没有 `output: 'standalone'`，有 configDir tracing root、external packages 和从 package.json 读取的 NEXT_PUBLIC_APP_VERSION。因此既有契约是预构建 `.next` + 安装生产依赖 + `next start`，不是无依赖 `.next/standalone/server.js`。不添加 standalone 模式或修改业务配置。
- `bin/pi-web.js` 使用包目录 cwd，解析 next CLI，以 Node 启动 `next start -p ... -H ...`；支持 `--no-open`。所需 `.next/BUILD_ID`、server/static、构建/路由/prerender/required-server-files manifests 和完整 bin helpers 必须实测。external SDK、undici、web-push、node-pty 依赖靠安装提供。
- 无 prepack/prepare/prepublishOnly/prepublish/postpack/publish/postpublish/version lifecycle。`postinstall=node bin/prepare-terminal.js` 在 macOS 给 node-pty spawn-helper 加可执行位；依赖自身 install scripts 也可能写原生产物。不得复用主 node_modules 的 symlink/hardlink。
- `files` 为 bin、.next（排除 cache/dev/**/*.js.map）、public、next.config.ts、package.json；npm 自动包含根 README/LICENSE 等。实际打包清单仍需验证，不能仅凭 files 推断没有机密。根 package-lock 通常不发布；pnpm-lock 不在白名单。scripts/ 不在白名单，故安装包的 release 脚本不能当发布运行入口；bin 中 postinstall 引用文件必须存在。
- npm run release 把 bump/build/publish 连起来，缺隔离/确认/回执门，禁止使用。release-npm.sh 检查整个 cwd 干净、whoami=xup3ng，随后 bump→build→publish dry-run→回车→目录 publish→最多18次10秒 view version→git add 两文件并 commit。缺点：dryrun `|| true` 吞退出码，只 grep 四个文件，不验证 runtime/密钥/integrity；真实 publish 重新打包；registry/tag 不显式锁定；只看聚合 version；失败后无法区分远端成功、本地验证失败；commit 非可选。**不原样运行、不在本任务修脚本**，采用下述拆分手册并保留既有 build 脚本。
- personal 脚本会 push/tag 并触发 GitHub Release，完全不属于本次范围。docs/release.md 的 upstream 包名、tag/push/GitHub 步骤也不适用。未发现本 fork npm 发布强制 changelog 文件/skill；不修改 changelog。若新增 release notes 范围，先读适用 skill，按实际提交生成，不沿用 upstream 发布命令。

## 版本/锁与许可证

package.json=0.9.2；package-lock lockfileVersion=3，顶层和 packages[""] 的 name/version 均一致；dependencies/devDependencies/engines 与 package.json 相等。SDK 四包=0.85.1，Next=16.3.1。pnpm lockfileVersion=9.0，根 importer 没有发布包 version；无需为纯 bump 修改 pnpm-lock。npm ci 使用 npm lock，不重解依赖或混用 pnpm；frozen/ci 失败或锁漂移先停止，不默认重生成。

审批后显式 `npm version 0.9.3 --no-git-tag-version --ignore-scripts`，不是 patch 猜测；审查只变 package.json.version、package-lock.version、package-lock.packages[""].version 三处。保留两个 lock 的依赖图及 pnpm 全文。若 npm 改动其他字段，停止并解释，不随手接受 churn。

根 MIT LICENSE 保留 Copyright (c) 2026 agegr；public/icons/catppuccin/LICENSE 保留 2023 Catppuccin/thang-nm。公开 files 还含四个 Cascadia Code woff2（提交 2679843、app/globals.css:4），public/fonts 未发现独立许可文件。**字体来源/再分发许可证及必要声明完整性未证实，为 publish 阻塞**；MIT 根许可证不能自动覆盖第三方字体。审批后只读追溯来源/比对可信许可证；若需新增许可材料，精确 H+仅版本改动范围不足，须先单独审批并提交许可修复、更新源码基线和重新审计，不能默默塞入包或删字体。还需产物级检查打包 JS 中第三方 license 注释/声明保留；不能将此次研究称完整法律审计。

## 历史可复用证据

09-09 的 prd/design/implement/task manifests 为规划/过程，不含完整最终发布记录。09-12 research/merge-plan.md 已按需检索会话 `01a08315-1ca7-7aa2-b65c-a5e64d70fe29`：用户报告成功，assistant 报告 latest 0.9.2、checksum 核对、origin/personal=8e49a9d、1091 tests。本次复用该明确来源的历史摘要，不再次广搜会话、不把旧记录当当前验证。

09-12 `research/revalidation-report.md`：测试 tree=`0a4cd3e69201f32950b8b5d68443fe363d349e99`，manifest sha256=`668dc9975e172604871cb093d3f2405af5194dec3c4b140f457bf5a7735e85e1`。本次 git diff 该 tree 与 H 只有 09-12 任务文档新增，业务内容相同。可复用为源码回归证据：1222/1222 unit、tsc、Trellis 1280/744-touch/390 三尺寸连续两轮、原 E2E 当次完整 dev 运行通过。lint **exit 1，14 errors，非通过**，ChatInput 7 / ChatMinimap 5 / SessionSidebar 2，均 preserve-manual-memoization，完整诊断与已接受记录一致。历史原 E2E 分页/minimap 时序失败未被一次通过抹除。

限制：旧验证使用 Node26 / pnpm 已有依赖、浏览器 revision1234 而预期1243；当前发布独立 npm ci 可能有不同解析结果。旧测试从未 build 或 production start；不替代新生产 build、pack/install/runtime tests。质量 spec `frontend/quality-guidelines.md` 目前是占位模板，不能引用为不存在的 lint 全绿豁免规则。无业务变更可省重复完整 dev E2E，但隔离新依赖下建议 unit/tsc、lint诊断比较；新错误停止，不修改业务来强行发布。

## 审批后分阶段计划（目前全部未执行）

### A. 前置/隔离
1. 保存 H、主 index/status、三用户文件内容 hash/模式/二进制 diff（敏感副本不写入将发布包）。发布目录用独立新 mktemp 路径，确认 realpath 不在主目录，不复用旧测试目录。主/现有安装服务端口仅只读盘点，不 kill/restart。
2. 推荐 `git archive H` 导出精确已提交树，**不是 cp/rsync 主目录**。若用户另选新独立 worktree 也只能基于 H，依赖/.next 私有；本轮未创建。导出不含当前未提交用户内容，也不含本次未跟踪任务。导出中的已提交 .pi/.trellis 不等于用户脏文件，且不得进入 tarball。
3. 发布源码、npm cache、HOME、XDG config/data/cache、TMPDIR、PI_CODING_AGENT_DIR、smoke prefix/project 各自隔离；允许列表构造子进程 env，清除 provider/npm/Git/代理凭据及真实数据路径，禁复制用户 auth/settings/sessions。测试项目独立 git fixture，非 linked worktree（避免 projectRoot 指回主仓库）。不共享可写依赖，不接触主 .next。
4. 先解决许可证与认证阻塞。用户在自己的交互终端处理 npm browser login/2FA；优先新权限0600的临时 `NPM_CONFIG_USERCONFIG`，只用于 publish 子过程，不更改全局配置/认证。本 agent 不读/打印 OTP/token/授权 URL，不存入任务日志；用户确认 whoami=xup3ng 后还需实际授权包写权限。E401 不可用 build 掩盖。

### B. 准备和 build
5. 再查 exact 0.9.3/latest；占用、非404网络错误或latest变化停止，不自动选0.9.4。按上述精确 bump，记录 H+三处版本 patch/hash 作为源映射，业务源码 hash 与 H 一致。
6. 私有 `npm ci --cache <private-cache>`（registry显式锁定，必要代理仅脱敏审查），记录 Node/npm/platform/lock hash 和 install 脚本结果；失败不改锁。检查依赖树及许可证。unit/tsc/lint如执行都在该隔离环境，不能以14总数相同代替逐条诊断。
7. **仅隔离发布目录** `TURBOPACK= npm run build`；使用已有 package build，不直改 Next 配置、不在主 dev 目录运行、不跑并行 dev 占同一 .next。构建失败、生成文件要求改业务或范围外许可证修复均停止另议。

### C. 审计唯一 tarball / production smoke
8. `npm pack --dry-run --json --ignore-scripts` 成功并保存结构化清单；然后 `npm pack --json --ignore-scripts --pack-destination <artifact-dir>` 生成唯一候选。无 prepack，所以跳 lifecycle 不漏构建；先已显式 build。比较实际 tgz 文件表与 dryrun，核对 name=@xup3ng/pi-web、version=0.9.3、bin/全部helpers、README/LICENSE、字体/icon许可、public assets、next.config.ts、.next 构建产物，记录 size/count、SHA256、SHA512 SRI。
9. 解包前检查 traversal/绝对路径/symlink 越界；检查所有归档项和解包内容（含点文件、manifests、压缩/二进制可解析内容）。禁止 .git/.pi/.trellis、.env/.npmrc、auth/token/OTP、session/attachments/cache/dev、source maps、主目录绝对路径或其他隐私。Next manifests 可能嵌入 configDir：区分运行必要性和泄漏，记录中性隔离路径；任何主路径/凭据阻塞。不直接编辑 tgz“修好”；产物异常须重新准备/build/审计并更新 hash，内容级变更需新审批。
10. 在第二独立 prefix+HOME+agentDir+fixture project 安装这个 **确切本地 tgz**（仅生产依赖，允许既有 postinstall，不全局安装；无主依赖回退）。证明 devDependencies 省略仍可运行，尤其 next.config.ts 解析、外部 SDK/node-pty、bundled Markdown/Mermaid 等。`node <installed-package>/bin/pi-web.js --help`，再以 `--hostname 127.0.0.1 --port <空闲端口> --no-open` 启动，设置 skip-version-check/telemetry关闭；只停止自己创建的 PID。
11. 在 production runtime 检查首页和 JS/CSS/字体、显示版本0.9.3与SDK0.85.1、fixture sessions/projects/history/Trellis展示；本地 node-pty spawn/终端 WS 基础交互可用，不打开真实 shell 数据或联系 provider。空数据API不访问真实 HOME，合成会话校验读取正确。保留HTTP/浏览器/退出清理证据；dev E2E不能充当此结果。Linux测试不证明macOS/Windows原生模块，记录平台限制。
12. `npm publish <同一tgz绝对路径> --dry-run --ignore-scripts --registry=https://registry.npmjs.org/ --@xup3ng:registry=https://registry.npmjs.org/ --access=public --tag=latest`，退出码必须0；重新 hash 无漂移。dry-run不证明写权限/2FA通过。tgz冻结后不重新pack或目录publish。

### D. 不可逆 publish / 有界验证
13. 确认最终审批、许可证/构建/smoke清单通过、包未占用、身份/目标正确。用户终端对 **已审计同一 tgz** 执行上步去掉 `--dry-run` 的命令，处理 browser/OTP。publish 有副作用，版本不能覆盖，即便unpublish也不能重用；不把unpublish/deprecate/dist-tag移动当自动回退。
14. 发布日志仅保存脱敏时间/exit code/name/version/registry/摘要与 tarball hash，回执不是另跑一次的理由。若命令超时/失联/非零但可能已上传，状态=结果待核验，先 exact版本+tarball查询；只要有成功回执或版本可见，绝不再次publish。只有明确未上传且精确查询确认未占用，排除最终一致性并人工确认后才考虑重试；不自动循环发布。
15. 有界轮询：最多30次、间隔10秒，每个npm请求20秒超时/0重试，整个核验墙钟总预算10分钟。显式npmjs查询 `npm view @xup3ng/pi-web@0.9.3 name version dist.tarball dist.integrity dist.shasum --json` 与 `npm view @xup3ng/pi-web dist-tags --json`。验证 exact身份/version、latest=0.9.3，下载返回的可信https npmjs tarball（拒绝带凭据/异常跨域目标）到隔离目录，计算 SHA512 SRI 与远端 dist.integrity 和已审计tgz一致，sha1若返回也比对。超时/不一致停止，保留“已上传但核验待定/冲突”，不回滚、不重发、不擅改latest；手工后续核验同版本。

### E. 可选本地 commit 与真实发布顺序
推荐与 fork 文档一致：**先 npm 成功且 exact/integrity/latest 核验，再可选本地 commit**；不自动push/tag。发布前用 H+版本patch+锁hash+tarball hash+时间记录可追溯，避免“尚未发布却标为已发布”提交。

- 用户若批准 commit：主HEAD仍须H，package/locks无用户改动且index为空；记录三agent当前hash与最初一致，无并发修改。只把验证过的 package.json/package-lock.json 及已批准新增的 public/fonts/LICENSE-cascadia-code.txt、public/fonts/NOTICE.txt 四文件内容移回主目录（会触发HMR可能重编译，不restart；作为可选commit范围明确审批），不复制 .next/node_modules/generated config。若用户对允许文件也有改动或HEAD/index已变化则停止，不stash/reset，不覆盖。
- release task只能逐文件允许列表：prd.md/design.md/implement.md/release-scope.md/task.json/implement.jsonl/check.jsonl/research/release-plan.md，以及 research/license-fonts.md、research/preparation-report.md、research/check-report.md，及未来单独审核脱敏的 research/release-result.md。不 `git add .`、不整目录扫入临时日志。`git add -- <精确允许文件>` 后 `git diff --cached --name-only` 必须等于批准子集，逐条检查 cached diff（仅两package版本、两public/fonts许可新增与任务记录），确认无预先 staged 用户内容；提交前后重新检查三agent hash/内容/模式不变。存在预先 staged 内容时停止，不默认替用户清理index或提交。
- 普通 `git commit` 仅允许审核过index；检查hooks不会自动bump/push/tag或改业务，异常暂停，不绕过hooks。提交后核对tree与已发布源映射，只差任务记录；记录commit SHA，三agent保持未提交。无需提交后重新pack/publish。
- 若用户不批准 commit：主包文件保持0.9.2；任务记录明确“registry 0.9.3已发布，本地版本未提交”，保留隔离源patch/tgz/hash/回执，以后另行批准同步，不能重复发布弥补未commit。
- 真实失败且明确未上传：不移回主版本、不创建成功release commit；保留失败记录和证据。远端成功但验证待定或commit失败：保留0.9.3已占用/待核验事实，commit待办，不回滚远端、不amend历史、不重发。超出基线/允许文件需要重新审批。

## 阻塞与最终门

已知阻塞：当前npm E401；Cascadia字体许可材料未确认。待批准而非已执行：独立安装/build/pack/runtime/publish及可选commit。技术执行门：ci/build/smoke、包无秘密/主路径、same-tgz integrity、exact版本占用与latest均需新鲜验证。任何门失败只更新研究/结果并停下。无业务修复、全局安装升级、服务restart、push/tag/GitHub Release、旧任务归档；不自动清理用户目录/既有worktree。
