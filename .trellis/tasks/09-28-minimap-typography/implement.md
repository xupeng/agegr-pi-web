# Implement — 小地图字号对齐左侧栏

- [x] 1. `components/ChatMinimap.module.css` 只改 5 处 `font-size`：

      | 选择器 | 改前 | 改后 |
      |--------|------|------|
      | `.toolBadge` | 9px | 10px |
      | `.user` | 14px | 12px |
      | `.heading[data-level="1"]` | 14px | 12px |
      | `.heading[data-level="2"]` | 12px | 11px |
      | `.paragraph` | 14px | 12px |

      不动 `.number`（10px）、`.assistantJump`（10px）、`.heading[data-level="3"]`（11px），
      也不动任何 `font-family`、`line-height`、`min-height`、padding。

- [x] 2. 回归断言：`e2e/chat-appearance.mjs` 新增 `checkMinimapTypography(page)` —— 悬停小地图
      轨道打开 `.preview`，读取 `.user` / `.paragraph` / `.heading[data-level="1"|"2"|"3"]` /
      `.number` / `.toolBadge` 的 `getComputedStyle` 字号与 `font-family`，与左侧栏会话行的
      计算样式（标题 12px、元信息 11px）比较，并断言各行的 `getBoundingClientRect().height`。
      在 `e2e/run.mjs` 里接入：至少在一个桌面 viewport 的会话 fixture 之后调用一次。
      （实施时因现有 fixture 覆盖不到 h1/h3/段落+徽标，新增了专用的可滚动 `TYPO` fixture；
      断言与 fixture 都未运行，属未验证代码，已在 `research/verification.md` 标注。）

- [x] 3. 浏览器验证：**按决策 4 不执行**。不跑 e2e 套件、也不起 Playwright 脚本；页面上的人工
      验收由用户负责。步骤 2 的断言只要求「加进去、能通过 `node --check`」，其未运行的事实
      写入 `research/verification.md`。

- [x] 4. 规范更新：`.trellis/spec/frontend/component-guidelines.md` 的
      「对话区字号：必须走 offset 变量」段补「界面外壳」例外——判据、小地图预览的取值来源
      （对齐左侧栏的 12/11/10px）与本任务证据。

- [x] 5. 三件套并记录：`node_modules/.bin/tsc --noEmit`、`npm run lint`、
      `env -u NODE_PATH XDG_STATE_HOME= npm test`；把实测计算样式、行高与门禁数字写入
      `research/verification.md`（含未覆盖项）。

## Gates

```bash
node_modules/.bin/tsc --noEmit
npm run lint
env -u NODE_PATH XDG_STATE_HOME= npm test
E2E_SERVER_MODE=dev node e2e/run.mjs      # 隔离 worktree 内
```

不执行 `next build`（会污染 `.next/` 并让 `npm run dev` 失败）。
