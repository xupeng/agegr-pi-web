# ask_user 提问协议

> Pi Web 的 `ask_user` 工具契约、状态机、共享 React 视图渲染与前后端协议。

## 背景与设计决策

`ask_user` 让模型向用户提问，问题以**共享 React 组件**（`lib/ask-user/view/AskUserView`）呈现，答案以 follow-up 消息唤醒模型。实现参考 `pi-web` fork（`src/server/sessions/askUserTool.ts` + `pendingAskStore.ts`），移植为 agegr-pi-web 架构。

**核心决策：异步非阻塞，不用 `ctx.ui`。** `ctx.ui.*` 是阻塞式（agent 运行被 pin 住、SSE 长连、状态易失）。`ask_user` 调用后返回 `terminate: true` 结束本轮运行，问题存为进程级状态，答案通过 `sendCustomMessage(..., { triggerTurn: true, deliverAs: "followUp" })` 送达模型。

**渲染决策：共享 React 视图，不用 MCP Apps iframe。** 2026-09-26 起 `ask_user` 的唯一呈现是一个框架无关 controller + React 组件（`lib/ask-user/view/`），由每个宿主做一层薄适配器。MCP Apps 的 opaque-origin `srcdoc` 沙箱、握手、消息校验与字体字节投递已整体删除。决策与「删除而非封存」的理由在 `docs/adr/0004-ask-user-shared-react-view.md`；本文件末尾有一节摘要。

## 系统工具与宿主契约（2026-10-06）

- 唯一工具源是 SDK 按用户原 settings/packages/extensions/trust 发现的系统安装扩展。Web 不安装/锁定另一份包，不静态导入机器安装路径，无内建工具 fallback。
- Web 的 `lib/ask-user/extension.ts` 只注册同 loader 的 bridge listener，不注册工具/schema/prompt/execute，不实现 bridge caller/resolver，不模拟 TUI。
- `lib/ask-user/extension-policy.ts` 只复制/投影工具 Map。恰好一个 discovered `ask_user` 保留 execute/schema/prompt/source 和原 SDK 默认激活语义；direct 投影为 model-only，原 defaultActive 保持。hidden 原定义保持 withdrawn；原 codemode/deferred 即使显式 defaultActive:true 也默认 inactive，投影时归一化为 false，不能因曝光投影变成默认 active。原输入对象不 mutate，仍能通过显式 SDK selection 激活。多个不同 resolved source 明确诊断并撤销 ask 工具，保留扩展其它 tools/commands/flags/handlers。工厂已运行，policy 不是初始化副作用沙箱。
- 主会话 normal/pinned/configured 按原 SDK 工具选择工作。Chat-only/子代理没有 Web host；子代理即便加载扩展也撤销 ask_user 并通过 excludeTools 防御。资源过滤/hidden/defaultActive:false 不回灌。
- SDK 1.0.0 的原 reload 会重新激活 default-active extension tools（includeAllExtensionTools），包括 setActiveToolsByName 先关闭的 direct 工具；Web 沿用该 SDK 行为，不添加 active-all 回灌。navigate carry 只保留原 active、仍 registered、非 hidden 的 session tools，coding pins 不变。
- 参数与模型引导由系统扩展提供。Web host v1 合同限制 ≤20 问题、每题 ≤12 选项、id ≤128、文本 ≤1000、自定义/supplement ≤4000。宿主校验 DTO/浏览器输入，不维护第二份模型参数 schema 或提示。
- model-only 保证 Code mode only 仍直接声明 ask；ALL_TOOLS/ctx.executeTool 不可调用，避免 nested execution 吞掉 terminate。posted/terminate 由实际工具在 host ack 校验后决定。

## 同 loader 的 v1 Web host

Channel: `pi.ask-user.bridge:resolve-open:v1`。`pi.events.on` 监听器必须同步 `resolution.register(async open)`；异步工作只在 open 中。SDK 跟踪订阅，reload/dispose 清理；不用 global bus。

`open` 收到 unknown，经 `lib/ask-user/protocol.ts` 解码为 `{ version:1, conversationId, questions }`。核验 version、有界 DTO、conversationId 与绑定 loader 的 SessionManager 身份一致，再实时查 registry 的 alive 且 sessionId 匹配 wrapper。缺失、closing、错身份、畸形/未知版本均拒绝，不触碰别的会话。有效请求调用既有 wrapper.openAsk，返回 `{ ask:{askId,askedAt,questions},superseded? }`。

外部工具负责恰好一个同步 bridge、匹配问题 ack 与 posted/terminate；Web 不复制 resolver。Web ack 证明内存登记与结构，不声称写盘事务或 exactly-once（仍 best-effort mirror）。TUI 只在其真实 tui host 使用原生投影。

测试分两类，不互相冒充：`discovery-host.integration.test.mjs`/`codemode.integration.test.mjs` 使用自包含小型 **test-only protocol peer** 经真实 SDK package discovery；`e2e/ask-user-host.mjs` 默认也是该 peer 的离线 host 浏览器链。真实系统源烟测需显式 ASK_USER_HOST_SOURCE 指向独立包拷贝，后者不是产品依赖/默认 fixture。`e2e/ask-user.mjs` 的持久化+命令 stub 仅证明 view，不证明 host 全链。

### 校验、错误与必测例

| 输入/状态 | 宿主行为 |
| --- | --- |
| v1、有界问题、绑定身份一致且 wrapper alive | 调 existing openAsk，返回匹配 ack；工具决定 posted/terminate |
| 未知 version、畸形/超限 questions、空或错 conversationId | 拒绝，不登记或 supersede 旧 ask |
| 未绑定身份、missing/closing/错误身份 wrapper | 拒绝，不访问其他会话 store |
| 多个不同 ask_user 来源 | 工具级撤销并诊断，其他资源保持 |
| 无系统包、资源被排除、hidden/defaultActive:false | 无备用或自动回灌；旧 pending 仍可展示/关闭 |
| 多/延后 bridge 或坏 ack | 由实际扩展 resolver 拒绝；Web 不复制 resolver 或报告假成功 |

正常例：一个已安装系统工具通过唯一同 loader host 登记问题，回答在同会话续跑。边界例：codemode/defaultActive:true 投影后仍默认 inactive，显式选择可激活。错误例：拿另一个会话身份发 open，不得 supersede 当前问题。

必测断言由 extension、extension-policy、discovery-host、codemode 与 rpc-host 集成测试负责：原 SDK/投影 exposure×defaultActive×defaultTools×recorded loadout 对照，真实 reload 三轮无累积监听，单次 direct ask 不续发模型请求，nested 拒绝、same-session submit/cancel、重建保持 askId、admission 与迟到竞态。实际系统源另经独立拷贝烟测和真实 Chromium 验证，不能拿 peer 的简化 ack 校验替代。

错误方式：静态导入系统目录、重注册 Web 工具，或在曝光投影后无条件激活全部注册工具。正确方式：SDK 原发现、同 loader bridge-only host、仅工具级必要投影并按 SDK 原语义保持选择，版本/身份/输入不合约即拒绝。

## 状态机（`lib/ask-user/store.ts` 的 `PendingAskStore`）

每会话至多一个 open ask：`open → (supersede|submit|cancel)`。

- `open`：关闭旧 ask（supersede）并返回其 outcome，登记新 ask。
- `submit`：校验答案匹配 open ask（未知 id / 重复 / 选项不存在 / multiple 冲突 / 超长均拒绝），拒绝时 ask 保持打开。
- `cancel`：无答案关闭，outcome 全未答。
- `cancelOpen`：用户发普通消息时作废（`prompt` 命令 preflight 接受后调用），`triggerTurn: false` 搭用户消息便车，不单独唤醒。
- `forgetSession`：wrapper `destroy()` 时清理**内存**；仅当 registry 未登记同 ID 的新 wrapper 或仍登记自身时清理。旧 closing wrapper 超时后迟到的 destroy 不得清掉 replacement 重水合的 ask（`lib/rpc-manager-shutdown.test.mjs` 行为回归）。
- store 为进程级单例（`globalThis.__piAskUserStore`，与 `__piSessions` 同模式防 Next.js 热重载丢失）。

### 持久化与重水合（跨 wrapper 生命周期）

- open ask 镜像到 `~/.pi/agent/pi-web-open-asks.json`（0600 原子写，`lib/ask-user/persist.ts`，best-effort：写失败只记日志，内存态仍权威）。
- 并发语义：持久化的读-改-写全部同步（无 await），**单进程**（唯一支持的部署形态）内多会话并发 open/close 在事件循环上天然串行，不会互相覆盖；原子替换保证重启/崩溃不损坏文件。**不支持多进程**写同一文件——lost update 可能丢另一进程的 entry（该 ask 无法重水合，内存态仍权威，可重新发起自愈）。
- 生命周期绑定答案而非 wrapper：`open`（含 supersede）写盘、`submit/cancel/cancelOpen` 清盘、wrapper `destroy()`（10 分钟 idle / 重启）**保留**磁盘副本；会话 DELETE 时清理。
- wrapper 重建（`startRpcSession` → `registerRpcWrapper`）时 `PendingAskStore.restore()` rehydrate，**保留原 askId**（浏览器卡片 key 与 `ask_submit` 校验依赖它）。
- wrapper 已销毁但磁盘有 ask 时，`/api/sessions/[id]/state` 与 `GET /api/agent/[id]` 回退返回 `{ running: false, state: { pendingAsk } }`，远程/重开浏览器仍能渲染卡片。
- 客户端重水合路径（缺失曾导致切会话/刷新/换设备后卡片消失）：`loadSession` includeState 分支与挂载 effect 都从 `state.pendingAsk` 恢复；wrapper 不存在且无持久化 ask 时置 null。

### 补充输入项（supplement）

- `AskUserSubmission.supplement?`：用户补充的问题之外的自由文本（多行输入框，≤4000，trim 空丢弃），随 `ask_submit` 提交；`AskUserOutcome.supplement?` 记录。
- `renderAskUserAnswersText` 末尾附加 `Supplement (user-provided, beyond the questions): <json>`，模型可据此获取补充信息。
- 浏览器侧 `submitAsk(askId, answers, supplement?)` 传递；共享视图底部的"补充信息（可选）"多行框。

### 提交锁定

- 提交/取消后 controller 进入 `submitting`/`cancelling` 状态（`locked`）：选项按钮 disabled、输入 readOnly、操作栏显示"已提交 ✓"、每题下渲染提交摘要（`✓ values · otherText`）。**锁定在 controller 内**，宿主不再维护第二份锁状态。
- 正常路径 `syncPendingAsk(response)`（pendingAsk undefined）使宿主消失；若因 SSE 关闭/重水合竞态视图残留，controller 的 `locked` 保证不可再编辑——答案已交付，避免"不确定最终提交了什么"。
- 单选问题：选选项清空自定义文本、输入自定义文本取消选项（互斥）；多选问题选项与自定义可共存，自定义输入框占位文案区分（`multipleOtherPlaceholder`）。

### 状态残留与关闭竞态

- `ChatWindow` 中 `<AskUserAppHost key={pendingAsk.askId} ...>`：ask 切换必须重建宿主，否则旧 ask 的 `status`（submitting/locked）、drafts、supplement 会泄漏到新视图（表现为新视图选项无反应、输入禁用）。`AskUserAppHost` 不自己管 remount，`key` 由 `ChatWindow` 提供。
- 关闭命令（submit/cancel）响应可能晚于新 ask 打开到达：此时服务端对旧 askId 返回 stale，响应无 `pendingAsk` 时不得清掉已打开的新 ask。解析逻辑在 `lib/ask-user/resolve-pending-ask.ts` 的 `resolvePendingAskAfterClose(current, submittedAskId, response)`：当前 ask 与提交 askId 不同 → 保留当前（除非响应显式带替换）。
- 该模块必须保持零依赖（无 `@/` 别名、无框架导入），才能被纯 Node 测试 jiti 导入。

## 事件与命令协议

- SSE 事件：`ask.opened`（`{ type, ask }`）、`ask.closed`（`{ type, askId, reason }`）。浏览器据此维护视图；supersede 时先发旧 `ask.closed` 再发新 `ask.opened`。
- 命令（`POST /api/agent/[id]`）：`ask_submit`（`askId` + `answers[]`）、`ask_cancel`（`askId`）。
- 关闭响应：`{ result: "closed"|"stale", outcome?, pendingAsk? }`；stale 是普通竞态（已关闭/被取代/会话销毁），浏览器按返回 `pendingAsk` 重水合，不是错误。
- `get_state` 返回 `pendingAsk`，浏览器刷新后重水合视图。
- 答案以 custom message（`customType: "pi-web.ask.answers"`，`display: true`）进 transcript，不署名用户。
- **答案送达是 fire-and-forget**（`closeAsk` 里 `void sendCustomMessage(...).catch(日志)`）：agent 空闲时 `triggerTurn` 走完整 agent prompt，promise 要到整个 turn 结束才 resolve——`await` 它会挂住 `ask_submit` 响应，视图停在"已提交"直到 agent 处理完。提交/取消响应必须立即返回，答案在后台唤醒模型。
- **跨设备同步**：`ask.closed` SSE 只到达提交设备的实时流（空闲会话的 SSE 在 grace 窗口后已关闭），其他设备收不到。视图显示期间客户端每 3s 轮询 `/api/sessions/[id]/state`（含持久化回退）兜底同步：远端提交/取消后，本端在数秒内关闭视图或切到新 ask。本地提交仍走 `ask_submit` 响应即时关闭。

## 共享 React 视图渲染（Pi Web，2026-09-26 起）

`ask_user` 的唯一呈现是共享 React 组件 `AskUserView`；宿主不再原生渲染问题表单，也不再使用 MCP Apps iframe。设计决策见 `docs/adr/0004-ask-user-shared-react-view.md`，组件契约见 `lib/ask-user/view/README.md`。

### 分层

```
lib/ask-user/view-controller.ts      纯表单状态（无框架、无 DOM、无 node）
lib/ask-user/view/AskUserView.tsx   React 视图（peer: react；自己渲染样式）
        ↑ 消费
components/AskUserAppHost.tsx                 Pi Web 宿主适配器：文案 + CSS 变量 + 命令
PA 的宿主适配器                                同上，另一个仓库
```

Web-owned view/controller 不依赖工具核心：没有 `@/` 别名、不 import `lib/i18n`、没有 Next、没有 `node:`、不 import 宿主调色板模块。它只读 props 和 `--pi-ask-*` CSS 命名空间。`react` / `react-dom` 由 Web 应用提供（组件本身不 import 它）。

### 宿主适配器的三项职责

`components/AskUserAppHost.tsx` 只做三件事，形式行为一概不碰：

1. **取文案**：用 `useI18n()` 解析 12 个显示键，组成 `labels` 传给组件。
2. **映射变量**：在容器上把 Pi Web 的 token 映射到 `--pi-ask-*`；`readFontFamilyStack()` 读 `getComputedStyle(document.body).fontFamily` 写进 `--pi-ask-font-family`。
3. **转发命令**：把既有的 `submitAsk` / `cancelAsk` 作为 `onSubmit` / `onCancel` 传入，不改写参数。

组件不自己管理 ask 生命周期、不打开/关闭 ask：超车（supersede）、重试、轮询归 `ChatWindow` / `useAgentSession` / 服务端。`ChatWindow` 负责宿主挂载位置和 `<AskUserAppHost key={pendingAsk.askId}>` 的 remount 契约。

### `--pi-ask-*` 变量契约

组件只读下表变量；缺失时用 `light-dark()` / 系统字体栈兜底，因此在完全没有宿主样式的文档里也可读。

| 变量 | 含义 | 组件兜底 |
| --- | --- | --- |
| `--pi-ask-surface` | 卡片主体背景 | `light-dark(#ffffff, #1b1b1d)` |
| `--pi-ask-field` | 头栏/底栏/详情块/未选中选项/输入框 | `light-dark(#f6f6f7, #232326)` |
| `--pi-ask-field-hover` | 悬停的未选中选项 | `light-dark(#ececee, #2b2b2f)` |
| `--pi-ask-border` | 边框 | `light-dark(#d9d9de, #3a3a40)` |
| `--pi-ask-text` | 正文 | `light-dark(#111114, #ececef)` |
| `--pi-ask-text-muted` | 计数/详情/锁定状态 | `light-dark(#5c5c66, #a5a5b0)` |
| `--pi-ask-text-dim` | 底栏提示 | `light-dark(#8a8a94, #7d7d88)` |
| `--pi-ask-accent` | 选中背景 / 焦点环 | `light-dark(#2f6fed, #a4c2f4)` |
| `--pi-ask-accent-contrast` | 选中文字 | `light-dark(#ffffff, #14161a)` |
| `--pi-ask-success` | 摘要 `✓` | `#16a34a` |
| `--pi-ask-danger` | 错误文字 | `#ef4444` |
| `--pi-ask-max-width` | 容器最大宽度 | `820px` |
| `--pi-ask-font-size-offset` | 加在所有字号上 | `0px` |
| `--pi-ask-font-family` | 字体栈 | `-apple-system, system-ui, "Segoe UI", Roboto, sans-serif` |

Pi Web 的映射在 `components/AskUserAppHost.tsx` 的 `PI_ASK_VARIABLE_MAP`：`--pi-ask-surface` ← `var(--bg-panel)`、`--pi-ask-field` ← `var(--bg)`、`--pi-ask-field-hover` ← `var(--bg-hover)`、`--pi-ask-border` ← `var(--border)`、文本三档 ← `--text` / `--text-muted` / `--text-dim`、`--pi-ask-accent` ← `var(--accent)`、`--pi-ask-accent-contrast` ← `var(--accent-contrast)`、`--pi-ask-max-width` ← `var(--chat-content-max-width)`、`--pi-ask-font-size-offset` ← `var(--chat-font-size-offset, 0px)`。`--pi-ask-success` / `--pi-ask-danger` **不映射**：组件默认值就是 Pi Web 增/删语义用的 `#16a34a` / `#ef4444`。

两条容易踩错的点：

- **命名空间在使用点读取，不在 `.pi-ask` 上声明。** `view-css.ts` 的每条属性写 `var(--pi-ask-x, <fallback>)`。如果组件在 `.pi-ask` 上预设 `--pi-ask-*: …`，那个声明会**遮蔽**宿主在祖先容器上的映射（CSS 变量就近解析），主题映射就永远不生效。同理，宿主侧映射必须放在组件容器（或其祖先）上，不能写在组件内部的元素上。
- **`--pi-ask-accent-contrast` 必须是独立变量**：暗色主题里 `--pi-ask-accent` 是浅蓝，写死白字对比度不合格。使用它的地方正是被删原生卡片用 `--accent-contrast` 的位置。

组件自带 `color-scheme: light dark`（`light-dark()` 需要它）与 `light-dark()` 兜底；Pi Web 的 5 套主题（light/dark/mist/rose/pine）+ `auto` 靠变量映射生效，不需要从任何投影推演 `colorScheme` / `theme`。**旧版 `ask-user-protocol` 曾禁止引入 `light-dark(#…)` 第二套色板**——那条禁令是为 opaque-origin 单宿主写的（帧里既不能继承宿主变量也不能解析 `var()`）；iframe 路径退役后，组件用 `light-dark()` 做无宿主兜底是正当的，禁令已放开。组件仍然只用 `--pi-ask-*` 命名空间，不读宿主内部名（`--bg`、`--text` 等）。

### 文案契约（label 归属）

组件渲染 `AskUserViewLabels` 的 12 个键：`title`、`answered`（模板，含 `{count}` / `{total}`）、`otherPlaceholder`、`multipleOtherPlaceholder`、`supplementTitle`、`supplementPlaceholder`、`submitted`、`cancelling`、`hint`、`cancel`、`submit`、`actionFailed`。

- 包内自带三语默认表（`lib/ask-user/view/copy.ts`，`en` / `zh-CN` / `zh-TW`）。解析顺序：`askUserViewLabels(locale ?? "en")`，再用 `labels` 里已定义的键覆盖。
- **Pi Web 覆盖全部 12 个键**，所以它从不读包内表；PA 原样使用包内表。**每一侧文案只有一个 owner**，两边措辞可以合法地漂移。包内文本是 `lib/i18n/messages/{en,zh-CN,zh-TW}.ts` 的一次性转写，不是同步源——不要为了"统一"让 Pi Web 去读包内表，也不要加同步步骤。
- `{count}` / `{total}` 插值留在组件内，宿主只提供模板字符串。三语 key 集合仍由 `lib/i18n/registry.test.mjs` 强制一致；删除 `chat.askUserAppFailed*` 四键后三份消息表键集合仍相等。

### a11y 与键盘契约（归属组件）

可访问性实现只写一次，随组件走；宿主不重复实现：

| 项 | 行为 |
| --- | --- |
| 单选组 | `role="radiogroup"` + `aria-labelledby` 指向问题文本（`id="pi-ask-<askId>-q-<index>"`） |
| 单选项 | `role="radio"` + `aria-checked` + roving tabindex（整组一个 tab 停靠点：已选项或第一项为 `0`，其余 `-1`） |
| 单选键 | `ArrowDown`/`ArrowRight` 下一个、`ArrowUp`/`ArrowLeft` 上一个、`Home`/`End` 首/末；空组时前进键选第一项、后退键选最后一项；移动即选中并聚焦 |
| 多选组 | `role="group"` + `role="checkbox"`；每项保留默认 tab 停靠点；`Space` 切换；不响应方向键 |
| 状态字符 | `○ ◉ ☐ ☑ ✓ ✎` 一律 `aria-hidden="true"`；状态只由 `aria-checked` 表达 |
| 计数 | `role="status"` + `aria-live="polite"` |
| 锁定状态 | `role="status"` + `aria-live="polite"` + `tabindex="-1"`；锁定时把焦点移到这里，避免控件 disabled 后焦点掉到 body |
| 错误 | `role="alert"` |
| 输入框 | 自定义输入与补充 textarea 各有 `aria-label` |
| 容器 | `role="dialog"` + `aria-label`，**不带** `aria-modal`；没有实现焦点陷阱，声称模态是假的 |
| 焦点环 | 样式表里一条 `:focus-visible` 规则；输入控件**不得**写内联 `outline: none`（内联样式会压过该规则） |

### controller 契约（`lib/ask-user/view-controller.ts`）

纯 reducer + selectors，无框架、无 DOM、无 node，可驱动 React `useReducer`，也可驱动纯 DOM 宿主：

- `AskUserViewState.drafts` 是 **`Map`**，不是普通对象：question id 由模型生成，可能是 `__proto__` / `constructor` 这类会撞上 `Object.prototype` 的键，普通对象会污染或读错。
- `multiple` **随 action 传递**（`{ type: "toggle-option", …, multiple }`），reducer 不需要 `AskUserQuestion` 就能解释语义，因此可单独测。
- action：`toggle-option`、`set-other-text`、`set-supplement`、`submit-requested`、`cancel-requested`、`action-failed`。reducer 纯、不抛、不改输入。
- selectors：`draftFor`、`isQuestionAnswered`（`values.length > 0 || otherText.trim() !== ""`）、`answeredCount`、`isLocked`、`questionSummary`（`✓ value · value · otherText`，用选项原始 value）。
- `buildAskUserSubmission` 组装 payload：未触碰的问题跳过、空白自定义文本丢弃、空白 supplement 省略。宿主仍要过 `validation.ts` 的 `validateSubmission`；controller 只保证结构。
- `action-failed` 解锁并保留错误以便重试。"答案可能已在途"的保证来自在途锁（`submitting` / `cancelling`），不是这条路径。

### `data-ask-user-view="shared"` 标记

宿主容器固定标注 `data-ask-user-view="shared"`。这是"这个 ask 走哪条渲染路径"的唯一 DOM 抓手。旧的 `loading` / `apps` / `failed` 三态只服务于 iframe 生命周期（异步投影、握手、降级），单渲染器下都不是状态，已删除。`document.querySelector('[data-ask-user-view]')` 非空即当前渲染路径。

### 失败与重试

单一渲染器没有"投影失败"降级态：`AskUserView` 同步渲染 `props.ask`，宿主没有 fetch、没有握手、没有超时。用户可见的失败只剩**命令失败**——`onSubmit` / `onCancel` 返回的 promise reject 时 controller 解锁并显示 `labels.actionFailed`，用户可以原地重试。AskUser 专用 Web UI/API/helper/env 开关已退役；旧 askUser:false 与 PI_WEB_ASK_USER=0 不再消费，不做真实配置迁移写入。历史 pending 的展示/关闭不要求当前系统工具可用。旧版 `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS` 开关与三语 `chat.askUserAppFailed*` 四键已删除。

浏览器回归在 `e2e/ask-user.mjs`（真实 Chromium）：渲染、roving tabindex、方向键、Space、选项/自定义互斥、提交锁定 + 摘要 + 状态行聚焦、reject → alert + 解锁 + 重试、取消，以及 5 套主题下 `--pi-ask-*` 映射断言。

### PA 接入前置

Personal Assistant 作为第二个 React 宿主，接入时只需：

1. 在自己的容器上渲染 `<AskUserView>`，用 `key={ask.askId}` 让新 ask 重挂载表单。
2. 映射 `--pi-ask-*` 变量（或全省略以保留 `light-dark()` 兜底）。
3. 传 `locale` 和/或 `labels`；都不传就用包内三语表。
4. `onSubmit` / `onCancel` 只做命令发送；open-ask 生命周期（supersede、关闭、重试）留在宿主，不在视图。
5. 不用 React 的宿主可以直接驱动 `view-controller.ts` 并渲染自己的 markup，但必须自行复刻上面的 a11y 契约。

Web 只拥有版本化 host DTO 与入口解码；外部工具解析 bridge 与核验 ack；视图渲染与桥接是两件正交的事：桥接决定"谁登记 ask 并收到答案"，视图决定"怎么问"。

### 为什么 Apps 路径被退役

简版：PA 是 React，两个 React 宿主之间 iframe 没有隔离收益；这条 iframe 管线（适配器 + 投影端点 + 字体清单 + token 消毒 + 握手 + 降级态 + 依赖）与被删的那张原生卡片是 6:1 的成本；视图作者就是我们自己，opaque-origin 的威胁模型不成立。被否决的方案（封存 iframe 并写 conformance 门槛、两套渲染器共存、把视图拆成独立包/仓库）与后果（删 4 个 `@modelcontextprotocol/*` + `zod`、单一渲染器、包内三语文案、`data-ask-user-view="shared"`、第三方 Apps 宿主无法渲染此视图）见 `docs/adr/0004-ask-user-shared-react-view.md`。

## 文件布局

- `lib/ask-user/{types,protocol,validation,format}.ts` — Web v1 DTO、host 解码、浏览器答案校验/格式。零 SDK runtime 依赖，客户端不导入系统工具/TUI。
- `lib/ask-user/{extension,extension-policy}.ts` — bridge-only inline host 与工具级投影；无启用 preference/env。
- `lib/ask-user/{store,persist,resolve-pending-ask}.ts` — 原状态、best-effort 镜像与迟到 close resolver。
- `lib/ask-user/view-controller.ts` / `lib/ask-user/view/` — 纯表单 reducer、React view/copy/CSS/keyboard 与结构测试；原行为保持，没有 Pi 包 manifest。
- `components/AskUserAppHost.tsx` — 文案、CSS 变量、命令薄适配器，固定 shared DOM 标记。
- `lib/rpc-manager.ts` / `lib/subagent-runtime.ts` — 同 loader 身份、policy composition、子代理 deny；原 open/close/admission/hydrate 不改名。
- `hooks/useAgentSession.ts` — 原 pendingAsk、submit/cancel、SSE、hydrate/轮询。
- `lib/ask-user/fixtures/protocol-package/` — 仅测试的最小 peer，产品不 import/发现，不是备用工具。

已删除：portable Pi 包入口/manifest/bridge resolver/tool schema/prompt/execute 与再导出；Web AskUser 设置 UI/API/helper/env。四个宿主 coding SDK pins 不变。旧设置字段作为共享设置的 unknown 保留。

已删除（不要重新引入）：`lib/ask-user/mcp-view-html.ts`、`lib/ask-user/mcp-app-adapter.ts`、`lib/ask-user/theme-tokens.ts`、`lib/ask-user/view-fonts.ts`、`lib/ask-user/view-font-manifest.ts`、`components/AskUserAppFailure.tsx`、`app/api/agent/[id]/ask-view/route.ts`、`app/api/ask-user/font-faces/route.ts`，以及 `@modelcontextprotocol/*` 4 个包与 `zod`。历史证据保留在归档任务目录（`.trellis/tasks/archive/2026-09/09-26-ask-user-mcp-migration/research/fixture/`），其中仍 import 这些包，属历史记录，不再可运行，**不要编辑**。

## 陷阱

- 官方 `question.ts` 扩展示例检查 `ctx.mode !== "tui"` 会拒绝运行；本功能不依赖 `ctx.ui`，与官方扩展互不干扰。
- Chat-only 沿原 no-resource/empty-tool 边界；子代理额外撤销系统 ask_user。
- host open 在调用时查 alive registry wrapper，并同时核验 loader 身份；不捕获旧 wrapper。
- 工具注入代码在 server 端模块，旧 dev server 进程不会热加载（验证时需重启 dev server）。
- 系统安装/资源变更按 SDK reload 生效，Web host 订阅随真实 AgentSession 生命周期重建。

## UI 布局（ask 视图随消息流滚动）

- 非空会话：`AskUserAppHost` 渲染在消息滚动容器内（`messageContentRef` 内、`{rendered.slice(startIndex)}` 之后），跟随对话滚动，输入框上方不再固定占位，消息可视区域保持全高。宿主容器 `maxWidth: 820`、`minHeight: 220`，无固定高度上限、无内部滚动，问题较多时由整个滚动区承担滚动。
- 空会话（新会话页）：视图在 header 与 composer 之间，保持 `padding: 0 16px 12px`（桌面端 `paddingRight: 52`）的列对齐包装。
- 命名约定（`ChatWindow.tsx`）：`askUserCardElement` 是裸宿主（滚动流内使用），`askUserCardInColumn` 是带列对齐 padding 的包装（仅空会话使用）。改动布局时注意两处引用语义不同。
- ask 出现时无需额外滚动逻辑：`prompt_done`/`agent_end` 使 `agentRunning` 置 false 后，现有 `useLayoutEffect` 在 `isNearBottom` 时 `scrollToBottom`，视图自动进入视野；用户已上滚查看历史时不打扰。ask 与 agent running 不同时存在，`promptAnchorSpacer` 测量不受影响。
- 回归测试：`components/ChatWindow.ask-user-layout.test.mjs`（源码断言）覆盖宿主在滚动容器内、composer 区不再承载 ask 视图、空会话包装、宿主无 maxHeight/内部滚动；`components/AskUserAppHost.test.mjs` 覆盖宿主只做文案/CSS 变量/命令转发、固定 `shared` 标记、以及宿主不携带任何 MCP Apps/iframe/字体投递路径。
