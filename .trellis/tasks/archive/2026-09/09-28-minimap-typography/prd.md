# 小地图字体与字号对齐左侧栏

## Goal

小地图悬停预览面板（`components/ChatMinimap.module.css` 的 `.preview`）的正文比其他界面文字
大一号，与左侧栏的会话行不一致。把预览面板的字号逐级对齐左侧栏，字体保持不变。

## Background

当前实际排版（根字体在 `app/globals.css:222` 为 Oxanium 14px，小地图的 36px 轨道本身没有
文字，文字全部在预览面板内）：

| 位置 | 字体 | 字号 |
|------|------|------|
| 左侧栏会话标题（`components/SessionSidebar.tsx:2652`） | 继承根字体 Oxanium | 12px |
| 左侧栏元信息 | 继承根字体 Oxanium | 11px |
| 左侧栏路径 / 计数 | `var(--font-mono)` | 11px / 10px |
| 小地图预览 用户消息、段落、h1 | `inherit`（同为 Oxanium） | **14px** |
| 小地图预览 h2 / h3 | `inherit` | 12px / 11px |
| 小地图预览 序号 / 跳转标签 | `var(--font-mono)` | 10px / 10px |
| 小地图预览 工具徽标 | `var(--font-mono)` | 9px |

两侧的字体族本就已经相同（都继承根字体或使用 `--font-mono`），**字号是唯一差异**，其中
预览正文的 14px 是"看起来太大"的来源。

## 决策（2026-09-28 用户确认，不再重新讨论）

1. **字号映射**：预览正文 12px、次级 11px、序号与徽标 10px，逐级对应左侧栏的 12px 标题 /
   11px 元信息 / 10px 小标签。
2. **字体不变**：预览正文继续继承根字体 Oxanium，序号 / 跳转标签 / 徽标继续用
   `var(--font-mono)`；不引入新的字体族。
3. **固定字号**：小地图属于界面外壳（与左侧栏同层），不跟随对话区字号滑块，因此**不**使用
   `--chat-font-size-offset`。这与 `.trellis/spec/frontend/component-guidelines.md` 现行的
   「新增任何对话区可见文本，字号必须写成 `calc(<设计字号>px + var(--chat-font-size-offset, 0px))`」
   直接冲突，需要在同一任务内更新该规范，把「界面外壳」例外的判据写清楚（AC5）。
4. **验证方式（2026-09-28 追加）**：**不运行 e2e 浏览器套件**，页面上的人工验收由用户负责。
   自动回归断言仍要加进 `e2e/`，但本任务不执行它；「已加入但未运行」这一事实必须写进
   `research/verification.md`，不得写成已验证通过。`tsc` / `lint` / `npm test` 三件套照常跑。

## Requirements

- 只改字号：不动字体族、颜色、间距、行高、派生的 `min-height`、交互与 DOM 结构。
- 保持预览面板的行几何。现有 `min-height` 与 padding 是按 18px 行高配平的（h1 32px、
  h2 28px、h3 与段落 26px、用户行 32px，含 `.assistant:has(...) .assistantJump` 的高度覆盖），
  改字号后这些配平关系不得被破坏。
- 为「预览字号 = 左侧栏字号」补可复跑的回归验证，并在真实浏览器里跑过；数据链路或源码断言
  不能替代浏览器实测。

## Acceptance Criteria

- [x] AC1 预览的计算字号符合映射：`.user` / `.paragraph` / `.heading[data-level="1"]` = 12px，
      `.heading[data-level="2"]` / `.heading[data-level="3"]` = 11px，
      `.number` / `.assistantJump` = 10px，`.toolBadge` = 10px。
      源码层已核对（`git diff` 只有这 5 处 `font-size`）；浏览器实测未跑，见「验收状态」。
- [x] AC2 与左侧栏同字号（真实浏览器、同一页面）：预览正文的计算字号等于左侧栏会话标题的
      计算字号（12px），预览次级字号等于左侧栏元信息的计算字号（11px）。
      **用户 2026-09-28 人工验收通过**（按决策 4 本任务不跑浏览器套件，断言已写入套件并标注未运行）。
- [x] AC3 字体族未变：预览正文的计算 `font-family` 仍是根字体栈（含 Oxanium），序号与跳转标签
      仍是 `--font-mono` 展开后的等宽栈。源码层已核对；人工验收未发现字体差异。
- [x] AC4 行几何未失真：h1 / h2 / h3 / 用户行的实测高度仍为 32 / 28 / 26 / 32px，小地图的定位与
      点击行为不受影响。**用户 2026-09-28 人工验收通过**；静态推导见 `research/verification.md`。
- [x] AC5 `.trellis/spec/frontend/component-guidelines.md` 记录「界面外壳固定字号」的例外判据，
      并引用本任务的证据（判据按「职责与视觉基准，不是 DOM 祖先」表述；引用行号已核对）。
- [x] AC6 三件套（`node_modules/.bin/tsc --noEmit`、`npm run lint`、`npm test`）退出码 0；
      新增 e2e 断言已加入套件但因决策 4 未执行，该偏离已在 `research/verification.md` 标注。

## 验收状态（2026-09-28）

| 项 | 状态 | 依据 |
|----|------|------|
| AC1 字号映射 | 源码层通过；浏览器实测未跑 | `git diff` 仅 5 处 `font-size`；`e2e` 断言已写入 |
| AC2 与左侧栏同字号 | **用户人工验收通过（2026-09-28）** | 断言已写入套件（含侧栏行对比），未执行 |
| AC3 字体族未变 | 源码层通过；人工验收未发现差异 | `.user`/`.heading`/`.paragraph` 仍 `inherit`，`.number`/`.assistantJump` 仍 `var(--font-mono)` |
| AC4 行几何 | **用户人工验收通过（2026-09-28）** | 18px 行高 + padding 配平出 32/28/26/32 |
| AC5 规范例外 | 通过 | `component-guidelines.md` 已改，判据可执行 |
| AC6 门禁 | 通过 | `tsc` / `lint`（554 文件，0/0）/ `npm test`（1720 通过 0 失败）均 exit 0 |

**未覆盖 / 需人工确认**（子代理复核后确认无法自动验证）：

1. 整段 e2e 的运行时正确性——轨道悬停是否能打开预览、八个目标的实测计算样式、侧栏
   `[title="E2E typography question"]` 行是否唯一且其 `nextElementSibling` 是 11px 元信息。
   这些只有源码依据与静态推导（新增的 TYPO fixture 因此属于**未验证代码**）。
2. AC2 / AC4 的页面人工验收（**用户 2026-09-28 确认通过**），以及小地图定位与点击不受影响。
   验收是人工结论，本任务没有记录浏览器实测数值。
3. `research/verification.md` 记录的 `duration_ms` 是单次测量；复核复跑为 59003ms，属正常波动。

用户于 2026-09-28 完成页面人工验收并确认通过，随后执行 `task.py archive`；归档与会话日志随本任务
的 PR 合入，验收过程中没有返工，也没有因此调整归档内容。

## Notes

- 参考规范：`.trellis/spec/frontend/component-guidelines.md`（字号 offset 规则、样式渠道、
  Minimap 的 `data-located` 约定）、`.trellis/spec/frontend/quality-guidelines.md`（门禁与
  「数据链路脚本不等于浏览器验证」）。
- 已知约束：本 checkout 的 8505 服务持有 `.next/dev/lock`，`e2e/run.mjs` 会 assert 该锁不存在，
  因此套件要在隔离 worktree 里跑；这与 `09-28-chat-input-alignment-jitter` 同一处境。

## Out of Scope

- 不改对话区正文 / 代码块 / 表格等消息渲染的字号链。
- 不改左侧栏自身的字体与字号。
- 不改 36px 轨道的宽度、点阵样式或 `--chat-scrollbar-gutter` 对齐机制。
- 不调整预览面板的行距与高度体系本身（AC4 只做一致性校验）。
