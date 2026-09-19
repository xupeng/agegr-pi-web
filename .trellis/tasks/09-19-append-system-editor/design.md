# 设计：pi-web 设置里编辑 APPEND_SYSTEM.md

对应 `prd.md` 的 R1–R5。核心原则：**只暴露 pi 已有的能力，不新造语义**。

---

## 1. 架构与边界

```
components/SettingsPanel.tsx           新增 section「追加指令」
  └─ 新增 components/AppendSystemConfig.tsx（或等价 section 内容组件）
        GET/PUT /api/append-system
              └─ 新增 lib/append-system.ts
                    ├─ getAgentDir() → <agentDir>/APPEND_SYSTEM.md（全局，唯一可写目标）
                    ├─ 只读探测 <cwd>/.pi/APPEND_SYSTEM.md + getProjectTrustStatus(cwd)
                    └─ writePrivateFileAtomicSync（lib/atomic-file.ts，0600 + 原子替换）
```

**边界**：不写项目级文件、不写 `SYSTEM.md`、不改 `lib/chat-only.ts` 与 `lib/subagent-prompt.ts`、不改 `lib/rpc-manager.ts` 的资源装载分支。因此本任务对运行时行为的影响面只有「用户主动改了那个文件」这一条。

## 2. 契约

### `GET /api/append-system?cwd=<session cwd>`

```jsonc
{
  "path": "/home/<user>/.pi/agent/APPEND_SYSTEM.md",   // 全局文件绝对路径
  "content": "……",                                      // 文件不存在时为 ""
  "exists": true,
  "maxBytes": 65536,
  // 只读的「项目级覆盖」信息；cwd 缺失或未受信时为 null
  "projectOverride": { "path": "<cwd>/.pi/APPEND_SYSTEM.md", "trusted": true } // 仅当该文件存在
}
```

- `cwd` 是可选查询参数：由客户端传当前会话 cwd（无会话则传 default cwd）。服务端必须复用文件根校验（`lib/file-access.ts` 的 `isFilePathAllowed` / `getAllowedFileRoots`）后再探测，避免任意路径探测。
- `projectOverride` 仅在**文件存在**时返回；`trusted` 来自 `getProjectTrustStatus(cwd, agentDir)`（`lib/project-trust.ts:4-13`）。UI 对「文件存在但未受信」要给出不同措辞（未受信 ⇒ pi 不会读取它，因此实际仍走全局）。

### `PUT /api/append-system`

- 前置：`isApiRequestAllowed(req)`（否则 403）、`hasJsonContentType(req)`（否则 415）。
- Body：`{ content: string }`；非字符串 → 400；`Buffer.byteLength(content, "utf8") > maxBytes` → 400（**不落盘**）。
- 行为：`mkdirSync(dirname(path), { recursive: true })` → `writePrivateFileAtomicSync(path, content)` → 返回与 GET 同形的响应（便于 UI 直接以服务端状态为准刷新）。

### 存储与编码

- 目标路径固定 `<getAgentDir()>/APPEND_SYSTEM.md`，不接受客户端指定路径（避免成为任意文件写入原语）。
- 内容按 UTF-8 逐字节往返：**不追加、不裁剪换行**。pi 会把文件内容原样用作追加提示；我们不做任何「规范化」。
- 上限 65536 字节：该内容会进入**每一次**请求的系统提示，无上限等于允许用户意外制造超长提示与费用。UI 同时显示字符数，作为 token 成本的可感知代理。
- 文件缺失 → `content: ""`；用户在空内容下点保存 → 写入空文件（**不删除文件**：pi 只在文件存在时读取，删除与写空在此语义等价，但保留文件更可预期，也避免误删）。

## 3. UI 设计

- 落点：`components/SettingsPanel.tsx` 新增 section（`sections` 数组 + `SettingsSectionIcon` 分支 + `lib/settings-navigation.ts` 的 `SETTINGS_SECTION_VALUES`）。**不加进** `settings-navigation.ts` 的 `PROJECT_SECTIONS`（本 section 是全局的，与项目无关）。
  - `requiresProject: false`（与其他全局 section 一致）。
  - 新增 section 前后先读 `components/SettingsPanel.test.mjs`：它用源码正则断言 tab/sidebar 与文案，避免踩中既有断言（AC8）。
- section 内容（`components/AppendSystemConfig.tsx`）：
  1. 等宽 `textarea`（受 maxBytes 约束，显示 `字符数 / 上限`）。
  2. 保存按钮 + 未保存变更时的「放弃修改」；保存中禁用；失败显示服务端错误文本。
  3. **生效范围说明（R3，不可省略）**：普通会话生效；Chat only 模式不生效；内建子代理不生效；已在运行的会话需重载。
  4. 全局文件路径展示（可复制）。
  5. 项目级覆盖提示（R4）：存在 + 受信 → 警告「该项目级文件会覆盖全局」；存在但未受信 → 说明「未受信，pi 目前仍读取全局文件」。
  6. 一处可直接插入的示例指令（例如「产出文档后在回复中用 markdown 链接给出其路径」），以按钮形式追加到光标处/末尾——降低上手成本，属于 R1 的一部分。
- 控件与外壳复用 `components/SettingsUi.tsx`（`ConfigPanelShell` / `ConfigButton` / `ConfigField` / `ConfigDetail`）与 `SettingsPanel` 的 section 挂载机制（惰性挂载 + `is-embedded`）。
- 移动端约束遵循 `.trellis/spec/frontend/settings-dialog-mobile.md`：`≤640px` 全屏、滚动容器 `height:100%; min-height:0; overflow-y:auto`、浮层居中用 `margin:auto`、`position:absolute` 需叠加 `env(safe-area-inset-top)`。**注意**：该规范中「对话区字号用 `--chat-font-size-offset`」的条款适用于对话区，设置面板不适用。

## 4. 生效时机（必须在 UI 说清）

- 会话的系统提示在 `AgentSession` 创建时构建（`lib/rpc-manager.ts:2222-2240` 决定 resourceLoader 选项），**改文件不会影响已存在的 wrapper**。
- 因此：新建会话立即生效；已打开的会话需要重载。内建子代理开关也是同一预期（`docs/adr/0003-built-in-subagent-toggle.md`）。
- 设计选择：**不**引入热重载或自动重启会话（会让用户在不知情的情况下丢失运行态上下文）；只做提示。若仓库已有会话重载入口，可在提示里指向它（不新增自动化）。

## 5. 取舍

| 取舍 | 选择 | 理由 |
|---|---|---|
| 新设置 vs 复用 pi 原生文件 | 复用原生 `APPEND_SYSTEM.md` | pi-web 与 TUI 共享同一份指令；自造存储会与 pi 语义漂移（D2） |
| 仅全局 vs 含项目级 | 仅全局 + 只读覆盖提示 | 项目级需受信交互且**覆盖**全局，UI 会引入来源歧义；全局已覆盖用户痛点（D1） |
| 是否扩展生效范围 | 不扩展 | 会改 `chat-only.ts` / `subagent-prompt.ts` 既有语义与断言，风险大于收益 |
| 落点：SettingsPanel section vs 独立弹窗 | SettingsPanel section | 无需新入口按钮，与同类全局设置一致 |
| 写空 vs 删除文件 | 写空 | 语义等价但更可预期，避免误删 |

## 6. 风险与回滚

- **误以为子代理也生效**：R3 文案是硬要求（AC5）。
- **超长内容**：字节上限 + 只读显示字符数；这是费用与体验的保护线。
- **任意路径写入**：目标路径服务端固定，不取客户端输入（安全边界）。
- **`SettingsPanel.test.mjs` 源码正则**：新增 section 前先读该测试；如需新增断言则一并更新。
- **回滚**：删除 section 注册与 API 路由即可；`APPEND_SYSTEM.md` 是 pi 原生文件，回滚不会留下不可读的私有格式（最坏情况是文件里多了一段用户自己写的文字，用户可自行清理）。

## 7. 验证设计

- 新增 `lib/append-system.test.mjs`：读取（存在/缺失）、写入往返（含中文/emoji/末尾换行）、超上限拒绝、`projectOverride` 探测（存在+受信 / 存在未受信 / 不存在三种）、目标路径不接受外部输入。使用临时 agentDir（参考 `lib/subagent-settings.test.mjs` 的做法）。
- 路由层：参照 `app/api/subagents/settings/route.ts` 既有测试（若有）覆盖 403/415/400 分支。
- 组件：若 `SettingsPanel` 的既有测试对 section 列表做断言，则同步更新；不新增重型 UI 测试。
- 质量门：`tsc --noEmit`、`npm run lint`、`npm test` 三者退出码 0，计数对照记录到 `research/`。
- 端到端人工验证：改内容 → 保存 → 重载会话 / 新建会话 → 确认新指令在系统提示里生效（可用「请复述你收到的追加指令」验证）；打开一个存在项目级文件的仓库确认覆盖提示出现。
