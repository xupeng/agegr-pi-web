# D/E 阶段验证基线记录

> 依据 `.trellis/spec/frontend/quality-guidelines.md`「验证基线必须来自与锁文件一致的依赖树」。
> 本阶段**未执行 `npm install`**：所有命令跑在 A/B/C 阶段已使用过的同一个 checkout 依赖树上，
> 因此阶段间计数差异可归因于本阶段的源码/用例改动，而不是依赖漂移。

## 基线来源

- 依赖树：本 checkout 既有 `node_modules`（A/B/C 阶段同一棵树，未重装）。
- 阶段 A/B/C 交接基线（由派发说明给出）：**1282 tests / 1282 pass**，`npm run lint` **0 诊断**。
- 本阶段没有引入新依赖、没有改 `package.json` / `package-lock.json`。

## 命令与结果（D/E 完成后）

| 命令 | 退出码 | 计数 |
|------|--------|------|
| `node_modules/.bin/tsc --noEmit` | 0 | — |
| `npm run lint` | 0 | `ESLint: No issues found`（0 诊断） |
| `npm test` | 0 | `tests 1290` / `pass 1290` / `fail 0` / `suites 10` |

## 与基线逐项对照

| 项 | 基线（A/B/C） | 本阶段（D/E） | 差异归因 |
|----|---------------|----------------|----------|
| 单测用例数 | 1282 | 1290 | +8：`components/MarkdownBody.test.mjs` +4（inline code 链接、未命中原样、裸文本命中、表格单元格不包裹）；`components/TurnWrittenFiles.test.mjs` 由 2 → 5（+3，卡片重写）；`lib/file-types.test.mjs` +1（`getFileCategory`） |
| 失败数 | 0 | 0 | — |
| lint 诊断 | 0 | 0 | 规则级别/覆盖文件数/插件版本均未变，且本阶段未改 lint 配置 |
| tsc | 0 | 0 | — |

## 既有回归断言

本阶段必须保绿的既有断言全部保持通过（含在上面的 1290 内）：

- `lib/turn-written-files.test.mjs`：全部既有用例（write/edit/MCP 命名/错误跳过/流式/去重/相对路径/Windows/特殊字符/正文不参与）不变。
- `components/MarkdownBody.test.mjs`：既有 markdown 链接「留在 app 内」「非文件链接新标签」「file URL 无 handler 时惰性」等断言不变。
- `components/MessageView.test.mjs`：`:161-208` 的工具调用渲染结构断言不变（D4 只替换 `<pre>` 内的文本节点，未动容器结构，工具结果仍默认折叠）。
- `lib/i18n/registry.test.mjs`：三语 key 集合与占位符集合一致（新增 12 个 key 三语齐备）。

## 说明

- 本阶段未执行 `npm install`，符合任务约束；因此无法在本机证明当前 `node_modules` 与 `package-lock.json`
  逐字一致（`quality-guidelines.md` 记录的历史幻影诊断前提是**跑过安装**）。若需要绝对基线，可另起干净
  `git worktree` + `npm ci` 复跑三件套；本任务范围不要求。
- F4（人工端到端）与 F5（spec 登记）按派发说明不在本次范围内。

## Check 阶段独立复核

完整记录与 AC1–AC13 判定见 [check-report.md](./check-report.md)。

- 最终 `tsc --noEmit`：退出 0，0 诊断；`npm run lint`：退出 0，0 errors/warnings。
- 最终 `npm test`：退出 0，**1298 tests / 1298 pass / 0 fail / 10 suites / 0 skipped**。
- 相对交接基线 1282：+16；相对 D/E 报告 1290：+8（sources.check 4、path-linkify 2、MessageView 1、MarkdownBody 1）。本轮第一次完整验证 1297，最后补同 patch 顺序删除用例后为 1298。
- HEAD/当前测试文件：194/197；本轮新增 1 个测试文件。原 turn-written-files 15 例和既有 MessageView/MarkdownBody 断言未删除或放宽。
- 未安装依赖。共有锁条目的版本差异为 0，但 package-lock 中 100 条目未出现在 hidden lock，未逐一归因；不能由此证明整棵依赖树和锁文件一致。1282 是交接基线，不是本轮重新运行的隔离基线。
- **质量门全绿不等于功能整体验收通过**：索引仍包含已删除受跟踪文件、隔离 worktree 来源标识未透传，浏览器交互未实测。详见检查报告。
