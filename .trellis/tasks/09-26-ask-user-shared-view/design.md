# 共享 React 视图替代 MCP Apps iframe

## 分层与边界

```
lib/ask-user/portable/view-controller.ts   纯状态机（A）      零依赖
lib/ask-user/portable/react/copy.ts        三语默认文案（B）  零依赖
lib/ask-user/portable/react/AskUserView.tsx React 视图（B）   peer: react
        ↑ 消费
components/AskUserAppHost.tsx              宿主适配（C）      Pi Web i18n + CSS 变量映射 + 命令转发
PA 的宿主适配                               宿主适配（另一仓库）同上
```

三条不变式：

- **controller 不感知传输**：`ask_submit` / `ask_cancel` 只是宿主回调。
- **视图不感知宿主**：不 import `@/`、Next、`lib/i18n`、`node:`；只吃 props 与 `--pi-ask-*`。
- **宿主适配层不拥有行为**：C 的 `AskUserAppHost` 只做三件事（取文案、映射 CSS 变量、转发命令）。任何行为逻辑写进它都是回归。

## 文案契约（决定：包内自带三语默认表 + 逐键覆盖）

```ts
// lib/ask-user/portable/react/copy.ts
export const ASK_USER_VIEW_LOCALES = ["en", "zh-CN", "zh-TW"] as const;
export type AskUserViewLocale = (typeof ASK_USER_VIEW_LOCALES)[number];

export interface AskUserViewLabels {
  title: string;
  /** 模板，含 `{count}` 与 `{total}` 占位。 */
  answered: string;
  otherPlaceholder: string;
  multipleOtherPlaceholder: string;
  supplementTitle: string;
  supplementPlaceholder: string;
  submitted: string;
  cancelling: string;
  hint: string;
  cancel: string;
  submit: string;
  actionFailed: string;
}

export const DEFAULT_ASK_USER_VIEW_LOCALE: AskUserViewLocale; // "en"
export function askUserViewLabels(locale: AskUserViewLocale): AskUserViewLabels;
```

`AskUserView` 的 props：`locale?: AskUserViewLocale`（缺省 `DEFAULT_ASK_USER_VIEW_LOCALE`）+ `labels?: Partial<AskUserViewLabels>`（逐键覆盖）。

为什么这不构成双写点（必须写进 `README.md`，否则后来者会「顺手统一」而破坏它）：

- Pi Web **全覆盖 12 键**（`t()` 加 `getLocalePlugin(locale)?.messages`，即 `components/AskUserAppHost.tsx:319-333` 的现行取法），因此永不读取包内默认表。
- PA 使用默认表，不覆盖。
- 两侧文本真相来源各自唯一。包内默认表是一次性抄录，**不是**持续同步点；两侧文案漂移只影响 PA 的观感，不影响 Pi Web。

默认表文本来源：`lib/i18n/messages/{en,zh-CN,zh-TW}.ts:394-403` 现有文本逐条抄录，`answered` 保留 `{count}`/`{total}`。抄录的目的是一致性，不是「写得更漂亮」。

## CSS 变量契约

组件命名空间 `--pi-ask-*`。组件**只**读这个命名空间，不读 Pi Web 的 `--bg` / `--text` 等 —— 那是宿主内部命名，不该成为跨仓库契约。宿主做一层映射。

| 变量 | 用途 | 组件内兜底 |
| --- | --- | --- |
| `--pi-ask-surface` | 卡片主体背景 | `light-dark(#ffffff, #1b1b1d)` |
| `--pi-ask-field` | 头栏 / 底栏 / 详情块 / 未选中选项 / 输入框 | `light-dark(#f6f6f7, #232326)` |
| `--pi-ask-field-hover` | 悬停 | `light-dark(#ececee, #2b2b2f)` |
| `--pi-ask-border` | 边框 | `light-dark(#d9d9de, #3a3a40)` |
| `--pi-ask-text` | 正文 | `light-dark(#111114, #ececef)` |
| `--pi-ask-text-muted` | 次级文本 | `light-dark(#5c5c66, #a5a5b0)` |
| `--pi-ask-text-dim` | 底栏提示 | `light-dark(#8a8a94, #7d7d88)` |
| `--pi-ask-accent` | 选中态背景 | `light-dark(#2f6fed, #a4c2f4)` |
| `--pi-ask-accent-contrast` | 选中态文字 | `light-dark(#ffffff, #14161a)` |
| `--pi-ask-success` | 提交摘要的 `✓` | `#16a34a` |
| `--pi-ask-danger` | 错误文本 | `#ef4444` |
| `--pi-ask-max-width` | 容器最大宽度 | `820px` |
| `--pi-ask-font-size-offset` | 字号偏移 | `0px` |
| `--pi-ask-font-family` | 字体栈 | `-apple-system, system-ui, "Segoe UI", Roboto, sans-serif` |

`--pi-ask-success` 取 **`#16a34a`，不取被删卡片的 `#10b981`**。依据：Pi Web 其余组件用 `#16a34a`（`components/AgentSessionPanel.tsx:34`、`components/MessageView.tsx:1149`），当前视图脚本也是 `#16a34a`（`lib/ask-user/mcp-view-html.ts:99`），卡片里的 `#10b981` 是与仓库其余部分不一致的孤例。这是「不要把被删卡片逐字照抄回来」的具体例子。

`--pi-ask-accent-contrast` 必须保留独立变量，不能在选中态写死 `#fff`：dark 主题的 `--accent` 是浅蓝 `#a4c2f4`，白字对比度不合格（PR #9 实测过）。

`light-dark()` 需要 `color-scheme` 生效：组件根元素设 `color-scheme: light dark`；宿主可直接覆盖 `color-scheme` 来钉住。Pi Web 的 5 套主题（light/dark/mist/rose/pine + auto）由宿主映射，组件不猜调色板。

`ask-user-protocol.md` 里「不要再引入 `light-dark(#…)` 之类的第二套硬编码色板」这条禁令是为 opaque-origin 单宿主写的；组件内兜底正是 `light-dark()`，C 必须把该禁令改写为「组件只用 `--pi-ask-*` 命名空间内的变量，宿主做映射」。这是这次反转唯一需要放开旧约束的地方。

## 数据流

```
Pi Web / PA 宿主
  ├─ pendingAsk.questions ──────────────► AskUserView props.ask
  ├─ locale + 可选 labels 覆盖 ─────────► AskUserView props
  ├─ 宿主容器 style 上的 --pi-ask-* 映射 ► 组件作用域变量
  ├─ onSubmit(askId, answers, supplement?) ◄─ buildAskUserSubmission(state, questions)
  └─ onCancel(askId)                       ◄─ dispatch cancel-requested
```

与既有协议的交界（C 必须保持不变）：`onSubmit` 仍落到 `submitAsk(askId, answers, supplement?)`，`onCancel` 仍落到 `cancelAsk(askId)`；两者仍走 `POST /api/agent/[id]` 的 `ask_submit` / `ask_cancel`；关闭响应仍由 `lib/ask-user/resolve-pending-ask.ts` 的 `resolvePendingAskAfterClose` 解析；SSE `ask.opened` / `ask.closed`、`get_state.pendingAsk` 与 3s `/api/sessions/[id]/state` 轮询兜底全部不变。

## 兼容与迁移

- **不存在「两套渲染器并存」的发布状态。** A 是纯增量；B 落地后组件无消费者；C 在同一个提交序列里切换渲染并删除旧路径。
- 磁盘上的 open ask（`~/.pi/agent/pi-web-open-asks.json`）格式不变，新视图直接消费 `ask.questions`，`askId` 保留语义不变。
- 浏览器 `localStorage`（`pi-web:tool-selection` 等）与 ask_user 渲染无关，不受影响。
- `ask_user` 工具开关（`lib/ask-user-settings.ts` / `PI_WEB_ASK_USER`）只控制工具是否注册，与渲染路径无关，保持不变。

## 回滚

| 阶段 | 回滚代价 |
| --- | --- |
| A 之后 | 删两个新文件，零风险 |
| B 之后 | 组件无消费者，删目录即回滚 |
| C 之后 | 渲染路径已切换。回滚 = revert C 的提交（git 保留全部被删实现），但要重跑 iframe 路径验证 |

C 是唯一不可逆点，因此 C 必须在 A、B 全绿、且改完渲染后先在本地跑通 ask 全流程（打开 / 提交 / 取消 / 跨设备轮询 / 重水合）才执行删除。
