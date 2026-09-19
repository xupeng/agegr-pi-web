# Hook 编写规范

> 本仓库 `hooks/` 下 11 个文件、13 个 hook 导出的真实写法：参数 / 返回值形状、依赖与 cleanup、
> 模块级订阅范式、测试方式，以及踩过的坑。
>
> **边界**：本篇回答「**怎么写一个 hook**」。如果你在纠结「**一份状态该放在哪**」（服务端数据、URL、
> 跨组件共享的机制选择、localStorage 持久化、SSR），看 [state-management.md](./state-management.md)。
> 两篇必须一起读，不要只加载其中一篇。

---

## Hook 清单（事实基线）

- `hooks/` 下 **11** 个源文件、**13** 个 hook 导出，**没有** barrel `index.ts`，**没有** `export default`。
- **11/11 文件第一行都是 `"use client";`** —— 本仓库所有 hook 都是客户端 hook。
- `AGENTS.md` 的 File Map 只列了 5 个 hook；真实文件为准，清单看这里。
- **没有**任何数据请求 / 状态库（无 react-query / SWR / zustand / jotai / redux）。

| 文件 | 导出签名（行号） | 返回值 | 参数风格 |
|------|------------------|--------|---------|
| `hooks/useAgentSession.ts` | `useAgentSession(opts: UseAgentSessionOptions)`（:305） | 83 个属性的对象（:2678） | options 对象（:164） |
| `hooks/useResizablePanel.ts` | `useResizablePanel(options)`（:60） | 对象 + `separatorProps`（:261） | options 对象（:23） |
| `hooks/useKeyboardShortcuts.ts` | `useGlobalKeyboardShortcuts(options)`（:42）+ `registerAbortHandler`（:15） | `void` + 模块级注册函数 | options 对象（:23） |
| `hooks/useDragDrop.ts` | `useDragDrop(onDrop: (files: File[]) => void)`（:5） | 对象（:39） | 位置参数（回调） |
| `hooks/useFileIndex.ts` | `useFileIndex(cwd?: string): FileIndexState`（:94） | 裸值结构（:18） | 位置可选参数 |
| `hooks/useAudio.ts` | `useAudio()`（:24） | 对象（:81） | 无参 |
| `hooks/useChatAppearance.ts` | `useChatAppearance()`（:132） | 对象（:134） | 无参 |
| `hooks/useTheme.ts` | `useTheme()`（:114） | 对象（:163） | 无参 |
| `hooks/useI18n.tsx` | `I18nProvider`（:42）/ `useI18n()`（:80） | 对象 `I18nContextValue` | 无参 / provider |
| `hooks/useIsMobile.ts` | `useIsMobile/useIsNarrowMobile/useIsTouchDevice()`（:43/:48/:58） | 裸 `boolean` | 无参 |
| `hooks/useViewportHeight.ts` | `useViewportHeight(): void`（:48）+ 纯函数（:12） | `void`（写 CSS 变量） | 无参 |

## 参数与返回值

### 参数：0–1 个用位置参数，≥2 个或含回调用 options 对象

判据（不是风格偏好）：

- **0 或 1 个入参 → 位置参数**：`useDragDrop(onDrop)`（`hooks/useDragDrop.ts:5`）、
  `useFileIndex(cwd?)`（`hooks/useFileIndex.ts:94`）。
- **≥2 个入参，或含可选回调 → options 对象**，接口名固定 `Use<HookName>Options`，与 hook 同文件。
  - `UseResizablePanelOptions`（`hooks/useResizablePanel.ts:23`，10 字段，**不导出**）
  - `UseGlobalKeyboardShortcutsOptions`（`hooks/useKeyboardShortcuts.ts:23`，2 个可选回调）
  - `UseAgentSessionOptions`（`hooks/useAgentSession.ts:164`，18 字段，**唯一导出**，因为 `ChatWindow` 需要构造它）
- **无参 hook 占多数**（8/13），因为输入全部来自模块级 store 或浏览器 API。

### 返回值：对象优先，元组是禁区

- **8/13 返回对象；3/13 返回 boolean；2/13 返回 void**（快捷键注册与视口副作用）。
- **0/13 返回元组**：全仓 `hooks/` 没有任何 `return [a, b]` 形态。即使像 `useResizablePanel`
  要暴露 6 个字段也返回对象（`hooks/useResizablePanel.ts:261-284`）。**不要引入 `[value, setValue]` 式元组。**
- **返回值里带 ref 是既定逃生舱**：`useAudio()` 返回 `soundEnabledRef`（`hooks/useAudio.ts:81`），
  让 `ChatWindow` 在回调里读最新值而不把它加入依赖数组；`useAgentSession` 也返回一批 ref
  （`hooks/useAgentSession.ts:2691-2693,2706`）。**用途是"跨渲染读取最新值"，不是反模式。**
- **稳定引用的 setter 定义在模块作用域**：`useChatAppearance.ts:127-128` 把 `setWidth` / `setFontSize`
  定义在模块里，因此 hook 返回值里的 setter **引用恒定**，无需 `useCallback`；调用点直接解构
  （`components/SettingsPanel.tsx:68`）。
- **a11y props 由 hook 打包**：`useResizablePanel` 返回可直接 `<div {...separatorProps}>` 的对象
  （`role`/`tabIndex`/pointer + keyboard + aria，`hooks/useResizablePanel.ts:263-283`），调用点不拼装。

### 纯逻辑抽成同文件导出的纯函数

把可测逻辑抽成**同文件具名导出**：`shouldUseVisualViewportHeight`（`hooks/useViewportHeight.ts:12`）、
`clamp*` / `readStored*`（`hooks/useChatAppearance.ts:31,37,60`）。**导出纯函数可直接测试**（见下）。

## 依赖数组、useCallback 与 cleanup

### `useCallback` 是依赖驱动的，不是风格

- 需要稳定身份、又会进入**另一个 hook 依赖数组**的 render 内函数常用 `useCallback`，
  避免无关重渲染触发事件重绑；不需要把 effect 内局部函数或模块级函数也包装一遍。
  最典型证据是 `useResizablePanel` 的四层链：`effectiveMaxWidth`(:81) → `clampWidth`(:86) →
  `applyLiveWidth`(:91) → `commitWidth`(:96)，再被 `onPointerMove` / `finishResize` 引用。
- **模块作用域定义、引用恒定、或永不进依赖数组的函数不加** `useCallback`（`useChatAppearance.ts:127`）。

### `useMemo` 是低频工具

全项目 hook 层只有 **5 处** `useMemo`（`useI18n.tsx:45,50,75` 三处；`useAgentSession.ts:505,673` 两处）。
**不要为了微优化加 `useMemo`。**

### `useReducer` 用于离散状态机

`noticeReducer`（`useAgentSession.ts:237-265`，visible/pending 两段队列 + `exiting` 过渡态）、
`streamReducer`（:322）、`reduceTrellisStore`（:362，注意 **lazy init** 第三参）。有状态迁移的地方优先 reducer。

### `useLayoutEffect` 只在布局必须领先 paint 时用

`useAgentSession.ts:444-447`（按 session 恢复 tool preset）、:2589（滚动定位）。

### `exhaustive-deps` 保持开启；disable 必须配注释

`eslint.config.mjs` 只关掉三条 React Compiler 新规则：`react-hooks/immutability`、`react-hooks/refs`、
`react-hooks/set-state-in-effect`。**这三条在本仓库被刻意关闭**，允许 render 期初始化 ref 与 effect 内同步
setState（`useAgentSession.ts:371,398,420,426-440`、`useResizablePanel.ts:81`），新代码沿用同一模式。

`react-hooks/exhaustive-deps` 来自 `core-web-vitals`，**保持开启**。全仓只有 6 处显式 disable，语义都是
**"mount-only"或"只在显式 key 变化时执行"**，且 disable 注释必须**紧邻**那一行：

```ts
// hooks/useAgentSession.ts:687-691 —— mount-only 装载 session
useEffect(() => {
  resetTrellisScope();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [session?.id]);
```

其余：`hooks/useAgentSession.ts:2558`（卸载清理）、`components/FileExplorer.tsx:274`、
`components/SkillsConfig.tsx:606`、`components/ModelsConfig.tsx:312`、`components/PluginsConfig.tsx:726`。

### cleanup 五类（各举真实例子）

1. **EventSource —— 显式 `close()` + 身份守卫**。SSE 生命周期封装在
   `lib/agent-event-connection.ts:48` 的 `AgentEventConnection`，`discard()` 同时做
   `attempt.fail()` + `source.close()` + 清空 `current`（:186-190），所有 handler 先判
   `if (this.current !== connection) return;`（:136/:155/:178）——**句柄 + 身份双守卫**。
   组件层普通 SSE 范式见 `components/FileViewer.tsx:480-508`（`active` 标志 + `es.close()` + 判等置 null）。
2. **AbortController —— cleanup 里 `abort()`**：`useAgentSession.ts:2605-2626` 的模型加载重试循环；
   取消错误**按类型判定**：`if (e instanceof DOMException && e.name === "AbortError") return;`（:2614）。
3. **定时器**：局部变量 + `clearTimeout`（`useAgentSession.ts:2658-2662`）；跨 effect 取消用 ref +
   **generation 计数**（`cancelEventStreamGrace`，`useAgentSession.ts:1032-1040`，先 `generation += 1` 再
   `clearTimeout`）；可重入定时器集合用 `Set<ReturnType<typeof setTimeout>>` + 遍历清理
   （`useViewportHeight.ts:44-46,117-120,171-173`）。
4. **rAF**：cleanup 里 `cancelAnimationFrame` + 句柄置 null（`useAgentSession.ts:2502-2504`；
   `useViewportHeight.ts:99-110,167`）。
5. **事件监听的注册/注销必须字面成对**，且 **capture 选项一致**（`useViewportHeight.ts:150-173`
   注册 8 个监听，cleanup 逐个 `removeEventListener`，`true` 对 `true`）。

## 模块级订阅与缓存

需要**跨组件即时共享**的状态型 hook 常用 `useSyncExternalStore`；`useTheme` / `useChatAppearance`
采用「模块级单例 + listener Set」；`useFileIndex` 用按 cwd 分组的 cache；`useIsMobile` 直接订阅 matchMedia。
下面仅为 `useTheme` 一类的缩略结构，不是所有 hook 的统一模板：

```ts
let state: T | null = null;
const listeners = new Set<() => void>();
function emit() { listeners.forEach((cb) => cb()); }

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  ensureState();          // 首次订阅时惰性初始化（可含 DOM 副作用）
  return () => { listeners.delete(cb); };
}
function getSnapshot(): T { return ensureState(); }
function getServerSnapshot(): T { return SERVER_SNAPSHOT; }  // ← 必须有
```

- 4 个 hook 文件使用 `useSyncExternalStore`（合计 6 个导出 hook）；并非都自建 listener Set：`useTheme`（`hooks/useTheme.ts:115`）、`useIsMobile`
  （`hooks/useIsMobile.ts:44,49,59`）、`useChatAppearance`（`hooks/useChatAppearance.ts:133`）、
  `useFileIndex`（`hooks/useFileIndex.ts:100`）。
- **`getServerSnapshot` 必须有**，否则 SSR 报错。
- **snapshot 是对象时必须引用稳定**：`useTheme` 用模块级 `state`（:19），`useChatAppearance` 用模块级
  `appearance`（:27）。
- **参数化 snapshot 在现有实现中用 `useCallback` 稳定函数引用**：
  `hooks/useFileIndex.ts:96-100` 的 `readSnapshot`。无限重渲染的风险来自 snapshot 返回新对象，
  不能把“函数引用变化”直接等同于“无限重渲染”。
- `useIsMobile.ts:27-35` 更进一步把 subscribe/getSnapshot 提升为**模块级常量**，避免每次渲染新建。

> 为什么不用 Context、四种共享机制怎么选、以及 `globalThis` 服务端注册表：见
> [state-management.md](./state-management.md)。

## Naming

- 文件名 = hook 名（`useTheme.ts` 导出 `useTheme`）；没有 barrel。
- 多 hook 同域才合并到一个文件，理由是**共享私有实现**：`useIsMobile.ts:15-24` 的
  `subscribeToQuery` / `queryMatches` 被三个导出共用。
- options 接口 = `Use<HookName>Options`；测试文件 = `useX.test.mjs`（+ `useX.<feature>.test.mjs`），与源文件同目录。
- **只服务单个组件的私有 hook 就地和组件同文件**（`components/SessionSidebar.tsx:369` 的 `useScramble`），
  不强制搬进 `hooks/`。没有 ESLint 规则强制 hook 放置位置，这是习惯不是规则。

## Testing

**本仓库没有挂载真实 React hook 的 DOM 测试**（组件另有 `renderToStaticMarkup` 测试）：`package.json` 无 `jsdom` / `@testing-library/react` / `react-test-renderer`。
测试入口是 `node --test`（`package.json` 的 `test` script）。`hooks/` 下 8 个测试分两类，**都是刻意的**：

**A. 源码断言测试（7/8）** —— `readFile` 读 `.ts` 源码，`indexOf` 切片做字符串断言，锁住关键时序：

```js
// hooks/useAgentSession.test.mjs:1-4, 7-12
const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");
test("keeps the session event stream open through the idle grace window", () => {
  const finishSource = source.slice(
    source.indexOf("const finishPromptWithoutStream"),
    source.indexOf("const waitForPromptSettlement"),
  );
```

同模式：`useAgentSession.pending-ask.test.mjs`、`useAgentSession.trellis.test.mjs`、
`model-loading.test.mjs`（额外用 `typescript` + `node:vm` 做语法校验）、`model-scope-startup.test.mjs`、
`model-switching.test.mjs`。

**B. 纯函数导入测试（1/8）** —— 用 `jiti` 直接 import `.ts`，只测导出的纯函数：

```js
// hooks/useViewportHeight.test.mjs:1-6
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { KEYBOARD_RETRY_DELAYS, shouldUseVisualViewportHeight } = await jiti.import("./useViewportHeight.ts");
```

**新写 hook 时**：能抽纯函数就抽出来用 `jiti` 测；无法渲染测试的时序约束，用源码子串断言锁住，
防止后续重构悄悄删掉保护逻辑。**不要为了写测试去新增 jsdom / testing-library 依赖**（属产品决策）。

## Traps（本仓库踩过的坑）

1. **不能在第一个 `agent_end` 就关闭 SSE**：一个逻辑 prompt 在 retry / compaction / extension 入队消息时
   会产生多个 `agent_end`；必须等 `prompt_done` / `agent_settled` + 30s 宽容窗口
   （`hooks/useAgentSession.ts:1573-1576`、`EVENT_STREAM_IDLE_GRACE_MS` :192、`scheduleEventStreamClose` :1266-1327，
   `agent_start` 取消，:1564）。
2. **prompt run id 必须单调，且所有 late response 都要比对**：`promptRunIdRef`（:412）递增；
   `finishPromptWithoutStream` 先判 `promptRunIdRef.current !== runId` 再 `loadSession`（:1329-1331）；
   `reconcileAgentState`（:1431）与 `agent_end` 的 fetch 回调（:1583-1591）同样比对；
   `message_start` / `message_update` 在 `!agentRunningRef.current` 时直接忽略，防"ghost streaming bubble"（:1655-1658）。
3. **`notifiedPromptRunIdRef` 防重复通知**：`notifyPromptStage`（:1259-1263）保证同一次 run 只触发一次完成提示。
4. **不能包装 `handleAgentEventRef`**：`useAgentSession` 每次 render 重写该 ref，外部包装会在第一次
   re-render 后被抹掉；完成音必须走 `wrappedOnAgentEnd`（`components/ChatWindow.tsx:253-271`）。
5. **`setPointerCapture` 拖拽要在 blur / 隐藏时取消**：`useResizablePanel.ts:235-250` 监听 `window.blur` 与
   `visibilitychange` 调 `cancelResize`，否则 body 的 `cursor: col-resize` / `user-select: none` 会残留。
6. **`restoredRef` 保证"恢复存储值"只跑一次**（`useResizablePanel.ts:76,212-222`），否则依赖变化会把用户拖拽宽度重置回存储值。
7. **DragEvent 必须用计数而不是布尔**：`dragenter` / `dragleave` 进入子元素会成对抖动，用 `counterRef`
   （`useDragDrop.ts:7,12-14`）。
8. **iOS/WKWebView 键盘高度不可靠**：focus 后按 `KEYBOARD_RETRY_DELAYS = [300,700,1200]` 重试（`useViewportHeight.ts:41`），
   WebKit 早发 resize 时用 rAF 延后读取（:102-110），`scrollTo(0,0)` 只在开关过渡时做一次（:73-84）。
9. **`globalAbortHandler` 是单 owner**：`ChatWindow.tsx:468` 每次 render 覆盖/清空，多 owner 会互相顶掉
   （`useKeyboardShortcuts.ts:13-16`）。
10. **`AudioContext` 必须复用且必须在用户手势中 `resume()`**：`useAudio.ts:40-52` 单例 `getCtx`，
    `unlockAudio`（:49）由交互控件调用，`playDone` 在 suspended 时先 `resume().then(play)`（:64）。
11. **卸载 effect 的清理漏一项就会留悬挂副作用**：`useAgentSession.ts:2542-2558` 必须同时做
    取消 rAF、递增 `bashRecoveryIdRef`、`cancelEventStreamGrace`、`closeEvents`。
12. **草稿清理要延到微任务**：StrictMode 双 mount/unmount 会误删刚输入的草稿，用
    `queueMicrotask` + 双条件判定（`useAgentSession.ts:2542-2550`）。
13. **`trellisOwnerRef` 的 owner 机制**：旧 keyed mount 的迟到 cleanup 不得清掉新 mount 已发布的状态
    （`useAgentSession.ts:370-371,692-703`）。
14. **自定义 memo 比较器未追踪的数据可能无法靠 prop 更新传递**；文件索引因此采用模块级缓存订阅
    （`hooks/useFileIndex.ts:5-13`）。不是所有 memo 都阻断 prop：比较器跟踪的变化与 Context 更新仍能传递。
