# 桌面快捷键 Ctrl/Cmd+Shift+-/= 调整对话区字号

## Goal

在桌面浏览器中用 `Ctrl+Shift+-` / `Ctrl+Shift+=`（macOS 上 `Cmd+Shift+-` / `Cmd+Shift+=`）
以 **1px** 步长调整对话区字号，效果等同于设置页「聊天字体大小」滑块；并在设置页该选项旁显示
快捷键提示，让这个能力可发现。不改字号偏好本身的语义、存储、范围与应用链。

## Background（已核实的现状）

字号偏好只有一个入口，快捷键必须复用同一个 setter，不能另造一条写入路径：

| 事实 | 证据 |
|------|------|
| 唯一的偏好存储与 setter | `hooks/useChatAppearance.ts:92-104`（`setPreference` → `applyAppearance` → `localStorage.setItem`） |
| 字号是绝对值，默认 14，clamp `[12,24]` | `hooks/useChatAppearance.ts:11-13`、`clampChatContentFontSize`（`:39-43`） |
| CSS 载体 | `--chat-content-font-size` → `.chat-content` 的 `--chat-font-size-offset`（`app/globals.css`） |
| 设置页 UI | `components/SettingsPanel.tsx:322-355`（滑块 `step=1`、`min/max` 用常量、重置按钮） |
| 全局快捷键落点 | `hooks/useKeyboardShortcuts.ts`（Esc、Ctrl+Alt+N），由 `components/AppShell.tsx:882` 挂载 |
| 现有 a11y 约定 | 组件测试断言 `aria-keyshortcuts`（`components/ChatInput.test.mjs:694`） |
| 三语言文案 | `lib/i18n/messages/{en,zh-CN,zh-TW}.ts`（设置页字号相关 key 在 `settings.*` 段） |

已排除的干扰项：

- `lib/i18n/messages/*` 里 `settings.chatFontSize` / `fontSizeIncrease` 等 5 个 key 是 fork 早期
  「±按钮 + 相对 offset」时代的遗留文案，现已无引用（全仓 grep 只命中语言包自身）。本任务**不清理**
  它们（清理会扩大 diff 与回归面），新增提示使用新 key。
- 该能力属于对话区可见文本的**偏好**，不涉及任何排版表面，因此不触碰
  `calc(Xpx + var(--chat-font-size-offset, 0px))` 规则。

## 用户决策（2026-09-28，已确认，不再重新讨论）

1. **触发键**：`Ctrl+Shift+-` / `Ctrl+Shift+=`，且 macOS 上 `Cmd+Shift+-` / `Cmd+Shift+=` 同效
   （即 `ctrlKey || metaKey`）。**不**接受不带 Shift 的 `Ctrl+-` / `Ctrl+=`。
2. **步长**：1px，与设置页滑块 `step=1` 一致。
3. **可发现性**：设置页「聊天字体大小」项旁显示快捷键提示文案，三语言都要写。
4. **提示文案平台呈现（2026-09-28 追加）**：**固定文案，同时列出两套修饰键**——
   `Ctrl/⌘ + Shift + - / =`，不做平台探测（零 hydration 风险，macOS 用户看到正确修饰键）。
5. **浏览器层验收（2026-09-28 追加）**：断言写入 `e2e/chat-appearance.mjs` 但**不执行**；
   AC1 / AC3 / AC4 交由用户人工验收。该「已加入未运行」的事实必须写进
   `research/verification.md`，不得写成已验证通过。
6. **`Ctrl/Cmd+Shift+0` 恢复默认字号（2026-09-28 追加，用户提出）**：与 `-` / `=` 同族，
   仍要求带 Shift；恢复的是 `CHAT_CONTENT_FONT_SIZE_DEFAULT`（14px），且走**同一个**
   `setFontSize`，不新增常量副本。不带 Shift 的 `Ctrl+0` 仍是浏览器自身的缩放复位。

## 技术要点与已识别的风险（实现约束）

1. **必须 `preventDefault()`**：`Ctrl+Shift+=` 在 Chrome/Chromium 上同时也是浏览器「放大页面」。
   页面 `keydown` 在 Chrome/Firefox 可取消该默认行为；**Safari 常拦不住**（尤其 macOS 的 `Cmd`
   组合），Safari 用户按下去可能既改字号又缩放页面。这是接受的风险，需在提示文案与验证记录里
   如实说明，不得声称「所有桌面浏览器都可用」。
2. **不要只匹配 `e.key`**：Shift 按下时 `e.key` 在 US 布局是 `_`（`Shift+-`）与 `+`（`Shift+=`），
   在其他布局可能仍是 `-` / `=`。应优先用 `e.code`（`Minus` / `Equal`，并考虑数字小键盘
   `NumpadSubtract` / `NumpadAdd`），`e.key` 作为兜底集合。
3. **必须要求 `shiftKey`**，否则会抢走浏览器标准的 `Ctrl+-` / `Ctrl+=` 缩放（用户决策 1 明确
   不接受）。
4. **边界不越权**：clamp 仍由 `clampChatContentFontSize` 决定（12/24）。到达端点后再按不得写
   越界值，也不得因此把偏好重置为默认。
5. **快捷键是全局的**，在输入框 / 终端面板聚焦时也应生效；`Ctrl+Shift+C/V` 由
   `components/TerminalPanel.tsx:71-72` 自己处理，与本快捷键不冲突。这些键不是 Enter/Esc，
   因此 `isComposing` 规则不适用于本处。
6. **不能顺带修改**：偏好 key、默认值、范围、`app/globals.css` 的 offset 应用链、滑块本身行为。

## Requirements

- R1 桌面浏览器中按 `Ctrl+Shift+-`（macOS 亦可 `Cmd+Shift+-`）把对话区字号减 1px；
  按 `Ctrl+Shift+=` 加 1px；等价于把设置页滑块左右移动一格（含 localStorage 持久化与
  跨标签页/重新加载后的生效）。
- R2 到端点（12px / 24px）后继续按键不产生越界值，也不重置为默认值。
- R3 按键被消费：不让浏览器同时执行自身缩放默认行为（在能拦住的浏览器上）。
- R4 设置页「聊天字体大小」旁显示固定文案快捷键提示（`Ctrl/⌘ + Shift + - / =`），
  `en` / `zh-CN` / `zh-TW` 三语言齐备，不做平台探测。
- R5 不改动字号偏好的语义与存储契约（key `pi-chat-content-font-size`，默认 14，clamp `[12,24]`）。
- R6 为快捷键识别逻辑补上可复跑、无浏览器的自动化测试（纯函数 + 源码断言，
  沿用 `lib/*.test.mjs` 的 `node:test` + `jiti` 模式），并更新受影响的规范文档。
- R7 `Ctrl/Cmd+Shift+0` 把对话区字号恢复为默认值 14px（用户决策 6），效果与设置页滑块旁
  的「重置聊天字体大小」按钮一致；该组合必须被消费（`preventDefault()`），不得同时触发
  浏览器行为。

## 非目标（Out of Scope）

- 不带 Shift 的 `Ctrl+-` / `Ctrl+=`、`Ctrl+0` 重置、鼠标 `Ctrl+滚轮`。
- `Ctrl/Cmd+Shift+0` **属于**本任务（见 R7）；被排除的是不带 Shift 的浏览器缩放复位。
- 移动端手势 / 触摸缩放。
- 按键时显示当前字号的 toast / 浮层（用户选择了设置页提示，不是 toast）。
- 清理语言包中已无引用的 5 个遗留 `fontSize*` key。
- 修改滑块、字号范围、默认值或 CSS offset 应用链。

## Acceptance Criteria

- [x] AC1 按 `Ctrl+Shift+=` 一次，字号 +1；按 `Ctrl+Shift+-` 一次，字号 −1；连续按键线性步进，
      且与设置页滑块显示值、对话区实际计算字号三者一致（真实浏览器验收）。
      实现后自检通过（12→13→14→13，`--chat-content-font-size` 与 `localStorage` 同步），
      **用户 2026-09-28 人工验收通过**。
- [x] AC2 在 12px 下限继续按减号、24px 上限继续按加号，字号停在端点，`localStorage`
      （`pi-chat-content-font-size`）写入的值也在 `[12,24]` 内，不出现默认值回落。
      单元测试 + 实现后自检（下限按减号仍 12），clamp 仍由 `clampChatContentFontSize` 负责。
- [ ] AC3 macOS 上 `Cmd+Shift+-` / `Cmd+Shift+=` 与 Ctrl 组合同效（真实浏览器验收）。
      **本机为 Linux，未验证**；仅有单元测试覆盖 `metaKey` 分支与 Playwright 的 `Meta` 修饰键路径。
- [ ] AC4 快捷键在输入框聚焦时同样生效，且不触发页面自身的浏览器缩放（在可拦截的浏览器上）。
      前半句通过（聚焦 `.chat-input-textarea` 时步进生效，用户人工验收确认）；后半句未断言
      （页面读不到浏览器 zoom）。
- [x] AC5 快捷键识别是**纯函数**并有单元测试覆盖：`Minus`/`Equal`（含 `e.key` 为 `_`/`+` 的布局）、
      缺少 `shiftKey` 时不触发、数字小键盘行为与实现一致。
      `lib/chat-font-size-shortcut.test.mjs` 8 用例，`npm test` 全绿。
- [x] AC6 设置页提示三语言齐备，且带 `aria-keyshortcuts`（沿用 `ChatInput` 的既有约定）；
      语言包 key 在 `en` / `zh-CN` / `zh-TW` 中都存在。
- [x] AC7 门禁三件套退出码 0：`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test`。
- [x] AC8 相关规范（`.trellis/spec/frontend/` 的 hook/组件或 settings 文档）记录全局快捷键的
      注册位置、`preventDefault` 的理由与 Safari 的已知限制。
- [x] AC9 `Ctrl/Cmd+Shift+0` 恢复默认字号：单元测试覆盖 `Digit0` / `Numpad0`（含 Shift 下
      `e.key` 为 `)` 的布局）、不带 Shift 的 `Ctrl+0` 不触发；设置页提示与 `aria-keyshortcuts`
      同时包含该组合；真实浏览器自检从 15px 复位到 14px，**用户 2026-09-28 人工验收通过**。

## 验收状态（2026-09-28，实现完成后）

证据与命令原文见 `research/verification.md`。

| 项 | 状态 | 依据 |
|----|------|------|
| AC1 步进与三处一致 | **用户人工验收通过（2026-09-28）** | 真实浏览器冒烟：12→13→14→13；设置页与 CSS 变量、localStorage 同步 |
| AC2 端点 clamp | 通过 | 单元测试 + 上限/下限自检 |
| AC3 macOS `Cmd` | **未验证** | 本机 Linux；`Meta` 分支仅单元测试覆盖 |
| AC4 输入框聚焦 / 不触发缩放 | 部分 | 聚焦 composer 时生效；浏览器缩放无法从页面断言 |
| AC5 纯函数测试 | 通过 | `lib/chat-font-size-shortcut.test.mjs` |
| AC6 三语言 + aria | 通过 | `npm test` 的语言包与设置页断言 |
| AC7 门禁 | 通过 | `tsc` exit 0；`lint` 558 文件 0/0；`npm test` 1736 通过 0 失败 |
| AC8 规范 | 通过 | `hook-guidelines.md` 新小节 + Traps 15/16 |
| AC9 `Ctrl/Cmd+Shift+0` 复位 | **用户人工验收通过（2026-09-28）** | 单元测试（Digit0 / Numpad0 / `)` 回落 / `Ctrl+0` 不触发）+ 自检 15 → 14 |

### 人工验收结论（2026-09-28）

用户在 `http://localhost:8505/` 上按 AC1、AC4（输入框聚焦生效）与新增的 AC9 逐项操作，
**验收通过**。用户同时提出并确认了新增的 `Ctrl/Cmd+Shift+0` 复位行为（决策 6）。
AC3（macOS `Cmd` 实机）与 Safari 行为在本机 Linux 环境仍然**未验证**，两侧均已记入
`research/verification.md` 的未覆盖清单。

**未覆盖（已知，不再声称已自动验证）**：macOS `Cmd` 与 Safari 实机行为、浏览器自身缩放是否被
抑制、`e2e/chat-appearance.mjs` 新增断言的可运行性（按用户 2026-09-28 决定未执行）、
非 US 布局与数字小键盘实机按键。

## 验收方式（2026-09-28 用户确认）

- 必跑：`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test`（含本次新增的
  纯函数单元测试）。退出码必须为 0，AC7 以真实输出为准。
- 写入但不执行：`e2e/chat-appearance.mjs` 增加 keydown 断言（`Ctrl+Shift+-` / `Ctrl+Shift+=`
  步进、端点不越界、输入框聚焦时仍生效），本次**不运行** e2e 套件
  （`next dev` 与 `e2e` 共用 `.next/dev/lock`，且用户选择了人工验收）。
  该偏离必须在 `research/verification.md` 标注为「已加入未运行」。
- 人工验收：AC1（真实浏览器步进与三处一致）、AC3（macOS `Cmd` 组合）、AC4（输入框聚焦时生效、
  不触发页面缩放）。用户负责执行；本任务不得声称已由自动化验证通过。
- 环境限制，需在验证记录里如实写明：本机为 Linux，**macOS `Cmd` 组合与 Safari 无法在此验证**
  （Safari 拦截浏览器缩放不可靠是已知风险，见「技术要点」第 1 条）。

## Notes

- 轻量任务：PRD-only（`design.md` / `implement.md` 不强制）。
- 建议的三语言文案（实现时按此落盘）：
  - `zh-CN`：`快捷键：Ctrl/⌘ + Shift + - / =`
  - `zh-TW`：`快速鍵：Ctrl/⌘ + Shift + - / =`
  - `en`：`Shortcut: Ctrl/⌘ + Shift + - / =`
- 不写「仅桌面浏览器」之类限定语：快捷键只在有键盘时可用，这句话会误导移动端外接键盘用户。
