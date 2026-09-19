# hooks 与状态管理：代码实证调研

目标：为 `.trellis/spec/frontend/hook-guidelines.md` 与 `.trellis/spec/frontend/state-management.md`
提供可直接落笔的实证材料。所有结论都带 `file:line` 证据；未在代码中找到证据的项一律标注
「未找到证据」，不做推测。

调研方法：只读。`ls hooks/`、`grep -n`、逐文件阅读 `hooks/*.ts(x)`、`lib/*-preference.ts`、
`lib/*state*.ts`、`lib/*.ts` 客户端模块、`components/*.tsx` 中的 hook 调用点、`AGENTS.md`、
`eslint.config.mjs`、`package.json`、`hooks/*.test.mjs`。

---

## 0. 事实清单（先给可量化的基线）

| 事实 | 证据 |
|------|------|
| `hooks/` 下共 **11** 个源文件（不含 `.test.mjs`） | `ls hooks/` |
| 11/11 文件第一行都是 `"use client";` | `head -1 hooks/*.ts hooks/*.tsx`，无例外 |
| 11 个文件共 **13** 个 hook 函数导出 | `hooks/useIsMobile.ts:43,48,58` 一个文件导 3 个 |
| hook 目录**没有 barrel `index.ts`** | `ls hooks/index*` → 不存在 |
| **0 个 `export default`**，全部具名导出 | `grep -rn "export default" hooks/` → 空 |
| 全部 hook 返回**对象**或**裸值**，**无元组（tuple）返回** | 见 §2.2 |
| 无任何数据请求库（react-query / SWR / zustand / jotai / redux / valtio） | `grep -rn "react-query\|swr\|zustand\|jotai\|redux\|valtio" package.json` → 空 |
| 无 `jsdom` / `@testing-library/react` / `react-test-renderer` | `package.json` devDependencies |
| 测试入口：`node --experimental-strip-types --test "hooks/**/*.test.mjs" ...` | `package.json:test` script |
| `hooks/*.test.mjs` 共 8 个；`components/*.test.mjs` 43 个；`lib/*.test.mjs` 124 个 | `ls *.test.mjs \| wc -l` |

坐标提示：`AGENTS.md` 的 File Map 只列了 5 个 hook（`AGENTS.md:155-160`），实际有 11 个；
`useChatAppearance` / `useFileIndex` / `useI18n` / `useKeyboardShortcuts` / `useResizablePanel` /
`useViewportHeight` 未列入 File Map。写 spec 时应以真实文件为准。

---

## 1. hooks 清单（签名 / 返回值 / 消费者）

### 1.1 全量表格

| 文件 | 导出签名（行号） | 返回值形状 | 参数风格 | 消费方（file:line） |
|------|------------------|-----------|---------|--------------------|
| `hooks/useAgentSession.ts` | `export function useAgentSession(opts: UseAgentSessionOptions)` L305 | **大对象**（约 60 个 key，含 state / refs / actions / subscriptions 四组，L2678-2706） | options 对象（`UseAgentSessionOptions` L164-186） | 仅 `components/ChatWindow.tsx:301`（`ChatInput.tsx` 只 import 类型） |
| `hooks/useAudio.ts` | `export function useAudio()` L24 | 对象 `{ soundEnabled, onSoundToggle, playDoneSound, unlockAudio, soundEnabledRef }` L81 | 无参 | 仅 `components/AppShell.tsx:105` |
| `hooks/useChatAppearance.ts` | `export function useChatAppearance()` L132 | 对象 `{ ...snapshot, setWidth, setFontSize }` L134（snapshot = `{width, fontSize}`） | 无参 | `components/SettingsPanel.tsx:68`、`components/ChatInput.tsx:654`（只读 `fontSize`） |
| `hooks/useDragDrop.ts` | `export function useDragDrop(onDrop: (files: File[]) => void)` L5 | 对象 `{ isDragOver, handleDragEnter, handleDragOver, handleDragLeave, handleDrop }` L39 | **位置参数**（回调） | 仅 `components/ChatWindow.tsx:725` |
| `hooks/useFileIndex.ts` | `export function useFileIndex(cwd?: string): FileIndexState` L94 | **裸值** `FileIndexState = { lookup, status }` L18-21 | **位置可选参数** | 仅 `components/ChatWindow.tsx:761`（结果经 Context 下传，见 §3.4） |
| `hooks/useI18n.tsx` | `export function I18nProvider({children})` L42；`export function useI18n(): I18nContextValue` L80 | 对象 `{ locale, setLocale, t, supportedLocales }` L14-19 | `useI18n()` 无参 | Provider 在 `app/page.tsx`、`app/login/page.tsx`；`useI18n` 被 `AgentsConfig.tsx:157`、`ModelSelector.tsx:62`、`FileViewer.tsx:227,295,430,602` 等大量组件消费 |
| `hooks/useIsMobile.ts` | `useIsMobile(): boolean` L43；`useIsNarrowMobile(): boolean` L48；`useIsTouchDevice(): boolean` L58 | **裸 boolean** | 无参 | `AppShell.tsx:90,91`、`ChatWindow.tsx:251`、`ChatInput.tsx:655,656`、`AgentsConfig.tsx:156`、`ModelSelector.tsx:63` |
| `hooks/useKeyboardShortcuts.ts` | `registerAbortHandler(handler): void` L15；`useGlobalKeyboardShortcuts(options): void` L42 | 无返回（`void`）+ 一个模块级注册函数 | options 对象（`UseGlobalKeyboardShortcutsOptions` L23-29） | hook 在 `AppShell.tsx:800`；`registerAbortHandler` 在 `ChatWindow.tsx:468` |
| `hooks/useResizablePanel.ts` | `export function useResizablePanel(options: UseResizablePanelOptions)` L60 | 对象 `{ isResizing, panelRef, reclampWidth, resetWidth, separatorProps, width }` L261-284 | options 对象（L23-35） | `AppShell.tsx:244`（sidebar）、`AppShell.tsx:255`（right panel） |
| `hooks/useTheme.ts` | `export function useTheme()` L114 | 对象 `{ theme, preference, setThemePreference, isDark }` L163-168 | 无参 | `AppShell.tsx:88`（只调用不用值）、`SettingsPanel.tsx:67`、`FileViewer.tsx:1136`、`MermaidBlock.tsx:38,270` |
| `hooks/useViewportHeight.ts` | `useViewportHeight(): void` L48；`shouldUseVisualViewportHeight(state): boolean` L12；`KEYBOARD_RETRY_DELAYS` L41 | **void**（纯副作用：写 CSS 变量 `--app-viewport-height`） | 无参 | `AppShell.tsx:92` |

### 1.2 从表格能直接得出的惯例

1. **一个 hook 一个文件，文件名 = hook 名**（`useTheme.ts` 导出 `useTheme`），没有 `hooks/index.ts`。
2. **多 hook 同域时才合并到一个文件**：`useIsMobile.ts` 同时导出 `useIsMobile/useIsNarrowMobile/useIsTouchDevice`
   （L43/48/59），三者共享 `subscribeToQuery` / `queryMatches` 私有实现（L15-24）——合并的理由是
   **共享私有实现 + 同一主题域**，不是历史偶然。
3. **纯逻辑抽成同文件的具名导出以便单测**：`useViewportHeight.ts:12` 的 `shouldUseVisualViewportHeight`、
   `useChatAppearance.ts:31,37,60` 的三个 `clamp*` / `readStored*`、`useResizablePanel.ts` 里的
   `readStoredWidth`（L45，**未导出**，仅内部用）。这条区分很关键：导出纯函数 = 有测试（见 §1.3）。
4. **`useAgentSession` 是唯一"上帝 hook"**：2707 行、46 个 `useState`、4 个 `useReducer`、49 个 `useRef`、
   59 个 `useCallback`。它是本项目的既有现实，spec 应描述它而不是要求拆分（拆分会连带动 `ChatWindow`
   的 20+ 个 props 搬运 + 8 个 `on*Change` 回调）。

### 1.3 hook 的测试惯例（两套，且都是刻意的）

`hooks/` 下 8 个测试文件分两类：

**A. 源码断言测试（7/8）** —— 用 `readFile` 读 `.ts` 源码，再用 `indexOf` 切片做字符串断言：

```js
// hooks/useAgentSession.test.mjs:1-4, 7-12
const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");
test("keeps the session event stream open through the idle grace window", () => {
  const finishSource = source.slice(
    source.indexOf("const finishPromptWithoutStream"),
    source.indexOf("const waitForPromptSettlement"),
  );
```

同模式：`hooks/useAgentSession.pending-ask.test.mjs:1-4`、`hooks/useAgentSession.pending-ask-rehydrate.test.mjs`、
`hooks/useAgentSession.trellis.test.mjs`、`hooks/model-loading.test.mjs`（额外用 `typescript` + `node:vm`
做语法级校验）、`hooks/model-scope-startup.test.mjs`、`hooks/model-switching.test.mjs`。

**B. 纯函数导入测试（1/8）** —— 用 `jiti` 直接 import `.ts`，只测导出的纯函数：

```js
// hooks/useViewportHeight.test.mjs:1-6
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { KEYBOARD_RETRY_DELAYS, shouldUseVisualViewportHeight } = await jiti.import("./useViewportHeight.ts");
```

**结论（必须写进 spec）**：项目里**没有 React 渲染测试**。原因链条很硬 —— `package.json` 无 jsdom、
无 `@testing-library/react`；`useAgentSession` 的行为大量依赖 `EventSource` / `fetch` / `document.visibilityState`。
因此既有做法是：(a) 把可测逻辑抽成**同文件导出的纯函数**，用 `jiti.import` 测；(b) hook 内部的关键时序
（SSE grace window、run id 守卫）用**源码子串断言**锁住，防止后续重构悄悄删掉保护逻辑。新写 hook 时应
沿用：能抽纯函数就抽，无法渲染测试的时序约束就写源码断言。

测试文件命名：`useX.test.mjs`（主测试）+ `useX.<feature>.test.mjs`（特性测试）；`useAgentSession`
的子特性测试甚至可以不带 `use` 前缀（`model-loading.test.mjs`）。测试文件与源文件**同目录**。

---

## 2. hook 写法惯例

### 2.1 参数：options 对象 vs 位置参数

**options 对象**（参数 ≥ 2 个，或有"可选项/回调"语义时）：

- `hooks/useAgentSession.ts:305` + `UseAgentSessionOptions` L164-186（21 个字段，其中 8 个是可选 `on*Change` 回调）
- `hooks/useResizablePanel.ts:60` + `UseResizablePanelOptions` L23-35（11 个字段，含 `cssVariable: \`--${string}\`` 模板字面量类型）
- `hooks/useKeyboardShortcuts.ts:42` + `UseGlobalKeyboardShortcutsOptions` L23-29（2 个字段，但都是可选回调/值）

**位置参数**（参数 ≤ 1 个，或纯回调/纯值）：

- `hooks/useDragDrop.ts:5` → `useDragDrop(onDrop: (files: File[]) => void)`；调用点 `ChatWindow.tsx:725` `useDragDrop(onDrop)`
- `hooks/useFileIndex.ts:94` → `useFileIndex(cwd?: string)`；调用点 `ChatWindow.tsx:761` `useFileIndex(messageCwd)`

**无参 hook** 占多数（5/13：`useAudio`、`useChatAppearance`、`useTheme`、`useViewportHeight`、`useI18n`），
因为它们的输入全部来自模块级 store 或浏览器 API。

判据总结：**0 或 1 个入参 → 位置参数；≥2 个或含回调 → options 对象**。options 接口命名固定为
`Use<HookName>Options`，与 hook 同文件、**不导出**（`UseAgentSessionOptions` 是唯一导出例外，L164，因为
`ChatWindow` 需要构造它）。

### 2.2 返回值：对象优先，裸值仅限"单值 + 无动作"

**对象（8/13）**：`useAgentSession` L2678、`useAudio` L81、`useChatAppearance` L134、`useDragDrop` L39、
`useResizablePanel` L261、`useTheme` L163、`useI18n` L78-79（`I18nContextValue`）、`useFileIndex`（返回类型
自带 `{lookup, status}` 结构，L94）。

**裸值（4/13，全是 boolean/void）**：`useIsMobile` L44/49/59、`useViewportHeight` L48（void）。

**元组（0/13）**：`grep` 全部 hook 无 `return [`, 无 `as const` 元组返回。这是一个明确的项目禁区 ——
即使像 `useResizablePanel` 返回 6 个字段也用对象（L261-284）。

**两个加料惯例**：

1. **返回值里带 ref**：`useAudio` L81 返回 `soundEnabledRef`，让 `ChatWindow.tsx:265-267` 在回调里读最新值
   而不必把它加入依赖数组；`useAgentSession` 也返回一批 ref（L2699-2701 `sessionIdRef, scrollContainerRef,
   lastUserMsgRef, pendingScrollToUserRef, initialScrollDoneRef`，L2706 `handleAgentEventRef`）。
   **这是本项目的既定逃生舱**，spec 应写明用途（"跨渲染读取最新值"）而不是列为反模式。
2. **稳定引用的回调组**：`useFileIndex` / `useChatAppearance` / `useTheme` 把 setter 定义在**模块作用域**
   （`useChatAppearance.ts:127-128` `const setWidth = ...`），因此 hook 返回值里的 setter **引用恒定**，
   不需要 `useCallback`。调用点 `SettingsPanel.tsx:68` 直接解构使用。
3. **`separatorProps` 式的 props 打包**：`useResizablePanel.ts:263-283` 返回一个可直接 `<div {...separatorProps}>`
   的 props 对象（含 `role: "separator" as const`、`tabIndex: 0`、6 个 pointer 事件 + 键盘事件 + 4 个 aria 属性）。
   a11y 属性由 hook 负责，调用点不做拼装。

### 2.3 `useCallback` / `useMemo` 密度与理由

实测计数（`grep -c`）：

| 文件 | useState | useEffect | useCallback | useMemo | useRef | useReducer | useLayoutEffect |
|------|---------:|----------:|------------:|--------:|-------:|-----------:|----------------:|
| `useAgentSession.ts` | 46 | 18 | **59** | 2 | 49 | 4 | 3 |
| `useResizablePanel.ts` | 4 | 5 | **14** | 0 | 4 | 0 | 0 |
| `useAudio.ts` | 2 | 1 | 4 | 0 | 3 | 0 | 0 |
| `useDragDrop.ts` | 2 | 0 | 4 | 0 | 2 | 0 | 0 |
| `useI18n.tsx` | 3 | 1 | 2 | **3** | 0 | 0 | 0 |
| `useFileIndex.ts` | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| `useTheme.ts` | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| `useChatAppearance.ts` / `useIsMobile.ts` / `useKeyboardShortcuts.ts` / `useViewportHeight.ts` | 0 | 0-1 | 0 | 0 | 0 | 0 | 0 |

**观察到的规则**：

- `useCallback` 的使用**不是风格偏好，而是依赖驱动的**：凡是出现在另一个 hook 依赖数组里的函数
  （`useResizablePanel` 的 `commitWidth` / `finishResize` / `applyLiveWidth` 被 `onPointerMove`、
  `onPointerUp`、`useEffect` 引用）都必须 `useCallback`，否则依赖数组每次变化 → 事件重绑 → 拖动中断。
  `useResizablePanel.ts:81-115`（`effectiveMaxWidth` L81 → `clampWidth` L86 → `applyLiveWidth` L91 →
  `commitWidth` L96 的四层 `useCallback` 链）是最典型的证据。
- 在**模块作用域**定义、引用恒定、或永远不会进入依赖数组的函数**不加** `useCallback`
  （`useChatAppearance.ts:127`、`useTheme.ts` 的 `ensureState` 等模块函数）。
- `useMemo` 只用在 **3 处 `useI18n.tsx`**（L45 支持语言列表、L50 消息表、L75 context value）和
  **2 处 `useAgentSession.ts`**（L505 `sessionStats`、L673 `trellisSelection`）。全项目 hook 层 `useMemo` 共 5 处 ——
  **`useMemo` 在本项目属于低频工具**，写 spec 时应明确"不要为了微优化加 `useMemo`"。
- `useReducer` 用于**离散状态机**，且有配套的纯 reducer 便于推理：`noticeReducer`（`useAgentSession.ts:237-265`，
  visible/pending 两段队列 + `exiting` 过渡态）、`streamReducer`（来自 `lib/`，L322 `useReducer(streamReducer, INITIAL_STREAMING_STATE)`）、
  `reduceTrellisStore`（L362 `useReducer(reduceTrellisStore, undefined, createTrellisStore)`，注意 **lazy init** 第三参）。
- `useLayoutEffect` 只在**布局同步必须领先 paint** 时使用：`useAgentSession.ts:444-447` 按 session 恢复 tool preset、
  L2589 的滚动定位（`messages.length` 变化立即定位用户消息/底部）。

### 2.4 `useEffect` 依赖数组与 eslint 规则

**eslint 配置**（`eslint.config.mjs` 全文 15 行）：

```js
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
const eslintConfig = [
  { ignores: [".agents/**", ".pi/**", ".trellis/**"] },
  ...coreWebVitals,
  ...typescript,
  { rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
  } },
];
```

要点（对写 spec 极关键）：

- `react-hooks/exhaustive-deps` **保持开启**（来自 `core-web-vitals`），因此依赖数组必须写全 ——
  项目里只有 **6 处**显式 disable（`hooks/useAgentSession.ts:690,2558`、`components/FileExplorer.tsx:274`、
  `components/SkillsConfig.tsx:606`、`components/ModelsConfig.tsx:312`、`components/PluginsConfig.tsx:726`）。
  这 6 处的**共同语义都是"mount-only"或"只在 key 变化时执行"**：
  ```ts
  // hooks/useAgentSession.ts:687-691 —— mount-only 建流/装载 session
  useEffect(() => {
    resetTrellisScope();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);
  ```
  ```ts
  // hooks/useAgentSession.ts:2558 —— 卸载时清理
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  ```
  即：**允许 disable，但必须紧邻注释说明意图，且 disable 只用于"effect 必须只跑一次/只在显式 key 变化时跑"**。
- 三条被关闭的规则是 React Compiler 系新规则（`immutability` / `refs` / `set-state-in-effect`）。
  项目**刻意依赖**这三种写法：
  - render 期写 ref：`useAgentSession.ts:371` `if (trellisOwnerRef.current === 0) trellisOwnerRef.current = nextTrellisOwner();`、
    L398 `onSubagentRecordsChangeRef.current = onSubagentRecordsChange;`、L420 `sessionPropIdRef.current = session?.id ?? null;`、
    L426-440 render 期构造 `new AgentEventConnection(...)`（`if (!eventConnectionRef.current)`）。
  - effect 里 setState：`hooks/useTheme.ts:115` 之后的 `subscribe` 内 `ensureState()`；`hooks/useIsMobile.ts` 无；
    `useResizablePanel.ts:81` `useEffect(() => { setMounted(true); }, [])`。
  - 因此 spec 必须写："这三条规则在本仓库被关闭，允许 render 期初始化 ref 与 effect 内同步 setState；
    新增代码应沿用同一模式，不要引入与之一致性冲突的写法。"

### 2.5 cleanup 模式（四类，各举真实例子）

**A. EventSource —— 显式 `close()`，且要防"迟到的 handler"**

`hooks/useAgentSession.ts` 自己不直接管 ES 生命周期，而是把 `new EventSource` 包进
`lib/agent-event-connection.ts:48` 的 `AgentEventConnection` 类；`createSource` 在 L422 注入：

```ts
eventConnectionRef.current = new AgentEventConnection({
  createSource: (sid) => new EventSource(`/api/agent/${encodeURIComponent(sid)}/events`),   // L422
  onEvent: (event) => handleAgentEventRef.current?.(event as AgentEvent),                   // L423
  shouldMaintain: (sid) => ( ... ),                                                          // L424-433
  readinessTimeoutMs: EVENT_STREAM_READY_TIMEOUT_MS,
  reconnectDelayMs: EVENT_STREAM_RECONNECT_DELAY_MS,
});
```

类内 `discard()` 同时做三件事：`attempt.fail(error)`（让等待方 reject）、`source.close()`、清空 `this.current`
（`lib/agent-event-connection.ts:186-190`）。**这是"句柄 + 身份判定"双守卫**：所有 handler 先判
`if (this.current !== connection) return;`（L136、L155、L178）。

组件层更简单的写法（`components/FileViewer.tsx:480-508`）可直接作为"普通 SSE 订阅"范式：

```tsx
const es = new EventSource(getFileApiUrl(filePath, "watch", sourceSessionId));
esRef.current = es;
es.addEventListener("connected", () => { setWatching(true); synchronize(); });
es.addEventListener("change", (e) => { ... });
es.onerror = markDisconnected;
return () => {
  active = false;                 // 让 in-flight fetch 的 .then 失效
  es.close();
  if (esRef.current === es) esRef.current = null;
};
```
（同样模式重复 5 次：`FileViewer.tsx:480,652,805,989,1295`。）

**B. AbortController —— cleanup 里 `abort()`**

```ts
// hooks/useAgentSession.ts:2605-2626
useEffect(() => {
  const controller = new AbortController();
  (async () => { for (let attempt = 0; ; attempt++) { ... await loadModels(controller.signal); ... } })();
  return () => controller.abort();
}, [loadModels, modelsRefreshKey]);
```
取消后的错误处理是**按类型判定**而非吞掉：`if (e instanceof DOMException && e.name === "AbortError") return;`（L2614）。
`components/SessionSidebar.tsx:780-847` 的轮询也用它：`const current = new AbortController(); controller?.abort();`
（L793-795，**新请求前先取消旧的**），并在 cleanup 与 `visibilitychange → hidden` 时 `controller?.abort(); controller = null;`。

**C. 定时器 —— `setTimeout`/`setInterval` 句柄存 ref 或局部变量，cleanup 必须清**

- 局部变量 + cleanup：`useAgentSession.ts:2605-2626` 的 retry 循环；`useAgentSession.ts:2676-2680` 的
  `const t = setTimeout(() => setCompactResult(null), 6000); return () => clearTimeout(t);`
- ref 持有（因为要跨 effect 取消）：`eventStreamGraceTimerRef` / `eventStreamGraceGenerationRef`，
  取消函数 `cancelEventStreamGrace`（L1032-1040）先 `generation += 1` 再 `clearTimeout` —— **generation
  计数是与 clearTimeout 配对使用的**，防止已排队的异步回调在取消后仍然生效。
- **定时器集合（多个可重入 setTimeout）**：`hooks/useViewportHeight.ts:44-46` 用
  `const retryTimers = new Set<ReturnType<typeof setTimeout>>()`，`clearRetries()`（L117-120）遍历清理；
  cleanup 里 `clearRetries()` + `removeProperty("--app-viewport-height")`（L171-173）。
- 轮询 + 可见性暂停：`components/SessionSidebar.tsx:779-847`（`RUNNING_SESSIONS_POLL_MS = 2500`，L170）
  用 `setTimeout` 自调度（不是 `setInterval`），`schedule()`（L785）在 `document.visibilityState !== "visible"` 时
  **不排下一次**，`visibilitychange` 回到 visible 时立即 `poll()`。

**D. `requestAnimationFrame` —— cleanup 里 `cancelAnimationFrame` + 句柄置 null**

```ts
// hooks/useAgentSession.ts:1696 附近
liveFollowFrameRef.current = requestAnimationFrame(() => { ... });
// hooks/useAgentSession.ts:2502-2504 / 2552-2556（卸载 effect 内）
if (liveFollowFrameRef.current !== null) {
  cancelAnimationFrame(liveFollowFrameRef.current);
  liveFollowFrameRef.current = null;
}
```
同样在 `lib/agent-event-connection.ts` 之外的 `useViewportHeight.ts:99-110` 用 `frameId` 局部变量 +
`if (frameId !== null) window.cancelAnimationFrame(frameId)`（L167）。

**E. 事件监听的"注册/注销必须字面成对"**：`useViewportHeight.ts:150-173` 注册 8 个监听
（`viewport.resize`/`scroll`、`window.resize`/`focusin`/`focusout`/`keydown`(capture)/`input`(capture)/`pageshow`），
cleanup 里逐个 `removeEventListener`。注意 **capture 选项必须一致**：注册用 `true`，注销也用 `true`（L159-160 / L169-170）。

---

## 3. 模块级缓存与订阅范式

### 3.1 `globalThis.__pi*` 注册表（**服务端**，抗 Next.js 热重载）

全部出现点（`grep -rn "globalThis\.__pi"`，共 18 个不同键）：

| 键 | 定义位置 | 用途 |
|----|---------|------|
| `__piSessions` | `lib/rpc-manager.ts:1858-1871` | `AgentSessionWrapper` 每 session 一个；L1860-1862 在首次创建时注册 `process.on("exit"/"SIGINT"/"SIGTERM")` 清理 |
| `__piStartLocks` | `lib/rpc-manager.ts:1922-1923` | 并发 `startRpcSession()` 共享同一启动 Promise |
| `__piStartingSessionCwds` | `lib/rpc-manager.ts:1936-1937` | 启动中的 cwd 去重 |
| `__piAskUserStore` | `lib/rpc-manager.ts:223-224` | `PendingAskStore` 单例 |
| `__piSubagentRuns` / `__piSubagentQueue` | `lib/subagent-runtime.ts:87-93` | 子代理运行表 + 队列 |
| `__piSessionListCache` / `__piSessionListPromise` / `__piSessionListGeneration` / `__piSessionListPromiseGeneration` / `__piSessionPathCache` / `__piPathToSessionIdCache` | `lib/session-reader.ts:334-495` | 会话列表缓存 + **single-flight** + 代际失效（L480-485 `invalidateSessionListCache()` 把 generation +1 并清缓存） |
| `__piProjectCache` | `lib/worktree.ts:48-53` | 项目解析缓存（+ `invalidateProjectCache()`） |
| `__piModelsCacheState` | `lib/models-cache.ts:30-37` | 模型列表缓存 |
| `__piModelsDevCatalogCache` | `app/api/models-config/catalog/route.ts:26` | models.dev 定价目录 TTL 缓存 |
| `__piFileIndexCache` | `app/api/file-index/route.ts:59-60` | 文件索引缓存（与客户端 `hooks/useFileIndex.ts:23` 的 `FILE_INDEX_TTL_MS = 10_000` **对齐**） |
| `__piTrustedAttachmentCwds` | `app/api/attachments/route.ts:32-42` | 附件 cwd 信任表 |
| `__piAllowedRootsCache` / `__piAdditionalAllowedRoots` | `lib/file-access.ts:22,58` / `lib/allowed-roots.ts:20-30` | 文件访问 allow-list |
| `__piWebTerminals` | `lib/terminal-manager.ts:33-42` | PTY 注册表 |
| `__piWebPushNotifier` | `lib/web-push.ts:183-186` | 懒初始化的 Promise 单例 |
| `__piLoginCallbacks` | `app/api/auth/login/[provider]/route.ts:13-14` | OAuth 手动码回调 |
| `__piWebAppUpdateCache` | `app/api/app-update/route.ts:24` | 更新检查缓存 |

**理由（原话证据）**：`AGENTS.md:169` —— "`globalThis` survives Next.js hot-reload; plain module-level Map does not"。
代码注释同样直白：`lib/terminal-manager.ts:33-34`、`lib/session-reader.ts:344`。

**`Symbol.for(...)` 变体**（跨模块实例/跨 bundle 共享同一份状态，且不污染 `globalThis` 的字符串键空间）：
`lib/session-liveness.ts:106,118`（`SESSION_LIVENESS_REGISTRY_KEY` / `SESSION_LIVENESS_LEASES_KEY`）、
`lib/auth-throttle.ts:42`（`STATE_KEY` = `"pi-web:auth-throttle"`）。`AGENTS.md:241` 记录了原因。

**写法惯例**：一律 `getXxx()` 懒初始化函数 + `??=`，例如
`lib/rpc-manager.ts:1858` `if (!globalThis.__piSessions) { globalThis.__piSessions = new Map(); ... }`；
`app/api/models-config/catalog/route.ts:26` 更紧凑 `return globalThis.__piModelsDevCatalogCache ??= { entries: [], expiresAt: 0 };`。

### 3.2 `useSyncExternalStore`（**客户端**跨组件共享的官方通道）

4 个 hook 使用，共 5 个调用点：

| hook | 调用点 | snapshot 类型 |
|------|--------|--------------|
| `useTheme` | `hooks/useTheme.ts:115` | `ThemeState = { preference, theme }`（**对象**，因此必须有稳定的 `state` 引用） |
| `useIsMobile` | `hooks/useIsMobile.ts:44,49,59` | `boolean` |
| `useChatAppearance` | `hooks/useChatAppearance.ts:133` | `ChatAppearance = { width, fontSize }`（对象，模块级 `appearance` 变量做引用稳定） |
| `useFileIndex` | `hooks/useFileIndex.ts:100` | `FileIndexState`（对象，来自 `cache.get(cwd)?.state`） |

**统一结构**（三个 hook 逐字同构，spec 可直接给模板）：

```ts
// 模块作用域：单例状态 + listener 集合
let state: T | null = null;                  // useTheme.ts:24 / useChatAppearance.ts:27
const listeners = new Set<() => void>();     // useTheme.ts:22 / useChatAppearance.ts:28 / useFileIndex.ts:33
function emit() { listeners.forEach((cb) => cb()); }

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  ensureState();                             // 首次订阅时惰性初始化（可含 DOM 副作用）
  ensureSystemListener();                    // 顺便装系统级监听（theme 专用）
  return () => { listeners.delete(cb); };
}
function getSnapshot(): T { return ensureState(); }
function getServerSnapshot(): T { return SERVER_SNAPSHOT; }   // ← 必须有
```

`useFileIndex.ts:100` 需要按 cwd 分片，因此 snapshot 读取用 `useCallback` 包一层：
`const readSnapshot = useCallback(() => (key ? getSnapshot(key) : EMPTY_STATE), [key]);`（L100-103）。
**这是"参数化 snapshot"的必备写法**（`getSnapshot` 必须是稳定函数引用，否则 React 会无限重渲染）。

`useIsMobile.ts` 更进一步把 subscribe/getSnapshot 提升为**模块级常量**（L27-35），避免每次渲染新建函数。

**getServerSnapshot 的具体形式**：
- `useIsMobile.ts:33-35` → 恒 `false`（注释 L38-41 说明"SSR 先按桌面渲染，hydrate 后同步"）
- `useTheme.ts:18` → `const SERVER_SNAPSHOT: ThemeState = { preference: "auto", theme: "light" }`
- `useChatAppearance.ts:133` → 内联 `() => DEFAULT_APPEARANCE`
- `useFileIndex.ts:100` → 内联 `() => EMPTY_STATE`

### 3.3 Context（**只有两处**，且用途受限）

`grep -rn "createContext"` 全仓库只有 2 个：

1. `hooks/useI18n.tsx:17-18` —— `I18nContext`，跨 app 的界面语言。Provider 挂在 `app/page.tsx`、
   `app/login/page.tsx`。这是**真正的全局 Context**。
2. `components/FileIndexContext.tsx:12` —— `FileIndexContext`，**只用于避开 prop drilling 到深层渲染器**。
   注释写明了边界（L7-11）：
   > "Distributes the current conversation's file index to deep renderers without prop drilling. `MarkdownBody`
   > is also used outside the chat (the file viewer's markdown preview); there the provider is simply absent and
   > the default `null` keeps today's rendering."

即：**数据来源仍是 `useFileIndex` 的模块级 cache（§3.2），Context 只负责"把已经算好的值传给深层子组件"**。
Provider 在 `ChatWindow` 侧（`ChatWindow.tsx:761` 取值），消费方是 `MarkdownBody` 等深层组件。
`useI18n.tsx:82-84` 还有一个惯例：**Context 缺失时抛异常**
（`throw new Error("useI18n must be used inside I18nProvider")`），而 `useFileIndexContext`（L25）
**缺失时返回 null 静默降级**。两者的差别就是"必需 vs 可选"。

### 3.4 为什么不用 Context 而用模块级 store —— 代码里的原始理由

`hooks/useFileIndex.ts:5-13` 的 doc comment 是最直接的证据：

> A conversation mounts many `MarkdownBody` / `<pre>` renderers; they all need the same
> `/api/file-index?cwd=` answer. A module-level cache plus `useSyncExternalStore` dedupes the request and
> re-renders every consumer when the index arrives (**a plain prop would be blocked by `MessageView`'s memo**).

结论：**当消费方被 `React.memo` 隔断、或消费方数量多到 Context value 频繁变化会引发大面积重渲染时，
用模块级 store + `useSyncExternalStore`**；Context 只用于"配置型单值"（locale）或"显式下传给深层渲染器"（file index）。

### 3.5 事件订阅 / 广播的既有做法

- **自定义 DOM 事件（`CustomEvent` + 类型增强）**：唯一一处 `lib/session-row-context-menu.ts`。
  事件名常量 + `declare global { interface WindowEventMap { ... } }`（L10-15）让 `window.addEventListener`
  获得类型；派发函数用 `cancelable: true` 让**同步监听者可以"认领"**事件：
  ```ts
  // lib/session-row-context-menu.ts:19-27
  export function dispatchSessionRowContextMenu(detail, target = window): boolean {
    const event = new CustomEvent<...>(SESSION_ROW_CONTEXT_MENU_EVENT, { cancelable: true, detail });
    return !target.dispatchEvent(event);   // 被 preventDefault 即视为已认领
  }
  ```
- **模块级函数注册（"无事件的事件"）**：`hooks/useKeyboardShortcuts.ts:13-16` 的
  `let globalAbortHandler: (() => void) | null = null;` + `registerAbortHandler()`。
  注释（L7-9）明确理由：**"ChatWindow registers the abort handler here so that the global Esc listener in
  AppShell can call it without prop-drilling"**。注册点在 `ChatWindow.tsx:468`
  `registerAbortHandler(sessionBusy ? handleAbort : null);`（每次 render 覆盖，传 `null` 即注销）。
  这个 module-level 变量的**代价**是同一时刻只允许一个 owner —— spec 应把它记为"单 owner 全局回调"范式。
- **`BroadcastChannel`、`window` 的 `storage` 事件**：`grep` 全仓库**均无**。跨标签页同步未实现
  （唯一的跨设备同步走服务端：`useAgentSession.ts:1488-1500` 的 pendingAsk 轮询）。
- **服务端推送**：`SSE`（`EventSource`）。全仓库 8 处，见 §2.5。
- **`useAgentSession` 的对外回调式广播**：hook 通过 options 里的 8 个 `on*Change` 把内部派生状态"推"给
  `ChatWindow`（`UseAgentSessionOptions` L170-180：`onBranchDataChange`、`onSubagentRecordsChange`、
  `onSystemPromptChange`、`onSystemToolsChange`、`onSystemInfoLoaderChange`、`onSessionStatsPanelOpen` 等），
  实现方式是 `useEffect(() => { onXChange?.(x); }, [x, onXChange])`（如 L2560-2566 `onSystemPromptChange`、L2565-2568 `onSystemInfoLoaderChange`、L2570-2573 `onBranchDataChange`）。
  回调本身存 ref 以避开依赖循环：`useAgentSession.ts:398` `onSubagentRecordsChangeRef.current = onSubagentRecordsChange;`

### 3.6 客户端模块级非 hook 状态（不在 hook 文件里的）

| 模块 | 机制 | 消费者 |
|------|------|--------|
| `lib/draft-store.ts` | 模块级 `const drafts = new Map<string, ChatDraft>()`（L14）+ `getDraft/setDraft/clearDraft/rekeyDraft`（**故意无订阅**，草稿只在组件挂载/卸载时读写） | `useAgentSession.ts:26`（`clearDraft, rekeyDraft, restoreDraftSubmission`）、`ChatInput` |
| `lib/tool-preset-preference.ts` | localStorage 读写纯函数 `getPreferredToolPreset/setPreferredToolPreset` | `useAgentSession.ts:445-447`、`ChatWindow`/`ChatInput` |
| `lib/thinking-expansion-preference.ts` | localStorage 纯函数 `isThinkingExpanded/setThinkingExpanded` | MessageView 侧 |
| `lib/workspace-memory.ts` | localStorage 单键 map + `workspaceKeyOf()` | `AppShell.tsx:563,610,621,626,734,806` |
| `lib/settings-navigation.ts` | localStorage 单键 `{section, selections}` | SettingsPanel |
| `lib/file-explorer-state.ts` | localStorage 单键布尔 | FileExplorer |
| `lib/path-linkify.ts` | 纯函数 `buildFileIndexLookup` | `useFileIndex.ts:88` |
| `components/FileIndexContext.tsx` | Context（见 §3.3） | `MarkdownBody` 等 |

**关键区分**：`lib/draft-store.ts` 与 `lib/tool-preset-preference.ts` 是**模块级可变状态**，但因为
消费者是"挂载时读一次、卸载时写一次"，所以**没有** listener 集合 —— 只有需要"跨组件即时重渲染"的
（theme / mobile / chat appearance / file index）才配 `listeners: Set` + `useSyncExternalStore`。

---

## 4. 状态该放哪（分类 + 真实落点）

### 4.1 分类表

| 类别 | 落点 | 代表文件（file:line） | 备注 |
|------|------|---------------------|------|
| **服务端数据（读一次）** | `useEffect` 内裸 `fetch` + `useState` | `hooks/useAgentSession.ts:706` `loadSession`；`components/FileExplorer.tsx`、`SessionSearch.tsx`、`DirectoryPicker.tsx` | 无缓存层，无 react-query/SWR |
| **服务端数据（需跨组件去重）** | 模块级 cache + `useSyncExternalStore` | `hooks/useFileIndex.ts`（TTL 10s，L23）；服务端对应 `app/api/file-index/route.ts:59` | 双端 TTL 必须对齐 |
| **服务端数据（列表/轮询）** | `useEffect` + `setTimeout` 自调度 + `AbortController` + `visibilitychange` 暂停 | `components/SessionSidebar.tsx:779-847` | 2500ms；后台标签页完全停止 |
| **服务端数据（流）** | `EventSource`（包成类）+ 被动重连 + 就绪握手 | `hooks/useAgentSession.ts:420-441`、`lib/agent-event-connection.ts:48` | 见 §5 的陷阱 |
| **服务端数据（发命令）** | `lib/agent-client.ts:25` `sendAgentCommand()` 统一封装 | `hooks/useAgentSession.ts:34` import | 注释 L5 记录：之前同一段 5 行 fetch 重复 13 次 |
| **URL 状态** | `useSearchParams` + `router.replace(..., { scroll: false })` | `components/AppShell.tsx:85-86`、`lib/initial-navigation.ts:7-18` | 参数只有 3 个：`cwd` / `session` / `sidebar` |
| **跨组件共享（配置型单值）** | React Context | `hooks/useI18n.tsx:17` | locale |
| **跨组件共享（高频/被 memo 隔断）** | 模块级 state + listener Set + `useSyncExternalStore` | `hooks/useTheme.ts:22-24`、`hooks/useChatAppearance.ts:27-28`、`hooks/useIsMobile.ts:27-35` | 见 §3.2 |
| **跨组件共享（深层渲染器）** | Context 只做传递，数据源仍是模块级 store | `components/FileIndexContext.tsx:12` + `hooks/useFileIndex.ts` | 见 §3.3 |
| **持久化偏好** | 独立 `lib/*.ts` 纯函数 + localStorage | `lib/tool-preset-preference.ts`、`lib/thinking-expansion-preference.ts`、`lib/workspace-memory.ts`、`lib/settings-navigation.ts`、`lib/file-explorer-state.ts` | 见 §4.3 |
| **持久化偏好（无 lib 模块、就地读写）** | 组件/hook 内直接 `localStorage` | `hooks/useAudio.ts:27,59`、`components/AppShell.tsx:109,117`、`components/SessionSidebar.tsx:171-210`、`components/ProviderUsageSummary.tsx:25` | 新代码应优先走 `lib/*` 模块 |
| **组件内临时状态** | `useState` / `useReducer` | `useAgentSession.ts:313-367`（约 40 个 `useState`）、`SessionSidebar.tsx` 的 dropdown/`useScramble` | 默认选择 |
| **"最新值"镜像（避免依赖数组抖动）** | `useRef` + 每次 render 赋值 | `useAgentSession.ts:396-440`（49 个 ref）、`ChatWindow.tsx:257-259` | 见 §2.2 |
| **SSR 首屏需要的状态** | 内联 `<script>` 预置 DOM，hydration 用 `suppressHydrationWarning` | `lib/theme.ts:22` `THEME_INIT_SCRIPT`、`app/layout.tsx:56,72-73,77` | 见 §4.4 |

### 4.2 URL 状态的精确形态（`AppShell`）

- 读取：`components/AppShell.tsx:85-86`
  ```tsx
  const searchParams = useSearchParams();
  const [initialNavigation] = useState(() => getInitialNavigation(searchParams));
  ```
  **只在首次挂载时读取一次**（`useState` 惰性初始化），之后 URL 只是"写出去"的镜像。
- 解析：`lib/initial-navigation.ts:7-18` —— `cwd` / `session` / `sidebar=collapsed`；
  注意 **`cwd` 存在时 `sessionId` 强制为 null**（L12 `sessionId: requestedCwd ? null : searchParams.get("session")`）。
- 写入：`router.replace(\`?session=${encodeURIComponent(session.id)}\`, { scroll: false })`
  （`AppShell.tsx:640-643`、L771-774）；清空用
  `router.replace(window.location.pathname, { scroll: false })`（`AppShell.tsx:716`、L796）。
- **陷阱注释（必须进 spec）**：`AppShell.tsx:769-770`
  > "Skip router.replace when restoring from URL — the param is already correct and calling replace in
  > production Next.js triggers a Suspense remount loop"
- 另有防御性检查 `if (new URLSearchParams(window.location.search).get("session") !== s.id)`（L642）避免无意义
  的 `replace`。

### 4.3 localStorage 键命名惯例（**两套前缀并存，是既有现实**）

**A. `pi-*` 前缀（值型单键，hook 内部持有）**

| 键 | 位置 |
|----|------|
| `pi-theme` | `hooks/useTheme.ts:15`（并在 `lib/theme.ts:22` 的预置脚本里再次硬编码） |
| `pi-sound-enabled` | `hooks/useAudio.ts:27,59` |
| `pi-locale` | `hooks/useI18n.tsx:8` |
| `pi-tool-preset` | `lib/tool-preset-preference.ts:3` |
| `pi-thinking-expanded` | `lib/thinking-expansion-preference.ts:1` |
| `pi-chat-content-width` / `pi-chat-content-font-size` / `pi-chat-font-offset`(legacy) | `hooks/useChatAppearance.ts:8,12,13`（**导出常量**供测试与预置脚本使用） |
| `pi-sidebar-width` / `pi-right-panel-width` | `AppShell.tsx:252,264`（作为 `storageKey` 传入 `useResizablePanel`） |
| `pi-quote-selection-enabled` | `AppShell.tsx:109,117` |

**B. `pi-web:*` 前缀（结构型 / 命名空间键）**

| 键 | 位置 |
|----|------|
| `pi-web:last-open-by-workspace` | `lib/workspace-memory.ts:15` |
| `pi-web:settings-navigation` | `lib/settings-navigation.ts:12` |
| `pi-web:unread-session-ids` / `pi-web:last-custom-cwd` | `components/SessionSidebar.tsx:171,172` |
| `pi-web:file-explorer:open` | `lib/file-explorer-state.ts:1` |
| `pi-web:provider-usage:<providerId>` | `components/ProviderUsageSummary.tsx:25`（动态后缀） |
| `pi-web:session-row-contextmenu` | `lib/session-row-context-menu.ts:1`（**同名作 CustomEvent 事件名**） |

**可提取的规则（写进 spec 时建议按此描述，而非要求统一）**：
- 简单标量偏好 → `pi-*`；带命名空间语义 / 复合结构 / 可扩展子键 → `pi-web:*`。
- 值一律存字符串（布尔用 `String(bool)`，`useAudio.ts:59`；复合结构用 `JSON.stringify`，`workspace-memory.ts:56`）。
- **空集合要删除键**而不是存 `"[]"`：`SessionSidebar.tsx:207-210`、`workspace-memory.ts:74-77`。
- 所有读写包裹 `try/catch`，注释统一提到 **privacy mode / quota**（`useTheme.ts:32-34,68-70`、`useAudio.ts` 无 try（`localStorage` 直接调，L27/59，属少数派）、`useChatAppearance.ts:75-78`、`file-explorer-state.ts:29-32`、`workspace-memory.ts:64-66`）。
- **`lib/*-preference.ts` 类 helper 的签名惯例**：`(storage: StorageLike | null = getBrowserStorage())` ——
  把 storage 作为可注入的最后参数以便测试（`lib/tool-preset-preference.ts:13,25`、`lib/thinking-expansion-preference.ts`、
  `lib/workspace-memory.ts:44,60,73`、`lib/file-explorer-state.ts:17,29`、`lib/settings-navigation.ts`）。
  `getBrowserStorage()` 固定形如 `if (typeof window === "undefined") return null; try { return window.localStorage } catch { return null }`。
  **注意 `Hook` 内部的 localStorage 使用不走这个注入模式**（`useTheme.ts`、`useAudio.ts`、`useChatAppearance.ts` 各自内联）。

### 4.4 hydrate / SSR 安全（4 种真实手法）

1. **`getServerSnapshot` 返回"安全默认"**：`useTheme.ts:18,111`、`useIsMobile.ts:33-35`、
   `useChatAppearance.ts:133`、`useFileIndex.ts:100`。`useIsMobile.ts:38-41` 的注释是这个手法的说明模板：
   > "SSR-safe: renders as desktop (false) on the server and first client paint, then syncs to the real viewport
   > after hydration."
2. **`useState` 惰性初始化 + `typeof window` 守卫**：`useAudio.ts:25-30`
   ```ts
   const [enabled, setEnabled] = useState<boolean>(() => {
     if (typeof window === "undefined") return true;
     const stored = localStorage.getItem("pi-sound-enabled");
     return stored === null ? true : stored === "true";
   });
   ```
   但**首帧仍可能与服务端不同**，因此 `AppShell` 侧另有 `unlockAudio` 在用户手势时调用。
3. **`hydrated` 标志把"切换"推迟到 effect**：`hooks/useI18n.tsx:43-60`
   ```tsx
   const [locale, setLocaleState] = useState<Locale>(defaultLocale);   // 服务端与首帧都用 "en"
   const [hydrated, setHydrated] = useState(false);
   useEffect(() => { const next = readInitialLocale(); setLocaleState(next);
                     document.documentElement.lang = next; setHydrated(true); }, []);
   // L75 value.locale = hydrated ? locale : defaultLocale
   ```
   **这样 `t()` 在 hydration 前永远输出英文，不产生 hydration 不匹配**。
4. **内联脚本预置 DOM + `suppressHydrationWarning`**：`lib/theme.ts:22` 的 `THEME_INIT_SCRIPT` 在
   `<head>` 里同步设置 `document.documentElement.dataset.theme` 与 `dark` class（避免主题闪白）；
   `app/layout.tsx:56,77` 两处 `suppressHydrationWarning`。**代价**：`pi-theme` 这个键在
   `lib/theme.ts:22` 字符串与 `hooks/useTheme.ts:15` 各写一次 —— 改键名必须同时改两处（spec 应标为已知的重复）。

**未找到证据**：项目里**没有** `next/dynamic` 的 `ssr: false` 用法（`grep -rn "ssr: false\|dynamic(" ` 无结果），
所以"用 dynamic import 绕开 SSR"不是本项目惯例。

### 4.5 组件内临时状态

默认选择就是 `useState`/`useReducer`，且**用 `useReducer` 表达有状态机的状态**（§2.3）。
`SessionSidebar.tsx:369` 的 `useScramble(target, running)` 是一个**组件内私有 hook**（同文件定义、不导出、
不放在 `hooks/`）—— 说明"只服务单个组件的 hook 就地和组件同文件"是允许的。

---

## 5. 陷阱（真实踩坑，全部有代码注释或 AGENTS.md 依据）

| # | 陷阱 | 证据 |
|---|------|------|
| 1 | **不能在第一个 `agent_end` 就关闭 SSE**：一个逻辑 prompt 在 retry / compaction / extension 入队消息时会产生多个 `agent_end`；必须等 `prompt_done`/`agent_settled` + 宽容窗口 | `hooks/useAgentSession.ts:1573-1576` 注释原文；`AGENTS.md:206` |
| 2 | **空闲 SSE 有 30s 宽限期，宽限期内不复用就必须重连**：`EVENT_STREAM_IDLE_GRACE_MS = 30_000`（`useAgentSession.ts:192`），`scheduleEventStreamClose`（L1266）先查服务端是否真的空闲（`checkServerIdle`，L1281）再 `closeEvents()`；`agent_start` 取消该定时器（L1564）。**`cancelEventStreamGrace` 用 generation 计数而不是只 clearTimeout**（L1032-1040） | `hooks/useAgentSession.ts:192,1266-1327,1564`；`AGENTS.md:206` |
| 3 | **prompt run id 必须单调，且所有 late response 都要比对**：`promptRunIdRef`（L412）在 `handleSend` 里 `= current + 1`（L1889,1904）；`finishPromptWithoutStream`（L1329-1331）"Bail out before loadSession too: a stale finish for a previous run must not overwrite the messages of the run currently streaming"；`reconcileAgentState` L1431 "A slow response can straddle a run boundary ... everything in it is stale, drop it"；`agent_end` 的 fetch 回调 L1583-1591；`message_start`/`message_update` 在 `!agentRunningRef.current` 时直接忽略以防"ghost streaming bubble"（L1655-1658 注释） | `AGENTS.md:208`；`hooks/useAgentSession.ts:1329-1331,1431,1583-1591,1655-1658,1889,1904` |
| 4 | **`notifiedPromptRunIdRef` 防重复通知**：`notifyPromptStage`（L1259-1263）用 `notifiedPromptRunIdRef`（L396，初值 `-1`）保证同一次 run 只触发一次完成提示 | `hooks/useAgentSession.ts:396,1259-1263` |
| 5 | **必须用 `globalThis` 而不是模块级 Map**（服务端状态），否则 Next.js 热重载后丢失/重复创建 | `AGENTS.md:169`；`lib/terminal-manager.ts:33`、`lib/session-reader.ts:344`、`lib/rpc-manager.ts:1858` |
| 6 | **后台标签页必须暂停轮询，并在回到前台立即补一次**：`SessionSidebar.tsx` 的 `schedule()` 在非 visible 时不排下一次，`visibilitychange` → visible 立即 `poll()`（L785-790, L839-847）；`useAgentSession` 的 reconcile effect 同样在 `visibilitychange`/`online` 时立即 `reconcile()`（L1470-1481） | `AGENTS.md:205,207`；`SessionSidebar.tsx:170,779-847`；`useAgentSession.ts:1466-1481` |
| 7 | **`/api/sessions` 与 running poll 的竞态**：running 状态以轮询为准，迟到的 `/api/sessions` 响应不得覆盖它 —— 代码用 `runningPollAuthoritativeRef`（`SessionSidebar.tsx:506,797`）与注释 "Treat the fetched running set as an initial fallback only"（L590） | `SessionSidebar.tsx:506,590,797` |
| 8 | **`ChatWindow` 不能包 `handleAgentEventRef`**：`useAgentSession` 每次 render 都会重写该 ref，外部包装会在第一次 re-render 后被抹掉 —— 所以完成音走 `wrappedOnAgentEnd`（`ChatWindow.tsx:255-271`），注释写在 L255-257 | `ChatWindow.tsx:253-271` |
| 9 | **`React.memo` 会阻断 prop 下传**，深层渲染器的共享数据必须走 store → `hooks/useFileIndex.ts:5-13` doc comment 明说 "a plain prop would be blocked by `MessageView`'s memo" | `hooks/useFileIndex.ts:9-12` |
| 10 | **浏览器自动播放策略**：`AudioContext` 必须在用户手势中 `resume()`；所以有 `unlockAudio`（`useAudio.ts:49`）由 `ChatInput` 的交互控件调用，`playDoneSound`（L64）在 suspended 时先 `resume().then(play)` | `AGENTS.md:254`；`hooks/useAudio.ts:44-77` |
| 11 | **`AudioContext` 必须复用**，每次播放新建会泄漏/"contexts created outside user gestures start in suspended state" | `hooks/useAudio.ts:40-43` 注释、L44-52 `getCtx`；`AGENTS.md:253` |
| 12 | **iOS/WKWebView 键盘高度**：`visualViewport` 的 resize 可能晚于键盘动画或干脆不发；因此 focus 后按 `KEYBOARD_RETRY_DELAYS = [300,700,1200]` 重试（L41），并在 WebKit 早发 resize 时用 `requestAnimationFrame` 延后读取（L102-110）；`scrollTo(0,0)` **只在开关过渡时做一次**，否则会和橡皮筋滚动打架（L73-84） | `hooks/useViewportHeight.ts:32-46,73-84,102-110` |
| 13 | **`globalAbortHandler` 是单 owner**：`ChatWindow.tsx:468` 每次 render 覆盖/清空，多窗口或多 ChatWindow 会互相顶掉 | `hooks/useKeyboardShortcuts.ts:13-16`；`ChatWindow.tsx:468` |
| 14 | **`setPointerCapture` 的拖拽要在 blur/隐藏时取消**：`useResizablePanel.ts:218-236` 在 `isResizing` 时监听 `window.blur` 与 `visibilitychange` 调 `cancelResize`，否则 body 的 `cursor: col-resize`/`user-select: none` 会残留 | `hooks/useResizablePanel.ts:218-243`（另有卸载兜底 effect L238-245） |
| 15 | **`restoredRef` 保证"恢复存储值"只跑一次**，否则每次依赖变化都会把用户拖拽的宽度重置回存储值 | `hooks/useResizablePanel.ts:76,212-222` |
| 16 | **Next.js 生产环境在 URL restore 时调 `router.replace` 会触发 Suspense remount loop** | `components/AppShell.tsx:769-770` 注释 |
| 17 | **DragEvent 计数**：`dragenter`/`dragleave` 会因进入子元素成对抖动，必须用 `counterRef` 计数而不是布尔 | `hooks/useDragDrop.ts:7,12-14,21-27` |
| 18 | **`useAgentSession` 的 mount-only 卸载清理会取消 rAF、递增 `bashRecoveryIdRef`、取消 grace、关闭 SSE** —— 漏掉任一项都会留下悬挂副作用 | `hooks/useAgentSession.ts:2542-2558` |
| 19 | **`trellisOwnerRef` 的 owner 机制**：旧 keyed mount 的迟到 cleanup 不得清掉新 mount 已发布的状态；`AppShell` 只接受"当前显示 owner"的清空 | `hooks/useAgentSession.ts:370-371,692-703` |
| 20 | **草稿清理要延到微任务**，否则 StrictMode 的双 mount/unmount 会误删刚输入的草稿 | `hooks/useAgentSession.ts:2542-2550`（`queueMicrotask` + 双条件判定） |

---

## 6. 模板 section 的非适用分析

### 6.1 `hook-guidelines.md` 的模板 section 与真实文件对照

模板实际 section（读文件确认，`.trellis/spec/frontend/hook-guidelines.md`）：
`Overview` / `Custom Hook Patterns` / `Data Fetching` / `Naming Conventions` / `Common Mistakes`
（**不是** 委派说明里写的 Overview / Naming / Patterns / Testing / Common Mistakes —— 无 `Testing` section，多 `Data Fetching`）。

| 模板 section | 建议 | 理由（实证） |
|-------------|------|-------------|
| `Overview` | **保留，改名 `Hook Inventory`** | 项目有 11 个 hook、13 个导出、5 个未进 `AGENTS.md` File Map。清单本身就是最有价值的内容；`Overview` 这个词留不出位置给清单。 |
| `Custom Hook Patterns` | **保留，扩为 `Custom Hook Patterns（参数/返回值/ref/纯函数抽取）`** | 需要覆盖：options-object vs positional（§2.1）、对象返回与元组禁区（§2.2）、返回值带 ref（§2.2）、稳定 setter 定义在模块作用域（§2.2）、`useCallback` 依赖驱动（§2.3）、`useEffect` 与 6 处 disable（§2.4）、cleanup 四类（§2.5）。内容量远超一个 section，"Patterns" 建议再拆 3 个子标题。 |
| `Data Fetching` | **保留但内容大头应在 state-management.md** | 本项目没有数据请求库；"fetch 在哪发"本质是**状态放哪**的问题（§4.1 前 5 行）。建议 hook 侧只保留"hook 内如何取消/轮询/清理"（§2.5），把"哪类数据用哪种落点"整表移到 state-management.md，并互相加一句 cross-link。 |
| `Naming Conventions` | **合并进 `Overview / Inventory` 或保留为极短节** | 可写的规则只有 4 条（`use*`、文件名=hook 名、`Use<X>Options`、`useX.test.mjs`），撑不起独立 section。合并更省维护。 |
| `Common Mistakes` | **保留，改名 `Traps（本仓库踩过的坑）`** | §5 有 20 条带 file:line 的真实陷阱，是全篇最有价值的部分。"Common Mistakes" 太泛，改成 `Traps` 更贴合内容。 |
| （模板无）`Testing` | **新增 `Testing`** | 委派说明假定有，但文件里没有；而 8 个测试文件的"源码断言 + jiti 纯函数导入"双范式是**不写就没人知道**的强约定（§1.3），新 hook 的作者极可能去装 jsdom。**这是两个 spec 之外最该补的一节。** |
| （模板无）`Client-only / SSR safety` | **新增或并入 Patterns** | `"use client"` 11/11、`getServerSnapshot`、`hydrated` 标志、`typeof window` 守卫、`THEME_INIT_SCRIPT`（§4.4）。放 state-management 的 `Server State` 下面也可，但**读 hook 的人更可能先读 hook spec**，建议两边各放一句并 cross-link。 |

### 6.2 `state-management.md` 的模板 section

模板实际 section：`Overview` / `State Categories` / `When to Use Global State` / `Server State` / `Common Mistakes`。

| 模板 section | 建议 | 理由（实证） |
|-------------|------|-------------|
| `Overview` | **保留，篇幅压到 5 行以内**（"无状态库；Context 只有 2 处；主力是模块级 store + `useSyncExternalStore` + localStorage helper"） | 先把"没有 redux/zustand/react-query"讲清，否则读者会找库。 |
| `State Categories` | **保留，直接采用 §4.1 的分类表** | 表已含 10 类真实落点 + file:line。这是本篇主体。 |
| `When to Use Global State` | **保留，改名 `Which Sharing Mechanism to Pick`** | 项目里的决策不是"要不要 global"，而是**四选一**：模块级 store（`useSyncExternalStore`）/ Context / module-level 函数注册 / 回调 props（`on*Change`）。§3.2-3.5 给了判据（被 memo 隔断 → store；配置型单值 → Context；单 owner 命令 → register 函数）。 |
| `Server State` | **保留，拆成 `Server State (SSE + polling)` 与 `URL State`** | SSE 的 grace window + run id + reconcile 是**本项目最复杂的服务端状态**（§5 陷阱 1-4），而 URL 状态（§4.2）是完全不同的一类。混在一节会同时稀释两者。 |
| `Common Mistakes` | **保留，或与 hook spec 的 `Traps` 做去重** | 陷阱 5/6/7/16（globalThis 热重载、后台暂停轮询、poll 权威性、router.replace remount loop）属**状态类**，应放这里；陷阱 8/11/12/14/15/17（hook 内部实现）放 hook spec。**建议明确划界并互相 cross-link，避免两边各抄一半。** |
| （模板无）`Persistence` | **新增 `Persistence (localStorage)`** | §4.3 有 14 个键、两套前缀、`StorageLike` 注入签名、空集合删键、try/catch 惯例。这是新人最容易写错的地方（键名冲突、忘 catch、存 `"[]"`）。 |
| （模板无）`SSR / Hydration` | **新增或并入 Server State** | §4.4 的 4 种手法。 |

### 6.3 两篇的重合与切分边界（明确建议）

**重合点有 3 处**，建议按下表硬性划界：

| 重合主题 | 放 hook-guidelines | 放 state-management |
|---------|-------------------|---------------------|
| 数据获取 | **只讲"怎么在 hook 里取消/轮询/清理"**（`AbortController`、`visibilitychange` 暂停、`setTimeout` 自调度）—— §2.5 | **讲"哪类数据放哪"**（fetch in effect / 模块 cache / SSE / URL）—— §4.1 |
| `useSyncExternalStore` | 只提一句"跨组件共享状态的 hook 用这个范式，模板见 state-management" | **给完整模板与 4 个实例**（§3.2），含 `getServerSnapshot` 的三种形态与"参数化 snapshot 必须 `useCallback`" |
| 陷阱 | 只留 **hook 内部实现**类（SSE 生命周期细节、run id 守卫细节、ref 镜像、pointer capture、rAF、drag counter、AudioContext 解锁） | 留 **跨组件/生命周期**类（`globalThis` 热重载、后台暂停轮询、poll 权威性、`router.replace` remount、localStorage 键与 catch） |

**一句话边界**：`hook-guidelines.md` 回答「**怎么写一个 hook**」（签名、返回值、依赖、cleanup、测试、SSR 守卫）；
`state-management.md` 回答「**一份状态该放在哪**」（5 类落点 + 3 种共享机制 + 持久化 + URL）。
**两篇都必须在开头写一行 cross-link**，否则子代理只会加载其中一篇（per-task jsonl manifest 决定），
就会漏掉另一半。

---

## 7. 缺口与待确认（无代码证据，不应写进 spec）

1. **无 ESLint 对 hook 命名/文件放置的强约束**（没有 `eslint-plugin-react-hooks` 之外的定制规则，
   `eslint.config.mjs` 只关 3 条）。"hook 必须放 `hooks/`" 只是既有习惯，不是规则。
2. **无 React 渲染测试**，也没有计划引入的迹象。若团队想改，需要新增 jsdom/testing-library 依赖 —— 属产品决策。
3. **`localStorage` 键前缀不统一**（`pi-*` vs `pi-web:*`）没有迁移记录/ADR，视为历史遗留。
4. **`BroadcastChannel` / `storage` 事件完全未使用**，跨标签页同步无实现；不要在 spec 里暗示存在。
5. **`useAgentSession` 2707 行、59 个 `useCallback`、返回约 60 个 key** —— 是否有拆分计划无任何注释/ADR 证据。
   spec 应描述现状（`useAgentSession` 是 chat 领域的**唯一状态容器**），不要写"应该拆分"。
6. `docs/adr/` 只有 3 篇（`0001-isolate-project-command-environments.md`、`0002-chat-only-tool-selection.md`、
   `0003-built-in-subagent-toggle.md`），**均不涉及 hook 或前端状态管理**；因此本调研的权威性只来自代码与
   `AGENTS.md`，写 spec 时不应引用不存在的 ADR。
