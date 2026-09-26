# Make the MCP Apps view the only ask_user presentation

## Goal

Make the app-delivered `ui://pi-web/ask-user.html` document the **only** `ask_user`
presentation. Delete the host-rendered React card (`components/AskUserCard.tsx`)
so the host keeps exactly three jobs for this tool: sandbox (opaque-origin
`srcdoc`), protocol bridge (postMessage ↔ host state), and authorization
(session/ask-scoped `ask_submit`/`ask_cancel`).

## What MCP Apps does and does not define

Settled with the developer before writing this PRD, because it determines the
whole scope:

- MCP Apps (`2026-01-26`) defines **plumbing, not visuals**: tool metadata
  `_meta.ui.resourceUri`, the `ui://` HTML resource, the sandboxed iframe, the
  `ui/initialize` / `initialized` / `tool-input` / `tool-result` / `tools/call` /
  `size-changed` exchange, host-side context passing, and host-side action
  authorization. The HTML/CSS/JS itself is the **app's** to write and is not
  specified.
- Therefore a host-rendered React card is **not** an Apps view. It is the host
  hard-coding a UI for one tool — the pattern Apps exists to replace. The
  distinction is not who authored the code (the same repository owns both) but
  where the view comes from and where it runs: an app-delivered resource in a
  sandbox, reachable only over postMessage, versus a host component with direct
  access to host state.
- "Fully migrate" therefore means: the presentation layer moves into the app
  resource and the host stops drawing ask_user UI. It does **not** move the ask
  lifecycle — durable `askId`, submit/cancel, stale/supersede, model wake-up and
  server-side validation authority are host-owned and stay that way.
- What the host shows when the view cannot load is **host policy**, not protocol.
  Decided below.

## Background

- The previous task (`09-26-ask-user-mcp-migration`, archived) added the app-only
  MCP projection, the sandboxed `srcdoc` host and the app-authored view, while
  deliberately keeping `AskUserCard` as a fallback. It is still reachable when
  the projection fetch fails, the 6 s handshake times out, focus is already in
  the card, or `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS=0`.
- `AskUserCard` has exactly one product reference: `components/AskUserAppHost.tsx`
  (import at line 14, render at line 394). `components/ChatWindow.tsx` renders
  `AskUserAppHost`, not the card.
- The two views are visually near-identical on purpose, which is why the host
  currently tags `data-ask-user-view` (`native` / `apps-pending` / `apps`).
- Strategic payoff: once the card is gone, the ask UI ships as a resource. Any
  host that implements the same narrow contract (projection shape plus the two
  action names) can render it, which is what makes the PA line reusable later.
  Honest limit: the projection fields (`labels`, `theme`, `fontFamily`,
  `fontSizeOffsetPx`) and the action names are **our** convention, not protocol.

## Requirements

- One renderer. After this task, `ask_user` is drawn only by the app-delivered
  view; no host-side component draws the questions, options, custom text or
  supplement for this tool.
- The sandbox and authorization invariants from the previous task are unchanged:
  opaque-origin `srcdoc` with `sandbox="allow-scripts"` and no
  `allow-same-origin`; source-first message admission with `event.origin ===
  "null"`; only `ask_submit`/`ask_cancel`, only for the current session and ask;
  server-side validation remains authoritative.
- The degraded path is **decided, not incidental**: when the projection is
  non-OK, malformed or not the built-in document, or when the 6 s handshake
  times out, the host renders (a) a short error line, (b) a recovery hint, (c) a
  **read-only** list of the questions taken from the client-side pending ask,
  and (d) a single retry control. That state offers no way to answer, submit or
  cancel, and it must never read as "your question was lost".
- No Cargo-cult deletion: every path that currently relies on the card must be
  given an explicit, intentional behaviour.
- A failed view must never lose the ask. The ask stays open and answerable after
  a reload, from another device, or once the underlying problem is fixed.
- No action, answer or error state may grant write permission; the view still
  cannot reach host DOM, storage, credentials or arbitrary tools.
- The real off switches stay: the `askUser` setting and `PI_WEB_ASK_USER` disable
  the tool itself. `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS` is removed — with a single
  renderer it has no meaning.
- The enable/reload behaviour of the `ask_user` feature is unaffected.

## Acceptance Criteria

- [ ] `components/AskUserCard.tsx` and `components/AskUserCard.test.mjs` are
      deleted, and no product code references a host-rendered ask form.
- [ ] `AskUserAppHost` (or its replacement) contains no branch that draws
      questions, options or answer inputs itself.
- [ ] The failure state is explicit and tested for each trigger: projection
      non-OK, malformed projection, non-builtin html and handshake timeout. It
      shows the error, the hint and the read-only questions, contains no input
      and no other control besides retry, and the ask is still open and
      answerable afterwards (verified by reloading and answering).
- [ ] `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS` no longer appears anywhere in the repo.
- [ ] `data-ask-user-view` marks the three real states (`loading` / `apps` /
      `failed`) and `.trellis/spec/frontend/ask-user-protocol.md` documents them.
- [ ] Browser verification on the agreed matrix: Chromium at 1280×900 and a
      390×844 mobile viewport, covering submit, cancel, partial answers, custom
      text, supplement, and the failure state including a successful retry.
- [ ] `node_modules/.bin/tsc --noEmit`, `npm run lint` and `npm test` pass.
- [ ] No change to the Pi tool contract, prompt guidance, ask store, persistence
      or answer delivery semantics.
- [ ] The residual Firefox/Safari risk is written into the PRD and the PR body.

## Decisions (settled 2026-09-26)

1. **Failure state**: error + read-only list of the questions, plus retry
   (chosen over "error only", "free-text answering" and "keep the card for now").
2. **Browser gate**: Chromium plus a mobile viewport is the merge gate; no
   Firefox download. Residual risk is documented instead of tested.
3. **Kill switch**: delete `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS`. The `askUser`
   setting and `PI_WEB_ASK_USER` remain the real off switches.
4. **View scope**: parity only — the view already implements options,
   multi-select, custom text, supplement, partial answers and the submit lock.
   Visual, keyboard and accessibility polish becomes its own follow-up task,
   which matters because after this change the view is the only ask UI.
5. **Scope**: Pi Web only. PA keeps its own card and is a separate task.
6. **`data-ask-user-view`**: keep it, reduced to the three states that still mean
   something (`loading` / `apps` / `failed`). It is the only way a person or a
   test can tell "the app view rendered" from "the host fell back".

## Out of scope

- PA, its card and its host bridge; MCP elicitation; a general-purpose Apps host
  for third-party tools.
- Making the view's projection/action contract a portable, host-neutral package
  (the natural follow-up, not this task).
- npm publication and any broad SDK or protocol compatibility claim.

## Risks and deferred work

- Deleting the only host-side renderer removes the last resort when the view
  cannot run (JS disabled, blocked inline script, a future CSP regression). The
  failure state must therefore stay reachable, honest and retryable.
- Firefox and Safari remain unverified by decision; there, a failure shows the
  error state rather than a question form.
- The view is not yet a host-neutral artifact: it depends on host-supplied labels,
  theme and font values and on our two action names. Portability improves, but
  only within hosts that implement that narrow contract.
- After this change, any visual defect in the view is the only thing users see,
  which is why view polish should follow soon as its own task.
