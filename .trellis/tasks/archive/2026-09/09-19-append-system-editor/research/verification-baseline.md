# 验证基线（2026-09-27）

按 `.trellis/spec/frontend/quality-guidelines.md` 的口径记录：给出当次实测数字、
基线来源与逐项归因，并把「数据链路」证据与「真实浏览器」证据分开报告。

## 依赖树

基线必须来自与锁文件一致的树。按规范给的四个识别特征检查当前 checkout 的 `node_modules`：

| 特征 | 结果 |
|---|---|
| `node_modules/.pnpm/` 与 `node_modules/.ignored/` 同时存在 | 都不存在 |
| `node_modules/.modules.yaml`（pnpm 元数据） | 不存在 |
| `node_modules/eslint-config-next/node_modules/eslint-plugin-react-hooks`（lockfile 期望的嵌套路径） | 存在 |

⇒ 这是 npm 装出来的树，与唯一受支持的 `package-lock.json` 一致，且**未被 pnpm 污染**。
本次全程未执行 `npm install` / `npm ci` / `pnpm install`，依赖树未变动。

## 三件套（本 checkout，分支 `feat/append-system-editor`）

| 门禁 | 命令 | 实测 | 基线 | 归因 |
|---|---|---|---|---|
| 类型 | `node_modules/.bin/tsc --noEmit` | 退出码 0 | 退出码 0 | 无新增诊断 |
| Lint | `npm run lint` + `eslint . -f json` | 522 文件 / 0 error / **0 warning** | 516 文件 / 0 error / 0 warning（`personal@3092e4d` 时期的记录） | 文件数 +6，恰好是本次新增的 6 个 lint 目标（`lib/append-system.ts`、`lib/append-system.test.mjs`、`app/api/append-system/route.ts`、`app/api/append-system/route.test.mjs`、`components/AppendSystemConfig.tsx`、`components/AppendSystemConfig.test.mjs`）；诊断数 0 → 0，未触发任何新规则 |
| 单测 | `env -u NODE_PATH XDG_STATE_HOME= npm test` | `tests 1516 / pass 1516 / fail 0 / skipped 0` | `tests 1497 / pass 1497`（同一棵依赖树、改动前的 `personal@3092e4d`） | +19，逐项可对：A 段 +12、锚点复核时补的路由集成用例 +1、B 段组件源码断言 +4、验证期补的 pi loader 契约用例 +2；B 段只改了 `SettingsPanel.test.mjs` 里两个循环的元素，未增删 `test()` |

`NODE_PATH` 在本机指向全局 pi-web 安装，会让既有的 `lib/ask-user/portable/discovery.test.mjs`
失败（改动前的 HEAD 上同样复现），因此一律用 `-u NODE_PATH` 解除；`XDG_STATE_HOME=` 同理清空。

## e2e：未跑（并说明为什么）

`npm run test:e2e` **本次没有运行**，原因是该套件在当前 `personal` 上已经不可靠，且与本任务无关：

- 失败点固定在 `e2e/chat-appearance.mjs:76`（`page.reload` 后等 `.markdown-code-block pre` 超时），
  近六次 `personal` 系运行 4 败 2 胜；`personal` 的树与 e2e 通过那次（run 36273467688）逐字节相同，
  所以不是内容回归。
- 根因是既有竞态：`components/AppShell.tsx:640-675` 的 `restoreWorkspaceContext` 在首次 cwd
  解析时也会执行，读出 localStorage 记的「上次打开的会话」后无条件 `setSelectedSession()` +
  `router.replace(?session=…)`，把 URL 里显式的 `?session=` 顶掉。该分析已写在 PR #12 的评论
  （issuecomment-5847355198）与 PR #13 的评论里，属于本任务范围外的独立问题。

替代证据是**真实浏览器运行**（Playwright + 已安装的 Chromium），见
`research/browser-verification.md`：33 条断言，覆盖点击、保存、窄视口布局与会话重载后再读。
它跑在隔离 worktree + 临时 `PI_CODING_AGENT_DIR` 上，不依赖也不污染本 checkout 的 `.next`。

## 未跑的其它命令

- `next build`：**全程未跑**（`AGENTS.md` 的禁止项；浏览器验证用的是 `next dev`，且只在临时
  worktree 里）。
- `npm run test:e2e`：见上。

