# Parity fix found by the check pass: the locked per-question submitted summary

## How it surfaced

Deleting `components/AskUserCard.test.mjs` removed the only tests covering four
behaviours that were supposed to survive in the app view: the submit lock, the
per-question submitted summary, the supplement box, and the single/multiple
custom-text rules. Only the layout assertion was relocated, so the check pass
flagged the loss. Writing the replacement tests in
`lib/ask-user/mcp-view-html.test.mjs` (they execute the real inline script on a
minimal DOM shim) turned one of them into a failure:

```
AssertionError: locked summaries must be visible
  actual: false
  expected: true
```

## Root cause

`refresh()` is what sets each question's summary
(`✓ <values> · <otherText>`, `display: block` only while `locked`). It ran from
`toggleOption()`, `setOtherText()` and the end of `render()`, but `submit()` and
`cancel()` only called `refreshControls()`. So after locking, the footer showed
`✓ Submitted — delivering your answers…` while every per-question summary stayed
`display: none`.

The card rendered both, so this was a real parity gap between the deleted host
card and the view that replaced it. It stayed invisible in practice because a
successful submit closes the ask and unmounts the host almost immediately; it
only shows while a close is slow or lost.

## Fix

`refresh()` is now called when the view locks (`submit`, `cancel`) and again when
a rejected action unlocks it, so the summary appears on lock and disappears when
the user goes back to editing. The inline script changed, so the pinned digest
changed with it:

```
sha256-80CsvagnTBsAh+wwgCwpg/Z+oFnznM2qIjYyVu0ETVs=   (before)
sha256-EloPp3UqP8tNk0CrG66KQct2N5q/++zefT8I+tJbPvU=   (after)
```

Updated in both places (`ASK_USER_VIEW_SCRIPT_HASH` and the CSP meta tag);
`components/AskUserAppHost.test.mjs` recomputes the digest from the script body,
so a mismatch fails the suite.

## Evidence

Shim tests (`lib/ask-user/mcp-view-html.test.mjs`, 4 added): submit lock +
summary, cancel lock, supplement forwarding (absent when blank), multiple/single
custom-text rules and the `ask_submit` payload.

End-to-end in Chromium without touching the real ask: a synthetic parent mounts
the built-in document produced by `ASK_USER_VIEW_HTML` in a
`sandbox="allow-scripts"` `srcdoc` frame and performs the same handshake
(`ui/initialize` response, `tool-input`, `tool-result`), replying to the view's
`tools/call` itself. After clicking an option, a multiple-choice option, typing a
custom answer and submitting:

```
frame text: … ◉ Yes | ○ No | ✓ yes | ☑ Europe | ✓ eu · typed text |
            ✓ | Submitted — delivering your answers…
disabled buttons 3/3, disabled inputs 2/2
posted tools/call: ask_submit {sessionId:"s1",askId:"a1",
  answers:[{id:"q1",values:["yes"]},{id:"q2",values:["eu"],otherText:"typed text"}]}
console errors: none (the CSP hash admits the edited script)
iframe.contentDocument from the parent: null (opaque origin intact)
```

Also from the check pass: the `loading` placeholder got `role="status"` (an
`aria-label` on a generic element is not exposed; `component-guidelines.md`
prescribes `role="status"`/`role="alert"` for async state).

## Residual

- Firefox/Safari remain unverified (accepted, documented in the spec).
- Keyboard/visual/a11y polish of the view is still deferred to the follow-up
  task named in `prd.md`; this change is limited to behaviour parity.
