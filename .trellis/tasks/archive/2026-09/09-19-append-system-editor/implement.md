# 实施计划：pi-web 设置里编辑 APPEND_SYSTEM.md

依据 `design.md`。验证命令（勿执行 `npm install`）：

```bash
node_modules/.bin/tsc --noEmit
npm run lint
npm test
```

## A. 服务端

- [x] A1 新增 `lib/append-system.ts`
  - `getAppendSystemPromptPath(agentDir = getAgentDir())` → `<agentDir>/APPEND_SYSTEM.md`
  - `readAppendSystemPrompt(): { path, content, exists, maxBytes }`（缺失 → `content: ""`）
  - `writeAppendSystemPrompt(content: string)`：字节上限校验 → `mkdirSync(dirname, {recursive:true})` → `writePrivateFileAtomicSync`（`lib/atomic-file.ts:9-33`）
  - `detectProjectAppendSystemOverride(cwd)`：探测 `<cwd>/.pi/APPEND_SYSTEM.md` 是否存在 + `getProjectTrustStatus(cwd, agentDir)`（`lib/project-trust.ts:4-13`）
- [x] A2 新增 `app/api/append-system/route.ts`（`GET`/`PUT`，`export const dynamic = "force-dynamic"`）
  - `GET`：`cwd` 可选；若提供则先过 `getAllowedFileRoots` + `isFilePathAllowed` 再探测，否则 `projectOverride: null`
  - `PUT`：`isApiRequestAllowed` → 403；`hasJsonContentType` → 415；`content` 非字符串 → 400；超上限 → 400（不落盘）；成功返回 GET 同形响应
- [x] A3 新增 `lib/append-system.test.mjs`：读取存在/缺失、写入往返逐字节一致、超上限拒绝且原文件不变、`projectOverride` 三态、路径不接受外部输入、权限 0600
- [x] **验证点**：`npm test`（A 相关）+ `tsc --noEmit`

## B. 设置面板

- [x] B1 `lib/settings-navigation.ts`：`SETTINGS_SECTION_VALUES` 追加新 section id（**不加**进 `PROJECT_SECTIONS`）
- [x] B2 `components/SettingsPanel.tsx`：`sections` 数组追加 `{ id, label: t("<按既有 section label 命名规则的新 key>"), requiresProject: false }`；`SettingsSectionIcon` 增加该 section 的图标分支
- [x] B3 新增 `components/AppendSystemConfig.tsx`：加载/编辑/保存/放弃、字符数、文件路径、生效范围说明（R3）、项目级覆盖提示（R4）、示例指令插入按钮；外壳复用 `components/SettingsUi.tsx`
- [x] B4 i18n：`lib/i18n/messages/{en,zh-CN,zh-TW}.ts` 同时新增所需 key（section label、字段标签、保存/放弃、生效范围三条说明、覆盖提示两态、示例指令、错误文案）；占位符集合三语一致
- [x] B5 移动端按 `.trellis/spec/frontend/settings-dialog-mobile.md` 自查（全屏、滚动容器、安全区）
- [x] B6 先读 `components/SettingsPanel.test.mjs`，确认新增 section 不破坏既有正则断言；如需则同步更新
- [x] **验证点**：`npm test`（i18n/设置面板相关）+ 目视 UI

## C. 收尾

- [x] C1 `node_modules/.bin/tsc --noEmit` 退出码 0
- [x] C2 `npm run lint` 退出码 0
- [x] C3 `npm test` 全绿；基线对照写入 `research/verification-baseline.md`（按 `.trellis/spec/frontend/quality-guidelines.md`）
- [x] C4 人工端到端：保存 → 新建会话生效；在存在项目级文件的仓库确认覆盖提示；确认 `lib/chat-only.ts` / `lib/subagent-prompt.ts` 无改动（`git diff` 自查 AC7）

## 实施结果（2026-09-27）

A/B/C 全部完成，三件套实测：`tsc` 0、`npm run lint` 522 文件 0 error/0 warning、`npm test`
1516/1516（基线 1497，逐项归因见 `research/verification-baseline.md`）。AC7 自查
`git diff --stat personal -- lib/chat-only.ts lib/subagent-prompt.ts lib/rpc-manager.ts` 为空。

与原计划的偏离（均有记录）：

1. **多一个路由层测试文件** `app/api/append-system/route.test.mjs`（403/415/400 只能在路由层覆盖，
   且 `app/api/subagents/settings/route.test.mjs` 是同目录先例）。
2. **`PUT` 也接受可选 `?cwd=`**：让「与 GET 同形」成立（响应里的 `projectOverride` 不是恒为 null），
   body 仍严格是 `{ content }`。
3. **`cwd` 不在允许根时返回 `projectOverride: null` 而非 403**：不探测即不泄露路径存在性，
   也不因一个只读提示失败而让成功保存变成 500。
4. **UI 用字节数而非字符数**（`TextEncoder`），与服务的 UTF-8 上限口径一致；
   design §3 写的「字符数」按此修正。
5. **多了一个重载按钮**：复用既有的 `sendAgentCommand(sessionId, { type: "reload" })`，
   与 `SettingsPanel.tsx:498-506` 的 ask_user 重载同构。

C4 的浏览器部分不是用真模型复述提示来验证的：改用 pi 自己的 `DefaultResourceLoader` 断言
「保存的内容就是 loader 读到的追加提示」，外加真实 Chromium 的 33 条断言（保存、0600、
超限、受信两态、390px 布局），见 `research/browser-verification.md`。

## 高风险文件

| 文件 | 风险 |
|---|---|
| `components/SettingsPanel.tsx` | 既有源码正则测试；section 列表/图标需成对修改 |
| `lib/settings-navigation.ts` | 枚举被多处消费，追加项要注意持久化导航状态的旧值兼容（未知值应回退到 `general`，沿用既有实现） |
| `app/api/append-system/route.ts` | 若接受客户端路径会变成任意文件写入原语 ⇒ 路径必须服务端固定 |

## 回滚点

删除 section 注册 + 删除路由即可；`APPEND_SYSTEM.md` 保持 pi 原生格式，回滚不留私有数据。
