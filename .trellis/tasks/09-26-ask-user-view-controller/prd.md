# 抽出 portable ask_user view controller 并平移视图行为断言

## Goal

把 `ask_user` 视图的**行为**从宿主脚本里抽出来变成零依赖状态机，并把当前唯一覆盖这些行为的断言平移过去。这一步与最终用什么框架渲染无关，是净赢；同时能量出视图里「行为」与「管线」的真实比例，作为后续删除决策的证据。

## Background

- 行为目前只存在于 `lib/ask-user/mcp-view-html.ts` 的内联脚本里（824 行，状态机与 DOM 渲染、token 消毒、字体安装、协议握手混在一起）。
- 对应的断言在 `lib/ask-user/mcp-view-html.test.mjs`（510 行、17 个顶层 test）：在最小 DOM shim 上执行真实内联脚本，并断言 `tools/call` 的 `ask_submit` 载荷。这是当前唯一覆盖提交锁定、每题摘要与 payload 组装的资产。
- 同构逻辑的另一个参照是已删除的 `components/AskUserCard.tsx`（React state 版本，`git show 367d18c^:components/AskUserCard.tsx`）。它可作为行为对照，但不得成为依赖。
- `lib/ask-user/portable/` 已是 `private: true` 的本地 Pi 包（`index.ts` + `types/validation/format/tool/bridge`），新增 controller 与它同层，不引入新的包。

## Requirements

**R1 — 新建 `lib/ask-user/portable/view-controller.ts`**，零依赖（无 React、无 `@/` 别名、无 `node:` 导入），导出可被任意框架消费的状态机：

- 每题 draft：`{ values: string[]; otherText: string }`，缺省 `{ values: [], otherText: "" }`。
- `toggleOption(question, value)`：`multiple === true` 时切换包含关系；单选时设为唯一值**并清空** `otherText`。
- `setOtherText(question, text)`：`multiple === true` 时与已选 `values` 共存；单选时**清空** `values`。
- `supplement`：独立于问题的自由文本，`trim` 后为空按未提供处理。
- `answeredCount`：`values.length > 0 || otherText.trim() !== ""` 的问题计数。
- `status: "idle" | "submitting" | "cancelling"` 与派生 `locked`（`status !== "idle"`）。
- 每题提交摘要：锁定后每题渲染 `✓ values · otherText`（`✓` 与 `·` 分隔符语义与现行视图一致）。
- `buildSubmission()` → `{ answers: AskUserAnswer[]; supplement?: string }`：空问题跳过；`otherText` trim 后为空则省略该字段；supplement trim 后为空则 `undefined`。
- `submit()` / `cancel()`：先置 `locked`（`submitting`/`cancelling`）并清空上一次的错误，再调用注入的回调。回调 reject 时**解锁**（`status` 复位 `idle`）并保留错误文本：命令在途期间的锁定才是「答案可能已送出、不可再编辑」的保证，而 reject 证明没有送达，必须让用户能重试。依据现行视图 `lib/ask-user/mcp-view-html.ts:605-623`、`lib/ask-user/mcp-view-html.test.mjs:148`，以及 `chat.askUserActionFailed` 的文案「提问操作失败，可以重试。」。**不要照抄被删卡片** `AskUserCard.tsx` 的「catch 里不解锁」实现 —— 那会让提交失败后卡片永久卡死。

**R2 — 断言平移。** `mcp-view-html.test.mjs` 中每一项行为断言，在 `view-controller.test.mjs` 里有等价断言：提交锁定、取消锁定、每题提交摘要、supplement 透传、单选互斥（选选项清自定义 / 输入自定义清选项）、多选与自定义共存、多选自定义输入框占位区分、`ask_submit` 载荷结构。产出逐条映射表 `research/assertion-migration.md`，列出「旧断言 → 新断言 → 语义等价性说明」；无法等价的项必须显式记为缺口，不得静默丢弃。

**R3 — 导出面。** `portable/index.ts` 增加 controller 与相关类型的导出；既有导出签名不变。

**R4 — 不切换渲染路径。** 本任务不改动 `lib/ask-user/mcp-view-html.ts`、`components/AskUserAppHost.tsx` 或任何 Pi Web 运行时行为。它是纯抽取 + 断言平移，可以独立合并。

## Acceptance Criteria

- [ ] `lib/ask-user/portable/view-controller.ts` 存在，不含 React / `@/` / `node:` 导入（由测试断言源码，而非仅依赖 review）。
- [ ] R1 列出的每一项行为都有断言覆盖，包括在途锁定、reject 解锁与重试清空错误、以及 `buildSubmission()` 的省略规则。
- [ ] `research/assertion-migration.md` 给出完整映射表，旧断言集合与新断言集合的覆盖点逐一对应，缺口显式列出。
- [ ] `portable/index.ts` 导出 controller；`portable/bridge.test.mjs`、`discovery.test.mjs`、`lib/ask-user/store.test.mjs` 等既有测试不受影响并全部通过。
- [ ] 现有 `lib/ask-user/mcp-view-html.test.mjs` 仍原样通过（本任务不删它）。
- [ ] `node_modules/.bin/tsc --noEmit`、`npm run lint`、`XDG_STATE_HOME= npm test` 通过。
- [ ] 实施产物记录「行为 vs 管线」的行数比例（controller + 视图行为 vs 其余）作为父任务的决策证据。

## Out of Scope

- 切换 Pi Web 的渲染路径、新增 React 组件、删除 iframe 相关文件。
- 新增或修改 CSS 变量、文案、a11y 契约（属于 `09-26-ask-user-react-view-package`）。
- 修改 `ask_user` 的工具契约、校验、持久化或 SSE 协议。
