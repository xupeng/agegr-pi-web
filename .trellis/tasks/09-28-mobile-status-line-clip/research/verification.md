# 验证记录：移动端运行状态行折行时末行被输入框遮挡

任务：`.trellis/tasks/09-28-mobile-status-line-clip`
修复提交：见本任务工作提交（`fix(chat): 跟随运行状态行折行后的尾部`）

## 结论

- 状态行折行后不再被消息视口底边裁切，且**只在读者仍贴在尾部时**才跟随；上滚后位置不被抢走。
- 唯一跟随原语 `followTailIfAttached`（`hooks/useAgentSession.ts:524`）由流式跟随与临时块跟随共用，
  `hooks/useAgentSession.ts` 里 `requestAnimationFrame(` 只剩一处。
- 门禁三件套 + e2e 全量通过；新增 5 条源码级单测 + 1 条浏览器级 e2e 断言（两者都已验证在修复前失败）。

## 环境

本 checkout 的 `next dev`（用户自用）持有 `.next/dev/lock`，而 `e2e/run.mjs:22` 断言该锁不存在，
因此所有浏览器验证在隔离副本内进行：

- 副本：`/home/xupeng/dev/personal/forked/.piweb-repro`
  （`git archive HEAD <改动文件>` 重建源码 + `cp -al node_modules` 硬链接依赖）
- 副本内的 dev server：`127.0.0.1:30161`，`PI_CODING_AGENT_DIR=<副本>/test-results/agent`
- 复现 harness：`research/repro-status-tail.mjs`（随任务入库），在仓库根目录原地运行：

  ```bash
  REPRO_AGENT_DIR=<隔离副本>/test-results/agent REPRO_BASE=http://127.0.0.1:30161 \
    node .trellis/tasks/09-28-mobile-status-line-clip/research/repro-status-tail.mjs
  ```

  它只驱动浏览器（被测代码由 `REPRO_BASE` 提供），import 的是**入库的断言**——
  `e2e/status-tail.mjs` 的 `checkStatusTailFollow()`——所以红灯/绿灯对照跑的就是 e2e 断言本身，
  只是省掉整套 e2e。
- 用户主 checkout 的 dev server 未被重启或改动。

## 复现（修复前）

手法：mock `EventSource`（`e2e/subagents.mjs:284-317` 同款）向应用自己的 SSE 链路灌
`agent_start` / `tool_execution_start` / `tool_execution_update`，不需要模型。
视口 390×844、`isMobile: true`、`hasTouch: true`；行数与行盒用 `Range.getClientRects()` 逐行取。
fixture：长会话（尾部即滚动尾部）。`clippedPx = 末行 bottom - 滚动容器 bottom`，正数即被裁。

| 阶段 | 行数 | 末行 bottom | 容器 bottom | `clippedPx` | `scrollerAtBottom` |
|------|------|------------|------------|-------------|--------------------|
| `waiting_model`（单行，正常态） | 1 | 728 | 739 | -10（可见） | true |
| bash 长进度（折行） | 3 | 767 | 739 | **+29（末行被裁）** | **false** |
| 手动滑到底（对照） | 3 | 728 | 739 | -10（可见） | true |

对照行证明内容可到达：症状是"尾部增长后没跟随"，不是"内容不可达"。

e2e 断言在**修复前源码**上的失败信息（同一断言，两个视口都会失败）：

- 390px：`wrapped status line must stay inside the message viewport (clipped 68px past the composer edge)`
- 1280px：同上，`clipped 9px`

## 修复后

同一 harness、同一视口：

| 阶段 | 行数 | `clippedPx` | `scrollerAtBottom` |
|------|------|-------------|--------------------|
| `waiting_model` | 1 | -10 | true |
| bash 长进度（折行） | 3 | **-10** | **true** |
| 手动滑到底（对照） | 3 | -10 | true |

`checkStatusTailFollow()` 的输出（两个视口都 GREEN）：

```
GREEN 390px: the status line is followed and a detached reader keeps their place
GREEN 1280px: the status line is followed and a detached reader keeps their place
```

## AC1–AC3 的行为证据

`checkStatusTailFollow()` 按顺序断言：

1. AC1：状态行折行后 `lineCount >= 2`（`expectWrap`，仅移动视口要求）、`clippedPx <= 0`、
   `scrollerAtBottom`。1280px 也折行，但不断言行数（列宽差异不属本任务契约）。
2. AC2：`scrollTop = 0` 后再推一次**文本变化**的状态更新 → `scrollTop` 不变（不被抢走）。
3. AC3：先回到底部让 `wasAttached` 为真，再滚到距尾 4px（仍在 `CHAT_SCROLL_TAIL_TOLERANCE = 8`
   内 → 判定为"贴尾"），推一次**文本相同**的更新 → `scrollTop` 停在 4px 处；随后推一次文本变化的
   更新 → 回到尾部。后一步是关键：没有它，前一步在"跟随永远不生效"的实现下也会通过。

AC3 的**突变验证**：把 `components/ChatWindow.tsx` 的 effect 依赖从
`[tailStatusKey, followTailIfAttached]` 改成 `[tailStatusKey, agentPhase, followTailIfAttached]`
（即让每次 `tool_execution_update` 产生的新 phase 对象都触发跟随），两个视口都变成
`RED: an unchanged status block must not scroll an attached reader either`。断言不是空过的。

AC2/AC3 的"程序化滚动会先触发应用自己的 scroll 处理器"这一前置在断言里被显式满足：
上滚用 `scrollTop = 0`（远离尾部 → `isNearBottomRef = false`），回尾用 `scrollHeight`
（贴尾 → true）；从**分离态**滚到距尾 4px 会被 `getLiveFollowAttached` 的 reattach（容差 96px）
按设计吸回尾部，所以 AC3 的顺序是"先贴尾、再退 4px"。

## 单测与源码级证据

- 新增 `components/ChatWindow.status-tail-follow.test.mjs`（5 条，源码级断言，沿用
  `components/ChatWindow.scroll-to-latest.test.mjs` 风格）：
  跟随原语的门禁/rAF/帧内复查、`requestAnimationFrame(` 在 hook 里只出现一次、流式路径调用原语、
  触发键取自渲染文本、effect 调用原语、状态行自身排版未被改动。
  对**修复前源码**运行：`not ok 1..5`，`# pass 0 / # fail 5`。
- 既有 `hooks/useAgentSession.test.mjs` 两条断言原本钉的是被抽走的内联条件，已改为断言原语
  （"keeps live following cancellable when the user scrolls away from the tail"、
  "keeps a newly sent user message at the top while its response starts"）。
  未放宽语义：`followTailIfAttached` 的 `pendingScrollToUserRef || !isNearBottomRef` 门禁与原内联条件一致。
- `npm test`：`tests 1725 / pass 1725 / fail 0`（隔离前基线 1720；新增 5）。

## 门禁

| 命令 | 结果 |
|------|------|
| `node_modules/.bin/tsc --noEmit` | 退出码 0 |
| `npm run lint`（eslint 全仓，`eslint . -f json` 的数组长度） | 556 文件，0 error / 0 warning |
| `env -u NODE_PATH XDG_STATE_HOME= npm test` | 1725 pass / 0 fail |
| `E2E_SERVER_MODE=dev node e2e/run.mjs`（隔离副本） | 见下节 |

## e2e 全量（隔离副本）

```
cd /home/xupeng/dev/personal/forked/.piweb-repro
E2E_SERVER_MODE=dev node e2e/run.mjs
```

在**最终源码状态**（即本次提交的内容）上跑了两次：

| 运行 | 结果 | 证据 |
|------|------|------|
| run 1 | 失败，但**不在本任务的断言上** | 6 条 `PASS` 后，`e2e/session-restore.mjs:43`（`checkSessionRestore` 的第二次 `open()`）等 `.markdown-code-block pre` 超过 10s 超时 |
| run 2 | **全绿** | 13 条 `PASS`，日志结尾是套件最后一步的两个 touch 视口断言；无 `Error`/`Timeout`；`finally` 清理跑完（无残留 `/tmp/pi-web-e2e-*`） |

run 2 的服务端日志（`test-results/e2e/server.log`）里 `e2e-status-tail-session` 出现 8 次、
`GET /?session=e2e-status-tail-session` 出现 2 次 ⇒ 新检查在 1280px 与 390px 两个视口都真实执行，
且整轮套件在其后继续跑完。

run 1 的失败位置与 `?session=` / 工作区记忆恢复有关（`?session=e2e-rich-session` 的第二次 `open()`
等不到 markdown 代码块），与本任务改动的跟随路径无交集（改的是 `followTailIfAttached` 的调用点，
不涉及 session 选择/恢复）。两次运行源码与断言完全相同、只有 run 1 复现；记为**环境/时序偶发**
（dev server 冷启动 + 该检查自身 10s 的 marker 超时），不当作本任务通过依据 —— 通过依据是 run 2。

## 未覆盖 / 已知边界

- **真机（iOS PWA standalone）验收由用户完成**（AC6）。确定性回归在 Chromium 上做，能覆盖
  "折行后末行是否落在滚动容器内"这一几何事实，但不覆盖 iOS 的 `visualViewport`/键盘行为；
  本次没有改动 `hooks/useViewportHeight.ts`、`--app-viewport-height` 或 `safe-area`，
  这些路径的既有 spec（`.trellis/spec/frontend/mobile-keyboard-viewport.md`）未受影响。
- 状态行仍是 `text-[13px]`，未接入对话区 `--chat-font-size-offset`（见新 spec
  `.trellis/spec/frontend/chat-tail-follow.md` 的"已知偏差"）。
- e2e 的 `expectWrap` 只在移动视口强制（390px）；1280px 列宽更大，是否折行不作为契约。
- 未覆盖"扩展注入的临时块"（`ExtensionStatusBar` / `ExtensionWidgets`）：它们在 composer 之下的
  另一个容器里，不在消息滚动流内，不属本症状。
