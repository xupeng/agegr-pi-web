# 独立 baseline 与实际系统包原故障验证

## 范围与独立来源

- 只验证原 ref `128fc3c7dd8cdf60aa4ebe12e7ec3c75c964f61f`，未读取/复制主树候选产品改动，未委派，未修改任何产品源码、lock、系统扩展或真实设置。
- 实际主树分支核验为 `ask-user-host-integration`。任务最新 PRD/design/implement、reproducible-test-plan、两个 system 决策、quality-guidelines 和 AGENTS 已读。历史 fixed dependency/facade/fallback 未执行。
- 第一条命令实际核验：`TMPDIR=/home/xupeng/.cache/pi-tmp/01a10fa1-d7ee-753b-a8de-d7aa28090808`，700/user-owned，**不是 `/tmp`**；初始 `PI_TASK_TMPDIR` 未设置，有限命令由 pi-tmp-run 注入。
- 新 worktree 创建前已检查名称不存在，普通父目录为 `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees`。未触碰旧 worktree，未复制其他 node_modules/.git/.codegraph。
- 所有证据保存在本任务 `research/`；下面的计数均为实测，不是历史基线抄录。

## 唯一、保留的验证依赖树

```text
/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47
```

创建与安装命令：

```sh
git worktree add --detach /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47 128fc3c7dd8cdf60aa4ebe12e7ec3c75c964f61f
cd /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47
npm ci --include=dev
```

安装退出码 **0**，added 906 / audited 907；Node `v24.21.0`、npm `11.19.0`。安装日志同时报告 **17 vulnerabilities（6 low / 4 moderate / 7 high）** 与 install-script allowScripts 提示；未运行 audit fix 或更新依赖。安装前后和验证结束 `package.json` / `package-lock.json` SHA256 不变：

- package.json：`8d6f804dcbc7118c979d6c0a1e88c211d543b254125000d5a34ad04e15ca8713`
- package-lock.json：`18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f`

四个 direct host 包 `@earendil-works/{pi-agent-core,pi-ai,pi-coding-agent,pi-tui}` 均为 **1.0.0**。探针对 `package.json.dependencies`、lock 根 dependencies、lock `node_modules/<name>.version`、实际安装 manifest 四方逐个作相等断言；解析的 ESM entry/manifest 均在本 worktree 的 node_modules，记录 manifest hash 与 lock integrity，见 `baseline-probe.log.sdkIdentity`；并核验 npm 生成的 node_modules/.package-lock.json 四包 version/integrity 与仓库 lock 相等，结果在 `baseline-summary.json`。`npm ls --depth=0` SDK 四包退出码 0，无 pnpm/.ignored/.modules.yaml 混合树痕迹。npm 自己生成的 `.package-lock.json` 不作为混合树证据。实际工具版本：TypeScript `5.9.3`、ESLint `9.39.4`、eslint-config-next `16.3.6`、jiti `2.7.0`、嵌套 react-hooks 插件 `7.0.1`；汇总见 `baseline-summary.json`。

## 同树三件套实测结果

| 验证 | 文件/用例数 | 结果 | 退出码 | 证据 |
| --- | --- | --- | --- | --- |
| `node_modules/.bin/tsc --noEmit` | 原 ref 全部 TS include | 无诊断 | **0** | baseline-tsc.log |
| `node_modules/.bin/eslint . -f json` | **704 files** | **0 errors / 0 warnings** | **0** | baseline-eslint.json / baseline-eslint-counts.json |
| 最终 `npm test`，env -i + namespace | **2758 tests / 13 suites** | **2754 pass / 4 fail**；cancelled/skipped/todo 均 0 | **1** | baseline-tests.log / baseline-test-final-exit.log |
| project-trust 独立归因诊断 | **26 tests** | **26 pass / 0 fail** | **0** | baseline-trust-diagnostic.log |
| 实际系统包 original-ref 探针 | 两个 gate 场景、均为真实 SDK discovery/runner | 原故障断言全部成立 | **0** | baseline-probe.log / baseline-probe-wrapper.log |

**不能报告全量 npm test 全绿。** 最终 4 个失败逐项归因于强制离线环境与既有 mocked update 测试的假设不一致，而非本任务候选改动：

| 原文件锚点 | 最终失败现象 | 原因 |
| --- | --- | --- |
| lib/plugin-updates.test.mjs:27 | checked 为 []，期望 [first] | offline guard 先返回，未执行注入的 mock runCommand |
| lib/plugin-updates.test.mjs:47 | “Update checks are disabled while PI_OFFLINE=1.”，期望 not installed | guard 先于安装/命令错误处理 |
| lib/plugin-updates.test.mjs:68 | 两个 state 都为 error，期望 update-available/up-to-date | guard 先于 mocked npm 版本比较 |
| lib/plugin-updates.test.mjs:84 | error，期望 up-to-date | guard 先于 mocked Git HEAD 比较 |

共同 owner 是 `lib/plugin-updates.ts:166-168,197-198`；测试没有在自己的 mocked 场景覆盖/清理 `PI_OFFLINE`。未关闭安全要求、未补丁 baseline、未跳过这四个测试来制造全绿。

### 测试环境与归因过程（完整披露）

1. 首次三件套 wrapper 隔离 HOME/agent、设 PI_OFFLINE/JITI，但继承了其他父环境；发生在用户追加 env-i 要求之前。其 npm test **2758 / 2731 pass / 27 fail / exit 1** 留在 `baseline-tests-initial.log`，**不作为最终安全基线**。tsc/lint 的安装树仍是同一树。
2. 按追加要求重跑：`env -i` 仅保留 PATH/TMPDIR/PI_TASK_TMPDIR/HOME/PI_CODING_AGENT_DIR/PI_OFFLINE/JITI_FS_CACHE，**2758 / 2731 pass / 27 fail / exit 1**，见 `baseline-tests-cleanenv-unmasked.log`。27 中 4 为上述 offline；另外 23：app/api/mcp/route-add 7、app/api/project-trust/route 2、lib/builtin-extensions 1、lib/project-trust 13。
3. 23 个失败原因：scratch 位于实际 `/home/xupeng` 后代，而真实 `/home/xupeng/.agents/skills` **目录存在**（仅 stat，未读取其中内容）。SDK `dist/core/trust-manager.js:151-166` 扫描 cwd 所有祖先 `.agents/skills`，只排除当前 **隔离 HOME** 的 user skill 目录；于是 clean fixture 也被认成 requiresTrust。HOME 隔离本身不足以隔离这一存在性扫描。
4. 仅在 bwrap 子进程 mount namespace 中以 tmpfs 遮蔽 `/home/xupeng/.agents`（不改真实目录），project-trust 26/26 通过，成功 scratch 自动清理。最终全量同时遮蔽 `/home/xupeng/.pi`，阻止真实设置/凭证目录读取；不启动产品服务。
5. 全量 namespace 首次 attempt 漏了 `--dev-bind /dev /dev`，只读 `/dev/null` 导致 git/spawn/bash/MCP fixture 等 **35 个 harness failures** 加 offline 4（2758 / 2719 pass / 39 fail），见 `baseline-tests-namespace-attempt1.log`。加 dev-bind 后这些 35 个全部消失，最终只剩 offline 4；没有改源码。

最终测试命令（从主树执行 wrapper，内部 cd 到 baseline）：

```sh
B=/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47
pi-tmp-run --keep-on-failure ask-user-baseline-final-tests -- bash -c '
  mkdir -p "$PI_TASK_TMPDIR/home" "$PI_TASK_TMPDIR/agent"
  cd "$1" || exit
  bwrap --ro-bind / / --dev-bind /dev /dev \
    --bind "$PI_TASK_TMPDIR" "$PI_TASK_TMPDIR" \
    --tmpfs /home/xupeng/.agents --tmpfs /home/xupeng/.pi \
    env -i PATH="$PATH" TMPDIR="$TMPDIR" PI_TASK_TMPDIR="$PI_TASK_TMPDIR" \
      HOME="$PI_TASK_TMPDIR/home" PI_CODING_AGENT_DIR="$PI_TASK_TMPDIR/agent" \
      PI_OFFLINE=1 JITI_FS_CACHE=false npm test
' bash "$B"
```

未继承真实 provider env、代理 env、NODE_OPTIONS；未读取真实 auth/settings 内容，也没有真实 model 请求。套件自己的本地 faux/MCP/stdio 测试进程不等于产品服务启动。namespace 是验证隔离，不是产品资源 facade。

## 实际系统包、宿主 identity 与原故障

实际包来源：`/home/xupeng/dev/personal/pi-extensions/pi-ask-user`；**git 仓库根在该包目录本身**，不能从其父目录查 git。只读 HEAD 为 **`59e0256c869e9ce04abffc1204537c7bf1501450`**，开始/结束 git status 均空，HEAD 与必要源码 hashes 开始/结束一致。本次实测 revision 不同于历史 provenance 的 revision，**不把历史 SHA 当当前事实或产品 pin**。

`baseline-probe.mjs` 只复制 11 个实际文件：package.json、index/bridge/tool/types/validation/format、三个 tui-*.ts、LICENSE。无 node_modules/.git、无 symlink；源/副本逐文件 SHA256 相等，完整哈希表在 `baseline-probe.log.external.copiedHashes`。不是人工工具 fixture，也不是 baseline portable 包。实际 manifest 的 peers 为 `*`，dev SDK 为 0.85.1；**不安装外部 devDependencies**。独立 copied package 用 Node 自己解析四个 host peer 均 MODULE_NOT_FOUND，但真正 SDK discovery 能加载并执行，其 peers 经本验证树 host alias 提供，实际 host 四包为 1.0.0。

import SDK/Web 前，外层 `env -i` 已设置隔离 HOME/agent，探针再次断言环境与 original ref；ModelRuntime 的 authPath/modelsStorePath 都是隔离路径，modelsPath=null、refreshOnCreate=false、allowModelNetwork=false。没有创建 AgentSession/prompt，也没有 faux/真实模型请求需求。使用真正 `DefaultResourceLoader` 与 `ExtensionRunner.getAllRegisteredTools()`，`SettingsManager.inMemory({ packages:[copiedPackage], extensions:[] })`，noSkills/noThemes/noContextFiles/noPromptTemplates=true。

| 观测 | PI_WEB_ASK_USER=1（原 gate 开） | PI_WEB_ASK_USER=0（原 gate 关） |
| --- | --- | --- |
| load order | copied index.ts → inline:pi-web-ask-user | 同左 |
| registrations | external + inline 同名 ask_user | external 有 ask_user，inline tools 无该项 |
| diagnostics | 1 个同名 Tool ask_user conflict，归于 inline | 无冲突 |
| runner effective count/source | 1；外部 package/sourceInfo origin=package, scope=user | 同左 |
| exposure | raw undefined，SDK effective **direct**；inline 的 model-only 未赢得所有权 | 同左 |
| execute context | mode=rpc、hasUI=true，真正外部 definition.execute | 同左 |
| execute error | exactly one synchronous host bridge … **(got 0)** | 同左 |
| Web lookup/open / pending | **0 / 0 / null** | 同左 |
| posted / successful terminate / ui.custom | **0 / 无结果 / 0** | 同左 |

根因锚点：

- 原 baseline `lib/ask-user/extension.ts:25-35` 只 registerTool，未注册 bridge listener；gate 只控制 inline 注册。
- SDK `dist/core/resource-loader.js:506-512,545-585` package 先加载、inline 后加载，保留两者并报告冲突；`dist/core/extensions/runner.js:410-419` 同名 first registration wins。
- SDK `dist/core/agent-session.js:1102-1103` 的 exposure 缺省为 direct；源包 `tool.ts:134-159` 无 model-only，成功时才 posted/terminate。
- 实际包 `index.ts:20-33` 在 execute open 阶段解析同 loader bridge；只有 `ctx.mode === "tui" && ctx.hasUI` 才允许 terminal fallback。
- 实际 `bridge.ts:113-140` 同步计数并拒绝 got0；RPC hasUI=true 不能以 TUI custom 冒充 Web host。

可复现探针命令：

```sh
B=/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47
P=/home/xupeng/dev/personal/forked/agegr-pi-web/.trellis/tasks/10-06-ask-user-host-integration/research/baseline-probe.mjs
E=/home/xupeng/dev/personal/pi-extensions/pi-ask-user
pi-tmp-run --keep-on-failure ask-user-baseline-probe -- bash -c '
  mkdir -p "$PI_TASK_TMPDIR/home" "$PI_TASK_TMPDIR/agent"
  env -i PATH="$PATH" TMPDIR="$TMPDIR" PI_TASK_TMPDIR="$PI_TASK_TMPDIR" \
    HOME="$PI_TASK_TMPDIR/home" PI_CODING_AGENT_DIR="$PI_TASK_TMPDIR/agent" \
    PI_OFFLINE=1 JITI_FS_CACHE=false \
    timeout 90s node --experimental-import-meta-resolve "$1" "$2" "$3"
' bash "$P" "$B" "$E"
```

探针是 **baseline-only**（断言原 HEAD），不是候选验收脚本。外部未来更新时应重新记录 HEAD/hash；不能把本报告当成未来版本验证。

## 清理、保留与移交

- 成功探针 scratch `ask-user-baseline-probe-igy5fi14` 已由 wrapper 自动清理；成功 trust diagnostic scratch 同样自动清理。
- 两次探针作者错误已纠正：attempt1 用 CJS resolve 查询 import-only SDK exports 抛 ERR_PACKAGE_PATH_NOT_EXPORTED，改为从 baseline parent URL ESM resolve；attempt2 错把 RegisteredTool 当有 extensionPath，改为读取真实 `sourceInfo.path` 并保留对象 identity 断言。是验证脚本错误，不是 SDK/package 失败。失败日志保留 `baseline-probe-attempt{1,2}-wrapper.log`。
- 按 --keep-on-failure 保留以下**本次拥有的** cache scratch（共同父目录为首次 TMPDIR，7 idle days 过期）；正式日志已存 research，不依赖这些 cache 长期存活：
  - ask-user-baseline-checks-9xv29hnh（首次非 env-i suite）
  - ask-user-baseline-tests-cleanenv-nsvhhue3（祖先污染归因）
  - ask-user-baseline-probe-hkbc29oe（探针 attempt1）
  - ask-user-baseline-probe-3kwq3vui（探针 attempt2）
  - ask-user-baseline-final-tests-a42uw06e（namespace /dev attempt1）
  - ask-user-baseline-final-tests-ifvkyuen（最终 offline 4 failures）
- wrapper 结束均回收自己的进程组；结束进程参数扫描未发现 baseline/probe/trust-diagnostic 相关残留。没有启动/重启产品服务，没有触碰既有 PID、部署/服务脚本。
- 验证结束 detached baseline `git status --short` 空，原 ref/lock 未改，外部 status 空。
- **必须保留上述唯一普通磁盘 worktree 及 node_modules，供主代理随后 candidate 验证复用；它不在自动清理 cache 内。** 本代理未复制候选。候选装载/验证由主代理执行；应先保全本 baseline 日志并核对 candidate 的 package/lock 与本树依赖一致。
- 主代理 candidate 验证完成、检查无未保存改动后，再由主代理执行 `git worktree remove <上述完整路径>`；本代理不擅自清理。
- 未运行 next build、产品服务、浏览器/e2e、真实 TUI/PTY、Safari/Windows、部署/重启、git commit/push。浏览器与候选完整门禁仍由主代理负责，loader/source 故障证据不能替代这些验收。
