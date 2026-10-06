# Loader / 部署来源与最小接入规划（只读，2026-10-06）

> 最新澄清：用户要求直接使用系统已安装版本，Web/TUI host 并立；固定正式 dependency 是助手误读并已撤回。本文保留调查事实与历史 A/B，但 Web-owned owner、内建 fallback 均不是执行方案；最新 PRD/design/implement 与 system-installed-host-decision.md 为准。

## 已核实的阶段性事实

1. **本次错误来自 bridge-backed package 路径，而不是 Web 自有 inline execute。** 外部 `/home/xupeng/dev/personal/pi-extensions/pi-ask-user/index.ts:20-33` 注册同名 `ask_user`，调用 `openAskThroughBridge(pi.events, ...)`；`bridge.ts:128-136` 生成用户看到的 `expected exactly one synchronous host bridge ... (got 0)`。Web `lib/ask-user/extension.ts:26-34` 只直接注入 wrapper.openAsk，不注册 bus listener，因此不能接住该调用。
2. 只读取真实 settings 的白名单字段（未读 credentials）：`/home/xupeng/.pi/agent/settings.json` 的 **packages 第12项**是 `../../dev/personal/pi-extensions/pi-ask-user`，以该 settings 所在目录解析，实际为 `/home/xupeng/dev/personal/pi-extensions/pi-ask-user`。真实 `pi-web-settings.json` 的 askUser 为 true，服务进程白名单环境无 `PI_WEB_ASK_USER` / `PI_CODING_AGENT_DIR` override。不输出其他配置值。
3. **覆盖是 first registration wins，不是最后注册覆盖。** 部署 SDK `/home/xupeng/services/pi-web/dist/node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js:506-512,545-577` 先加载 file/package，再 append inline；`extensions/runner.js:410-438` 取第一个工具定义。conflict 只记诊断并保留 extensions（resource-loader.js:579-585），不会自动优先 Web。Web 的 `extensionsOverride` 当前只有 bash/subagent 仲裁：`lib/rpc-manager.ts:2705-2720`。所以默认发现外部 package + Web inline 时外部 ask_user 胜出。
4. **settings gate 被绕过。** `lib/ask-user-settings.ts:35-42` 默认开、env 优先、binding 时读取；`extension.ts:27` 关闭只是不注册 inline，不限制外部 package。关闭后仍可注册并激活外部 ask_user。不是单纯桥缺失问题。
5. **model-only 也被覆盖丢失。** 已核对外部 `tool.ts:135-145` 没有 exposure，Web `lib/ask-user/portable/tool.ts:134-140` 有 `exposure: "model-only"`。SDK `agent-session.js:1102-1113` 默认 direct，active direct 可 nested execute；只加桥会使 Code mode 能登记持久 ask，却无法传播 model-turn terminate。必须一起治理，不能将桥接单独视为修复。
6. **部署与工作树分离。** 当前进程 PID 950 为 `node /home/xupeng/services/pi-web/dist/bin/pi-web.js ...`；next-server PID 4471 cwd 是 `/home/xupeng/services/pi-web/dist`。dist/node_modules 是真实目录，非源码软链；两边 SDK 均 1.0.0。`/home/xupeng/services/pi-web/run.sh:35-43,151-190,230-231` 说明从仓库构建复制到自包含 dist 再启动。`dist/.pi-web-build-stamp:1-5` 为 head `add1e6a2b8933e6a035c189d8725b7301c97e330`、ref personal、built_at `2026-10-04T18:53:06+08:00`；当前源码 HEAD `128fc3c7dd8cdf60aa4ebe12e7ec3c75c964f61f`。因此编辑工作树不等于 live 生效。
7. 实际 bundle `/home/xupeng/services/pi-web/dist/.next/server/chunks/6429.js:15` 包含 `pi-web-ask-user` 的直接注册逻辑；同文件无 bridge channel。结合源码注册链与本次错误足以解释线上外部优先。未通过 live get_tools/模型调用抓取 wrapper 的运行时 sourceInfo，不能声称做过该级验证。

## Loader 边界与 reload

- services 工厂真实实现 `.../dist/core/agent-session-services.js:52-69` 每个 services 建 DefaultResourceLoader 并 reload，`120-139` createAgentSessionFromServices 复用同一个 resourceLoader。
- Web `lib/rpc-manager.ts:2682-2722,2754-2761` 通过该链注入 inline factories。必须在这里同 loader 绑定桥；用另一个 loader / 全局 EventEmitter 不生效。
- SDK resource-loader.js:243 为实例 eventBus；loadExtensionFactories 的 `873-889` 把同 bus 交给 inline。事件 bus `event-bus.js:3-20` 同步触发 handler，但 async 包装会吞 handler error；必须同步 request.register，持久化工作放到其 async open 内。监听器 await 后 register 会被判为 0。
- SDK loader.js:111,147-160,412-422 跟踪 event bus unsubscribe，需沿用 pi.events.on 的 runtime 清理，而不是额外 ambient bus。Web reload `lib/rpc-manager.ts:1412-1438` 会 inner.reload 后恢复有效工具选择；新增桥与仲裁都必须在每次资源重载重新建立，不得累积 listener。
- Web 主会话、Chat-only、subagent 分支明确分开：rpc-manager.ts:2686-2705。不能让 bridge 注入那些会话并替它们注册 ask_user。允许加载扩展的 subagent 仍可能自行发现外部 ask_user，故需要明确全局 model-only 控制工具排除策略，而非只忽略 inline。

## 建议最小方案：Web 做 owner 仲裁 + 同 loader bridge，外部仓库不改

**优先保留 Web model-only 工具作为唯一 effective ask_user**，同时实现宿主 bridge 以接入新版 package 协议，不把未经 gate 的 external direct tool 放行。这比“只加 bridge”完整，也比跨仓外部改 exposure 再让 package 当 owner 风险小。

1. `lib/ask-user/extension.ts` 增加 Web host listener；factory 同步安装 `pi.events.on(channel, resolution => resolution.register(open))`，open 内校验 version / conversationId / questions，按 invocation 实时找 **alive** wrapper，调用现有 openAsk。延迟 wrapper lookup，保留 registration 先于 wrapper 的生命周期。绑定时的 enabled 快照与工具 gate 一致；disabled bridge 不得 ack 成功。未知版本、缺失/closing wrapper fail closed。
2. 新增 `lib/ask-user/extension-policy.ts`（命名可调整）或 extension.ts 内纯 helper：在 `extensionsOverride` 对非 Web owner 的 ask_user 做 **tool-level** 移除/隐藏（复制 Map，不整个删 extension），保留其他工具、commands、flags、handlers。Web enabled 时唯一 effective 定义为 inline model-only；disabled 时所有 discovered ask_user 都不可见/不可调用。不要依赖顺序重排，也不要用 replaceable:true 让 Web 自己退让。
3. `lib/rpc-manager.ts` 将 helper 接入既有 overrides。normal / child / Chat-only 的 owner policy 必须明确：本项目 spec 说 ask_user 主会话专属；子代理即便 loadExtensions 也不得获得 package ask_user（可复用 services options 的排除/override，仅针对 ask_user，不改变其他扩展 admission）。不要恢复全部 extension tools，保留 active carry / coding pins / hidden 过滤 / admission。
4. Bridge-backed 工具和 Web-owned 工具可用于隔离集成测试的不同 loader 模式。**默认生产仲裁后执行的是 Web-owned 定义，不应宣称实际线上 execute 来自外部 package。** 若 R1/R2 要求默认生产必须执行原样 external 工具而不是其 Web 投影，此方案需用户批准该 owner 选择，或改用后述方案B。
5. 不硬编码 `/home/xupeng/dev/...` 到产品代码；bridge v1 常量/结构类型可引用现有 Web portable bridge，不从外部绝对路径 import。外部仓库保持只读，不把其源码复制替换整个 Web portable 目录。

### 备选B（只有用户要求外部执行为唯一 owner 时）

在 extensionsOverride 中对 discovered ask_user 定义做 Web admission 投影：enabled normal session 时强制 `exposure: "model-only"`，去除 inline 同名工具，仅保留一个 package owner；同 loader bridge 接 wrapper.openAsk。无 package 时用 Web inline fallback。disabled / child 时撤销所有 ask_user。重复 package owner 必须显式拒绝/告警，不能 silently first-wins。需要对同名第三方工具的识别与兼容性设策略；未知 ask_user 不能默认判为协议兼容。比方案A更多 source selection/定义包装，仍可不改外部仓库；不建议仅靠跨仓修 exposure（仍漏 settings gate）。

## 持久化和答案交付：既有债务，不默认纳入重写

- `lib/rpc-manager.ts:590-604` 先 memory open / SSE，后 best-effort persist；`lib/ask-user/persist.ts:105-124` 捕获写失败，不传播。桥的 valid ack 只证明结构与问题身份，**不证明成功写盘**。新版 bridge 称 durable，但沿用现状不能承诺“失败落盘不 posted”。
- `rpc-manager.ts:634-660` 先关 ask / 清盘再 fire-and-forget follow-up；send 失败只日志，没有 outbox；不能承诺 crash-proof / exactly-once 答案。
- 最小任务可明确保留既有 best-effort persistence 与 delivery 语义，并在报告/验收中写出边界；若 PRD R2 坚持“成功持久化之后才 posted”，至少需独立讨论 bounded strict open transaction：prepare/validate → atomic disk commit → memory/SSE commit，写失败保留旧 ask；这不等同于 outbox 全面重写，但也不是“桥接小补丁”。不要悄悄把任务扩成 durable/outbox redesign。
- prompt admission 不动：`rpc-manager.ts:1004-1013` 只有 accepted preflight 才 void old ask；MCP preparation 在 `1038-1064`，Stop 拒绝 unsent 时保留旧 ask。新桥不能提前 supersede、在 binding 时 clear pending 或把 tool failure当 prompt rejection。

## 推荐文件改动清单（仅规划）

- `lib/ask-user/extension.ts`：bridge 与 enabled/runtime lookup 生命周期。
- `lib/ask-user/extension-policy.ts`（新纯 helper，或放 extension.ts）：同名工具所有权 / gate / model-only policy。
- `lib/rpc-manager.ts`：正常 services overrides + child ask_user 排除；保持现有 admission/close/reload。
- `lib/ask-user/extension.test.mjs`：桥缺失版本、同步注册、enabled 快照、missing/closing wrapper。
- `lib/ask-user/discovery-host.integration.test.mjs`（新）：真实 SDK package settings discovery、外部优先复现、仲裁/disabled/重复源/reload。
- `lib/ask-user/codemode.integration.test.mjs`：增加 installed package 场景，不只验证 inline portable。
- `lib/rpc-manager-tool-exposure.test.mjs` / `lib/rpc-manager-shutdown.test.mjs` / `lib/rpc-manager.test.mjs`：carry、admission、replacement、答案续跑回归。
- `.trellis/spec/frontend/ask-user-protocol.md` 和 `docs/agents/tools.md` / `docs/agents/sessions.md`：本任务获批准后更新 owner/bridge/debt 描述。
- 不改外部仓库、真实 settings、service scripts 或部署目录；不默认改 persist.ts/store.ts 为 strict/outbox。

## 待用户决定

1. 默认 owner：A 保留 Web model-only 定义（推荐；外部协议以 bridge 可接入）还是 B 执行 external package 并由 Web 强制 admission/exposure 投影？R2 “同款 AskUser”是否要求原样 package execute 是上线默认？
2. durable 范围：维持既有 best-effort 并调整 R2措辞，还是单独批准最小 strict-open transaction？outbox/答案 delivery redesign 不在本任务默认范围。
3. 仲裁是否对所有同名 ask_user 生效（主会话专属工具，推荐 fail closed），或只识别已知 pi-ask-user 源（未知同名工具保留将无法保证全局 gate/model-only）？

## 验证状态

Planning only。已读 codegraph explore；其 rpc-manager 范围 stale 已用 read 校正。未 start、未 commit、未运行 next build、未启动/重启服务、未请求真实模型、未读 auth.json 等 credentials。PID 950/4471 是预先存在的部署进程，没有操作或停止。后续测试必须使用独立 package copy + host SDK 1.0.0、隔离 HOME/PI_CODING_AGENT_DIR、PI_OFFLINE=1 / JITI_FS_CACHE=false、pi-tmp-run；源码阅读与临时探针不能替代 clean npm ci 三件套或真实浏览器验收。
