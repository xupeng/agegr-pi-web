# 阶段 1 公共 SDK 技术门禁：实测证据（第二轮补齐）

> 原始验收产物现留在私有离线副本；本文仍是原 SHA 的历史记录，见 [证据留存](../evidence-retention.md)。

日期：2026-10-06。范围：implement.md「1. 公共SDK技术门禁」。本文只声明阶段 1 的技术门禁，
不声明子代理模型恢复/扩展继承/工具 policy 的 RPC、profile、snapshot decode 与 UI 接线完成
（阶段 2–4）；本阶段未改动这些行为。

第一轮报告只覆盖三项的局部，未满足批复的 plan 门禁（trust 快照、loadSkills:true 退化、
provider 只注册未执行）。本轮补齐后，原三项 + 四项额外门禁均已实测。

## 环境与依赖

- worktree：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`
- 分支：`feat/subagent-model-selection`，基线 `e0ad63073c4c42987571d31b1a4cb61e48a1fcd4`
- 依赖树：`npm ci --include=dev`（906 包，锁定树）；SDK `@earendil-works/pi-coding-agent@1.0.0`
- 只用 SDK 公共导出：`DefaultResourceLoader`、`DefaultPackageManager`、`SettingsManager`、
  `createSyntheticSourceInfo`、`ModelRuntime`、`createAgentSession`、`SessionManager`、
  `LoadExtensionsResult`、`ResourceLoader`、`AgentSessionServices`、`PathMetadata`、
  `RegisteredTool`、`Skill`。未访问 SDK 私有字段，未升级 pins/lockfile。
- 隔离：外层 `HOME=/var/tmp/pi-web-*-home-XXXXXX`（`mktemp -d --tmpdir=/var/tmp`）、
  `env -u XDG_STATE_HOME -u XDG_CONFIG_HOME -u XDG_DATA_HOME`、`TMPDIR=$HOME/.cache/pi-tmp`，
  经 `~/.pi/agent/bin/pi-tmp-run --keep-on-failure` 运行；测试 support 再把
  `HOME`/`PI_CODING_AGENT_DIR` 指到 `$TMPDIR` 下私有 scratch。无祖先 `.pi`/`.agents`
  资源被扫描；除 loopback 无网络；无真实模型/搜索请求；无 `/tmp` 探针文件。

## 交付物

生产 helper（阶段 1 新增/改动，均未大改 owner）：

- `lib/subagent-resource-loader.ts` — 无安装 `ResourceLoader` 适配；每轮 reload 重新解析
  project trust 并转发公开 reload opts；`loadSkills:true` 时预检 skills；路径授权复用
  `lib/path-security.ts`。
- `lib/subagent-session-services.ts` — 独立 child services + provider-only host；provided
  modelRuntime 不 refresh。
- `lib/subagent-tool-policy.ts` — registration-aware 工具投影。
- `lib/subagents.ts` — 新增 `createSubagentExtensionToolFilter`（复用既有 selector/alias/
  最长匹配/歧义规则），`selectSubagentExtensionTools` 改为基于它，行为不变。
- `lib/ask-user/extension-policy.ts` — 新增 `createAskUserToolProjection`；
  `projectAskUserTools` 保持「不改输入、复制 Map」合同。

测试与 fixture：

- `lib/subagent-tool-policy.integration.test.mjs`（7）
- `lib/subagent-resource-loader.integration.test.mjs`（12）
- `lib/subagent-provider-run.integration.test.mjs`（1，真实 AgentSession 执行）
- `lib/subagent-gate-support.mjs`、`lib/__fixtures__/subagent-provider-gate/**`

## 门禁 1：no-install 适配与 trust 转发（成立）

`createNoInstallResourceLoader`：

- 每轮 reload 先 `settingsManager.reload()` 取当前真实 trust；若有 `resolveProjectTrust`，
  先以 trust=false 做一次无安装 bootstrap 预检并把 `extensionsResult` 交给回调，回调结果写回
  真实 `settingsManager.setProjectTrusted()` 并再 reload，随后才 `PackageManager.resolve(skip/error)`。
  没有构造时 trust 快照。（公开 `ResourceLoaderReloadOptions` 由
  `Parameters<ResourceLoader["reload"]>[0]` 取得，SDK 未从包根导出该类型。）
- 内层 loader 用每轮新建的 `SettingsManager.inMemory({}, {projectTrusted})` 投影 +
  `noExtensions:true` + 具体文件；不能安装、不能用 spec/目录/glob 扩大集合。
- reload 后按预检 `PathMetadata` 还原 extension/tool/command 与 skill 的 `sourceInfo`。

实测：

- 真实 SDK fixture `.pi/extensions/project-gate.ts`：trusted → 载入 1 个 project 入口且
  `gate_project` 工具存在，`settingsManager.isProjectTrusted()===true`；revoke 后 reload →
  0 个 project 入口，`isProjectTrusted()===false`。
- settings 变更：`packages:[pkg]` 载入 2 个扩展；改写为 `packages:[]` 后 reload → 0 个；
  再增自动发现的 `<agentDir>/extensions/user-gate.ts` → 1 个；
  `extensions:["-extensions/user-gate.ts"]` → 0 个。都在不重启下生效。
- 本地已装 package：adapter 与真实 `DefaultResourceLoader` 的 path/source/scope/origin/tool
  `deepEqual`；缺包/版本不符经 callback skip→0 扩展+diagnostic，`error`→reload 拒绝。

## 门禁 2：loadSkills:true 不退化（成立；prompts/themes/context 仍固定关闭）

- 默认 `loadSkills:false`（批准值）。显式 `loadSkills:true` 时：用真实 settings 无安装预检
  当前启用/受信 skills，只把授权 skill 路径经 `additionalSkillPaths` 交给内层 loader；内层
  始终 `noSkills:true` 以抑制用户目录/HOME 自动发现，并还原 skill `sourceInfo`。
- 实测：`.pi/skills/gate-skill/SKILL.md`（trusted）→ `getSkills()` 恰为 `["gate-skill"]`，
  `sourceInfo.scope==="project"`；同项目同时放 `.pi/prompts`、`.pi/themes`、`.pi/SYSTEM.md`，
  `getPrompts/getThemes/getAgentsFiles` 仍为空；`loadSkills` 缺省时 0 skills。
- prompts/themes/context 按批准计划继续固定关闭。明确声明：本 helper 未接线到 profile
  选择；接线属阶段 2+。

## 门禁 3：真实 SDK 执行通路（成立）

`lib/subagent-provider-run.integration.test.mjs`：真实 `createAgentSession` +
`session.bindExtensions({})` + `session.prompt()`，本地 faux backend（无网络）。

- ready 前：`target.state.callCount===0`；bind 后仍 0；fallback provider（id `kimi`）全程 0 请求。
- ready 后：脚本先 `fauxToolCall("web_search")` 再文本。`web_search` 由 factory 在
  `session_start` 延迟注册并被绑定；模型 tool call 确实命中该注册工具（执行计数 1），第二轮
  请求 transcript 含 fixture 结果 `SEARCH-FIXTURE-RESULT`；`target.state.callCount===2`。
  这条覆盖 session→runner→tool→transcript 的 binding 路径，不再只是解析 model 对象。
- provider-only host 同时验证：只加载显式 `index.mjs`、同目录 `search.mjs` 不展开、无 session、
  `session_start` 计数保持 undefined。
- 注册与认证：从公开 pending 队列表 flush native/legacy/virtual 到全新 runtime；
  native/legacy/virtual 均可解析，legacy `hasConfiguredAuth` true、native `getAuth` 有结果；
  父 runtime `refresh` 计数 0、provider ids 不变。provided modelRuntime 不再被 refresh
  （`ownsRuntime` 为假时跳过），避免借父 refresh。

## 门禁 4：路径授权复用 lib/path-security.ts（成立）

- `assertWithinRoots` 改为 `isExistingPathWithinRoots(path, new Set(roots))`：realpath 双侧
  canonical、拒 `..`、Windows 大小写折叠，全部由既有安全边界提供；未复制
  `relative/isAbsolute` 边界算法。`quality-guidelines.md:48` 已有「文件访问授权不许复制」
  的 main docs 规则，本轮遵循它。
- 实测：`<pkg>/extensions/escape.ts → <scratch>/outside-extension.ts` 的文件 symlink 逃逸被拒；
  `<scratch>/pkg-root-link → <pkg>` 的根 symlink 下 `extensions/real.ts` 按 canonical 路径被接受。

## 门禁 5：registration filter 覆盖扩展（成立）

- same-name multi-owner：`/a/index.ts` 与 `/b/index.ts` 的 `index` 冲突 → `ext:index` 两者都不
  授权；`ext:*` 两者都授权；歧义 deny selector 不会静默 deny 每个 owner。
- late/`ext:*`/alias 歧义：session_start/turn_start 注册都过同一 live filter；deny 在 `ext:*`
  下仍生效。
- re-register/turn_start/reload：factory 在 session_start 与 turn_start 两次注册同一 denied 名，
  两次都不进 Map；`session.reload()` 后按 live policy 重新投影（deny 清空后工具回到
  definition/active）。
- reserved（`ask_user`）：load 期与 late 注册都 withdraw；不在 `getToolDefinition`/
  `getActiveToolNames`/`getCallableToolNames`，nested/codemode 不可达。
- 不重新激活主动关闭状态：allowed 但 `defaultActive:false` 的工具仍不 active。

## 运行命令、退出码与用例数

log：`research/sdk-gates-focused.log`（3 个门禁文件）、`research/sdk-gates-tests.log`
（含 owner 回归）、`research/sdk-gates-tsc-lint.log`。

| 命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node_modules/.bin/tsc --noEmit` | 0 | 无类型错误 |
| `eslint <新增/改动 11 文件>` | 0 | 0 errors, 0 warnings |
| `node --experimental-strip-types --test lib/subagent-tool-policy.integration.test.mjs lib/subagent-resource-loader.integration.test.mjs lib/subagent-provider-run.integration.test.mjs` | 0 | 20 tests / 20 pass / 0 fail |
| 上述 3 文件 + `lib/ask-user/extension-policy.test.mjs` + `lib/subagents.test.mjs` | 0 | 56 tests / 56 pass / 0 fail（含 owner 回归） |

覆盖的 spec/research：`model-default-settings.md`、`type-safety.md`、`quality-guidelines.md`、
`pi-sdk-admission.md`、`research/inherit-trusted-review.md`、`research/investigation.md`。

## 门禁过程中判明的 SDK 事实

- `ExtensionAPI` 没有 `registerNativeProvider`；native 必须用 `pi.registerProvider(providerObject)`。
- `PI_OFFLINE=1` 会在 `resolve(onMissing)` 前短路，缺包既不回调也不安装。
- `projectAskUserTools` 的复制式投影会让动态 `registerTool` 与 runner 读取的 Map 分叉；
  已用 `createAskUserToolProjection` 提供可组合 transform。
- `ResourceLoaderReloadOptions` 未从 SDK 包根导出；`session_start` 不由 `createAgentSession`
  自动 emit，需 `session.bindExtensions({})` 或 reload。

## 仍未覆盖 / 限制（不冒充完成）

- RPC、profile 默认、snapshot `toolPolicy` decode、显式选模、UI 均属阶段 2–4，本阶段未动。
  `loadSkills`/`loadExtensions` 的 wrapper 接线也尚未做。
- 合法缺失 git/npm 由 callback 保证零安装，但 legacy-global npm 探测可能执行 `npm root -g`
  子进程（实测用「已安装但版本不符」路径规避）。「零安装」不等于「零子进程」。
- 工具投影按名跨扩展 fail-closed：同名工具被某 scoped deny 命中会整体移除，未做
  per-extension 精确语义。
- `web_search` 是复现时序的合成 direct 工具，不是真实 pi-sub2api 扩展；未发真实搜索/模型请求。
- 未验证真实 git/npm 远端 package 的加载等价（只用本地 package 与已装 npm 版本不符路径）。
