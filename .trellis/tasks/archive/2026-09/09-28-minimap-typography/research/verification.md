# 验证记录 — 小地图字号对齐左侧栏

任务：`.trellis/tasks/09-28-minimap-typography`
分支：`personal`，工作基点 `53eb47a`（`chore: record journal`）
日期：2026-09-28

## 改动文件

| 文件 | 改动 |
|------|------|
| `components/ChatMinimap.module.css` | 只改 5 处 `font-size`（见下） |
| `e2e/chat-appearance.mjs` | 新增 `checkMinimapTypography(page, label, sidebarTitle)` |
| `e2e/run.mjs` | 新增 TYPO fixture，接入一次断言调用，就绪断言加入 TYPO |
| `.trellis/spec/frontend/component-guidelines.md` | 补「界面外壳固定字号」例外 |
| `.trellis/tasks/09-28-minimap-typography/research/verification.md` | 本文件 |

## 步骤 1：字号映射

`components/ChatMinimap.module.css` 的 5 处改动（`git diff` 确认只有 5 处 `font-size`，无
`font-family` / `line-height` / `min-height` / padding / 颜色 / DOM 变化）：

| 选择器 | 改前 | 改后 |
|--------|------|------|
| `.toolBadge` | 9px | 10px |
| `.user` | 14px | 12px |
| `.heading[data-level="1"]` | 14px | 12px |
| `.heading[data-level="2"]` | 12px | 11px |
| `.paragraph` | 14px | 12px |

未动：`.number`（10px）、`.assistantJump`（10px）、`.heading[data-level="3"]`（11px）、
`.assistant:has(...) .assistantJump` 的高度覆盖（32/28px）。

字体族保持不变：`.user` / `.heading` / `.paragraph` 仍为 `font-family: inherit`（继承
`app/globals.css:222` 的 `Oxanium` 栈）；`.number` / `.assistantJump` 仍为
`var(--font-mono)`（`app/globals.css:749` 的 `Cascadia Code` 栈），`.toolBadge` 从其父级
`.number` 继承同一栈。

## 步骤 1 的期望计算值（由 CSS 源码推导，**不是浏览器实测**）

浏览器按 CSS 计算出的字号是固定值（不受 `--chat-font-size-offset` 影响，因为这几条是裸
`px`）：

| 目标 | 期望 `font-size` | 依据 |
|------|------------------|------|
| `.user` | 12px | `.user` 规则 |
| `.paragraph` | 12px | `.paragraph` 规则 |
| `.heading[data-level="1"]` | 12px | `.heading[data-level="1"]` |
| `.heading[data-level="2"]` | 11px | `.heading[data-level="2"]` |
| `.heading[data-level="3"]` | 11px | `.heading[data-level="3"]`（未改） |
| `.number` | 10px | `.number`（未改） |
| `.assistantJump` | 10px | `.assistantJump`（未改） |
| `.toolBadge` | 10px | `.toolBadge` |

行高为固定 `line-height: 18px`（`.assistantJump` / `.number` 为 26/13px）＋固定
padding，因此改动后行几何不变：

| 目标 | 期望高度 | 组成 |
|------|----------|------|
| `.heading[data-level="1"]` | 32px | `line-height:18` + padding 7+7 |
| `.heading[data-level="2"]` | 28px | `18` + 5+5 |
| `.heading[data-level="3"]` | 26px | `18` + 4+4 |
| `.user` | 32px | `min-height:32`，`18` + 7+7 = 32 |

> 上表是源码推导值。按决策 4 本任务不跑浏览器，所以**没有**任何浏览器实测的计算样式或行高。
> AC2（与左侧栏同字号）与 AC4（行几何）的页面人工验收由用户负责。

## 步骤 2：回归断言

`e2e/chat-appearance.mjs` 新增 `checkMinimapTypography(page, label, sidebarTitle)`：

- 命中 36px 轨道（`.chat-content .scrollbar-subtle` 的 `nextElementSibling`），先用
  `page.waitForFunction` 等它变成 `visibility: visible`（轨道要等消息列被量成可滚动才显示，
  刚导航完的帧可能仍是 `hidden`；复核阶段补的稳健性等待），断言 `visibility: visible`
  （短会话隐藏轨道的已知前提），再 `page.mouse.move()` 悬停并等待 `[data-minimap-preview-box]`。
- 同一帧读取 `getComputedStyle`：`.user`=12、`.paragraph`=12、h1=12、h2=11、h3=11、
  `.number`=10、`.assistantJump`=10、`.toolBadge`=10；缺失 `.toolBadge` 时打印说明并跳过。
- AC3：正文（`.user` / `.paragraph` / h1）的 `font-family` 含 `Oxanium` 且与 `document.body`
  相等；`.number` / `.assistantJump` / `.toolBadge` 含 `Cascadia`。
- AC4：h1/h2/h3/user 的高度断言 32/28/26/32px。
- AC2：`sidebarTitle` 存在时，读取左侧栏该会话行标题（12px）与其下一个兄弟（元信息 11px），
  与 `.user` / 二级标题的计算字号直接比较。

选择器全部走组件已有的 `data-*` 钩子（`data-minimap-preview-box`、
`data-minimap-preview-user`、`data-minimap-preview-assistant`、`data-minimap-preview-index`、
`data-level`），`button:not([data-level]):not([data-minimap-preview-user]):not([data-minimap-preview-assistant])`
用于唯一的 `.paragraph`（预览里唯一没有 data 钩子的按钮），不使用 CSS Module 的哈希类名。

`e2e/run.mjs` 的接入点：1280px 桌面 viewport 跑完 LONG 会话 fixture 之后，导航到专用
TYPO fixture 调一次 `checkMinimapTypography(page, "1280px minimap preview", "E2E typography question")`。

**为什么新增 TYPO fixture（对 `implement.md` 步骤 2 的偏离）**：现有 fixture 没有一个能
同时覆盖断言里的全部目标 —— LONG 只有段落（无标题、无工具徽标），COMPACTED 的答案含标题时
`remarkPreviewOutline` 只保留标题（无 `.paragraph`），且两者都没有 h1/h3。TYPO 在一个可滚动
会话里同时提供：仅段落的回答（产生 `.paragraph`）、含 h1/h2/h3 的回答（`data-level` 三档）、
用户提示、以及一个工具调用（产生 `.toolBadge`）。就绪断言 `assert.deepEqual(...)` 已加入 TYPO。

`node --check e2e/chat-appearance.mjs` 与 `node --check e2e/run.mjs` 均通过。

## 步骤 3：浏览器验证 — 按决策 4 未执行

- **未运行 e2e 套件**（`node e2e/run.mjs` / `npm run test:e2e` 都没有跑）。
- **未启动 Playwright / Chromium**。
- **未运行 `next build`**。
- **未停止或重启 8505 开发服务**；本任务也没有对 8505 发任何请求（未用只读 `curl` 探测，
  避免与 held `.next/dev/lock` 的既有约定产生歧义）。
- 因此 AC1/AC3/AC4 的断言**只保证「已写入套件、语法通过」**，不代表已在真实浏览器验证通过。
  AC2 与 AC4 的页面人工验收由用户负责。
- 未覆盖项：浏览器实测计算样式、行高、点击/定位行为，以及左侧栏与预览的同字号实测比较。

## 步骤 4：规范例外

`.trellis/spec/frontend/component-guidelines.md` 的「对话区字号：必须走 offset 变量」一节：

- 把绝对表述「新增**任何**对话区可见文本」改为「对话区**正文**里的可见文本」。
- 新增「例外：界面外壳是固定字号，不读 offset」段：判据是元素的职责与视觉基准（属于应用外壳、
  与左侧栏同层、需与左侧栏字号一致），而不是 DOM 祖先；明确指出小地图预览虽物理上位于
  `.chat-content` 内、继承了 `--chat-font-size-offset`，但属于外壳，故走固定字号。
- 写明取值来源（对齐左侧栏的 12px 标题 / 11px 元信息 / 10px 小标签）与证据指向本文件。

## 步骤 5：门禁

命令与实测：

| 门禁 | 命令 | 结果 |
|------|------|------|
| 类型 | `node_modules/.bin/tsc --noEmit` | 退出码 0 |
| Lint | `npm run lint` | 退出码 0，`ESLint: No issues found` |
| Lint 覆盖 | `node_modules/.bin/eslint . -f json` | 目标文件数 **554**，error **0**，warning **0** |
| 单测 | `env -u NODE_PATH XDG_STATE_HOME= npm test` | 退出码 0，`ℹ tests 1720` / `pass 1720` / `fail 0` / `suites 10` / `duration_ms 53262` |

基线来源：本次运行的仓库依赖树（与锁文件一致）：

- 仓库只有 `package-lock.json`，无 `pnpm-lock.yaml`（`.gitignore` 之外不存在）。
- `node_modules/.pnpm` 与 `node_modules/.ignored` 均不存在；存在 npm 元数据
  `node_modules/.package-lock.json`，无 pnpm 元数据 `node_modules/.modules.yaml`。
- `package-lock.json` 期望的嵌套路径
  `node_modules/eslint-config-next/node_modules/eslint-plugin-react-hooks` 存在。
- 即上游 CI 口径的 npm 树，无需 `npm ci` 重装；lint/tsc/单测三条命令都在同一棵树上复跑。

## 未做到 / 不确定

- 未执行 e2e 断言（决策 4），因此 TYPO fixture 与 `checkMinimapTypography` 的**运行时正确性
  未经验证**，只验证了 `node --check` 语法与选择器存在的源码依据。断言读到的目标是否存在、
  侧栏行 `[title="E2E typography question"]` 是否唯一，都需用户跑一次真机才能确认。
- 未在浏览器实测计算字号与行高；上表的期望值来自 CSS 源码推导。
- 未探测 8505 开发服务的编译产物，未提交任何 commit（按任务要求）。

## 用户人工验收（2026-09-28）

用户在 8505 开发服务上（工作树停在 `fix/minimap-typography`，改动已生效）完成页面验收并确认
**通过**：悬停预览的字号与左侧栏会话行一致，字体未变，行高与定位/点击行为正常。

需要区分证据类型：本节记录的是**用户的人工结论**，不是本文件里的浏览器实测数值。本任务自始至终
没有执行 `e2e` 套件、没有启动 Playwright/Chromium，因此 `checkMinimapTypography()` 与 `TYPO`
fixture 的运行时正确性仍然未经验证；若将来跑完整套件，`[title="E2E typography question"]` 的
唯一性与 fixture 产出目标这两处可能需要微调。
