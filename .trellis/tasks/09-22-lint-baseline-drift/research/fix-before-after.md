# 修复前后对照（两棵锁一致树）

## 修复前基线（2026-09-22，两棵树均为 `personal@5402a5f`）

| 树 | 安装来源 | eslint 覆盖 | error | warning | 分布 |
|---|---|---|---|---|---|
| `pi-web-lintclean-pnpm` | `pnpm-lock.yaml` + `CI=true npx --yes pnpm@10 install --frozen-lockfile` | 495 | **14** | 0 | ChatInput 7 / ChatMinimap 5 / SessionSidebar 2 |
| `pi-web-lintclean-personal` | `package-lock.json` + `npm ci` | 495 | **0** | 0 | — |

插件：pnpm 树 7.1.1 / npm 树 7.0.1。

命令与统计口径（两棵树相同）：

```bash
cd <fixture> && node_modules/.bin/eslint . -f json | node -e '<统计 files / errors / warnings / 按文件分布>'
```

## 修复后（待填）

| 树 | eslint 覆盖 | error | warning | tsc | test |
|---|---|---|---|---|---|
| pnpm 夹具（7.1.1） | 495 | **0** | **0** | 0 | 1411 pass / 0 fail |
| npm 夹具（7.0.1） | 495 | **0** | **0** | 0 | 1411 pass / 0 fail |
| 主 checkout（`npm ci` 后，7.0.1） | 495 | **0** | **0** | 0 | 1411 pass / 0 fail |

修复前 → 修复后的计数对照：

| 树 | 插件 | error（前 → 后） | warning（前 → 后） | 文件数（前 → 后） |
|---|---|---|---|---|
| pnpm 夹具 | 7.1.1 | **14 → 0** | 0 → 0 | 495 → 495 |
| npm 夹具 | 7.0.1 | 0 → 0 | 0 → 0 | 495 → 495 |
| 主 checkout | 7.1.1（混合）→ 7.0.1（`npm ci`） | **14 → 0** | 0 → 0 | 495 → 495 |

文件覆盖数在修复前后不变（495），说明没有"少扫文件"造成的假通过。

## 行为证据

### 斜杠菜单键盘导航（新增，覆盖 ChatInput 的键盘路径）

`research/slash-menu-keyboard.mjs` 自带隔离 agent 目录与 dev server，先在夹具的**未修改**组件上取
`slash-menu-before.json`，再把修复后的三个文件 `cp` 进同一夹具取 `slash-menu-after.json`：

```
before_exit=0  after_exit=0
diff(before, after) → 无输出   ⇒ 行为完全一致
```

两份快照都断言通过：浮层打开（7 项，`/auto-compact` `/clone` `/compact` `/copy` `/name` `/reload` `/session`）、
方向键高亮移动（`ArrowDown→/copy`、`ArrowDown→/session`、`ArrowRight→/session`、`ArrowUp→/copy`、
`ArrowLeft→/compact`、`ArrowDown→/reload`）、`Enter` 提交 `/reload `、`/re` 过滤为
`/reload /clone /compact`、`Escape` 关闭且不改写输入。脚本自检"Enter 提交值 == 提交前高亮项"。

### 现有 e2e（`npm run test:e2e`）—— 既有失败，不是本次引入

在 npm 夹具上跑，功能断言一路跑到 compacted 会话导航与 minimap 节点/预览
（产出 `compaction-minimap.png`），最后卡在 `e2e/run.mjs:410` 的
"浏览器控制台不得有 error"断言：它捕获了既有的
`GET /api/sessions/e2e-compacted-session/state → 500`。

判定为**既有问题**的证据（四种组合、错误列表完全一致）：

| 组合 | 结果 |
|---|---|
| 修复后组件 + dev 模式 | `state` 500，失败 |
| **基线组件** + dev 模式 | 同样 `state` 500，失败 |
| 修复后组件 + `E2E_SERVER_MODE=start`（CI 形态，含 `npm run build`） | 同样 500，失败 |
| 修复后组件 + start 模式 + **Node 22.19.0**（CI 钉的版本） | 同样 500，失败 |

该 500 来自 `app/api/sessions/[id]/state/route.ts` 的 catch 分支，与三个组件无调用关系；
单独调用 `resolveSessionPath()` 与 `readPersistedAsk()` 均正常，剩 `getRpcSession(...).send({type:"get_state"})`
分支为主要嫌疑。**未定位到底、属本任务 out of scope**，因此：

- 不把它当成本任务的失败，也不当成本任务通过；
- minimap 交互断言位于失败点之前，已实际执行并通过（截图 mtime 属于该次运行）；
- 该 500 修好之前，`npm run test:e2e` 在本机不能作为干净门禁。
