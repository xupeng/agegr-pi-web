# Independent review — AskUser host integration（2026-10-06）

## 结论与范围

已直接执行 trellis-check 审查；没有再委派、commit/push、安装依赖、创建第二依赖树、操作主代理验证 worktree、启动服务或修改系统扩展/真实配置。

**当前审查范围内未发现尚未修复的产品代码缺陷。当前 model-only 投影的 defaultActive 归一化正确，应保留。** 它保持 SDK 原激活语义，不应为了字面复制原显式 true 而错误激活 codemode/deferred。无需新增 SDK facade、fallback 或 active-set 特例。

本轮修复的是缺失的测试证据与一个陈旧规范锚点；**主代理 clean candidate 需刷新**。本报告不代表最终 clean 三件套、真实系统源冒烟或真实浏览器通过。

## 已加载与审查证据

- 完整读取 check.jsonl 的全部 curated 文件、最新 PRD/design/implement、两份 system 决策、implementation-findings 与 settings-retirement-results。历史 portable/fixed dependency/facade/内建 fallback 提案未当作执行要求。
- codegraph explore 优先；其 extension/rpc-manager 关系仍指向旧工具/gate，明确 stale 后以当前源码/git diff 校正。
- 检查 git status、全部 tracked diff 和新增文件；UI/controller/keyboard/copy/CSS 及其结构测试与原文件逐字节对照。AskUserView.tsx、view-controller.ts、keyboard.ts、copy.ts、view-css.ts 及对应测试均 byte-identical；宿主仅改 imports，format/validation 仅重归属、注释变化。
- 完整阅读本机 Pi docs：sdk、extensions、codemode，以及相关 configuration/settings/packages/sessions/session-format/message-types/cli-integration/tui；阅读 sdk tools/extensions 示例并核对实际 SDK 1.0.0 dist 实现。未把 docs 中较简略的 activation 描述替代源码判据。

## defaultActive policy 独立判定

实际 checkout SDK 与 deployed SDK 的 agent-session.js SHA-256 相同：
`476722dd363a0347049d450b5a0c67386cf156ecae2b039676962aa00a857161`。

源码锚点（node_modules/@earendil-works/pi-coding-agent/dist/core/）：

- agent-session.js:2856–2862：`_isDeclarable` 只接受 direct/model-only；`_isActivatedOnRegistration` 是该条件 **AND** `definition.defaultActive !== false`。
- agent-session.js:2831–2853：显式 allowed tools、registration defaults、pending recorded names 分别处理；不存在 `defaultActive:true` 绕过非 declarable exposure 的分支。
- agent-session.js:1093–1153：显式 activation 接受已注册非 hidden 工具；model-only 不在 nested callable 集合里。
- sdk.js:144–148：defaultTools 与显式 SDK tools 决定初始 names / allowed names；defaultTools 不是工具发现过滤器，空列表也不单独撤销 SDK 默认激活的 extension 工具。
- agent-session.js:1332–1339、3304–3305：recorded system tool deltas 经真实 tree navigation 恢复。
- agent-session.js:2900–2921：reload 使用 includeAllExtensionTools:true；direct/model-only registration-default 工具原生会重新激活。保留这个原 SDK 行为，不能把它误报成 Web 回灌。

因此：

| 原 definition | 原 SDK 默认激活 | Web 投影 | 保留的默认激活 |
| --- | --- | --- | --- |
| omitted/direct/model-only + omitted 或 true | 是 | model-only，原 defaultActive | 是 |
| omitted/direct/model-only + false | 否 | model-only，false | 否 |
| hidden + 任意 defaultActive | 否、显式选择也不能激活 | 原 hidden definition | 否 |
| codemode/deferred + omitted、true 或 false | 否 | model-only，defaultActive:false | 否；仍可显式选择 |

最后一行覆盖显式 true 是 **行为保持适配**，不是额外禁用开关。保留 true 会使投影后的 declarable 工具默认激活，这是回归。原输入 definition、tools Map、execute/schema/prompt/source 不 mutate；冻结原 definition/RegisteredTool 的测试仍成功。

实现代理 findings 中“字面字段与激活行为存在 unresolved trade-off”的历史表述，按主代理本次明确边界已解决：以原激活行为为准，不需要重新设计。普通系统源的 direct/omitted 定义不受此归一化影响。

## 本轮局部修复

1. `lib/ask-user/discovery-host.integration.test.mjs`
   - fixture 新增 defaultTools / explicit SDK tools 输入，仍用真实 DefaultResourceLoader、package discovery、AgentSession 与 faux ModelRuntime。
   - 6 exposures（implicit direct/direct/model-only/hidden/codemode/deferred）×3 flags（omitted/true/false）原 SDK与 Web policy 对照。
   - 每组验证 registration default、显式 setActiveTools、active selection reload、recorded system tool deltas 与公共 navigateTree、inactive reload。
   - 每组另验证 defaultTools 空/命名/+ask_user/-ask_user、显式 SDK tools 命名/排除后的 initial 与 reload loadout 完全一致。
   - 新编写测试初次把空 toolsAdded 当“替换”以及 same-leaf navigation 当“恢复”，导致测试自身错误；已改成真实 toolsRemoved delta 和非 same-leaf navigation。没有为测试修改 SDK/产品行为。
2. `lib/ask-user/extension-policy.test.mjs`
   - 增加 codemode/deferred × omitted/true/false，冻结输入，验证 false 归一化、execute/parameters/prompt/source 引用保持、原定义不变。
3. `.trellis/spec/frontend/pi-sdk-admission.md`
   - 删除已不存在的 portable peer pin/path 陈述，保留四个 direct SDK pins 与 admission/completion 契约。

本轮产品 TS/TSX 文件 **零修改**；测试新增 127 用例，相对实现交接树计数增加，不与原 baseline 全量计数混算。

## 全范围审查结果

- **发现/所有权**：生产无 AskUser dependency/pin/额外 entry/SettingsManager facade/内建 tool fallback。原 loader/trust/package resource filters 沿用；正常主会话只提供同 loader bridge-only host。tool-map policy 不重建 execute/schema/prompt/source。多 resolved source 明确诊断并撤销 AskUser，不删其他 tools/commands/flags/handlers；不宣称阻止工厂副作用。
- **准入/bridge**：host 同步注册 async open；v1/bounded DTO/loader 身份/alive wrapper 实时检查；foreign/missing/closing/wrong-identity 不碰别会话。子代理两条构造链均移除 ask Map 并 exclude reserved name；Chat-only 沿空资源边界，不提供主会话 bridge。
- **activation/exposure**：上述 native 对照未发现选择行为差异；defaultActive:false/hidden/资源排除不被回灌。原 SDK 对 default-active direct 的 reload 重新激活已单独区分。Code mode only 仍直接声明 ask；ALL_TOOLS/scripts/ctx.executeTool 拒绝 model-only，direct faux call 只请求模型一次并 terminate。
- **状态/交付**：store/open/supersede/镜像/SSE/answers/admission/rebuild/stale-close/destroy 没有行为重写。focused 测试覆盖 rejected/accepted/completion 分离、same-session submit/cancel、fire-and-forget 自定义答案、真实 shutdown/rebuild 原 askId hydration、迟到旧 wrapper destroy 不清 replacement；mirror 仍 best-effort、无 outbox/exactly-once 承诺。
- **设置/UI**：旧 route/helper/env 消费真正退出，无 fixed-enabled endpoint；三语只删两项 settings 文案。General 其他 save/reload、pane trust/dialog wiring 与 unknown settings 字段保留测试通过。表单行为模块 byte-identical，不引入系统路径/TUI/SDK 客户端依赖。
- **测试 peer**：protocol-package/private:true 仅供测试显式复制，产品无引用；它不是真实已安装工具验收，也不是另一个可发布工具或 fallback。
- **e2e runner 静态审查**：默认无录像、无 tracing；显式 E2E_TRACE=1 才启动且只失败保存。独立 HOME/agent/project/port，复制源不复制 node_modules/.git/.codegraph；只启动/停止自己的 detached process group。未实际运行浏览器，进程退出与产物清理必须仍由主代理实际验证；调用应使用 env-i 外层，不能将继承真实环境当作隔离证据。

## 本轮验证（非 clean npm ci 全量门禁）

所有 runtime import 前均隔离 HOME/PI_CODING_AGENT_DIR；外层 env-i、PI_OFFLINE=1、JITI_FS_CACHE=false。有限命令通过 pi-tmp-run；实际 TMPDIR 位于本 session 的 ~/.cache/pi-tmp/01a10fb8-0883-753b-a8de-d7b3261d4481 下，不是 /tmp。使用主开发树既有依赖，没有安装或改动主代理 candidate。

| 检查 | 实测 | exit |
| --- | --- | --- |
| 初次完成的 policy/discovery 对照 | 125/125，0 fail/skip | 0 |
| 最终 focused suite（含追加 -ask_user 对照） | **447/447**，0 fail/skip，8.68s；其中 policy/discovery 共143 | 0 |
| changed/new application/test/e2e ESLint | **36 files，0 error / 0 warning** | 0 |
| 新 e2e runner node --check | 无语法错误 | 0 |
| 沿原 tsconfig 的 supplementary source-only TypeScript API check | **360 source roots，0 diagnostics** | 0 |
| git diff --check | 无 whitespace 错误 | 0 |

证据：independent-policy-tests.log、independent-focused-tests.log、independent-lint.json、independent-typecheck.log。

Source-only TypeScript check 仅排除 .next 生成入口且不改变配置/emit/incremental 文件；**不是完整 tsc 门禁替代**。本轮不把已删旧 route 的四条 stale .next TS2307 当业务缺陷，不恢复旧 API，不改 tsconfig，不动生成树。局部 lint 的36与主代理 baseline全量704不是同一覆盖范围，不能据此宣称全量 lint 或全量 npm test green。

## 交给主代理与未覆盖

- 刷新 clean candidate，带入上述两个测试文件和 admission spec；唯一 clean npm-ci 三件套仍由主代理执行，按同树实际计数与原 baseline（tsc0/lint704files0/2758 hermetic tests0）对照。没有重新跑长完整门禁；strict PI_OFFLINE 原四个 mock-plugin failure 本轮不触及/不掩盖。
- **真实已安装源**经隔离副本 + 宿主 SDK discovery 的 smoke、bad ack/version 契约错误、真实 Chromium host链与 General三语设置，由主代理完成。这里的 peer 不替代实际包 caller/ack 校验，尤其不宣称其最小 ack validator覆盖真实外部完整 superseded 契约。
- 实际浏览器的进程组清理、无残留 .next dev lock/端口和失败 trace 产物规则仍需实测；本轮只有静态/语法验证。
- TUI UI、Windows/Safari、production bundle/distribution、真实服务更新/restart 均未覆盖；客户端源码边界检查不冒充发行 bundle 验收。
- pi-tmp-run 全部本轮目录均自动清理；最终检查 review-ask-* 无残留。没有启动服务或遗留本轮后台进程。
