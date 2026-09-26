# Pi Web 切换与 MCP Apps 路径退役设计

## 切换后的形状

```tsx
// components/AskUserAppHost.tsx —— 瘦身为适配器
export function AskUserAppHost({ ask, onSubmit, onCancel }: AskUserAppHostProps) {
  const { t, locale } = useI18n();
  const labels = { title: t("chat.askUserTitle"), answered: answeredTemplate(locale), /* …12 键… */ };
  return (
    <div data-ask-user-view="shared" style={PI_ASK_VARIABLE_MAP}>
      <AskUserView ask={ask} labels={labels} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}
```

`sessionId` 不再需要（不再有投影请求）。props 契约与挂载位置保持不变，以免牵连 `ChatWindow` 的布局与 `components/ChatWindow.ask-user-layout.test.mjs`。ask 切换的重新挂载由 `ChatWindow` 现有的 `key={pendingAsk.askId}` 保证。

`PI_ASK_VARIABLE_MAP` 是一层映射，不是值投递 —— 变量在同一 document 内解析，所以主题切换自动生效，不需要重算投影：

| `--pi-ask-*` | Pi Web 侧 |
| --- | --- |
| `--pi-ask-surface` | `var(--bg-panel)` |
| `--pi-ask-field` | `var(--bg)` |
| `--pi-ask-field-hover` | `var(--bg-hover)` |
| `--pi-ask-border` | `var(--border)` |
| `--pi-ask-text` | `var(--text)` |
| `--pi-ask-text-muted` | `var(--text-muted)` |
| `--pi-ask-text-dim` | `var(--text-dim)` |
| `--pi-ask-accent` | `var(--accent)` |
| `--pi-ask-accent-contrast` | `var(--accent-contrast)` |
| `--pi-ask-max-width` | `var(--chat-content-max-width)` |
| `--pi-ask-font-size-offset` | `var(--chat-font-size-offset)` |
| `--pi-ask-font-family` | 现有 `readFontFamilyStack()` 的计算结果 |

`readFontFamilyStack()`（读 `getComputedStyle(document.body).fontFamily`）保留：它算出的正是被删卡片从消息列继承到的 UI 栈（`"Oxanium", -apple-system, …`），而**不是** `--font-content`（那是聊天正文栈，用它会落到 LXGW WenKai Screen，正是用户报过「字体不对、字号太大」的根因）。差别是它现在只算一次写进 style，不再有字体清单、unicode-range 命中筛选与字节投递。

## `color-scheme`

组件自带 `color-scheme: light dark` + `light-dark()` 兜底，Pi Web 的 5 套主题靠变量映射生效。不再需要从 `structuredContent` 推演 `colorScheme` / `theme`——那套推演存在的唯一理由是 opaque origin 既不能继承宿主 CSS 变量也不能解析 `var()`。若需要钉住 UA 控件配色，宿主容器上设 `color-scheme` 即可。

## `data-ask-user-view` 的收敛

现状三态 `loading` / `apps` / `failed` 只服务于 iframe 生命周期（异步投影、握手、降级）。单渲染器下三者都不是状态：没有投影要等、没有握手、没有降级态。

决定：**保留该属性但固定为单一值 `shared`**，删除三态语义。保留的理由是它是排查「这个 ask 用的是哪条渲染路径」时的唯一 DOM 抓手，成本为零；不整个删掉是因为删除会让 `ChatWindow` 里的 ask 宿主在 DOM 上完全不可区分。`components/AskUserAppHost.test.mjs` 的断言改为 `data-ask-user-view="shared"`，并删除对 `native` / `apps-pending` / `failed` 的断言。

## 删除清单

| 删除 | 说明 |
| --- | --- |
| `lib/ask-user/mcp-view-html.ts` + `.test.mjs` | A 已把行为断言平移走；删除前确认 `view-controller.test.mjs` 覆盖全部行为项 |
| `lib/ask-user/mcp-app-adapter.ts` + `.test.mjs` | 唯一的 `zod` 与 `@modelcontextprotocol/*` 值导入点 |
| `app/api/agent/[id]/ask-view/route.ts` | 投影端点 |
| `app/api/ask-user/font-faces/route.ts` + `.test.mjs` | 字体清单下发 |
| `lib/ask-user/theme-tokens.ts` + `.test.mjs` | token 白名单与消毒（同 document 内不需要） |
| `lib/ask-user/view-fonts.ts` + `.test.mjs` | 字体挑选纯函数 |
| `lib/ask-user/view-font-manifest.ts` + `.test.mjs` | 字体清单解析 |
| `components/AskUserAppFailure.tsx` | 降级态（没有投影就没有投影失败） |
| 三语 `chat.askUserAppFailed*` 四键 | `lib/i18n/messages/{en,zh-CN,zh-TW}.ts:405-408` |
| `package.json`：4×`@modelcontextprotocol/*` + `zod` | 依赖清理 |
| `next.config.ts:27-30` 的 externals | 同步 `lib/next-config.test.mjs` 的断言 |

保留（R6 清单）：`lib/ask-user/{store,persist,resolve-pending-ask,types,tool,extension}.ts`、`lib/ask-user/portable/*`、`lib/ask-user-settings.ts` 与 `app/api/settings/ask-user/route.ts`、`hooks/useAgentSession.ts` 的 `pendingAsk` / `submitAsk` / `cancelAsk` / 事件处理 / 重水合、`lib/rpc-manager.ts` 的注入与 `get_state` 投影、`components/ChatWindow.tsx` 的宿主位置与 `askUserCardElement` / `askUserCardInColumn` 命名。

## spec 与 ADR

- 新增 `docs/adr/0004-ask-user-shared-react-view.md`：决策（共享 React 视图 + 框架无关 controller 替代 opaque-origin MCP Apps iframe）；背景（PA 是 React；两个 React 宿主之间 iframe 无隔离收益；管线与卡片成本 6:1；视图作者就是我们自己，威胁模型不成立）；被否决的方案（封存 MCP Apps 并写 conformance 门槛 —— 仍是并行两套渲染器；退回「每宿主一张卡片」—— 两份行为实现）；后果（删除清单、`light-dark()` 禁令放开、包内三语默认文案、`data-ask-user-view="shared"`）。
- `ask-user-protocol.md` 的「MCP Apps 渲染（Pi Web，2026-09-26 起）」章节重写为「共享 React 视图（Pi Web，2026-09-26 起）」：分层图、文案契约、CSS 变量契约、a11y 归属、PA 接入前置、`data-ask-user-view="shared"`，并用一句话指向 ADR 说明被删路径。
- 回滚 PR #9 在 `component-guidelines.md`、`directory-structure.md`、`state-management.md`、`quality-guidelines.md` 新增的条目 —— 逐条对照 `git show 9c2cd86 -- <file>`，不要凭记忆。
- 在原「不要再引入 `light-dark(#…)`」的位置改写为：组件只用 `--pi-ask-*` 命名空间内的变量，宿主做一层映射；并说明旧禁令为 opaque-origin 单宿主而设，已随该路径退役而放开。

## 验证

除三条标准命令外必须核对：

- 全仓库残留搜索（见 `implement.md`）；
- `package.json` 与 `package-lock.json` 一致；
- 三语消息表键集合相等；
- 手工全流程（父 `implement.md` 步骤 3 的清单）。

## 风险

- **顺序**：必须先切换渲染并在本地跑通全流程，再删文件。反过来会出现「旧路径已坏、新路径未验」的中间态。
- **`components/AskUserAppHost.test.mjs` 是 14.9KB 的 Apps 协议测试**：不能整文件删除。要逐条判定，保留「回调只转发当前 askId」「失败不清空新 ask」等仍有意义的断言，替换已消失的握手/投影断言。
- **`lib/rpc-manager.test.mjs` 与 `app/api/sessions/runtime-route.test.mjs`** 断言 `pendingAsk` 投影与回退，属于保留行为；本任务不得改动它们的断言语义。
