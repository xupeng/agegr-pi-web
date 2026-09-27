# Design — AppShell URL session restore race

## 1. Mechanism (read from the current code)

First load with `?session=<rich>`, in `components/AppShell.tsx`:

1. `getInitialNavigation(searchParams)` yields `sessionId = rich`; AppShell passes it
   down as `initialSessionId` (`:1203`) and records `initialSessionRestored = false`
   (`:576`).
2. `SessionSidebar`'s initial-restore effect (`SessionSidebar.tsx:1056-1084`) fetches
   `/api/sessions?sessionId=rich` and, in one callback, calls
   `setSelectedCwd(target.cwd)` **and** `onSelectSession(target, true)`.
3. `handleSelectSession(..., isRestore = true)` (`AppShell.tsx:763-810`) sets
   `selectedSession`, sets `initialSessionRestored = true`, arms
   `suppressCwdBumpRef.current = true` (`:806`) and does *not* rewrite the URL.
4. Independently, the sidebar's notify effect (`SessionSidebar.tsx:992-1000`, deps
   `[selectedCwd, onCwdChange, projectFor]`) reports the effective cwd through
   `onCwdChange` → `handleCwdChange` (`AppShell.tsx:683`).

`handleCwdChange` reads "a cwd arrived for a project we are not on" as a workspace
switch and, in that branch, clears the selection, bumps `sessionKey`, calls
`restoreWorkspaceContext(newProject, cwd)` and `router.replace(pathname)` — i.e. it
**drops `?session=` from the URL**.

`restoreWorkspaceContext` (`:637-675`) awaits the project's session list and then
selects `getLastOpenSession(projectKey)` and `router.replace('?session=' + that)`.
The persisted value is written by the persist effect (`:592`) whenever
`selectedSession` changes, so at the moment of a fresh page load it still holds the
**previous document's** last-open session.

### The race

Steps 2-3 and step 4 are ordered only by chance:

- Step 4 after step 3: `suppressCwdBumpRef` is already armed → `handleCwdChange`
  returns early → correct behaviour.
- Step 4 (or the project-list response inside `restoreWorkspaceContext`) ahead of
  step 3: the restore path selects the remembered session and rewrites the URL to
  `?session=e2e-ask-user-session`. `page.reload()` then reloads *that* URL and the
  rich session's `.markdown-code-block pre` never appears.

`suppressCwdBumpRef` cannot close the hole: it is a one-shot flag consumed by the
first non-null cwd report, and it is only armed *after* the URL session has been
adopted. Callers that report a cwd before that (e.g. the `selectedCwdProp` sync
effect `:1013-1018`, the worktree-resolution effect, a re-render that changes
`onCwdChange` identity) can therefore reach the destructive branch.

`e2e/ask-user.mjs` and `e2e/chat-appearance.mjs` share one fixture project, so the
remembered session of the project is guaranteed to be the *other* test's session —
which is why the failure shows up as "landed on the previous test's session".

## 2. Fix

Make the explicit URL session authoritative for exactly the window in which it is
being restored, and keep that decision in a pure helper:

```ts
// lib/session-restore.ts
export function canRestoreRememberedSession(input: {
  initialSessionRestored: boolean;
  hasUrlSession: boolean;
}): boolean {
  // While an explicit ?session= is still being resolved, it owns the selection:
  // restoring the remembered session here would replace the selection *and* rewrite
  // the URL, so a reload lands on the wrong session.
  if (!initialSessionRestored && hasUrlSession) return false;
  return true;
}
```

`handleCwdChange` consults it immediately before the destructive reset (after
`activeProjectKeyRef.current = newProject`, so project identity still syncs, and
after the existing early returns, so their behaviour is untouched):

```ts
const urlSessionId = new URLSearchParams(window.location.search).get("session");
if (!canRestoreRememberedSession({
  initialSessionRestored,
  hasUrlSession: urlSessionId !== null,
})) return;
```

Why this placement:

- `initialSessionRestored` is `true` whenever there is no `?session=` at all
  (`:576` initialiser), and becomes `true` as soon as the URL session is adopted
  (`:797`) or its restore fails (`:1024`). User-initiated project switches therefore
  keep the old behaviour (R3), and the `?cwd=` deep-link flow is unaffected (it has
  no `?session=`, and its `suppressCwdBumpRef` early return runs earlier).
- Reading `window.location.search` at call time (the same pattern the function
  already uses for `window.location.pathname`) sees the session param *before* the
  `router.replace(pathname)` on the next line strips it.
- Returning early leaves `activeProjectKeyRef` correctly updated and does not touch
  the selection, the URL or `sessionKey`: the pending restore then completes normally
  and selects the URL session.

## 3. Rejected alternatives

- **Reorder the two flows inside `SessionSidebar`** (always report cwd after
  `onSelectSession`): it would still be a race whenever the cwd report originates
  from a different effect (`selectedCwdProp` sync, worktree resolution), and it
  leaves `handleCwdChange`'s destructive branch reachable without any invariant.
- **Delete `suppressCwdBumpRef` and make `handleCwdChange` idempotent**: a larger
  rewrite of a load-bearing heuristic (its early returns encode worktree-key
  hydration rules), out of proportion to a P1 flake.
- **Skip the restore whenever the URL has a session** (without
  `initialSessionRestored`): would break the legitimate "switch project, then
  restore that project's last session" flow, because the stale `?session=` survives
  until `router.replace(pathname)` runs.
- **Guard inside `restoreWorkspaceContext` via the URL**: too late — by then
  `handleCwdChange` has already stripped the param, so the check always passes.

## 4. Verification strategy

1. **Forced-order repro (AC1)** — new `e2e/session-restore.mjs`, wired into
   `e2e/run.mjs`: seed a project with two sessions (reuse the ask-user fixture, which
   also proves the two tests share a project), remember session B (via the real UI
   selection), then `page.goto('?session=A')` with Playwright routing that delays
   `/api/sessions?sessionId=*` and lets `/api/sessions?projectKey=*` answer first,
   then assert the URL still names A and A's content is rendered. Run it before the
   fix to confirm it reproduces (a reproduction that fails to fail invalidates the
   mechanism in §1).
2. **Unit tests (AC2)** — `lib/session-restore.test.mjs` over the truth table.
3. **Suites (AC3/AC4)** — typecheck, lint, unit suite, and the full e2e suite in an
   isolated temp worktree (`PI_CODING_AGENT_DIR=<mktemp -d>`, idle port).
4. **Regression of R3 (AC5)** — the existing e2e checks for project switching,
   `?cwd=` deep links and the ask-user view must stay green in that same run.

## 5. Risks

- A guard that is too broad could stop project switches from restoring their
  remembered session; the truth-table unit test plus the e2e project-switch coverage
  are the guardrails.
- Playwright route delaying must target only the two list endpoints, otherwise the
  initial page load slows down and the test times out instead of reproducing.
