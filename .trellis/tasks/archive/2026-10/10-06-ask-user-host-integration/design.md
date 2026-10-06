# AskUser 系统安装工具与并立 Web host 设计（2026-10-06 已获批准）

## 行为缺口与最小边界

缺口位于 extension discovery → effective tool selection → host open 边界，不在 React 表单。外部 package 抢先注册同名工具，但 Web 没提供 bridge，也没对外部工具执行 settings/model-only 准入。

用户明确要求使用系统已安装版本，Web 与 TUI 投影并立。此前“固定外部生产 dependency + 隐藏系统副本”是助手误读，未获批准，现全部撤回。本设计以 SDK 正常发现的系统工具为唯一工具源；Web 只提供并立宿主。没有本地工具 fallback，也不以 Web 自带版本取代用户版本。

用户进一步决定移除 AskUser 专用 Web 开关。以下准入只指 SDK 原有资源/工具配置、model-only 与宿主身份边界，不再读取 Web askUser preference 或 PI_WEB_ASK_USER。

## 系统发现与并立投影

```text
系统安装的 pi-ask-user（SDK 按原配置发现）
  └─ 唯一 ask_user 工具核心 / 参数 schema / prompt / execute / bridge resolver
       ├─ TUI 会话 → 原生 TUI host → 终端表单与答案交付
       └─ Web 会话 → Web bridge host → React 表单 / SSE / Web 答案交付
```

- 不添加生产 dependency、不固定 SHA、不自动安装、不增加包根 resolver 或额外 external entry。外部版本由系统安装管理，Web 绑定协议，不接管安装。
- SDK 沿用既有 agentDir/settings/packages/extensions、项目 trust、scope 与 reload。单个系统源只按原发现链加载；移除 Web 同名工具后，不人为制造需要去重的第二副本。
- 若用户实际配置多个不同同名工具，Web 在 extensionsOverride 的工具级 policy 明确拒绝歧义。它不是“factory 初始化前去重”或不可信代码沙箱，不能宣称撤销已经执行的工厂副作用；不为此改写 SettingsManager 或删整包。
- Web 只投影必要的 model-only 与宿主执行边界，保留外部 execute/schema/prompt/source 及 SDK 原激活/hidden 语义，不重建工具或强制激活。SDK 1.0.0 仅默认激活 direct/model-only 且 defaultActive≠false 的定义；原 codemode/deferred 即使显式 defaultActive:true 也默认 inactive，因此投影时归一化为 defaultActive:false，以保持行为而不是错误逐字段复制。原输入定义/来源不修改，显式 SDK selection 仍可激活；真实 SDK 原生/投影对照见 independent-review.md。TUI 进程不经过 Web policy，仍使用同一系统安装。
- 未安装时 Web 正常运行但不提供 ask_user；loader 错误/协议不兼容清楚诊断，不悄悄备用。历史 pending 的展示、提交取消仍由 Web 状态链负责，不受新工具可用性替换。

## 构建边界与去内置范围

“运行时使用系统扩展”不等于“编译期静态 import 系统目录”。React bundle 无法假设用户部署时的安装路径，不能因此反过来强迫产品多安装一个锁定副本。

- 删除 Web 的 createAskUserToolDefinition/工具 schema/prompt/execute、本地包 entry 与 bridge caller/resolver、无用 tool 再导出和 portable package 声明；不保留可执行备用核心。
- 保留 Web-owned DTO、bridge request 解码、浏览器 submit/cancel 校验、pending/outcome/答案文本与 UI/controller。它们是宿主版本化 wire contract 与宿主交付逻辑，不是另一份可注册 AskUser 工具。边界定义集中在 Web protocol owner，不散布消费者自行解码。
- 现有 portable/types/validation/format 中被 host 使用的部分须按职责拆分/重归属，不能盲删导致浏览器或存储无校验；也不为规避静态 import 再复制一整套外部工具。模型参数校验由实际外部工具负责，Web 校验自己的协议和浏览器入口。
- UI/controller 可迁为明确的 Web host 目录；移除 portable package 的外观不代表删除 Web 投影。保留样式/a11y/键盘/锁定重试等行为，DTO/限额遵守支持的 v1 contract。
- 编译不需要安装 AskUser；客户端不导入外部 index/工具/TUI/SDK。不因本任务新增 transpilePackages 或包发布构建流程。
- 兼容按 bridge version、bounded payload 与 ack contract 校验。记录测试用源 revision 是复现证据，不是产品 pin；未知版本 fail closed，未来协议变化需要宿主适配，不能声称任意升级都无条件兼容。

## 所有权与执行边界（无专用 Web 开关）

- AskUser 在 Pi Web 是主会话专用的保留控制工具名 `ask_user`。
- 正常主会话恰好一个系统 discovered 工具：保留 RegisteredTool 的 execute/schema/prompt/source，Web 强制 `exposure: "model-only"`，不注册第二个定义；曝光投影不等于激活工具，SDK 原有选择仍权威。defaultActive 的投影按原 SDK 默认激活语义归一化，hidden 原定义不动；不对原始对象或系统安装做写入。
- 未解决的第二外部同名来源：撤销歧义工具并给出冲突诊断，不能任意 first-wins，也不能用自有实现隐藏错误。
- SDK 资源被排除、工具 inactive/hidden：不由 Web 的 carry 额外恢复；其声明与可调用状态由既有 resolver/SDK 控制。SDK 1.0.0 原生 reload 会按注册默认值重新激活默认 active 的 direct/model-only 工具，Web 保持该行为，不新增特例；defaultActive:false、hidden、资源排除仍保持关闭。无 AskUser 专用 Web disabled 状态。
- Chat-only 与子代理：不提供主会话 bridge；即使子代理允许加载扩展，也从可用工具中排除 ask_user，保留其他资源的现有准入。
- 只修改单项工具 Map/definition，不整体删除扩展，不影响其其他 tools、commands、flags、handlers。AskUser 的 terminal command 在 RPC 下仍按扩展自身拒绝，不模拟其 TUI 命令。
- 外部同名工具必须遵循 AskUser v1 host 契约。此任务不承诺任意第三方同名工具的 UI 翻译；未知/不兼容协议不得报告 Web ask 已 posted。定义投影不是权限沙箱，已信任扩展仍拥有宿主进程权限。

## Bridge 数据流

```text
SDK 同一个 DefaultResourceLoader
  ├─ 系统安装的外部 package → ask_user（Web policy 后 model-only）
  └─ Web bridge-only inline host → pi.events.on(resolve-open:v1)
          同步 resolution.register(open)
                    ↓
            open({ version, conversationId, questions })
                    ↓
          校验版本/身份/问题 → 按调用身份查 alive wrapper
                    ↓
          existing wrapper.openAsk → store / SSE / best-effort mirror
                    ↓
          匹配的问题 acknowledgement → tool terminate:true
                    ↓
          Web-owned React view → submit/cancel → same-session custom follow-up
```

Web host 按已公开的 `pi.ask-user.bridge:resolve-open:v1` contract 同步 register，异步工作位于 open；不调用或重实现外部 resolver，不导入机器安装路径。正常主会话绑定 bridge-only host，没有 Web enabled 快照；非主会话不提供此 host。调用时检查 version、conversationId 与 loader 会话身份一致、有界 questions，并查 alive wrapper；closing/missing/mismatched 拒绝。外部 resolver 校验 ack，Web 不向其他会话写状态。在 Web 注册 host 后选择 Web 链路；TUI 会话继续使用原生 host，不模拟 ctx.mode/ctx.ui。

不创建第二个 event bus，也不把 bridge 放 globalThis。使用 SDK `pi.events.on` 的 loader/runtime 清理生命周期；真实 AgentSession reload 必须验证 listener 不累积，shutdown 后不得继续持有旧 wrapper。

## 宿主链路保持不变

Web pending 状态、askId key、SSE opened/closed、state hydration、跨设备轮询、stale close resolver 及 `pi-web.ask.answers` custom follow-up 不改名、不迁移。React view/controller 只移动并改纯模块 imports，不重新设计其行为。

不改变 prompt admission：只有 SDK accepted input 才 supersede 旧 ask，MCP preparation 被 Stop 拒绝仍保留旧 ask。保持 configured/coding pins、active carry 与 hidden/inactive 过滤；不为治理 AskUser 回灌所有扩展工具。

## Web 开关删除与旧配置兼容

- 删除 SettingsPanel 的 AskUser section、状态/fetch/toggle/专用 reload handler；仅删不再使用的 GeneralSettings 参数，不影响其他 pane 的 session reload 或公共组件。
- 删除 app/api/settings/ask-user/route.ts、lib/ask-user-settings.ts 及其设置行为测试；不存在返回固定 enabled:true 的兼容 endpoint 或新的隐藏 env gate。
- 删除 en/zh-CN/zh-TW 的 settings.askUserTitle/settings.askUserDescription；保留 chat.askUser* 表单文案及共享 agents.reload* 文案，验证三语 registry 一致。
- 旧 pi-web-settings.json.askUser 字段不再消费；共享设置 helper 继续保留未知字段，不自动删除它或改写真实配置。PI_WEB_ASK_USER 不再参与判断。两者均为退休设置，不能在 bridge/policy 中偷偷继续读取。
- SDK packages/extensions/defaultTools/active loadout 仍决定工具存在和激活；安装或资源变化经正常 SDK reload 生效，不依赖旧 General 页面提示。旧 pending 的展示与关闭不要求当前工具已激活。
- 验证有安装且 SDK active + 旧字段 false/env 0 仍成功；无安装、原 SDK 资源关闭、inactive/hidden 则不可被自动发现逻辑复活。新设置页不请求旧 API；旧客户端调用已删除路由按正常缺失处理，不作为新的控制渠道。

## 可靠性与兼容性边界

- 当前 Web memory store 是权威，磁盘镜像写失败日志化；答案 sendCustomMessage 为 fire-and-forget，无持久 outbox。此任务不把桥的结构 ack 冒充磁盘事务或恰好一次交付。
- 正常路径验证 persisted pending 可恢复，坏 ack/host 拒绝不输出成功 terminate；既有写盘/send 失败债务单独披露，不拓展为 TUI repair 系统。
- 当前 types/validation/format 同源，职责重划仍要验证 v1 限额、Web 输入/答案格式与历史 pending。系统版本更新经 SDK reload 后仍按协议验证，不假设 Git SHA 相同；TUI-only 草稿/分页/多行/branch storage 不移植。投影并立是架构关系，不宣称 Web/TUI 已具有相同 outbox 或状态持久化保证。
- 宿主 SDK pin 是 1.0.0，外部 dev baseline 是 0.85.1；实际 package discovery 冒烟必须使用 host 的 SDK peers，不能用外部 npm test 代替。
- 生产服务使用自包含 dist；仅交付代码与隔离验证。部署、重启现有会话和 live 再验需单独明确操作，不能声称源码修复已在当前会话生效。

## 预期文件

- `lib/ask-user/extension.ts`：只做 bridge listener、会话身份绑定、live lookup，删除内建工具注册与 Web preference/env import。
- `components/SettingsPanel.tsx`、app/api/settings/ask-user/route.ts、lib/ask-user-settings.ts 与相关测试、三语 settings 文案：删除专用 UI/API/helper/env 控制，不影响其它设置/reload。
- `lib/ask-user/store.ts` / `types.ts` / host 协议模块与相关消费者：重划 Web DTO/校验/格式归属，删除重复可注册工具与 resolver，不静态导入系统路径。
- `components/ask-user/`（建议落点）与 `AskUserAppHost.tsx`：移动 Web UI/controller 与相关测试/fixture，更新 imports/文档，不扩展 UI 功能。
- `lib/ask-user/extension-policy.ts`（如需独立 helper）：纯工具级 source arbitration / gate / model-only 投影，单 owner；复用已有 extension policy 的 clone/filter 模式。
- `lib/rpc-manager.ts`：compose normal extensionsOverride；对子代理排除控制工具。其余 open/close/admission/restore 只做必要回归，不默认改写。
- AskUser extension/policy/discovery/codemode 集成测试与 rpc exposure/shutdown 回归；isolated browser fixture 只在需要时新增离线源与端到端驱动，不重写 UI。
- `.trellis/spec/frontend/ask-user-protocol.md`、相关 `docs/agents/tools.md`/`sessions.md`：更新所有权与 host bridge 契约，保留可靠性边界。

## 回滚

未改变 pending 持久化格式，无数据迁移或真实设置清理。回滚需一起恢复 Web 注册/host policy/协议/UI imports，以及原设置 UI/API/helper（若回到完整旧行为），避免半迁移；不涉及 dependency pin 或系统安装改动。旧方式仍有原故障，因此回滚不是修复替代。不得擅自改用户 packages、系统版本或外部仓库。
