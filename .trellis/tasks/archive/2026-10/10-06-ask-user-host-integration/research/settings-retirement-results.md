# AskUser 独立设置退役结果（2026-10-06）

## 范围与改动

本子代理只负责设置退役，不修改 AskUser host/UI/controller、rpc-manager 或其他代理负责的工具实现。

- `components/SettingsPanel.tsx`：删除 AskUser 状态、GET/PUT fetch、toggle、专用 reload handler、General section/提示/按钮；单个剩余的 extension-UI fetch 不再套 `Promise.all`。
- 删除 `app/api/settings/ask-user/route.ts`、`lib/ask-user-settings.ts`、`lib/ask-user-settings.test.mjs`；无固定 `enabled:true` facade、隐藏 gate 或真实配置迁移。
- `lib/i18n/messages/{en,zh-CN,zh-TW}.ts`：各只删除 `settings.askUserTitle` / `settings.askUserDescription`，保留表单 `chat.askUser*` 与共享 `agents.reload*`。
- 新增 `components/SettingsPanel.ask-user-retirement.test.mjs`（6 用例）：API/helper/旧测试不存在；General 无旧设置流程；其他 General 设置存在；extension-UI / PowerShell 的 reload 依赖仍在；其他 panes 的 reload/trust/dialog wiring 保留；三语 keys 和仍用的表单/共享文案存在；共享设置读取无迁移写入、无关 patch 保留旧 `askUser:false` 和其他未知字段/私有权限。
- `docs/agents/settings-ui.md`：补充专用设置退役与保留共享能力的说明。
- `lib/pi-web-settings.ts` **未修改**。`GeneralSettings` 的 `sessionId` / `onSessionReloaded` 与 `sendAgentCommand` import 仍被两项保存操作实际消费，不能删除。

## 探索与隔离

优先运行 `codegraph explore 'GeneralSettings ask-user-settings SettingsPanel'`；其 `SettingsPanel.tsx` index stale 已用当前源码校正。

运行前实际 `TMPDIR=/home/xupeng/.cache/pi-tmp/01a10fa1-6214-753b-a8de-d7a954371fda`，不是 `/tmp`。每项有限验证通过 `/home/xupeng/.pi/agent/bin/pi-tmp-run`；命令在应用模块导入前设置独立 `HOME` / `PI_CODING_AGENT_DIR`，以及 `PI_OFFLINE=1` / `JITI_FS_CACHE=false`。新增测试自身也在 application/SDK import 前隔离这些变量，设置旧 `PI_WEB_ASK_USER=0` 并在 after 中恢复环境、删除 fixture。

未读写真实配置/凭证/MCP；未请求真实模型；未启动/停止服务；未 `next build`、安装依赖、创建完整源码/依赖树或 commit/push。wrapper 已自动清理本子代理全部验证目录/进程；最终 `find "$TMPDIR" -maxdepth 1 -name 'ask-user-settings-*'` 无残留。

## 本地验证（非 clean npm ci 最终门禁）

使用现有 checkout 依赖树，不声称本轮做过 clean npm ci。检查到 npm metadata 存在、未发现 `.pnpm` / `.ignored` / `.modules.yaml`；抽查版本与 lock 一致：TypeScript 5.9.3、ESLint 9.39.4、eslint-config-next 16.3.6、其嵌套 react-hooks 7.0.1、Pi coding-agent 1.0.0。完整 lock-consistent clean 门禁由主代理另做。

| 验证 | 实测 | 退出码 |
| --- | --- | --- |
| `node --experimental-strip-types --test components/SettingsPanel.ask-user-retirement.test.mjs components/SettingsPanel.test.mjs lib/i18n/registry.test.mjs lib/i18n/format.test.mjs lib/extension-ui-settings.test.mjs lib/settings-navigation.test.mjs lib/stacked-dialog.test.mjs` | 65 tests，65 pass，0 fail/skip | 0 |
| `node --experimental-strip-types --test lib/powershell-settings.test.mjs` | 6 tests，6 pass，0 fail/skip | 0 |
| targeted ESLint（SettingsPanel、新测试、三语 messages），JSON 汇总 | 5 files，0 errors / 0 warnings | 0 |
| `node_modules/.bin/tsc --noEmit --incremental false` | 4 条 TS2307，均为 `.next` 生成入口仍引用已删除路由 | 2 |
| supplementary TypeScript API source check（沿原 tsconfig/options，仅移除 `.next` root entrypoints，incremental:false） | 359 source root files，0 diagnostics；不是完整 tsc 门禁替代 | 0 |
| scoped `git diff --check` | 无 whitespace 错误 | 0 |

两条 Node `MODULE_TYPELESS_PACKAGE_JSON` 提示来自既有 format/stacked-dialog 的 strip-types 导入；未改 package 模块模式以掩盖提示。

完整 tsc 的过期引用具体为：
- `.next/dev/types/validator.ts:530`
- `.next/types/app/api/settings/ask-user/route.ts:2` / `:7`
- `.next/types/validator.ts:530`

不恢复 route 来掩盖过期产物，也不操作现有 dev graph；主代理的干净工作区验证应重新生成 Next 类型。

## 协调与未覆盖

完成后的源码检索 `ask-user-settings|isAskUserEnabled|process.env.PI_WEB_ASK_USER|settings.askUser` 在产品 TS/TSX 已无命中（并行代理已处理 host 原 import）；命中仅是新增退役测试的断言/旧环境输入。无本子代理待修的共享代码引用。

以下仍由主代理/host 代理验证，不能用这里的结果冒充：系统 installed discovery + 旧 false/env 0 仍实际发问、SDK inactive/hidden 边界；clean npm ci 三件套；真实 Chromium General 无开关/旧 API 请求、其他设置正常与 host 全链路。本报告只提供源码、单测和辅助类型证据，**未进行浏览器验收**。
