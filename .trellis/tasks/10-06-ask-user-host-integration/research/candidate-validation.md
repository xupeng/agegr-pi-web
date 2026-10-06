# Candidate snapshot preliminary 验证

## 被测 snapshot 与唯一安装树

本报告只覆盖主代理预先装载的 validation-only snapshot：

- HEAD：**`d6be56655884c495e7534afcbc027a4a0546d66b`**
- tree：**`690e96fa14835fb44794c12de6f538423ec274ba`**
- 唯一 worktree：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47`
- 开始/结束 git status 均空，HEAD/tree 一致；没有由本代理装载、切换或改写 candidate，没有主树 tracked 产品修改。
- package.json SHA256 `8d6f804dcbc7118c979d6c0a1e88c211d543b254125000d5a34ad04e15ca8713`，lock SHA256 `18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f`，与 baseline 完全相同。
- 沿用 baseline ref `128fc3c7…` 时干净 `npm ci --include=dev` 创建的 **同一 node_modules**；本轮没有重新安装、没有第二棵依赖副本。Node v24.21.0、npm 11.19.0，SDK 四 direct 包仍为 1.0.0。
- 用户说明有 100 个预期 manifest paths；独立实测此 commit 相对 baseline 的 `git diff --no-renames --name-only` 为 **72 个实际差异 paths**，开启 rename 的 stat 为 58 项。manifest 覆盖数与实际 content diff 不是同一口径，本代理未把“100”冒充 git 差异计数，也未逐项审计主代理 manifest。原始记录见 `candidate-snapshot.log`。

**这是 snapshot preliminary 门禁，不是最终主分支/最终 candidate 验收。** trellis-check 若只在主树修复，主代理必须刷新 candidate、记录新 ref/tree 并重跑；本报告不能覆盖 snapshot 外的任何后续改动。

## 门禁、计数与 baseline 对照

| 门禁 | baseline | candidate snapshot | exit |
| --- | --- | --- | --- |
| 类型 | tsc --noEmit 无诊断 | **tsc --noEmit --incremental false 无诊断** | **0** |
| npm run lint | baseline ESLint JSON 0/0 | **npm run lint 通过** | **0** |
| ESLint JSON | 704 files / 0 errors / 0 warnings | **703 files / 0 errors / 0 warnings** | **0** |
| 同一 hermetic npm test | 2758 tests / 13 suites，2758 pass | **2743 tests / 13 suites，2743 pass / 0 fail** | **0** |
| 实际 installed package SDK/Web wrapper smoke | baseline 原故障 got0 | **正常 posted/terminate/submit/cancel/reload** | **0** |

candidate cancelled/skipped/todo 均 0，全量时长 `48920.421162ms`。正式文件：`candidate-tsc.log`、`candidate-lint.log`、`candidate-eslint.json`、`candidate-eslint-counts.json`、`candidate-tests-hermetic.log`、`candidate-gates-exits.log`、`candidate-summary.json`。

### 计数差异归因（不能凭“变小”判通过）

依赖与 lint 规则版本没有变化；JSON 文件集合实测 **23 个旧路径消失、22 个新路径出现，净 -1**，全部明细在 `candidate-count-diff.json`。主要是 portable/view/controller 路径迁移；移除 AskUser API/helper、内建 tool/bridge/package 源；新增 host protocol/policy/discovery/RPC/retirement 测试和 e2e harness。

全量用例净 **-15**，不是漏跑 glob 或换依赖树。相同 npm test 五目录 glob、相同 13 suites。去时长后的输出标题 multiset 有 **42 个 baseline-only labels、27 个 candidate-only labels**（净 -15），明细同文件；其余标题（含 13 个相同 suite summary labels）保持。标题差异包括改名/替换，不能等同宣称独立删除了 42 个源码测试。

- baseline-only 主要是已退役 settings helper/gate、自有 tool metadata/execute、Web portable bridge resolver 与 portable package discovery 测试。
- candidate-only 主要是设置 UI/API/helper/env 退役、system peer discovery/source、model-only/SDK active/hidden/defaultActive、多个来源 fail-closed、真实 AgentSession reload、bridge-only 身份/version/有界问题与真实 RPC startup fixture。
- view/controller 移动仍保留原标题；已有 admission/store/persist/rpc exposure/shutdown 等仍在全量 glob 内执行。
- baseline 原 strict PI_OFFLINE=1 的 **4 个 mocked plugin failures / exit 1** 仍完整保留，不因本候选 green 撤回披露；此处 apples-to-apples 比较使用前轮成功的 hash 限定 mock-only worker hermetic baseline。

## 完全相同的 hermetic 测试 harness

先核验实际 TMPDIR 仍为 `/home/xupeng/.cache/pi-tmp/01a10fa1-d7ee-753b-a8de-d7aa28090808`，不是 `/tmp`。有限命令由 pi-tmp-run 管理私有 scratch；import 前 `env -i` 隔离 HOME/agent，默认 PI_OFFLINE=1、JITI_FS_CACHE=false。

沿用原 `bwrap --unshare-net`、祖先 `.agents` / 真实 `.pi` tmpfs 遮蔽、`--dev-bind /dev /dev` 与同一 test-isolation-preload：

- preload SHA256 `8ea74f498b1146d99273c14d08a79a4119410465ab6fac81a443be29f17aebd5`
- 仅 `PI_TEST_MOCK_UPDATE_CHECKS=1` + `lib/plugin-updates.test.mjs` worker 路径名 + 完整文件 hash `99043c5dc642b3e70af10c72e6432c90379d562ff090be5a027e66e4ed170d11` 才恢复该 mocked-only worker 的 offline=0。
- 不是产品 gate 放宽；其他 workers 初始 offline=1；物理 network namespace 仍只允许本地 loopback，不能访问外网/宿主 localhost。
- gates 仅额外允许验证 worktree writable self-bind，供验证工具必要产物写入；主树仍 read-only。本轮使用 incremental false，不写 tsc incremental cache；结束 tracked status 空。
- 实际 runtime smoke **不传 NODE_OPTIONS/preload 或 PI_TEST_MOCK_UPDATE_CHECKS**，并在 import 前断言两者不存在。

## 实际外部包证据，不是小 protocol fixture

独立研究探针：`candidate-installed-probe.mjs`（仅 research，通过 apply_patch 添加）；使用动态 ESM parent resolve，从此验证树加载 SDK/jiti/Web 产品函数，不从主树或外部 dev node_modules 导入。

实际系统来源 `/home/xupeng/dev/personal/pi-extensions/pi-ask-user`，只读 HEAD **`59e0256c869e9ce04abffc1204537c7bf1501450`**，开始/结束 status 空，HEAD 与必要源文件 SHA256 一致。copied package 独立、非 symlink，仅复制 package.json/index/bridge/tool/types/validation/format/三个 tui-*.ts/LICENSE，无 node_modules/.git，11 个源/副本 hash 相等；全部值在 `candidate-installed-probe.log.external`。revision 只作证据，不是产品 pin。

copied package 自己用 Node 无法 resolve 四个 host peers，但真正 SDK discovery 能加载该实际 TypeScript entry，表明 peers 由 SDK alias 映射到本树宿主；四 direct 实测版本、entry、manifest hash、lock integrity 记在同日志 `sdkIdentity`，均与 baseline 相同的 1.0.0 宿主。

### 被测生产边界

- 真 `createAgentSessionServices` / DefaultResourceLoader / `createAgentSessionFromServices` / AgentSession；`SettingsManager.inMemory` packages 只配 copied 实际包、extensions=[]。
- noSkills/noThemes/noContextFiles/noPromptTemplates=true，authPath/modelsStorePath 指私有 agent，modelsPath=null、refreshOnCreate=false、allowModelNetwork=false。
- 真 Web `createAskUserExtension`、`projectAskUserTools`；唯一发现工具来自 copied index.ts，Web inline host tools.size=0，没有备用工具。
- policy 前后保留同一 execute/schema 引用、description/source；最终 SDK sourceInfo 为 copied package / user / package，exposure 为 **model-only**，active 真。
- 真 `AgentSessionWrapper`，局部 probe-owned Map 登记宿主，调用真实 `start()` / `beginExtensionBinding()` / `send()` / `shutdown()`，observe SSE-style events、pending、best-effort 镜像和实际 SDK transcript。
- **没有调用生产 `startRpcSession` / registerRpcWrapper global registry**，没有复用主进程 registry；`getRpcSession(id)` 明确断言 undefined。这是受控 services+真实 wrapper 冒烟，不伪称完整 RPC manager startup/registry/hydration 链。
- faux provider 是验证脚手架，返回 toolCall 给 **实际安装工具**，绝非替代工具/schema/bridge fixture；无真实模型或网络 provider。旧私有 settings askUser:false、PI_WEB_ASK_USER=0 同时设置，不影响正常宿主接入。

### 实测链路

| 阶段 | 观测 |
| --- | --- |
| 初次 wrapper prompt | 一个 ask.opened、镜像 askId 匹配、SDK toolResult 文本 Posted 4 questions，**只有 1 个 provider 请求**，无自动额外 toolResult-follow-up |
| submit | 单选、多选、自定义、supplement、skipped 闭合；unansweredIds=[skipped]；同 session custom follow-up，provider 累计 2；memory/mirror pending 都清空 |
| 真实 wrapper/AgentSession reload 第 1–3 次 | 每次 rediscover 唯一来源；prompt 一次只 open 一次、只增加 1 次 provider 请求；cancel 再增 1 次同会话 continuation；累计 provider=4/6/8，无 got2/listener 累积 |
| 显式真实外部 execute | mode=rpc、hasUI=true、ui.custom throw/spying；返回 **terminate:true** 与 Posted 文本，provider 仍 8，**uiCustom=0** |
| 关闭 direct ask | 同会话 cancel/follow-up，provider 最终 **9**；总 opened=5/closed=5，无 pending 或镜像 ask；无 custom TUI UI 请求 |
| shutdown | 真 wrapper 不再 alive，局部 registry 清空，无本次相关残留进程 |

provider 总数 9 不代表单次 ask 额外请求：四次模型发问各 1 + submit/cancel 五次 continuation 各 1；显式 direct execute 没有模型请求。四个模型 ask 回合均独立断言只有一个 provider 请求。

源码/日志中的 transcript follow-up SDK 投影可能对 provider 呈现 user-role 文本；原始 inner transcript 保留 customType `pi-web.ask.answers`。此冒烟不把 SDK provider-role 投影当成新普通用户消息。

### 探针首轮失败的准确归因

attempt1 exit 1 是 **研究脚本断言错位**：SDK 在 `extensionsOverride` 后给最终 RegisteredTool 加 package/user sourceInfo，保留的 pre-annotation 原对象仍是 temporary/local。错误地把二者最终 sourceInfo deep-equal 比较，失败发生在首个 prompt 前。修正为 policy 调用时证明 sourceInfo 引用保持，SDK 完成后独立证明实际 package/user 来源；没改产品源码或放宽来源断言。短日志保留 `candidate-installed-attempt1{,-wrapper}.log`；成功正式输出为 `candidate-installed-probe.log` / wrapper / exit 文件。

## 重跑命令与主代理刷新事项

门禁完整命令（新 snapshot 时先核验 ref/tree/package/lock/preload hash；修改输出文件名，保留本 preliminary 证据）：

```sh
pi-tmp-run --keep-on-failure ask-user-candidate-gates -- bash -c '
  V=$1; R=$2
  mkdir -p "$PI_TASK_TMPDIR/home" "$PI_TASK_TMPDIR/agent"
  failed=0
  for gate in tsc lint eslint tests; do
    case "$gate" in
      tsc) cmd=(node_modules/.bin/tsc --noEmit --incremental false); log=candidate-tsc.log;;
      lint) cmd=(npm run lint); log=candidate-lint.log;;
      eslint) cmd=(node_modules/.bin/eslint . -f json); log=candidate-eslint.json;;
      tests) cmd=(npm test); log=candidate-tests-hermetic.log;;
    esac
    (cd "$V" && bwrap --unshare-net --ro-bind / / --dev-bind /dev /dev \
      --bind "$V" "$V" --bind "$PI_TASK_TMPDIR" "$PI_TASK_TMPDIR" \
      --tmpfs /home/xupeng/.agents --tmpfs /home/xupeng/.pi \
      env -i PATH="$PATH" TMPDIR="$TMPDIR" PI_TASK_TMPDIR="$PI_TASK_TMPDIR" \
        HOME="$PI_TASK_TMPDIR/home" PI_CODING_AGENT_DIR="$PI_TASK_TMPDIR/agent" \
        PI_OFFLINE=1 JITI_FS_CACHE=false PI_TEST_MOCK_UPDATE_CHECKS=1 \
        NODE_OPTIONS="--import=$R/test-isolation-preload.mjs" \
        timeout 180s "${cmd[@]}") > "$R/$log" 2> "$R/$log.stderr"
    rc=$?; printf "%s_exit=%s\n" "$gate" "$rc"
    test "$rc" = 0 || failed=1
  done
  exit "$failed"
' bash \
  /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47 \
  /home/xupeng/dev/personal/forked/agegr-pi-web/.trellis/tasks/10-06-ask-user-host-integration/research
```

installed smoke（最后参数是本次 snapshot ref，刷新后应传 **新被测 ref**，不是移除 ref 断言）：

```sh
pi-tmp-run --keep-on-failure ask-user-candidate-installed -- bash -c '
  V=$1; R=$2; REF=$3
  mkdir -p "$PI_TASK_TMPDIR/home" "$PI_TASK_TMPDIR/agent"
  bwrap --unshare-net --ro-bind / / --dev-bind /dev /dev \
    --bind "$PI_TASK_TMPDIR" "$PI_TASK_TMPDIR" \
    --tmpfs /home/xupeng/.agents --tmpfs /home/xupeng/.pi \
    env -i PATH="$PATH" TMPDIR="$TMPDIR" PI_TASK_TMPDIR="$PI_TASK_TMPDIR" \
      HOME="$PI_TASK_TMPDIR/home" PI_CODING_AGENT_DIR="$PI_TASK_TMPDIR/agent" \
      PI_OFFLINE=1 JITI_FS_CACHE=false \
      timeout 90s node --experimental-import-meta-resolve \
      "$R/candidate-installed-probe.mjs" "$V" \
      /home/xupeng/dev/personal/pi-extensions/pi-ask-user "$REF"
' bash \
  /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/ask-user-host-validation-20261006-01a10f47 \
  /home/xupeng/dev/personal/forked/agegr-pi-web/.trellis/tasks/10-06-ask-user-host-integration/research \
  d6be56655884c495e7534afcbc027a4a0546d66b
```

## 尚未覆盖与清理/移交

- 没有浏览器、生产服务或真实 RPC HTTP/SSE startup route；主代理将用同树实际系统包 browser runner 验证。General 设置无 fetch、form交互、刷新/跨设备/重建/hydration 等不能由这些源/SDK证据冒充。
- 已运行三次真实 AgentSession reload，但未在该 actual installed smoke 实测关包→reload→恢复、inactive/hidden、多个来源、坏 version/ack、Chat-only/子代理、Code mode nested 等负例；本轮相关 **unit fixtures** 通过，不等于这些负例都已用实际包验收。
- 未在该实际包冒烟做 wrapper replacement/磁盘重水合（当前只证明镜像写与清除）、shutdown 旧 wrapper/新 wrapper竞态；主代理 browser/后续集成负责。
- 没有 strict-open/outbox/exactly-once 保证提升；仍是 memory 权威、best-effort 镜像及 fire-and-forget follow-up。未验证 Safari/Windows/TUI/PTY/production分发。
- 此 snapshot 为初检，trellis-check 的主树修复尚未自动纳入；主代理刷新后必须重新执行门禁/实际包 probe/browser，并用新 ref/tree 报告。

成功 gates 与 smoke scratch 自动清理；已授权的唯一失败 scratch `ask-user-candidate-installed-ufjf82c5` 经研究日志 provenance、uid/非symlink/parent/exclusive flock 与相关进程扫描核验后逐路径清理，见 `candidate-cleanup.log`。无重复源码快照或依赖树。结束 tracked status 空、lock/external HEAD hashes 不变，没有残留相关进程。

**继续保留唯一普通磁盘 worktree 及 node_modules 给主代理 browser/最终 candidate 复用，不 remove。** 主代理全部验证完成、核验无未保存改动后再 git worktree remove。本代理无 next build、服务启动/重启、外部修改、真实凭证/设置读取或写入、真实模型请求、git commit/push。
