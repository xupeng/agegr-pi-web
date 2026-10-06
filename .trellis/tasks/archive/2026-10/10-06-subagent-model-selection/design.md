# 技术设计：默认继承受信任扩展，显式选模与权限分离

状态：2026-10-06 用户已选择 inherit_trusted，并在最新最终摘要后明确批准实施。此前所有child都走来源定向重放的C方案不再是主路径，只保留明确noExtensions例外；先验证SDK技术门禁，失败即停止反馈。

## 1. 架构与最小行为缺口

```
新建选择：request.model > profile.model > 父当前选定model的引用
恢复选择：活动branch最新显式model_change（或本次合法user-command）
资源政策：新profile默认继承；已有child服从持久化快照
  继承路径 → 当前安装/启用/trust无安装预检 → 独立child runtime + 正常扩展lifecycle
  明确false → 必要provider来源预检/定向factory host → 独立runtime + 无会话扩展child loader
两路径 → strict child scope/auth/selection gate → 显式constructor model
       → child binding/ready + registration-aware工具许可 → admission → prompt
失败 → typed refusal + 清理未发布状态；零备用模型请求
```

`subagent-runtime`拥有委派/队列，`rpc-manager`拥有重开/closing/start locks，`session-reader`拥有branch选择读取，`model-scope`复用SDK语法。共享child-services owner统一两条初始化路径；工具policy owner负责持续许可；来源owner仅支撑provider-only例外。正常会话仍走现有路径，不顺带重构其资源加载。

## 2. 选模、scope与持久化

| 场景 | 选择 | 失败行为 |
| --- | --- | --- |
| 新child | request > profile > 父选定引用，在child runtime重新解析 | 拒绝，不用全局/provider默认 |
| 冷重开 | 活动branch最新model_change | 缺选择可浏览，执行需改选 |
| alive resume/prompt | branch显式选择与wrapper选定一致 | mismatch拒绝，不继续Kimi |
| 明确set_model | 本次user-command目标 | 成功走SDK setModel写标准记录，失败保留原选择 |
| resume+model | 不支持恢复时覆写的现有API | 明确拒绝，不能静默忽略 |

assistant.provider/model是物理作答者，不授权选模；SDK非virtual的getBranchSelection可能采用最后物理响应，修复以Web显式选择为准。合法virtual选择与routed physical response的区别保持，不重构路由。

复用resolveModelScopeWithDiagnostics：未配置/既有空数组语义为全部可用；配置且有命中只准命中集合；全失配执行范围为空而非UI全集fallback；部分失配保留diagnostics而不拒绝其他有效目标。保留globs/fuzzy/nested id/ambiguity/thinking pins，校验exact model、chat能力及配置认证，不复制父密钥、不发网络登录/刷新。

所有child执行/用户改选入口使用同一gate，必要时在reload/branch切换后重新核对。ordinary sessions和resolveVisibleModels的UI容错不变，不将enabledModels宣称为全系统请求防火墙。

## 3. Profile默认与继承定义

- 三个内置profile、新建AgentsConfig表单、没有扩展字段的文件默认loadExtensions=true；loadSkills仍false，inherit_context等其他默认不变。无新增三态UI或endpoint。
- `load_extensions`规范字段优先，只有缺失才读`extensions` alias。识别boolean及none/false/all/true；保留显式false。未知值不能默认为允许全部，沿安全错误/拒绝路径处理。保留foreign keys/whitelist原文和现有ext工具selectors，不把boolean解释成已实现package加载白名单。
- 不修改已有profile文件，不覆盖现有PUT中的明确boolean。route验证、UI初始值与解析缺省保持一致，scope覆盖规则不变。
- “继承”是按child cwd的当前全局/项目settings、已安装资源和project trust发现扩展；不复制父扩展对象、已激活工具、状态或runtime。不因为父可信就执行未授权worktree路径；reload重新核对。
- 默认路径保留第三方factory、真实child生命周期及合法请求hooks，包括search的session_start/model_select/turn_start/before_provider_request。内置Web subagent controls、ask_user、run observer和Web MCP host不注入child；不额外继承skills/context/APPEND_SYSTEM。
- 工具许可不是hook sandbox；受信任扩展可能有OS或提示词副作用，不声称explore的内置只读名单能阻止任意第三方hook写文件。

## 4. 独立child services及无安装资源适配

主路径不再借用父ModelRuntime。只读取父当前选择；构造child runtime后重新取model对象。child refresh/register/unregister/dispose不触碰父，父closing与child生命周期按现有所有权处理，不新增长期runtime缓存或singleton。

公开SDK约束：DefaultPackageManager.resolve有skip/error缺包callback；DefaultResourceLoader自建私有manager并在bootstrap/final/reload裸resolve，先preflight再调用普通services仍可能安装；createAgentSessionServices不能注入ResourceLoader，而公开SDK/AgentSessionServices形状可以接受已构造services/loader。

采用窄no-install ResourceLoader适配，仅用于child：

1. 真实SettingsManager按当前trust查询当前资源，公共PackageManager.resolve(skip/error)获取已安装的enabled文件，缺包/版本不符拒绝或报告明确失败，不默认安装。
2. DefaultResourceLoader内层使用不含packages/resource声明的内存settings投影，已授权资源只以具体文件传入；禁止package spec/目录/glob再次扩大解析。不能用SettingsManager.applyOverrides伪装清空packages，分层getters未必受其影响。
3. 禁止内层扫描绕过预检的其他会话扩展；适配保留当前resolved sourceInfo/path metadata/resource filters和alias，外层提供真实settings给scope与session。normal inherit加载全部当前合法扩展，不需要provider来源快照才启动。
4. 共享services helper依据公开pending legacy/native/virtual注册队列完成SDK等价初始化，保留diagnostics与真实认证。禁止复制模型metadata制造fake provider、访问SDK私有Map或创建隐藏session；保留正常virtual/context绑定能力。
5. 每次reload重新预检，并重建对应工具projection/source registry代际；old/new runtime及未发布失败状态有明确清理，不额外发网络catalog请求。
6. SDK session创建时传经过gate的显式model。检查fallback message与selected model；禁止把目标恢复失败当warning继续。工具policy或必要provider初始化错误明确拒绝。

这一适配的filters/sourceInfo/trust/bootstrap/reload等价性必须用真实SDK隔离fixture证明，不能仅凭类型可编译宣布完成。必要的provider-only例外复用预检，不重做一套授权逻辑。若公共API不能满足，停止并反馈，不升级SDK/恢复自动安装/使用私有字段绕过。

## 5. 持续工具许可与延迟注册

### 5.1 为什么不能继续传tools枚举

SDK tools:string[]为持续allowedToolNames；startup前枚举会漏session_start后注册的web_search。恢复的snapshot.tools也有同一问题。仅在binding后setActiveTools不能突破硬许可。因此新policy路径不能把factory阶段扩展名单作SDK tools白名单。

### 5.2 新policy路径

- 内置工具限制用公开excludeTools（含既有shell映射）；总是排除Agent/get_subagent_result/steer_subagent/ask_user。普通会话不受该policy影响。
- 扩展工具由registration-aware projection控制：缺省ext:*；显式selectors沿用现有来源别名/最长匹配/歧义拒绝；deny优先。无allow限定的路径也应用deny，不能再绕过disallowedExtensionTools。
- 禁止工具从runner可见的Extension.tools注册Map过滤，不只set inactive，以阻止codemode/deferred nested execute旁路；保留原definition/exposure/defaultActive，不自动激活所有许可工具，不复活hidden或扩展主动关闭状态。
- 保持factory闭包引用的同一个Extension对象：SDK动态registerTool会向其Map写入并同步refresh。复制Extension/Map的projection不能持续生效，不能直接沿用复制式projectAskUserTools作为完整解决方案。
- 以公开Extension.tools上的初始扫描与后续set写入过滤实现窄适配；sourceInfo晚于override补全，初始来源筛选在reload完成、创建session前做，动态注册使用已确认的owner/source。权限解码错误/来源歧义不成为执行授权。

此方案依赖SDK 1.0.0的公开注册对象行为，不是SDK提供的selector接口。需要真实契约测试覆盖session_start/turn_start/再次注册/reload/异步注册/nested calls及dispose清理。若无法建立持续许可保证，不以仅active set的软过滤冒充安全许可。

### 5.3 初始化时序

shared services先完成factory/providers初始化和gate；创建child后由wrapper绑定extensions，显式等待extension binding/ready，再进入controller prompt/admission。当前register后立即inner.prompt存在时序缺口，不能靠setTimeout。search在ready后的模型/工具许可与配置中决定native/fallback/off，不强行激活web_search、不自动配置fallback；测试同时覆盖direct工具与request hook路径。

## 6. 快照与兼容

保留resourceSnapshot.version=1，增加可选独立版本的toolPolicy和providerSources，所有字段由lib/subagents.ts单owner严格解码。建议形状：

```ts
toolPolicy?: {
  version: 1;
  builtinTools: string[];
  extensionAllow: string[]; // 原ext selectors；缺省ext:*
  extensionDeny: string[];
};
providerSources?: ProviderSourceRef[]; // 仅必要provider-only引用
```

- 原appendSystemPrompt/exactSystemPrompt/loadSkills/loadExtensions语义不变；新记录保留tools作为保守旧读者兼容投影，不再限制新policy的动态扩展注册。
- 无toolPolicy旧v1仍用原tools确切硬名单；不猜selectors、不把旧false升级为true。旧true能恢复provider，但旧名单缺失的动态搜索不会被自动补授权；新默认只影响新child。
- policy存在但malformed/未知版本，或child标记存在但resourceSnapshot损坏，拒绝执行。不能reader返回null便让RPC按普通会话加载全部资源。HTTP历史读取仍允许浏览。
- 新建UI默认变化不回写已有文件/快照；用户明确选择新model写标准model_change，不凭assistant response猜用户选择。
- 精确prompt、Chat-only（工具为空且资源明确关闭）、APPEND_SYSTEM排除与branch/fork合同保持。toolPolicy与来源metadata读取都按活动branch，不借废弃branch覆盖。

## 7. 明确noExtensions的必要provider例外

沿此前C窄方案，只有这一模式需要来源定向恢复。loadExtensions=false指无会话扩展工具/hooks/lifecycle；必要provider初始化不能因该开关丢失，也不能绕过包停用或trust撤销。

- 合法主会话/继承child加载时捕获公开pending providerId/extensionPath，services初始化后关联最终sourceInfo；native用公开getter对象identity确认实际有效来源；legacy仅接受可验证单文件贡献，不用最后文件冒充跨文件合并。登记表与runtime/reload代际绑定，动态未知来源使记录失效。
- ProviderSourceRef保存providerId、native/legacy、具体文件、global/project scope、origin、合法cwd和必要package containment信息；不保存config/functions/API key/含认证裸URL。建议最多8文件/32KiB，来源是线索而非执行授权。
- 新falsechild持久化必要来源；用户改选/旧数据补全可追加versioned pi-web:subagent-provider-sources，按branch读取。旧false无来源只从合法alive父已确认registry补全，缺证据拒绝，不自动启动父或全量扩展。
- 执行前用同一无安装预检重核当前enabled/trust/普通文件/realpath/containment/版本，拒绝伪造、目录、glob、package spec、越界symlink。extension来源已记录时同名built-in不能冒充；built-in/models.json保持既有能力。
- provider host仅load具体必要入口、无skills/prompts/themes/context，不绑定AgentSession、不emit session_start、不连接MCP，不给child移交tools/commands/handlers/eventBus。Sub2API只加载index.ts，不展开含search.ts的包目录；继承路径则可以合法加载search。
- 支持factory-ready native物理provider及单来源legacy；session_start/context依赖、services-only extension virtual router和多文件/未知来源拒绝，不以隐藏session填洞。factory/import仍是受信任OS代码，不能承诺其自主副作用完全可回收。

## 8. Errors、admission及显式改选

窄ModelSelectionError安全DTO定义在api-types，客户端不import服务端SDK模块。reason保留missing-selection/provider-context-unavailable/provider-source-invalid/provider-replay-unsupported/model-unavailable/auth-unavailable/outside-scope/scope-unresolved/selection-mismatch；损坏resource/tool policy单独typed refusal，绝不混成普通会话。

- Agent start/resume gate在新增run status/enqueue/prompt前；失败保留此前result，tool isError:true，无伪造completion。
- HTTP非prompt拒绝409 + model_selection_failed（政策损坏用对应安全code）；prompt固定prompt_rejected/accepted:false并附detail。三语提示“未发送请求”，草稿和旧ask保持，不返回原provider/auth内容。
- cold set_model先解析本次目标intent并带入start lock，目标可用后SDK setModel写标准model_change；continuation constructor model不持久化，不能冒充改选成功。
- 启动竞争锁内或在获胜wrapper上确保本次intent真正应用；持久化完成前不返回改选成功/放行prompt。失败dispose未公开wrapper、清理locks，可重试。
- alive set_model走同一gate；resume+model明确拒绝。branch/reload后的执行再次核对canonical选择与有效权限，不删旧Kimi/cost/compaction历史，不改父文件或全局默认。

## 9. 文件边界与技术门禁

| Owner | 预计改动 |
| --- | --- |
| subagent-runtime/rpc-manager | 共享独立services与gate、ready等待、resume/直接重开/set_model，保留通知中心并发逻辑 |
| subagents + AgentsConfig + profile route | 新默认、alias/DTO验证、toolPolicy/providerSources decoder、损坏child拒绝；不迁移用户文件 |
| 新session-model-selection + model-scope | 分支显式选择、严格execution投影、安全failure |
| 新child-services/resource-loader窄适配 | 无安装发现、公共services组装、trust/filters/sourceInfo/reload一致 |
| 新工具policy owner | 同Extension对象的动态注册过滤，复用selectors，不能只active过滤 |
| provider-extension-sources | 仅noExtensions必要来源capture/验证/branch补全，不造通用provider框架 |
| subagent-extension/agent route/api-types/client/hook/i18n | resume+model拒绝、显式恢复改选、admission安全错误与草稿三语 |
| tests/e2e fixtures/docs/specs | 真实SDK延迟search/模型恢复/零安装/browser证据；验收后记录实际合同 |

无安装适配、持续工具许可与ready/lifecycle等价性是优先技术门禁。未实跑不得宣称成功；门禁失败停止反馈，不改变已批准产品行为或升级SDK。当前checkout属于通知中心任务，只在确认基线的独立分支/worktree实施，不覆盖/复制未提交工作。
