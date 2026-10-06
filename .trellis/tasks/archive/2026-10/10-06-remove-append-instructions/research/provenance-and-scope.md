# 来源与移除边界证据

研究日期：2026-10-06。主代理核对 Git provenance；只读 explore 子代理 `01a11011-114c-753b-a8de-d7c6e11f0aeb` 核对移除影响范围。没有产品修改、服务启动、运行时写入测试或读取真实用户 APPEND_SYSTEM.md 内容。

## 上游与新增提交

- 工作基线：`personal@06a80df`，研究前工作区干净。
- `for-sync` 指向 `agegr/pi-web`。`git ls-remote --symref for-sync HEAD` 返回默认分支 `refs/heads/main` 和 `6fcd7d44981ab51a21d6cd6eb06d361d0e3d3068`；随后 `git fetch for-sync` 成功。
- 上游固定提交日期为 `2026-10-03T01:57:04+09:00`，subject 为 `Release v0.10.0`。
- API/helper 新增提交 `82b7654c2fd682b94f21c099db411a17b056f0c8`，作者 xupeng，2026-09-27，`feat(settings): add an append-system prompt API`，新增 `app/api/append-system/route.ts` 及测试、`lib/append-system.ts` 及测试。
- UI 新增提交 `bc36f7bf1e81e5997a143c0a470beaad2738b7c6`，作者 xupeng，2026-09-27，`feat(settings): edit the append-system prompt from the settings panel`，新增组件及测试、修改设置入口/导航/DTO/CSS/三语。
- `git branch -a --contains <commit>` 对两个提交均包含 `personal`，不包含 `for-sync/main`；`git merge-base --is-ancestor <commit> for-sync/main` 均退出 1。
- `git ls-tree -r --name-only for-sync/main -- components app/api lib` 没有专属 append 文件；`git grep -n -i -E 'append.system|append instructions|AppendSystemConfig|APPEND_SYSTEM' for-sync/main -- components app lib` 只有 `lib/project-trust.ts:180` 的原生文件信任枚举。
- 上游 `lib/settings-navigation.ts` 的合法 section 为 General、Models、Skills、Agents、Plugins、MCP，没有 append-system。GitHub 固定提交网页也核对了该枚举及两个 fork 提交说明。

结论：Web 设置编辑器/API 是 fork 新增；SDK 原生文件发现不是 fork 功能，不可据此一并删除。

## 删除与局部清理清单

专属六文件：

- `components/AppendSystemConfig.tsx` 与 `.test.mjs`。
- `app/api/append-system/route.ts` 与 `route.test.mjs`。
- `lib/append-system.ts` 与 `.test.mjs`（先迁移末尾 SDK 加载回归）。

局部清理：

- `components/SettingsPanel.tsx:35,74,515,617`：import、icon、sections、sectionHost；桌面与移动共用 sections。
- `lib/settings-navigation.ts:1–9`：枚举退出；保留 `PROJECT_SECTIONS`、MCP 无 cwd 与 General 回退机制。
- `lib/api-types.ts:57–69`：`AppendSystemProjectOverride`、`AppendSystemPromptResponse`。
- `app/settings.css:1951–2038`：仅 `.append-system-*` 区块；共享 config、General error 与媒体查询不动。
- `lib/i18n/messages/{en,zh-CN,zh-TW}.ts:65–85`：各 21 个专属 key；共享 reload/reloading/saved 留下。
- `components/SettingsPanel.test.mjs:27–61`：清单、专属 trust/draft 用例；全局恢复用例收缩为 MCP，不丢掉其他项目 section 回退。
- `components/SettingsPanel.ask-user-retirement.test.mjs:77`：仅去掉退休组件 reload 断言，其余 AskUser、General/reload、MCP trust 和弹层保护保留。
- `lib/settings-navigation.test.mjs`：新增 retired section 回退且 selections 保留回归。

没有专属依赖、npm scripts、环境开关、proxy 入口或现行 e2e 编辑器脚本；AppShell 已走合法 section 校验，无需改动。只读研究时 codegraph 索引有部分 source 漂移，涉及文件以当前源码为准，不使用过期索引行号机械修改。

## 原生和共享能力保护清单

- SDK `DefaultResourceLoader.discoverAppendSystemPromptFile()`（当前安装源 `resource-loader.js:950–959`）：受信项目优先，否则全局，单文件覆盖而非叠加。
- `lib/rpc-manager.ts:2677–2727` 普通服务分支没有编辑 helper；现行 Chat only / subagent 分支不消费普通全局 append。
- `lib/project-trust.ts:171–181` 的原生文件枚举、`projectTrustReloadOptions()` 和信任安全判定保持。
- `lib/chat-only.ts` 的 placeholder、`appendSystemPromptOverride: () => []` 与 exact prompt 保持。
- `lib/subagent-prompt.ts`、`lib/subagent-runtime.ts:259–320`、`lib/subagents.ts`、`demo/lib/subagents.ts` 的 profile/父上下文/snapshot 字段与测试保持。
- `lib/atomic-file.ts`、`projectTrustReloadKey()`、`SettingsPanel` 的 sessionId/onSessionReloaded/sendAgentCommand 仍被其他 pane 使用，不能顺便移除。
- `lib/append-system.test.mjs:134–173` 的 SDK 加载两条回归迁移为直接 fixture 写盘，不再引用退休 writer。所有 fixture 使用隔离 HOME/agentDir 和非 /tmp TMPDIR。

## 持久化兼容

`pi-web:settings-navigation` 的 `getLastSettingsSection()` 先用 `isSettingsSection()` 校验；删除枚举后旧 append-system 回退 General，有无 cwd 一样。`setLastSettingsSection()` 保留 selections，编辑器本身没有详情选择。无需清空或迁移整个 storage key。

## 文档与历史

- 更新 `AGENTS.md:127,210,269`、`.trellis/spec/frontend/directory-structure.md:37`、索引旧编辑器条目。
- 编辑器 spec 与 `docs/adr/0005-append-system-prompt-editor.md` 标记退役并说明保留原生机制；现行 tools note 保留边界事实。
- 不动 `docs/adr/0005-built-in-subagent-disable.md`（序号重复）、`.trellis/tasks/archive/2026-09/09-19-append-system-editor/`、旧截图及 workspace journal/index。
- 不以全仓没有 APPEND_SYSTEM.md/appendSystemPrompt 为目标；只要求生产编辑器链不存在，允许原生边界、退役测试/文档和历史留痕。

## 验证责任

研究阶段未执行产品验证。实现后按 implement.md 跑 lock-consistent 三件套、周边设置/信任/Chat only/子代理回归和 SDK fixture，再以真实 HTTP/浏览器检查桌面/移动无入口、旧导航回退与无旧请求。源码断言和数据链验证不是浏览器证据；未运行 Safari/Windows 不宣称覆盖。
