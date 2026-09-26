# Check notes (2026-09-26)

Reviewer: trellis-check on `feat/ask-user-mcp-apps`. No commit. No `next build`, no `next dev`, no live model call. Did not touch `personal-assistant` or `.trellis/tasks/09-25-ask-user-cross-host-prototype`.

This is not a product browser screenshot. The Chromium probes below load the static relay and view scripts from a throwaway HTTP server. They do not open the Next.js app, so they do not prove desktop/mobile product layout.

## Defects fixed

1. **srcdoc handshake target.** Inside an `allow-scripts allow-same-origin` `about:srcdoc` frame, Chromium reports `location.origin === "null"` and `postMessage` throws `Invalid target origin 'null'`. Messages the frame does send still have `event.origin` equal to the relay origin, and `location.ancestorOrigins[0]` is that origin. The view therefore must not target `location.origin`. The current `public/ask-user-view.js` reads `window.parent.location.origin` (readable because the inner frame is same-origin with the relay) and falls back to `"*"`. A probe of the real relay + view scripts completed `ready` → `ui/initialize` → `ui/notifications/initialized` → `ui/notifications/size-changed`, including when the outer iframe was offscreen (`position:fixed; left:-10000px`).

2. **Unauthenticated sandbox could mount arbitrary HTML.** `GET /ask-user-sandbox` is outside the `proxy.ts` matcher on purpose and has no session cookie. The relay previously srcdoc'd whatever HTML the opposite-loopback parent posted. It now mounts HTML only when the string is exactly `ASK_USER_VIEW_HTML` (duplicated in `public/ask-user-relay.js` and checked by `isBuiltinAskUserViewHtml`). Anything else gets `ui/notifications/sandbox-resource-rejected` and is not forwarded into a view. A Chromium probe confirmed `<script>alert(1)</script>` was rejected. The host also refuses a projection whose `html` is not that document, and whose `uri` / `structuredContent.sessionId` / `askId` do not match the current ask. The route returns 404 unless the `Host` header is `localhost` or `127.0.0.1`, so a LAN page cannot load the relay document. `frame-ancestors` stays a loopback port wildcard and does not reflect `Host`; the postMessage check is same-port opposite hostname. The route still ignores the query string and sets no cookie.

3. **View submit/cancel was reported accepted before the server answered.** `ChatWindow` passed `void submitAsk(...)`, so `AskUserAppHost` saw `undefined` and resolved immediately. `submitAsk` / `cancelAsk` also swallowed command errors. A rejected validation (ask left open) therefore locked the Apps view as submitted. ChatWindow now returns the command promise; the hook rethrows after logging; the host sends a tool error unless that promise resolves. The native card catches the rejection and stays locked, matching its existing "do not reopen a close whose response was lost" contract. Server `PendingAskStore` validation is unchanged and still authoritative.

4. **Blank iframe replaced the usable card before the handshake finished.** The card now stays mounted until the view reports `size-changed` after tool-result. Fetch/handshake failure, resource rejection, or a 6s timeout keeps the card. If focus is already inside the card when the view becomes ready, the host does not swap it away, so an in-progress draft is not dropped. `key={pendingAsk.askId}` is unchanged.

5. **New view string.** `chat.askUserActionFailed` was added to `en`, `zh-CN`, and `zh-TW`. The host passes it with the other `chat.askUser*` labels. View font sizes are rewritten to `calc(Npx + var(--chat-font-size-offset, 0px))`; the host sends a sanitized `--chat-content-font-size` offset because the cross-origin iframe cannot read the host variable.

## Boundaries that held

- No `@modelcontextprotocol` import in `components/AskUserAppHost.tsx`. The client imports only the HTML allowlist helper.
- No generic MCP endpoint. `GET /api/agent/[id]/ask-view` remains the authenticated projection. `project_ask_user` still only returns the already-open ask.
- Host tool calls are still only `ask_submit` and `ask_cancel`, and only when `args.sessionId` / `args.askId` match the current ask. The callbacks are invoked with the React ask id, not a view-supplied id. Answer and supplement lengths are clamped to the shared limits before the command is sent; the store still rejects a bad submission and leaves the ask open.
- Stale close handling remains `resolvePendingAskAfterClose`. A superseded ask still remounts the host via `pendingAsk.askId`.

## Commands

Dependency tree: existing checkout `node_modules` from `package-lock.json`. Not a fresh `npm ci`, so this is not a clean-install lint baseline.

- `node_modules/.bin/tsc --noEmit` — exit 0, no diagnostics.
- `npm run lint` (`eslint .`) — exit 0, no error or warning lines.
- `NODE_PATH= XDG_STATE_HOME= node --experimental-strip-types --test` on `components/AskUserAppHost.test.mjs`, `components/AskUserCard.test.mjs`, `components/ChatWindow.ask-user-layout.test.mjs`, `hooks/useAgentSession.pending-ask*.test.mjs`, `lib/ask-user/**/*.test.mjs`, `lib/i18n/registry.test.mjs` — **103 pass / 0 fail**.
- `git diff --check` — no whitespace errors.
- Isolated Chromium probe (not the product app): real `public/ask-user-relay.js` + `public/ask-user-view.js` on `127.0.0.1` / `localhost`, handshake completed, malicious HTML rejected. No product screenshot was taken.

## Not run

- `npm test` full suite.
- `next build`, `next dev`, Playwright against the Pi Web dev server, desktop/mobile product screenshots.
- A real model conversation.

## Opaque-origin refactor check (2026-09-26)

Scope: the change that replaced the opposite-loopback relay with a single
opaque-origin `srcdoc` view (`research/opaque-sandbox-probe.md`,
`design.md` "Superseded: opaque-origin view replaces the loopback relay").

Two delegated `trellis-check` runs on this refactor returned no text output and
left no changes and no notes, so this section records a main-session review plus
the automated evidence. Treat the delegated pass as **not performed**.

### Evidence collected

- `node_modules/.bin/tsc --noEmit` → exit 0.
- `npm run lint` → `ESLint: No issues found`.
- Focused suite (AskUserAppHost, AskUserCard, ChatWindow ask layout,
  `useAgentSession.pending-ask*`, `lib/ask-user/**`, i18n registry) → **103 pass /
  0 fail**.
- `git grep` for `ask-user-relay`, `ask-user-sandbox`, `sandbox-origin`,
  `decideAskUserView`, `oppositeLoopback`, `ASK_USER_VIEW_SCRIPT_PATH` → no hits.
- The pinned `ASK_USER_VIEW_SCRIPT_HASH` was recomputed with an independent
  `node -e` script against the `String.raw` script body in
  `lib/ask-user/mcp-view-html.ts`: both are
  `sha256-5o9IZLMP6ab0fSlSiP9Fm+e/QXKKp+yMHgHSuANAOrQ=`. The inlined script contains
  no `</script`, no backtick and no `${`, so it cannot break out of the element or
  the template literal.
- Real product run in Chromium at `http://192.168.11.233:8505` (LAN origin, dev
  server started for this verification), driven through a persisted open ask so
  no model call was needed:
  - one `<iframe sandbox="allow-scripts" srcdoc>` with no `src`;
  - the native `AskUserCard` was not rendered, and the iframe height followed
    `ui/notifications/size-changed`;
  - inside the frame `document.cookie`, `localStorage` and
    `window.parent.document` each raised `SecurityError`, and
    `location.origin` was `"null"`;
  - clicking an option then Submit produced a real `ask_submit` command
    (`askId` and `answers` matched the injected ask) and the iframe was removed
    after the close response;
  - a 390×844 viewport rendered the same card; no console errors.

### Review findings

- Message acceptance order in `components/AskUserAppHost.tsx` is
  `event.source !== contentWindow` first, then `event.origin !== "null"`. Window
  identity cannot be spoofed, and the payload is gated on `payloadRef`, so a
  message from a stale or replaced iframe cannot be processed.
- The listener effect has empty deps and is attached on mount, before the
  `srcdoc` document exists, so the view's `id: 0` `ui/initialize` cannot be lost;
  callbacks and identity are read through refs.
- `settle()` still rejects an action whose callback returns `undefined`, the
  answer/supplement clamping is unchanged, and only `ask_submit` / `ask_cancel`
  reach the callbacks, keyed to the current `sessionId`/`askId`.
- The native card stays mounted until `size-changed` arrives after tool-result,
  and a 6 s timeout, invalid projection, rejected resource or the
  `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS=0` kill switch keeps it.
- No remaining code assumed a loopback parent or a parent-page CSP
  (`srcdoc` inherits an empty policy here, so the view's own meta CSP governs).

### Not verified

- Firefox and Safari. Only Chromium was used, as in
  `research/opaque-sandbox-probe.md`.
- The Kill-switch / invalid-projection fallback paths were exercised by unit
  tests, not by a browser run.

## Final check (2026-09-26)

Reviewer: trellis-check, third attempt (the two delegated checks recorded above
returned no output; treat those as not performed). Read `prd.md`, `design.md`,
`research/opaque-sandbox-probe.md`, this file and
`.trellis/spec/frontend/ask-user-protocol.md`, then reviewed the committed
opaque-origin implementation on `feat/ask-user-mcp-apps`. No commit, no
`next build`, no dev-server restart, no real model call. Did not touch the fonts,
`personal-assistant` or `.trellis/tasks/09-25-*`.

### Defects found and fixed

1. **A rejected ask action left the Apps view with no controls.** In the inlined
   view script, `submit()` / `cancel()` unlocked on a `<tool call>.catch` and
   called `refreshControls()` (which rebuilds the hint + Submit/Cancel buttons)
   and then `fail(error)`, which did `footerEl.textContent = ""` and replaced the
   whole footer with the error. Since the native card is unmounted as soon as the
   view is shown, a server rejection, a network error, or a non-confirming
   callback left the user on a dead, buttonless view that could only be recovered
   by reloading — contradicting `chat.askUserActionFailed` ("You can try again.")
   and the deliberate unlock. Fixed in `lib/ask-user/mcp-view-html.ts`: `fail()`
   now records `footerError` and re-renders through `refreshControls()`, which
   keeps the hint and both buttons and appends the error on its own row; retry
   clears the error; the footer is `flex-wrap:wrap` so the error wraps below the
   controls. Verified with a throwaway DOM-shim run of the real script (before:
   `submit`/`cancel` gone after a rejection; after: error shown and both buttons
   present), now pinned by `lib/ask-user/mcp-view-html.test.mjs`.

2. **A question id that collides with `Object.prototype` crashed the view.**
   `drafts` was a plain `{}`, so `draftFor("__proto__")` (or `constructor`,
   `toString`, …) returned an `Object.prototype` member and `draft.values.length`
   threw. `PendingAskStore` only bounds ids by length, so a model-supplied
   `id: "__proto__"` reaches the projection and made `render()` throw before
   `size-changed`, silently degrading every such ask to the native card after the
   6 s timeout. Same class in `pending` for a maliciously shaped host response
   id. Fixed with `Object.create(null)` for both maps, at declaration and in
   `render()`'s reset. Pinned by `lib/ask-user/mcp-view-html.test.mjs`.

The hash in `ASK_USER_VIEW_SCRIPT_HASH` and the meta CSP were recomputed after
the script edit (`sha256-80CsvagnTBsAh+wwgCwpg/Z+oFnznM2qIjYyVu0ETVs=`); the
existing hash test recomputes it independently and agrees.

### Acceptance-criterion 3 coverage: what is actually covered, and what is not

Covered (reviewed, no change needed):

- Empty/duplicate/oversized question sets, unknown/duplicate/option-mismatched/
  single-conflict/over-long answers, partial answers, custom text, supplement
  recording/trim/over-long, supersede with `unansweredIds`, stale submit/cancel,
  cancel/cancelOpen, restore — `lib/ask-user/store.test.mjs`.
- Wrong tool name, wrong `ui://` URI, model-visible tool rejection, bounded
  projection clamping, app-only `_meta.ui` — `lib/ask-user/mcp-app-adapter.test.mjs`.
- Ask-swap keying and the returned submit promise — `hooks/useAgentSession.pending-ask*.test.mjs`
  and `components/AskUserAppHost.test.mjs`.

Gaps found (named with the file that should hold the test):

- **No runtime test ever exercised `AskUserAppHost`'s message handler.** All of
  `components/AskUserAppHost.test.mjs` is source-regex. The host's rejection of a
  missing/malicious view action (non-allowlisted tool, stale `sessionId`/`askId`,
  malformed `answers`, oversized supplement) and the "Apps loading failure" path
  (fetch reject, invalid projection, 6 s timeout) were only asserted at the
  string level. I added two source-pinning tests for those admission checks, but
  a real regression test needs a DOM harness the repo does not have (no
  jsdom/happy-dom/testing-library; Playwright is e2e-only). If one is added, this
  file is where the host handler tests belong.
- **No runtime test exercised the view script.** The submit-rejection bug and the
  prototype-key bug above were invisible to every automated check. Partially
  closed by the new `lib/ask-user/mcp-view-html.test.mjs`, which runs the real
  inline script against a small DOM shim and covers: normal render + only
  `ask_submit`/`ask_cancel`, error-keeps-controls, prototype-colliding question
  ids, prototype-colliding host response ids, and a host that omits
  `labels`/`theme`/`fontSizeOffsetPx`/`fontFamily`. It does not load a browser, so
  CSP enforcement and real iframe sandbox behaviour remain browser-only.
- **"Unsupported capabilities"** is only inferred from the projection-version
  check; there is no test of an explicit capability/version mismatch beyond the
  `appsProtocolVersion` regex now pinned.
- Firefox/Safari remain unverified, as recorded above.

### Priority 2 — `AskUserAppHost.tsx` lifecycle

No further defect found.

- The `message` listener effect has empty deps and attaches on mount, long before
  the fetch can `setApps(payload)`, so the view's `id: 0` `ui/initialize` cannot
  race a later mount.
- Acceptance order is `event.source !== contentWindow` first, then
  `event.origin !== "null"`; the payload is additionally gated on `payloadRef`,
  so a message from a stale/replaced iframe is dropped.
- A stale `askId` cannot reach `onSubmit`/`onCancel`: `ChatWindow` keys the host
  by `pendingAsk.askId` (remount per ask), `handleToolCall` compares against the
  live `sessionIdRef`/`askIdRef`, and the callbacks are invoked with the live
  `currentAskId`, never the view-supplied id.
- The `native` / `apps-pending` / `apps` markers describe the committed state:
  the native wrapper is rendered exactly when `showApps` is false, and the iframe
  wrapper is `apps` only after `size-changed` has arrived after tool-result.
- The 6 s fetch timer aborts + `setFailed(true)`, and the 6 s handshake timer
  arms only once a projection exists and is cleared by `revealApps`; the focus
  guard keeps the native card (and its draft) when the user already focused it.

### Priority 3 — `app/api/agent/[id]/ask-view/route.ts`

No defect found.

- Auth/CSRF admission is the existing `proxy.ts` matcher `/api/:path*`
  (`isApiRequestAllowed`: host allowlist + `sec-fetch-site`/`Origin` check), the
  same as every other API route.
- A live session short-circuits to `session.pendingAsk`, so a closed ask in a
  live session cannot be projected from disk; `Cache-Control: no-store` is set.
- The response is the fixed resource plus the bounded projection
  (`sessionId`, `askId`, `askedAt`, bounded `questions`); `coreProtocolVersion`
  is deliberately not sent. `content` is one fixed text line.
- Residual (pre-existing, documented): if `forgetPersistedAsk` silently fails
  after a close and the wrapper is then destroyed, the on-disk copy could be
  re-projected. That is the best-effort persistence contract, not a regression of
  this change.

### Priority 4 — view portability and isolation

- `labels` are merged only for known keys and only when non-empty; `theme`,
  `fontSizeOffsetPx` and `fontFamily` are all validated and defaulted, so a host
  that does not send the Pi Web extras still renders (asserted in the new view
  test).
- The frame has no network path: the view only calls `window.parent.postMessage`
  with `"*"` (opaque origin), and the meta CSP is
  `default-src 'none'; connect-src 'none'; img-src 'none'; object-src 'none';
  form-action 'none'; base-uri 'none'`. No cookie/storage/host-DOM access is
  attempted. No new data-leak vector was found.

### Minor observation (not changed)

`next.config.ts` still comments `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS` as
"Defaults to enabled on the loopback pair", stale after the opaque-origin
refactor. Comment-only; left untouched to keep the diff minimal.

### Commands (after the fixes)

- `node_modules/.bin/tsc --noEmit` → exit 0.
- `npm run lint` (`eslint .`) → exit 0, no output.
- `NODE_PATH= XDG_STATE_HOME= node --experimental-strip-types --test
  components/AskUserAppHost.test.mjs components/AskUserCard.test.mjs
  components/ChatWindow.ask-user-layout.test.mjs
  hooks/useAgentSession.pending-ask*.test.mjs "lib/ask-user/**/*.test.mjs"`
  → **108 pass / 0 fail** (was 101; +5 view-behavior, +2 host admission).
- `git diff --check` → clean.
- Repeated the focused command at 1463-test scope is not re-run here; the full
  `npm test` baseline was already recorded as passing by the main session.
