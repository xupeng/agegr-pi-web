# 只读调查与规划证据

调查日期：2026-10-06；SDK pins均为1.0.0。没有改用户设置、运行中模型或产品源码，没有发验证用外部模型请求。

## 实际会话

父：`01a11076-241d-7540-97bf-c3b78665c30c`，子：`01a110b5-31e9-7540-97bf-c3eaa29b9542`。

子文件位于 `~/.pi/agent/sessions/--home-xupeng-dev-personal-forked-agegr-pi-web--/2026-10-06T10-14-32-681Z_01a110b5-31e9-7540-97bf-c3eaa29b9542.jsonl`。

- line4初始`model_change`为`sub2api-codex/gpt-6.1-sol`，时间10:14:32.682 UTC。
- line107首次完成10:31:25.618 UTC；lines108–110恢复排队／执行／委派任务10:44:15.556 UTC。
- line111第一个OpenRouter/Kimi响应10:44:58.552 UTC；line113出现该模型context-length错误，其后有compaction。后者不是最初换模的原因。
- 父对应Agent resume仅指定child id/任务/描述/background，无model/thinking覆盖。子整个记录仅初始GPT model_change，未新增Kimi授权选择。
- 当次读取统计：子assistant条目25条GPT、51条Kimi（包含错误条目，不代表51次成功请求）；其余九个子代理全为父GPT。此统计是调查快照，不是长期监控数字。
- 默认配置GPT、enabledModels不含Kimi；Sub2API模型不在models.json，由安装的pi-sub2api全局包注册。未输出auth/API key。
- production bundle `/home/xupeng/services/pi-web/dist/.next/server/chunks/6429.js`确认具有相同fresh-runtime/noExtensions/restoredModel/init分支，不把当前dirty源码单独当生产证据。

间隔超过默认10min idle预算，且恢复时service log有该child新的session_start，符合wrapper重建；未获取单独idle shutdown日志，因此不把具体回收触发当已证实事件。

## SDK链条与只读复现

SDK目录：`/home/xupeng/services/pi-web/dist/node_modules/@earendil-works/pi-coding-agent`。

- `dist/core/sdk.js:92–117`：恢复失败且无显式model时使用findInitialModel，传空scopedModels。
- `dist/core/model-resolver.js:23,473–532`：OpenRouter默认Kimi，若settings默认不可用就从已认证全集选择provider默认。
- 通过实际findInitialModel模块 + 内存mock runtime（没有Sub2API，但有Kimi/Gemini/DeepSeek）得到Kimi；无session构造、网络或文件写入。该结果证明resolver分支，不代替未来完整SDK/runtime/browser验收。
- `dist/core/sdk.js:279–290`：continuation构造时传model不会自动追加model_change；cold set_model必须做标准持久化，不能只改变内存。
- `dist/core/virtual-models.js:22–40`：SDK对非virtual可能以最后physical response为branch selection，virtual明确变化则保留selection；本例必须依据Web显式model_change owner防旧Kimi响应变授权。

## 公共SDK能力复核（只读plan子代理）

子代理研究session：`01a11100-abac-7540-97bf-c41d4267c019`；仅返回设计意见，无文件写入。

1. `dist/core/model-runtime.js:342–350,626–706`允许取native provider／legacy config及重新注册；不等于deep clone，不带来源证明。virtual没有可导出definition/router的getter。不要构建provider序列化器或访问private Map。
2. `dist/core/agent-session-services.js:111`总会refresh传入runtime；`dist/core/model-runtime.js:581–622`及pi-ai `dist/models.js:121–136,174–216`表明refresh可替换同provider先前的刷新controller。因此借用分支应公共loader＋已初始化runtime直接构造session。
3. `lib/model-runtime.ts:18–21`已有host-global services发现方式，不创建AgentSession，但仍执行全局factory，不是provider-only sandbox；当前helper丢弃services diagnostics，增强案需保留并检查。
4. SDK `dist/core/extensions/loader.js:398–406`包装的extension virtual router使用createContext，services-only未绑定runner时context为throwing stub（`:105–139`）；不能通过隐藏会话填这个洞。
5. runtime没有公共dispose；child cleanup不该unregister父provider。纯services无法统一回收factory自主启动的进程/timer，B必须明确接受副作用而不能宣称无副作用。
6. A不缓存已死parentruntime；B不与auth/catalog runtime共用、不新增跨会话singleton。source不明/project-only/session-dependent一律不宣称成功冷恢复。

## 定向 provider 扩展重放方案复核

用户提出单独处理provider extension并确保加载，取代A/B候选。第二个只读plan session为`01a1110e-4a79-7540-97bf-c427da714133`，无写入／网络／插件加载。

- `extensions/types.d.ts:1551–1569`公开pending注册中的extensionPath；`resource-loader.js:417–418`先callback再补sourceInfo，故捕获与最终来源关联要分两阶段。
- `model-runtime.js:626–708`：native getter可核对对象identity；legacy非undefined顶层字段合并，getter为新对象，不能根据最后一个文件或config identity确认唯一来源。services先legacy后native再virtual，并非跨类型原始调用顺序。
- SDK `dist/index.d.ts:16–17`公开PackageManager；`package-manager.js:1000–1055`裸resolve可安装，callback skip/error防安装。`resource-loader.js:356–364`即使noExtensions仍做裸resolve，因此host需要无packages内存settings投影，不拿用户真实settings直接加载。
- `package-manager.js:1740–1793`legacy-global兼容探测可调用npm/pnpm；无安装不等于零进程。`SourceInfo`无packageRoot，授权containment需公开PathMetadata，不能保存潜含凭据的裸URL source。
- `resource-loader.js:403–405`允许noExtensions时仅cli明确入口；目录会展开manifest（`package-manager.js:1067–1086`），Sub2API manifest同时声明index/search，只能传index普通文件。
- runtime动态注册在绑定后丢失可复用的来源队列（`extensions/runner.js:306–335`）；source registry必须代际化并在使用前重验，不能从getter猜path。
- 公开SDK支持这一窄方案，不提供任意provider extension无副作用或无lifecycle依赖的自动证明。factory-ready Sub2API native是明确目标；virtual/router/context依赖及来源不明继续fail closed。

## 规划限制

- 当前branch `feat/notification-center-sync`的RPC/hook/docs有并发未提交改动，未修改或复制其代码。
- 三份规划文档已按推荐C收敛，待用户最终审批。未运行npm ci、tsc、lint、suite或浏览器；未来测试必须新建隔离agentDir且使用lock一致树。静态研究不代替技术门禁。
- 不修改生产服务、不隐式修复真实旧子会话、不升级SDK。

## 扩展策略重新评估（2026-10-06，只读）

用户质疑默认禁用扩展是否有实际收益，指出研究型子代理需要联网搜索。此前将保留默认权限当成已定目标过早，现重新开放产品策略决定。

- `lib/subagents.ts:155–202`：general-purpose、explore、plan 三个内置 profile 默认 `loadExtensions:false`；不是所有可配置子代理都关闭扩展。
- `.pi/agents/trellis-research.md:3–13`：当前项目 research profile 配有 `read,write,bash,find,grep`，且 `load_extensions:true`／`extensions:true`。全局目录没有同名 profile。这里没有执行或修改该 profile。
- `lib/subagent-runtime.ts:267,290–300`：已存在加载扩展和投影扩展工具的分离步骤；`:339` 单独排除 Agent 控制工具和 ask_user。因此防递归／主会话问答不要求禁用全部扩展。工具投影并不隔离 factory／hook 自身副作用。
- `pi-sub2api/extensions/search.ts:34–65,93–101`：搜索在真实 session lifecycle 中动态注册并按配置、模型、有效工具许可选择 native／fallback／off 等路由；`:101–138` 的 native 路由还有 request／stream hooks。provider-only factory 恢复不足以提供搜索。
- extensionToolNames 在 child session 绑定前计算（`subagent-runtime.ts:290–300`），而该搜索可能在 session_start 后注册；这一时序与显式工具选择的兼容性需要真实 SDK fixture 验证。这里只标风险，不把静态阅读当作已确认搜索失败根因，也不把 `loadExtensions:true` 当作搜索成功证明。
- 禁用扩展可避免那些入口的 factory／hooks 并减少无关工具声明，但本任务没有性能、token 或任务质量的对照测量；不能声称收益显著。带 bash 的子代理关闭扩展也不构成禁止网络／OS 的沙箱。

当轮结论：保持显式模型恢复与禁止静默回退；等待用户选择按角色能力或默认继承受信任扩展后再决定 C 适用范围。只编辑规划产物，未运行代码、网络搜索或改用户配置。

## 后续确认：默认继承（2026-10-06）

用户已选择inherit_trusted。最新方案为独立child runtime加载当前已安装/启用/受信任扩展，恢复不要求父驻留或provider来源快照；C仅保留明确noExtensions/旧false路径。旧快照权限不扩大，新policy解决动态工具硬名单缺口，详见research/inherit-trusted-review.md。

此前“所有child来源定向恢复已收敛/不加载其他扩展”的规划描述属于历史候选，不再代表最新主路径。三份文档按用户选择重新收敛，待最终实施审批；未task.py start、未改产品代码/真实配置/会话/服务、未跑技术门禁或完整测试。
