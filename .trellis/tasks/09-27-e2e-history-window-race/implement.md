# Implement — deterministic history-window assertion

## Steps

- [x] 1. Copy the recorded pre-fix failure into `research/verification-baseline.md`
      (excerpt + which run produced it) before touching the test.
- [x] 1b. Extend the same evidence file with the second race found while verifying
      (no `before=` request on a cold start) once its fix is confirmed.
- [x] 2. Edit `e2e/run.mjs:289-292`: build `expected`, snapshot the mounted messages,
      wait for `text(oldest)` to be attached, re-read, print the catch-up diagnostic when
      the two differ, then keep the existing `deepEqual` message.
- [x] 2b. Edit the pagination trigger to retry the sentinel scroll until the request is
      observed (design §3b), so a cold start cannot stall the section.
- [x] 3. Run the full e2e suite twice in an isolated worktree
      (`E2E_SERVER_MODE=dev`, temp `PI_CODING_AGENT_DIR`) — the second run after removing
      `.next` — and require the history section to pass in both; `grep "caught up"` on the
      logs records whether the DOM wait was needed.
- [x] 4. Gates: `node_modules/.bin/tsc --noEmit`, `npm run lint`,
      `env -u NODE_PATH XDG_STATE_HOME= npm test`.
- [x] 5. Write `research/verification-baseline.md` (AC5), tick this file's boxes, then
      close out: work commit → task artifacts → `task.py archive` → session journal → PR
      to `personal`.

## Verification commands

```bash
git worktree add --detach /home/xupeng/dev/personal/forked/.pi-e2e-verify personal
cp -al node_modules /home/xupeng/dev/personal/forked/.pi-e2e-verify/node_modules
cd /home/xupeng/dev/personal/forked/.pi-e2e-verify
PI_CODING_AGENT_DIR=$(mktemp -d) E2E_SERVER_MODE=dev node e2e/run.mjs  # twice
```

## Open questions

- If the catch-up diagnostic never fires in two runs, report that honestly and keep the
  wait (it is still the correct condition); do not claim a reproduction that did not
  happen.

## 实施结果

1. **两处竞态，都在测试侧**：① DOM 读取早于 `visibleCount` catch-up effect（缺的正好是一整页
   50 条；改动前 1/4 概率出现）；② 瞬时滚动早于 sentinel 的 `IntersectionObserver` 装好
   （冷启动时 `server.log` 里完全没有 `?before=` 请求，30s 后超时）——第 ② 处是验证第 ① 处时
   新发现的，已补进 prd/design。
2. **修复**：断言前先等"最旧的已加载消息"挂载（即 app 明确保证的"渲染窗口 ≥ 已加载消息"），
   再照旧做完整 `deepEqual`（强度不变）；触发改为按 750ms 重试滚动，直到观察到请求即停，
   避免重复请求同一页（循环里断言 `before` 游标严格递减 50）。
3. **偏离计划：诊断未触发。** 两次修复后跑动里 `caught up` 诊断都没打印，说明这两次没赶上
   那个时序窗口。按 design 的约定如实记录：等待是"保险"而非"这两次日志证明的修复"，机制证据
   来自改动前那次失败日志（恰好缺一整页）。没有把它写成"已复现并修复"。
4. **验证**：热缓存与 `rm -rf .next` 冷启动各跑一次整套 e2e，均 13 条 PASS、无异常；tsc 0、
   lint 0、单测 1522 全绿（本次只改 e2e，单测数量不变）。
