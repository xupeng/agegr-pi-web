# Pi Web 切到共享视图并删除 MCP Apps 渲染路径

## Goal

让 Pi Web 成为共享 React 视图的第二个（也是第一个）消费者，并彻底删除 MCP Apps iframe 渲染路径：不再有固定内置文档、不再有 sandbox/握手/消息校验、不再有 token 值投递与字体字节投递、不再有降级态，并清掉随之而来的 5 个依赖。协议与生命周期行为保持不变。

## Background

- 依赖 `09-26-ask-user-view-controller`（A）与 `09-26-ask-user-react-view-package`（B）。两者测试全绿前不得执行本任务的删除动作。
- 删除清单与理由见父任务 `09-26-ask-user-shared-view/prd.md` 的 R5 与 Technical Notes（已在父任务中显式决定删除，不封存）。
- 必须保持不动的行为清单见父任务 R6：`PendingAskStore`、`persist.ts`、`restore()` 保留原 `askId`、`resolve-pending-ask.ts`、SSE `ask.opened`/`ask.closed`、`ask_submit`/`ask_cancel`、`get_state` 投影、3s 轮询兜底、`terminate: true` + fire-and-forget。
- 现存依赖证据：`zod` 仅 `lib/ask-user/mcp-app-adapter.ts:27`；4 个 `@modelcontextprotocol/*` 仅 `mcp-app-adapter.ts:16-26` + `next.config.ts:27-30`。`lib/next-config.test.mjs` 对这些 externals 有断言，需一并调整。
- 布局语义现状：非空会话的宿主渲染在 `messageContentRef` 内、空会话用 `askUserCardInColumn` 包装；`components/ChatWindow.ask-user-layout.test.mjs` 是源码断言，需同步。
- `data-ask-user-view` 只被 `components/AskUserAppHost.tsx:546` 与其测试引用，无 e2e 依赖。

## Requirements

**R1 — 切换渲染**：`components/AskUserAppHost.tsx` 保留对外 props 与挂载位置，内部改为直接渲染 B 的 `AskUserView`，把 `t()` 结果作为 labels 传入，把 `submitAsk`/`cancelAsk` 作为 `onSubmit`/`onCancel` 传入。`<AskUserAppHost key={pendingAsk.askId}>` 的重新挂载语义必须保持（ask 切换不得泄漏 drafts/locked 状态）。

**R2 — 执行删除清单**（父任务 R5 逐项）：`lib/ask-user/mcp-view-html.ts`、`lib/ask-user/mcp-app-adapter.ts`、`app/api/agent/[id]/ask-view/route.ts`、`app/api/ask-user/font-faces/route.ts`、`lib/ask-user/theme-tokens.ts`、`lib/ask-user/view-fonts.ts`、`lib/ask-user/view-font-manifest.ts`、`components/AskUserAppFailure.tsx`、`ASK_USER_VIEW_SCRIPT_HASH` 与 CSP 哈希双处同步约束、iframe 沙箱/握手/消息校验/`size-changed` 显形/6s 超时、注入的 viewport meta 与 `text-size-adjust`、三语 `chat.askUserAppFailed*` 四键。

**R3 — 依赖与构建配置清理**：从 `package.json` 移除 4 个 `@modelcontextprotocol/*` 与 `zod`；从 `next.config.ts` 移除对应 `serverExternalPackages`；同步 `lib/next-config.test.mjs` 的相关断言。清理后 `package-lock.json` 需一致。

**R4 — 可观测标记收敛**（已决定）：删除 `data-ask-user-view` 的 loading/apps/failed 三态，保留该属性并固定为单一值 `shared`。保留的理由是它仍是排查「这个 ask 走哪条渲染路径」时的唯一 DOM 抓手且成本为零；三态在单渲染器下不是状态（没有投影要等、没有握手、没有降级）。`components/AskUserAppHost.test.mjs` 的断言改为 `data-ask-user-view="shared"`，并删除针对 `native` / `apps-pending` / `failed` 及已删协议的断言。

**R5 — 协议零变化**：R6 清单中的所有既有测试原样通过；`ask.opened`/`ask.closed`、`ask_submit`/`ask_cancel`、`get_state.pendingAsk`、3s 轮询与重水合路径的观测行为不得改变。

**R6 — spec 与 ADR 更新**：重写 `.trellis/spec/frontend/ask-user-protocol.md` 的 MCP Apps 渲染章节为共享 React 组件章节（含 CSS 变量契约、文案注入面、a11y 归属、PA 接入前置）；放开 `light-dark(#…)` 第二套硬编码色板禁令；回滚 PR #9 在 `component-guidelines.md`、`directory-structure.md`、`state-management.md`、`quality-guidelines.md` 新增的条目；新增 ADR 记录「共享 React 视图替代 MCP Apps iframe」的决策与「删除而非封存」的理由。

## Acceptance Criteria

- [ ] Pi Web 的 `ask_user` 由共享 React 组件直接渲染；源码中不再存在 `srcdoc`、`sandbox="allow-scripts"`、`ui/initialize` 握手、`postMessage` 消息校验或字体字节投递。
- [ ] R2 删除清单的文件全部不存在，且没有任何 import/路由引用残留（全仓库搜索无死角）。
- [ ] `package.json` 不含 4 个 `@modelcontextprotocol/*` 与 `zod`；`next.config.ts` 无对应 externals；`lib/next-config.test.mjs` 通过；lockfile 一致。
- [ ] `components/AskUserAppHost.test.mjs` 断言共享组件渲染与回调转发，不再断言任何 Apps 协议行为；`data-ask-user-view` 固定为 `shared`。
- [ ] R5 的既有测试全部通过，且未修改其断言语义（只允许因文件位置变化而调整 import 路径）。
- [ ] 三语 `chat.askUserAppFailed*` 四键删除，三份消息表仍保持一致（键集合相等）。
- [ ] `ask-user-protocol.md` 与实现一致；`light-dark()` 禁令已放开并说明原因；ADR 已新增；其余四份 spec 的 PR #9 条目已回滚。
- [ ] `node_modules/.bin/tsc --noEmit`、`npm run lint`、`XDG_STATE_HOME= npm test` 通过。

## Out of Scope

- 修改 controller 或共享组件的行为（属于 A、B）。
- 修改任何 `ask_submit`/`ask_cancel`/SSE/持久化语义。
- 为第三方 MCP Apps 宿主保留兼容层或特性开关。
- 修复既存的孤儿 i18n 键 `chat.askUserOther`（除非删除动作顺带覆盖）。
