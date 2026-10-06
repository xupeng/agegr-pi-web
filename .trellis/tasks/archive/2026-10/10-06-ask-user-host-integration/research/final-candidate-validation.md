# 最终 reviewed candidate 独立门禁与实际系统包 SDK smoke

## 精确来源与安装树

本轮只验证主代理已装载的最终 validation snapshot：

- ref **`8a4699c435eddc06ae3b3f23f088d0896d75cddb`**
- tree **`c15f300519f7d6e8f557fa098ec44d25d64cee8e`**
- worktree `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47`
- 前轮原 ref baseline 的 **同一 clean `npm ci --include=dev` node_modules**，本轮未安装、未复制依赖、未创建新工作区。Node v24.21.0 / npm 11.19.0；SDK 四 direct host 包均 1.0.0。
- package.json SHA256 `8d6f804dcbc7118c979d6c0a1e88c211d543b254125000d5a34ad04e15ca8713`
- package-lock.json SHA256 `18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f`

manifest/lock 与 baseline/preliminary 完全一致；所有旧证据保留，未覆盖 baseline 或 d6 preliminary 的任何输出。用户所述 expected manifest 为 102 paths，不等同 git content diff 的口径；本次实测相对 baseline 的 no-renames 差异 paths 仍是 72，raw snapshot 在 `final-candidate-snapshot.log`。未另行审计主代理 manifest 的每个预期项。

**没有产品/既有测试/lock/配置修改，没有恢复旧 AskUser API。** tracked diff 在开始/结束为空，ref/tree 未变；浏览器启动后出现主代理自己的 `?? test-results`，本代理没有删除/更改它或触碰其 PID。该产物对 smoke 的影响与处理在下节完整披露。

## 最终计数与退出码

| 检查 | baseline | preliminary d6 | 最终 reviewed snapshot | exit |
| --- | --- | --- | --- | --- |
| 类型 | --noEmit，无诊断 | --noEmit --incremental false，无诊断 | **--noEmit --incremental false，无诊断** | **0** |
| npm run lint | JSON 基线 0/0 | 通过 | **通过** | **0** |
| ESLint JSON | 704 files / 0 errors / 0 warnings | 703 / 0 / 0 | **703 / 0 / 0** | **0** |
| hermetic npm test | 2758 pass / 13 suites | 2743 pass / 13 suites | **2870 pass / 13 suites，0 fail** | **0** |
| 实际 installed SDK smoke | 原故障 got0 | 正常宿主链 | **重新执行全部断言通过** | **0** |

全量 cancelled/skipped/todo 均 0，耗时 `51016.322076ms`。三件套只跑原有 tsconfig，不删除、筛掉或重建 `.next`：开始时 **已有 `.next/dev/types`**，tsconfig 的 `.next/types/**/*.ts` 与 `.next/dev/types/**/*.ts` 原 include 保留，tsc 正常检查通过，没有真实 compile 诊断需要规避或源码修复。

正式产物全部以 `final-candidate-` 命名：tsc.log / lint.log / eslint.json / eslint-counts.json / tests-hermetic.log / test-counts.json / gates-exits.log / snapshot.log / summary.json。

## 新增 127 例：实际执行与归因

通过运行输出的成功标题 multiset 对照，而不是只数源码 `test()` 调用：

- preliminary→final：**新增 127、移除 0**；2743 + 127 = **2870**。
- baseline→final：净 **+112**；前轮 ownership/retirement 改造净 -15，加本轮127。
- lint 文件数不变：本轮修改两份已有 test file、规范与 e2e 驱动，不是新增127个文件，也不是换了规则/依赖。

实际分组明细与完整标题保存于 `final-candidate-count-diff.json`：

1. **18 activation parity 例**：6 exposure（implicit direct / direct / model-only / hidden / codemode / deferred）× 3 defaultActive（undefined / true / false）。每例分别创建 native SDK 与 Web projection 两个真实 AgentSession，比较初始激活、显式选择、真实 reload、录制的 system loadout tree navigation（false/true/false）与再关闭后的 native reload 行为。没有模型请求。
2. **108 selection parity 例**：上述18组合 × 6选择方式（empty/named/modifier/removed defaultTools、explicit SDK tools、excluded SDK tools）。实际运行 native/projected 两侧 activation 初值与真实 reload 对照。
3. **1 frozen-definition/no-mutation 例**：内部执行 codemode/deferred × 3 defaultActive 的6组 frozen RegisteredTool/definition 断言，确认投影 clone 的 defaultActive=false，原 definition/source/execute/schema/prompt 引用不被 mutate。

锚点：`lib/ask-user/discovery-host.integration.test.mjs` 后半的两个参数化循环、`lib/ask-user/extension-policy.test.mjs` 最后一例。本组使用小型 **protocol fixture** 定义不同 exposure/defaultActive，这是受控 SDK 激活语义对照；**不把它们冒充实际安装包127例验收**。

结论按 native SDK 1.0.0 激活权威解释：codemode/deferred 原本非 declarable，即使显式 defaultActive:true 也不会默认激活。转为 model-only 时 clone 归一化 false 防止凭曝光投影新增激活；不 mutate 原对象，不改写原设置，显式 selection/navigation/reload 沿用 native 行为。此处测试结果不是新的 Web 启用开关。

原 strict PI_OFFLINE=1 的4个 mocked plugin failures/exit1仍完整保留在 baseline-tests.log；最终对照的是既已审查通过的 hermetic mock-only worker baseline，不伪称原 strict suite 没有失败。

## Hermetic 条件与浏览器产物并发边界

三件套沿用成功 harness：pi-tmp-run 私有 scratch、env-i 白名单 HOME/PI_CODING_AGENT_DIR、PI_OFFLINE=1/JITI_FS_CACHE=false，bwrap **--unshare-net**、祖先 `.agents` 与真实 `.pi` tmpfs 遮蔽、dev-bind /dev；必要时仅 self-bind 此验证 worktree writable，主树仍 read-only。

验证专用 preload 未修改，hash **`8ea74f498b1146d99273c14d08a79a4119410465ab6fac81a443be29f17aebd5`**。只有 opt-in + lib/plugin-updates.test.mjs worker 文件名/目录名 + 完整 SHA256 **`99043c5dc642b3e70af10c72e6432c90379d562ff090be5a027e66e4ed170d11`** 命中才恢复这个 mock-only worker 的 offline=0；其余初始 offline=1，物理外网仍隔绝。未继承真实 provider/env/NODE_OPTIONS。

实际 runtime smoke 没有 NODE_OPTIONS/preload、没有 PI_TEST_MOCK_UPDATE_CHECKS，import 前断言两者不存在；SDK/Web import 前隔离 HOME/agent，始终 **PI_OFFLINE=1**，实际 getifaddrs 只有 **lo**。

### Smoke 首轮环境失败（不隐瞒、不改源码）

首轮 `final-candidate-installed-attempt1*` 的 exit1 发生在 import SDK 前：复用脚本第25行要求 `git status --short` 完全空，而主代理浏览器已创建 `?? test-results`。不是 compile/bridge/model failure，也没有执行 smoke 产品链。

不删除、不移动、不检查浏览器产物内容。重跑前外层严格确认：full status 仅空或恰好 `?? test-results`，`git diff --quiet HEAD --` 为0、external full status为空。然后仅在 smoke 子进程 `env -i` 显式加入：

```text
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0=status.showUntrackedFiles
GIT_CONFIG_VALUE_0=no
```

这使原 probe 的 git-status preflight只检查 tracked 内容，而不是把别人的浏览器输出认成源码修改；**没有改写 probe、Git 配置文件、candidate 或任何产品准入/来源/网络断言**。外层结束再次记录 full status 仍只有同一项、tracked diff为0、external full status为空。前后记录是 `final-candidate-installed-preflight.log`。其他未知 untracked 项会在前置白名单检查处拒绝，不能把这个特例当作跳过 candidate 完整性。

## 实际系统包 SDK smoke 结果

复用未修改 `candidate-installed-probe.mjs`，其 SHA256 前后为 **`713320d745c76c7e7a0f355d530bdbe391a2b134dc29dbd2785006fde1b5857d`**；传入本轮精确 ref作为断言，不从主树加载候选产品。

- 实际只读包：`/home/xupeng/dev/personal/pi-extensions/pi-ask-user`，HEAD **`59e0256c869e9ce04abffc1204537c7bf1501450`**，full status前后空。
- 独立 copied package：package.json/index/bridge/tool/types/validation/format/三个 tui-*.ts/LICENSE 共11文件，source/copy hashes逐一匹配，无 node_modules/.git/symlink；源HEAD/hashes在结束重核，和 preliminary hashes完全相同。
- 动态 ESM parent resolve 从本树加载 SDK/jiti；copied包自身Node不能解析host peers，真SDK alias加载成功。四directhost **1.0.0** 的entry、manifest hash、lock integrity与preliminary记录全部相同。
- 真 createAgentSessionServices / DefaultResourceLoader / createAgentSessionFromServices，SettingsManager.inMemory仅配copied真实包，noSkills/noThemes/noContextFiles/noPromptTemplates=true；ModelRuntime authPath/modelsStorePath私有、modelsPath=null、refreshOnCreate=false、allowModelNetwork=false。
- 真生产 createAskUserExtension/projectAskUserTools 与 AgentSessionWrapper.start/bind/send/shutdown；probe-owned registry Map，不注册或复用主 RPC registry。唯一 ask_user来源为copy/user/package、exposure **model-only**，execute/schema引用与元数据保留；Web inline host工具Map空。

实际执行的case/阶段，不只一个总数：

| Case/阶段 | 本轮重跑断言 |
| --- | --- |
| **4次模型 ask 回合**（首次 + 3次真实 reload 后） | 每次只1个provider请求、恰1个ask.opened；Posted 4 questions，pending/mirror一致，无自动额外模型跟随 |
| **1次 submit** | single/multiple/custom/supplement/skipped；unansweredIds=[skipped]；closed、内存/镜像清除，同session custom follow-up |
| **3次 reload 后 cancel** | 每次real AgentSession reload、rediscovery source/model-only保持；cancel同session续跑，无listener got2/重复open |
| **1次显式 actual execute** | mode=rpc/hasUI=true，实际外部execute返回 **terminate:true** / Posted；不增加provider调用，**ui.custom=0** |
| **1次 direct ask cancel** | closed + 同session follow-up，内存/镜像清空 |
| 汇总 | **5 opened / 5 closed，9 faux provider calls，3 real reloads，4 raw SDK ask tool-results，0 TUI custom** |
| shutdown | wrapper不再alive，局部registry清空，本次进程退出 |

9个provider调用分解为四次模型发问各1、五次submit/cancel continuation各1；显式direct execute没有模型请求。旧私有 askUser:false 和 PI_WEB_ASK_USER=0 同时存在仍可接入。faux provider只是验证响应脚手架，工具/schema/execute/bridge始终为实际包，未用默认小 fixture替代。

证据：`final-candidate-installed-probe.log` 内保存完整实际源HEAD/hashes、SDK identity、sourceInfo、各阶段call/open/persist与续跑记录；wrapper与exit文件对应最终成功运行。

## 可复跑命令

三件套完整 harness与命令见 `candidate-validation.md`，仅修改每个输出名为 `final-candidate-*` 并在开始核验本轮 ref/tree；实际执行命令依次为：

```text
node_modules/.bin/tsc --noEmit --incremental false
npm run lint
node_modules/.bin/eslint . -f json
npm test
```

运行 installed smoke 的核心命令（浏览器 test-results 存在时，先执行上述 full-status 白名单与tracked/external检查；不可盲用untracked特例）：

```sh
V=/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47
R=/home/xupeng/dev/personal/forked/agegr-pi-web/.trellis/tasks/10-06-ask-user-host-integration/research
pi-tmp-run --keep-on-failure ask-user-final-candidate-installed -- bash -c '
  V=$1; R=$2
  full=$(git -C "$V" status --short)
  test -z "$full" || test "$full" = "?? test-results" || exit 1
  git -C "$V" diff --quiet HEAD -- || exit 1
  E=/home/xupeng/dev/personal/pi-extensions/pi-ask-user
  test -z "$(git -C "$E" status --short)" || exit 1
  mkdir -p "$PI_TASK_TMPDIR/home" "$PI_TASK_TMPDIR/agent"
  bwrap --unshare-net --ro-bind / / --dev-bind /dev /dev \
    --bind "$PI_TASK_TMPDIR" "$PI_TASK_TMPDIR" \
    --tmpfs /home/xupeng/.agents --tmpfs /home/xupeng/.pi \
    env -i PATH="$PATH" TMPDIR="$TMPDIR" PI_TASK_TMPDIR="$PI_TASK_TMPDIR" \
      HOME="$PI_TASK_TMPDIR/home" PI_CODING_AGENT_DIR="$PI_TASK_TMPDIR/agent" \
      PI_OFFLINE=1 JITI_FS_CACHE=false GIT_CONFIG_COUNT=1 \
      GIT_CONFIG_KEY_0=status.showUntrackedFiles GIT_CONFIG_VALUE_0=no \
      timeout 90s node --experimental-import-meta-resolve \
      "$R/candidate-installed-probe.mjs" "$V" "$E" \
      8a4699c435eddc06ae3b3f23f088d0896d75cddb
' bash "$V" "$R"
```

后续任何candidate刷新必须重新记录ref/tree并重跑，不能把本次最终snapshot结果转嫁给另一树。

## 尚未覆盖、清理与移交

本代理没有启动服务或浏览器；主代理protocol/真实system包browser/unfiltered e2e报告需单独记录，不能用本SDK smoke取代General页面/form/刷新/跨设备/HTTP-SSE/生产startRpcSession注册/磁盘重水合证明。本smoke仍用probe-owned Map；未将负面版本/ack/冲突/关资源/inactive/hidden/Chat-only/子代理等全部实际包化，相关unitfixture证据与实际包正向smoke区分。

没有新增strict-open/outbox/exactly-once保证；镜像仍best-effort、follow-up仍fire-and-forget。未跑Safari/Windows/TUI/PTY/production分发/部署。本代理无next build、现有PID/服务操作、真实模型、系统配置/外部修改、commit/push。

成功gates scratch `ask-user-final-candidate-gates-b0vlpmh2` 与成功smoke scratch `ask-user-final-candidate-installed-0lxpvshr` 自动清理。首轮无继续用途失败scratch `ask-user-final-candidate-installed-apputxaz` 已按既有授权确认provenance、uid/非symlink/parent/exclusive flock、无本代理进程后逐路径清理；失败日志正式保存，没有无价值依赖/源码快照残留，见 `final-candidate-cleanup.log`。main浏览器产物与进程完全不碰。

**唯一 worktree/node_modules 继续保留直到主代理browser/最终验证结束，不 remove。** 开始/结束ref/tree、manifest/lock/probe哈希、external full状态与tracked diff证明在 `final-candidate-invariants.log`；主代理完成后再自行核验并 git worktree remove。
