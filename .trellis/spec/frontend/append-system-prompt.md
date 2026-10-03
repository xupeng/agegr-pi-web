# 追加系统指令（APPEND_SYSTEM.md）编辑契约

> 设置面板里编辑 pi 原生全局追加提示的完整契约、边界与不变量。
> 决策背景见 `docs/adr/0005-append-system-prompt-editor.md`。

---

## 它是什么

pi 有原生的「追加系统提示」文件机制：资源加载时把该文件内容并入**每一次**请求的系统提示。
生效文件由 SDK 的 `discoverAppendSystemPromptFile()` 决定（`resource-loader.js:820-832`）：
项目级 `<cwd>/.pi/APPEND_SYSTEM.md`（需项目受信 + 存在）→ 否则全局 `<agentDir>/APPEND_SYSTEM.md`
→ 否则无。**只返回一个路径**：项目级是**覆盖**全局，不是叠加。

pi-web 只做「编辑全局那一个文件」的入口，不新造存储、不改注入链路。

| 落点 | 文件 |
|---|---|
| 读写与探测 | `lib/append-system.ts` |
| HTTP 契约 | `app/api/append-system/route.ts`（`GET`/`PUT`，`export const dynamic = "force-dynamic"`） |
| 面板 section | `components/AppendSystemConfig.tsx`（挂载于 `components/SettingsPanel.tsx` 的 `append-system`） |
| section 枚举 | `lib/settings-navigation.ts` 的 `SETTINGS_SECTION_VALUES`（**不在** `PROJECT_SECTIONS`：这是全局设置） |

## 接口契约

`GET /api/append-system[?cwd=<session cwd>]` 与 `PUT /api/append-system[?cwd=…]` 返回**同一形状**：

```jsonc
{
  "path": "<agentDir>/APPEND_SYSTEM.md",   // 绝对路径，前端只显示，不自己拼
  "content": "……",                          // 文件缺失时为 ""
  "exists": true,
  "maxBytes": 65536,
  "projectOverride": { "path": "<cwd>/.pi/APPEND_SYSTEM.md", "trusted": false }  // 仅当文件存在
}
```

- `PUT` body 严格是 `{ content: string }`；错误码 403（来源校验）/ 415（Content-Type）/
  400（非字符串、超 `maxBytes` 且**不落盘**）/ 500。
- `cwd` 可选，仅用于项目级覆盖的只读提示。

## 不变量（改动时必须保住）

1. **写入路径服务端固定**：`getAppendSystemPromptPath(agentDir)`，`agentDir` 默认来自
   `getAgentDir()`。任何「让客户端传路径」的改动都会把这个端点变成任意文件写入原语。
2. **探测前先过文件根允许表**：`getAllowedFileRoots()` + `isFilePathAllowed(cwd, roots)`；
   未授权时返回 `projectOverride: null` 而**不是**去 `existsSync` 一个任意路径 ——
   否则该端点变成路径存在性探测器。注意 `getAllowedFileRoots()` 是 `async`。
3. **项目级覆盖只是提示**：`trusted: false` 时 pi 仍读全局文件，文案必须说清；不要把
   `projectOverride` 做成可写入口。
4. **逐字节往返**：不追加、不裁剪换行；缺失读作 `""`；写空字符串创建空文件而**不删除**文件。
   > 前端注意：`<textarea>` 的 API value 按 HTML 规范把 CRLF 归一化为 LF，所以一个 CRLF 文件
   > **一旦被编辑并保存**就会变成 LF（纯查看不动文件：`dirty=false` 不落盘）。服务端 `PUT`
   > 本身是逐字节的，这条限制只属于编辑控件。
5. **原子私有写**：`lib/atomic-file.ts` 的 `writePrivateFileAtomicSync`（临时文件 + rename，0600）。
6. **上限是字节不是字符**：65536 按 UTF-8 字节计（`Buffer.byteLength` 服务端、
   `new TextEncoder().encode(x).length` 前端）。用 `content.length` 会让中文草稿在 60000 字节附近
   错判 —— 服务端会拒，前端却以为可以保存。
7. **派生提示失败不得升级为整体失败**：项目级探测抛错时 `projectOverride` 退化为 `null`，
   不能把一次成功的保存变成 500（同 `quality-guidelines.md` 的「派生指标算不出来 ≠ 整个响应失败」）。
8. **已挂载页面的信任提示随项目状态刷新，但不覆盖草稿**：`SettingsPanel.tsx` 将
   `trust={projectTrust}` 传入 AppendSystem；`AppendSystemConfig.tsx` 的 effect 依赖
   `[cwd, projectTrustReloadKey(trust)]`。同 cwd 已成功加载后，只替换 `projectOverride`，
   不改全局 `state.content` 或独立 `draft`。首次加载/切 cwd 仍初始化编辑器；cleanup 同时
   abort 请求并标记取消，即使 fetch 忽略 abort，旧 trust/cwd/卸载响应也不能提交到当前页面。
   不要按 trust key remount 或直接复用会 `setDraft` 的完整加载来刷新派生提示。

## 生效范围（用户可见文案是硬要求）

| 场景 | 是否生效 |
|---|---|
| 普通会话 | 生效（由 loader 自行发现全局文件） |
| Chat only 模式 | **不生效**：`lib/chat-only.ts` 的 `appendSystemPromptOverride: () => []` |
| 内建子代理 | **不生效**：`lib/subagent-prompt.ts` 自行构造 `appendSystemPrompt` |
| 已在运行的会话 | 需重载：系统提示在 `AgentSession` 创建时构建（`lib/rpc-manager.ts:2366-2379`） |

改文件**不会**影响已存在的 wrapper。面板只提示并提供既有的
`sendAgentCommand(sessionId, { type: "reload" })` 入口（与 `AgentsConfig`、`PluginsConfig`、
ask_user 开关同一路径），不引入自动重启。

## 禁止的模式

- 在路由或组件里接受/拼接文件路径（必须用响应里的 `path`）。
- 在前端用 `content.length` 判断上限。
- 把 `cwd` 直接交给 `existsSync` 而不先过允许表。
- 修改 `lib/chat-only.ts` / `lib/subagent-prompt.ts` / `lib/rpc-manager.ts` 来「让子代理也生效」：
  那会改变既有提示语义，不在本契约范围内。
- 在设置面板里使用 `--chat-font-size-offset`（那是对话区的规则）。

## 验证

- 单测：`lib/append-system.test.mjs`（含用 pi 自己的 `DefaultResourceLoader` 断言
  「写进去的就是 pi 加载的追加提示」与「项目级覆盖而非叠加」两态）、
  `app/api/append-system/route.test.mjs`（403/415/400 与允许表闸门）、
  `components/AppendSystemConfig.test.mjs`（R3 三条范围文案与 R4 两态、字节口径、路径来源；
  实际 effect 的 trust false→true、草稿/基线保留、初始化、迟到/失败响应），
  `components/SettingsPanel.test.mjs`（信任 prop 必须传入且不得 remount）。
- 浏览器：见任务 `09-19-append-system-editor` 的 `research/browser-verification.md`。
- i18n：新增文案三语齐全，`lib/i18n/registry.test.mjs` 强制 key 与占位符一致。
