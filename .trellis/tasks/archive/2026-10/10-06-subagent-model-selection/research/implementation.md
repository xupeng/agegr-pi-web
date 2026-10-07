# 实施报告：默认继承、显式选模与权限分离（阶段 2–4 已落地部分）

> 原始验收产物现留在私有离线副本；本文仍是原 SHA 的历史记录，见 [证据留存](../evidence-retention.md)。

日期：2026-10-06。范围：`implement.md` 阶段 2–4 及相关 owner/runtime 测试。本报告只声明已实跑并
通过的部分；未完成项在末尾单列，不冒充通过。阶段 1 门禁见 `research/sdk-gates.md`。

## 环境

- worktree：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`
- 分支 `feat/subagent-model-selection`，基线 `e0ad63073c4c42987571d31b1a4cb61e48a1fcd4`
- 依赖：worktree 内 `npm ci --include=dev` 锁定树（906 包，与 baseline 字节一致）；未升级 SDK/lockfile
- 隔离：`mktemp -d --tmpdir=/var/tmp` 唯一 validation HOME，`env -u XDG_STATE_HOME -u XDG_CONFIG_HOME
  -u XDG_DATA_HOME`，经 `~/.pi/agent/bin/pi-tmp-run` 运行；内层 `HOME=$PI_TASK_TMPDIR/home`、
  `PI_CODING_AGENT_DIR=$HOME/.pi/agent`。无 `/tmp`、无真实网络模型/搜索请求、未改真实用户设置。

## 已实现行为

### 阶段 2：默认策略、快照 decoder 与工具政策

- `lib/subagents.ts`
  - 三个内置 profile（general-purpose / explore / plan）`loadExtensions` 默认 `true`，`loadSkills` 保持 `false`。
  - 严格资源标志解析：boolean、`none`/`false`/`all`/`true` 字符串；规范字段 `load_extensions`/`load_skills`
    优先于 alias `extensions`/`skills`。规范字段的未知值 fail-closed（false），不再把任意字符串当 true；
    alias 的字符串/数组仍作为 pi-subagents whitelist（=启用）并按原文保留。
  - `resourceSnapshot.v1` 新增可选 `toolPolicy`（`version:1`、`builtinTools`、`extensionAllow`、`extensionDeny`）
    与 `providerSources`（无密钥引用）。
  - 新增 `decodeSubagentSessionResources(entries)`：`none`（非 child）/ `invalid`（child 标记存在但快照
    损坏或版本未知）/ `valid`。`readSubagentSessionResources` 保持旧返回签名（valid→resources，否则 null）。
    `hasSubagentMetadata` 用于“是 child”判定（含坏快照）。
  - 校验：旧无 policy 的 v1 保持 `tools` 确切名单且 `loadExtensions:false` 不升级；`toolPolicy.builtinTools`
    只允许内置工具名，`extensionAllow/Deny` 只允许 `ext:` 选择器；control tools 一律拒绝。
  - `saveSubagentProfile`：显式非 boolean 的标志抛错；省略字段保留已存原文，不覆盖已有显式 false。
- `components/AgentsConfig.tsx`：新建表单 `loadExtensions` 默认 true。
- `lib/subagent-tool-policy.ts`：新增 `SUBAGENT_BUILTIN_TOOL_NAMES`、`SUBAGENT_RESERVED_TOOL_NAMES`、
  `buildSubagentExcludeTools`、`resolveProfileToolPolicy`、`resolveSnapshotToolPolicy`。
- 歧义 deny fail-closed（主代理复核项）：`createSubagentExtensionToolFilter` 现在把 deny 选择器按“最长候选名”
  解析并对歧义名取所有 owner；`ext:*` + 歧义 deny 会撤销相关工具，而不是静默忽略。allow 歧义仍不授权；
  未匹配（来源不存在/停用）的 deny 保持原文且为 no-op，不扩大授权。

### 阶段 3：显式选模与统一初始化

- 新 `lib/subagent-model-selection.ts`
  - `ModelSelectionError` + `toSafeDTO()`；reason 集合：missing-selection / provider-context-unavailable /
    provider-source-invalid / provider-replay-unsupported / model-unavailable / auth-unavailable /
    outside-scope / scope-unresolved / selection-mismatch / resource-policy-invalid。
  - `resolveExecutionModelScope`：与 UI 同 `enabledModels` 语法，但零命中返回空执行范围（不回落全目录）。
  - `resolveSubagentModelSelection`：`request > profile > parent 引用`，在 child 自有 runtime 重新解析；
    缺失 provider / model / auth / scope 全失配 / 越界均 typed 拒绝，零备用请求。
  - `assertExplicitSelectionMatches`：alive wrapper 的 live model 必须等于活动 branch 最新显式 `model_change`。
- `lib/subagent-runtime.ts`（`start`）
  - 改装 `createSubagentSessionServices`：独立 child runtime + 无安装 ResourceLoader；父 runtime 不 refresh/
    不注册/provider 计数 0。
  - 新建 selection 走 `resolveSubagentModelSelection`；`createAgentSessionFromServices` 始终传显式 `model`
    （+ scope pin 的 thinking/scopedModels），不再传父 model 对象。
  - 工具政策：内置用 `buildSubagentExcludeTools` 的 `excludeTools`；扩展用 registration-aware
    `projectRegistrationAwareExtensionTools`（同 Extension 对象，含 late 注册），`ask_user` 经
    `createAskUserToolProjection` transform 合并；不再传硬 `tools` 白名单。
  - 快照写入 `toolPolicy` 与保守 `tools` 投影；`dependencies.registerSession` 返回 wrapper 并
    `await wrapper.waitUntilReady()` 后才可能 prompt。
  - `resume`：拒绝 live model 与显式选择不一致；await wrapper ready。
- `lib/rpc-manager.ts`（冷恢复）
  - `decodeSubagentSessionResources`：`invalid` 直接抛错，绝不 decode null 走普通全资源启动（历史浏览仍可用）。
  - child 冷恢复改用 `createSubagentSessionServices` + `subagentResourceLoaderConfig`；versioned policy 走
    registration-aware 投影 + `excludeTools`，legacy 保留 ask-user 复制投影 + `tools` 硬名单。
  - prompt admission 前（`case "prompt"`）对 subagent wrapper 复核显式选择；不匹配则抛 `ModelSelectionError`，
    路由返回 `prompt_rejected/accepted:false`，草稿保留。

### 阶段 4：客户端安全错误

- `lib/api-types.ts`：新增 client-safe `MODEL_SELECTION_FAILURE_REASONS`、`ModelSelectionFailureReason`、
  `ModelSelectionFailureDTO`、`isModelSelectionFailureDTO`（未知 reason 拒绝）。
- `lib/subagent-model-selection.ts` 从 `api-types` 取 canonical reason 列表，避免漂移。
- `lib/agent-client.ts`：`AgentCommandError.modelSelection?`、`isModelSelectionFailureError`，窄 decode
  服务端 `modelSelection`。
- `app/api/agent/[id]/route.ts`：`ModelSelectionError` 附带安全 DTO；非 prompt 返回 409，prompt 保持
  `prompt_rejected/accepted:false`。
- `lib/subagent-extension.ts`：`Agent` 工具 `resume` + `model` 明确报错，不再静默忽略。

## 供浏览器 fixture 使用的 export / API 形状

- 快照解码（server，`lib/subagents.ts`）：
  - `decodeSubagentSessionResources(entries): { kind: "none" } | { kind: "invalid"; reason: string } |
    { kind: "valid"; resources: SubagentSessionResources }`
  - `SubagentSessionResources = { appendSystemPrompt: string[]; tools: string[]; loadSkills: boolean;
    loadExtensions: boolean; exactSystemPrompt?: string; toolPolicy?: SubagentResourceToolPolicy;
    providerSources?: SubagentProviderSourceRef[] }`
  - `SubagentResourceToolPolicy = { version: 1; builtinTools: string[]; extensionAllow: string[];
    extensionDeny: string[] }`
  - `SubagentProviderSourceRef = { providerId: string; kind: "native"|"legacy"; file: string;
    scope: "global"|"project"; origin: "top-level"|"package"; source: string; cwd: string }`
- 工具政策（`lib/subagent-tool-policy.ts`）：`resolveProfileToolPolicy(profile)`、
  `resolveSnapshotToolPolicy(resources)`、`buildSubagentExcludeTools(builtinTools)`。
- selection（`lib/subagent-model-selection.ts`）：`resolveSubagentModelSelection(...)`、
  `assertExplicitSelectionMatches(...)`、`ModelSelectionError#toSafeDTO()`。
- 客户端安全 DTO（`lib/api-types.ts`）：`ModelSelectionFailureDTO`、`isModelSelectionFailureDTO`；
  `lib/agent-client.ts`：`isModelSelectionFailureError(error)`。
- 浏览器可见响应：`{ error, code: "prompt_rejected", accepted: false, modelSelection?: ModelSelectionFailureDTO }`；
  非 prompt 拒绝 `{ error, modelSelection }` + HTTP 409。

## 验证证据（正式日志在 `research/`）

| 命令 | 退出码 | 结果 | 日志 |
| --- | --- | --- | --- |
| `node_modules/.bin/tsc --noEmit` | 0 | 无类型错误 | implementation-tsc.log |
| `npx eslint .` | 0 | 711 文件，0 error，0 warning | implementation-lint.log |
| `npm test` | 0 | 2889 tests / 2889 pass / 0 fail | implementation-tests.log |

新增/修改的测试：

- `lib/subagent-resource-snapshot.test.mjs`（10）：内置默认、严格标志、alias 保留、toolPolicy round-trip、
  损坏/未知快照拒绝、provider source 解码、保存非 boolean 拒绝与省略保留。
- `lib/subagent-model-selection.test.mjs`（6）：DTO decode、provider/model 区分、优先级、零命中 scope、
  越界/缺 auth 拒绝、alive mismatch。
- `lib/subagent-tool-policy.integration.test.mjs`：新增/extend —— `ext:*` + 歧义 deny（`npm:@scope/pi-search`
  vs `npm:pi-search` 共享短名）撤销两 owner 且 late 注册仍被过滤；未匹配 deny 为 no-op；真实 SDK
  `setActiveTools` 主动关闭后 `turn_start` 再注册不复活，宿主 subagent 路径不含 `setActiveTools*`。
- `lib/subagent-runtime.test.mjs`：start/resume owner 回归在独立 runtime 下通过（fake runtime 增加
  `getAvailable`/`hasConfiguredAuth` di 注入）。
- `lib/rpc-manager.test.mjs`、`lib/subagents.test.mjs`：源码合同断言更新到新路径。

## 未覆盖 / 未完成（不宣称通过）

- **providerSources 采集/重放**：类型与 decoder 已就位，但“明确 noExtensions 时捕获公开 pending provider
  extensionPath → 关联最终 sourceInfo → 预检后定向 host”的运行时接线未实现。R4/R7 的 C 例外与
  `provider-source-invalid`/`provider-replay-unsupported` 真实路径未跑。
- **cold `set_model` intent**：锁内/获胜 wrapper 携带 user-command intent、标准 `model_change` 持久化、
  并发 intent 不丢、失败不写记录，均未实现/未测（AC8 部分）。
- **hook 三语提示**：`useAgentSession.ts` 未新增 provider/model 的明确三语提示；prompt 失败仍走既有
  `prompt_rejected` 草稿恢复路径（安全 message 已由路由返回）。AC5 文案部分未完成。
- **runtime 矩阵**：new/warm/cold/explicitfalse/trustdisabled/scope/auth/selection/mismatch/branch/
  legacy permissions 的真实 SDK 集成测试只覆盖 selection 单元与既有 owner 回归，尚未有完整
  `lib/subagent-model-restore.integration.test.mjs`。
- **SDK 主动关闭 reload 复活**：真实 SDK（去掉本仓投影的原始 loader）在 `session.reload()` 后会重新激活
  extension 主动关闭的 `defaultActive` 工具（`session_start` 后的注册刷新）。这是 SDK 行为，非本仓投影
  引起；宿主不再调用 `setActiveTools*`（已断言），但 reload 复活无法在不访问 SDK 私有状态的前提下修复，
  作为已知限制披露，未在本仓测试中断言为“保证”。
- Safari/Windows 未实跑；浏览器 e2e 由主代理负责，本报告不宣称 browser 通过。
