# 组件约定调研（component-guidelines.md 语料）

> 目的：为 `.trellis/spec/frontend/component-guidelines.md` 提供**代码实证**。
> 时间：2026-08-27（bootstrap task `00-bootstrap-guidelines`）。
> 方法：只读扫描 `components/`（42 个 `.tsx` + 3 个 `.ts`）、`hooks/`、`lib/i18n/`、`app/globals.css`、`eslint.config.mjs`、`package.json`、git 历史。
> 所有统计口径写在结论后面，可复核。

---

## 0. 结论摘要（可直接落 spec 的硬事实）

| 事实 | 证据 |
|------|------|
| `components/` 下**零默认导出**，101 个具名 `export function`，0 个 `export default` | `grep -rn "^export default" components/` → 0 |
| 42 个 `.tsx` 中 37 个第 1 行是 `"use client"`；剩余 5 个是纯展示/无 hook 组件 | `components/FileIcons.tsx`、`ProviderIcon.tsx`、`ThemeIcon.tsx`、`ThinkingIcon.tsx`、`SystemPromptPanel.tsx` |
| props 类型两种写法并存：**16 个文件用文件私有 `interface Props`**，63 个导出函数用**内联对象字面量类型** | `grep -rn "^interface Props" components/*.tsx` |
| 状态与交互全部走自研 hook + `createContext`，**没有任何状态库**（无 redux/zustand/jotai/swr/react-query） | `package.json` dependencies |
| 样式主渠道是**内联 `style={{}}`**（1021 处）> 全局 class（`className=` 357 处，含 tailwind 11 处）> CSS Module（仅 1 个文件）> 内联 `<style>`（3 个文件） | 见 §4 统计 |
| 所有可见文案、`title`、`aria-label`、`placeholder` 都经 `useI18n().t()`；三语 key 与占位符一致性由测试强制 | `lib/i18n/registry.test.mjs:39-54` |
| a11y 由 ESLint 的 6 条 `jsx-a11y/*` 规则 + 组件测试里的源码/`aria-*` 断言共同保障 | `eslint.config.mjs`，`eslint --print-config` 输出 |
| 组件测试有**两种风格**：11 个用 `renderToStaticMarkup` 做渲染断言，29 个直接读源码做结构断言 | `grep -rln renderToStaticMarkup components/*.test.mjs` → 11；`grep -rln 'readFile(new URL("./' components/*.test.mjs` → 29 |

---

## 1. 组件文件解剖

### 1.1 `"use client"` 何时加、加在哪一行

- **永远在第 1 行、第 1 个字符**（无空行、无注释前缀）。证据：所有含该指令的文件首行即 `"use client";`，例如
  - `components/TurnWrittenFiles.tsx:1`
  - `components/MarkdownBody.tsx:1`
  - `components/FileIndexContext.tsx:1`
  - `components/ChatInput.tsx:1`
  - `components/SettingsPanel.tsx:1`
  - `hooks/useI18n.tsx:1`、`hooks/useKeyboardShortcuts.ts:1`、`hooks/useChatAppearance.ts:1`
- **判据 = 文件内是否使用 hook / 浏览器 API / 事件回传**，而不是"是不是组件"。反例：
  - `components/SystemPromptPanel.tsx`（58 行）**没有** `"use client"`，因为它不调用任何 hook，而是把 translator 以 `translate: Translate` prop 注入（`components/SystemPromptPanel.tsx:1-7`）。
  - `components/ThinkingIcon.tsx:1`、`components/FileIcons.tsx:4`、`components/ProviderIcon.tsx:45`、`components/ThemeIcon.tsx:3` 同理：纯 SVG/图标工厂，无 hook。
  - 显式核对：这 5 个文件的 `grep -c 'use[A-Z]'` 全部为 0。
- 一句话规则：**"有 hook 才有 `use client`，纯渲染 helpers 不写；需要 t 就把它当 prop 传进来（或让它留在 client 树里被 import 进去）"**。

### 1.2 import 顺序（实测的稳定习惯）

所有文件遵循同一松散顺序（无空行分组、无 import 排序 lint 强制）：

1. `"use client";`
2. `react` 本体
3. 第三方包（`react-markdown`、`mermaid`、`ansi_up`、`next/image` …）
4. `@/hooks/*`
5. `@/lib/*`
6. `./SiblingComponent`（相对同级组件，一律 `./`，且**排最后**）
7. `import styles from "./X.module.css"`（若需要）

证据：
- `components/MarkdownBody.tsx:1-11`：`react` → `react-markdown` → `@/lib/*` → `./FileIndexContext` → `./PathText` → `./MermaidBlock`。
- `components/ChatWindow.tsx:1-30`：`next/image` + `react` 混在第三方段，随后 `@/lib/*`，然后 `./MessageView`…`./TurnWrittenFiles`。
- `components/ChatMinimap.tsx:1-16`：`react` → `react-markdown` → `rehype-katex` → `@/lib/*` → `@/hooks/useI18n` → `import styles from "./ChatMinimap.module.css"`（CSS Module import 放最后）。
- `components/ChatInput.tsx:3` 直接 `import React, { useRef, ... } from "react"` —— 与 `MarkdownBody.tsx:3` 的 `import { Children, ... } from "react"` 两种风格并存，**没有统一**。`React.ReactNode`（7 处）与 `import type { ReactNode }`（46 处）也并存，**以具名 type import 为主**。

### 1.3 export 风格

- **只用具名导出**：`export function Xxx`（普通组件）、`export const Xxx = memo(function Xxx(...))`（需要 memo 的重组件）、`export const Xxx = forwardRef<...>(function Xxx(...))`（需要 imperative handle）。
- 统计：`grep -rn "^export function" components/*.tsx | wc -l` → 101；`grep -rn "^export default" components/` → **0**。
- memo 包装的 4 个例子：`components/MessageView.tsx:302`、`components/MermaidBlock.tsx:269`、`components/ChatMinimap.tsx:141`；`components/ChatInput.tsx:640` 是 forwardRef。
- 同文件常常顺带导出**纯函数**（供测试直接调用，不渲染）：`components/ChatInput.tsx` 导出 `canClearBuiltinCommandInput`、`filterModelOptions` 等（见 `components/ChatInput.test.mjs:14` 的 import 列表）；`components/MessageView.tsx:79 getTokenEstimateText`、`:237 getModelDisplayName`、`:269 replaceUserMessageText`；`components/TurnWrittenFiles.tsx:21`（类型）、`components/ExtensionStatusBar.tsx:8 sanitizeExtensionStatusText`。
  → **约定：能被单测直接断言的纯逻辑要 export，默认不 export 组件内部子组件。**

### 1.4 props 接口命名与位置

三种写法，按重要性排列：

**(a) 文件私有 `interface Props`（16 次）** —— 大组件首选。
位置固定：**所有 import 之后、第一个函数之前**。
- `components/SettingsPanel.tsx:34-43`
- `components/ChatInput.tsx:57-99`
- `components/ChatWindow.tsx:40`
- `components/MessageView.tsx:211`
- 完整 16 处：`components/AgentSessionPanel.tsx:7`、`BranchNavigator.tsx:7`、`ChatInput.tsx:57`、`ChatMinimap.tsx:15`、`ChatWindow.tsx:40`、`DirectoryPicker.tsx:50`、`FileExplorer.tsx:35`、`FileViewer.tsx:38`、`MessageView.tsx:211`、`SessionSidebar.tsx:106`、`SettingsPanel.tsx:34`、`SystemPromptPanel.tsx:3`、`TabBar.tsx:20`、`TerminalPanel.tsx:11`、`ToolDefinitionsPanel.tsx:8`、`TrellisSubagentRecords.tsx:13`

**(b) 内联对象字面量类型（63 次，小/中型组件主力）**
```tsx
// components/TurnWrittenFiles.tsx:55-58
export function TurnWrittenFiles({ files, onOpenFile }: {
  files: WrittenFile[];
  onOpenFile?: OpenWrittenFileHandler;
}) {
```
同型例子：`components/AnsiText.tsx:17`、`components/ThinkingIcon.tsx:1`、`components/ThemeIcon.tsx:3`、`components/ProviderUsageSummary.tsx:27`、`components/SessionSearch.tsx:9`、`components/SettingsUi.tsx`（几乎全部）、`components/MessageView.tsx:948`（`ThinkingBlock`）。
→ 判据看起来是**props 数量 ≳ 5 或需要复用 `Pick<Props, ...>` 时升级为 `interface Props`**。

**(c) 带前缀的 `interface XxxProps`（10 处 / 9 个文件，用于"库化/被多处复用"的组件）**
`components/MarkdownBody.tsx:13 MarkdownBodyProps`、`components/ModelSelector.tsx:13 ModelSelectorProps`、`components/MermaidBlock.tsx:11 MermaidBlockProps`、`components/MermaidBlock.tsx:252 CodeBlockProps`、`components/ImagePreview.tsx:6 ImagePreviewProps`、`components/FrontmatterCard.tsx:6 FrontmatterCardProps`、`components/SettingsUi.tsx:8 ConfigPanelShellProps`、`components/BranchNavigator.tsx:118 TreeNodeProps`、`components/FileIcons.tsx:4 IconProps`、`components/ModelsConfig.tsx:1684 AddProviderPickerProps`。另有一个函数类型别名 `components/FileViewer.tsx:92 type SourceCodeRendererProps`。
→ 注意：`Props`（无前缀）是"文件私有"，`XxxProps` 是"可被别人读懂/引用"的选择，**但两者都基本不 export**——全仓库只有 `components/PathText.tsx:8 export interface PathTextProps` 一例显式导出 props 类型，以及 `components/ChatInput.tsx:102 export interface ChatInputHandle`（imperative handle 类型必须导出）。

**(d) 复用父组件 props 的两种手段（都在用）**
- `Pick<Props, ...>`：`components/SettingsPanel.tsx:65`
  ```tsx
  function GeneralSettings({ sessionId, onSessionReloaded, quoteSelectionEnabled, onQuoteSelectionChange }: Pick<Props, "sessionId" | "onSessionReloaded" | "quoteSelectionEnabled" | "onQuoteSelectionChange">) {
  ```
- `React.ComponentProps<typeof X>`：`components/MessageView.tsx:131`
  ```tsx
  function SafeMarkdownBody({ children, className, ...props }: React.ComponentProps<typeof MarkdownBody>) {
  ```
- 透传原生属性：`interface` 交叉原生 attr 类型，`components/SettingsUi.tsx:93`
  ```tsx
  }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  ```
  `...props` 直接 spread 到原生元素上（`SettingsUi.tsx:106/115/124/133/142/195/231`），`className` 用 `[...].filter(Boolean).join(" ")` 合并（`SettingsUi.tsx:99`、`MarkdownBody.tsx:164`）。

### 1.5 JSDoc / 注释习惯

- **不强制**：45 个 `components/*.{ts,tsx}` 中只有 15 个含 `/**` 块，共 53 个 JSDoc 块。
- JSDoc 只用在**跨文件契约与反直觉决策**上，不用在显而易见的 getter 上：
  - `components/TurnWrittenFiles.tsx:11-18`（解释 `OpenWrittenFileHandler` 第二参数为何存在）
  - `components/TurnWrittenFiles.tsx:46-54`（解释 `+N/-M` 何时显示、引用决策 D5）
  - `components/FileIndexContext.tsx:7-11`（解释为什么用 context 而不是 prop drilling，以及 provider 缺席时的降级）
  - `components/AnsiText.tsx:5-15`（解释为何用 `ansi_up`、为何 `dangerouslySetInnerHTML` 安全）
  - `components/MessageView.tsx:117-119`（解释 `SafeMarkdownBody` 存在的理由：巨型消息会冻结主线程）
  - `hooks/useKeyboardShortcuts.ts:14-17`、`:38-48`（解释为什么用 module-level registry 而不是 prop drilling）
  - `hooks/useChatAppearance.ts:63`（legacy key 迁移原因）
- 行内 `//` 注释写"为什么"，几乎不写"做什么"：
  - `components/MarkdownBody.tsx:49`（"Stable renderer identities keep stateful blocks mounted across message hover updates"）
  - `components/MarkdownBody.tsx:69`（"`node` is react-markdown metadata, not a DOM attribute"）
  - `components/MarkdownBody.tsx:52`（"An existing anchor disables automatic links for all its descendants"）
  - `components/ChatWindow.tsx:1454-1465`（解释动画 fill 模式与 marginTop 21 的像素推导）、`:1470-1472`（`pre-line` 的必要性）
  - `components/MessageView.tsx:169`（"Rendered inline under its toolCall — skip standalone rendering if paired"）
- **注释语言混用**：`components/` 下的注释与 JSDoc 是**英文**；`hooks/useI18n.tsx:36-41`、`lib/markdown.ts:705-709` 附近的说明性注释、`app/globals.css:706-709` 是**中文**。
  写新组件建议跟**所在目录**：`components/*.tsx` 用英文（主流），`hooks/*.ts` 的中文 JSDoc 也可接受（`useI18n.tsx` 是唯一特例）。

### 1.6 文件内常量 / 辅助函数放哪

固定顺序（从上到下）：

```
"use client"
imports
[exported 类型 / handler 类型]
[文件私有 interface / type]
[模块级常量 UPPER_SNAKE]
[模块级 helper function（纯函数）]
[文件私有子组件 function Xxx(...)  — 小写起名、不 export]
[exported 主组件]
[exported 纯函数（供测试）]
```

实证：
- `components/TurnWrittenFiles.tsx`：类型 `OpenWrittenFileHandler:13` → 常量 `ADDED_COLOR/REMOVED_COLOR:18-19` → 私有子组件 `ActionButton:21` → 主组件 `TurnWrittenFiles:55`。
- `components/MarkdownBody.tsx`：`interface MarkdownBodyProps:13` → helper `linkifyChildren:26` → 主组件 `MarkdownBody:36`。
- `components/MessageView.tsx`：常量 `CJK_PATTERN:63`、`MAX_THINKING_CACHE_ENTRIES:113`、`MAX_MARKDOWN_CHARS:119`、`USER_BUBBLE_MAX_HEIGHT:180`；helper `estimateTokens:64`、`formatMessageBytes:121`、`formatTime:256`；私有子组件 `UserMessageView:343`、`AssistantMessageView:643`、`BlockView:928`、`TextBlock:944`、`ToolCallBlock:1069`、`PairedDiffResult:1185`…；exported `MessageView:302`。
- `components/ChatInput.tsx`：导出类型 `AttachedImage:41`、私有 `PendingDiskImage:48`、`ModelOption:53`、`interface Props:57`、导出 `ChatInputHandle:102`、常量 `TOOL_PRESETS:111`、`TOOL_PRESET_MAP:113`。
- `components/MermaidBlock.tsx`：接口 `MermaidBlockProps:11`、常量 `ZOOM_STEP/ZOOM_MIN/ZOOM_MAX:17-19`、导出纯函数 `downloadMermaidSvg:21`、私有 `type RenderState:32`。
- 数值常量统一 `const NAME = value` + 语义化命名（`USER_BUBBLE_MAX_HEIGHT`、`MAX_MARKDOWN_CHARS`），**没有魔法数字散落**的倾向（但也未在所有文件贯彻，例如 `MessageView.tsx:1093-1097` 仍有内联像素值）。

---

## 2. Props 约定

### 2.1 回调命名：`onXxx`（prop），`handleXxx`（内部实现）

- prop 端一律 `on` + PascalCase：统计出现频次 `onOpenFile`×14、`onChange`×8、`onClose`×6、`onClick`×4、`onAtMention`×4、`onSelectSession`×3、`onSelect`×3、`onOpenSession`×3、`onCancel`×3 …
  （`grep -rho '^\s*on[A-Z][A-Za-z]*[?]*:' components/*.tsx`）
- 内部实现一律 `handle` + 名词/动作：`const handleClick`×6、`handleKeyDown`×4、`handleSave`×2、`handleSubmit`、`handleFork`、`handleNavigate`…
  共 84 处 `const handle[A-Z]...`。
- **例外**（值得在 spec 里点明）：跨组件传递的 handler 类型可以用 `export type` 单独命名并带 JSDoc，例如
  `components/TurnWrittenFiles.tsx:21 export type OpenWrittenFileHandler = (filePath, options?) => void`（`ChatWindow` 通过 `onOpenFile` 传入，`MessageView:22` 再 `import type` 转发）。这是唯一被命名成 `XxxHandler` 的 handler 类型。

### 2.2 可选 props 与默认值

- 可选 = `?:`；**默认值写在参数解构里**，不用 `defaultProps`：
  - `components/SettingsPanel.tsx:44` `size = 16, strokeWidth = 1.8`
  - `components/ThinkingIcon.tsx:1` `size = 14`
  - `components/ThemeIcon.tsx:3` `size = 17`
  - `components/SettingsUi.tsx:23-27` `closeLabel = "Close", width = 900, height = "78vh"`
  - `components/SettingsUi.tsx:212` `disabled = false, loading = false`
  - `components/ChatWindow.tsx:203` `defaultExpanded = false, reveal = false`
  - `components/MermaidBlock.tsx:36` `defaultPreview = false`
- 默认值也可以来自**模块常量**：`components/FileExplorer` / `SettingsUi` 从 hooks 导入常量；`hooks/useChatAppearance.ts:6-13` 定义 `CHAT_CONTENT_WIDTH_DEFAULT` 等。
- "可选回调"统一以 `?.` 调用：`components/TurnWrittenFiles.tsx:125` `onOpenFile?.(filePath, openOptions)`、`:138` `onOpenFile && (...)`。
- 空数据**在组件内部直接返回 `null`**，由调用方无脑渲染：`components/TurnWrittenFiles.tsx:60 if (files.length === 0) return null;`、`components/FrontmatterCard.tsx:35-37`、`components/ExtensionStatusBar.tsx:33`。

### 2.3 `children` 用法

- 类型写 `ReactNode`（46 处）远多于 `React.ReactNode`（7 处）；两者无功能差异，**新代码用 `import type { ReactNode } from "react"`**。
- 三种形态：
  1. 纯容器（`SettingsUi.tsx:72-86`：`ConfigSplitView/ConfigSidebar/ConfigSidebarList/ConfigSidebarGroupLabel`）。
  2. `children` + className/style 透传并合并（`components/SettingsUi.tsx:106-150`）。
  3. `children` 参与渲染逻辑而非纯包裹（`components/MarkdownBody.tsx:27` 的 `children: string` 是 markdown 文本——**重名但语义不同**；`components/ImagePreview.tsx:9` 的 children 是被放大的缩略图本体）。
- **`children` 不是首选组合手段**：可见 `children` 声明 28 处，但绝大多数组件通过显式 props（`statuses`/`widgets`/`files`/`messages`）接收数据。组合优先用 props，`children` 留给真正"不知道自己会包什么"的壳组件。

### 2.4 ref

- 只有 1 处 `forwardRef`：`components/ChatInput.tsx:640 export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput({...}, ref)`，配 `useImperativeHandle`（`:769`）暴露 `insertText/insertIfEmpty/replaceMessage/prependText/attachImages/...`（类型 `ChatInputHandle:102`）。
- 该 ref 由父组件包装传递，父组件自己不 forwardRef：`components/ChatWindow.tsx:870 ref={chatInputRef}`，`ChatWindow` 的 props 里是 `chatInputRef?: React.RefObject<ChatInputHandle | null>`（`ChatWindow.tsx:57`）。
- 其他 ref 都是**内部 DOM ref**，命名 `<thing>Ref`：`scrollContainerRef`、`messageContentRef`、`textareaRef`、`historyMenuRef`、`slashMenuRef`、`atMenuRef`、`controlsMenuRef`、`thinkingDropdownRef`、`toolDropdownRef`（`ChatInput.tsx` 一批）、`previewBoxRef`、`containerRef`（`ChatMinimap.tsx`）。
- 回调 ref 内联时返回**赋值语句**不返回值：`components/ChatInput.tsx:2087 ref={(node) => { ... }}`（避免 React 19 把返回函数当 cleanup——这是 React 19 的隐式约定，仓库照此写）。

### 2.5 props vs context：既有取舍

**只有 1 个 context**（`grep -rn createContext components/ hooks/` 全仓库命中）：
```tsx
// components/FileIndexContext.tsx:12
const FileIndexContext = createContext<FileIndexLookup | null>(null);
// :14 provider
export function FileIndexProvider({ lookup, children }: { lookup: FileIndexLookup | null; children: ReactNode })
// :24 consumer
export function useFileIndexContext(): FileIndexLookup | null
```
选择 context 的理由写在 `components/FileIndexContext.tsx:7-11` 的 JSDoc 里：**"分发到深层 renderer，避免 prop drilling；且 `MarkdownBody` 在聊天之外（文件预览）也会被使用，那里 provider 缺席，默认 `null` 保持原有渲染"**。
调用点：`components/ChatWindow.tsx:1029 <FileIndexProvider lookup={fileIndex.lookup}>` … `:1262 </FileIndexProvider>`；`components/MarkdownBody.tsx:125/140` 在 `<a>` 内部**主动用 `lookup={null}` 覆盖**，实现"锚点内部禁用自动链接"。

其余跨层状态全部走 props（哪怕是 `ChatWindow` → `MessageView` → `TurnWrittenFiles` 三层直传 `onOpenFile`）。

第二种"不想 prop drilling"的手段是 **module-level registry**（不是 context）：
```ts
// hooks/useKeyboardShortcuts.ts:7-17
let globalAbortHandler: (() => void) | null = null;
export function registerAbortHandler(handler: (() => void) | null): void { globalAbortHandler = handler; }
```
由 `components/ChatWindow.tsx:2` import 后注册，`AppShell` 的全局 Esc 监听调用它（`hooks/useKeyboardShortcuts.ts:38-48` 的 JSDoc 说明了为什么不用 prop drilling）。

**决策规则（从代码反推）**：单一数据源 + 需要穿透 2 层以上、且存在"provider 缺席"的降级语义 → context；只有"全局事件需要回调某个深层组件"→ module-level registry；其余一律 props。

### 2.6 i18n function 作为 prop（特殊的 props 约定）

需要 `t` 但自身不能调 hook 的纯组件，把 translator 当 prop 传，并**局部声明 `Translate` 类型**：
- `components/SystemPromptPanel.tsx:1` `type Translate = (key: string, params?: Record<string, string | number>) => string;`，props `translate: Translate`（`:6`）
- `components/ToolDefinitionsPanel.tsx:6` 同型
- `components/TrellisSubagentRecords.tsx:19` 同型（props 名 `t`）
- `components/FileExplorer.tsx:17` 用更强的推导写法 `type Translate = ReturnType<typeof useI18n>["t"];`
- 纯函数也接收 `t`：`components/ChatWindow.tsx:77 phaseLabel(phase, t)`、`:203 ProcessDetailsGroup({..., t})`、`components/ChatInput.tsx:311 slashMatchRank(command, query, t)`
→ **约定：hook 版 `const { t } = useI18n()` 是默认；不能调 hook 时用 prop + 局部 `Translate` 类型，不要 import `useI18n` 假装是纯组件。**

---

## 3. 组合模式

### 3.1 Provider 组合（应用根）

```tsx
// app/page.tsx:8-10
<I18nProvider>
  <AppShell />
</I18nProvider>
```
- `I18nProvider` 是唯一出现在应用根的自研 provider（`app/page.tsx:3`；`app/login/page.tsx:87` 也单独包了一层，因为登录页不在 AppShell 内）。
- `ThemeProvider` 不存在 —— 主题走 `hooks/useTheme.ts`（无 context，直接读写 `data-theme` + localStorage）。
- 局部 provider 只在需要穿透的地方下沉：`components/ChatWindow.tsx:1029` 的 `FileIndexProvider`。

### 3.2 Compound component（同文件多导出 + 共享 CSS 类前缀）

`components/SettingsUi.tsx` 是范例：一个文件导出 20+ 个 `Config*` 子组件，共享 `config-*` CSS 类前缀：
- 壳：`ConfigPanelShell:20`（负责 `role="dialog"` + `aria-modal` + 遮罩点击关闭 + 关闭按钮）
- 布局：`ConfigSplitView:72` / `ConfigSidebar:76` / `ConfigSidebarList:80` / `ConfigSidebarGroupLabel:84`
- 内容：`ConfigDetailTitle:151` / `ConfigSectionTitle:155` / `ConfigField:159` / `ConfigEmptyState:168` / `ConfigDetail:172` / `ConfigFooter:180`
- 控件：`ConfigButton:187` / `ConfigSwitch:212` / `ConfigListAction:231` / `ConfigStatusDot:249`
- 消费方：`components/ModelsConfig.tsx`、`AgentsConfig.tsx`、`SkillsConfig.tsx`、`PluginsConfig.tsx`、`SettingsPanel.tsx`（`grep -rn 'from "./SettingsUi"' components/*.tsx` → 5 处）。
→ 模式：**compound 组件集中在一个 `XxxUi.tsx`，子组件各自极薄（多为 3-8 行的 div/button 包装），语义行为（menu / focus / 键盘）留给消费方。**

### 3.3 把渲染委托给子组件（数据 → 视图的分层）

`components/MessageView.tsx` 是主范例，链路：

```
MessageView (memo, :302)                     // 按 message.role 分派
  ├─ UserMessageView (:343)
  ├─ AssistantMessageView (:643)
  │    └─ BlockView (:928)                   // 按 block.type 分派
  │         ├─ TextBlock (:944) → SafeMarkdownBody (:131) → MarkdownBody
  │         ├─ ThinkingBlock (:948, 唯一导出的 block)
  │         └─ ToolCallBlock (:1069)         // 配对 toolResult
  │              ├─ PairedDiffResult (:1185)
  │              └─ PairedResult
  ├─ CustomMessageView / CompactionMessageView
  └─ BashExecutionView
```
- 分派器**只做 `if (x.type === ...) return <Child .../>`，不含样式**（`MessageView.tsx:928-943`、`:302-330`）。
- 叶子组件才做样式与 i18n：`TextBlock:944`、`ToolCallBlock:1069`。
- `TurnWrittenFiles` 不是由 `MessageView` 同文件的子组件渲染，而是把 `writtenFiles?: WrittenFile[]`（`MessageView.tsx:234`）透传后在 `AssistantMessageView` 里挂载（`MessageView.tsx:875-877`）：
  ```tsx
  {writtenFiles && writtenFiles.length > 0 && (
    <TurnWrittenFiles files={writtenFiles} onOpenFile={onOpenFile} />
  )}
  ```
  数据由 `ChatWindow` 计算：`components/ChatWindow.tsx:1205 const writtenFiles = extractTurnWrittenFiles(turnContent, toolResultsMap, messageCwd);` → `:1096 writtenFiles={options.writtenFiles}`。
- memo + 自定义比较器：`MessageView.tsx:318-341` 手写 18 个字段的比较器（含 `haveSameRelevantToolResults(:288)` 只比较**相关**的 toolResult，避免流式 chunk 触碰全部消息）。`ChatWindow.tsx:729-731` 的注释解释了这里的历史坑。

### 3.4 "薄包装"子组件（原生元素增强）

`components/SettingsUi.tsx` 与 `components/ExtensionStatusBar.tsx` 之外，`components/PathText.tsx`（49 行）、`components/AnsiText.tsx`（20 行）、`components/ThinkingIcon.tsx`（14 行）、`components/ThemeIcon.tsx`（32 行）都是"一个职责、单文件、被多处 import"的最小单元。
→ 约定：**能 1 个文件 1 个职责就别拆目录；`components/` 是平铺的，没有 `components/ui/` 之类子目录**（`ls components/` 全部平铺 + `.test.mjs` 同目录并列）。

---

## 4. 样式

### 4.1 四种手段与边界（按实际使用量）

| 手段 | 规模 | 何时用 |
|------|------|--------|
| 内联 `style={{...}}` | **1021 处** | 默认手段。条件样式、与 props/state 联动的数值、一次性布局 |
| 全局 class（`className=`） | 357 处（其中 tailwind utility ≈11 处） | 需要 hover/focus/媒体查询/伪元素/CSS 变量派生时；由 `app/globals.css` 与 `app/settings.css` 定义 |
| CSS Module | **仅 1 个文件**：`components/ChatMinimap.module.css` | 需要大量结构性样式 + 伪类/属性选择器/`grid-template` 的复杂组件 |
| 内联 `<style>` 块 | **3 个文件**：`components/SystemPromptPanel.tsx:26`、`components/ToolDefinitionsPanel.tsx`、`components/AppShell.tsx` | 只在少数"面板级"组件出现过，属于历史遗留/局部封装，**不是推荐渠道** |

### 4.2 内联 style 的写法约定

- 对象字面量**内联在 JSX**，不抽变量；键用 camelCase，字符串数值加单位：
  ```tsx
  // components/TurnWrittenFiles.tsx:145-152
  style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-subtle)", overflow: "hidden" }}
  ```
- 颜色/边框**永远走 CSS 变量**（`var(--border)`, `var(--bg-subtle)`, `var(--text-muted)`, `var(--text-dim)`, `var(--font-mono)`），只有语义色（增/删）用硬编码：
  ```tsx
  // components/TurnWrittenFiles.tsx:18-19
  const ADDED_COLOR = "#4ade80";
  const REMOVED_COLOR = "#f87171";
  ```
  同类硬编码还有 `MessageView.tsx:1094-1095`（错误/成功边框 `rgba(248,113,113,...)` / `rgba(34,197,94,...)`）。
- 需要给 CSS 传自定义属性时，内联 style 上强断言 `as CSSProperties`：
  ```tsx
  // components/SettingsUi.tsx:29-34
  const panelStyle = embedded ? undefined : ({ "--config-panel-width": `${width}px`,
    "--config-panel-height": height } as CSSProperties);
  ```
- 条件样式用三元 / 展开：`components/SettingsUi.tsx:253 style={color ? { backgroundColor: color } : undefined}`、`components/ImagePreview.tsx:59 ...style`（ImagePreview 里 `...style` 放最后允许调用方覆盖）。

### 4.3 `calc(Xpx + var(--chat-font-size-offset, 0px))` 硬约束

这是**对话区字号滑块**的联动机制，链路由三处构成：

1. `app/globals.css:699-700`
   ```css
   .chat-content {
     --chat-font-size-offset: calc(var(--chat-content-font-size, 14px) - 14px);
   }
   ```
   配套注释在 `app/globals.css:706-709`（中文）："对话区字号由 `--chat-content-font-size` 统一驱动：`.chat-content` 将它与 14px 的差写进 `--chat-font-size-offset`，消息正文 = 14px + offset（与代码块、表格、时间戳等 `calc(X + offset)` 表面同步缩放，字号滑块也作用于同一链）"。
2. 主题变量由 `hooks/useChatAppearance.ts:91-96 applyAppearance()` 写到 `document.documentElement.style`：
   `--chat-content-max-width` / `--chat-content-font-size`；取值范围见常量 `:5-13`（宽 820–2000，字号 12–24，默认 14）。
3. **JSX 内联 style 里必须写成 `calc(Xpx + var(--chat-font-size-offset, 0px))`，其中 X 是"14px 基准下的设计字号"**（11/12/13/15px 等都要各自加 offset），否则该元素不会跟着滑块缩放。使用点（全仓库）：
   - `components/MessageView.tsx` **12 处**（`grep -c` 计数）——包含 `SafeMarkdownBody` 的降级 `<div>`、`ToolCallBlock` 的 `<pre>`、时间戳等。
   - `components/TurnWrittenFiles.tsx` **6 处**：`:38`（ActionButton，基准 11）、`:88`（计数行，11）、`:137`（文件名，12）、`:143`（类型标签，10）、`:156`（±计数，11）、`:177`（⋯按钮，15）。
   - `components/MermaidBlock.tsx` **2 处**。
   - CSS 侧同型：`app/globals.css:657`（`.extension-widget-content`，14）、`:710`（`.markdown-body`，14）、`:852`（13）。
   - 注意 `var(--chat-font-size-offset, 0px)` **必须带 fallback**，因为 `MessageView` 也会在 `.chat-content` 之外被渲染（例如 `ChatWindow.tsx:1249` 的 `bashExecution`、文件预览里的 markdown）。
   → **spec 必须写死这条**：新增对话区可见文本的字号不要写裸 px；若基准是 14px 可直接继承 `.markdown-body`，否则用 `calc(<设计字号>px + var(--chat-font-size-offset, 0px))`。

### 4.4 CSS Module 的用法（唯一实例）

```tsx
// components/ChatMinimap.tsx:16
import styles from "./ChatMinimap.module.css";
// 使用：components/ChatMinimap.tsx:79 className={styles.heading}
//      :153 styles.outline / :167 styles.paragraph / :680 styles.preview
//      :695 styles.turn / :699 styles.number / :702 styles.content
//      :705 styles.user / :711 styles.userText / :719 styles.assistant / :723 styles.assistantJump
```
- `components/ChatMinimap.module.css` 里仍用全局 CSS 变量（`var(--border)`, `var(--text-dim)`），并用 `color-mix(in srgb, var(--border) 82%, transparent)` 派生半透明色（`:14`, `:31`）。
- 状态样式用 `data-*` 属性选择器而不是 JS 拼类名：`.turn[data-located="true"]`（`ChatMinimap.module.css:35`、`:55`），对应 `ChatMinimap.tsx:695` 附近的 `data-located` 传递。
- 选择判据：**需要伪类/`grid-template-columns`/`overflow` 组合等"成块的 CSS"时开 `.module.css`；否则内联 style + 变量。**

### 4.5 Tailwind 的真实地位

- `package.json` devDependencies 有 `tailwindcss@^4` + `@tailwindcss/postcss`；`postcss.config.mjs` 注册了插件；`app/globals.css:2` `@import "tailwindcss";`；根目录还有一份遗留 `tailwind.config.ts`（content 指向 `pages/components/app`）。
- 但实际用例极少（11 处），且都是**一次性布局**：`components/ChatWindow.tsx:942 flex h-full items-center justify-center text-text-muted`、`:950 flex h-full items-center justify-center text-red-400`、`:1221 py-3 text-center text-xs text-text-muted`、`:1243 py-2 text-[13px] text-text-muted`、`components/ChatInput.tsx:2540 text-xs px-2 py-1`、`components/SessionSearch.tsx:45/51 px-3 py-2 text-xs text-text-muted`。
- 主题色已在 `app/globals.css:33-47` 的 `@theme` 里把 CSS 变量映射成 tailwind token（`--color-bg`、`--text-muted`…），所以 `text-text-muted` 能生效。
- → **spec 结论：Tailwind 可用但非主流，新增样式优先内联 style + CSS 变量 + 全局 class；不要为了一个 `flex` 混进 tailwind 又同时在旁边写 `style={{}}`。**（现状确实存在混写，属既有现状而非推荐做法。）

### 4.6 全局 class 命名习惯

- kebab-case、按功能前缀归组：`config-panel-root` / `config-panel-surface` / `config-close-button`（`SettingsUi.tsx`）；`extension-status-shelf` / `extension-status-line` / `extension-status-text`（`ExtensionStatusBar.tsx:38`）；`markdown-body` / `markdown-table-wrap` / `markdown-inline-code` / `markdown-file-link` / `markdown-frontmatter*`；`image-preview-dialog` / `image-preview-image` / `image-preview-close`（`ImagePreview.tsx:72/90/94`）；`system-prompt-panel` / `system-prompt-scroll`（`SystemPromptPanel.tsx:11/12`）；`settings-section-icon`（`SettingsPanel.tsx:55`）。
- 状态修饰用 `is-*` 或 `has-*`：`config-switch` + `is-loading`（`SettingsUi.tsx:223`）、`config-sidebar-item` + `is-grow` / `is-muted`（`AgentsConfig.tsx:509`）、`is-project`（`AgentsConfig.tsx:535`）、`has-widgets` / `has-status`（`ExtensionStatusBar.tsx:42`）、`is-embedded` / `is-modal`（`SettingsUi.tsx:41`）。
- 类名拼接两种写法并存：模板字符串（`AppShell.tsx:1898`、`AgentsConfig.tsx:509`）与数组 `.filter(Boolean).join(" ")`（`SettingsUi.tsx:99/205/238`、`MarkdownBody.tsx:164`）。**新代码推荐后一种**（`className` prop 传入时不会残留空格）。
- CSS 文件只有两个全局入口：`app/globals.css`（`app/layout.tsx` 隐含）与 `app/settings.css`（`app/layout.tsx:6 import "./settings.css";`）。测试会直接读这两个文件做断言（`components/SettingsUi.test.mjs:6`、`components/MarkdownBody.test.mjs:14`）。

---

## 5. 可访问性

### 5.1 实际使用的 aria/role 统计（`components/*.tsx`）

| 属性 | 次数 |
|------|------|
| `aria-label` | 121 |
| `aria-hidden` | 104 |
| `aria-expanded` | 19 |
| `aria-pressed` | 10 |
| `aria-controls` | 7 |
| `aria-modal` | 5 |
| `aria-busy` | 5 |
| `aria-live` | 4 |
| `aria-current` | 4 |
| `aria-selected` | 3 |
| `aria-labelledby` / `aria-haspopup` / `aria-checked` | 各 2 |
| `aria-keyshortcuts` / `aria-disabled` | 各 1 |

role 值分布：`alert`×15、`status`×13、`dialog`×6、`radiogroup`×2、`option`×2、`listbox`×2、`toolbar`/`tablist`/`tab`/`switch`/`radio`/`button`/`presentation`/`assistant` 各 1。

### 5.2 模式与实例

**(a) 弹层：原生 `<dialog>` + 手写焦点归还（首选）**
`components/ImagePreview.tsx:26-44`：
```tsx
dialog.showModal();
closeButtonRef.current?.focus({ preventScroll: true });
// cleanup: 还原 body overflow、dialog.close()、trigger?.isConnected && trigger.focus({ preventScroll: true })
```
`aria-haspopup="dialog"` + `aria-expanded={open}` 在触发器上（`:57-58`）；`onCancel` 里 `preventDefault()` 自己管关闭（`:71-74`）；Esc 在 dialog 的 `onKeyDown` 里处理并 `stopPropagation()`（`:77-81`）；点遮罩关闭（`:82-84`）。

**(b) 自定义弹层：`role="dialog"` + `aria-modal="true"` + `aria-label`**
- `components/SettingsUi.tsx:39-41`（`ConfigPanelShell`，`embedded` 时三个属性全部退化为 `undefined`）
- `components/AskUserCard.tsx:82-84`
- `components/ChatWindow.tsx:1594`、`:1877`
- `components/DirectoryPicker.tsx:106-107`、`components/ProjectTrustDialog.tsx:38-39`、`components/SettingsPanel.tsx:565-566`

**(c) 折叠/展开控件必须成对 `aria-expanded` + `title`/`aria-label`**
- `components/TurnWrittenFiles.tsx:166-167`（⋯ 菜单按钮：`aria-label` + `aria-expanded`）
- `components/MessageView.tsx:467-468`（`title={expanded ? t("i18n.collapse") : t("i18n.expand")}` + `aria-expanded={expanded}`）
- `components/MessageView.tsx:1015`（ThinkingBlock）
- `components/ExtensionWidgets.test.mjs:38/53/82/94` 就是在断言这个不变式（展开项唯一）。

**(d) 异步状态用 `role="status"` / `role="alert"`，不是 toast 库**
- `components/TurnWrittenFiles.tsx:80`：整个 section `aria-label={t("chat.filesWritten")}`
- `components/ExtensionStatusBar.tsx:43-46`：`role="status"` + `aria-label={plainStatusLine}` + `title={plainStatusLine}`（无 ANSI 的纯文本版本做可访问名）
- `components/ChatInput.tsx:506-508`（图片 chip：`role="status"` + `aria-label` + `title`）、`:560 role="alert"`、`:1960 role="alert"`
- `aria-busy`：`components/SettingsUi.tsx:219`（`ConfigSwitch`）、`components/ChatInput.tsx:1808` 的 `fieldset aria-busy`（测试断言 `ChatInput.test.mjs:273/444`）

**(e) 键盘处理**
- 组件内 Escape：19 处，全部是 `if (event.key !== "Escape") return;` 早退风格（`components/ChatWindow.tsx:403`、`:1538`、`components/ModelSelector.tsx:156`、`components/MermaidBlock.tsx:177`、`components/ModelsConfig.tsx:1732`、`components/DirectoryPicker.tsx:113`、`components/SettingsPanel.tsx:532`、`components/ImagePreview.tsx:80`、`components/FileExplorer.tsx:941`、`components/SessionSidebar.tsx` 5 处）。
- **输入法保护是硬要求**：`components/ChatWindow.tsx:403 if (event.key !== "Escape" || event.isComposing) return;`、`:1538 event.nativeEvent.isComposing`、`components/ChatInput.tsx:1603 && !isComposing`。任何新的 Enter/Esc 快捷键都要带 `isComposing` 检查（CJK 输入法回车选字会被误触发）。
- 全局 Esc 的两级协调：`hooks/useKeyboardShortcuts.ts:51-60` 明确跳过 `TEXTAREA`/`INPUT`，把 Esc 语义交还给 `ChatInput`（JSDoc `:44-48` 记录了这个决定）。
- 方向键导航示例：`components/TabBar.tsx:63` 用 `currentTarget.parentElement?.children[next]` 移动焦点（roving tabindex：`TabBar.tsx:51 tabIndex={isActive || (!activeTabId && tabs[0].id === tab.id) ? 0 : -1}`）。

**(f) 焦点管理**
- 44 处 `.focus()`；典型场景：菜单打开后聚焦（`components/ModelsConfig.tsx:1701 useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, [])`、`PluginsConfig.tsx:280`、`SkillsConfig.tsx:257`、`FileExplorer.tsx:589`）、关闭后归还（`ImagePreview.tsx:43`）、重命名输入延迟聚焦（`SessionSidebar.tsx:1846`）。
- **`aria-hidden` 必须与 `tabIndex={-1}`、`disabled` 一起用**，否则"看不见但能 Tab 到"：
  `components/AppShell.tsx:1636 tabIndex={covered ? -1 : undefined}` + `:1756` 同型；`components/ChatInput.tsx:2616 tabIndex={controlsMenuOpen ? -1 : undefined}`。该约束被测试锁住：`components/AppShell.mobile-toolbar.test.mjs:54-57`
  ```
  assert.match(source, /aria-hidden=\{covered \? true : undefined\}/);
  assert.match(source, /tabIndex=\{covered \? -1 : undefined\}/);
  ```
- 焦点可见性：通过 `data-*` 属性 + CSS 而非 JS 管理（`ChatMinimap.module.css:35 .turn[data-located="true"]`）。

**(g) 装饰性元素一律 `aria-hidden="true"`**
104 处，主要是 SVG：`components/TurnWrittenFiles.tsx`（⋯ 按钮里的图标）、`components/SettingsPanel.tsx:54`（`"aria-hidden": true` 作为 svg 公共 props）、`components/SettingsUi.tsx:252`（`ConfigStatusDot` 整体 `aria-hidden="true"`，颜色信息另外用 `title`/文本表达）。

### 5.3 谁来"管" a11y

1. **ESLint（`eslint-config-next/core-web-vitals`）启用了 6 条规则**（`node_modules/.bin/eslint --print-config components/TurnWrittenFiles.tsx` 实测）：

   | 规则 | 级别 |
   |------|------|
   | `jsx-a11y/alt-text` | 1 (warn)，elements `["img"]` + `img: ["Image"]` |
   | `jsx-a11y/aria-props` | 1 |
   | `jsx-a11y/aria-proptypes` | 1 |
   | `jsx-a11y/aria-unsupported-elements` | 1 |
   | `jsx-a11y/role-has-required-aria-props` | 1 |
   | `jsx-a11y/role-supports-aria-props` | 1 |

   注意：**没有** `jsx-a11y/no-static-element-interactions` / `click-events-have-key-events`，所以"点遮罩关闭"这类 div onClick 不会被 lint 拦。这些是 warn（level 1）而不是 error，`npm run lint` 默认仍会因 warnings 通过——**a11y 主要靠测试而非 lint**。
   `eslint.config.mjs` 只关掉了 3 条 react-hooks 规则（`react-hooks/immutability`、`react-hooks/refs`、`react-hooks/set-state-in-effect`），未动 a11y。
2. **组件测试断言 aria**：10 个测试文件含 `aria-` 断言（`AgentsConfig`、`AgentSessionPanel`、`AppShell.mobile-toolbar`、`ChatInput`、`ExtensionStatusBar`、`ExtensionWidgets`、`MessageView`、`SessionSidebar`、`SettingsPanel`、`TrellisSubagentRecords`）。
   例：`components/ChatInput.test.mjs:694` 断言 `aria-keyshortcuts="Alt+Enter"`；`components/ExtensionStatusBar.test.mjs:72` 断言 `aria-label="ponytail memory"`。
3. **e2e（Playwright）**：`e2e/chat-appearance.mjs`、`e2e/themes.mjs`、`e2e/extension-dialog.mjs` 等（`npm run test:e2e`），但它们是端到端场景验证，不做 a11y 树审计。

---

## 6. i18n

### 6.1 取文案的真实方式

- **默认（client 组件）**：
  ```tsx
  import { useI18n } from "@/hooks/useI18n";           // components/TurnWrittenFiles.tsx:4
  const { t } = useI18n();                              // :59
  <span>{t("chat.writtenFilesCount", { count: files.length })}</span>   // :88
  ```
- `useI18n` 返回 `{ locale, setLocale, t, supportedLocales }`（`hooks/useI18n.tsx:11-16`），定义于 `hooks/useI18n.tsx:82`，provider 在 `:42`，**不在 provider 内会抛错**（`:83`）。
- **不能调 hook 时传 prop**：见 §2.6（`translate` / `t` + 局部 `Translate` 类型）。
- **非组件模块**用纯函数 `translateMessage`（`lib/i18n/format.ts:26`），`useI18n` 内部就是调它（`hooks/useI18n.tsx:68`）。
- 需要相对时间用 `formatRelativeTime(date, locale)`（`lib/i18n/format.ts:47`），不要手写 `Intl`。
- 插值只用 `{name}` 占位符（`lib/i18n/format.ts:11-17`），**禁止拼接翻译片段**（`docs/i18n.md` 明确写了）。

### 6.2 key 命名习惯

- `"<feature>.<camelCaseName>"`，feature 为小驼峰命名空间。实测分布（`lib/i18n/messages/en.ts` 前缀计数）：
  `chat.` 143、`sidebar.` 61、`models.` 50、`settings.` 48、`agents.` 42、`trellisSubagent.` 40、`session.` 34、`files.` 30、`tools.` 15、`agentSwitcher.` 14、`terminal.` 11、`directoryPicker.` 11、`auth.` 10、`trust.` 9、`workspace.` 8、`title.` 7、`providerUsage.` 7、`common.` 7、`theme.` 6、`system.` 5、`skills.`/`layout.`/`history.` 各 3。
- 也允许三段（`chat.fileType.<category>` 由模板字符串拼出：`components/TurnWrittenFiles.tsx:113 t(\`chat.fileType.${getFileCategory(filePath)}\`)` —— **动态拼接 key 的唯一实例**，因为 category 集合封闭）。
- 复用型通用文案放 `i18n.*` / `common.*`（如 `i18n.expand`、`i18n.collapse`、`i18n.thinkingUnavailable`、`common.language`）。
- `docs/i18n.md` 的规则：key 必须"stable and language-neutral"；技术术语（`Agent`、`API Key`、`Provider`、`worktree`、`Diff`、`CWD`、`Shell`、`Git`、`HEAD`、`OAuth`、`Mermaid`）保留英文与原大小写；路径、模型名、工具输出、服务端错误详情不翻译。
- 语言包文件：`lib/i18n/messages/en.ts` / `zh-CN.ts` / `zh-TW.ts`（各约 36KB），注册在 `lib/i18n/registry.ts:5`，`Locale` 联合类型在 `lib/i18n/types.ts:1`（新增语言要同步改这里）。

### 6.3 三语一致性由谁保障

`lib/i18n/registry.test.mjs:39-54`，测试名 **"built-in locale packages have the complete English key and required placeholder sets"**：

```js
for (const locale of getSupportedLocales().filter((id) => id !== "en")) {
  const messages = getLocalePlugin(locale).messages;
  assert.deepEqual(Object.keys(messages).sort(), englishKeys, `${locale} keys must match English`);
  for (const key of englishKeys) {
    const optional = optionalPlaceholders[key] ?? [];   // 唯一豁免：files.conflictSummary -> ["countSuffix"]
    const required = placeholders(englishMessages[key]).filter((name) => !optional.includes(name));
    const translated = placeholders(messages[key]).filter((name) => !optional.includes(name));
    assert.deepEqual(translated, required, `${locale}.${key} placeholders must match English`);
  }
}
```

结论（写进 spec 的硬约束）：
1. **key 集合必须与 `en` 完全一致**（多一个少一个都 fail）。
2. **占位符集合必须与 `en` 一致**，唯一豁免是 `files.conflictSummary` 的 `countSuffix`。
3. 运行 `npm test` 即覆盖；因此改/加文案时三语必须同时改，否则测试红。
4. 缺 key 的降级链：`messages[locale]?.[key] ?? messages.en?.[key]` → 仍缺则返回 key 本身，并在非 production 下 `console.warn("[i18n] Missing translation: <key>")`（`lib/i18n/format.ts:33-35`）。

另外 `lib/i18n/format.test.mjs` 覆盖插值与相对时间；`resolveBrowserLocale` 的 16 条断言在 `registry.test.mjs:11-32`。

---

## 7. 常见错误（有实证的踩坑清单）

1. **`react-markdown` 的 `node` prop 必须 `delete`**
   自定义 `components` renderer 拿到的 props 里含 `node`（mdast 节点），直接 spread 到 DOM 会打印 React 警告/非法属性。
   ```tsx
   // components/MarkdownBody.tsx:69（inline code）, :102（p）, :118（a）, :150（img）
   // `node` is react-markdown metadata, not a DOM attribute.
   delete props.node;
   ```
   同型处理在 `components/FileViewer.tsx:1744`、`:1761`。
   测试锁定：`components/MarkdownBody.test.mjs` 多个用例断言 `assert.doesNotMatch(html, /\snode=/)`（:50、:61、:180、…）。

2. **`rehype-sanitize` 会剥离/改写 rehype 注入的内容，插件顺序与 schema 必须显式维护**
   `lib/markdown.ts:9-20` 在 `defaultSchema` 上做三处扩权/收紧：
   ```ts
   attributes.code = [["className", /^language-./, "math-inline", "math-display"]];  // 否则 KaTeX 的 math-* class 被剥
   protocols.href = [...href, "file"];                                               // 否则 file:// 链接被抹成 ""
   strip = [...strip, "iframe", "object", "style", "form"];                           // 主动禁止
   ```
   插件顺序固定在 `lib/markdown.ts:375-385`（`markdownRehypePlugins`）与 `:364-373`（`markdownRemarkPlugins`）：`rehypeRaw` → `[rehypeSanitize, markdownSanitizeSchema]` → `[rehypeKatex, {throwOnError:false, strict:false}]`。
   **sanitize 必须在 katex 之前**，否则 KaTeX 生成的 `math-inline`/`math-display` class 会被剥掉。这也是为什么 `markdownUrlTransform`（`lib/markdown.ts:22`）要显式放行 `file:` —— 否则 `file://` 会被 `defaultUrlTransform` 清空（测试断言见 `MarkdownBody.test.mjs:64-68`：无 handler 时 href 变成 `href=""`）。
   `remarkFrontmatter` 必须在 math/GFM 之前（`lib/markdown.ts:354-361` 注释："without it, the opening `---` becomes an `<hr>` and the closing `---` turns the YAML into a setext heading"）。

3. **`remark-gfm` 的 `singleTilde` 必须关**
   `lib/markdown.ts:362`：`const remarkGfmOptions = { singleTilde: false } as const;` —— 单个 `~` 是 CJK 数值区间分隔符（"5~7U"、"100~200倍"），GFM 默认会把它当删除线并静默吃掉（注释里指向 issue #385）。测试：`MarkdownBody.test.mjs:75-85`。

4. **巨型消息不能走 markdown 管线**
   `components/MessageView.tsx:117-119` 的注释 + `:119 const MAX_MARKDOWN_CHARS = 100_000;`：`react-markdown + KaTeX + syntax highlighting` 在几百 KB 文本（粘贴的 HAR / 日志）上会冻结主线程。`SafeMarkdownBody`（`:131`）超过阈值降级成"点击揭示的纯文本 `<pre>`"。**任何新的 markdown 渲染入口都应经过 `SafeMarkdownBody` 或自带等价保护。**

5. **工具结果默认折叠**
   `components/MessageView.tsx:1071 const [expanded, setExpanded] = useState(false);`（`ToolCallBlock`），只有 `expanded` 时才渲染入参 `<pre>`（`:1142`）和配对结果（`:1162`）。`ThinkingBlock` 同型（`:956`，初值来自 `isThinkingExpandedByDefault` 偏好）。避免超长 diff/日志把会话刷屏。
   注意例外：折叠状态下**仍要展示摘要**（`getToolPreview(block)`、`duration`），不是整块隐藏。

6. **`ToolCallBlock` 的配对结果不要单独渲染**
   `components/MessageView.tsx:320-322`：`if (message.role === "toolResult") return null; // Rendered inline under its toolCall — skip standalone rendering if paired`。历史上"配对结果渲染两遍"是已知坑。

7. **`memo` 的比较器必须显式列出所有影响渲染的 props**
   `components/MessageView.tsx:318-341` 手写比较器（而不是依赖浅比较），否则流式 chunk 会触发全部历史消息重渲染；`ChatWindow.tsx:729-731` 的注释记录了"在这里新建对象字面量会击穿 `MessageView` 的 `memo()`"的坑。改动 `MessageView` props 时**必须同步更新比较器**，否则出现"UI 不刷新"的幽灵 bug（因为浅比较会漏掉新字段）。

8. **react-markdown 的 `components` 对象身份要稳定**
   `components/MarkdownBody.tsx:49` 注释："Stable renderer identities keep stateful blocks mounted across message hover updates." → 用 `useMemo<Components>(..., [cwd, isStreaming, onOpenFile, linkifyBlockChildren])`（`:53-153`）。在 render 里内联新建 `components` 对象会让 Mermaid/代码块每次 hover 都重新挂载。

9. **组件测试的双 React 实例陷阱**
   `git show 5f74a19`（"test: fix component-test harness dual React instance (35 -> 9 failures) (#588)"）：测试入口若用原生 `import React from "react"`，而组件树通过 `jiti` 加载，会产生两个 React 实例与两个 `I18nContext`，`useContext` 返回 null，全部组件测试报 `useI18n must be used inside I18nProvider`。
   **正确写法**（见 `components/TurnWrittenFiles.test.mjs:7-16`、`components/ChatInput.test.mjs:8-19`）：
   ```js
   const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
   const React = await jiti.import("react");
   const { renderToStaticMarkup } = await jiti.import("react-dom/server");
   const { Xxx } = await jiti.import("./Xxx.tsx");
   const { I18nProvider } = await jiti.import("@/hooks/useI18n");   // 必须走 @/ 别名，与组件内部一致
   ```
   新增组件测试务必复制这个引导块，不要 `import React from "react"`。

10. **需要 hook 的组件不要忘了 `"use client"`**
    反之亦然：多余加 `"use client"` 会把纯展示组件推出 server 边界（本仓库全是客户端渲染，代价不明显，但惯例是把 `translate` 当 prop 传更干净，见 §1.1）。

11. **`dangerouslySetInnerHTML` 只允许在"已转义"的通道使用**
    - `components/AnsiText.tsx:19`：`ansi_up` 默认转义 HTML 实体（JSDoc `:11-13` 明确写了安全前提）。
    - `components/MermaidBlock.tsx:114`、`:244`：内容是 mermaid 自己渲染出的 SVG，且初始化时 `securityLevel: "strict"`（`components/MermaidBlock.tsx:56` `securityLevel: "strict"`）。
    → 新代码若要用它，必须在同一处注释里说明"为什么安全"。

12. **工具/扩展输出的净化要在组件边界做**
    - `components/ExtensionStatusBar.tsx:8 sanitizeExtensionStatusText`：规范空白与换行（`\r\n`→`\n`、tab→空格、压缩连续空格），保证状态栏单行稳定。
    - `apps` 的输出经 `stripAnsi` 出纯文本版供 `aria-label`（`ExtensionStatusBar.tsx:36`），避免屏幕阅读器读 ANSI 码。
    - `components/MermaidBlock.tsx:21-29 downloadMermaidSvg` 的注释记录 mermaid 序列化会留下未闭合 void tag（`<br>`）的坑。

13. **样式：`calc(Xpx + var(--chat-font-size-offset, 0px))` 漏了 fallback 会在非对话区算出 `calc(12px + )` 的非法值**
    `var(--chat-font-size-offset, 0px)` 的 fallback 是必需的（`MessageView` 在 `.chat-content` 之外也被渲染）。见 §4.3。

14. **React 19 的回调 ref 不能返回值**
    `components/ChatInput.tsx:2087`、`:2203`、`:2338` 的 `ref={(node) => { ... }}` 都是语句块（无 `return`）。返回 `element.focus()` 之类的表达式会被 React 19 当成 cleanup 函数，卸载时报错。

---

## 8. 对模板 6 个 section 的取舍建议

当前 `component-guidelines.md` 骨架：Overview / Component Structure / Props Conventions / Styling Patterns / Accessibility / Common Mistakes（各含 `(To be filled by the team)`）。

| 模板 section | 建议 | 理由（基于实证） |
|---|---|---|
| **Overview** | **保留，但改名/收敛为 "Client Boundary & File Anatomy"** | 现有 Overview 的引导问题（"什么组件模式/如何定义 props/如何组合/a11y 标准"）与后面 4 个 section 完全重叠。实际最需要单独讲清、且后面没地方放的是 **`"use client"` 判据 + import 顺序 + export 风格 + 文件内代码顺序**。把这四条放进来，Overview 才有独立价值。 |
| **Component Structure** | **保留，但与本文件的"文件解剖"合并**（或直接删掉，把内容并入 Overview） | 二者是同一件事。若都保留必然互相重复。建议保留 **Component Structure** 这个名字承载"从 `"use client"` 到 helper/子组件/主组件的自上而下顺序"，Overview 只留 3-5 行导语。 |
| **Props Conventions** | **保留** | 内容密度最高、最容易出错（`interface Props` vs 内联 vs `XxxProps` 三种并存；`Pick<Props, ...>`、`ComponentProps<typeof X>`、原生 attr 交叉；`onXxx`/`handleXxx`；`children` 的地位；`Translate` 作为 prop；唯一 context 的判断标准）。不合并。 |
| **Styling Patterns** | **保留，且必须新增"对话区字号变量"子节** | 四种手段并存（内联 1021 / 全局 class 357 / Tailwind 11 / module.css 1 / 内联 `<style>` 3），需要明确边界；`calc(Xpx + var(--chat-font-size-offset, 0px))` 是本项目最容易被新代码破坏的硬约束。 |
| **Accessibility** | **保留** | 有大量真实模式（原生 `<dialog>` + 焦点归还、`aria-hidden`/`tabIndex={-1}`/`disabled` 三件套、`aria-expanded` 成对、`role="status"`/`"alert"`、`isComposing` 保护），且必须说明 **lint 只覆盖 6 条规则、主要靠测试锁定**——这是新人最容易低估的点。 |
| **Common Mistakes** | **保留，且列为高价值 section** | §7 的 14 条全部有 file:line 实证与"曾发生过的 bug"（`node` prop、sanitize 顺序、`singleTilde`、memo 比较器、双 React 实例）。这是 sub-agent 最容易踩的雷区。 |

**建议新增（模板没有但本项目必需）**：
- **Composition & Data Flow** —— provider/context 的"仅一处 context + module-level registry"取舍、`MessageView → BlockView → ToolCallBlock` 的分派模式、compound component 集中在 `XxxUi.tsx`。可挂在 Props Conventions 之后。
- **i18n In Components** —— `useI18n` vs `Translate` prop、key 命名、三语一致性测试。可独立成节，或作为 Props Conventions 的子节（因为"传 t 当 prop"本质是 props 约定）。
- **Component Testing** —— 两种测试风格（11 渲染 / 29 源码结构断言）、`jiti` 引导块、双 React 陷阱。`directory-structure.md` 或 `quality-guidelines.md` 也可以承载，但组件相关的部分（渲染断言 + a11y 断言）放在本节更好读。

**建议删除或降级**：模板里 "What accessibility standards apply?" 这种问句式占位必须替换成"实测规则表 + 句柄"（见 §5.3），否则 sub-agent 会写出 `aria-*` 堆砌但不解决 `tabIndex` 与 `isComposing` 的代码。

---

## 9. 不确定 / 未能定论的点

1. **`interface Props`（16 次）与内联对象类型（63 次）的切换阈值没有书面规则**，只能从样本量推测（≥5 个 prop 或需要被 `Pick`/复用 → `interface Props`）。写 spec 时若要把阈值写成硬规则，请标注这是"归纳"而非"既有明文约定"。
2. **注释/JSDoc 语言没有统一标准**：`components/*.tsx` 主流英文，`hooks/useI18n.tsx`、`app/globals.css`、部分 spec 文档中文；`index.md` 声称 "All documentation should be written in English"，但已落地的 `ask-user-protocol.md` 是中文、`clickable-file-paths.md` 是英文——**spec 本身的语言惯例是混的**，需要产品负责人拍板。
3. **内联 `<style>` 块（3 个文件）是否有意为之**无法从代码判断；`SystemPromptPanel.tsx` 用了内联 `<style>` 而非抽到 `globals.css`，看起来是历史遗留，但没有任何注释解释。写 spec 时建议写"不推荐新增"，不要断言"禁止"。
4. **Tailwind 的真实意图不明**：`tailwind.config.ts` + `@theme` 映射 + 11 处用例说明它被保留了，但主流是内联 style。无法判断是"正在迁移到 Tailwind"还是"只在少数地方顺手用"。建议 spec 只描述现状（"可用、非主流、不要混写"）。
5. **`file: //` 协议放行带来的安全边界**：`lib/markdown.ts:15-18` 放行了 `file:`，实际打开行为由 `lib/file-links.ts resolveLocalFileHref` + `onOpenFile` 是否提供决定（无 handler 时 href 输出为空串，见 `MarkdownBody.test.mjs:64-68`）。未逐行审计所有入口，无法断言"任意 file: URL 都不会被导航"。
6. **未验证**：`components/` 下是否还有 `node` prop 之外的 react-markdown 版本升级适配（如 v10 的 `Components` 类型变化）需要记录；`FileViewer.tsx` 里另有一套独立的 react-markdown `components` 配置（`:1730-1770`），其与 `MarkdownBody` 的重复是否应抽取，未见决策记录。
7. **e2e 对组件的覆盖**：`e2e/*.mjs`（Playwright）主要覆盖 chat-appearance / clickable-file-paths / extension-dialog / subagents / terminal / themes，未逐个组件核对；组件层的行为回归主要靠 `components/*.test.mjs` 的源码结构断言（29 个文件），这类断言脆性较高（`git log` 里有"pre-existing brittle source-structure assertions"的措辞）。

---

## 10. 证据复核命令（供他人重跑）

```bash
cd /home/xupeng/dev/personal/forked/agegr-pi-web

# 导出风格
grep -rn "^export default" components/ | wc -l                 # 0
grep -rn "^export function" components/*.tsx | wc -l           # 101

# use client 覆盖
grep -rln '^"use client"' components/ | wc -l                  # 37
ls components/*.tsx | wc -l                                    # 42

# props 类型写法
grep -rn "^interface Props" components/*.tsx | wc -l           # 16
grep -rn "^interface [A-Za-z]*Props" components/*.tsx         # 26 行（含 16 个 Props，10 个 XxxProps）

# 样式分布
grep -rho "style={{" components/*.tsx | wc -l                  # 1021
grep -rho "className=" components/*.tsx | wc -l                # 357
grep -rc "chat-font-size-offset" components/*.tsx app/globals.css | grep -v ':0'
find . -name "*.module.css" -not -path "./node_modules/*"      # 仅 ChatMinimap
grep -rln "<style>" components/*.tsx                           # 3

# a11y
grep -rho 'aria-[a-z]*=' components/*.tsx | sort | uniq -c | sort -rn
grep -rho 'role="[a-z]*"' components/*.tsx | sort | uniq -c | sort -rn
node_modules/.bin/eslint --print-config components/TurnWrittenFiles.tsx | python3 -c "import json,sys;print('\n'.join(k for k in json.load(sys.stdin)['rules'] if 'a11y' in k))"

# i18n
node --experimental-strip-types --test lib/i18n/registry.test.mjs   # 三语一致性

# 组件测试风格
grep -rln "renderToStaticMarkup" components/*.test.mjs | wc -l  # 11
grep -rln 'readFile(new URL("./' components/*.test.mjs | wc -l  # 29
```

---

## 附：本文引用的文件清单

| 文件 | 用途 |
|------|------|
| `components/TurnWrittenFiles.tsx`（211 行） | 文件解剖、内联 style、字号 offset、a11y 展开态、i18n 动态 key |
| `components/MarkdownBody.tsx`（175 行） | `node` 删除、sanitize/urlTransform、memo 化 `components`、context 消费 |
| `components/FileIndexContext.tsx`（26 行） | 唯一 context；provider 缺席降级 |
| `components/SettingsPanel.tsx`（619 行） | `interface Props` + `Pick<Props,...>` + 内联 svg + `role="dialog"` |
| `components/ChatInput.tsx`（3005 行） | `forwardRef` + `useImperativeHandle`、内联 props 类型、`Translate`-free hook 用法、Escape/isComposing |
| `components/SettingsUi.tsx`（257 行） | compound component、原生 attr 交叉、class 合并、`role="switch"` |
| `components/MessageView.tsx`（1895 行） | 分派模式、memo 比较器、巨型消息保护、工具结果默认折叠、字号 offset ×12 |
| `components/ChatWindow.tsx`（2006 行） | 组合与装配、memo 坑注释、`role="dialog"`、`tabIndex` |
| `components/ChatMinimap.tsx` + `.module.css` | 唯一 CSS Module、`data-*` 状态选择器 |
| `components/ImagePreview.tsx`（107 行） | 原生 `<dialog>` + 焦点归还范本 |
| `components/AnsiText.tsx` / `ExtensionStatusBar.tsx` | 转义渲染、净化、`role="status"` |
| `components/SystemPromptPanel.tsx`（58 行） | 无 `"use client"` + `Translate` prop + 内联 `<style>` |
| `hooks/useI18n.tsx` / `lib/i18n/*` / `docs/i18n.md` | i18n 全貌 |
| `hooks/useKeyboardShortcuts.ts` | 全局 Esc 与 module-level registry |
| `hooks/useChatAppearance.ts` | 字号/宽度偏好与 CSS 变量写入 |
| `lib/markdown.ts` | sanitize schema、插件顺序、CJK `~` |
| `app/globals.css` / `app/settings.css` | CSS 变量、`--chat-font-size-offset`、`@theme` |
| `eslint.config.mjs` + `eslint --print-config` | a11y lint 覆盖面 |
| `lib/i18n/registry.test.mjs` | 三语一致性强制 |
| `components/*.test.mjs`（43 个） | 组件测试两种风格 |
| `git show 5f74a19` | 组件测试双 React 实例陷阱 |
