# 追加系统指令（APPEND_SYSTEM.md）：原生机制保留，Web 编辑器已退役

> **状态：Retired（2026-10-06）。** 本 fork 曾提供 Settings › Append instructions 编辑器与
> `GET/PUT /api/append-system`。该 Web 编辑器链已按任务 `10-06-remove-append-instructions`
> 移除；pi 原生文件机制**保持不变**。历史来源与决策见 `docs/adr/0005-append-system-prompt-editor.md`。

## 1. 范围与退役边界

本次只取消 fork 的 Web 编辑入口，不取消 SDK 原生文件加载。历史编辑器的 GET/PUT、DTO、
字节计数和保存/reload 控件均不再属于现行接口；下文记录退役后的可执行边界。

## 2. 保留的原生能力与签名

pi 原生「追加系统提示」文件机制不受本次退役影响，仍是唯一来源：

- 生效文件由 SDK 的 `DefaultResourceLoader.discoverAppendSystemPromptFile()` 决定：
  项目级 `<cwd>/.pi/APPEND_SYSTEM.md`（需项目受信且存在）→ 否则全局
  `<agentDir>/APPEND_SYSTEM.md` → 否则无。
- **只返回一个路径**：受信项目级是**覆盖**全局，不是叠加；未受信项目级被忽略，全局文件仍然生效。
- 普通会话生效；Chat only（`lib/chat-only.ts` 的 `appendSystemPromptOverride: () => []`）与内建
  子代理（`lib/subagent-prompt.ts` 自建 `appendSystemPrompt`）不消费该全局文件。
- 系统提示在 `AgentSession` 创建时构建，已在运行的会话需要既有 reload 才会应用。
- `lib/project-trust.ts` 仍把 `APPEND_SYSTEM.md` 计入项目信任的原生文件枚举。

需要修改追加指令时，直接编辑磁盘上的全局或项目级文件；本 fork 不再提供 Web 写入入口。

现行 owner 是 SDK `DefaultResourceLoader` 及 `lib/project-trust.ts`，不是 Web writer：
`loader.reload(projectTrustReloadOptions(cwd, agentDir))` 后，使用
`getAppendSystemPrompt(): string[]` 与 `getAppendSystemPromptSources()` 检查内容及来源。
导航仍通过 `getLastSettingsSection(cwd, storage): SettingsSection` 校验持久化值。

## 3. 已移除的 Web 编辑器链（不得恢复为伪兼容）

| 曾存在的落点 | 现状 |
|---|---|
| `lib/append-system.ts`（读写、字节上限、项目覆盖探测） | 已删除 |
| `app/api/append-system/route.ts`（GET/PUT，固定写入路径 + 允许表闸门） | 已删除；旧路径为 404 |
| `components/AppendSystemConfig.tsx`（设置面板编辑器） | 已删除 |
| `lib/settings-navigation.ts` 的 `append-system` section | 已退出枚举；旧持久化值安全回退 General |
| `lib/api-types.ts` 的 `AppendSystemProjectOverride` / `AppendSystemPromptResponse` | 已删除 |
| `app/settings.css` 的 `.append-system-*` 区块 + 三语各 21 个 `settings.appendSystem*` key | 已删除 |

对应单测随文件删除；原生加载回归迁入 `lib/append-system-retirement.test.mjs`，用隔离 agent HOME
与直接 fixture 写盘断言全局发现、未受信项目读全局、受信项目覆盖四态，并断言专属文件与生产引用
不再存在。

## 4. 验证与错误矩阵

| 输入或条件 | 现行结果 |
|---|---|
| GET 或 PUT `/api/append-system` | 路由缺失，404；没有响应 DTO 或写盘行为 |
| 全局与项目文件都缺失 | append prompt/source 数组为空 |
| 只有全局文件 | 加载全局内容，source 为全局文件路径 |
| 项目未受信且两文件存在 | 忽略项目文件，仅加载全局；两文件内容均不变 |
| 项目受信且两文件存在 | 只加载项目内容，不与全局叠加；全局内容不变 |
| 旧 storage section 为 `append-system` | 有无 cwd 均回退 General；其他 selections 保留 |

## 5. 正常、基础与错误案例

- 正常：用户在 Web 外编辑原生文件，由既有创建/reload 生命周期读取。
- 基础：没有追加文件时普通会话继续使用原本的系统提示；设置只有现行六个 section。
- 错误：旧页面请求退休 API 不会保存成功；刷新后编辑入口消失，不提供伪兼容协议。

## 6. 必需测试与隔离条件

- `lib/append-system-retirement.test.mjs`：真实 SDK 四态、trust resolver 与来源路径、文件不变、
  六个专属文件缺失、生产引用缺失；禁止用自写加载器替代 SDK。
- `lib/settings-navigation.test.mjs`：旧值有无 cwd 回退及后续写入保留其他 selections。
- `components/SettingsPanel*.test.mjs`：周边 General/MCP、reload/trust、挂载、Escape/focus 保留。
- 真实 HTTP/Chromium：GET/PUT 404，桌面 tabs/移动 picker 无入口，设置操作无旧请求。
- fixture 的 `HOME`、`PI_CODING_AGENT_DIR` 必须隔离；TMPDIR 不得处于真实用户 HOME 的祖先技能树下。
  SDK 扫描全部祖先 `.agents/skills`，单改 HOME 并不能隔离位于真实 HOME 内的缓存 fixture。
  本任务显式以磁盘 `/var/tmp` 的唯一自有目录为测试 TMPDIR，保存证据后清理，不使用 `/tmp`。
  全量 mock 更新测试不设全局 `PI_OFFLINE=1`，否则会提前绕过其 mock runner；原生 fixture
  与离线浏览器服务可单独设置。源码/SDK 单测不等于浏览器验收。

## 7. 错误做法与正确边界

错误：为了退役编辑器而全文删除 `APPEND_SYSTEM.md` 或 `appendSystemPrompt`，清空用户文件或
localStorage。正确：仅移除 Web 编辑链，保留 SDK/trust/历史 snapshot，让旧 section 经已有守卫回退。

其余禁止：

- 不新增固定成功/固定启用的兼容端点；旧 GET/PUT 不暴露编辑协议。
- 不删除、迁移或改写用户已有的全局/项目 `APPEND_SYSTEM.md`；不读取真实用户文件内容。
- 不为了「让子代理也生效」修改 `lib/chat-only.ts` / `lib/subagent-prompt.ts` / `lib/rpc-manager.ts`。
- 不把编辑器曾用的 64 KiB Web 写入上限新加到 SDK 读取链。
- 不按 `0005-*` 批量删除 ADR：`docs/adr/0005-built-in-subagent-disable.md` 是另一主题。
