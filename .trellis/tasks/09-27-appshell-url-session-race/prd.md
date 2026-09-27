# Fix AppShell URL session restore race

## Goal

A page load with an explicit `?session=<id>` must always open that session. Today
it can open the project's *remembered last-open* session instead, and rewrite the
URL to it, because `handleCwdChange`'s workspace-restore path runs before the
sidebar has resolved the URL session.

This is the root cause of the flaky gate that has been blocking every recent PR:
`e2e/chat-appearance.mjs:76` (`page.reload()` → wait for `.markdown-code-block pre`)
times out after the preceding `?session=e2e-rich-session` navigation silently lands
on `e2e-ask-user-session`. Last 7 `personal`-based runs: 5 red, 2 green, with a
byte-identical tree between passing and failing runs.

## Requirements

- **R1 — URL wins.** On first load, an explicit `?session=<id>` is authoritative:
  the remembered last-open session of that project must never be selected in its
  place, regardless of which network response returns first.
- **R2 — URL is not rewritten during the restore.** While the initial `?session=`
  restore is pending, no code path may `router.replace` the URL to a different
  session id.
- **R3 — No regression of the legitimate paths.**
  - Switching projects in the sidebar *after* the initial restore keeps restoring
    that project's remembered session.
  - `?cwd=` deep links keep suppressing the chat remount during the initial sync.
  - A `?session=` that no longer exists still falls back to the most recent
    project, and `?session=` for another project still opens it.
  - Same-project worktree switches keep the open session.
- **R4 — Decision logic is unit-testable.** The new "may this cwd change replace the
  selection with the remembered session?" decision lives in a pure
  `lib/*.ts` helper with a `node:test` `*.test.mjs`, not as an untestable inline
  condition.
- **R5 — Deterministic reproduction.** The bug is a race, so the regression test must
  not depend on timing luck: it must force the losing order (the project-list
  response ahead of the single-session lookup) and assert the URL and the rendered
  session. A timing-dependent test is not acceptable evidence.

## Constraints

- No new dependencies (no jsdom / testing-library). Component-level assertions stay
  source-regex based; behaviour is proven by the e2e harness.
- Never run `next build` in this checkout, and do not start a second dev server here
  (an active dev server already holds `.next/dev/lock`): e2e runs in a temp worktree.
- `?session=` restore must stay a client-side concern; do not change the sessions
  API shape or the SDK.

## Acceptance Criteria

- [ ] AC1 Forced-order harness fails before the fix and passes after it: the page
      stays on `?session=<rich>` and the rich session renders (no navigation to the
      remembered session).
- [ ] AC2 Unit tests cover the predicate: pending restore + URL session → do not
      restore; pending restore without URL session → restore; resolved restore + URL
      session (user-initiated project switch) → restore.
- [ ] AC3 `node_modules/.bin/tsc --noEmit`, `npm run lint` and
      `env -u NODE_PATH XDG_STATE_HOME= npm test` are green, with the unit-suite
      count reconciled against the baseline.
- [ ] AC4 The e2e suite passes locally in a temp worktree, including
      `e2e/chat-appearance.mjs` and the new forced-order check.
- [ ] AC5 R3 paths are covered by existing e2e assertions (project switch, `?cwd=`,
      missing session) and stay green.
- [ ] AC6 The invariant is recorded where the next session will read it: a note in
      `AGENTS.md`'s AppShell/URL-restore area and the frontend spec.

## Notes

- Evidence trail for the flake: PR #12 comment (issuecomment-5847355198), PR #13
  comment (issuecomment-5850541487), PR #14 body,
  `.trellis/tasks/archive/2026-09/09-19-append-system-editor/research/verification-baseline.md`.
- The fix is deliberately narrow: make the URL authoritative for the window in which
  its restore is pending, instead of reordering the two flows.
