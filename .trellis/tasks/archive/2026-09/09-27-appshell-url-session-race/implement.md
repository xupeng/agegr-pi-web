# Implement — AppShell URL session restore race

## Steps

- [x] 1. **Reproduce first (AC1).** `e2e/session-restore.mjs` + `e2e/run.mjs:419`; on the
      unmodified `ed3303f` AppShell the assertion fails with `actual: null, expected:
      'e2e-rich-session'` (URL stripped while the rich session was on screen).
- [x] 2. **Pure helper + unit tests (AC2).** `lib/session-restore.ts`
      (`urlSessionParam`, `canRestoreRememberedSession`) + `lib/session-restore.test.mjs`
      truth table.
- [x] 3. **Wire it into `handleCwdChange`** at `components/AppShell.tsx:722-727`, with
      `initialSessionRestored` added to the deps. No other production change.
- [x] 4. **Re-run the repro** (passes) and the full e2e suite in the temp worktree
      (AC4/AC5).
- [x] 5. **Docs (AC6).** `.trellis/spec/frontend/session-restore.md` (invariants +
      forbidden patterns + required tests), index row, and the `AGENTS.md` trap.
- [x] 6. **Gates (AC3).** tsc exit 0, lint 525 files / 0 errors / 0 warnings, unit
      **1522 pass / 0 fail** (baseline 1516, +6 itemised in
      `research/verification-baseline.md`).
- [x] 7. Evidence in `research/`, boxes ticked, close-out order followed.

## Verification commands

```bash
node_modules/.bin/tsc --noEmit
npm run lint
env -u NODE_PATH XDG_STATE_HOME= npm test
# e2e in an isolated worktree (this checkout's dev server owns .next/dev/lock)
git worktree add <tmp>/verify <branch> && cp -al node_modules <tmp>/verify/
cd <tmp>/verify && PI_CODING_AGENT_DIR=<mktemp -d> E2E_SERVER_MODE=dev PORT=<idle> node e2e/run.mjs
```

## Open questions

- ~~Which evidence file to extend~~ → `research/verification-baseline.md` +
  `research/browser-verification.md`, matching the previous task.
- ~~Permanent harness?~~ → yes, wired into `e2e/run.mjs:419`; the flake blocked three
  PRs, so it belongs in the gate.

## 实施结果

1. **实现范围**：生产代码只改 `components/AppShell.tsx`（导入 + 一处守卫 + 一个 dep），
   其余为新增文件：`lib/session-restore.ts`、`lib/session-restore.test.mjs`、
   `e2e/session-restore.mjs`，以及 `e2e/run.mjs` 的一处接线。
2. **偏离计划：先尝试过 ref 版加固并回退。** 计划里只写了谓词守卫；为覆盖"采纳之后
   才上报 cwd"的顺序，我一度把 `handleCwdChange` 里的 `selectedSession` 闭包读取换成
   render 期 ref 并从 dep 里移除 `selectedSession`。该版本让既有的
   `PASS: session reading offsets, ...`（`e2e/run.mjs:380`）**可复现失败**（连续两次），
   于是回退，只保留谓词守卫；回退后该断言通过。证据见
   `research/verification-baseline.md` 的归因小节。
3. **偏离计划：多加了 vm 行为测试。** 计划只要求谓词真值表；`components/AppShell
   .workspace-memory.test.mjs` 已有在 vm 里执行真实 `handleCwdChange` 源码的脚手架，
   于是补了一条"未落定的 `?session=` 阻止记忆恢复"的行为测试（断言不发 `projectKey`
   请求、不清空 selection、不 bump `sessionKey`），并顺手修正该脚手架现有用例的 context
   （新增 `initialSessionRestored`、真实 `session-restore.ts`）。
4. **偏离计划：断言取值。** 计划假设失败时 URL 会指向"上一个会话"；实测在 dev 环境下
   断言时取到的是 `null`（`router.replace(pathname)` 先抹掉参数，异步恢复尚未回写）。
   断言因此写成"URL 必须仍是显式会话"，对两种表现都成立，也更贴近不变量本身。
5. **既有 flake 的定位**：修复版第二次整套运行时，`e2e/run.mjs:292`（分页渲染窗口，
   比较"已挂载窗口"与"已抓取的旧页数"，而窗口本身是虚拟化的）失败。四次跑动结果：
   未修复 2/2 通过该断言、修复 2/3 通过；本次新检查则未修复 2/2 失败、修复 3/3 通过。
   结论是既有的、双方都不可复现的分页 flake，归因与原始输出记入
   `research/verification-baseline.md` 并写进 PR 描述，不算在本次修复账上。
