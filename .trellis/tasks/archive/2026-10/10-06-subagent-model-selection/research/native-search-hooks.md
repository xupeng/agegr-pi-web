# Native request / stream hooks — controlled real SDK integration

> 原始验收产物现留在私有离线副本；本文仍是原 SHA 的历史记录，见 [证据留存](../evidence-retention.md)。

状态：**主代理应用公开host binding修正后，13/13 focused pass；4文件lint0errors/warnings。**

主代理以原生apply_patch添加`onError` binding及空error断言，再于唯一`/var/tmp/pi-subagent-native-hooks-parent.*`隔离HOME/XDG/agentDir wrapper运行全文件：13tests/13pass/0fail，16次owned loopback Responses请求、真实模型/搜索0、Kimi0、外部尝试0、最终servers0。证据`native-search-hooks-parent-tests.log`。随后4-file ESLint与git diff --check退出0；parent修正后整树tsc/full-suite待最后合流运行。

这关闭了受控真实SDK request/stream/reload hook通路，不代表真实pi-sub2api插件或真实搜索服务通过。以下12/13与修正建议保留为**子代理历史失败快照**，不覆盖本段最新复跑证据。
唯一工作区：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`。
本 owner 仅新增本报告、`lib/subagent-native-search-hooks.integration.test.mjs` 和
`lib/__fixtures__/subagent-native-search-hooks/{isolation,provider,search}.mjs`。
未修改产品文件、既有测试/fixtures/helpers、SDK pins/lock、browser/dev 配置；未 commit/deploy/build。

## 通路与证据边界

先读 design.md、implement.md、sdk-gates.md、review-findings.md、新 frontend/subagent-model-selection.md、
docs/agents/{tools,models,sessions}.md；只读参考真实
`/home/xupeng/dev/personal/pi-extensions/pi-sub2api/extensions/search.ts`（含 101–138 行）。
**未执行/import/修改真实 pi-sub2api 插件、配置或依赖。** 本 fixture 是便携受控复现，不是该插件端到端验收。

SDK 是 lock-consistent 已安装 `@earendil-works/pi-{coding-agent,ai}@1.0.0`，未升级。
公开 API / source 定位：

- `pi-ai/package.json` 公共 `./api/*` exports；`createProvider` + `api/openai-responses` 的真实 `stream/streamSimple`。
- `pi-ai/dist/api/openai-responses.js`：`options.onPayload(params,model)` 的 replacement 确实用于
  `client.responses.create(params)`；`openai-responses-shared.js` 的 `processResponsesStream` 在
  normalize 前 await `onProviderStreamEvent(event,model)`。
- `coding-agent/dist/core/extensions/types.d.ts`：`BeforeProviderRequestEvent.payload`、
  `ProviderStreamEvent.{provider,api,model,data}`、`MessageEndEventResult`；未自造事件签名。
- `coding-agent/dist/core/agent-session.d.ts`：公开 `ExtensionBindings.onError`、`bindExtensions`、
  `setModel`、`reload`。SDK bundle 的实际 `createAgentSession` 将 Agent 的
  `onPayload/onProviderStreamEvent` 接到 ExtensionRunner；真实 `message_end` replacement 被保存到 session.messages。
- SDK docs/sdk.md、extensions.md、custom-provider.md、models.md 与相关 SDK/extension examples 已读。

测试实际链路：独立 `createSubagentSessionServices` → factory 注册 native/legacy Responses provider →
`projectRegistrationAwareExtensionTools` live Map policy → 显式目标
`createAgentSessionFromServices` → `bindExtensions` → `session_start` 中迟注册 `web_search` →
真实 `session.prompt` → OpenAI Responses adapter → `127.0.0.1:ephemeral` HTTP/SSE → SDK hooks → transcript。

`nativeSearch:true` 是**受控 backend 接受的测试标记**，不是宣称 OpenAI 接受该自定义 wire 字段。
同时注入真正 Responses 风格的 `{type:"web_search"}` tool。没有 direct search 执行或真实搜索。
`fauxProvider` 只用作 **Kimi 零调用 sentinel**，从未用于主请求；没有 manual emit、隐藏 session、私有字段访问。

## Covered（实跑成立）

1. **Native 与 legacy factory-ready provider**：binding 前能解析目标并通过公开 `ModelRuntime.getAuth(model)`；
   延迟 search 工具在 factory/constructor 阶段不存在，真实 session_start 后存在。ready 前/ready 本身均 0 请求。
2. **before_provider_request 实际影响 HTTP body**：ready 后捕获到的真实 POST body 有 `nativeSearch:true`
   和恰好一个 native `web_search` tool；direct-search function 不在声明里，执行计数 0。
3. **provider_stream_event 实际绑定**：hook 收到的 event types 与 backend 发送的每个 SSE parsed event 逐项一致；
   identity 始终是 selected `hooks-target/gpt-hooks/openai-responses`。切到 other-hooks 后事件 identity 也随实际目标变化。
4. **message_end replacement**：citation URL 只在 raw web_search_call action.sources 中；adapter answer 的普通 text
   与 before-hook 内容没有该 URL。最终保存的 transcript 多出一个无签名的普通 `{type:"text"}` 来源 block。
   原 thinking block 的 thinkingSignature 与 encrypted_content、原 answer 的 textSignature/content 逐项不变。
5. **实际 model_select / turn_start 清 pending**：使用公开 SDK command `/fixture-stale` 仅播种 stale collector，
   再经 `setModel` / `prompt` 触发真正生命周期。播种不 dispatch 事件、不发送请求，不能算主请求覆盖；
   clear 日志证明 hadPending=true 后清空。other-hooks 不注入、不追加 old sources。
6. **reload 清旧 pending**：真实 `session.reload()` 发出的 session_shutdown 清掉 stale collector；reload 自身 0 请求。
   **子代理快照未通过重新binding；主代理修正/复跑已证明新的session_start、late registration=2与reload后真实请求/来源通路。**
7. **hidden / defaultActive:false / config off / explicit manual-off carry / policy deny**：即使 backend 总会给出
   raw search/citation frames，真实请求也不注入 native 标记/tool，响应无来源 block；hidden/defaultfalse/off 不自动激活。
   manual-off 用现有 `preserveSubagentManualOffTools` + reload；主代理非空公开binding复跑仍保持off，不自动启用。
8. **endpoint 与独立 auth endpoint**：declared endpoint 不匹配时不注入；另一个 case 中 model/config endpoint 一致，
   native auth 将实际请求改至同一 owned server 的 `/v1/auth/responses`，hook 确认 effective auth mismatch 而不注入。
9. **真实 terminal provider failure**：已经收到 sources，但 response.failed 导致 assistant error，无来源追加；下一次
   disabled 请求亦无 stale 来源。
10. **Native / legacy false provider-only replay**：由公开来源捕获与 current-authorized services replay，loader extensions=[]；
    只执行必要 provider 文件 factory。同目录 search factory 不再运行；provider 文件故意登记的 session_start/request hook
    也不移交。真实 plain Responses POST 无 native 标记/tool，无 search 工具或 lifecycle/hook 日志，无引用追加。
11. **全程 Kimi sentinel 0、真实模型/搜索 0、external fetch attempt 0、最终 listening server 0**。

## 历史失败 / public SDK contract finding（已修正并复跑）

最后运行：13 tests / 12 pass / **1 fail**（exit 1）。失败精确位置：
`lib/subagent-native-search-hooks.integration.test.mjs:209`，reload 后期望 late_registered 数量为 2，实际为 1。

不是 hook API 不支持，也不是产品 auth gate 失败。测试 `ready()` 目前调用 `session.bindExtensions({})`。
SDK 初次 bind 总会 emit session_start，但 SDK `reload()` 只有在至少一个 host binding 存在时才再 emit：

```js
if (this._extensionUIContext || this._extensionCommandContextActions ||
    this._extensionShutdownHandler || this._extensionErrorListener) {
  await options?.beforeSessionStart?.();
  await this._extensionRunner.emit({type:"session_start",reason:"reload"});
  // ...
}
```

因此 empty-bindings fixture 不能代表有真实 Web host bindings 的 reload。这是**测试 binding 缺口**，
不能删除断言、手动 emit、timeout 或改变认证来算通过。

### 给主会话的精确修正（现已原生应用 / 13用例实跑通过）

子会话工具列表只有 read/bash/edit/write/grep/find/ls，没有原生 apply_patch。此前曾用 shell patch wrapper 新增源码；
用户要求后已停止此方式。仅清理自身 `search.mjs.orig`；下面修正必须交主会话用原生工具应用。
绑定公开 `onError` 并收集/断言 extension errors；不访问私有字段、不改变模型/auth、不制造 lifecycle：

```diff
*** Begin Patch
*** Update File: /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection/lib/subagent-native-search-hooks.integration.test.mjs
@@
-  let services, session, kimi;
+  let services, session, kimi;
+  const extensionErrors = [];
@@
-      session?.dispose();
+      session?.dispose();
+      assert.deepEqual(extensionErrors, [], "no swallowed extension hook errors");
@@
-        await session.bindExtensions({});
+        await session.bindExtensions({ onError: (error) => extensionErrors.push(error) });
*** End Patch
```

预期该修正使真实 SDK reload 重新 emit session_start 并执行迟注册与后续真实 request；**预期不等于已通过**。
应用后应完整重跑 13 用例、4-file lint 和 nonincremental tsc。若它暴露其他失败，保留失败并继续在 test-only 边界处理。

## Actual commands / results / formal log

首次 tool command 已核对 `TMPDIR=/home/xupeng/.cache/pi-tmp/01a1121a-9fa2-7540-97bf-c4a2e2ba461f`。
每次验证都先在 `/var/tmp` 建唯一小 HOME，不复制缓存/依赖；unset XDG → pi-tmp-run → worker 再建完全隔离
inner HOME/agentdir/cwd。脚本 cwd 是唯一 worktree；没有触碰原 WIP、真实配置/history 或 production API。

实际 focused command 模板（各次仅 owned HOME 随机 suffix 不同）：

```sh
cd /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection
VALIDATION_HOME=$(mktemp -d /var/tmp/pi-web-native-search-hooks-home-XXXXXX)
trap 'rm -rf -- "$VALIDATION_HOME"' EXIT
env -u XDG_STATE_HOME -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME \
  HOME="$VALIDATION_HOME" TMPDIR="$VALIDATION_HOME/.cache/pi-tmp" \
  PI_CODING_AGENT_DIR="$VALIDATION_HOME/empty-agent" \
  /home/xupeng/.pi/agent/bin/pi-tmp-run native-search-hooks -- \
  node --experimental-strip-types --test lib/subagent-native-search-hooks.integration.test.mjs
```

| Run | Owned validation HOME suffix / exact worker PID | Result | Controlled HTTP requests |
| --- | --- | --- | --- |
| 1 | zEkRnY / 1236328 | exit1; 13 tests, 0pass, 13fail | 0 |
| 2 | 9a4Ktc / 1236463 | exit1; 13 tests, 0pass, 13fail | 0 |
| 3 (latest) | wOeDyG / 1236541 | exit1; 13 tests, 12pass, 1fail | 15 |

Run 1 fixture issue：SDK discover 自动目录识别 .js/.ts，不识别复制后的 .mjs。fixture source 保留 .mjs，ownedHOME
入口复制成 .js 后运行真实 loader。Run 2 fixture issue：ModelRuntime 的公开 auth API 是 getAuth，不是
compat ModelRegistry 的 getApiKeyAndHeaders；独立 jiti moduleCache:false 还会分离来源 owner 的 WeakMap。
改用公开 getAuth 与正常共享 module cache 后，native/legacy 请求、来源 replay 实际成立。没有伪造 SDK API。

Latest focused stdout 摘要（不是把失败标成 pass）：

```text
PASS native factory-ready Responses: late ready, real payload/stream hooks and unsigned citation append
PASS legacy factory-ready Responses: late ready, real payload/stream hooks and unsigned citation append
FAIL SDK reload/model_select/turn_start clear stale pending and target switches cannot attribute old sources
PASS hidden: no automatic native enablement, no sources even with raw search frames
PASS defaultActive false: no automatic native enablement, no sources even with raw search frames
PASS configuration off: no automatic native enablement, no sources even with raw search frames
PASS explicit manual off: no automatic native enablement, no sources even with raw search frames
PASS registration-policy deny: no automatic native enablement, no sources even with raw search frames
PASS endpoint mismatch: no automatic native enablement, no sources even with raw search frames
PASS effective auth endpoint override is independently checked before native injection
PASS terminal provider failure cannot append collected sources or carry them to the next real request
PASS native explicit false provider-only replay: no search/lifecycle/request hooks transferred
PASS legacy explicit false provider-only replay: no search/lifecycle/request hooks transferred
{"nativeSearchHooksEvidence":{"tests":13,"localResponsesRequests":15,"realModelRequests":0,"realSearchRequests":0,"blockedExternalAttempts":0,"kimiRequests":0,"listeningServers":0,"serverPid":1236541}}
tests 13; suites 0; pass 12; fail 1; cancelled 0; skipped 0; todo 0; duration_ms 2381.175252
AssertionError: 1 !== 2 at integration.test.mjs:209:10
```

Static validation 用同样 wrapper，label `native-search-hooks-static`；owned outer HOME suffix `kw2IXD`，
workspace suffix `5ig4f1hr`；inner command export `HOME=$PI_TASK_TMPDIR/home`、
`PI_CODING_AGENT_DIR=$PI_TASK_TMPDIR/home/agent`，循环 unset 所有 XDG_*，再执行：

```sh
node_modules/.bin/eslint lib/subagent-native-search-hooks.integration.test.mjs \
  lib/__fixtures__/subagent-native-search-hooks/isolation.mjs \
  lib/__fixtures__/subagent-native-search-hooks/provider.mjs \
  lib/__fixtures__/subagent-native-search-hooks/search.mjs
node_modules/.bin/tsc --noEmit --incremental false
```

实测：**4 files ESLint exit0，0 errors / 0 warnings；tsc exit0，0 diagnostics**。
没有全量 npm test、next build 或 browser 操作；不覆盖主代理 2961-test 证据。
TypeScript 编译检查整个当前 .ts 树；新增 .mjs 的行为证据来自真实 Node tests，不能拿 tsc 代替。

Lock SHA256 起止一致：`18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f`。
四个 owned validation HOME 全部由 EXIT trap 清掉；pi-tmp-run 清 owned workspace、reap 精确 process group；
每个 in-process server 只绑定 127.0.0.1:0，t.after/finally closeAllConnections+close，最终 server 数 0。
worker scratch 与 ownedHOME config/复制入口/日志已清；自身 .orig 已清。未停止其他服务/PID。

## Remaining

- 必须主会话应用上面的公开 host-binding 修正并重跑；当前不能勾掉整项 native request/stream hook matrix。
- 真实 pi-sub2api 插件/实际 native search 后端、signed thinking 的真实密码学验证、多轮 live-provider acceptance、
  Safari/Windows 都未覆盖。本测试只验证 SDK 原签名字段未被 hook 改写。
- 错 provider/api 的 raw event identity 被 SDK 根据 dispatch model 标注；没有 manualemit 制造错 identity 来声称匹配拒绝覆盖。
  实测覆盖 selected target 正确 identity 与合法 model switch，而非 cross-provider mislabel 攻击。
- 最新 browser native faux auth{} availability race 属 fresh 核心 owner；本 owner 未修改 selection/services，
  这里 OAI controlled adapter 必须的 dummy key 是 fixture 合法认证，不是绕该 gate 的延迟/补 key workaround。
