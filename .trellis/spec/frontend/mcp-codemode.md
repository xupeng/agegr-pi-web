# MCP / Code mode 的会话运行时契约

## 1. Scope / Trigger

修改 MCP 内置加载、host 准备/取消、工具曝光、只读预设、stdio 环境、Code mode 默认设置、嵌套事件投影时必须同步本文件。运行时及 Settings › MCP 已实现，设计背景见 `docs/adr/0006-mcp-and-code-mode.md`；管理面板的 config/import/test/sign-in/out/trust API 见 [mcp-settings](./mcp-settings.md)，不以 ADR 阶段标签代替现行源码契约。

owners：`lib/builtin-extensions.ts:364`（工厂组合）、`lib/mcp-host.ts:1016`（连接生命周期）、`lib/mcp-command.ts:70`（slash 分类）、`lib/mcp-transport.ts`（环境）、`lib/rpc-manager.ts:282`（active tools）。本契约横跨服务端/API/SSE/UI，放在本项目已有 frontend 层，不新造第二套 spec 层。

相邻 owner：接收与完成边界见 [pi-sdk-admission](./pi-sdk-admission.md)，持久提问见 [ask-user-protocol](./ask-user-protocol.md)，事件沉默阈值见 [stall-watchdog](./stall-watchdog.md)，成功产物证据见 [clickable-file-paths](./clickable-file-paths.md)。MCP host 不替代这些状态机。

## 2. Signatures

```ts
// lib/builtin-extensions.ts
createPiWebBuiltinExtensions(options: {
  agentDir: string;
  mcpHost?: { idleMs?: number; promptWaitMs?: number };
}): Promise<{ extensions: InlineExtension[]; mcpHost: McpHost | undefined }>

// lib/mcp-host.ts
class McpHost {
  extension(): InlineExtension;
  wrapTransportFactory(factory: McpTransportFactory): McpTransportFactory;
  prepareForPrompt(signal: AbortSignal, options?: { wait?: boolean }): Promise<void>;
  serverStates(): McpHostServerStatus[];
  release(): Promise<void>; // 注销连接
  dispose(): void; // closing/reload 时同步释放状态所有权，不等待连接关闭
}
// 内部 status: { name, scope: "global"|"project",
//   state: "connecting"|"ready"|"failed"|"needs-auth"|"disconnected"|
//          "not-registered"|"not-trusted", error?, stderr?, conflict? }
// Settings 的 session status 用 connected/conflict，而非 ready/not-registered。

// lib/mcp-command.ts：仅按 extension invocation name 分类，不把 prompt template 当 command。
mcpPromptPreparation(message: string, commands: readonly McpCommandCandidate[]):
  "wait" | "register" | "none";
isBareMcpCommand(message: string): boolean;
bareMcpOpensSettings(commands: readonly McpCommandCandidate[]): boolean;

// lib/rpc-manager.ts:281
resolveActiveToolNames(session: AgentSessionLike,
  requested: readonly string[], carry: readonly string[]): string[]

// lib/written-file-sources.ts：render 的名字兼容不是 snapshot 的来源权限。
type WrittenFileEvidencePolicy = "render" | "snapshot";
isTrustedWrittenFileResultToolName(toolName: string): boolean
extractRawWrittenFiles(toolName: string, input: Record<string, unknown> | undefined,
  result: ToolResultEvidence | undefined, policy?: WrittenFileEvidencePolicy): RawWrittenFile[]
extractWrittenFilesFromEntries(entries: readonly SessionEntry[], cwd?: string,
  policy?: WrittenFileEvidencePolicy): WrittenFile[] // 默认 render

// app/api/tools/settings/route.ts, lib/api-types.ts:45
GET /api/tools/settings
PUT /api/tools/settings { codemode: "automatic" | "always" }
PUT /api/tools/settings { codemodeMode: "on" | "only" }
PUT /api/tools/settings { codemodeInlineBudget: number | null }
PUT /api/tools/settings { enabled: boolean } // PowerShell，仅 Windows；每次只传一个变更字段
// GET/成功 PUT 都返回：
{ isWindows: boolean; powerShellEnabled: boolean; codemode: "automatic"|"always";
  codemodeMode: { value: "on"|"only"; invalid?: string };
  codemodeInlineBudget: { value?: number; invalid?: string } }

// lib/agent-event-stream.ts:266，SSE 重连对账
{ type: "connected"; sessionId: string; isStreaming: boolean;
  pendingExtensionUiIds: string[] }
```

## 3. Contracts

### 加载与连接

- 仅普通主会话组合 `builtin:codemode`、`builtin:tool-search`、`builtin:mcp` 和隐藏 host 工厂；Chat-only 与新建/重开的子代理均不加载这一组。保留 fork 的 project bash/subagent/ask 工厂与 exact prompt 分支，不以新增数组替换整个 loader 配置。
- 内置条目 `replaceable: true, builtin: true`，支持 SDK 的 `-builtin:*` 与替代扩展。host 仅在 `/mcp` command 来源为 `builtin:mcp` 时 active，不替代第三方扩展管理连接。
- MCP extension 的初始 config loader 返回 `servers: []`，只保留文件的 `autoEnableCodemode`（`builtin-extensions.ts:211-225`），所以浏览/切换会话/auto-name/fork 不因为构造 wrapper 而连接配置内服务器。
- host 每次 sync 重新读取目录与 `trust.json`，`mayReadProjectConfigNow()` 要求当前有 true 的 exact/inherited decision；不能用 wrapper 创建时固定的 `ctx.isProjectTrusted()`。再交 SDK 读取全局 `mcp.json`、受信任项目 `.pi/mcp.json`；同名项目项覆盖全局。新出现的项目配置、读取间隙落地的文件、锁住/损坏的 trust store 均不能绕过信任（`mcp-host.ts:843` 起、`project-trust.ts`）。无独立“每服务器审批”文件。
- host 串行 sync，以 canonical JSON 比较变更，下一条消息注册/注销差异；连接完成以 transport 的 initialize/list 响应观察（`mcp-host.ts:115`），不伪造 SDK 暂无的连接状态事件。
- 空闲 wrapper 的普通 prompt 先 sync，再默认最多等 10s；只等 server 默认 exposure 为 direct 或任一 `toolExposure` 为 direct 的 attempt。codemode/deferred 服务器后台连接，脚本/tool_search 自行等待；超时标记 waited，后续 prompt 不再重复等它（`mcp-host.ts:440/684`）。Stop abort prepare，以 `MCP_WAIT_STOPPED_MESSAGE` 拒绝未发送的消息；不能提前清旧 ask、不能把等待结束当模型运行完成。
- slash 的服务端分类：已注册 builtin `/mcp` → register、不等连接；其它已注册 extension command → none；普通消息、未知 slash、prompt template 与 skill → wait。streaming 中不再 prepare。浏览器只有 bare `/mcp` 且 builtin 拥有它或无人应答时打开 Settings › MCP；第三方 `/mcp`、同名 prompt template 和所有 subcommands 仍发送。多个 `mcp:1/2` 不等于有人应答裸 `/mcp`（`mcp-command.ts:70-100`、`rpc-manager.ts:1038`）。
- unregister 最多等 transport 出现 5s；超时后的 abandoned registration 若迟到请求 transport，factory 必须拒绝，不能留下无 owner 的 stdio 进程。wrapper 开始 closing 时即幂等 `dispose()`（reload 也 dispose 旧 host）：connecting 记录删除、ready/connected 加 closedAt、释放 conflict/not-trusted/hostInactive 的自有记录，不覆盖后继测试/会话写下的状态；晚到 transport 不再更新。dispose 不是同步等待全部 transport 关闭（`mcp-host.ts:731/784/950`、`rpc-manager.ts:1520`）。
- 在途 sync 可能在 Stop 后完成，必须仍启动空闲回收；未产生 `agent_start` 的 slash/preflight 拒绝也要回收，不依赖必然到来的 `agent_end`。

### 工具 active / exposure

- `requested=[]` 是 Chat-only；非空预设只替换 coding tools，`carry` 中仍 registered 且不 hidden 的非 coding 工具被保留。**不把所有 registered 工具自动加进 active**。
- `codemode`、`tool_search` 初始可 inactive；MCP/发现或 `defaultTools` 激活后可被 carry。navigate 保留原本已 active 的会话级 codemode/tool_search/ask_user/subagent 控制工具，且仍需 registered/非 hidden；其他扩展遵循目标分支 loadout。registered 但 inactive 的 ask 不因此开启，Chat-only/空 pin 不回灌。
- `Agent/get_subagent_result/steer_subagent` 及 fork `ask_user` 为 `model-only`。模型可直接调用，`ctx.executeTool()`/Code mode 不可列出或执行它们；尤其 ask 的 terminate/persist 不能被脚本吞掉。
- active codemode 的 `codemode.mode="on"` 保留其它 direct 工具的模型声明；`"only"` 隐藏 active direct（coding/extension/direct MCP）声明，将其列入脚本工具描述，但不把它们变 inactive、不移除 model-only ask/control。`inlineBudget` 是描述中工具声明的估算 token 预算（字符数/4），不是脚本运行超时或输出上限（`api-types.ts:14-43`）。
- pinned 选择非空、且不含 `bash/powershell/edit/write` 时才判只读。只读策略在 `tool_call` 阻止 builtin MCP 或 `mcp__` 工具中未标 `readOnlyHint: true` 的调用，包括 nested。未 pin 不等于只读；hint 是服务端自报，**不是恶意 MCP 服务的沙箱**（`mcp-read-only-policy.ts:23-47`）。

### 配置与环境

| 配置 | 当前行为 |
| --- | --- |
| `PI_WEB_DISABLE_MCP` | trim/lowercase 后非空且不是 `0`/`false` 即禁用；浏览器不能覆盖；不会同时禁用 Code mode |
| `PI_WEB_MCP_IDLE_MS` | 默认 600000；0 关闭 host 空闲注销；非法或超 `2147483647` 回默认并 warn |
| `PI_WEB_SHUTDOWN_DEADLINE_MS` | 默认 5000；要求正数且 ≤`2147483647`，0/非法回默认；closing wrapper 先不可用，replacement 等 dispose/期限 |
| `PI_WEB_SSE_BACKLOG_LIMIT_BYTES` | 默认 16 MiB；值必须有限且 ≥64 KiB，否则默认；可重建 deltas 被丢弃，不可重建积压则断流后重连 |
| `defaultTools` / Code mode | automatic 移除明确 codemode 项，always 最小编辑加入 `+codemode`；保留其他 modifier/工具；modifier-only 清空时删除 key，不能错误写 `[]` |
| `codemode.mode` / `codemode.inlineBudget` | on 为默认，only 存 `"only"`；budget 默认 3000，PUT 仅接受整数 0..1000000 或 null（删除 key）；读取既有有限非负数可含小数/超 UI 上限，invalid 返回诊断而非覆盖 |

- `/api/tools/settings` 是 PowerShell 与 Code mode 的共同 global `defaultTools` 写入口；复用 `global-settings-file` 的 SDK 同路径锁和最小字段编辑，保留未知字段。实现是原地 `writeFileSync` 后 chmod 0600，不是 rename 原子替换；进程/机器在写入期间中断仍可能损坏文件。只写新的默认，不擅自改已运行会话。global `codemode` 非对象时需改写的 mode/budget 写入拒绝，保留未知 key；on/reset 删除自身 key，空对象才删除。受信任项目设置覆盖由 SDK 两层合并判定并在 MCP DTO 报 `projectOverride`，不是保存成功就保证当前项目有效；`autoEnableCodemode` 仍仅文件编辑（`codemode-settings.ts:96/246/343`）。
- Code mode 在首次普通会话前执行一次 SDK QuickJS worker 自测（`return 6*7`→`42`，10s deadline），globalThis 缓存；失败保留 empty builtin 条目。sandbox 不可用时 script-only MCP exposure 降为 deferred，由 tool_search 提供可达路径。
- MCP SDK 未导出内部模块由 `pi-sdk-internals.ts:386/436` 适配；加载/SDK 身份不符即 MCP 关闭，**不回退默认 stdio transport**。
- stdio 使用项目命令同一 sanitizer，清除 `PI_WEB_PASSWORD/PORT/NODE_ENV/NEXT_*`，再覆盖 entry 自己声明的 env，`inheritEnv:false`。HTTP transport 保留 SDK 行为。
- env/header/oauth.clientSecret 引用 Web 密码被拒绝（`mcp-transport.ts:42`）；`!command` 的任何大小写密码名提及也拒绝。这不保证其它同步 `!command` 不阻塞事件循环，真实 Windows 残留进程也不是已解决边界。

### SSE / 展示 / 授权

- nested start/end 只投影 ids/name/parent/error，nested update 不传；顶层 update 每 call id 150ms 合并，end 丢弃待发 update。Code mode progress 保留最近 200 calls 并报告 omitted，UI 最近 20 条可展开早期项。
- `tool_execution_end.result` 默认不传；fork 唯一例外是**顶层** `toolName=trellis_subagent` 且 `details.kind=trellis-subagent-progress`，只传 structured details，桥接到 canonical tool-result message（`agent-event-wire.ts:76-122`）。不传 output text，也不宣称这等同 raw SSE 的硬字节上限。
- 普通 dialog 与 custom panel 是两条按 id 队列；dialog replay 去重，custom render 同 id 原地更新；connected 的有效 id 集合清掉断线期间已关闭的请求。`pendingAsk` 独立，不进入阻塞队列（`extension-ui-queue.ts:14-45`）。
- MCP server/tool 显示从 result.details 读取真实名称，不逆拆 sanitized/hashed 注册名；没有 result 时保留注册名。≤200000 字符的单 JSON object/array 可格式化，其余原样（`mcp-tool-display.ts:27-42`）。
- 新 Code mode chat 排版使用 `--chat-font-size-offset`；不得因为它是新组件写死字号。
- 文件授权排除 system、context_edit、codemode store、非编程 tool-result 任意正文/details，保留 U 明确允许的模型消息/参数、coding nested arguments/fullOutputPath。
- fork 的 apply_patch/Trellis 补充授权复用成功 evidence owner 和共享**精确结果来源 gate**，拒绝 decorated MCP 冒充、preview-only 和失败 trace。U 的 exact Agent/collection/control 仍是递归 path-reporting 来源，不能把它描述成全部经过相同的成功 decoder。
- 新建和 reopen/resume 子代理 completion 都调用 `extractWrittenFilesFromEntries(entries, cwd, "snapshot")`；其结果受控 apply_patch 摘要（structured/旧 text）只接受 exact gate，不用渲染层的 decorated-name 判断提升为 Agent.writtenFiles。渲染默认仍为 `render`；decorated write/edit 的路径来自模型参数，edit result 只补 count，不提名另一个文件。
- **历史限制**：已经保存的污染 Agent.writtenFiles 已丢失原始来源，当前纯 parser 不能分辨真写与旧洗白；nested 历史 exact Agent 快照同样可能保留污染。本次阻断新快照来源洗白，并在 resume 重扫 decorated-call history 时应用策略，但不迁移/重验证以前已提升的记录。跨 child-session 历史复核需要另行设计，不能宣称本次修复追溯清除了历史授权。
- 卡片不独立授予权限；相邻目录/`..`/sourceSessionId 仍过既有边界（`session-file-references-core.ts:103-158`）。

## 4. Validation & Error Matrix

| 条件 | 结果 |
| --- | --- |
| 不受信任项目有 `.pi/mcp.json` | SDK 不读取、不启动其服务器；不是“已批准所有项目项” |
| 普通会话只浏览/构造 | 不启动配置内 MCP 服务器；QuickJS 自测可能运行，无模型请求 |
| Stop 在 prepare 等待期间 | 消息未接收，POST 拒绝，旧 ask/草稿保留；sync 结束仍可空闲回收 |
| MCP config 解析失败 | SDK errors 脱敏/有界去重记录；其它有效文件/entry 仍可连接，不能宣称整个配置成功或一项坏就清空所有 desired |
| Code mode sandbox 失败 | 不注册可执行 codemode；MCP script-only exposure 改 deferred |
| 只读 pin 下 MCP 无 hint | 返回 block reason；直接及嵌套同样阻止 |
| Code mode 调用 ask/control | model-only 阻止；不登记持久 ask/子代理 |
| 历史分支无 ask、当前 ask 已 active | carry 原 active 且可见的 ask；inactive/hidden/Chat-only 不激活 |
| decorated patch result 进入新子代理快照 | snapshot 策略拒绝 structured/旧 text；不能被 Agent 包装后授予父会话路径 |
| 以前已提升的污染 Agent.writtenFiles | 仍可能被既有 path-reporting 采信；未自动迁移/回查 child，需披露历史限制 |
| 重连含已关闭 UI head | 按 pendingExtensionUiIds 删除那个 id，不能误删后继 |
| Settings PUT 无 JSON/来源不允许 | 415 / 403 |
| Settings PUT 非对象、四个变更字段中多个或全无、mode/preference/budget 不合法 | 400 `{ reason: "invalid-request", error }` |
| Settings global codemode 非对象且本次需改写 mode/budget | 500 `{ reason: "internal", error }`；不擅自覆盖原对象 |
| 非 Windows PUT `{ enabled }` | 404（与可跨平台写 codemode 区分） |
| SDK transport 类型/env 声明偏离 | 抛错，不能偷偷恢复全环境 stdio |
| 旧 wrapper 迟到 destroy | 只注销它自己的 registry 身份；不能清替代 wrapper 的内存 ask |

## 5. Good / Base / Bad Cases

- Good：global server 只在消息前连接，编辑其 config 下一条消息替换；Code mode 脚本读服务但不能嵌套 ask；并发 permission dialogs 都能按 id 回答。
- Base：Chat-only 仍只有 context-files exact prompt，无内置 MCP；旧无 MCP 配置会话不改变合法文件卡片/ask 的渲染；automatic 不强制开启 codemode。
- Bad：把全部 registered tool 加 active、等待结束就确认 prompt、相信 mcp__名字可逆拆、用任意 result prose 授权根外文件、SSE 优化切断 inner watchdog、用单 UI slot 覆盖第二个权限请求。

## 6. Tests Required

- `builtin-extensions{,.integration}.test.mjs`、`pi-sdk-internals.test.mjs`：工厂/禁用/SDK singleton/fail-closed/真实sandbox，不用假工厂冒充真实自测。
- `mcp-host{,.integration}.test.mjs`、`mcp-transport.test.mjs`：lazy/startup、trust fresh/read-race、direct-only wait、abandoned transport、dispose/status identity、config replacement、prompt cancellation、idle/no-run、sanitizer/密码拒绝；本地fixture，不连接用户 MCP。
- `mcp-command.test.mjs`、`hooks/mcp-slash-command.test.mjs`：builtin/第三方/多个 renamed command、template/skill、bare settings 拦截与 subcommand 发往原会话；分类不能按字符串前缀统一处理。
- `mcp-read-only-policy{,.integration}.test.mjs`、`rpc-manager-tool-exposure{,.integration}.test.mjs`：pin/no-pin/annotations、direct/nested、hidden/carry、reload/navigation。
- `ask-user/codemode.integration.test.mjs`：真实 SDK/faux provider 直接 ask 一次请求后 terminate，script 列举/调用拒绝且没有持久问题。
- `rpc-manager-lifecycle.test.mjs`、`rpc-manager-shutdown.test.mjs`、`rpc-manager-stall-watchdog.test.mjs`：closing/期限/旧身份、ask 保留、admission rejection、nested bash 宽限但不顶层 replay、settled timer cleanup。
- `agent-event-wire/stream.test.mjs`、`extension-ui-queue.test.mjs`、`hooks/useAgentSession*.test.mjs`：nested slim/coalesce/backlog、Trellis final 窄例外、id FIFO/重连和旧响应所有权。
- `session-file-references*.test.mjs` 与既有 written-file tests：收紧不删合法 structured evidence，精确名字 gate、失败/preview/deletion 不授权。
- `written-file-sources.check.test.mjs`、`session-file-references.fork-evidence.test.mjs`、`subagent-runtime.test.mjs`：child entries → snapshot → host details → parent authorization 整链拒绝 decorated structured/旧 text 摘要；新建真实 SDK child 与 reopen/resume 都走 snapshot 策略，正常 patch/Trellis/Agent、relative/count、模型参数不丢失。UI helper 默认不得被一并收紧。
- `rpc-manager-tool-exposure.test.mjs`：ask 的 pinned/unpinned 导航 carry、inactive/hidden 拒绝、Chat-only/空 pin 不回灌。
- `app/api/tools/settings/route.test.mjs`、`codemode-settings.test.mjs`：四种互斥写入口、budget 默认与 SDK 相等/读取与写入范围不同、mode/only、invalid/projectOverride、global lock/minimal edits、PowerShell 平台差异。
- 真实浏览器单独验证 card label/JS/JSON、历史编辑与取消、FIFO、多语言/字号/移动视口；Node 渲染测试不证明点击和布局。未运行 Safari/Windows 真机时必须写未覆盖。

## 7. Wrong vs Correct

```ts
// Wrong: 注册不等于当前激活；强制声明会绕过inactive/deferred。
inner.setActiveToolsByName(inner.getAllTools().map(tool => tool.name));

// Correct: 编程预设改变，不重启已被关闭的扩展工具。
inner.setActiveToolsByName(resolveActiveToolNames(inner, preset, inner.getActiveToolNames()));
```

```ts
// Wrong: ask_user 是 model-only，不可通过Code mode吞掉其terminate。
await ctx.executeTool("ask_user", questions);

// Correct: SDK模型直接调用shared工具，由host登记持久ask后结束回合。
defineTool({ name: "ask_user", exposure: "model-only", /* existing contract */ });
```

相关配置/DTO 变化须更新同一 owner，而不是在 hook/UI 再解析第二套 raw MCP/tool schema。
