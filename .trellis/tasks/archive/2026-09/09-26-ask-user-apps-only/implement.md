# Implementation plan

## Order

1. **Host: one renderer, three states** (`components/AskUserAppHost.tsx`)
   - Remove the `AskUserCard` import and the card branch, `cardSlotRef` and the
     focus guard, `APPS_DISABLED` and the `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS` read
     (and the env entry in `next.config.ts`).
   - Add a compact loading placeholder (`aria-busy`) for the pending phase; keep
     the iframe's off-screen mount until `size-changed` so it never flashes.
   - Add the degraded state (in the same file, or a small
     `components/AskUserAppFailure.tsx`): error line, hint, read-only question
     list from `props.ask.questions`, and the single retry control wired to a
     `reloadKey` the projection effect depends on.
   - Set `data-ask-user-view` to exactly `loading | apps | failed`.
   - Do not touch message admission, the action allowlist, the session/ask
     checks or the 6 s timeout behaviour.
2. **i18n**: add `chat.askUserAppFailed`, `chat.askUserAppFailedHint`,
   `chat.askUserAppFailedRetry` (plus a multi-select hint if the read-only list
   needs one) to `lib/i18n/messages/{en,zh-CN,zh-TW}.ts`. The registry test
   requires every key in every locale.
3. **Tests**
   - Delete `components/AskUserCard.test.mjs` and `components/AskUserCard.tsx`.
   - Rewrite `components/AskUserAppHost.test.mjs`: the three markers; the
     degraded state renders question text but no form control other than retry;
     retry re-runs the projection fetch; no `dangerouslySetInnerHTML`; the
     existing admission and allowlist assertions stay.
   - Update `components/ChatWindow.ask-user-layout.test.mjs`: stop reading
     `AskUserCard.tsx`, keep the layout contract against the host container.
   - Update the card comment in `hooks/useAgentSession.pending-ask.test.mjs`.
   - Move the behaviours the deleted card tests were the only cover for into
     `lib/ask-user/mcp-view-html.test.mjs` (submit/cancel lock and the
     per-question submitted summary, supplement forwarding, single/multiple
     custom-text rules). Doing this exposed a real parity gap and is why
     `lib/ask-user/mcp-view-html.ts` is edited after all — see
     `research/locked-summary-parity-fix.md` for the evidence and the digest
     change that comes with it.
4. **Spec**: update `.trellis/spec/frontend/ask-user-protocol.md` — single
   renderer, the three states, the degraded-state contract, the removed flag and
   the removed `native` / `apps-pending` markers.
5. **Verify**
   - `node_modules/.bin/tsc --noEmit`, `npm run lint`, `git diff --check`.
   - `NODE_PATH= XDG_STATE_HOME= npm test` (full suite; 1470 passing before this
     change).
   - Browser, Chromium (`/usr/bin/chromium`, `--no-sandbox`) against the running
     dev server (`next dev -H 0.0.0.0 -p 8505`; reuse it if healthy per
     `AGENTS.md`; never run `next build`):
     - normal path with a real open ask: marker `apps`, one `sandbox="allow-scripts"`
       `srcdoc` iframe, a real `ask_submit` (intercept only the command POST when
       a model call must be avoided);
     - degraded path: intercept `GET **/api/agent/*/ask-view` with a 500 → marker
       `failed`, question text visible, no inputs, retry present; then drop the
       interception and click retry → marker `apps`;
     - both paths at 1280×900 and 390×844, plus a page reload with the ask still
       open.
6. **Close out**: feature commit, then `docs(spec)`; then `task.py archive`,
   `add_session.py` and the PR on the same branch (AGENTS.md).

## Guardrails

- Do not touch the Pi tool contract, `lib/ask-user/{store,persist,tool,extension}.ts`,
  `lib/rpc-manager.ts`, or the adapter's tool/resource metadata. (The view
  document is the one exception, and only for the parity fix above, which must
  ship with its test and the updated digest.)
- Do not weaken the sandbox or message admission while removing the card.
- Never run `next build`; do not run `test:live` or start a real model
  conversation without separate approval.
- Do not commit `.trellis/tasks/09-25-*`.
- Keep the degraded state free of any control that could answer an ask.
