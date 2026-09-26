# 共享 React AskUserView 设计

## 文件布局

```
lib/ask-user/portable/react/
  AskUserView.tsx        组件（具名导出）
  copy.ts                三语默认文案 + locale 类型
  keyboard.ts            纯函数：roving tabindex 取值与方向键落点
  view-css.ts            组件样式文本（含 --pi-ask-* 变量表与兜底）
  README.md              契约文档（R6）
  AskUserView.test.mjs    结构 / a11y / 兜底断言
  keyboard.test.mjs       纯函数断言
  copy.test.mjs           三语键完整性断言
  fixture/                最小可运行宿主（R7 证据）
```

## 组件接线

`useReducer(askUserViewReducer, undefined, createAskUserViewState)`。`ask.questions` 只用于渲染与传入 action 的 `multiple`；reducer 不接收问题对象。

```tsx
const handleSubmit = () => {
  if (isLocked(state)) return;
  dispatch({ type: "submit-requested" });
  const submission = buildAskUserSubmission(state, ask.questions);
  void Promise.resolve(onSubmit(ask.askId, submission.answers, submission.supplement))
    .catch(() => dispatch({ type: "action-failed", error: resolvedLabels.actionFailed }));
};
```

`handleCancel` 同构。**回调 reject 时解锁并显示错误**：`action-failed` 把 `status` 复位为 `idle` 并把 `labels.actionFailed` 写进 `error`，让用户能重试。这与现行视图一致（`lib/ask-user/mcp-view-html.ts:605-623`，由 `mcp-view-html.test.mjs:148` 断言，文案也是「可以重试」）。「答案可能已经送出、不可再编辑」的保证由**在途锁定**提供（`submitting`/`cancelling` 期间 `isLocked` 为真、控件 disabled），不是由 reject 路径提供。

组件自身没有需要清理的 effect —— 全部状态在 `useReducer` 里，随实例销毁。ask 切换时的重新挂载由宿主的 `key={pendingAsk.askId}` 保证（C 保留该 key），组件不重复实现。

## 键盘契约的实现方式（关键决定）

**键盘索引计算必须是可导出的纯函数**，组件只做事件到函数的接线：

```ts
// keyboard.ts
/** 单选组方向键的落点索引；返回 null 表示该键不由本组件处理。 */
export function radioNavigationTarget(currentIndex: number, key: string, optionCount: number): number | null;
/** roving tabindex：整组一个 tab 停靠点。 */
export function radioTabIndex(selected: boolean, anySelected: boolean, index: number): 0 | -1;
```

理由（有仓库证据）：本仓库没有 `jsdom` / `happy-dom` / `@testing-library/*`（`package.json` 无这些依赖），现有交互测试靠 `node:vm` 抽取处理器源码再配手写 DOM stub（`components/ChatInput.test.mjs:116,356,423` 模式）。该模式对一棵完整 React 树不可行，用作 `AskUserView` 的 a11y 回归会非常脆弱。纯函数路线让 a11y 数学用普通断言覆盖，只剩「事件是否接到函数上」需要结构断言。

`Space` 切换多选、`aria-checked`、状态字符 `aria-hidden` 都可结构性断言（`renderToStaticMarkup` + 正则），不需要 DOM。

## 样式方式

组件不引入 CSS 文件：宿主不保证有 CSS loader，且本包是 `private: true` 的 TS 直载包（`pi.extensions` 只认 TS），也不假设宿主有 Tailwind。

做法：`view-css.ts` 导出一段 `<style>` 文本常量，组件渲染时插入一个 `<style>` 元素，选择器全部限定在 `.pi-ask` 前缀下。这与现行视图脚本的做法同源（内联 `<style>` + 前缀选择器）。

样式必须包含：

- `.pi-ask` 作用域的 `--pi-ask-*` 定义与 `light-dark()` 兜底（见父 design 的变量表）；
- 一条 `:focus-visible` 焦点环规则。输入控件**不得**写内联 `outline:none` —— 内联样式会压过这条规则，PR #9 实测过输入框因此完全没有焦点环；
- 度量照被删卡片：容器 radius 10、`max-width: var(--pi-ask-max-width)`、选项 `padding:7px 10px` + radius 7、详情块 `line-height:1.9`、锁定态 `opacity:0.75`、选项符号 `opacity:0.85`、提交按钮 `padding:7px 16px`（取消 14px）、底栏提示用 `--pi-ask-text-dim`（不是 `-muted`）、问句之间 `display:grid; gap:14px`（缺它时相邻问句间距为 0px，PR #9 实测 13 问的 12 个间隔全是 0）。

字号一律与 `--pi-ask-font-size-offset` 叠加（对应 Pi Web `--chat-font-size-offset` 的现有语义）。

## 文案

按父 design 的文案契约：`copy.ts` 三语表 + props `locale` / `labels?: Partial<AskUserViewLabels>` 逐键覆盖。`{count}` / `{total}` 插值留在视图内。

`copy.test.mjs` 断言三种 locale 的键集合完全相等且无空字符串 —— 这是「抄录不完整」的唯一防线。

## a11y 契约（逐项实现清单，从现行实现语义等价搬迁）

| 项 | 实现 |
| --- | --- |
| 单选组 | `role="radiogroup"` + `aria-labelledby` 指向问题文本（问题文本 id 由 `askId` 与索引构成） |
| 单选项 | `role="radio"` + `aria-checked` + roving `tabindex` |
| 单选方向键 | `ArrowDown`/`ArrowRight` 下一个、`ArrowUp`/`ArrowLeft` 上一个、`Home`/`End` 首尾；空组时前进箭头选第一项、后退箭头选最后一项；移动即选中 |
| 多选组 | `role="group"`；选项 `role="checkbox"`；全部留在 tab 序列（无 roving）；`Space` 切换；不响应方向键 |
| 状态字符 | `○ ◉ ☐ ☑ ✓` 一律 `aria-hidden="true"`，状态只由 `aria-checked` 表达 |
| 已答计数 | `role="status"` + `aria-live="polite"` |
| 锁定 | 锁定时把焦点移到状态行（控件 disabled 后焦点会掉到 body） |
| 错误 | `role="alert"` |
| 输入框 | 自定义输入框与补充输入框各有 `aria-label` |
| 容器 | `role="dialog"` + `aria-label`，**不带** `aria-modal`（跨边界焦点陷阱做不到就不能声称模态） |
| 焦点环 | 样式表中的 `:focus-visible` 规则 |

两个自由文本控件（自定义答案 `input` 与 supplement `textarea`）都设 `maxLength={ASK_USER_OTHER_TEXT_MAX_LENGTH}`。被删卡片对自定义答案设了这个属性，内联视图漏掉了；`validateSubmission` 会拒绝超长答案，缺了它用户只能通过一次笼统的 action failed 撞到上限。

## 测试策略

| 覆盖 | 手段 |
| --- | --- |
| controller 行为 | A 的纯函数测试（本任务不重复覆盖） |
| 结构 / role / aria / tabindex / 摘要标记 | `jiti` 载入 TSX + `react-dom/server` 的 `renderToStaticMarkup` + 正则（照 `components/MessageView.test.mjs:10,26` 模式） |
| 键盘索引数学 | `keyboard.test.mjs` 纯断言 |
| 三语键完整性 | `copy.test.mjs` |
| 无宿主变量时仍可读 | 断言 `<style>` 文本含 `--pi-ask-*` 定义与 `light-dark(` |
| 可被外部工程消费 | fixture 宿主 + 渲染断言 |

fixture：`lib/ask-user/portable/react/fixture/`，只用 `react` / `react-dom`，导入 `AskUserView` 并渲染，断言输出含全部交互控件。真实浏览器中的键盘操作不在自动化断言范围：手工核对一次并把观察结果与「未自动化」的说明写进 `research/`。

## 回滚

纯增量：删除 `lib/ask-user/portable/react/` 目录与 `portable/package.json` 的 react peer 声明即可，零运行时影响。
