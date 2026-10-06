# 子代理明确选模、可信扩展与冷恢复

## 1. 适用范围

覆盖内置`Agent`新建、resume/steer、页面重开、idle回收后启动、新进程冷恢复及HTTP显式`set_model`。
新子代理采用`inherit_trusted`：加载当前已安装、启用、受信任的资源，不复制父loader/runtime/auth对象。
与[模型默认设置](./model-default-settings.md)分离：这些操作不保存全局默认值，也不改变普通UI的零匹配all-model fallback。

入口与单一owner：

- `lib/subagent-model-selection.ts:140,183,284`：child catalog就绪、exact引用、合法profile模式、执行scope、typed拒绝。
- `lib/subagent-session-services.ts:120`与`lib/subagent-resource-loader.ts`：独立runtime、无安装发现、fresh trust/reload、skills。
- `lib/subagent-registration-ledger.ts`：目标provider初始化/绑定后注册失败，不能以残留定义成功冒充。
- `lib/subagents.ts:709`：child policy解码；`lib/subagent-tool-policy.ts:30`：许可投影与coding初始化。
- `lib/subagent-provider-sources.ts:38,139`：仅明确false例外的来源确认与当前授权。
- `lib/rpc-manager.ts:2738`、`app/api/agent/[id]/route.ts:57`：启动锁、标准选模持久化与发布。
- `lib/api-types.ts:900`与`lib/model-selection-error-display.ts`：客户端安全错误/三语呈现。

受信任factory/import/hook不是沙箱；工具许可过滤不限制任意OS、网络或prompt副作用。不要把synthetic fixture通过说成真实第三方扩展或Safari/Windows通过。

## 2. 签名

```ts
interface ModelReference { provider: string; modelId: string }
// requestedReference为exact高优先输入；parentModel也必须exact。
resolveSubagentModelSelection({ modelRuntime, settingsManager,
  requestedReference?, requestedModel?, profileModel?, parentModel?, thinkingLevel? })
resolveConcreteModel(modelRuntime, reference: string | ModelReference)
decodeSubagentSessionResources(entries) // none | invalid | valid(resources)
initializeSubagentBuiltinTools(session, builtinTools, extensionsResult, preferredBuiltinTools?)
```

HTTP当前会话改选：`POST /api/agent/[id] { type:"set_model", provider, modelId }`。
冷态route使用`RpcSessionStartOptions.modelSelectionIntent:"user-command"`及`initialModel`，区别内部reload的构造参数。
`Agent({resume,model})`拒绝；不能静默忽略model，不能把resume当新建profile/model覆盖。

## 3. 数据与行为契约

### 明确选择与admission

- 新建优先级：request > profile > `parent.inner.model`引用；重新解析到child自有runtime，绝不借父注册对象或刷新父。
- HTTP provider/modelId、父引用、活动branch最新标准`model_change`是exact tuple。`gpt:free`不存在时不能剥掉后缀选择`gpt`；合法literal suffix/nested id保留。
- profile/request字符串允许既有SDK模式/thinking/alias语法，但不能丢掉diagnostics后接受另一个模型。恢复不能从最后一条assistant物理回执推导选择；保留合法virtual choice与物理响应区别。
- 执行scope复用SDK语法；配置scope零匹配必须拒绝，不能采用UI的all-model fallback。`enabledModels`不是通用安全防火墙。
- 目标缺失、auth不足、初始化失败或live tuple与明确记录不符，在prompt/enqueue前拒绝。`createAgentSessionFromServices`显式模型不等于持久化授权。
- SDK native注册的fire-and-forget refresh与显式refresh、global getAvailable都可能发布availability；一个已await的pass可能被另一pass supersede而没有更新auth快照。仅在新建自有child runtime安装公开refresh/getAvailable队列，selection/scope等待实际队尾，终末query后再检查当前available/auth/注册失败ledger；不能用sleep、dummykey、重试请求或`getAuth`的OAuth刷新来掩盖。caller-owned runtime不包装、不刷新。
- final available仍含同ID不代表先前scope/model有效：public输入catalog与enabledModels在整个投影期间变化即typed拒绝，不能返回旧名称匹配、thinking pin或endpoint。签名仅内存比较，不写快照/日志/DTO（catalog可能带敏感headers）；不递增provider来源代际，也不自动重试请求。
- admission不能丢掉解析出的model：`assertExplicitSelectionMatches(selection, live, resolved.model)`先保留tuple校验，再核对完整公共数据。catalog已稳定但session仍持old endpoint/API/headers时必须selection-mismatch，不能只比provider/id后继续`inner.prompt`。RPC/steer/follow-up及newchild post-bind都在发布/enqueue前核对；null live安全拒绝。二参的单纯branch tuple检查保持原行为。
- cold用户改选先准备目标，不先失败恢复旧模型；等待ready/binding、标准SDK`setModel`落盘后发布/成功。竞争intent在获胜wrapper上受锁应用；失败只能清理本次未发布wrapper，不能关并发winner。

### 资源与权限快照

`resourceSnapshot.version`仍为1；新增字段分别版本化：

```ts
toolPolicy?: { version:1; builtinTools:string[]; extensionAllow:string[]; extensionDeny:string[] }
providerSources?: { version:1; refs:SubagentProviderSourceRef[] }
```

- 内置三profile、缺字段markdown/API新profile和新建表单默认`loadExtensions:true`；skills默认不变。已有明确false及foreign aliases原文保留，保存省略不能覆盖false。
- 旧snapshot无toolPolicy继续其确切`tools`硬许可；旧false与缺省历史字段不得自动变true。child marker损坏/未知version是`invalid`，不能decode成none走普通全资源路径；历史仍可浏览。
- 新policy不把factory当前工具名字传成SDK永久`tools`名单。coding/reserved用exclude；扩展allow/deny在同Extension对象的live Map上过滤初始及后续写入，迟注册、nested/codemode/deferred不能旁路。
- `ext:*`下deny仍生效，歧义deny撤销所有相关owner，不猜短名；不存在/停用selector不改变其保存原文。
- 许可不是activation。新profile初始化允许且已注册的coding集合；冷态native coding pins（包括[]）优先。保留实际active扩展，不强制开启hidden/defaultActive:false/manual-off或shadow coding名的扩展。统一canonical与shell-mapped集合，powershell round-trip必须合法。

### 无安装与false例外

- 每次资源reload使用公开PackageManager skip/error预检当前配置/trust，再以具体授权文件及无packages内部settings加载；禁止二次bare package resolve重新安装。保留sourceInfo/alias/filter和fresh trust；skills明确true不能退化。
- **默认inherit不需要providerSources**，true历史refs不能变成C gate。
- 仅false的必要provider采用来源hint：公开pending queue捕获，确认成功native getter identity/最终sourceInfo；legacy必须可证明单文件贡献，未知动态/reload/多来源/上下文虚拟router拒绝透明重放。
- hint不是授权：每次复验当前安装/启用/trust/版本/regular file/canonical身份与containment。top-level明确absolute入口的baseDir只是解析基，不能误限在agentDir；package入口用真实package root。不能执行保存的目录/glob/spec/伪造或逃逸symlink。
- refs最多8条、UTF-8 JSON最多32KiB；不保存配置、函数、密钥或含认证URL（source仅opaque身份）。旧false无hint仅合法alive父的已确认记录可补，不自动打开父。
- provider-only host只运行必要文件factory，无隐藏AgentSession，不向child转移工具、command、hook、event bus、session_start或MCP连接。它仍能有受信任import/factory副作用。

### 安全响应

拒绝prompt：HTTP409，保留`code:"prompt_rejected", accepted:false`，附`modelSelection`安全DTO；非prompt失败为409。
冷态Send也可能在SSE ready、POST之前失败：`AgentStartupErrorEvent`为`type:"startup_error", code:"model_selection_failed", prePromptRejected:true, modelSelection`；仅server发布connected前附marker，connection也必须未ready。它不是HTTPaccepted:false，不改变握手/stopretry；hook仅`!promptRequestStarted`消费该安全投影。裸DTO、任意status/字符串、connected后错误或已接收queued输入均不能生成“未发”断言。
DTO code为`model_selection_failed`，reason见`lib/api-types.ts:900`闭集，message固定安全文案，provider/modelId可选。
client不回显raw loader/auth message，未知/畸形DTO本地降级；目标ID支持合法`:free/@001`但拒绝URL/控制字符。
三语明确未发模型请求、保留draft与旧ask/result。仅有DTO没有negative ack时不得谎称未接收、恢复可能已发送的输入或重复发送；沿既有ambiguous reconciliation。

## 4. 校验与错误矩阵

| 条件 | 拒绝/边界 |
| --- | --- |
| 无选择 / exact目标退役 / auth不足 | missing-selection / model-unavailable / auth-unavailable；0备用请求 |
| scope零匹配 / 目标越界 | scope-unresolved / outside-scope，不走UIfallback |
| provider失败注册或缺context | provider-context-unavailable，不能用旧定义通过 |
| live与活动branch明确tuple不符 | selection-mismatch，0enqueue |
| finalquery期间同ID catalog/scope变化 | model-unavailable，不能以旧scope/pin/baseUrl放行；下一次选择重新解析 |
| child marker损坏/未知policy或source envelope | resource-policy-invalid，不能普通startup |
| false hint失效/不可证明贡献 | provider-source-invalid / provider-replay-unsupported，0factory或0模型请求 |
| cold set_model准备/auth/persist失败 | 无新标准记录，无未commit registry孤儿；可重试/不关winner |
| 已安装资源版本不符合当前spec | skip/error，不自动安装；零安装不等于零子进程 |

## 5. 正常、边界、错误案例

- 正常：父选Gateway GPT；new explore自有runtime初始化，session_start晚注册搜索，ready后coding与搜索可声明；resume/idle/cold仍GPT。
- 边界：历史assistant物理Kimi跟在GPT model_change后，冷恢复选择GPT；virtual逻辑选择也不能被物理回执覆盖。
- 错误：旧GPT退役，scope parser可匹配基础名字也不能当授权；明确选择available replacement并标准落盘后才能成功重试。
- 权限：新默认inherit可加载当前trusted search，旧false不自动升级；necessary源无法证明时可读历史但明确拒绝执行。

## 6. 必测断言与证据边界

- `lib/subagent-model-selection.test.mjs`及review-A真实用例：exact suffix退役拒绝、alias/thinking、初始化失败0enqueue/请求、missing defaults。
- `lib/subagent-model-restore.integration.test.mjs`、`lib/subagent-provider-sources.integration.test.mjs`、`lib/subagent-review-b.integration.test.mjs`：真实SDK/RPC/HTTP、idle/fresh process/branch、cold标准记录与失败/竞争、来源当前授权与absolute/symlink/版本。
- `lib/subagent-tool-policy.integration.test.mjs`与coding集合用例：迟注册/再注册/deny歧义/nested/hidden/off、active coding与win32映射round-trip。
- `lib/subagent-native-auth-readiness.integration.test.mjs`：真实SDK barrier证明失序，合法native空auth就绪后可执行、missingauth仍0请求、final query时注册/filter变化不借旧快照授权、expiredOAuth无登录/refresh、fresh多worker重复及falsehost。历史browser未跟踪sequence时不能倒推其确切失序。
- `lib/subagent-native-search-hooks.integration.test.mjs`：真实Responses adapter→owned HTTP/SSE→request/stream/message_end hooks、signed blocks不变、来源普通text追加、reload/off/endpoint/falsehost；真实host binding须公开onError或UI binding，空`bindExtensions({})`不代表Web reload重新session_start。
- `hooks/useAgentSession.model-errors.test.mjs`、`lib/model-selection-error-display.test.mjs`：真实client decode→formatter→hook callback、negative ack与draft/旧ask/多语；结构assert不算browser。
- `lib/agent-event-stream.test.mjs`、`lib/agent-event-connection.test.mjs`及hook同文件：server真实bytes→connection→actualhook的startup拒绝三语/0POST/图片草稿/旧ask，unsafe/unacked/late/queued反例及lease cleanup；browser独立审计ready前SSE marker与0POST，不强迫失败一定先POST。
- `e2e/subagent-model-selection.mjs`：真实Chromium API/SSE、new/warm/reload/cold、坏目标draft、明确picker与落盘、1280/390px、Kimi计数。未到达矩阵不算通过。
- runtime验证隔离HOME/agentDir/XDG及祖先资源，依赖来自clean lock-consistent npm ci。只清理自己的PID/worktree/temp，日志/失败trace转存正式产物；不得next build污染dev。

## 7. 错误与正确方式

错误：`loadExtensions:true`加factory tool枚举硬名单；模型解析失败任SDK选OpenRouter默认；已有child marker解码null后普通startup；constructor目标公开后再尝试persist。

正确：当前authorized独立services、exact选择/严格执行scope、registration-aware许可、ready/admission前gate；用户cold intent锁内标准选模落盘后发布。历史许可只保守恢复，必要来源hint再次授权，默认inherit不被C架构束缚。
