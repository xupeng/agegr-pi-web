# 共享 React AskUserView 与 CSS 变量契约

## Goal

用 controller 实现包里宿主中立的 React 视图，让 Pi Web 与 Personal Assistant 复用同一份视图与同一份 a11y 实现。配色与文案不再需要宿主「投递数值」，只需要 CSS 变量映射与文案注入 —— 这正是 iframe 方案每次接新宿主都要重做的那部分。

## Background

- 依赖 `09-26-ask-user-view-controller`（子任务 A）的 controller；A 未合并前本任务不开始。
- 原生实现参照：`git show 367d18c^:components/AskUserCard.tsx`（361 行）。它同时暴露了两个必须解耦的耦合点：`useI18n`（`@/hooks/useI18n`）与 `@/lib/types`。
- a11y 契约目前在 iframe 内联脚本里已实现一遍（见 `.trellis/spec/frontend/ask-user-protocol.md` 的「a11y 与键盘契约」条目），本任务把它搬进组件并保持语义等价。
- 配色契约现状是「宿主计算后的 token 值随投影投递」+ 帧内 `sanitizeToken` 二次校验（`lib/ask-user/theme-tokens.ts` + `mcp-view-html.ts` 内手工同步的副本）。共享组件在同一 document 内，改为消费 CSS 变量即可，不再需要值投递与消毒。
- 度量必须对齐被删卡片（容器 radius 10、`max-width: var(--pi-max-width)`、选项 `padding:7px 10px` + radius 7、详情块 `line-height:1.9`、锁定态 `opacity:0.75`、选项符号 `opacity:0.85`、提交按钮 `padding:7px 16px` / 取消 14px、底部提示用 `--text-dim`、问句之间 `display:grid; gap:14px`），这些是 PR #9 用两轮 follow-up 手工补齐的。

## Requirements

**R1 — `lib/ask-user/portable/react/AskUserView.tsx`**：消费 A 的 controller。React 是 peer dependency（写入 `portable/package.json` 的 `peerDependencies`），组件不 import `@/`、Next、`lib/i18n` 或 `node:`。

**R2 — props 面**（最小且显式）：`ask`（`askId` + `questions`）、`onSubmit(askId, answers, supplement?)`、`onCancel(askId)`、`locale?`、`labels?`（`Partial<AskUserViewLabels>`，逐键覆盖默认表），以及一个可选 `disabled`。宿主回调只负责发命令，组件不感知传输方式（SSE / fetch / bridge 都行）。

**R3 — 文案归属**（已决定）：包内自带 en / zh-CN / zh-TW 默认文案表，`locale` prop 选择（缺省 `en`），`labels` prop 类型为 `Partial<AskUserViewLabels>` 逐键覆盖。Pi Web 覆盖全部 12 键；PA 不覆盖、直接用默认表。`answered` 的 `{count}`/`{total}` 模板插值留在视图内，因为它属于文案格式而非宿主职责。包内默认表是从 `lib/i18n/messages/{en,zh-CN,zh-TW}.ts:394-403` 一次性抄录的结果，**不是**持续同步点：Pi Web 覆盖后永不读取默认表，PA 使用默认表，两侧真相来源各自唯一。这条理由必须写进 `README.md`，否则后来者会把两份文案当作需要同步的重复。

**R4 — 配色与度量契约**：组件只消费 `--pi-ask-*` 命名空间的 CSS 变量（清单见 `design.md` 的变量表与度量清单），缺值时用 `light-dark()` 与系统字体栈兜底，保证在无宿主变量的纯文档里也可读；不得读宿主内部命名（`--bg`、`--text` 等）。不得 import、复制或重新引入 `lib/ask-user/theme-tokens.ts` 的白名单与消毒逻辑 —— 同文档内的 CSS 变量不是不可信输入。

**R5 — a11y 与键盘契约随组件走**（从现行实现语义等价搬迁，只实现一次）：单选问题 `role="radiogroup"` + `aria-labelledby` 指向问题文本（问题文本有稳定 id）、选项 `role="radio"` + `aria-checked` + roving tabindex（整组一个 tab 停靠点，已选项或第一项为 `0`，其余 `-1`），`ArrowDown/Right`、`ArrowUp/Left`、`Home/End` 移动并选中，空组时前进箭头选第一项、后退箭头选最后一项；多选问题 `role="group"` + `role="checkbox"`，全部留在 tab 序列里，`Space` 切换且不响应方向键；状态字符（`○/◉/☐/☑`、`✓`）一律 `aria-hidden="true"`，状态只由 `aria-checked` 表达；已答计数与锁定状态是 `role="status" aria-live="polite"`（锁定时把焦点移到状态行，避免控件 disabled 后焦点掉到 body）；底部错误是 `role="alert"`；补充输入框与自定义输入框各有 `aria-label`；卡片是 `role="dialog"` + `aria-label`，**不带** `aria-modal`（跨边界焦点陷阱做不到就不能声称模态）；焦点环由组件自带的 `:focus-visible` 规则提供，输入控件**不得**写内联 `outline:none`。

**R6 — 契约文档** `lib/ask-user/portable/react/README.md`：CSS 变量清单与含义、labels 清单、a11y 契约、宿主接入步骤（以 PA 为例）、明确列出未验证项。

**R7 — fixture 宿主证据**：一个不依赖 Pi Web 任何模块的最小 React 工程/fixture，导入包并渲染完整交互（选项、自定义输入、多选、supplement、提交、取消、锁定摘要、键盘操作）。它同时是 R4 兜底配色的验证载体。证据（命令、输出、截图或断言）记录在 `research/`。

**R8 — 测试**：组件级断言覆盖 R5 的键盘与 a11y 契约、R4 的兜底着色，以及锁定态的渲染（控件 disabled 与每题摘要可见）。键盘索引数学必须抽成纯函数、用普通断言覆盖（理由见 `design.md`）—— 仓库没有 jsdom / testing-library，不要为组件搭 DOM stub。测试载体沿用现有约定：`node:test` + `*.test.mjs`，`jiti` 载 TSX + `react-dom/server` 的 `renderToStaticMarkup` 做结构断言；不引入新框架。

## Acceptance Criteria

- [ ] `lib/ask-user/portable/react/AskUserView.tsx` 在不 import 任何 Pi Web 模块的前提下渲染完整交互；`portable/package.json` 把 react 声明为 peer dependency。
- [ ] 文案面按 R3 实现：三语默认表键集合相等且无空串，`labels` 逐键覆盖生效，`locale` 缺省行为明确，并有断言证明宿主可完全控制显示文本。
- [ ] R5 的每一项 a11y/键盘契约都有断言（包括空组的方向键行为、多选不响应方向键、锁定时焦点移动到状态行）。
- [ ] 组件在只有 `light-dark()` 与系统字体栈、没有宿主 CSS 变量的环境下仍可读（fixture 证据）。
- [ ] `lib/ask-user/portable/react/README.md` 覆盖 R6 全部小节，并与实现一致（变量名、labels 清单、a11y 行为逐项核对）。
- [ ] fixture 可运行，证据落在 `research/`。
- [ ] `node_modules/.bin/tsc --noEmit`、`npm run lint`、`XDG_STATE_HOME= npm test` 通过。

## Out of Scope

- 切换 Pi Web 的渲染路径与删除 iframe 文件（属于 `09-26-ask-user-retire-mcp-apps`）。
- 发布 npm 包或承诺第三方宿主兼容。
- 新增/修改 `ask_user` 工具契约、状态机、持久化或 SSE 协议。
- PA 仓库内的实际接入代码。
