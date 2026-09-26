# 切换渲染与删除管线的浏览器验证记录

本文件记录 C 的**删除前闸门**与**删除后复核**两轮浏览器验证，以及父任务 `implement.md`
步骤 3 那张十项手工核对清单的逐项覆盖状态。删除是不可逆点，所以「覆盖到」与「没覆盖到」
必须分开写，不能把源码级断言算成浏览器验证。

## 闸门怎么跑的

本 checkout 里有一个活跃的 dev server（8505，是更早的会话留下的），因此本 checkout 的
`.next/dev/lock` 会让 `e2e/run.mjs` 的 dev 模式直接拒绝启动。为了不动那个服务，闸门在
一个临时 worktree 里跑（`git worktree add --detach`，`node_modules` 用 `cp -al` 硬链接；
`/tmp` 是 tmpfs，硬链接跨文件系统会失败，所以 worktree 必须放在 `/home` 下）：

```bash
git worktree add --detach /home/xupeng/dev/personal/forked/.pi-c-e2e <sha>
cp -al node_modules /home/xupeng/dev/personal/forked/.pi-c-e2e/node_modules
cd /home/xupeng/dev/personal/forked/.pi-c-e2e
env -u NODE_PATH XDG_STATE_HOME= E2E_SERVER_MODE=dev node e2e/run.mjs
```

前置：`npx playwright install chromium`（`node_modules` 里的 playwright 是 1.63.0，要
`chromium_headless_shell-1243`，而机器缓存里只有 1194）。

### fixture 为什么不需要模型

`e2e/ask-user.mjs` 不去驱动一次真实的 `ask_user` 工具调用（那需要模型凭证）。它利用产品
自身的重水合路径：往临时 agent dir 里写一个普通 session `.jsonl`，再写
`pi-web-open-asks.json`（`lib/ask-user/persist.ts` 的 `OpenAsksFile` 形状）。wrapper 不存在
时 `GET /api/sessions/[id]/state` 回退返回 `{ running: false, state: { pendingAsk } }`，
`useAgentSession` 在 mount 时把它水合成 `pendingAsk`，于是 `?session=<id>` 直接渲染出卡片。

这同时意味着这条 fixture **本身就是「切会话再切回后重水合」那条路径的浏览器证据**。

`ask_submit` / `ask_cancel` 两个 POST 由 `page.route` 本地应答并**挂住**，好让测试在卡片卸载
之前观察到锁定态；`release("close")` 正常关闭，`release("reject")` 返回 `{ error }` 驱动
失败/重试路径。路由在 `finally` 里 `unroute`，不影响后续用例。

## 两轮结果

| 轮次 | 提交 | 结果 |
| --- | --- | --- |
| 删除前（切换渲染后） | `0101e0a` | 12/12 PASS，1280px 与 390px 各自一遍 |
| 删除后（管线已移除） | `b5774aa` | 12/12 PASS，1280px 与 390px 各自一遍 |

两轮都包含这一行，且两个视口各一次：

```
PASS: shared ask_user view render, keyboard, submit lock/reject/retry, and cancel at 1280px
PASS: shared ask_user view render, keyboard, submit lock/reject/retry, and cancel at 390px
```

第二轮第一次运行时在 `run.mjs:249` 失败，原因是 Turbopack 内部 panic（
`Restore of All for task ... failed`）——worktree 的 `.next` 还是 checkout 之前的陈旧图。
`rm -rf .next` 后重跑即 12/12 PASS。这是缓存的陈旧问题，不是删除引入的回归（AGENTS.md 的
dev 排障一节描述的就是这一类）。

## 父任务十项清单的覆盖状态

| # | 父 `implement.md` 步骤 3 的核对项 | 状态 | 依据 / 缺口原因 |
| --- | --- | --- | --- |
| 1 | 视图在消息滚动流内并跟随滚动；空会话在 composer 上方列对齐 | **部分** | 浏览器里渲染的是「有消息的 session」，卡片确在消息列内；空会话那一支只有源码级断言（`ChatWindow.ask-user-layout.test.mjs` 对挂载位置的匹配），没有真实浏览器的空会话用例 |
| 2 | 单选：选选项清空自定义框；输入自定义文本取消选项 | **已覆盖** | e2e「Option / custom-text mutual exclusion」两条断言 |
| 3 | 多选：选项与自定义文本共存；占位文案与单选不同 | **已覆盖** | e2e 断言 `multipleOther` 占位与 `singleOther` 不同、`fill` 后选项仍 `aria-checked=true` |
| 4 | 提交后锁定：选项 disabled、摘要 `✓ values · otherText`、操作栏显示「已提交」 | **已覆盖** | e2e 断言状态行文本 `Submitted`、状态行获得焦点、`.pi-ask-summary` 恰为 `["✓ dev", "✓ eu · E2E other"]`、选项 `isDisabled()` |
| 5 | 取消路径同样锁定并显示「取消中」 | **已覆盖** | e2e 断言状态行 `/Cancelling/` 且操作按钮已被移除 |
| 6 | 补充信息随提交送达（transcript 出现 `Supplement` 行） | **部分** | 请求体层面已断言（`stub.submits[0].supplement === "E2E supplement"`）；transcript 那一行需要一次真实 agent turn，没有模型就没跑 |
| 7 | 切会话再切回：按原 `askId` 重水合，drafts 不跨 ask 泄漏 | **部分** | 重水合已在浏览器里走到（fixture 就是这条路径）；「两个不同 ask 之间 drafts 不泄漏」只有 `AskUserAppHost.test.mjs` 的 `key={pendingAsk.askId}` 源码断言，没有双 ask 的浏览器用例 |
| 8 | 另一个浏览器标签提交后，本端 3s 内关闭或切到新 ask | **未覆盖** | 需要一次真实的**服务端**关闭：测试把 `ask_submit` 本地应答了，服务端状态没变，第二个标签的 3s 轮询拿到的仍是那条持久化 ask。这一段（`useAgentSession` 的 ask 轮询）C 未改动，属 R6 保留项 |
| 9 | 键盘：Tab 进入单选组一次、方向键移动并选中、多选 `Space` 切换、锁定焦点落在状态行 | **已覆盖** | e2e 断言未选中组的 `tabindex` 恰为 `["0","-1","-1"]`、方向键移动并选中且焦点跟随、多选方向键不动作而 `Space` 切换、状态行 `document.activeElement` |
| 10 | 5 套主题（light/dark/mist/rose/pine）配色与对比度均可用 | **已覆盖（映射面）** | e2e `assertThemeMapping` 逐主题断言卡片的 `background-color`/`color`/`border-color` 等于宿主 `--bg-panel`/`--text`/`--border` 的解析值，并要求五个 surface 至少三种不同。对比度本身由宿主主题负责，不在这一层重算 |

删除前必须全绿的判断因此是：闸门在删除前跑过一遍（第 1 轮），删除后又在同一份测试上跑过
一遍（第 2 轮）。第 1 轮是在删除之前完成的，满足「先手工核对再删」的约束。

## A 的缺口 G1–G4 在 C 之后的状态

- **G1（reject 解锁）**：已解决，且**在真实浏览器里被断言**（e2e 的 reject 分支：`role="alert"` 出现、
  操作按钮回归且 `isDisabled() === false`、重试清除陈旧错误）。这是 A 阶段自查发现的一次真实
  回归，C 的闸门把它锁住了。
- **G2（宿主响应 id 与 `Object.prototype` 冲突）**：随传输层一起消失，**不再需要覆盖**。
  这正是删除而非封存的价值之一：一条无法迁移的断言不需要靠"封存"来假装还有人管。
- **G3（locked reducer 不拒绝写入）**：维持设计边界。锁定由视图（`controlsDisabled`）门禁，
  浏览器里断言为「锁定态操作按钮被移除」而不是「按钮 disabled」——e2e 最初按后者写，跑出来
  才发现组件的锁定态是**替换**页脚而非禁用按钮，断言已按实际行为修正。
- **G4（多选自定义占位区分）**：由 B 的组件承担，C 的 e2e 断言两者占位不同。

## 本轮完整验证

```
node_modules/.bin/tsc --noEmit                          退出 0
npm run lint                                            No issues found
env -u NODE_PATH XDG_STATE_HOME= npm test                1497 pass / 0 fail / 10 suites
env -u NODE_PATH XDG_STATE_HOME= E2E_SERVER_MODE=dev node e2e/run.mjs   12/12 PASS
```

单测计数从切换渲染后的 1536 降到 1497，差值 39 恰是六个被删测试文件里的 `test()` 数——
被删的是管线自己的测试，不是产品的测试。

## 执行中发现的、与规划不一致的事实

1. **`light-dark()` 禁令不在 `quality-guidelines.md`**。父任务 `prd.md` R6 与 C 的 `design.md`
   都写着要放开 `quality-guidelines.md` 里的这条禁令，实际 grep 显示它只存在于
   `ask-user-protocol.md`。`component-guidelines.md`、`state-management.md`、
   `quality-guidelines.md` 三份都**没有**提到被删路径，因此一个字节都没改。规划里的这条
   假设是错的，已在 `docs(spec)` 提交信息里写明。
2. **`lib/next-config.test.mjs` 原本没有针对那四个 external 的断言**（与 C 的 `prd.md` 描述
   不符）。它唯一与被删路径相关的是「`/fonts/**` 不需要 CORS」那条，已改为「四个
   `@modelcontextprotocol/*` 不得再出现在 `serverExternalPackages`」的**缺位断言**，让这条
   路径没法悄悄回来。
3. **`.next` 被删导致 8505 的 dev server 崩掉**（Turbopack 找不到自己的缓存分片）。原因是为
   了让 `tsc` 不看 `.next/dev/types` 里那份引用已删路由的陈旧生成类型，执行时把 `.next`
   移走并删了备份——没有意识到那个目录正被一个活跃的 dev server 使用。已用与原先相同的
   命令重启 8505（`-H 0.0.0.0 -p 8505`），`/` 与 `/api/sessions` 均 200。教训：动 `.next`
   之前先 `lsof -nP -iTCP:<port> -sTCP:LISTEN`，并且备份要留在 `mktemp -d` 里而不是删掉。
4. **`package-lock.json` 里仍会出现 `@modelcontextprotocol/sdk`**，它是 `@google/genai`
   （经 `@earendil-works/pi-coding-agent`）的 optional peerDependency，不是被安装的包。
   这正是「锁文件与 `package.json` 同步」与「锁文件里出现某个名字」是两件事。同断言：
   `npm ci` 仍然有效（`package-lock.json` 根 `dependencies` 与 `package.json` 逐键相等，
   已用脚本核对）。

## 没有被自动化覆盖的东西（诚实的清单）

- 真实的模型驱动端到端：一次真实 `ask_user` 工具调用 → 卡片 → 提交 → follow-up 消息回到
  transcript。需要凭证，CI 也没有。
- 上面第 1、6、7 项的「部分」与第 8 项的「未覆盖」。
- 归档的 MCP Apps 探针 fixture
  （`.trellis/tasks/archive/2026-09/09-26-ask-user-mcp-migration/research/fixture/`）仍然 import
  那四个已删除的包，因此**不再可运行**。它们是历史证据，故意没有改。
- PA 仓库一侧的接入：不在本任务树范围内，B 的 `portable/react/README.md` 与 fixture 是它的
  前置。
