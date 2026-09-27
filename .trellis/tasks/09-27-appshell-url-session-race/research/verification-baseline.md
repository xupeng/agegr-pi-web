# Verification baseline — AppShell URL session restore race

Base commit: `ed3303f` (`personal` tip after PR #14). Branch:
`feat/appshell-url-session-race`.

## Gates

| Gate | Command | Result |
|------|---------|--------|
| Types | `node_modules/.bin/tsc --noEmit` | exit 0 |
| Lint | `npm run lint` / `eslint . -f json` | exit 0 / **525 files, 0 errors, 0 warnings** (baseline 522 → +3 new files) |
| Unit | `env -u NODE_PATH XDG_STATE_HOME= npm test` | **1522 pass / 0 fail / 10 suites** (baseline 1516 → +6) |

New unit tests (+6, itemised):

- `lib/session-restore.test.mjs` — 5 tests (URL param parsing, absent/empty param
  handling, and the three-row truth table of `canRestoreRememberedSession`).
- `components/AppShell.workspace-memory.test.mjs` — 1 new test that executes the
  **real** `handleCwdChange` source in a vm context and asserts an unresolved
  `?session=` blocks the restore: no `projectKey` fetch, no selection change, no
  `sessionKey` bump, while project identity still syncs; and that a resolved URL
  session no longer blocks a later project switch (R3).

## Two-sided end-to-end evidence

The bug is a race, so the fix is proven by a deterministic reproduction rather than
by the flaky test alone (`e2e/session-restore.mjs`, wired at `e2e/run.mjs:419`). All
runs below used the same harness, in a temp worktree at the same commit with only
`components/AppShell.tsx` swapped between the two variants.

| Run | AppShell | Result |
|-----|----------|--------|
| `race-prefix-1` | pre-fix (`ed3303f`) | **FAIL** at the new assertion: `actual: null, expected: 'e2e-rich-session'` — the URL lost the explicit session while the rich session was still on screen |
| `race-fixed-1` | fixed | **full suite green**, including `PASS: an explicit ?session= outranks the remembered workspace session`, `PASS: session reading offsets, collapsed process details, and cancelled branch restoration` and `PASS: chat appearance persistence, ...` (the test that was flaky in CI) |
| `race-fixed-2` | fixed | failed at the **pre-existing** pagination assertion `e2e/run.mjs:292` ("Missing, reordered, or duplicate chat messages") before the new check ran |
| `race-prefix-2` | pre-fix | **FAIL** at the new assertion again (`actual: null`), 2/2 — the reproduction is deterministic, and this run passed `run.mjs:292` |
| `race-fixed-3` | fixed | **full suite green** (13 PASS lines, no errors), 2/3 green overall |

Run 2 does not touch any code path changed by this task: its assertion runs at line
292, before the new check (line 419), in the first viewport, and compares the rendered
`E2E message NNNN` window after two IntersectionObserver-driven pagination turns.
That window is virtualised (`lib/chat-lazy-load.ts`), so the assertion races the
IntersectionObserver by construction: it compares the mounted window against the number
of older pages that were *fetched*. Attribution evidence: `race-prefix-2` passed line
292 on the unmodified AppShell, and the fixed variant passed it in runs 1 and 3 — the
failure in run 2 is not reproducible on either side. It is reported in the PR body as
pre-existing suite flakiness rather than silently dropped.

## Attribution of the earlier ref-based attempt (reverted)

An earlier version of the fix also replaced the `selectedSession` closure reads in
`handleCwdChange` with a render-time ref (to cover the post-adoption ordering) and
dropped `selectedSession` from its dependency array. It made
`PASS: session reading offsets, ...` fail **reproducibly** (two consecutive runs) at
`e2e/run.mjs:380`, while the predicate-only version passes it. The ref change is
therefore out of scope for this task and was reverted — the recorded failure is the
reason the shipped diff is limited to the guard predicate.

## Limitations

- `E2E_SERVER_MODE=dev` is mandatory in this checkout: an active dev server already
  holds `.next/dev/lock`, so the suite runs in a throwaway worktree with
  `PI_CODING_AGENT_DIR` pointing at a temp dir. `next build` was never run here.
- The full e2e suite is timing-sensitive by construction (pagination, scroll offsets,
  wrapper lifecycle). One green run plus one deterministic before/after assertion is
  the evidence this task can produce locally; CI re-runs the suite on the PR.
