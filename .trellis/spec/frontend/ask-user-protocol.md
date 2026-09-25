# ask_user 提问协议

> Pi Web 的 `ask_user` 工具契约、状态机与前后端协议。

## 背景与设计决策

`ask_user` 让模型向用户提问，问题以浏览器卡片呈现，答案以 follow-up 消息唤醒模型。实现参考 `pi-web` fork（`src/server/sessions/askUserTool.ts` + `pendingAskStore.ts`），移植为 agegr-pi-web 架构。

**核心决策：异步非阻塞，不用 `ctx.ui`。** `ctx.ui.*` 是阻塞式（agent 运行被 pin 住、SSE 长连、状态易失）。`ask_user` 调用后返回 `terminate: true` 结束本轮运行，问题存为进程级状态，答案通过 `sendCustomMessage(..., { triggerTurn: true, deliverAs: "followUp" })` 送达模型。

## 工具契约

- 工具名 `ask_user`，通过 InlineExtension（`lib/ask-user/extension.ts`）注册，注入到主会话的 `extensionFactories`（非 chatOnly、非子代理会话）。
- 作为扩展而非 SDK `customTools`，工具在每次会话 reload 时重新注册，所以设置开关变更后 reload 会话即可生效（与 built-in subagents 同生命周期）。
- 参数：`questions[]`（每项 `id/question/detail?/options[]/multiple?`）。限制：≤20 问题、每题 ≤12 选项、id ≤128、文本 ≤1000、自定义文本 ≤4000。
- 执行：登记为会话 open ask 后返回 `{ terminate: true }`；畸形问题集抛 `PendingAskValidationError`（变 error tool result，模型可自纠重发）。
- 工具文本明确告知模型"答案将以 follow-up 唤醒，不要重复提问"；supersede 时附加旧 ask 未答列表。
- 调用引导在 `lib/ask-user/portable/tool.ts:139-142` 的 `promptSnippet` / `promptGuidelines`：仅在工具可用、继续当前请求必须等待缺失事实、范围选择或必要决策时调用；把相关问题合并后单独、最后调用。普通对话、修辞性提问与非阻塞的后续建议仍用文字，工具不可用时也用文字。回答只用于澄清，不代替敏感操作授权。对应契约断言在 `lib/ask-user/tool.test.mjs`；断言只验证提示元数据，不证明模型遵循。实际效果要用同模型、同配置的独立会话记录调用结果；单次冒烟不能推断调用率变化。

## 跨宿主桥接（SDK 0.85.1 本地原型）

### 1. 适用范围

`lib/ask-user/portable/` 是 `private: true` 的本地 Pi 包，入口由 `package.json` 的 `pi.extensions: ["./index.ts"]` 发现。Pi Web 仍由 `lib/ask-user/extension.ts` 直接给共享工具工厂注入 `open`，不走下面的事件桥；其他宿主必须显式绑定。安装包本身不会创建卡片、提供答案 API、授权写操作或唤醒模型，也不自动启用 PA 定时任务里的 `ask_user`。

### 2. 签名

`openAskThroughBridge(bus, { conversationId, questions }): Promise<PendingAskOpenResult>` 定义在 `lib/ask-user/portable/bridge.ts`。包入口 `index.ts` 在工具执行时发出 `pi.ask-user.bridge:resolve-open:v1`，同一个 SDK resource loader 上的宿主监听器必须同步调用事件请求的 `register(open)`，`open(request): Promise<PendingAskOpenResult>` 可以异步登记。监听器不能先 `await` 再注册。

### 3. 契约

- `open` 收到 `{ version: 1, conversationId: string, questions: AskUserQuestion[] }`；问题先经过 `portable/validation.ts` 的有界校验并被复制。`conversationId` 是不透明会话身份，不是 Pi Web 的 SSE/持久化字段。
- 宿主 `open` 负责在 resolve 前登记可恢复的 ask，并返回 `{ ask: { askId, askedAt, questions }, superseded? }`；`ask.questions` 必须与调用的 id、文本、选项、多选标志及顺序一致。发生替换时 `superseded.reason` 必须为 `"superseded"`，并包含可报告的 `unansweredIds`。
- `pi.events` 属于 loader；另一个 loader 的监听器不生效。SDK event bus 的 `emit()` 返回值不表示已绑定，监听异常也可能被 SDK 捕获，必须计数同步注册。只有宿主 resolve 且 ack 有效后，工具才返回 `terminate: true`。ack 的持久化真实性仍由受信任宿主保证，包只能校验结构和问题身份。

### 4. 校验与错误矩阵

| 条件 | 结果 |
| --- | --- |
| 空/重复/超限问题或畸形运行时字段 | `PendingAskValidationError`，不触发宿主 `open` |
| 缺失、延后或重复 `register` | `AskUserBridgeError`，不调用 `open` |
| 宿主 `open` 拒绝 | 原错误传播，不返回 `terminate: true` |
| 缺失 ack、问题不匹配、不可报告的 supersede | `AskUserBridgeError`，不返回 `terminate: true` |
| 恰好一次同步注册、成功登记且有效 ack | 返回共享工具结果并 `terminate: true` |

### 5. 正常/边界/错误案例

正常：`lib/ask-user/portable/discovery.test.mjs` 从**独立拷贝**的目录加载包，同 loader 的 inline 宿主登记并返回匹配的 ask。边界：`lib/ask-user/extension.test.mjs` 证明 Pi Web 开关关闭时不注册工具，打开时仍直接查找实时 session。错误：无监听器或伪造不同问题的 ack 都由 `bridge.ts` 拒绝；不会用成功结果掩盖未登记的 ask。

### 6. 必测断言

`discovery.test.mjs` 验证本地包发现、peer 为 0.85.1、拷贝目录无需指回 Pi Web 的 node_modules、缺失/重复 bridge 与畸形 ack 的失败关闭；`bridge.test.mjs` 验证边界输入和 supersede；`store.test.mjs` 验证失败的提交不会关闭已打开的 ask；`extension.test.mjs` 验证 Pi Web 开关和 session lookup。PA 的 Stage A 固定目录准入仅有隔离探针；Stage B、定时任务排除、重启后答案交付属于另一个仓库的任务，不能写成已验证。

### 7. 错误与正确方式

错误：工具发现没有桥接宿主时返回 `{ terminate: true }`，再寄希望于某个浏览器稍后显示卡片。正确：在执行时通过同 loader 的事件请求拿到**唯一、同步注册**的 `open`，等待宿主登记和有效 ack；否则抛错，让模型得到 error tool result。禁止用全局变量或直接导入 Next/PA 内部模块绕过宿主准入。

## 状态机（`lib/ask-user/store.ts` 的 `PendingAskStore`）

每会话至多一个 open ask：`open → (supersede|submit|cancel)`。

- `open`：关闭旧 ask（supersede）并返回其 outcome，登记新 ask。
- `submit`：校验答案匹配 open ask（未知 id / 重复 / 选项不存在 / multiple 冲突 / 超长均拒绝），拒绝时 ask 保持打开。
- `cancel`：无答案关闭，outcome 全未答。
- `cancelOpen`：用户发普通消息时作废（`prompt` 命令 preflight 接受后调用），`triggerTurn: false` 搭用户消息便车，不单独唤醒。
- `forgetSession`：wrapper `destroy()` 时清理**内存**。
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
- 浏览器侧 `submitAsk(askId, answers, supplement?)` 传递；`AskUserCard` 底部"补充信息（可选）"多行框。

### 提交锁定

- `AskUserCard` 提交/取消后进入 `submitted`/`cancelling` 状态（`locked`）：选项按钮 disabled、输入 readOnly、操作栏显示"已提交 ✓"、每题下渲染提交摘要（`✓ values · otherText`）。
- 正常路径 `syncPendingAsk(response)`（pendingAsk undefined）使卡片消失；若因 SSE 关闭/重水合竞态卡片残留，`locked` 保证不可再编辑——答案已交付，避免"不确定最终提交了什么"。
- 单选问题：选选项清空自定义文本、输入自定义文本取消选项（互斥）；多选问题选项与自定义可共存，自定义输入框占位文案区分（`askUserMultipleOtherPlaceholder`）。

### 状态残留与关闭竞态

- `ChatWindow` 中 `<AskUserCard key={pendingAsk.askId} ...>`：ask 切换必须重建组件，否则旧 ask 的 `status`（submitting/locked）、drafts、supplement 会泄漏到新卡片（表现为新卡片选项无反应、输入禁用）。
- 关闭命令（submit/cancel）响应可能晚于新 ask 打开到达：此时服务端对旧 askId 返回 stale，响应无 `pendingAsk` 时不得清掉已打开的新 ask。解析逻辑在 `lib/ask-user/resolve-pending-ask.ts` 的 `resolvePendingAskAfterClose(current, submittedAskId, response)`：当前 ask 与提交 askId 不同 → 保留当前（除非响应显式带替换）。
- 该模块必须保持零依赖（无 `@/` 别名、无框架导入），才能被纯 Node 测试 jiti 导入。

## 事件与命令协议

- SSE 事件：`ask.opened`（`{ type, ask }`）、`ask.closed`（`{ type, askId, reason }`）。浏览器据此维护卡片；supersede 时先发旧 `ask.closed` 再发新 `ask.opened`。
- 命令（`POST /api/agent/[id]`）：`ask_submit`（`askId` + `answers[]`）、`ask_cancel`（`askId`）。
- 关闭响应：`{ result: "closed"|"stale", outcome?, pendingAsk? }`；stale 是普通竞态（已关闭/被取代/会话销毁），浏览器按返回 `pendingAsk` 重水合，不是错误。
- `get_state` 返回 `pendingAsk`，浏览器刷新后重水合卡片。
- 答案以 custom message（`customType: "pi-web.ask.answers"`，`display: true`）进 transcript，不署名用户。
- **答案送达是 fire-and-forget**（`closeAsk` 里 `void sendCustomMessage(...).catch(日志)`）：agent 空闲时 `triggerTurn` 走完整 agent prompt，promise 要到整个 turn 结束才 resolve——`await` 它会挂住 `ask_submit` 响应，浏览器卡片停在"已提交"直到 agent 处理完。提交/取消响应必须立即返回，答案在后台唤醒模型。
- **跨设备同步**：`ask.closed` SSE 只到达提交设备的实时流（空闲会话的 SSE 在 grace 窗口后已关闭），其他设备收不到。卡片显示期间客户端每 3s 轮询 `/api/sessions/[id]/state`（含持久化回退）兜底同步：远端提交/取消后，本端在数秒内关闭卡片或切到新 ask。本地提交仍走 `ask_submit` 响应即时关闭。

## 文件布局

- `lib/ask-user/portable/` — 可本地安装的 Pi 包（`pi.extensions: ["./index.ts"]`、`peerDependencies` 钉死 SDK 0.85.1、`private: true`、MIT `LICENSE` + `README.md` 记录 bridge 契约与本地安装）。其中 `types.ts` 为有界 DTO/限制，`validation.ts` 为唯一的提问/答案校验器，`format.ts` 为答案文本渲染，`tool.ts` 为 `createAskUserToolDefinition`（`defineTool` + TypeBox schema），`bridge.ts` 为显式 host bridge 解析（`pi.ask-user.bridge:resolve-open:v1`，要求恰好一个同步 `register`）。缺失/多个 bridge、畸形问题、ack 缺少有界 `askId`/`askedAt`、ack 的 questions 与校验后的提问身份不一致（id/文本/选项/`multiple`/顺序），或 `superseded` 不是带 `unansweredIds` 的 `reason: "superseded"` 结果，全部 fail closed，不返回 `terminate: true`。安装验证必须用目录拷贝；指回本仓库 `node_modules` 的符号链接不算独立安装。`index.ts` 为包入口，把 bridge 注入共享工具。
- `lib/ask-user/types.ts` — 再导出 `./portable/types`，并保留 Pi Web 专有的 `ASK_USER_ANSWERS_CUSTOM_TYPE` 与 `AskUserCloseResponse`
- `lib/ask-user/store.ts` — `PendingAskStore` 状态机与 outcome 计算；校验/渲染委托给 `./portable`（对外导出面不变）
- `lib/ask-user/persist.ts` — open ask 磁盘镜像（读/写/替换/删除，损坏降级，无框架依赖）
- `lib/ask-user/tool.ts` — 再导出 `./portable/tool`（Pi Web 内联适配器直接注入 `open`，不走 bridge）
- `lib/rpc-manager.ts` — 注入、命令、事件、作废钩子、`get_state` 投影
- `lib/ask-user-settings.ts` + `app/api/settings/ask-user/route.ts` — 开关持久化（`~/.pi/agent/pi-web-settings.json` 的 `askUser` 字段）+ GET/PUT；`PI_WEB_ASK_USER` env 优先于文件
- `hooks/useAgentSession.ts` — `pendingAsk` 状态、`submitAsk`/`cancelAsk`、事件处理、重水合
- `components/AskUserCard.tsx` — 问题卡片（选项/多选/自定义/部分作答）
- `components/SettingsPanel.tsx`（GeneralSettings）— ask_user 开关 + reload 提示/按钮

## 陷阱

- 官方 `question.ts` 扩展示例检查 `ctx.mode !== "tui"` 会拒绝运行；本功能不依赖 `ctx.ui`，与官方扩展互不干扰。
- chatOnly 会话（空工具 allow-list）不会激活 `customTools`，无需特判工具可见性。
- 扩展的 `open` 在工具执行时按 `sessionId` 从 `getRegistry()` 查 wrapper（注册先于扩展绑定，无时序问题）。
- 工具注入代码在 server 端模块，旧 dev server 进程不会热加载（验证时需重启 dev server）。
- 开关变更只影响 reload 后的会话；已存在会话的扩展绑定在 reload 时重建。

## UI 布局（卡片随消息流滚动）

- 非空会话：`AskUserCard` 渲染在消息滚动容器内（`messageContentRef` 内、`{rendered.slice(startIndex)}` 之后），跟随对话滚动，输入框上方不再固定占位，消息可视区域保持全高。卡片无固定高度上限、无内部滚动，问题较多时由整个滚动区承担滚动。
- 空会话（新会话页）：卡片在 header 与 composer 之间，保持 `padding: 0 16px 12px`（桌面端 `paddingRight: 52`）的列对齐包装。
- 命名约定（`ChatWindow.tsx`）：`askUserCardElement` 是裸卡片（滚动流内使用），`askUserCardInColumn` 是带列对齐 padding 的包装（仅空会话使用）。改动布局时注意两处引用语义不同。
- ask 出现时无需额外滚动逻辑：`prompt_done`/`agent_end` 使 `agentRunning` 置 false 后，现有 `useLayoutEffect` 在 `isNearBottom` 时 `scrollToBottom`，卡片自动进入视野；用户已上滚查看历史时不打扰。ask 与 agent running 不同时存在，`promptAnchorSpacer` 测量不受影响。
- 回归测试：`components/ChatWindow.ask-user-layout.test.mjs`（源码断言）覆盖卡片在滚动容器内、composer 区不再承载卡片、空会话包装、卡片无 maxHeight/内部滚动。
