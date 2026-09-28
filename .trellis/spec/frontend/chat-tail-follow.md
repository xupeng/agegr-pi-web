# 对话尾部跟随（tail follow）

> 什么会增长消息列表的尾部、谁负责把它带回视野、以及"用户在别处看"时不许抢位置。
> 由任务 `09-28-mobile-status-line-clip`（移动端运行状态行折行时末行被输入框遮挡）确立。

## 尾部内容不止消息

消息列表尾部会自己变高的有三类东西：

1. **消息**本身（分页追加、外部 append、新消息）；
2. **流式 assistant delta**（`hooks/useAgentSession.ts:1830` 起的
   `message_start` / `message_update` 分支）；
3. **消息之后的临时块**——它们不是消息、没有 entry id、也不产生 delta：
   - 运行状态行 `components/ChatWindow.tsx:1281`（"Waiting for model..." /
     "Running bash... <最后一行输出>"，文案见 `components/ChatWindow.tsx:78-90` 的
     `phaseLabel`）；
   - "Running command..." 行 `components/ChatWindow.tsx:1287`；
   - pending bash 卡片 `components/ChatWindow.tsx:1293`。

第 3 类是最容易漏的：`getToolExecutionProgress()`（`lib/tool-execution-progress.ts`）
把 bash 输出最后一行写进状态行，输出越长、折行越多，而 `messages.length` 不变、
也没有 delta。只跟随第 1、2 类的实现会让第 3 类的新增高**落在视口外**——用户看到
"末行被输入框切掉半个字"，要再手动拖一下才出现。

## 唯一的跟随原语

`hooks/useAgentSession.ts:524 followTailIfAttached` 是所有尾部跟随的唯一实现，
由 hook 返回值导出（`hooks/useAgentSession.ts:2989`）。它的契约必须整体保留：

```ts
if (pendingScrollToUserRef.current || !isNearBottomRef.current) return; // 门禁
if (liveFollowFrameRef.current !== null) return;                        // 每帧合并
liveFollowFrameRef.current = requestAnimationFrame(() => {
  liveFollowFrameRef.current = null;
  if (isNearBottomRef.current) scrollToBottom("auto");                  // 帧内复查
});
```

- **`pendingScrollToUserRef` 优先**：用户刚发出的消息要停在顶部，跟随必须让位。
- **`isNearBottomRef` 由 scroll 处理器维护**（`hooks/useAgentSession.ts` 的
  `handleScrollPositionChange`，容差 `CHAT_SCROLL_TAIL_TOLERANCE = 8`、
  运行中重挂容差 `CHAT_SCROLL_REATTACH_TOLERANCE = 96`，见
  `lib/chat-lazy-load.ts:2-3`）。不在尾部就**不动 scrollTop**，否则会把正在往上读的人
  拽回底部。
- **必须走 rAF**：调用点都在 agent 事件处理里，React 还没把新内容提交进 DOM，
  立刻滚会用到旧布局。
- **rAF 内必须复查**：一帧内用户可能已经滚走或点了跳转。

**禁止**在事件处理里内联第二份 rAF 跟随。两份实现一旦漂移，就只剩一条路径遵守门禁；
`components/ChatWindow.status-tail-follow.test.mjs` 断言
`hooks/useAgentSession.ts` 里 `requestAnimationFrame(` 只出现一次。

## 临时块的触发键：一个值两用

状态行文案提成一个 `statusText`（`components/ChatWindow.tsx:780`），**渲染与触发键共用**：

```tsx
const statusText = agentRunning && !hasStreamingContent && agentPhase
  ? phaseLabel(agentPhase, t)
  : null;
const tailStatusKey = statusText !== null || bashRunning || pendingBash
  ? `${statusText ?? ""}|${bashRunning && !pendingBash ? "cmd" : ""}|${pendingBash?.command ?? ""}`
  : "";
useLayoutEffect(() => {
  if (!tailStatusKey) return;
  followTailIfAttached();
}, [tailStatusKey, followTailIfAttached]);        // components/ChatWindow.tsx:897-900
```

- 键里放**渲染出来的文本**，不是 `agentPhase` 对象身份：每次 tool update 都是新的
  `partialResult`/phase 对象，用对象身份会在文本没变时也触发；反过来只在对象引用变化时
  触发，会漏掉"文本变了但高度还没变"的中间态。
- 键必须覆盖**三个**临时块（状态行、Running command、pending bash），它们都在消息之后
  自增长；只覆盖其中一个，另外两个的折行又会掉出视口。
- 键为空（尾部没有临时块）时直接返回，别把没有变化的渲染也接到跟随上。

## 不许用样式换遮挡

`components/ChatWindow.tsx:1281-1284` 的 `break-words py-2 text-[13px] text-text-muted`
与 `animate-[pulse_1.5s_infinite]` 是状态行自己的排版。**不要**通过缩小 padding/字号、
加 `line-clamp`/`overflow: hidden` 来"消除"遮挡：那是把末行真的删掉。
`components/ChatWindow.status-tail-follow.test.mjs` 的最后一条断言就是钉住这段 JSX。

已定版（见 `.trellis/tasks/09-28-mobile-status-line-clip/prd.md` 决策）：
状态行**留在滚动流内**，不改造成"钉在输入框上方/浮层"的常驻 UI。

## 回归验证

- 组件/源码级：`components/ChatWindow.status-tail-follow.test.mjs`（5 条）、
  `hooks/useAgentSession.test.mjs` 里 "keeps live following cancellable…" 与
  "keeps a newly sent user message at the top…" 已改为断言原语而不是内联条件。
- 浏览器级：`e2e/status-tail.mjs` 的 `checkStatusTailFollow()`，由 `e2e/run.mjs` 在
  两个视口调用。它 mock `EventSource`（`e2e/subagents.mjs:284-317` 同款）向真实
  SSE 链路灌 `agent_start` / `tool_execution_start` / `tool_execution_update`，
  用长会话 fixture 保证尾部就是滚动尾部，然后断言：
  - 状态行折行后 `clippedPx <= 0`（末行矩形不越过消息视口底边）且 `scrollerAtBottom`；
  - 滚到顶后再来一次状态变化，`scrollTop` 不变。
- 只改跟随、不改排版：断言里不涉及字号，`e2e/chat-appearance.mjs` 的
  横向对齐/字号检查必须同时保持通过。

## 已知偏差

- 状态行仍是 `text-[13px]`，没有用对话区的 `calc(<设计字号>px + var(--chat-font-size-offset, 0px))`
  （见 [组件约定](./component-guidelines.md) 的"对话区字号"）。本任务刻意不改它的
  排版以免和跟随修复混在一起；用户自定义对话区字号时这一行不跟随，属已知技术债。
