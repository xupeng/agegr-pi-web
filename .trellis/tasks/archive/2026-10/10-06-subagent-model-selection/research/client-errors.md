# CLIENT UI 选模错误闭环

> 原始验收产物现留在私有离线副本；本文仍是原 SHA 的历史记录，见 [证据留存](../evidence-retention.md)。

日期：2026-10-06。仅 CLIENT owner 交付；不宣称整个任务或并发 server candidate 最终全绿。

## 工作区与边界

- 唯一工作区：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`。
- 首次操作已检查 `TMPDIR=/home/xupeng/.cache/pi-tmp/01a111a2-14f9-7540-97bf-c4860cf8c019`；正式验证不用这一真实 HOME 祖先路径，采用下述 `/var/tmp` 完全隔离方案。
- 依赖沿用 `research/baseline.md` 的 worktree 内 `npm ci --include=dev` 锁一致树，基线 ref `e0ad63073c4c42987571d31b1a4cb61e48a1fcd4`。没有修改 SDK pins、锁文件或重装依赖。
- 没有读取/复制/修改通知中心原 checkout 的 WIP；没有 commit、push、归档、deploy、next build、dev/browser 服务、真实 settings/auth/session 历史改动。
- 未修改 `rpc-manager.ts`、subagent runtime/decoder/selection/server/source helpers、`app/api/agent/**` 或 e2e 脚本。server 原已存在的安全 DTO/reason 列表不变。

## 文件与行为

| 文件 | 本 owner 改动 |
| --- | --- |
| `hooks/useAgentSession.ts` | 普通/queued prompt rejection、new-session 创建失败及 `set_model` 使用同一 local formatter；新会话 endpoint 的非 2xx body 用共享 client decoder，不再只剩 HTTP 状态。 |
| `lib/agent-client.ts` | 在原已建 `AgentCommandError.modelSelection` 接线上窄增 safe projection、selection-failure marker 与 `readAgentCommandError`；保持 `isPromptRejectedError` 的 code + accepted:false guards。 |
| `lib/model-selection-error-display.ts` | 零 server runtime import 的客户端 formatter；canonical 全 reason 映射，忽略服务端 message，仅显示验证后的 provider/model 与本地指导。 |
| `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | 同时新增全部提示，包括英文 `No model request was sent`、三语未发送语义、draft 保留、set_model 原选择未变及每个 reason 的行动建议。 |
| `hooks/useAgentSession.model-errors.test.mjs` | 16 个实际 callback execution 测试，经真实 client fetch decoder + formatter + locale registry；模式沿用现有 `mcp-slash-command.test.mjs`，非源码 regex 功能证明。 |
| `lib/model-selection-error-display.test.mjs` | 9 个执行测试：所有 canonical reason × 三语、unsafe/unknown DTO、无 target/nested target、admission guards、去掉 raw message/extra auth 字段。 |
| `hooks/model-switching.test.mjs` | 既有结构断言更新为 local formatter/translation 调用，不把它当运行时证据。 |
| `docs/agents/models.md` | 记录 client refusal、draft/ask/admission、显式改选重试及 UI fallback/默认保存不变；不声称新增原子 navigate→prompt。 |

### 关键决定

1. 选模/认证/loader 的原始 message **不渲染，也不保存在 HTTP 解码后的 error DTO 中**。只投影既有 shape 的 code/reason/provider/modelId，message 替换为固定非诊断占位；UI 始终用三语 reason 文案。URL、控制字符、超长或非 ID target、未知 reason、畸形 DTO 使用本地 generic fallback，不回显 raw error/auth.message。
2. target 显示规则为最长 256 字符的 Unicode 字母/数字及 `._/+-`；model id 另允许真实模型的 `:free` 后缀与 `@001` 版本标记，同时明确拒绝 `://` URL。正常 `gateway/retired-gpt` 和 nested model id 保留。其它 target 不截取/猜测，整个 detail 安全降级。主代理复核补充此 ID 兼容测试；下列 180 focused 计数是该补丁之前的实跑，最终门禁重新计数。
3. 不扩大 prompt rejection 定义：只有 dispatch 前失败或既有 `prompt_rejected` + `accepted:false` 才恢复普通 prompt。仅带 typed selection DTO、不带 negative ack 的 dispatch 后失败仍走原 ambiguous reconciliation；不制造重复发送。
4. 普通 definitive rejection 仍只删除本次 optimistic user message，恢复 draft/images；旧 ask/result 留在原数据链，idle reconciliation 不通知 completion；另一 tab 有真实 run 时保持其 running/SSE。没有“清错误当成功”、提前清 ask 或绕过 admission。
5. `set_model` typed 409 显示失败 target、原因、未发送、原 selection/draft 未变；rollback optimistic selection，不再为了这种明确拒绝 reload/推进 canonical branch。非 typed 的 transport 失败仍保留既有 canonical reload 处理。provisional new-session 失败回滚 local model/default-thinking，迟到失败不会回滚更新的明确选择；等待 creation 的 rejection 也在 catch 内。
6. provisional send 中若先 `set_model` 失败，立即走 rejection/restore，不 fall through 到 prompt。合法改选成功仅选择模型，不自动发送未发送 draft；用户显式重试。
7. 初始 all-model selector fallback、全局默认保存、原 AskUser lifecycle、chat font/offset 与组件渲染均未改动。没有新增字体/字号样式。

## 验证

全部运行都先 cd 唯一 worktree。验证沿用 baseline.md 的隔离形状；每次唯一小型 validation HOME，清掉继承 XDG，wrapper TMPDIR 位于这个 HOME 下，再用 inner HOME/agentDir：

```sh
cd /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection
SANDBOX_HOME=$(mktemp -d --tmpdir=/var/tmp pi-client-validation-home.XXXXXXXX)
trap 'rm -rf -- "$SANDBOX_HOME"' EXIT
env -u XDG_STATE_HOME -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME \
  HOME="$SANDBOX_HOME" TMPDIR="$SANDBOX_HOME/.cache/pi-tmp" \
  /home/xupeng/.pi/agent/bin/pi-tmp-run client-errors-focused -- bash -c '
    cd /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection
    export HOME="$PI_TASK_TMPDIR/home"
    export PI_CODING_AGENT_DIR="$PI_TASK_TMPDIR/home/.pi/agent"
    export XDG_CACHE_HOME="$PI_TASK_TMPDIR/cache"
    mkdir -p "$PI_CODING_AGENT_DIR" "$XDG_CACHE_HOME"
    # 下列 focused commands，日志保存到本任务 research
  '
```

实际 commands 与最终这次结果：

| Command | Exit / evidence |
| --- | --- |
| `node --test hooks/*.test.mjs lib/model-selection-error-display.test.mjs lib/agent-client.test.mjs lib/i18n/registry.test.mjs components/ChatInput.test.mjs components/ChatWindow.ask-user-layout.test.mjs components/AskUserAppHost.test.mjs` | 0；180 tests / 180 pass / 0 fail/skip/cancel/todo；`client-errors-tests.log` |
| `node_modules/.bin/eslint hooks/useAgentSession.ts hooks/useAgentSession.model-errors.test.mjs hooks/model-switching.test.mjs lib/agent-client.ts lib/model-selection-error-display.ts lib/model-selection-error-display.test.mjs lib/i18n/messages/en.ts lib/i18n/messages/zh-CN.ts lib/i18n/messages/zh-TW.ts` | 0；9 focused 文件、0 error/warning，空日志 `client-errors-lint.log` |
| `node_modules/.bin/tsc --noEmit --incremental false` | 0；空日志 `client-errors-tsc.log`；仅此运行时 concurrent candidate 的类型快照，不是 server 最终版本承诺 |
| `git diff --check -- hooks/useAgentSession.ts hooks/model-switching.test.mjs lib/agent-client.ts lib/i18n/messages/en.ts lib/i18n/messages/zh-CN.ts lib/i18n/messages/zh-TW.ts docs/agents/models.md` | 0 |

基线来源见 baseline.md：同锁依赖上的完整 baseline 2853 tests、698 lint 文件、tsc 通过。此处是 **focused 180 tests / 9 lint 文件**，不是与完整 baseline 总量直接比较，也没有声称跑过 full npm test/full lint。

首次 focused run 的 24 项中 3 项失败保留在 `client-errors-tests-initial.log`：HTTP JSON 重水合后的 ask 内容/id 相同，测试误要求对象引用相同，已改为 deepEqual。扩充测试后一次 179 项中 1 项失败保留在 `client-errors-tests-projection-assertion.log`：测试 regex `auth.*message` 误匹配合法 reason `auth-unavailable` 后的固定 message，改成检查真正的 `"auth":` extra key。随后补充 queued selection DTO 缺 negative ack 时不谎称未发送的执行测试，最终重跑上述 focused 命令 180/180。

### 执行覆盖（不冒充 browser）

- real client decoder → local formatter → hook own callbacks → notice/draft/state setters；fetch 使用 Response fixture，**没有真实 server HTTP/provider 请求**。
- 三语 prompt 拒绝及 target `gateway/retired-gpt`；全部 canonical reason 的不同 actionable 指导。
- invalid DTO generic fallback 且 raw loader/auth 文本不出现；decoder 去掉 extra auth 字段。
- 旧 ask/branch/result、附件、未发送草稿；idle reconciliation 零 completion notification；busy other-tab run 不被本次拒绝 settle。
- new-session creation failure 可重试/不 promote；set_model 409 不 reload branch、不发送 draft；provisional send 的 set_model 失败不 fall through。
- queued rejection 保留输入/旧 ask/真实 run；negative ack 缺失与 transport ambiguity 保持 guards。queued typed selection DTO 缺 negative ack 时显示三语“接收未确认”而非错误声称“未发送”，不恢复可能已接收的输入。
- 显式合法改选后只有用户再次 handleSend 才发 prompt；HTTP acceptance 不是 completion。
- 既有 hooks、ChatInput、AskUser host/layout 与三语 key/placeholder 回归在 focused 集合通过。组件/旧测试中的源码结构断言仅算结构证据。

## 未覆盖 / 剩余集成责任

- 未启动 dev/browser，Chromium/mobile/Safari/Windows 均未实跑；browser owner 需按既有 fixture URL 的真实 selected scope gateway、toolPolicy version1/builtinTools/extensionAllow/extensionDeny 运行。英文提示包含 `No model request was sent` 和 `retired-gpt`，未修改 e2e 脚本/fixture。
- 不证明真实 warm/cold/new child services、providerSources、cold set_model 标准 model_change 持久化或并发 server intent；由 server owner 的 runtime tests/browser 集成证明。
- history edit 仍是既有 navigate→prompt 两次 RPC；client 没有把它原子化或主动切回旧 leaf。新增保持 branch 的执行断言是未编辑 prompt / typed set_model refusal，不外推为所有 history-edit 组合。
- 并发 server 修改继续，未跑 full npm test/full lint，更没有将此 focused/type snapshot 声称为全任务最终全绿。

## 清理

全部 validation HOME / wrapper fixtures 在各命令 EXIT trap 清理，无 `/tmp`、大型项目/依赖副本或服务。环境没有系统 `apply_patch`，源码通过本 owner `/var/tmp` 小型 apply_patch-compatible helper 定向补丁编辑；该临时 helper 交付前删除，不进入仓库。只保留正式源码、文档和 research 日志；没有需要停止的自启服务。
