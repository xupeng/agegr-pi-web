# Verification baseline — deterministic history-window assertion

Base commit: `95aa1c4` (`personal` after PR #15). Branch: `feat/e2e-history-window-race`.
The diff is e2e-only, so the app under test is identical before and after.

## The pre-fix failure (recorded, not reproduced on demand)

Captured while verifying PR #15 in an isolated worktree (`E2E_SERVER_MODE=dev`,
`PI_CODING_AGENT_DIR` = temp dir, unmodified `e2e/run.mjs`, unchanged AppShell):

```
PASS: bounded history, branch context, pagination root, and API errors
PASS: external session-file appends are visible on force/mount reads
AssertionError [ERR_ASSERTION]: Missing, reordered, or duplicate chat messages
+ actual - expected

  [
-   'E2E message 4600',
... (49 more)
-   'E2E message 4649',
    'E2E message 4650',
    'E2E message 4651',
    ...
    at file:///.../e2e/run.mjs:292:12
```

Two properties of that diff identify the cause:

- exactly **50** messages are missing, i.e. one full prepended page — the state where
  `messages` already grew by the last page but `visibleCount` has not caught up yet;
- the missing messages sit at the **top** of the window and the rest is a contiguous
  suffix, so nothing was reordered or duplicated — the render window was simply one
  commit behind.

That is the pre-flush state of `components/ChatWindow.tsx:667-672`
(`setVisibleCount((current) => Math.max(current, messages.length))`), which is the app's
documented guarantee that the window ends up at least as large as everything loaded.
Only one occurrence was observed in four local runs (1/4), so the assertion is
timing-dependent rather than reliably broken.

## Post-fix runs

Harness: temp worktree detached at `95aa1c4` with only `e2e/run.mjs` copied in, dev mode,
fresh `PI_CODING_AGENT_DIR`, artifacts under `test-results/e2e/`.

| Run | App state | History section | Trigger retry needed? | Catch-up diagnostic | Whole suite |
|-----|-----------|-----------------|-----------------------|---------------------|-------------|
| `e2e-window-run0` | fresh worktree, cold `.next`, **before** the trigger fix | **stalled** at `e2e/run.mjs:250` | yes — no `?before=` request ever reached the server | n/a | aborted |
| `e2e-window-run2` | warm `.next`, both fixes | PASS | no | **not printed** | 13 PASS lines, no error |
| `e2e-window-run3` | `.next` removed, both fixes | PASS | no (invisible when it works) | **not printed** | 13 PASS lines, no error |

`run0` is the second exposed race: the single instant scroll on the sentinel landed
before the app's `IntersectionObserver` effect ran, so `server.log` contains the initial
`?tail=50` request and no `?before=` request at all. After the retry fix, the cold run
(`run3`) passes the same section end to end.

Honest caveats:

- The DOM-wait diagnostic did **not** fire in either post-fix run, so the wait is
  insurance rather than a demonstrated fix in these logs. What is demonstrated is the
  mechanism behind the recorded 1/4 failure: exactly one prepended page (50 messages) was
  missing from the top of the window, i.e. the `messages.length` commit that the
  `visibleCount` catch-up effect had not yet processed. The wait is the condition the app
  guarantees (`components/ChatWindow.tsx:667-672`); without it the assertion is a coin
  flip, with it the assertion either passes or times out with a clear message.
- The trigger retry was validated by one cold run (n=1) that previously stalled. It is
  also strictly harmless when the app is already listening: the interval is cleared as
  soon as the request is observed, and the request is what stops it, so no duplicate page
  can be requested.

## Gates

| Gate | Command | Result |
|------|---------|--------|
| Types | `node_modules/.bin/tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Unit | `env -u NODE_PATH XDG_STATE_HOME= npm test` | 1522 pass / 0 fail (unchanged — e2e-only diff) |
