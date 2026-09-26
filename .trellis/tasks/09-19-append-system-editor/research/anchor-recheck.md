# 锚点复核（2026-09-27）

本任务规划写于 2026-09-19，搁置 8 天后在开工前把目录里引用的**全部**代码锚点复核了一遍。
方法：逐条按 `file:line` 打开确认语义，SDK 侧另按 `package.json` 锁定的版本比对。

## 结论

**语义全部成立，只有 3 处行号漂移，已就地修正。** 计划没有腐烂，不需要重写；R1–R5 与
AC1–AC9 一条未改。

| 引用 | 规划写的 | 复核结果 |
| --- | --- | --- |
| `resource-loader.js` 的 `discoverAppendSystemPromptFile()` | `:820-832` | ✅ 精确；语义一致：项目级优先（需受信 + 存在）→ 否则全局 → 否则 `undefined`，**只返回一个路径**，确认「覆盖而非叠加」 |
| `resource-loader.d.ts` 的 `getAppendSystemPrompt` / `getAppendSystemPromptSources` | `:39-47` | ⚠️ 漂移到 `:53-54`（另一处同位接口 `:189-190`）；API 存在 |
| `trust-manager.js` 的受信资源清单 | `:5-15` | ⚠️ 漂移到 `:8-16`（`TRUST_REQUIRING_PROJECT_CONFIG_RESOURCES` 内含 `APPEND_SYSTEM.md`） |
| `lib/rpc-manager.ts` 正常分支不传 `appendSystemPrompt` | `:2222-2240` | ⚠️ 漂移到 `:2366-2379`（正常分支是 `:2379` 起的 `else`；唯一传它的是 `:2375` 的 subagent 分支）；**语义成立** |
| `lib/chat-only.ts:15-17` + `lib/chat-only.test.mjs:17` | 同上 | ✅ 精确（测试确实断言 override 返回 `[]`） |
| `lib/subagent-prompt.ts:19-25` | 同上 | ✅ 精确 |
| `lib/atomic-file.ts:9-33` `writePrivateFileAtomicSync` | 同上 | ✅ |
| `lib/request-security.ts:148,157` | 同上 | ✅ 精确 |
| `lib/project-trust.ts:4-13` `getProjectTrustStatus` | 同上 | ✅ |
| `lib/settings-navigation.ts:1-6` | 同上 | ✅ |
| `components/SettingsPanel.tsx:520-614`（`sections` / `sectionHost`） | 同上 | ✅ |
| `components/SettingsPanel.tsx:44-63`（`SettingsSectionIcon`） | 同上 | ✅ |
| `components/SettingsUi.tsx`（`ConfigPanelShell` / `ConfigButton` / `ConfigField` / `ConfigDetail`） | 同上 | ✅ 四个都导出 |
| `lib/file-access.ts`（`getAllowedFileRoots` / `isFilePathAllowed`） | 同上 | ✅ `:20` / `:63`。注意 `getAllowedFileRoots` 是 `async`，调用处必须 `await` |
| `app/api/subagents/settings/route.ts` + 同目录 `route.test.mjs` | 同上 | ✅ 两者都在；路由层 403/415/400 可直接参照既有测试 |
| `lib/subagent-settings.test.mjs`（临时 agentDir 写法） | 同上 | ✅ |
| `components/SettingsPanel.test.mjs`（源码正则断言） | 同上 | ✅ |
| `docs/adr/0003-built-in-subagent-toggle.md` | 同上 | ✅ |
| `.trellis/spec/frontend/settings-dialog-mobile.md` | 同上 | ✅ |
| `~/.pi/agent/APPEND_SYSTEM.md` | 存在且在用（322B） | ✅ 仍在（322B，2026-08-07）；当前 cwd 无项目级覆盖文件 |

SDK 版本被 `package.json` 锁定在 `@earendil-works/pi-coding-agent@0.85.1`，所以上述 SDK
锚点不会自行漂移；将来升级 SDK 时需要重新复核前四条。

## 同期修正的元数据

`task.json` 的 `base_branch` 原为 `main`（任务建于 2026-09-19，当时以 `main` 为基线）。仓库
现行开发主干是 `personal`（2026-09-26 的 ask_user 三个 PR 全部合入 `personal`），已改为
`personal` —— 否则本任务的分支会从 `main` 切出，与现行主干分叉。

## 复核后仍未解决的开放项

无。实现清单（`implement.md` 的 A1–A3 / B1–B6 / C1–C4）保持全部未勾选。
