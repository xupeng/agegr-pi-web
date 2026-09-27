# Browser verification — AppShell URL session restore race

## Isolation recipe

```bash
git worktree add --detach /home/xupeng/dev/personal/forked/.pi-race-verify personal
cp -al <checkout>/node_modules /home/xupeng/dev/personal/forked/.pi-race-verify/node_modules
cd /home/xupeng/dev/personal/forked/.pi-race-verify
PI_CODING_AGENT_DIR=$(mktemp -d) E2E_SERVER_MODE=dev node e2e/run.mjs
```

The worktree must live under `/home` (a `/tmp` worktree cannot hard-link
`node_modules`). `e2e/run.mjs` refuses to start in `dev` mode when the checkout has a
`.next/dev/lock`, which is why the run cannot happen in the primary checkout; it picks
a free port itself and writes artifacts to `test-results/e2e/`.

## The new check

`e2e/session-restore.mjs` (called at `e2e/run.mjs:419`, desktop viewport) makes the
"previous document's memory" deterministic instead of hoping for the right timing:

1. open `?session=e2e-rich-session` and wait for `.markdown-code-block pre`;
2. wait until the sidebar has written `pi-web:last-open-by-workspace`, then rewrite
   **every** workspace entry to `e2e-ask-user-session` (a previous document's state);
3. load `?session=e2e-rich-session` again from a fresh document, wait 1500 ms for a
   delayed rewrite, and assert the URL still names the rich session;
4. `page.reload()` and assert it is still the rich session that renders.

## Results

Pre-fix (`ed3303f` AppShell), first run:

```
PASS: shared ask_user view render, keyboard, submit lock/reject/retry, and cancel at 1280px
AssertionError [ERR_ASSERTION]: An explicit ?session= must survive the remembered-session restore
+ actual - expected
+ null
- 'e2e-rich-session'
    at checkSessionRestore (.../e2e/session-restore.mjs:45:10)
```

`actual: null` is `handleCwdChange`'s `router.replace(window.location.pathname)`
dropping the param — the UI was still rendering the rich session (`markdown-code-block
pre` was found), which is exactly the mixed state that made CI flaky.

Fixed, first run: the whole suite passed, including
`PASS: an explicit ?session= outranks the remembered workspace session`. The run left
`test-results/e2e/session-restore.png` next to the other artifacts.

## CI artifact that pinned the mechanism down

Artifacts of the failed `e2e` job on PR #14 (`gh run download 36278491394`), parsed
from `trace.zip` → `trace.network`:

- `23:11:02.288` document load issues `GET /api/sessions?sessionId=e2e-rich-session`
  (the sidebar's URL restore) plus two `GET /api/sessions?projectKey=…` requests (one
  from the sidebar's list, one from `restoreWorkspaceContext`).
- `23:11:03.552` the next document load issues
  `GET /api/sessions?sessionId=e2e-ask-user-session`.

Between those two loads the only user action is `checkChatAppearance`'s
`page.reload()`, so the reloaded URL had been rewritten to the ask-user session — the
remembered session of that workspace, written by the *previous* document — even though
the rich session was on screen. The same pattern (a `projectKey` restore request) is
present in every document load after the first, i.e. the destructive branch ran every
time and was harmless only when the memory already pointed at the session being
restored.
