# 组件约定

> pi-web 的 React 组件怎么写：客户端边界、文件解剖、props、组合与数据流、i18n、
> 样式渠道、可访问性、组件测试，以及已经踩过的坑。
> 每条规则都能在 `components/`、`hooks/`、`app/globals.css` 里找到对应实现。

## 文件解剖与客户端边界

### `"use client"` 判据

- 判据是**文件内是否调用 hook / 浏览器 API / 事件回传**，不是"是不是组件"。
  `components/` 43 个 `.tsx` 里 38 个带指令；不带的 5 个都是无状态展示/图标：
  `components/FileIcons.tsx`、`ProviderIcon.tsx`、`SystemPromptPanel.tsx`、
  `ThemeIcon.tsx`、`ThinkingIcon.tsx`。
- 现有指令均放在文件首行，新文件沿用（`components/MarkdownBody.tsx:1`）；这不是说框架禁止前置注释。
- `hooks/` 下 11 个文件**全部**带指令，新 hook 默认加；`app/login/page.tsx` 是 app 中唯一带指令的文件。
- 需要 `t` 但不想进 client 边界时把 translator 当 prop 传
  （`components/SystemPromptPanel.tsx:1-7`）。不要 `import { useI18n }` 假装纯组件。

### import 顺序（无 lint 强制，沿用所在文件）

指令在 imports 前，React 通常靠前；hooks、lib、同目录组件之间没有统一排序。
`components/MessageView.tsx:1-30` 先导入同目录组件再导入 lib/hooks；
`components/ChatMinimap.tsx:1-13` 的 CSS Module 在最后。不要为套用假定顺序重排现有 imports。
`import React, { useRef } from "react"` 与 `import { Children } from "react"` 并存（未统一）；
类型侧以 `import type { ReactNode } from "react"` 为主。

### export 风格

- **零默认导出**：`components/` 下 `export default` 0 次，AST 导出的函数声明 102 个（只统计 `.tsx`，含 async）。
- memo 用 `export const X = memo(function X(...))`（`components/MessageView.tsx:302`、
  `ChatMinimap.tsx:141`、`MermaidBlock.tsx:269`）。
- `forwardRef` 有两处：`components/ChatInput.tsx:640` 与 `components/FileExplorer.tsx:521`；
  都导出供父组件使用的 handle 类型（如 `ChatInput.tsx:102 ChatInputHandle`）。
- 需要被单测直接调用的**纯函数可具名 export**（`MessageView.tsx:79 getTokenEstimateText`、
  `MermaidBlock.tsx:21 downloadMermaidSvg`）；内部子组件默认不 export
  （`MessageView.tsx:343/643/928/1069`）；`MessageView.tsx:948 ThinkingBlock` 则有导出供其他消费者使用。

### 文件内组织（不是固定顺序）

```
"use client" → imports → [导出类型/handler 类型] → [私有 interface Props] → [模块级常量]
→ [模块级纯 helper] → [私有子组件 function Xxx] → [导出主组件] → [导出纯函数（供测试）]
```

代表：`components/TurnWrittenFiles.tsx`（类型 `:18` → 常量 `:23-24` → 私有 `ActionButton:26`
→ 主组件 `:55`）；`components/MessageView.tsx`（常量 `:63/:113/:119` → helper `:64/:121/:256`
；导出主组件 `:302` 在私有子组件 `:343/:643/:928/:944/:1069` 之前，纯函数 `:79/:237/:269` 穿插其间）。

### 注释

JSDoc 只用来说明**跨文件契约与反直觉决策**：`components/FileIndexContext.tsx:7-11`
（为何用 context、provider 缺席时如何降级）、`components/AnsiText.tsx:5-15`
（为何 `dangerouslySetInnerHTML` 安全）、`components/MessageView.tsx:117-119`
（为何需要 `SafeMarkdownBody`）。注释以英文为主，但组件也有中文先例
（`components/ChatWindow.tsx:270`）；中文 JSDoc 见 `hooks/useI18n.tsx:36-41`。

## Props 约定

### 类型写法三种并存，按体量选

| 写法 | 出现数 | 适用 |
|------|--------|------|
| 内联对象字面量类型 | 常用（也用于内部 helper 参数） | 小/中型组件主力（`components/TurnWrittenFiles.tsx:55-58`） |
| 文件私有 `interface Props`（**不 export**） | 16 个文件 | props ≳5 或需要 `Pick<Props, ...>`（`SettingsPanel.tsx:34-43`） |
| `interface XxxProps` | 11 处 | 被多处复用的"库化"组件（`SettingsUi.tsx:8`、`ImagePreview.tsx:6`） |

props 类型基本不 export，全仓库只有 `components/PathText.tsx:8 export interface PathTextProps`
一例（以及必须导出的 `ChatInputHandle`）。
复用父组件 props 的两种手段都在用：`Pick<Props, "sessionId" | ...>`（`SettingsPanel.tsx:65`）、
`React.ComponentProps<typeof MarkdownBody>`（`MessageView.tsx:131`）。
透传原生属性时交叉原生 attr 类型、`...props` 直接 spread、`className` 用
`[...].filter(Boolean).join(" ")` 合并（`components/SettingsUi.tsx:93-99`）。

### 命名与默认值

- 回调 prop 通常用 `onXxx`，内部事件处理常用 `handleXxx`；不是所有 prop 都是回调。
- 跨组件传递的 handler 类型可以具名 + JSDoc：
  `components/TurnWrittenFiles.tsx:18 export type OpenWrittenFileHandler`（全仓库唯一一例）。
- 可选 = `?:`；**默认值写在参数解构里**，不用 `defaultProps`：
  `components/SettingsUi.tsx:23-27`（`closeLabel = "Close", width = 900`）、
  `ThinkingIcon.tsx:1`（`size = 14`）。
- 可选回调统一 `?.` 调用：`components/TurnWrittenFiles.tsx:124 onOpenFile?.(...)`。
- 空数据**在组件内部直接返回 `null`**：`components/TurnWrittenFiles.tsx:62`。
- 内部 DOM ref 命名 `<thing>Ref`；中间组件可把 ref 当普通 prop 传
  （`components/ChatWindow.tsx:57 chatInputRef?: React.RefObject<ChatInputHandle | null>`）。
- 内联回调 ref 必须是**语句块、不返回值**（React 19 会把返回的函数当 cleanup）：
  `components/ChatInput.tsx:2087`。

## 组合与数据流

### 数据默认走 props，即使穿透三层

`ChatWindow` → `MessageView` → `TurnWrittenFiles` 的 `onOpenFile` 是三层直传
（`components/ChatWindow.tsx:1085`、`components/MessageView.tsx:234/875-877`）。
**这是默认做法，不是待优化的坏味道。**

`components/` 只有 **1 个** context：`components/FileIndexContext.tsx`；加上 `hooks/useI18n.tsx:18`
的语言 Context，产品源码共 **2 个**。文件索引 Context 的理由写在它的 JSDoc 里
（`:7-11`）：需要分发给深层 renderer，且 `MarkdownBody` 在聊天之外（文件预览）也会用，
provider 缺席时默认 `null` 保持原有渲染。决策规则（从代码反推）：

- 单一数据源 + 穿透 2 层以上 + 存在"provider 缺席"降级语义 → context
  （`components/ChatWindow.tsx:1029` 只包住对话区；
  `components/MarkdownBody.tsx:125/140` 在 `<a>` 内部主动用 `lookup={null}` 覆盖）。
- 只有"全局事件要回调某个深层组件" → **module-level registry**，不是 context：
  `hooks/useKeyboardShortcuts.ts:9-17 registerAbortHandler`。
- 一般组件数据优先 props；其他共享状态的选择见 [state-management.md](./state-management.md)。

### 数据 → 视图分派

`components/MessageView.tsx` 是主范例，分派器**只做 `if (x.type === ...) return <Child .../>`，
不含样式**：

```
MessageView (:302, memo)          按 message.role 分派
  ├─ UserMessageView (:343)
  ├─ AssistantMessageView (:643)
  │    └─ BlockView (:928)        按 block.type 分派
  │         ├─ TextBlock (:944) → SafeMarkdownBody (:131) → MarkdownBody
  │         ├─ ThinkingBlock (:948)
  │         └─ ToolCallBlock (:1069)   自己配对 toolResult
  └─ CustomMessageView / CompactionMessageView / BashExecutionView
```

叶子组件才做样式与 i18n（`TextBlock:944`、`ToolCallBlock:1069`）。
新增一种消息/block 类型 = 改分派器 + 加一个叶子。

### compound component 与 children

`components/SettingsUi.tsx` 一个文件导出 20+ 个 `Config*` 子组件（`:19`–`:249`），
共享 `config-*` CSS 类前缀，被 `ModelsConfig` / `AgentsConfig` / `SkillsConfig` / `PluginsConfig` /
`SettingsPanel` 消费；子组件极薄（3–8 行的 `div`/`button` 包装），menu/focus/键盘留给消费方。

`children` 声明只有 28 处，主要在壳组件里（`SettingsUi.tsx:72-86`）。
**组合优先用显式 props**，`children` 留给真正"不知道自己会包什么"的壳。
能 1 文件 1 职责就别拆目录 —— `components/` 是平铺的（`components/PathText.tsx` 49 行、
`AnsiText.tsx` 20 行、`ThinkingIcon.tsx` 14 行）。

## i18n 文案

- 默认 `const { t } = useI18n()`（`hooks/useI18n.tsx:80`），provider 在 `app/page.tsx:8-10`
  （`app/login/page.tsx:87` 单独一层）。**不在 provider 内会抛错**（`hooks/useI18n.tsx:82`）。
- 不能调 hook 时传 prop + 局部声明类型（`components/SystemPromptPanel.tsx:1`、
  `ToolDefinitionsPanel.tsx:6`、`TrellisSubagentRecords.tsx:19`）；
  更强的推导写法是 `type Translate = ReturnType<typeof useI18n>["t"]`（`FileExplorer.tsx:17`）。
  纯函数也接收 `t`：`components/ChatWindow.tsx:77 phaseLabel(phase, t)`。
- 所有可见文案、`title`、`aria-label`、输入框提示文本都要经 `t()`。
- key 命名 `"<feature>.<camelCaseLeaf>"`。封闭集合可动态拼接，例如
  `components/TurnWrittenFiles.tsx:103 t(\`chat.fileType.${getFileCategory(filePath)}\`)`；
  `components/AgentsConfig.tsx:499`、`AgentSessionPanel.tsx:145` 也有同型写法。
- **三语必须同时改**：`lib/i18n/messages/{en,zh-CN,zh-TW}.ts` 的 key 集合与占位符集合必须与
  `en` 完全一致，由 `lib/i18n/registry.test.mjs:39-54` 强制（唯一豁免是
  `files.conflictSummary` 的 `countSuffix`）。占位符只用 `{name}`，禁止拼接翻译片段。

## 样式约定

| 手段 | 规模 | 何时用 |
|------|------|--------|
| 内联 `style={{...}}` | 1021 处 | 默认：条件样式、与 props/state 联动的数值、一次性布局 |
| 全局 class | 357 处 | 需要 hover/focus/媒体查询/伪元素/CSS 变量派生；定义在 `app/globals.css`、`app/settings.css` |
| CSS Module | **1 个文件**（`components/ChatMinimap.module.css`） | 大量结构性样式 + 伪类/属性选择器/`grid-template` |
| 内联 `<style>` 块 | 3 个文件 | 历史遗留，**不推荐新增** |

- 内联对象字面量直接写在 JSX 里，键用 camelCase，长度可用 React 的数值 px 简写，也可用带单位的字符串
  （`components/TurnWrittenFiles.tsx:111-116`）。
- 主题颜色/边框优先走 CSS 变量（`var(--border)`、`var(--bg-subtle)`、`var(--text-muted)`）；
  既有硬编码包括增/删语义色（`components/TurnWrittenFiles.tsx:23-24`）与图标状态色
  （`components/ThinkingIcon.tsx:6-8`）；不要把现状描述成绝无例外。
- 给 CSS 传自定义属性时强断言 `as CSSProperties`（`components/SettingsUi.tsx:29-34`）。
- 类名 kebab-case + 功能前缀（`config-panel-root`、`markdown-body`），状态修饰用
  `is-*` / `has-*`。CSS Module 里用 `data-*` 选择器而不是 JS 拼类名
  （`components/ChatMinimap.module.css:31 .turn[data-located="true"]`）。
- Tailwind 可用但非主流（`app/globals.css:2` + `:33-47` 的 `@theme` 已接好）。
  修改时沿用所在组件的样式渠道，不做无关的 Tailwind 迁移。

### 消息列与输入框的横向对齐

- `components/ChatWindow.tsx:1039-1050` 的滚动列预留 `scrollbar-gutter: stable`，并与
  `components/ChatMinimap.tsx` 的刻度轨道并排。轨道即使暂不可见也保留宽度，否则短对话切换到
  可滚动时消息列会横向移动。
- 轨道宽度与列内边距**只有一处定义**：`lib/chat-layout.ts`（`CHAT_MINIMAP_WIDTH` /
  `CHAT_COLUMN_PADDING` / `chatColumnRightInset()`），`ChatWindow.tsx`、`ChatInput.tsx`、
  `ChatMinimap.tsx` 全部从这里取。消息列在轨道旁边滚动，而 composer 与空会话页那些整宽 wrapper
  跨满整个对话区、把轨道算作右内边距，两边必须由同一个值推导；轨道从 36px 收到 24px 时，
  `ChatInput.tsx` 里一份写死的 `52px`（= 36 + 16）没跟着改，composer 整体左移 12px、与消息列
  错开 6px，只有 e2e 的 `checkChatColumnAlignment()` 抓到了——改轨道宽度必须同时检查这里。
- `components/ChatWindow.tsx` 在布局阶段测量 `scroll.offsetWidth - scroll.clientWidth`，
  将实际槽位宽度设为根节点的 `--chat-scrollbar-gutter`；`components/ChatInput.tsx` 的右
  padding 在小地图预留宽度之外加上此变量。不要写死 10px：`app/globals.css:518-522`
  在粗指针设备将滚动条设为 6px，原生滚动条宽度也可能不同。
- `e2e/chat-appearance.mjs:3 checkChatColumnAlignment()` 同帧比较消息内容与 composer 的左右
  边界；长/短会话、变为可滚动、内容展开、触屏与窄屏均需保持相同的横向坐标。

### 对话区字号：必须走 offset 变量

```css
/* app/globals.css:699-700 */
.chat-content { --chat-font-size-offset: calc(var(--chat-content-font-size, 14px) - 14px); }
```

**对话区正文里的可见文本，字号必须写成 `calc(<设计字号>px + var(--chat-font-size-offset, 0px))`**，
且 fallback 不能省（`MessageView` 在 `.chat-content` 之外也会渲染，如
`components/ChatWindow.tsx:1248-1250` 的 `bashExecution`；缺 fallback 会算出 `calc(12px + )`）。
使用点：`components/MessageView.tsx` 12 处、`TurnWrittenFiles.tsx:38/88/137/143/156/177`、
`MermaidBlock.tsx` 2 处、`app/globals.css:657/710/852`。
不要写死 `px/rem`，也不要把 offset 套到非对话区域。

**例外：界面外壳是固定字号，不读 offset。** 判据是元素的职责与视觉基准，而不是它的 DOM 祖先：
属于应用外壳（和左侧栏同一层）、需要与左侧栏字号一致的元素不受上面规则约束。注意小地图预览
虽然物理上位于 `.chat-content` 内部（`components/ChatWindow.tsx:976/1287`），继承得到
`--chat-font-size-offset`，但它属于外壳，因此不走 offset。

当前唯一实例是小地图预览面板（`components/ChatMinimap.module.css` 的 `.preview`）：轮次标题 12px、
h1 与正文 12px、h2 / h3 11px、序号与 `.toolBadge` 10px 都是固定 `px`，不跟随
`--chat-content-font-size`。理由是预览面板镜像左侧栏会话列表（12px 标题 / 11px 元信息 / 10px
小标签），若跟随对话区字号，同一层外壳会出现两套字号。证据见
`.trellis/tasks/09-28-minimap-typography/research/verification.md`（字号与行高的期望值与门禁实测值，
以及按用户决定未运行的 e2e 断言）和用户 2026-09-28 的决定。行高（h1 26 / h2 24 / h3 22 /
轮次标题 24）由 `e2e/chat-appearance.mjs` 的 `checkMinimapTypography()` 锁住，改行高必须同步改断言。

### 小地图：刻度轨道与 Notion 式大纲

- 轨道（`components/ChatMinimap.tsx` 的 `MINIMAP_WIDTH`）是**刻度**而不是圆点：一个大纲行 = 一条
  2px 圆角横线，`data-level` 决定宽度（h1/正文 16px、h2 12px、h3 8px），靠 CSS 的
  `margin-inline-start: auto` 右对齐，因此越深的层级左边越缩进而右边缘对齐。这套尺寸与
  2px + 12px 的固定间距来自 Notion 的文档大纲轨道（`app.notion.com` 实测：`height:2px;
  border-radius:2px; width:16px/12px; margin-inline-start:0/4px; background: rgba(28,19,1,0.11)`，
  当前项换成深色实色），改样式前先用 CDP 复核，别凭印象调。轨道容器本身**不画任何东西**：没有
  背景、没有左边框，只有一列悬空刻度，用户明确否决过带背景/边线的"右边长长一条"；那 24px 仍
  作为 flex 兄弟节点预留宽度，消息列因此不贴着窗口边缘，但视觉上不该看出有一条独立栏目。
- 轨道行与预览行出自同一个 `NodeInfo` 列表：只要某轮次的回答有大纲行，该轮次的标题行就只出现在
  面板里；回答完全没有大纲（纯工具调用/代码块）时，标题行本身充当一条刻度，避免轨道整段空白。
- 大纲行与预览面板的渲染共享同一个过滤规则 `isOutlineHeading()`（`lib/markdown-outline.ts`，
  深度 ≤3 的根级 heading，无 heading 时退回第一段）。改规则必须同时改
  `remarkPreviewOutline()`，否则刻度会指向面板里不存在的行。
- `tickSpacing()` 是纯函数：起点是 Notion 的**固定顶锚** `RAIL_TOP_ANCHOR = 130`（不是垂直居中，
  用户明确要求"固定 130px 顶锚"），行数少时保持 14px 固定间距，装不下就从锚点往下压缩到刚好
  铺满，`fillsHeight` 随之决定悬停命中半径。只有轨道本身比锚点还短时锚点才让位，绝不裁掉刻度
  ——看不见的刻度等于点不到的标题。改布局先改它并补 `components/ChatMinimap.test.mjs`。
- 面板的开关在鼠标与触摸上是两套：`useHoverCapable()`（`hooks/useIsMobile.ts`，`(hover: hover)`）
  为真时鼠标**停在实际刻度行区域才展开**（`HOVER_OPEN_DELAY_MS = 120`，避免只是路过右边缘就闪出
  240px 面板），快速离开会取消计时。全高父容器保留布局和事件处理，但设 `pointerEvents: "none"`，
  上下空白区域穿透、不触发展开；每个 `data-minimap-node-index` 行设 `pointerEvents: "auto"`，
  以 24px 列宽、`nodeGap` 行高提供合理命中区域，而不是只命中 2px 横线。预览 CSS 保持
  `pointer-events: auto`，刻度行和预览的事件仍由父容器处理；面板是其子节点，所以从刻度移进面板
  不算离开、保持打开，行点击不会误关，离开到空白区域才收起。此时点击刻度不再切换（`togglePreview`
  直接返回），否则展开状态下一点就关。触摸设备保持刻度点按切换，`mouseenter` 在触摸上只是点按的
  一部分，不能当作悬停。
- 加载窗口从半途开始（首个条目是 assistant，提问在上方未加载）时，`measureNodes()` 会为这段
  回答合成一个轮次（`userMessage: null`，面板标题行显示 `…`），否则长会话的窗口一旦错过提问，
  轨道与面板都会整段空掉。

## 可访问性

### 实际使用的模式

- **弹层首选原生 `<dialog>` + 手写焦点归还**：`components/ImagePreview.tsx:22-39`
  （`showModal()` → `closeButtonRef.current?.focus({ preventScroll: true })`；cleanup 还原
  body overflow、`dialog.close()`、`trigger?.isConnected && trigger.focus(...)`）。
  触发器上 `aria-haspopup="dialog"` + `aria-expanded`；`onCancel` 里 `preventDefault()` 自管关闭。
- **自研弹层**：`role="dialog"` + `aria-modal="true"` + `aria-label`
  （`components/SettingsUi.tsx:39-41`，`embedded` 时三个属性一起退化为 `undefined`；
  同型 `ProjectTrustDialog.tsx:38-40`）。
- **折叠/展开必须 `aria-expanded` 与 `title`/`aria-label` 成对**：
  `TurnWrittenFiles.tsx:166-167`、`MessageView.tsx:466-468`。
- **异步状态用 `role="status"` / `role="alert"`**，不引入 toast 库：
  `ExtensionStatusBar.tsx:43-46`（`aria-label` 用去 ANSI 的纯文本）、`ChatInput.tsx:560`。
- **装饰性 svg 一律 `aria-hidden="true"`**（`components/ThinkingIcon.tsx` 就是这种组件）。

### 三条硬约束

1. **可聚焦交互元素被 `aria-hidden` 隐藏时，也要用 `tabIndex={-1}`（或 `disabled`）移出键盘导航**，否则"看不见但能 Tab 到"：
   `components/AppShell.tsx:1636`、`ChatInput.tsx:2616`；
   被 `components/AppShell.mobile-toolbar.test.mjs:52-54` 锁住。
2. **任何新的 Enter/Esc 快捷键都要检查 `isComposing`**（CJK 输入法回车选字会被误触发）：
   `components/ChatWindow.tsx:403 if (event.key !== "Escape" || event.isComposing) return;`、
   `ChatInput.tsx:1603`。
3. **Minimap 的当前定位项用 `data-located` + CSS 标示**（`components/ChatMinimap.module.css:31`）；
   这是定位状态，不是键盘 focus 的证据，不要据此替代焦点可见性检查。

### 谁来兜住 a11y

ESLint 只有 6 条 `jsx-a11y/*` 规则，且**全部是 warn 而非 error**：`alt-text`、`aria-props`、
`aria-proptypes`、`aria-unsupported-elements`、`role-has-required-aria-props`、
`role-supports-aria-props`。**没有** `no-static-element-interactions` /
`click-events-have-key-events`，所以"点遮罩关闭"这类 `div onClick` 不会被 lint 拦。
补充证据是**组件测试里的 `aria-*` 检查**（11 个测试文件包含 `aria-`，如
`ChatInput.test.mjs:694` 断言 `aria-keyshortcuts="Alt+Enter"`）→ 新增 a11y 行为要同时加断言。

## 组件测试

- 测试与被测文件**同目录同前缀** `*.test.mjs`，`node --test` 跑（`npm test`）；
  没有 jsdom、没有 testing-library。
- 两种风格并存：**渲染断言**（11 个文件用 `react-dom/server` 的 `renderToStaticMarkup`，
  如 `components/TurnWrittenFiles.test.mjs`）与**源码结构断言**（31 个文件
  `readFile(new URL("./X.tsx", import.meta.url))` 后正则匹配）。
- `.tsx` **必须**用 `jiti` 且带 `{ jsx: { runtime: "automatic" }, tsconfigPaths: true }`，
  并通过 `@/` 别名加载 `I18nProvider`，与组件内部一致 —— 直接复制
  `components/TurnWrittenFiles.test.mjs:7-15` 的引导块，不要手写。
- `npm test` 的 glob 只覆盖 `app/ components/ hooks/ lib/ public/`。

## 常见错误

1. **`react-markdown` 自定义 renderer 必须 `delete props.node`**：`node` 是 mdast 元数据不是
   DOM 属性，spread 到 DOM 会产生 React 警告。`components/MarkdownBody.tsx:70/102/106/110/114/119/145`、
   `FileViewer.tsx:1744/1761`；测试断言 `doesNotMatch(html, /\snode=/)`。
2. **`rehype-sanitize` 会剥掉 rehype 注入的内容，插件顺序不能改**：`lib/markdown.ts:375-380`
   固定为 `rehypeRaw` → `[rehypeSanitize, markdownSanitizeSchema]` → `rehypeKatex`。
   sanitize 必须在 katex 之前，否则 KaTeX 的 `math-inline`/`math-display` class 被剥；
   schema 已为 `file:` 协议与 code class 扩权（`lib/markdown.ts:9-20`），
   `markdownUrlTransform`（`:22`）也必须显式放行 `file:`，否则 `file://` 链接变成 `href=""`。
3. **`remark-gfm` 的 `singleTilde` 必须关**：`lib/markdown.ts:362`。单个 `~` 是 CJK 数值区间
   分隔符（"5~7U"），GFM 默认当删除线静默吃掉（issue #385）。
4. **巨型消息不能走 markdown 管线**：`components/MessageView.tsx:119 MAX_MARKDOWN_CHARS = 100_000`，
   超过阈值的 `SafeMarkdownBody` 降级成"点击揭示的纯文本 `<pre>`"。
   新增 markdown 渲染入口必须经过它或自带等价保护。
5. **工具结果默认折叠**：`components/MessageView.tsx:1071 const [expanded, setExpanded] = useState(false)`
   （`ToolCallBlock`），`ThinkingBlock:956` 同型。
   折叠状态**仍要展示摘要**（`getToolPreview(block)`、`duration`），不是整块隐藏。
6. **已配对的 `toolResult` 不要单独渲染**：`components/MessageView.tsx:309-312`。
   历史上"配对结果渲染两遍"是已知坑。
7. **`memo` 的自定义比较器必须随 props 同步更新**：`components/MessageView.tsx:323-341`
   逐个字段列出。给 `MessageView` 加 prop 却忘了加进比较器 → "UI 不刷新"的幽灵 bug。
8. **`react-markdown` 的 `components` 对象身份要稳定**：`components/MarkdownBody.tsx:49-153`
   用 `useMemo`（注释："Stable renderer identities keep stateful blocks mounted across message
   hover updates"）。在 render 里内联新建会让 Mermaid/代码块每次 hover 重新挂载。
9. **组件测试的双 React 实例**：测试入口若用原生 `import React from "react"`，而组件树经
   `jiti` 加载，会产生两个 React 实例与两个 `I18nContext`，所有测试报
   `useI18n must be used inside I18nProvider`。根因与修法见 `git show 5f74a19`（#588）。
10. **`dangerouslySetInnerHTML` 只允许用在已转义/已净化通道**：`components/AnsiText.tsx`
    （`ansi_up` 默认转义实体）、`MermaidBlock.tsx`（mermaid 自渲染 SVG + `securityLevel: "strict"`）。
    新代码要用它必须在同一处注释里说明"为什么安全"。
11. **工具/扩展输出的净化放在组件边界**：`components/ExtensionStatusBar.tsx:8
    sanitizeExtensionStatusText` 规范空白与换行，保证状态栏单行稳定。
12. **React 19 的回调 ref 不能返回值**：`components/ChatInput.tsx:2087/2203/2338` 都是语句块；
    返回赋值表达式会产生不合法的 ref 返回类型；`element.focus()` 返回 void，不能把它误称为 cleanup 函数。
