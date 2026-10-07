# 修复子代理恢复时丢失 provider 与静默换模

## 状态与目标

状态：2026-10-06 用户在最新最终规划摘要后明确选择 `approve_implementation`，已授权实施；不含生产部署或修改真实用户配置。此前已选择 `inherit_trusted`：子代理默认加载当前已启用、已安装且受信任的扩展，profile 可明确禁用或限制工具。

目标：新建、Agent resume、浏览器重开、idle 回收和新进程冷恢复均保持用户选定的 provider/model；默认子代理拥有合法扩展的工具与必要 lifecycle，包括已配置搜索。无法恢复时在发送请求前明确拒绝，不静默换模。

用户价值：委派不会无故失去搜索能力，任务质量、费用及请求目的地仍由用户选择控制。恢复不依赖父 runtime 永久驻留，不要求重新保存全局默认。

## 已确认背景

- 2026-10-06 子会话 `01a110b5-31e9-7540-97bf-c3eaa29b9542` 从 `sub2api-codex/gpt-6.1-sol` 开始，10:31:25 UTC 完成；10:44:15 UTC 的无 model 覆盖 Agent resume 后实际作答变为 `openrouter/moonshotai/kimi-k2.6`。仅有初始 GPT model_change，用户默认与启用范围均不含 Kimi。具体 idle 回收触发未单独证实。
- 初次借用父 runtime（`lib/subagent-runtime.ts:244–336`），恢复经 `:513` 创建 fresh services（`lib/rpc-manager.ts:2675,2783`）；noExtensions 使 Sub2API 缺失，已有会话跳过初始 scope（`:2835–2859`）。SDK 1.0.0 `dist/core/sdk.js:92–117` 传空 scopedModels 回退，`model-resolver.js:23,473–532` 的 OpenRouter 默认为 Kimi。完整只读证据见 `research/investigation.md`。
- 三个内置 profile 默认关闭扩展（`lib/subagents.ts:155–202`），项目 `.pi/agents/trellis-research.md:6` 已明确开启。新建枚举 factory 工具后传 `tools:activeTools`（`subagent-runtime.ts:290–300,338`），恢复传旧 snapshot.tools（`rpc-manager.ts:2740,2859`）；SDK 将其作持续硬许可名单，而非初始 active set（`dist/core/sdk.js:145–148`、`agent-session.js:2775–2787`）。Sub2API 在 session_start 延迟注册 web_search（`pi-sub2api/extensions/search.ts:34–65,93–101`），仅切换扩展开关不能保证搜索可用。
- SDK services 会 refresh 传入父 runtime（`agent-session-services.js:111`）；DefaultResourceLoader 即使 noExtensions 也裸 resolve packages（`resource-loader.js:356–364,492`），默认可能安装缺包。公开 PackageManager.resolve(skip/error) 支持无安装预检，但 services 不可注入 loader；需要窄公共 ResourceLoader/services 适配，不能访问 SDK 私有字段或升级 pins。
- 原 enabledModels UI 零命中回退全目录（`lib/model-scope.ts:115–153`）。本任务只增加 child 执行校验，不把 UI 容错改成全仓硬白名单。SDK continuation 的 constructor model 不追加 model_change（`dist/core/sdk.js:279–290`），cold set_model 须走标准持久化。
- 必要 provider-only 初始化的来源采集仍可用：公开 pending 注册带 extensionPath，sourceInfo 在 override 后补全（`resource-loader.js:403–418`）；具体 additionalExtensionPaths 可在 noExtensions 下加载。Sub2API 的 provider `extensions/index.ts:6–10` 与 search.ts 是独立入口；这一例外路径不能加载包目录，把搜索带入明确禁用的 child。

## 范围与要求

| ID | 要求与 owner | 验收 |
| --- | --- | --- |
| R1 | 新子代理保持 `request.model > profile.model > parent.inner.model`。在独立 child runtime 重新解析目标、认证、scope，不直接沿用父 model 对象或选择 SDK provider 默认。owner：`subagent-runtime.ts:331–336`、共享 services/selection helper。 | AC1、AC4 |
| R2 | 恢复以活动分支最新显式 model_change 为准，不用 profile/default 覆盖，不把误用 Kimi 的 assistant 响应当授权；无明确选择的旧 child 可浏览，执行需用户改选。owner：`session-reader.ts:760–791`、RPC startup。 | AC2、AC7 |
| R3 | 三个内置 profile、新建表单及缺省标志默认继承扩展：按 child cwd 当前全局／项目启用配置、安装状态与 trust 加载，不复制父 loader、runtime、工具状态或凭据。保留正常 child lifecycle 与已配置搜索，加载与 reload 均不自动安装。显式 false／none 和既有 false 快照不变。owner：`subagents.ts:155–202,210–213,321`、`AgentsConfig.tsx:47–59`、profile route、shared services。 | AC1、AC2、AC6 |
| R4 | 工具许可与激活分离：新快照持久化版本化内置工具许可及原 ext allow/deny，支持延迟注册、reload 与 nested calls；deny 优先，排除 Agent/get_subagent_result/steer_subagent/ask_user，hidden/defaultActive:false 不被复活。旧 v1 tools 保持确切名单；损坏／未知 child policy 明确拒绝，不能当普通会话启动。明确 noExtensions 仅定向初始化必要 provider，不给 child 带 tools/hooks/lifecycle。owner：subagents decoder、registration-aware projection、source owner。 | AC3、AC6、AC9 |
| R5 | loader/provider/policy 错误不得掩盖目标恢复失败；缺 provider/model/auth/必要来源、scope 全失配、目标未启用或 selection mismatch，在 enqueue/admission 前拒绝。等 child extension binding/ready 完成再 prompt；child 初始化与 dispose 不 refresh/register/unregister 父 runtime。 | AC4、AC5 |
| R6 | HTTP／Agent tool 返回安全原因与 provider/model；prompt 拒绝保持 `prompt_rejected/accepted:false`，保留草稿／旧 ask／上次 result，不伪造新 completion；三语提示齐全。owner：route、api-types、agent-client、hook 现有拒绝路径。 | AC5、AC8 |
| R7 | 覆盖全部新建／重开入口。默认继承恢复不需要旧 provider provenance，也不自动打开父；只有 noExtensions 的旧数据来源补全依赖可证实的可信父 registry，否则拒绝。cold set_model 先准备合法目标并标准持久化；resume+model 明确拒绝，不继续静默忽略。 | AC2、AC7、AC8 |
| R8 | 范围限内置子代理模型恢复、扩展默认及对应工具政策。普通会话、显式 Chat-only、skills 默认、精确 profile prompt、APPEND_SYSTEM 排除、virtual selection、全局保存及模型 UI scope 保持；不升级 SDK、不改真实用户配置／历史／服务，不引入新 Web MCP 接入或 AskUser 控制。 | AC9、AC10 |

## 验收标准

- [x] AC1：三个内置 profile、新表单和缺省标志继承扩展；明确 false/none、规范字段优先、alias 和 foreign keys round-trip 保持；真实 native `gateway/gpt` fixture 下模型优先级正确，非法目标零请求，父 runtime 无注册／刷新变化。
- [x] AC2：默认继承 child 在完成关闭后 same-id resume、无父 wrapper 的新进程冷恢复均保持 GPT；延迟注册的搜索 fixture 可声明并通过受控本地 backend 执行，reload／再恢复仍可用。备用 Kimi 请求0，真实外部模型／搜索请求0，session id/branch不变。
- [x] AC3：明确 noExtensions child 只初始化经当前授权的必要 provider 文件，旁边 search／无关入口哨兵0；provider host 不绑定 session，不派发 lifecycle、不连接 MCP或给child添加工具/hooks。缺来源或不支持自动重放时拒绝，child dispose不影响父。
- [x] AC4：missing provider/model/auth/selection/source、disabled目标、部分／全部 patterns 失配、同名与 nested id、ambiguous bare id、thinking pin、失败注册与 SDK mismatch 有确定性测试；不允许全目录 fallback 执行。必要来源的 native 覆盖与 legacy 多来源拒绝有测试。
- [x] AC5：启动／恢复／工具政策失败零 prompt/模型请求，start locks 和未发布 wrapper 清理可重试；旧 ask、草稿、result保持，无新增完成通知／全局默认写入，child ready 前不能发送。
- [x] AC6：两条加载路径的缺包／版本不符零安装，停用／trust撤销零未授权入口执行，reload重核授权；sourceInfo、filters、alias与worktree cwd正确。旧false与旧确切工具列表不扩大；伪造／损坏／未知snapshot或policy不能进入普通会话路径；必要来源的目录/glob/spec/越界symlink均不成为授权。
- [x] AC7：GPT model_change后有Kimi响应的fixture仍恢复GPT，alive错误wrapper拒绝继续。旧继承child不要求来源快照；旧falsechild只能由合法alive父的已确认来源补全或明确拒绝，不自动全量启用、不删历史/cost/改父文件。
- [x] AC8：旧模型不可恢复时浏览器明确选合法新模型仍可成功，标准model_change写入后才能发送，失败改选不写记录；并发cold set_model意图不丢失；resume+model明确报错。
- [x] AC9：普通会话/Chat-only/tool rebuild/branch/fork/virtual selection/model UI/default保存回归全绿。新工具policy覆盖factory/延迟/再次注册/reload、allow/deny、歧义来源、reserved tools、hidden/defaultActive及nested旁路；不擅自激活扩展关闭的工具。浏览器证明模型标签、失败提示、草稿保留、新表单默认，含移动视口。
- [x] AC10：独立lock一致 `npm ci --include=dev` 树上的tsc/lint/npm test全绿；真实SDK与本地faux-provider/search/browser测试隔离HOME/agentDir，记录覆盖和未覆盖、保留正式证据，清理本任务进程/临时目录；Safari/Windows未实跑则单列未覆盖。

2026-10-06验收闭合：证据映射见`acceptance.md`。最终代码2997/2997、tsc0/lint728files0、18-04-41最终Chromium完整矩阵通过；未实跑真实插件/搜索服务/Safari/Windows单列，不作平台兼容证明。未提交/部署/归档。

## 支持边界与非目标

- 默认继承的是当前合法资源发现结果，不是父AgentSession的副本；用户信任只按现有规则判定。第三方factory/hooks是受信任可执行代码，可影响请求或提示词，不是沙箱；工具过滤不保证任意扩展副作用只读，不承诺收益测量或自动挑选“研究工具”。
- 不自动打开搜索配置、登录、配置fallback或启用隐藏工具；native搜索和direct web_search的许可／路由按扩展自身配置。默认启用扩展不等于强制启用其每个工具。
- 必要provider初始化与会话扩展权限仍分离。仅对明确false/旧false路径保留原C：factory-ready native物理provider或来源可确认的单文件legacy；session-context/lifecycle依赖、extension virtual router、动态来源不明及多文件legacy不能透明重放，明确拒绝。该限制不泛化到正常继承路径。
- 旧快照不迁移为新默认，不从保存的工具名猜回ext selectors。默认只改变新建；原会话政策保持。损坏child元数据须拒绝执行，但历史可浏览。
- 不修改settings/auth/models/sub2api.json，不复制凭据、不新增跨会话provider singleton或隐藏父session；不注销OpenRouter、不迁移真实会话、不重启/发布生产。不修改workflow/Trellis模型规则、通知中心、SDK pins/lockfile；不新增Web builtin/MCP/AskUser能力或自动继承skills/context/APPEND_SYSTEM。

## 决策与审批

已确认：默认 `inherit_trusted`，不是按角色默认禁用；主路径采用独立child runtime和合法扩展加载。仅存活父方案不满足冷恢复；来源定向重放仅是明确noExtensions的例外，不是所有child的必要前置。控制工具排除、显式选模和禁止静默回退保持。

产品问题已收敛。无安装ResourceLoader/services适配与registration-aware工具过滤的真实SDK证明列为实施技术门禁；若现有公共API无法满足，先停下来反馈，不升级SDK或扩大权限绕过。三份文档及curated manifests修订完成后呈现最终摘要；只有用户后续明确批准该摘要才可start/实施。
