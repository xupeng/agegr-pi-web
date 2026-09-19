# pi-web 设置里编辑 APPEND_SYSTEM.md（全局追加指令）

## Goal

在 pi-web 设置里给出一条**全局追加指令**的编辑入口，让用户无需手改文件就能要求 agent（例如「产出文档后在回复中用 markdown 链接给出路径」），从而与渲染层兜底共同保证「回复里的产物可点」。

来源：`09-19-clickable-file-paths` 规划期由用户决策拆出的独立任务（该任务只做渲染层兜底，不做提示词层）。

## Background

### 已查实的 pi 原生机制（不需要自造注入链路）

- pi 有一等公民的「追加系统提示」文件机制：`ResourceLoader.getAppendSystemPrompt(): string[]` / `getAppendSystemPromptSources(): {path}[]`（`node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.d.ts:39-47`）。
- 生效文件由 `discoverAppendSystemPromptFile()` 决定（`.../dist/core/resource-loader.js:820-832`）：项目级 `<cwd>/.pi/APPEND_SYSTEM.md`（需项目受信）**优先并覆盖**全局 `<agentDir>/APPEND_SYSTEM.md`；**只返回一个路径，不是叠加**。`APPEND_SYSTEM.md` 属需受信的项目资源（`.../dist/core/trust-manager.js:5-15`）。`CONFIG_DIR_NAME` 即 `.pi`。
- 全局文件在本机**已存在且在用**：`~/.pi/agent/APPEND_SYSTEM.md`（322B，当前内容为「始终使用中文回答…」）。
- 生效范围（已查实，且**本次不做扩展**）：
  - 普通会话生效：`lib/rpc-manager.ts:2222-2240` 的正常分支不传 `appendSystemPrompt` ⇒ 由 loader 自行发现全局文件。
  - chat-only 模式不生效：`lib/chat-only.ts:15-17` 的 `appendSystemPromptOverride: () => []` 清空；`lib/chat-only.test.mjs:17` 断言该行为。
  - 内建子代理不生效：`lib/subagent-prompt.ts:19-25` 显式构造 `appendSystemPrompt = [profileSystemPrompt, inheritedParentContext]`。

### 仓库现有的可复用模式

- API：`app/api/subagents/settings/route.ts`（`GET`/`PUT` + `isApiRequestAllowed` + `hasJsonContentType`，`lib/request-security.ts:148,157`）。
- 原子私有写：`lib/atomic-file.ts:9-33` 的 `writePrivateFileAtomicSync(path, contents)`（0600、临时文件 `wx`、`renameSync`，**要求调用方先建父目录**）。
- 设置面板：`components/SettingsPanel.tsx` 的 section 机制（`sections` 列表 + `sectionHost` 惰性挂载，`:520-614`）、`SettingsSectionIcon`（`:44-63`）、`lib/settings-navigation.ts:1-6` 的 `SETTINGS_SECTION_VALUES`；控件外壳 `components/SettingsUi.tsx`。
- 受信判断：`lib/project-trust.ts:4-13` 的 `getProjectTrustStatus(cwd, agentDir)` 与 pi 的 `isProjectTrusted()` 语义对齐。
- 仓库内**没有任何** APPEND_SYSTEM 相关 UI/读取代码（grep 无命中）⇒ 纯新增。
- 同类先例：内建子代理开关（`~/.pi/agent/agents/settings.json`）改动后需要用户显式重载会话才生效（`docs/adr/0003-built-in-subagent-toggle.md`）——本任务的「已开始会话需重载」提示沿用同一预期。

## Requirements

### R1 编辑入口

pi-web 设置中新增一个 section，读取并保存**全局** `~/.pi/agent/APPEND_SYSTEM.md`，内容原样往返（不重排、不追加 frontmatter、不自动增删换行）。文件不存在时以空内容呈现。

### R2 写入安全性

保存必须：内容类型与来源校验（复用 `isApiRequestAllowed` + `hasJsonContentType`）、大小上限、父目录缺失时先创建、经 `writePrivateFileAtomicSync` 原子写（0600）。保存失败必须回报错误且不破坏原文件。

### R3 生效范围必须显式说明

UI 必须写明：**普通会话生效；Chat only 模式与内建子代理不生效；已在运行的会话需要重载后才会应用新指令**。这是 pi 的原生语义，不得静默省略（否则用户会以为子代理也遵守）。

### R4 项目级覆盖的只读提示

当当前会话 cwd 存在受信的 `.pi/APPEND_SYSTEM.md` 时，UI 必须提示「项目级文件存在且**覆盖**全局」，并显示该路径与受信状态。**本次不提供项目级编辑**（决策 D1）。

### R5 不做的事

- 不新增 pi-web 专属的指令存储（必须走 pi 原生文件，避免语义漂移）。
- 不提供项目级编辑；不改 `lib/chat-only.ts` / `lib/subagent-prompt.ts` 的既有生效范围。
- 不做 `SYSTEM.md`（替换基础提示）的编辑入口。

## Acceptance Criteria

- [ ] AC1（R1）设置里的 section 能加载 `~/.pi/agent/APPEND_SYSTEM.md` 的当前内容；文件缺失时显示为空且不报错。
- [ ] AC2（R1）保存后文件内容与提交内容**逐字节一致**（含中文、emoji、末尾换行差异），且原有内容格式未被重排。
- [ ] AC3（R2）保存后文件权限为 `0600`，且为原子替换（临时文件不残留）。
- [ ] AC4（R2）缺失 `Content-Type: application/json` 返回 415；不受信来源返回 403；超过大小上限返回 400 且**原文件不变**。
- [ ] AC5（R3）UI 明确展示三项生效范围说明（普通会话 / chat-only / 子代理）与「运行中的会话需重载」提示。
- [ ] AC6（R4）当 `<cwd>/.pi/APPEND_SYSTEM.md` 存在且受信时，UI 显示覆盖提示与路径；不存在或未受信时不显示该提示。
- [ ] AC7（R5）`lib/chat-only.ts` 与 `lib/subagent-prompt.ts` 的既有行为与其单测均不回归。
- [ ] AC8 i18n 三语齐备（`lib/i18n/registry.test.mjs` 通过）；`components/SettingsPanel.test.mjs` 既有断言不回归。
- [ ] AC9 `node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test` 退出码 0，基线与计数对照记录在 `research/`。

## Out of Scope

- 项目级 `.pi/APPEND_SYSTEM.md` 的编辑（决策 D1：仅全局）。
- 扩展生效范围到 chat-only 或子代理（会改动两处既有语义，需另开任务）。
- `SYSTEM.md`（替换 pi 基础系统提示）的编辑入口。
- 指令模板/预设库、多套指令切换。
- 渲染层的路径可点能力：见 `.trellis/tasks/09-19-clickable-file-paths`。

## 决策记录

- D1 覆盖层级：**仅全局** `~/.pi/agent/APPEND_SYSTEM.md`，沿用 pi 原生生效范围；项目级只做只读覆盖提示（用户决策）。
- D2 落点：pi 原生 `APPEND_SYSTEM.md`，**不自造** pi-web 专属指令存储（避免与 pi 语义漂移）。
- D3 归属：本任务独立于 `09-19-clickable-file-paths`，可独立实现、验收与归档；两者无实现依赖（渲染层兜底不依赖本任务）。

## Notes

- 本任务的价值是「让模型主动给链接」，不是「让链接能点」；后者由 `09-19-clickable-file-paths` 的渲染层保证。因此本任务可以被延后而不影响核心体验。
