# Make the e2e history assertion deterministic

## Goal

`e2e/run.mjs:292` ("Missing, reordered, or duplicate chat messages") fails
intermittently with a message set that is a strict suffix of the expected one, i.e.
the rendered window is *behind* what the two pagination turns loaded. It is a test
timing bug, not an app bug: `components/ChatWindow.tsx:669-672` guarantees the render
window grows to cover everything loaded, but that guarantee is realised through an
effect, and the assertion reads the DOM before the flush.

Recorded occurrence (unmodified assertion, unchanged app code, local nested run):
`/tmp/race-fixed-run2.log` — one failure in four runs, missing 16 of the expected
messages at the *top* of the window, which is exactly the pre-flush state.

A second, independent timing bug lives in the same section and was found while
verifying the first one: the pagination loop fires a single instant `scrollIntoView`
on the sentinel, whose `IntersectionObserver` is installed by an effect. On a cold dev
server the scroll lands before the app is listening, no `/context?before=` request is
ever made, and the run dies 30 s later at `e2e/run.mjs:250` (`waitForResponse`).
Observed once, immediately after `rm -rf .next`-equivalent cold start; the run's
`server.log` contains no `before=` request at all.

## Requirements

- **R1 — Same strength.** The assertion must still fail on missing, reordered or
  duplicated messages across the whole loaded range; do not weaken it to a subset or a
  count check.
- **R2 — Deterministic.** It must wait for the invariant the app actually guarantees
  (render window ≥ loaded messages) instead of assuming the flush already happened.
- **R3 — Self-documenting.** The reason for the wait must be visible in the test, with
  a pointer to the app code that guarantees it, so it is not "fixed" back later.
- **R4 — Diagnostics.** When the waiting step actually had to wait, the run should say
  so; that log line is the evidence that the wait is load-bearing rather than
  decorative.
- **R5 — No app change.** `ChatWindow`'s windowing behaviour is intentional; the fix
  belongs to the test harness only.
- **R6 — Do not assume the app is listening.** The pagination trigger must keep
  retrying until the fetch actually starts, without ever causing a duplicate page
  request (the loop asserts the fetched `before` cursors form one descending series).

## Acceptance Criteria

- [ ] AC1 The assertion waits for the loaded range to be rendered before comparing,
      and still performs the exact `deepEqual` on the full expected range.
- [ ] AC2 A failing run is no longer reproducible: at least two consecutive full e2e
      runs pass the history section, and any run where the wait had to wait prints the
      catch-up diagnostic.
- [ ] AC3 The diagnostic fires at least once across those runs, proving the race was
      real and is now covered (if it never fires, say so explicitly in the evidence and
      keep the wait as insurance).
- [ ] AC4 `env -u NODE_PATH XDG_STATE_HOME= npm test`, `tsc --noEmit` and
      `npm run lint` stay green (the change is e2e-only, so no unit delta is expected).
- [ ] AC5 The evidence file records the pre-fix failure (log excerpt) and the post-fix
      runs, and the PR body links them.
- [ ] AC6 Both races are covered: the retried trigger makes a cold-start run (`.next`
      removed) pass the history section, and the recorded warm runs keep passing.

## Notes

- Found while verifying `09-27-appshell-url-session-race` (PR #15); deliberately kept
  out of that PR so the race fix stayed a single-purpose change.
- The failing job of PR #15's CI never hit it, but the same assertion aborted the
  second local verification run, which is why it is being fixed now.
