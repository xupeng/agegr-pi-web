# 独立只读复核（2026-10-03）

## 对象与边界

- 候选：`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-sync-20261003` 的合并工作树；BASE `8d376f3`，TARGET `6fcd7d4`。尚在 merge-in-progress，index 的 UU 不等于源码仍有冲突标记；不能在此阶段声称最终 merge HEAD 已冻结或 TARGET 已成为最终 HEAD 的祖先。
- 规划/spec 从主 checkout `.trellis/tasks/10-03-sync-upstream/`、`.trellis/spec/` 读取；候选起初无任务目录。本报告是唯一新写文件，未改产品/测试、未暂存/提交、未运行全套测试或构建、未操作开发服务。
- 候选无 `.codegraph/`；使用 BASE→候选的限定路径 `git diff` 和源码读取，不使用主 checkout 的索引冒充候选符号状态。
- 复核了 upstream-sync、ask-user-protocol、pi-sdk-admission、mcp-codemode、trellis-subagent-records、clickable-file-paths、append-system-prompt specs，以及候选 AGENTS 和全部 11 个 docs/agents notes。

**结论：已确认一项本次集成路径上的 P2 UI 回归（AppendSystem trust 提示失效），另有 P3 文档规则冲突。所查 fork 运行时/授权/owner 契约未发现被合并删除；不是全功能无问题保证。**

## F1 / P2：Settings 内信任成功后，已经访问过的 AppendSystem 面板仍声称项目覆盖“不受信任”

这是本次应修的具体集成遗漏，不应只按“以前未覆盖外部 trust 变化”关闭。

### 可达场景（源码推导，未冒称浏览器复现）

1. 选中未受信任的项目，项目同时有 `.pi/APPEND_SYSTEM.md` 和 `.pi/mcp.json`。
2. 在设置访问“追加系统指令”，GET 返回 `projectOverride.trusted=false`，显示“仍使用全局文件”的提示。
3. 保持同一设置对话框，切到新增 MCP section，点击 Trust…，成功信任该项目。
4. 回到追加指令 section：原组件一直 mounted，cwd 未变；它既没有拿到 trust prop，也没有重查 override，旧的“不受信任”提示仍显示。实际后端信任已写入，wrapper 被销毁后重建将选择项目文件而非全局文件。

### 精确源码证据

- `components/SettingsPanel.tsx:617-632`：visited sections 用 `mountedSections` 保留，`sectionHost` 只切换 `hidden`，不会卸载。
- `components/SettingsPanel.tsx:683-691`：Skills/Agents/Plugins/MCP 都收到 `trust={projectTrust}`；同一段 AppendSystem 的调用只传 cwd/sessionId/onClose/onSessionReloaded，没有 trust/reload token。
- `components/AppendSystemConfig.tsx:20-26,52-70`：Props 无 trust；`load` 依赖只有 cwd，加载 effect 依赖只有 load。`sessionId`/onSessionReloaded 的变化不触发探测；切换 hidden 也不触发。
- `components/AppendSystemConfig.tsx:219-228`：提示仅按旧 `state.projectOverride.trusted` 分支；`reloadSession`（139-151）也不刷新这个 state。
- `components/AppShell.tsx:1230-1250`：新 trust 流程成功只 `setProjectTrust(data)`、关 trust dialog、增加 modelsRefreshKey/sessionKey，不关闭或重挂 SettingsPanel。SettingsPanel 挂载（2635-2651）无 sessionKey key。
- `app/api/project-trust/route.ts:93-96`：`trustProject` 后 `destroyRpcSessionsForCwd`；`lib/append-system.ts:91-101` 探测直接读取当前 `getProjectTrustStatus`，不是另一个迟滞 store。因此刷新 API 会得到新结果，但当前 UI 没有发请求。
- `components/settings-ui-helpers.ts:18-28` 已有 `projectTrustReloadKey`，其注释明确描述新增 Settings→Trust 的 mounted-panel 失效问题；上游给它知道的四个 section 接了 refresh，fork 新增 AppendSystem 在合并时遗漏。

### BASE 与本次差异

`git diff 8d376f3 -- components/AppendSystemConfig.tsx` 为空：组件原先确实也不观察外部 CLI 的 trust 变化，visited pane 机制也是原有。这部分是既有限制。但 BASE 的 SettingsPanel 没有 MCP、trust props 或 Settings 内的 Trust 入口；新增 MCP/stacked trust dialog 让用户能在**同一 mounted 设置会话**内完成信任，且新代码特意刷新其他受 trust 影响的 visited pane。上述正常新 UI 路径的错误提示是本次功能组合产生的具体回归，不只是随机外部变更未覆盖。

影响限于误导范围提示：可能让用户以为编辑全局指令还对当前项目生效；不是信任绕过或任意路径写入。

建议将 trust 变化接入 AppendSystem 的 override 探测，**不要直接按 trust key remount，也不要无条件调用现有 load() 覆盖 draft**（load 会 `setDraft(data.content)`）：未保存全局草稿必须保留。补一个同一 mounted pane 中 false→true 更新、草稿不丢的回归；真实点击链需独立浏览器验证。

## F2 / P3：docs/agents 拆分仍有三条 upstream-only 表述与 fork 规则冲突

AGENTS 的 Fork-specific contracts 已正确保留并声明优先，故当前并非产品行为被改掉；但 topic notes 是被要求“改 owner 前必读”的文件，以下表述会引导后续维护者错误恢复上游行为，应补窄例外而非删新文档。

| 新文档证据 | 与实际 fork 契约/源码相冲突之处 | 最小调整 |
| --- | --- | --- |
| `docs/agents/sessions.md:36`：`tool_execution_end never carries result` | `lib/agent-event-wire.ts:109-122` 明确保留顶层 exact `trellis_subagent` + kind 的 `result.details`；`hooks/useAgentSession.ts:2066-2074` 正在消费这个临时 final。AGENTS runtime boundaries 也保留此例外。 | 改为默认不传，补 Trellis structured-only 顶层例外及 spec 链接。 |
| `docs/agents/tools.md:13`：会话级 navigation carry 只枚举 codemode/tool_search/subagent，并称 Other extension tools follow target loadout | `lib/rpc-manager.ts:270-272,799-820` 的 session tools 明确含已 active 的 `ask_user`，不应该随早于开启 ask 的目标分支丢掉。 | 枚举加入 fork ask_user，强调 registered/nonhidden/active、Chat-only/empty pin 不回灌。 |
| `docs/agents/files-and-access.md:12`：除 coding/subagent tools 外的结果都不计入文件引用（仅随后列 fullOutputPath/nested args） | `lib/session-file-references-core.ts:103-115` 调共享成功 extractor，`lib/written-file-sources.ts:34-37` exact gate 包含 apply_patch/trellis_subagent/Agent；合法 patch/Trellis structured 成功结果仍会授权。这不是采信任意第三方正文。 | 明确 supplementary exact successful evidence 例外并链接 clickable-file-paths spec，继续拒绝 MCP/decorated/preview-only。 |

其余 notes 中 trust 的 fresh-read、builtins startupWaitMs=0、settings 的不重挂 draft 规则与候选源码/新 MCP 语义相符；未找到新增“归档后单独补 main”、裸 push、whole-file ours/theirs 或恢复任意 MCP prose 授权的规则。不能把这些三条局部矛盾泛化为全部上游 docs 不可用。

## 已确认保留的高风险契约（检查边界）

### rpc-manager / SDK admission / ask

- `lib/rpc-manager.ts:270-303`：configured 初始 selection 不制造 coding-only allow-list；resolver 的非空 pin 只替换 coding，carry 仍 registered/nonhidden 的 active 非 coding tools；空 selection 返回空，不全量激活 registered tools。
- `:799-820`：navigation 对非 child/non-Chat-only 重施 pin，携带原 active session tool 集含 ask_user；cancelled/child/Chat-only 留 SDK restored loadout。
- `:1412-1440`：reload 的 requested coding set 来自此前 active，默认 carry 来自 SDK reload 后 rebuilt active；没有退回“所有扩展自动激活”。
- `:983-1107`：只串行 admission；`acceptPreflight` 内才 void open ask，成功 admission 返回，completion promise 负责 pending/count/error/done。MCP 等待在调用 SDK prompt 之前，Stop 走 finish/reject，不接受、不清 ask。
- `:527-541`：Stop 先 abort MCP preparation 并等待 unwind，再 inner.abort；watchdog 与用户 Stop 共用路径。
- installed SDK 1.0 `dist/core/agent-session.js:1481-1595` 源码仍为成功 `handled/queued/started` 才调用 preflightResult，拒绝通过 promise 抛错；wrapper 的窄协议未与新 SDK 相反。
- `lib/ask-user/portable/tool.ts:139` 的 model-only 保留；`lib/subagent-extension.ts:29,171,266,305` 三控制工具仍 model-only。portable 两 peers 和 discovery 断言已同步 1.0.0。

### MCP preparation / dispose / watchdog

- 本轮 rpc diff 主要是 extension invocation lookup、MCP slash 分类、declarationHidden、dispose；没有删除 fork admission/ask/watchdog 段。
- `lib/rpc-manager.ts:761-777,1039-1067` 与 `lib/mcp-command.ts:58-67`：extension command invocation exact match；别的 slash skip，builtin `/mcp` register-only，普通/template/skill 仍 wait。SDK source 先处理 extension command 的顺序与分类一致。
- `lib/builtin-extensions.ts:379-391` 设置 `startupWaitMs:0`，避免 SDK 1.0 在 host 已准备后第二次不可 Stop 的初始 wait；空 config loader 和 sanitized transport 不丢。
- `lib/rpc-manager.ts:1520-1617`：host 一次 dispose 发生在 extension shutdown 前；closing/disposal deadline、旧 wrapper 身份保护（不抹 replacement 的 ask）保留。`lib/mcp-host.ts:1030-1079` reload 工厂 dispose 旧 host、wrapper dispose 当前 host 的实现对应新的 options。
- `lib/rpc-manager.ts:430-441` 仍在 raw inner subscription 上 observe watchdog 后 emit，不依赖 slim SSE；nested track budget/不重播逻辑（546-568）保留。

### builtins / prompts / child / 授权

- `lib/rpc-manager.ts:2666-2717`：主会话 factory 并集仍含 builtins + read-only policy + project bash + subagent + ask；chatOnly/重开 child 不调用 builtins factory。exact prompt branches 与独立 child resourceSnapshot 保留。
- `lib/subagent-runtime.ts:260-337` 新建 child 仍仅 profile resources + exact extension，没有主会话 MCP/ask factories，reserved tool 排除保留。
- `lib/chat-only.ts:6-18` 屏蔽 append 文件且保留按序 context；`lib/subagent-runtime.ts` 和 rpc child reopen 仍用保存的 append/exact prompt，不把全局 APPEND_SYSTEM 并入 child。
- `lib/subagent-runtime.ts:196-207,441,583` fresh/reopen completion 都走 snapshot policy；`lib/session-file-references-core.ts:103-153` 排除非授权 sources 并复用 exact success extractor。
- agent-event-wire、subagent-runtime、session-file-references-core、written-file-sources、chat-only、subagent-prompt、exact-system-prompt、stall-watchdog 本轮与 BASE 无源码 diff；这证明未被合并改写，不证明 SDK 升级下所有运行场景已实测。

### Trellis / AppShell / options / minimap / settings

- wire 的 top-level exact Trellis final 例外和 hook tool-end 消费同时存在；canonical message/history 机制未被本轮 slash patch覆盖。
- `components/AppShell.tsx:154-182` 仍按 owner gate 和 selected parent scope 接收 records；`:2443` 仍向 ChatWindow 传 onSubagentRecordsChange；`hooks/useAgentSession.ts` 的本轮 diff 没有更动 Trellis owner/store/branch 接收路径。
- `components/AppShell.tsx:1142-1148` options 的 page/modeHint/sourceSessionId 全转发；ChatWindow/MessageView handler 没退回 positional page。MessageView 的 `patchFiles && isError` 与正常 diff 两分支（1312、1325）均仍传 onOpenFile。
- `components/ChatWindow.tsx:1313` minimap 挂载保留，`components/ChatMinimap.tsx` 与 BASE 无 diff；没有用 upstream 默认覆盖 fork 的 Notion minimap。
- `lib/settings-navigation.ts:1-19` 同时枚举 append-system/mcp，PROJECT_SECTIONS 不含二者；`components/SettingsPanel.tsx:680-691` 两 section 同时挂载。General fork 设置未随 MCP Code mode 入口迁移被整段删除。
- `package.json`/lock root 仍 `@xup3ng/pi-web@0.12.0`；四个 SDK direct、lock root、lock resolved 和 installed package.json 都实读为 1.0.0。package.json 的 BASE diff 仅这四 pins。

## 验证证据

没有重跑全套门禁。只运行三份聚焦 Node 契约测试：

```text
TMPDIR=/var/tmp
HOME=/var/tmp/pi-web-independent.8uyo8J/home
PI_CODING_AGENT_DIR=/var/tmp/pi-web-independent.8uyo8J/agent
JITI_FS_CACHE=/var/tmp/pi-web-independent.8uyo8J/jiti
node --test lib/rpc-manager-tool-exposure.test.mjs \
  lib/rpc-manager-shutdown.test.mjs lib/agent-event-wire.test.mjs
```

- exit 0；72 tests，72 pass，0 fail/skip/cancel。
- 日志 `/var/tmp/pi-web-independent.8uyo8J/focused.log`。这是 Node wrapper/wire 契约证据，**不是浏览器、真实外部模型/MCP/OAuth completion 证据**。
- `git diff --check 8d376f3 --` 上述 rpc/builtin/hook/AppShell/SettingsPanel/ChatWindow/MessageView 路径无输出；限定主要冲突文件的 marker 搜索无输出。不是宣称 index UU 已解决或全树 marker 检查通过。
- 未重复主代理正在修复的 pendingImages/alias import/trust safe-area/session-cache 测试工作。

09:50:15 +08:00 读取的关键文件 SHA256（并发实施中的工作树证据，不是提交 hash）：

```text
673c5ee927c1b1bdb95e75aaabeb65700f7613f1a33cde5c2e17438a80aee262 lib/rpc-manager.ts
fafe8169db635890f955c5e885478fdcebad93cb7fda20ab5e6f829d2a0ac0c0 components/SettingsPanel.tsx
d3c1a3e331d47ac1c6c6027a2b66761b3bff8c600380d7e07c2ddff690c032fe components/AppendSystemConfig.tsx
1c1b0db5d5d0af06946bdac6201f68ae868bfdab67d2cd1191d78229b6b79f8c hooks/useAgentSession.ts
559e523460e59382828ba008de2e0230fdcc3e580a53a07c00dc89f87e80905b AGENTS.md
```

## 剩余风险

本报告不是 MCP 新增全体代码的完整安全审计；复核重点是合并交集和 fork 契约。未运行浏览器点击、Safari 16.2、Windows、真实第三方 OAuth/模型。F1 需要产品修复并测试；F2 需要文档窄例外。冻结最终合并产物后的 tsc/lint/npm test、祖先关系/无删除/显式暂存审计仍由主代理收口。
