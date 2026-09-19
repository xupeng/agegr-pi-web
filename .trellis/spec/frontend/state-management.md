# 状态管理规范

> 本仓库**没有**任何状态管理库，状态落点按「数据来源 + 消费方式」分为几类，各自有固定的落点。
> 本篇是「**一份状态该放在哪**」的决策依据。
>
> **边界**：本篇回答落点与共享机制的选择、服务端数据、URL、持久化、SSR。
> 「**怎么写一个 hook**」（签名 / 返回值形状 / 依赖 / cleanup / 测试）看
> [hook-guidelines.md](./hook-guidelines.md)。两篇必须一起读，不要只加载其中一篇。

---

## 总览

- **无** redux / zustand / jotai / valtio / react-query / SWR。全仓无任何数据请求库。
- **React Context 全仓只有 2 处**：`hooks/useI18n.tsx:18`（全局界面语言）与
  `components/FileIndexContext.tsx:12`（只做深层传递）。
- 客户端跨组件共享的主力是 **模块级 store + `useSyncExternalStore`**（4 个 hook 文件、6 个导出 hook），
  加上 **`lib/*-preference.ts` localStorage helper**。
- 服务端进程内的共享状态用 **`globalThis.__pi*` 注册表**（抗 Next.js 热重载）。
- 组件内临时状态默认 `useState` / `useReducer`。

## 状态落点分类

| 类别 | 落点 | 代表位置 |
|------|------|---------|
| 组件内临时状态 | `useState` / `useReducer` | `hooks/useAgentSession.ts:313-367`（整个 hook 45 个 `useState` 调用） |
| 服务端数据（读一次） | `useEffect` 内裸 `fetch` + `useState`，无缓存层 | `hooks/useAgentSession.ts:706` `loadSession`；`components/FileExplorer.tsx`、`SessionSearch.tsx` |
| 服务端数据（跨组件去重） | 模块级 cache + `useSyncExternalStore` | `hooks/useFileIndex.ts`（TTL 10s :23）与服务端 `app/api/file-index/route.ts:59` **TTL 必须对齐** |
| 服务端数据（列表 / 轮询） | `useEffect` + `setTimeout` 自调度 + `AbortController` + 可见性暂停 | `components/SessionSidebar.tsx:779-847` |
| 服务端数据（流） | `EventSource` 包成类 + 被动重连 + 就绪握手 | `hooks/useAgentSession.ts:420-441`、`lib/agent-event-connection.ts:48` |
| 服务端数据（发命令） | `sendAgentCommand()` 统一封装 | `lib/agent-client.ts:28`（曾把同一段 fetch 重复 13 次） |
| 跨组件共享（配置型单值） | React Context | `hooks/useI18n.tsx:18` |
| 跨组件共享（高频 / 被 memo 隔断） | 模块级 state + listener Set + `useSyncExternalStore` | `hooks/useTheme.ts:18-19`、`useChatAppearance.ts:27-28`、`useIsMobile.ts:27-35`、`useFileIndex.ts:33` |
| 跨组件共享（深层渲染器） | Context 只做传递，数据源仍是模块级 store | `components/FileIndexContext.tsx:12` + `hooks/useFileIndex.ts` |
| 持久化偏好 | 独立 `lib/*.ts` 纯函数 + localStorage | `lib/tool-preset-preference.ts`、`workspace-memory.ts`、`settings-navigation.ts`、`file-explorer-state.ts` |
| "最新值"镜像（避开依赖数组抖动） | `useRef` + 每次 render 赋值 | `hooks/useAgentSession.ts:396-440`（整个 hook 48 个 `useRef` 调用） |
| SSR 首屏需要的状态 | 内联 `<script>` 预置 DOM + `suppressHydrationWarning` | `lib/theme.ts:22`、`app/layout.tsx:56,77` |
| 服务端进程内注册表 | `globalThis.__pi*` / `Symbol.for(...)` | `lib/rpc-manager.ts:1858`、`lib/session-reader.ts:334-495` |

## 跨组件共享：四种机制怎么选

项目里要决策的不是"要不要 global"，而是**四选一**：

| 机制 | 何时用 | 实例 |
|------|--------|------|
| **模块级 store + `useSyncExternalStore`** | 消费方多、或被 `React.memo` 隔断 prop 下传、或需要跨组件即时重渲染 | `useTheme` / `useIsMobile` / `useChatAppearance` / `useFileIndex` |
| **React Context** | 配置型单值（全局语言），或"把已算好的值显式下传给深层渲染器" | `hooks/useI18n.tsx:18`；`components/FileIndexContext.tsx:12` |
| **模块级函数注册（单 owner 命令）** | 全局快捷键要调用某个组件内部的动作，又不便 prop drilling | `hooks/useKeyboardShortcuts.ts:13-16` 的 `globalAbortHandler` |
| **回调 props（`on*Change`）** | 子 hook 把派生状态"推"给直接父组件 | `UseAgentSessionOptions` 的 5 个 `on*Change`（`hooks/useAgentSession.ts:170-180`） |

**为什么不用 Context 而用模块级 store —— 代码里的原始理由**（`hooks/useFileIndex.ts:5-13`）：

> A conversation mounts many `MarkdownBody` / `<pre>` renderers; they all need the same
> `/api/file-index?cwd=` answer. A module-level cache plus `useSyncExternalStore` dedupes the request and
> re-renders every consumer when the index arrives (**a plain prop would be blocked by `MessageView`'s memo**).

这是文件索引现有架构的理由，不是 React 的普遍限制：自定义比较器未追踪的新值可能被跳过，
但已追踪的 prop 变化和 Context 更新仍可穿过 memo。模块级 store 在这里负责请求去重与订阅，
Context 负责传递 lookup；不能据此宣称 Context 一定比 store 引发更多重渲染。

- 模块级 `globalAbortHandler` 单 owner 注册的**代价**：同一时刻只允许一个 owner（`ChatWindow.tsx:468` 每次 render 覆盖/清空，
  多 owner 会互相顶掉）。
- Context 缺失时两种处理，按"必需 vs 可选"区分：`useI18n.tsx:82-84` **抛异常**；
  `components/FileIndexContext.tsx:25` **返回 null 静默降级**。

> 模块级 store + `useSyncExternalStore` 的**代码模板、snapshot 稳定性、参数化 snapshot 的 `useCallback`
> 做法**写在 [hook-guidelines.md](./hook-guidelines.md#模块级订阅与缓存)。

## 服务端状态

- **无缓存层的第一类**：直接 `useEffect` + `fetch` + `useState`（`hooks/useAgentSession.ts:706`）。
  没有全局请求缓存，需要去重时自己建模块级 cache。
- **会话列表的 running 轮询采用自调度 + 暂停后台标签页**：`components/SessionSidebar.tsx:779-847` 用 `setTimeout` 自调度
  （不是 `setInterval`），`schedule()`（:785）在 `document.visibilityState !== "visible"` 时**不排下一次**，
  `visibilitychange` 回到 visible 立即补一次 `poll()`（:839-847）。`RUNNING_SESSIONS_POLL_MS = 2500`（:170）。
- **新请求前先取消旧请求**：`SessionSidebar.tsx:793-795` 的 `const current = new AbortController(); controller?.abort();`，
  cleanup 与 `visibilitychange → hidden` 时 `controller?.abort(); controller = null;`。
- **轮询状态的权威性**：running 状态以轮询为准，迟到的 `/api/sessions` 响应**不得覆盖**它 ——
  用 `runningPollAuthoritativeRef`（`SessionSidebar.tsx:506,797`），注释 "Treat the fetched running set as an
  initial fallback only"（:590）。
- **流（SSE）**：事件流封装在 `lib/agent-event-connection.ts:48`。它的生命周期细节（grace window、
  prompt run id、不能包 `handleAgentEventRef`）属于 hook 实现陷阱，见
  [hook-guidelines.md](./hook-guidelines.md#traps本仓库踩过的坑)。
- **需要跨热重载保留的服务端进程注册表用 `globalThis`，不能仅用模块级 Map**：Next.js 热重载会重建模块，
  模块级 Map 会丢失/重复创建。原话见 `AGENTS.md:169`；
  注册表初始化见 `lib/terminal-manager.ts:32-34`、`lib/session-reader.ts:344`、
  `lib/rpc-manager.ts:1858`（`globalThis.__piSessions`）。
  写法惯例：`getXxx()` 懒初始化 + `??=`；跨 bundle 共享用 `Symbol.for(...)`
  （`lib/session-liveness.ts:106,118`、`lib/auth-throttle.ts:42`）。

## URL 状态

URL 只承载 **3 个参数**：`cwd` / `session` / `sidebar=collapsed`（`lib/initial-navigation.ts:7-17`）。

- **只在首次挂载读取一次**：`components/AppShell.tsx:85-86`
  `const [initialNavigation] = useState(() => getInitialNavigation(searchParams));`，
  之后 URL 只是"写出去"的镜像，不是状态源。
- **`cwd` 存在时 `sessionId` 强制为 null**（`lib/initial-navigation.ts:14`）。
- **写入用 `router.replace(..., { scroll: false })`**（`AppShell.tsx:640-643,771-774`）；
  清空用 `router.replace(window.location.pathname, { scroll: false })`（:716,796）。
- **陷阱**：`AppShell.tsx:769-770` —— 从 URL 恢复时**跳过** `router.replace`，
  否则生产环境 Next.js 会触发 Suspense remount loop。另有防御性判等
  `if (new URLSearchParams(window.location.search).get("session") !== s.id)`（:642）。

## 持久化（localStorage）

**两套前缀并存，是既有现实**（没有迁移记录/ADR，视为历史遗留）：

- **`pi-*`**：值型单键 → `pi-theme`（`hooks/useTheme.ts:15`）、`pi-sound-enabled`
  （`hooks/useAudio.ts:27,59`）、`pi-locale`（`hooks/useI18n.tsx:8`）、`pi-tool-preset`
  （`lib/tool-preset-preference.ts:3`）、`pi-chat-content-*`（`hooks/useChatAppearance.ts:8,12`）、
  `pi-sidebar-width` / `pi-right-panel-width`（`AppShell.tsx:252,264`）。
- **`pi-web:*`**：命名空间 / 复合结构 / 可扩展子键 → `pi-web:last-open-by-workspace`
  （`lib/workspace-memory.ts:15`）、`pi-web:settings-navigation`（`lib/settings-navigation.ts:12`）、
  `pi-web:unread-session-ids` / `last-custom-cwd`（`components/SessionSidebar.tsx:171,172`）、
  `pi-web:file-explorer:open`（`lib/file-explorer-state.ts:1`）、`pi-web:provider-usage:<id>`
  （`components/ProviderUsageSummary.tsx:25`）。

规则：

- 简单标量 → `pi-*`；复合结构 / 可扩展子键 → `pi-web:*`。**不要为统一前缀做迁移。**
- 值一律存**字符串**（布尔 `String(bool)`，复合 `JSON.stringify`）。
- **空集合要删键**，不要存 `"[]"` / `"{}"`：`SessionSidebar.tsx:207-210`、`workspace-memory.ts:74-77`。
- **所有读写包 `try/catch`**，注释统一提到隐私模式 / quota
  （`hooks/useTheme.ts:32-34,68-70`、`file-explorer-state.ts:29-32`、`workspace-memory.ts:64-66`）。
- **`lib/*-preference.ts` 的统一签名**：把 storage 作为**可注入的最后参数**以便测试：

```ts
// lib/tool-preset-preference.ts:13,25
export function getPreferredToolPreset(
  storage: StorageLike | null = getBrowserStorage(),
): ToolPreset { ... }
```

`getBrowserStorage()` 固定形如 `if (typeof window === "undefined") return null; try { return window.localStorage } catch { return null }`。
**hook 内部的 localStorage 不走这个注入模式**（`hooks/useTheme.ts`、`useAudio.ts`、`useChatAppearance.ts` 各自内联）；
**新代码应优先走 `lib/*` 模块**。
- 需要"已挂载组件即时响应偏好变化"时，用 DOM 事件广播：`lib/thinking-expansion-preference.ts:5`
  `THINKING_EXPANDED_EVENT` + `window.dispatchEvent(new Event(...))`。
- **不要引入 `BroadcastChannel` / `storage` 事件**：全仓未使用，跨标签页同步无实现（唯一跨设备同步走服务端轮询，
  `hooks/useAgentSession.ts:1488-1500`）。

## SSR / Hydration

四种真实手法，按场景选：

1. **`getServerSnapshot` 返回"安全默认"**：`useTheme.ts:18,111`、`useIsMobile.ts:33-35`、
   `useChatAppearance.ts:133`、`useFileIndex.ts:100`。`useIsMobile.ts:38-41` 的注释是说明模板：
   > SSR-safe: renders as desktop (false) on the server and first client paint, then syncs to the real
   > viewport after hydration.
2. **`useState` 惰性初始化 + `typeof window` 守卫**：`hooks/useAudio.ts:25-30`。
   **首帧仍可能与服务端不同**；用户手势调用 `unlockAudio` 解决的是浏览器自动播放限制，
  不是 hydration mismatch，不要混为同一机制。
3. **`hydrated` 标志把"切换"推迟到 effect**：`hooks/useI18n.tsx:43-60` —— 服务端与首帧都用 `"en"`，
   effect 里读存储后 `setLocale` + `setHydrated(true)`；
   value 用 `hydrated ? locale : defaultLocale`（:75），**hydration 前 `t()` 永远输出英文，不产生 mismatch**。
4. **内联脚本预置 DOM + `suppressHydrationWarning`**：`lib/theme.ts:22` 的 `THEME_INIT_SCRIPT` 在 `<head>`
   同步设置 `dataset.theme` 与 `dark` class（避免主题闪白）；`app/layout.tsx:56,77` 两处
   `suppressHydrationWarning`。**代价**：`pi-theme` 键在 `lib/theme.ts:22` 与 `hooks/useTheme.ts:15` 各写一次，
   改键名必须同时改两处（已知重复）。

**不要用 `next/dynamic` 的 `ssr: false` 绕开 SSR**：全仓无此用法，不是本项目惯例。

## Traps（状态类）

1. **跨热重载保留的服务端注册表用 `globalThis`**：模块级 Map 在热重载后丢失/重复创建（`AGENTS.md:169`，
   `lib/rpc-manager.ts:1858`）。
2. **会话列表的 running 轮询在后台暂停**，回到前台立即补一次（`SessionSidebar.tsx:785-790,839-847`）；
   `useAgentSession` 的 reconcile effect 同样在 `visibilitychange` / `online` 时立即 `reconcile()`（:1463-1484）。
3. **轮询状态的权威性**：迟到的 `/api/sessions` 不得覆盖轮询的 running 结果
   （`SessionSidebar.tsx:506,590,797`）。
4. **URL restore 时调 `router.replace` 会触发 Suspense remount loop**（`AppShell.tsx:769-770`）。
5. **空集合必须删键，不能存 `"[]"`**（`SessionSidebar.tsx:207-210`、`workspace-memory.ts:74-77`）。
6. **localStorage 读写必须包 `try/catch`**（隐私模式 / quota）：统一模式见 `hooks/useTheme.ts:32-34,68-70`。
7. **会话列表刷新的"先清空再拉取"是 forbidden pattern**：force 刷新必须"新数据到达后覆盖，不清空旧数据"，
   详见 [session-list-refresh.md](./session-list-refresh.md)。
