# 验证记录 — 桌面快捷键 Ctrl/Cmd+Shift+-/= 调整对话区字号

任务：`.trellis/tasks/09-28-chat-font-size-shortcut`
分支：`feat/chat-font-size-shortcut`，工作基点 `aaa8f32`（`docs(task): mark the status-line diagnostics as not retained`）
PR 目标分支：`personal`
日期：2026-09-28

## 改动文件

| 文件 | 改动 |
|------|------|
| `lib/chat-font-size-shortcut.ts` | 新增：纯函数 `chatFontSizeShortcutFromKey`（`step -1/+1` 或 `reset`）、`CHAT_FONT_SIZE_STEP`、`CHAT_FONT_SIZE_SHORTCUT_ARIA` |
| `lib/chat-font-size-shortcut.test.mjs` | 新增：8 个 `node:test` 用例（无浏览器） |
| `hooks/useKeyboardShortcuts.ts` | 在既有全局 handler 里最先匹配该组合：`preventDefault()` + `setFontSize(...)`（`0` 走 `CHAT_CONTENT_FONT_SIZE_DEFAULT`） |
| `components/SettingsPanel.tsx` | 字号滑块加 `aria-keyshortcuts` / `aria-describedby`，下面补一行提示 |
| `app/settings.css` | 新增 `.settings-chat-shortcut` |
| `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` | 新增 `settings.chatContentFontSizeShortcut` |
| `components/ChatAppearance.test.mjs` | 新增 3 个测试：setter 复用、设置页提示与 aria、三语言文案 |
| `e2e/chat-appearance.mjs` | `checkChatAppearance` 内新增快捷键与复位断言（**本次未执行**） |
| `.trellis/spec/frontend/hook-guidelines.md` | 新增「全局快捷键」小节 + Traps 15/16 |
| `.trellis/tasks/09-28-chat-font-size-shortcut/**` | 本文件与 PRD 验收状态 |

## 步骤 1：无浏览器门禁（必跑，已跑）

| 命令 | 结果 |
|------|------|
| `node_modules/.bin/tsc --noEmit` | exit 0，无输出 |
| `npm run lint` | `ESLint: No issues found`；`eslint . -f json` 覆盖 **558** 个文件，0 error / 0 warning |
| `npm test` | `tests 1736 / pass 1736 / fail 0`，`duration_ms 79812` |

`npm test` 基线为 1720 通过（上一任务 `09-28-mobile-status-line-clip` 的记录），本次新增
8 + 3 = 11 个用例；本机实测总数 1736（含既有子测试计数差异），失败 0。

**基线来源**（按 `quality-guidelines.md` 要求写明）：本机 checkout
`/home/xupeng/dev/personal/forked/agegr-pi-web`，依赖树为 `package-lock.json` 对应的 npm 树
（无 `node_modules/.pnpm/`、无 `node_modules/.modules.yaml`，即未混入 pnpm 树，
已按 `quality-guidelines.md` 的「识别特征」逐条确认）。

文件覆盖数 558；本任务**净新增** 2 个 lint 目标（`lib/chat-font-size-shortcut.ts`、
`lib/chat-font-size-shortcut.test.mjs`），其余改动文件本来就在覆盖范围内。与上一任务记录的
554 相差 4，其中 2 个不是本任务带来的（本任务开工前的同树基线未单独测量过，不臆测归因）。
**诊断数 0 error / 0 warning，与基线一致**，因此无需按规则级别 / 插件版本归因。

## 步骤 2：纯函数单元测试覆盖的边界

`lib/chat-font-size-shortcut.test.mjs` 断言（全部通过）：

- `Ctrl+Shift` 与 `Cmd+Shift`（`metaKey`）两个修饰键集合都返回 `-1` / `+1`；
- 物理键优先：`code: "Minus"` 即使 `key` 是 `_` / `?` / `=` 仍判减号，`code: "Equal"` 同理；
- 数字小键盘 `NumpadSubtract` / `NumpadAdd` / `NumpadEqual`；
- 无 `code` 的事件回落到 `key`（`-` / `_` / `=` / `+`），不相关 `key` 返回 0；
- `Ctrl/Cmd+Shift+0` 返回 `{ kind: "reset" }`（`Digit0` 与 `Numpad0`，以及 Shift 下 `key` 为
  `)` / `0` 的布局）；
- 不带 Shift 的 `Ctrl+-` / `Ctrl+=` / `Ctrl+0` 返回 `null`（浏览器自身缩放）；
- `altKey`（AltGr = Ctrl+Alt）与 `isComposing` 返回 `null`；
- 带 `code` 但不属于集合（`Digit5`、`Escape`）返回 `null`，即使 `key` 看起来对
  （`Shift+Digit5` 的 `)` 不得被当成复位）；
- `CHAT_FONT_SIZE_STEP === 1`，`CHAT_FONT_SIZE_SHORTCUT_ARIA` 与设置页实际写下的字符串一致。

## 步骤 3：实现后自检（真实浏览器，**非 e2e 套件**）

用户选择「断言写入 e2e 但不执行，浏览器行为人工验收」。为了不把明显会失败的实现交给人工验收，
实现完成后用一次性 Playwright 脚本（脚本在 `/tmp`，未入库）对**本机正在运行的 dev server**
（`next dev -H 0.0.0.0 -p 8505`，PID 2228408，本仓库既有进程，未重启、未新建）做了一轮冒烟，
与套件运行是两回事：

| 检查 | 实测 |
|------|------|
| 页面加载 | `agegr-pi-web - Pi Web`，无 `pageerror` |
| 设置页提示可见 | `getByText("Shortcut: Ctrl/⌘ + Shift + - / =")` → 可见 |
| 滑块的 `aria-keyshortcuts` | `Control+Shift+- Meta+Shift+- Control+Shift+= Meta+Shift+=` |
| 12px 下限按 `Ctrl+Shift+-` | 仍 12（clamp，不回落默认 14） |
| `Ctrl+Shift+=` | 12 → 13；`--chat-content-font-size` = `13px`；`localStorage` = `13` |
| `Cmd+Shift+=` / `Cmd+Shift+-` | 13 → 14 → 13（Playwright 的 `Meta` 修饰键路径） |
| `Ctrl+Shift+0`（14px 时） | 仍 14，`localStorage` = `14` |
| `Cmd+Shift+0`（15px 时，先按一次 `+`） | 15 → 14，`localStorage` = `14` |
| 不带 Shift 的 `Ctrl+=` | 字号不变（14），未抢浏览器缩放 |
| 不带 Shift 的 `Ctrl+0` | 字号不变（14），未抢浏览器缩放复位 |
| 焦点在 `.chat-input-textarea` 上按 `Ctrl+Shift+=` | 14 → 15，说明监听挂在 `window`、不依赖焦点 |
| 焦点在 composer 上时按 `Ctrl+Shift+0` | 15 → 14 |
| 刷新页面 | `--chat-content-font-size` = `14px`，`localStorage` = `14` |

复跑脚本与截图已留档（本仓库要求浏览器证据落在任务 `research/` 下）：

- `research/smoke-font-size-shortcut.mjs`（一次性 Playwright 脚本，目标固定为
  `http://127.0.0.1:8505`）
- `research/smoke-font-size-shortcut.log`（上述脚本的完整输出）
- `research/settings-shortcut-hint.png`（设置页「聊天字体大小」处的截图）

同一次浏览器检查里读到的提示行计算样式：`<p class="settings-chat-shortcut">`、
`color: rgb(94, 102, 115)`（`--text-dim`）、`font-size: 11px`、`font-family` 与同组
`.settings-chat-range-header output`（`14px` 数值）**完全一致**（Cascadia Code / JetBrains Mono /
Fira Code / … / monospace）；滑块的 `aria-describedby` 指向
`settings-chat-content-font-size-shortcut`，与提示行 `id` 一致。

**这轮冒烟不是验收证据**，且不能替代：

1. **本机是 Linux**：真实 macOS 的 `Cmd` 组合、以及 Safari 对 `preventDefault` 的忽略都没验证；
   Playwright 发送 `Meta+Shift+Equal` 只说明代码分支走到了 `metaKey`，与 macOS 浏览器行为无关。
2. **浏览器自身缩放是否被拦住**没有断言（页面读不到浏览器 zoom；Chromium 的
   `Ctrl+Shift+=` 默认行为在 `preventDefault()` 下被抑制是既有结论，未在本次实测中断言）。
3. `e2e/chat-appearance.mjs` 里新增的断言**一次都没被执行**。它们按套件的既有写法编写，
   但 `page.keyboard.press("Control+Shift+Minus" / "Equal")` 的键名与断言顺序在首次真正运行
   时可能需要微调——本任务不声称它们可用。
4. 真实用户的操作系统、输入法、键盘布局（非 US 布局、数字小键盘）没有覆盖。

## 步骤 4：为什么 e2e 套件不能在本机跑

- 本仓库的 `next dev` 通过 `.next/dev/lock` 保证同一 checkout 只有一个开发服务器；
  本机已有 `next dev -H 0.0.0.0 -p 8505`（PID 2228408）在运行，`npm run dev`（30141）
  启动后立即报 `⨯ Another next dev server is already running.` 并退出。
- `e2e/run.mjs` 自己启动开发服务器，需要先停掉该进程。用户 2026-09-28 选择人工验收，
  因此不为此中断本机开发服务器。

## 验收状态（2026-09-28）

| AC | 状态 | 依据 |
|----|------|------|
| AC1 步进与三处一致（滑块 / CSS 变量 / localStorage） | **实现后自检通过；待用户人工验收** | 步骤 3 的 12→13→14→13 与 `localStorage` 记录 |
| AC2 端点 clamp、不回落默认 | 单元测试 + 自检通过 | `ctrl+shift+minus at 12` 仍 12；clamp 由 `clampChatContentFontSize` 负责 |
| AC3 macOS `Cmd` 组合同效 | **未验证** | 本机 Linux；仅单元测试覆盖 `metaKey` 分支 |
| AC4 输入框聚焦时生效、不触发页面缩放 | 部分通过 | 聚焦 `.chat-input-textarea` 时步进生效（自检）；「不触发页面缩放」未断言 |
| AC5 纯函数识别逻辑 + 单元测试 | 通过 | `lib/chat-font-size-shortcut.test.mjs` 7 用例，`npm test` 全绿 |
| AC6 三语言提示 + `aria-keyshortcuts` | 通过 | 语言包测试 + 自检读到属性；渲染文案见步骤 3 |
| AC7 门禁三件套 exit 0 | 通过 | 步骤 1 |
| AC8 规范记录注册位置 / `preventDefault` 理由 / Safari 限制 | 通过 | `.trellis/spec/frontend/hook-guidelines.md` 新小节 + Traps 15/16 |
| AC9 `Ctrl/Cmd+Shift+0` 复位默认 | 单元测试 + 自检通过 | `Digit0` / `Numpad0` / `)` / 不带 Shift 的 `Ctrl+0`；自检 15 → 14 |

**未覆盖 / 需人工确认**：macOS `Cmd` 与 Safari 的真实行为、浏览器缩放是否被抑制、
`e2e/chat-appearance.mjs` 新增断言的可运行性、非 US 布局与数字小键盘的实机按键。

## 回滚点

单次提交即可回滚：删除 `lib/chat-font-size-shortcut.ts{,test.mjs}`、还原
`hooks/useKeyboardShortcuts.ts`、`components/SettingsPanel.tsx`、`app/settings.css`、
三个语言包与 `components/ChatAppearance.test.mjs` 的改动。字号偏好 key、默认值、范围与
`app/globals.css` 的应用链**完全未改**。
