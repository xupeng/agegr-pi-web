# 把 ask_user 视图改成共享 React 组件，退出 MCP Apps iframe 渲染

## Goal

恢复 `ask_user` 视图的单一实现，但换掉载体：把视图从「Pi Web 自有的 MCP Apps iframe 文档」提升为包里框架无关的共享 React 组件，让 Pi Web 与 Personal Assistant（PA）两个 React 宿主复用同一份视图与同一份行为状态机。净效果是删掉整条 iframe 管线（≈2187 行代码 + 5 个依赖），只留一份行为实现与一份 a11y 实现。

## Background

已核实的事实（含锚点）：

- PR #9（merge `9c2cd86`）把 `ask_user` 的唯一呈现收到 MCP Apps 视图，删除了原生 `components/AskUserCard.tsx`（361 行；可由 `git show 367d18c^:components/AskUserCard.tsx` 取回，是该视图的原生实现参照）。
- 现行 iframe 管线体量：`lib/ask-user/mcp-view-html.ts` 824 行、`components/AskUserAppHost.tsx` 604 行、`lib/ask-user/mcp-app-adapter.ts` 258 行、`lib/ask-user/view-fonts.ts` 158 行、`lib/ask-user/view-font-manifest.ts` 124 行、`components/AskUserAppFailure.tsx` 121 行、`lib/ask-user/theme-tokens.ts` 77 行、`app/api/ask-user/font-faces/route.ts` 21 行，合计 ≈2187 行 —— 相对于它服务的 361 行卡片是 6:1，且这个比率不包含握手/字体投递/降级态这些只由宿主架构需要的东西。
- 依赖硬绑定：`zod@4.2.0` 全仓库仅 `lib/ask-user/mcp-app-adapter.ts:27` 使用；4 个 `@modelcontextprotocol/*` 仅 `lib/ask-user/mcp-app-adapter.ts:16-26` 值导入，外加 `next.config.ts:27-30` 的 `serverExternalPackages` 条目。
- 视图行为断言（提交/取消锁定、每题提交摘要 `✓ values · otherText`、supplement 透传、单选互斥与多选占位、`ask_submit` payload 组装）目前**唯一**覆盖在 `lib/ask-user/mcp-view-html.test.mjs`（510 行、17 个顶层 test）。它在最小 DOM shim 上执行真实内联脚本并断言 `tools/call` 载荷。
- 文案现状：`components/AskUserAppHost.tsx:315-333` 把 12 个标签（`title`/`answered`/`otherPlaceholder`/`multipleOtherPlaceholder`/`supplementTitle`/`supplementPlaceholder`/`submitted`/`cancelling`/`hint`/`cancel`/`submit`/`actionFailed`）从 `lib/i18n/messages/{en,zh-CN,zh-TW}.ts:394-403` 读出后随投影投递给帧；帧自身不做 i18n。另有一个已被孤立的 `chat.askUserOther` 键（PR #9 之前就没有调用方），属于既存死文案。
- `lib/ask-user/portable/` 已存在，是 `private: true` 的本地 Pi 包（`package.json` 的 `pi.extensions: ["./index.ts"]`，`peerDependencies` 钉 SDK 0.85.1），已有 `types/validation/format/tool/bridge`；**没有** `view-controller.ts`，也**没有** `react/`。
- PR #9 的前提「PA 保留自己的卡片，是独立任务」已失效：PA 是 React 宿主，两个 React 宿主之间的 opaque-origin iframe 买不到隔离收益，两套渲染器正是 PR #9 要消灭的东西。

## Requirements

**R1 — 行为单一实现且不依赖宿主。** 抽出零依赖状态机 `lib/ask-user/portable/view-controller.ts`，承载 drafts、单选与自定义文本互斥、多选与自定义共存、supplement、`locked`、每题提交摘要、`ask_submit` payload 组装。它不得 import 任何宿主框架（无 React、无 `@/` 别名、无 `node:`），以便被 Pi Web、PA 或纯 DOM 宿主消费。

**R2 — 测试资产平移而非重写。** `lib/ask-user/mcp-view-html.test.mjs` 里的每一项行为断言，必须在删除该文件之前于 controller 上有等价断言通过。允许改写断言载体，不允许减少覆盖点；每一项受测行为在实施产物里逐条映射到新断言。这是本任务不可协商的部分：这份文件是当前唯一的行为回归资产，丢掉它等于丢失提交锁定与 payload 组装的安全网。

**R3 — 共享 React 视图。** `lib/ask-user/portable/react/AskUserView.tsx` 消费 controller；React 是 peer dependency，不打包进包；宿主只提供 `--pi-ask-*` 变量映射与可选的文案逐键覆盖，不提供 token 值数组、不提供字体字节、不做消息握手。文案默认由包内三语表提供（见 R7）。

**R4 — 配色与度量走 CSS 变量契约。** 组件只消费约定命名的 CSS 变量，缺值时用 `light-dark()` 与系统字体栈兜底；a11y 契约（`radiogroup`/`group`、roving tabindex、`aria-checked`、`role="status" aria-live`、`:focus-visible` 焦点环、状态字符 `aria-hidden`）随组件走，只实现一次。Pi Web 的 5 套主题（light/dark/mist/rose/pine）+ `auto` 由宿主做变量映射，而不是让组件猜调色板。

**R5 — Pi Web 切换并删除 MCP Apps 渲染路径。** `AskUserAppHost` 的位置与滚动语义保持不变（非空会话渲染在消息滚动容器内、空会话在 composer 上方做列对齐），但内部改为直接渲染共享组件。删除清单：`lib/ask-user/mcp-view-html.ts`、`lib/ask-user/mcp-app-adapter.ts`、`app/api/agent/[id]/ask-view/route.ts`、`app/api/ask-user/font-faces/route.ts`、`lib/ask-user/theme-tokens.ts`、`lib/ask-user/view-fonts.ts`、`lib/ask-user/view-font-manifest.ts`、`components/AskUserAppFailure.tsx`、`ASK_USER_VIEW_SCRIPT_HASH` 与 meta CSP 哈希双处同步、iframe 沙箱/握手/opaque-origin 消息校验/`size-changed` 显形/6s 超时、`data-ask-user-view` 三态与注入的 viewport meta/`text-size-adjust`、三语 `chat.askUserAppFailed*` 四键，以及 4 个 `@modelcontextprotocol/*` + `zod` 依赖和 `next.config.ts` 的对应 externals。

**R6 — 协议与生命周期保持不动。** `PendingAskStore`、`persist.ts`、`restore()` 保留原 `askId`、`resolve-pending-ask.ts`、SSE `ask.opened`/`ask.closed`、`ask_submit`/`ask_cancel` 命令、`get_state` 投影、3s 轮询兜底、`portable/` 的 types/validation/format/tool/bridge、`terminate: true` + fire-and-forget 送达，观测行为全部不变。这些从来不是 iframe 的功劳，不得被连带删除。

**R7 — 契约以 PA 可接入为准。** 组件必须能在不 import Pi Web 任何模块的前提下被 PA 渲染：文案自带默认表且可覆盖、主题可由 CSS 变量映射、不需要 loader 事件桥（bridge 只服务于工具的 `open`）。产出契约文档 + 一个最小可运行 fixture 宿主作为证据。逐项接口面见 Technical Notes 的「R7 的 PA 接入前置」。

## Acceptance Criteria

- [ ] `lib/ask-user/portable/view-controller.ts` 存在且零框架/零 `@/`/零 `node:` 依赖；`mcp-view-html.test.mjs` 的每个受测行为都有对应的 controller 断言，逐条映射记录在 `09-26-ask-user-view-controller/research/assertion-migration.md`。
- [ ] `lib/ask-user/portable/react/AskUserView.tsx` 在只提供 CSS 变量映射（文案走包内默认表）的前提下渲染完整交互（选项、自定义输入、多选、supplement、提交、取消、锁定摘要、键盘操作），React 是 peer dependency。
- [ ] Pi Web 的 `ask_user` 呈现由共享 React 组件直接渲染；源码中不再存在 `srcdoc`、`postMessage`/`message` 事件校验、`sandbox="allow-scripts"` 或 `ui/initialize` 握手路径；`components/AskUserAppHost.test.mjs` 中针对 iframe/Apps 协议的断言被替换为共享组件渲染断言。
- [ ] R5 删除清单全部完成；`package.json` 不再包含 `@modelcontextprotocol/*` 与 `zod`；`next.config.ts` 不再有对应 externals；三语 `chat.askUserAppFailed*` 键删除，且没有遗留的孤儿 i18n 键被引入。
- [ ] R6 的既有测试（`lib/ask-user/store.test.mjs`、`persist.test.mjs`、`extension.test.mjs`、`portable/bridge.test.mjs`、`portable/discovery.test.mjs`、`hooks/useAgentSession.pending-ask*.test.mjs`、`components/ChatWindow.ask-user-layout.test.mjs`、`lib/rpc-manager.test.mjs`、`app/api/sessions/runtime-route.test.mjs`）全部通过。
- [ ] 契约文档记录 CSS 变量清单、文案注入面、a11y 契约与 PA 接入步骤；fixture 宿主可运行，证据记录在 `09-26-ask-user-react-view-package/research/`。
- [ ] `.trellis/spec/frontend/ask-user-protocol.md` 的 MCP Apps 章节被替换为共享 React 组件章节；对 `light-dark(#…)` 的第二套硬编码色板禁令放开（该禁令是为单宿主写的）；PR #9 在 `component-guidelines.md`、`directory-structure.md`、`state-management.md`、`quality-guidelines.md` 里新增的条目回滚。
- [ ] 反转决策记录成 ADR（`docs/adr/`），写明删除而非封存的理由，以及封存方案为什么会被否决。
- [ ] 规范验证通过：`node_modules/.bin/tsc --noEmit`、`npm run lint`、`XDG_STATE_HOME= npm test`；开发期间不运行 `next build`。

## Out of Scope

- 发布到 npm、承诺第三方宿主兼容、为第三方 MCP Apps 宿主保留任何渲染路径（已决策删除；不封存，理由见下）。
- 修改 `ask_user` 的工具契约、状态机、持久化、SSE 协议或答案送达语义。
- 把表单答案当作敏感操作的授权。
- PA 仓库的接入实现本身。本轮只产出「PA 可接入」的契约与 fixture 证据；PA 的实现是另一个仓库的独立 PR。
- 修复既存的孤儿 i18n 键 `chat.askUserOther`（PR #9 之前即无调用方），除非删除动作正好顺带覆盖。

## Technical Notes

### 子任务映射

| 子任务 | 交付 | 依赖 |
| --- | --- | --- |
| `09-26-ask-user-view-controller` | R1、R2 | 无 |
| `09-26-ask-user-react-view-package` | R3、R4、R7 | A 的 controller |
| `09-26-ask-user-retire-mcp-apps` | R5、R6 回归、spec 与 ADR 更新 | B 的组件 |

父任务本身不实现产品代码，只拥有源需求、跨子任务验收与最终集成评审。父/子结构不是依赖系统：B 依赖 A、C 依赖 B 的顺序写在各自的 `prd.md` / `implement.md` 里。实施从 A 开始，因为 A 与最终渲染方式无关且可独立合并。

### MCP Apps 路径的归宿：删除

已显式决定**删除**，不封存。理由：

1. 封存意味着保留一套必须持续保持可运行、且需要写明 conformance 门槛的实现；这就是 PR #9 想要消灭的「并行两套渲染器」以更隐蔽的形式重来。
2. 该路径的第三宿主演进故事本身站不住：它依赖宿主投递 labels、token 值与字体字节，还依赖两个私有 action 名，第三方 Apps 宿主本来就渲染不了。Notion 页面记录的这一判断与 `ask-user-protocol.md` 的「可移植性」章节一致。
3. git 历史完整保留实现（`9c2cd86` 及其父提交），未来若真出现非 React 宿主，可以取回而不是维护。

### R2 与 R5 的执行顺序约束

A 未落地前不得删除 `lib/ask-user/mcp-view-html.test.mjs` 或 `mcp-view-html.ts`。C 必须在 A、B 的测试全绿之后再执行删除。

### R7 的 PA 接入前置

PA 侧接入不在本仓库执行，但本轮必须锁定的接口面：

1. 组件可被无 Pi Web 依赖的 React 工程直接 import：`portable/react/` 不 import `@/`、Next、`lib/i18n` 或 `node:`。
2. **文案由包内自带 en / zh-CN / zh-TW 默认表，`locale` 选择、`labels` 可逐键覆盖**（已决定）。PA 传一个 locale 即可渲染，Pi Web 覆盖全部 12 键因此不读取默认表 —— 两侧的文本真相来源各自唯一，包内默认表是一次性抄录而非持续同步点。理由：Notion 页面把「依赖宿主投递 labels」列为第三方宿主渲染不了的证据，也是每次接新宿主都要重做的成本项；共享组件带上默认文案正是把这项成本归零。
3. 主题只需 `--pi-ask-*` CSS 变量映射；无变量时 `light-dark()` + 系统字体栈兜底可读。组件不读宿主内部命名（`--bg`、`--text` 等）。
4. `ask_submit`/`ask_cancel` 仍是宿主回调（`onSubmit(askId, answers, supplement?)` / `onCancel(askId)`），与 bridge 无关；PA 的对话持久化、认证与定时任务隔离由 PA 自己负责。

PA 的实现是另一个仓库的独立 PR；本轮交付契约文档与 fixture 证据作为它的前置。PA 侧仍需自行解决的未知项（不得写成已验证）：它在每轮 `AgentSession` 关闭后如何续接 turn、ask 状态如何跨进程重启保持同一 `askId`。

### 风险

- **R2 最大风险**：断言平移若只做「看起来对」的覆盖，会静默丢掉提交锁定或 payload 组装的边界。要求逐条映射表，且 check 阶段核对数量与语义。
- **R5 回归面大**：触及渲染、字体、CSP、i18n、依赖与 5 份 spec。删除后必须确认 `<AskUserAppHost key={pendingAsk.askId}>` 的重新挂载语义仍成立（ask 切换不泄漏 drafts/locked 状态）。
- **可观测标记收敛**：`data-ask-user-view` 只被 `components/AskUserAppHost.tsx` 与其测试使用（无 e2e 依赖），当前三态在单渲染器下退化为语义噪音。已决定保留该属性但固定为单一值 `shared`（理由与断言调整见 C 的 `design.md`）。
