# PR #9 的 CI 失败：两处独立根因与修复

时间：2026-09-26。PR #9（`feat/ask-user-apps-only` → `personal`）的 `e2e` job 红，
`checks` job 绿。逐条读日志后确认是**两个互相独立的失败**，其中一个属于本分支的回归，
另一个继承自 `personal` 基线。

## 1. `npm run build`：客户端 bundle 里出现 `node:`（本分支回归）

CI 失败点（run `36220684216`，第一个失败 run 是 `36217189100`）：

```
Module build failed: UnhandledSchemeError: Reading from "node:fs/promises" is not handled by plugins
Import trace: node:path ← ./lib/ask-user/view-fonts.ts ← ./components/AskUserAppHost.tsx
              ← ./components/ChatWindow.tsx ← ./components/AppShell.tsx
```

`e2e` job 的第一步就是 `npm run build`（`next build --webpack`）。`checks` job 跑
`tsc --noEmit` / `lint` / `node --test`，这四件事**都不会**发现该问题：node 自己解析
`node:` 正常，而本地 `npm run dev` 用的 Turbopack 容忍它。于是视觉提交
（`388ce1b`，即当时的 `f86e5d0` + `6fda11f`）把 `node:fs/promises` + `node:path` 留在了
被 `"use client"` 组件值导入的模块里，直到 CI 的 build 才暴露。

修复：按「客户端可达模块只能纯浏览器代码」拆成两个模块 ——
`lib/ask-user/view-fonts.ts`（纯函数，客户端值导入）与
`lib/ask-user/view-font-manifest.ts`（只读 CSS 生成清单，route 值导入）。
规则已写进 `.trellis/spec/frontend/directory-structure.md`
（「同一模块里既有纯浏览器 helper 又有 node 读取：必须拆开」）。

验证（临时 worktree，`HEAD` + 修复，node_modules 用硬链接而不是软链）：

```
npm run build                                  # ✓ 成功（修复前同一命令在此 worktree 复现失败）
E2E_SERVER_MODE=start PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e   # 见下
```

本机只有系统 Chromium（Playwright 的 `chromium_headless_shell-1243` 未安装），
所以用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` 走同一条路径。

## 2. `/api/sessions/e2e-compacted-session/state` 500（继承自 `personal`）

build 修好后 e2e 才真正跑起来，随即出现：

```
500 http://127.0.0.1:43105/api/sessions/e2e-compacted-session/state
Failed to load agent state: Error: HTTP 500
```

最小复现（隔离的 `PI_CODING_AGENT_DIR` + 手写一份带 `compaction` 的 v3 会话文件）：

```
POST /api/agent/e2e-compacted-session  {"type":"get_state"}
→ {"error":"Cannot read properties of undefined (reading 'totalTokens')"}  500
```

进程内复现拿到栈（`startRpcSession` 成功，失败发生在 `get_state`）：

```
TypeError: Cannot read properties of undefined (reading 'totalTokens')
    at calculateContextTokens (…/pi-coding-agent/dist/core/compaction/compaction.js:87:18)
    at AgentSession.getContextUsage (…/pi-coding-agent/dist/core/agent-session.js:2729:47)
    at AgentSessionWrapper.send (lib/rpc-manager.ts:954)
```

根因：pi 的 `getContextUsage()` 在存在 compaction 时会读**分支里最新 assistant 条目的
`usage.totalTokens`**，而 `e2e/run.mjs` 的 compacted fixture（以及手写 / legacy v3 文件）
的 assistant 条目没有 `usage` 字段 → SDK 抛错 → 我们的 `get_state` 冒泡 → 500。
`GET /api/agent/[id]`（打开会话）与 `GET /api/sessions/[id]/state`（ask / 运行态轮询）
都走这条命令，所以打开这种会话时两个接口一起失败。

**归属**：不是本分支引入。

```
git diff --stat 49e377b..HEAD -- lib/rpc-manager.ts lib/session-reader.ts \
  app/api/sessions app/api/agent lib/ask-user/persist.ts \
  hooks/useAgentSession.ts components/ChatWindow.tsx
# → 空（服务端会话 / state 路径与 personal 逐字节一致）
```

客户端那 3s `/state` 轮询来自 PR #8 的 `54bca43`（已并入 `personal` 的 `49e377b`）。
**不要把归属说成"#8 之后才可达"**：`49e377b` 之后、本分支最后一次绿色 CI
（run `36210129254`，head `e2184b3`，09:56 +0800）已经含 `54bca43`
（`git merge-base --is-ancestor 54bca43 e2184b3` 为真），那次 e2e 却是绿的。
所以这条 500 在**浏览器路径上是时机相关**的：只有客户端在该会话的 wrapper 存活期间
轮询到 `/state` 才会触发；而端点一旦被调用就是**确定性**失败（隔离 agent dir 下
`POST /api/agent/<id> {type:"get_state"}` 必现，见上文）。
本地 `E2E_SERVER_MODE=start` 连续两次都停在 `Browser errors at width 1280`，
加上守卫后 CI 才稳定通过。

修复：`lib/rpc-manager.ts` 的 `get_state` 用 try/catch 包住 `inner.getContextUsage()`，
失败时 `contextUsage: null`（该字段本就可选、返回处本来就有 `? … : null`）。
只有派生指标缺失，`isStreaming`/`pendingAsk` 等都在。规则已写进
`.trellis/spec/frontend/quality-guidelines.md`（「派生指标算不出来 ≠ 整个响应失败」），
回归测试 `lib/rpc-manager.test.mjs` 的
「get_state reports an unknown context usage instead of failing the whole response」。

## 验证记录（修复后，同一临时 worktree）

| 检查 | 结果 |
|------|------|
| `npm run build` | ✓ |
| `E2E_SERVER_MODE=start … node e2e/run.mjs` | 10/10 PASS（修复前 `Browser errors at width 1280` 失败，报上述 500） |
| `node e2e/subagents.mjs` | 7/7 PASS |
| `node --experimental-strip-types --test lib/rpc-manager.test.mjs` | 25/25 pass |

## 复现环境坑（下次别重复踩）

- 在临时 worktree 里验证 CI 时，`node_modules` **不能**用软链：`next dev`（Turbopack）会报
  `Symlink [project]/node_modules is invalid, it points out of the filesystem root`，
  `e2e/subagents.mjs` 因此起不来。硬链接拷贝（`cp -al`）要求同一文件系统 ——`/tmp` 是
  tmpfs，所以 worktree 要放在 `/home` 下；或者直接 `npm ci`。
- `e2e/subagents.mjs` 自己 spawn `next dev`，并 assert `.next/dev/lock` 不存在：
  同一检出里跑过 dev server 就会拒绝启动。
