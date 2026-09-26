# portable view controller 抽取设计

## 边界

controller 只拥有「用户在这个表单上做了什么」的状态与转换。它**不**拥有：

- **答案校验**：`portable/validation.ts` 的 `validateSubmission` 是唯一实现，controller 调用它，不复制规则（不重复 id 唯一性、选项存在性、`multiple` 冲突、超长检查）。
- **渲染、DOM、键盘、焦点**：属于视图层（子任务 B）。
- **命令传输**：`ask_submit` / `ask_cancel` 的发送由宿主回调负责，controller 只产出载荷。
- **ask 生命周期**：open/supersede/submit/cancel 由 `PendingAskStore` 拥有，controller 只是浏览器侧的表单状态机。

判定标准：任何需要 DOM、React、`fetch`、`useI18n`、`node:` 或 SDK 的代码都不属于这里。

## 为什么放在 `portable/` 而不是 `lib/ask-user/`

`lib/ask-user/*.ts` 是 Pi Web 的服务器/客户端模块（含 `@/` 别名、Next 路由依赖、i18n）。`portable/` 是宿主中立的本地包（`private: true`，`peerDependencies` 钉 SDK 0.85.1，`pi.extensions` 入口）。controller 与 `portable/types.ts` 的 DTO 同源，且子任务 B 的 `portable/react/AskUserView.tsx` 要相对导入它 —— 同包内可保持 import 图自洽，不必跨出包边界。

## 接口：纯 reducer + 纯选择器

采用 pure reducer，而不是带订阅的 store 对象。理由：

1. 断言平移的成本最低 —— 旧断言在 DOM shim 上驱动脚本再断言 `tools/call`；新断言可以直接 `reducer(state, action)` 后断言状态与载荷，不需要 shim。
2. 不把订阅模型强加给宿主：React 用 `useReducer`，纯 DOM 宿主直接调用 reducer，两者都行。
3. 异步副作用留在视图层：`submit()` 的「先锁定再调用回调、reject 时解锁并显示错误」在 reducer 里是 `SUBMIT_REQUESTED` 与 `ACTION_FAILED` 两个同步转换，回调本身属于视图层。

```ts
// lib/ask-user/portable/view-controller.ts

import type { AskUserAnswer, AskUserQuestion, AskUserQuestionOption } from "./types";

/** Per-question draft: selected option values plus optional custom text. */
export interface AskUserQuestionDraft {
  values: string[];
  otherText: string;
}

export type AskUserViewStatus = "idle" | "submitting" | "cancelling";

export interface AskUserViewState {
  /** Keyed by question id. A `Map` (not a plain object): question ids are model-authored and
   *  may collide with `Object.prototype` keys, which the deleted card's tests already guarded. */
  drafts: Map<string, AskUserQuestionDraft>;
  supplement: string;
  status: AskUserViewStatus;
  /** Message shown when a submit/cancel callback rejected. */
  error: string;
}

export type AskUserViewAction =
  | { type: "toggle-option"; questionId: string; value: string; multiple: boolean }
  | { type: "set-other-text"; questionId: string; text: string; multiple: boolean }
  | { type: "set-supplement"; text: string }
  | { type: "submit-requested" }
  | { type: "cancel-requested" }
  | { type: "action-failed"; error: string };

export function createAskUserViewState(): AskUserViewState;
export function askUserViewReducer(state: AskUserViewState, action: AskUserViewAction): AskUserViewState;

/** Empty draft for an untouched question. */
export function draftFor(state: AskUserViewState, questionId: string): AskUserQuestionDraft;
/** `values.length > 0 || otherText.trim() !== ""` */
export function isQuestionAnswered(state: AskUserViewState, questionId: string): boolean;
export function answeredCount(state: AskUserViewState, questions: AskUserQuestion[]): number;
export function isLocked(state: AskUserViewState): boolean;
/** `✓ <value> · <value> · <otherText>`; empty string when the question is untouched. */
export function questionSummary(state: AskUserViewState, questionId: string): string;
export function buildAskUserSubmission(
  state: AskUserViewState,
  questions: AskUserQuestion[],
): { answers: AskUserAnswer[]; supplement?: string };
```

`multiple` 作为 action 字段传入，而不是让 reducer 去查 `AskUserQuestion`：这样 reducer 是闭包无关的纯函数，action 可序列化，测试不需要构造完整问题对象。

## 状态语义（必须逐条对应旧断言）

| 场景 | 旧实现位置 | 规则 |
| --- | --- | --- |
| 单选选选项 | `AskUserCard.tsx:52-56`；`mcp-view-html.ts` `toggleOption` | `values = [value]`，**清空** `otherText` |
| 单选输自定义 | `AskUserCard.tsx:59-65` | `values = []`，写入 `otherText` |
| 多选切换 | 同上 | `values` 包含关系取反，`otherText` 保持 |
| 多选输自定义 | 同上 | `otherText` 更新，`values` 保持 |
| 已答计数 | `AskUserCard.tsx:74-79` | `values.length > 0 \|\| otherText.trim() !== ""` |
| 提交摘要 | `mcp-view-html.ts:353-360`；`AskUserCard.tsx:253-261` | 仅在 `locked` 且非空时显示；`parts = values + trimmed otherText`；文本 = `"✓ " + parts.join(" · ")` |
| 载荷组装 | `AskUserCard.tsx:80-92` | 跳过空问题；`otherText` trim 后空则**省略字段**；supplement trim 空则 `undefined` |
| 锁定 | `AskUserCard.tsx:32`；视图 `status` | `submit-requested` → `submitting`；`cancel-requested` → `cancelling`；两者都 `locked` |
| 失败 | `mcp-view-html.ts:605-623`（`submit`/`cancel` 的 catch）、`mcp-view-html.test.mjs:148` | `action-failed` 设置 `error` 并把 `status` 复位为 `idle`（**解锁**）。在途锁定（`submitting`/`cancelling`）才是「答案可能已送出、不可再编辑」的保证；reject 证明没有送达，因此必须允许重试。`chat.askUserActionFailed` 的文案「提问操作失败，可以重试。」与 `:148` 都依赖这一点。**被删卡片 `AskUserCard.tsx` 的 catch 不解锁属于更差的实现，不要作为契约。** |
| id 与 `Object.prototype` 冲突 | `mcp-view-html.test.mjs:164,176` | `drafts` 必须是 `Map` 或 null-prototype object，`__proto__` 等 id 不得污染原型或丢失 |

摘要里的 `values` 是选项的**原始 `value`**，不是 `label`。这是从卡片继承的既存行为（`AskUserCard.tsx:258` 直接用 `draft.values`），保持一致，不在本任务里"顺手改好"。

## 与校验的关系

controller 产出的是**未校验**的载荷：它只保证结构（跳过空问题、trim 规则）。校验仍由提交路径上的 `validateSubmission` 负责。视图层可以在提交前用它与 controller 的结果做一次本地检查并显示 `action-failed`，但不得把校验规则复制进 controller。

## 测试策略与断言平移

新建 `lib/ask-user/portable/view-controller.test.mjs`，用 `node:test` 直接驱动 reducer 与选择器，不需要 DOM shim。

平移方法（`research/assertion-migration.md` 的产出格式）：对 `lib/ask-user/mcp-view-html.test.mjs` 中的**每一条** test 判定归属：

- **behavior → controller**：提交锁定、取消锁定、每题摘要、supplement 透传、单选互斥、多选共存、载荷组装、id 冲突健壮性。这些必须有等价的新断言。
- **view → B**：radio/checkbox 语义与 roving tabindex（`:397`）、`aria-live` 公告（`:453`）、表单控件字体继承与 `text-size-adjust`（`:471`）、度量（`:485`）。
- **graphics/pipeline → C 删除**：token 镜像（`:289`）、字体字节安装（`:320`、`:347`）、`color-scheme`（`:382`）。
- **`:137`、`:148`** 是混合体：载荷部分归 controller，错误/控件可用性部分归 B。必须**拆分**而不是整条丢弃。

无法等价的项记为缺口并写明原因，不得静默丢弃。

## 回滚点

本任务是纯增量：新增 controller + 新增测试，不触碰 `mcp-view-html.ts`、`AskUserAppHost.tsx` 或任何运行时路径。回滚 = 删除两个新文件与 `portable/index.ts` 的导出行。
