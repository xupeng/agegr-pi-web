# Design: the app-delivered view becomes the only ask_user UI

## Boundary

Three host jobs remain for `ask_user`; everything else lives in the app resource.

| Layer | Owner after this change |
| --- | --- |
| Ask lifecycle: durable `askId`, validation, submit/cancel, stale/supersede, model wake-up, persistence | host (`lib/ask-user/**`, `lib/rpc-manager.ts`) — unchanged |
| Presentation: questions, options, custom text, supplement, submit lock, pending/error rendering inside the view | the app resource `ui://pi-web/ask-user.html` only |
| Sandbox, bridge, authorization: opaque-origin `srcdoc`, postMessage admission, session/ask-scoped action allowlist, context passing, size negotiation, degraded state | host (`components/AskUserAppHost.tsx`) |

`components/AskUserCard.tsx` is deleted: the host no longer draws a form for this
tool.

## States

`AskUserAppHost` has exactly three visible states, marked on the DOM so a person
and a browser test can tell them apart:

| State | `data-ask-user-view` | What the user sees |
| --- | --- | --- |
| Loading | `loading` | A compact placeholder while the projection and handshake complete (normally well under a second). The iframe is mounted but off-screen, because the handshake needs it in the DOM; it must not flash at zero height. |
| Apps | `apps` | The app view, revealed once `ui/notifications/size-changed` arrives *after* tool-result. |
| Failed | `failed` | The degraded state below. |

Removed: the `native` and `apps-pending` markers, the
`showApps ? null : <AskUserCard>` branch, the `cardSlotRef` focus guard (it
existed only to avoid replacing the card under a user already typing in it), and
`APPS_DISABLED` with its `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS` read.

## Degraded state (decided: error + read-only questions)

Triggered by a projection fetch rejection or non-OK status, an invalid projection
(wrong session/ask ids, URI or MIME mismatch, html that is not the built-in
document), or the 6 s handshake timeout.

Content, top to bottom:

1. A short error line — i18n `chat.askUserAppFailed`.
2. One sentence of consequence and recovery: the question is still open, retry,
   reload, or answer from another device — i18n `chat.askUserAppFailedHint`.
3. A **read-only** list of the questions rendered from `props.ask.questions` (the
   client-side pending ask), **not** from the failed projection: question text,
   optional detail, options as plain text, and a multi-select hint when
   `multiple` is true. No inputs, no per-question controls.
4. Exactly one interactive control: retry — i18n `chat.askUserAppFailedRetry` —
   which bumps a `reloadKey` state that the projection effect depends on, so the
   fetch and handshake run again without a reload.

Rules:

- No form control of any kind other than retry. The state cannot answer, submit
  or cancel an ask.
- Text nodes only; React escapes them. No `dangerouslySetInnerHTML`.
- Bounded by construction: `ask.questions` was validated when the ask opened
  (≤20 questions, ≤12 options each, ids ≤128, text ≤1000).
- The ask stays open, so the existing 3 s `/api/sessions/[id]/state`
  reconciliation still applies: an ask closed or superseded elsewhere clears or
  replaces this state, and an `askId` change remounts the host (`key`).

Why `props.ask` is the source: the projection can fail exactly when we need to
say what was asked, while the pending ask is already client state. A `404` from
`/ask-view` therefore still renders the questions; if the ask really was closed
elsewhere, the state poll removes the host within a few seconds.

## Contract kept

- `srcDoc` with `sandbox="allow-scripts"`, no `allow-same-origin`, no `src`, no
  `allow-forms/popups/downloads/modals`.
- Message admission byte-for-byte in behaviour: `event.source ===
  iframeRef.current.contentWindow` first, then `event.origin === "null"`; the
  payload gated on the current projection; only `ask_submit`/`ask_cancel` for the
  current session and ask; a callback returning `undefined` is reported as an
  error, never as success.
- The view document is unchanged: fixed built-in document, inlined script,
  `script-src 'sha256-…'`, `connect-src 'none'`. Its test keeps recomputing the
  hash from the actual script body.
- Labels, theme, font size offset and font stack still travel in
  `structuredContent`.

## Deletions and their fallout

- `components/AskUserCard.tsx`, `components/AskUserCard.test.mjs`.
- `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS` in `next.config.ts` and the host.
- `components/ChatWindow.ask-user-layout.test.mjs` reads `AskUserCard.tsx` for
  its last assertion (no `maxHeight`, no inner scroll). Keep that layout contract
  by asserting it against the host container instead, so the coverage is
  relocated rather than dropped.
- `hooks/useAgentSession.pending-ask.test.mjs` mentions the card in a comment
  only; update the wording.

## Compatibility and rollout

- No server-side, tool-contract, store or persistence change. An ask opened
  before the upgrade renders in the app view after a reload.
- Merge gate: Chromium desktop and a mobile viewport (decided). Firefox/Safari
  stay unverified and would show the degraded state; the residual risk is
  recorded in the PRD and the PR body.
- Rollback: one revert restores the card and the flag; no data migration is
  involved.

## Risks

- The degraded state is now the only non-view path, so its copy must not promise
  more than it delivers ("still open — retry, reload, or answer elsewhere").
- With JS disabled no ask presentation is rendered at all (the pending ask is
  loaded into client state first), and a CSP-blocked view script lands in
  `failed` after the 6 s handshake timeout. That is accepted and documented
  rather than papered over.
- Any regression that breaks the view is now visible as a failed state instead
  of a fallback form, which is why deeper view polish is queued as its own task.
