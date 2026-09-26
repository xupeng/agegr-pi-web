# ask_user MCP Apps migration — implementation notes (2026-09-26)

Branch: `feat/ask-user-mcp-apps` (created from `personal` @ `e0f9b35`, no commit).
Scope: Pi Web only. The portable Pi tool prompt, `terminate: true`, the durable
ask lifecycle and the answer follow-up are unchanged. No PA files, no live model
call, no `next build`, no `next dev`.

## What was built

- **Pinned MCP dependencies** (exact, root `package.json`): `@modelcontextprotocol/client@2.0.0`,
  `@modelcontextprotocol/core@2.0.0`, `@modelcontextprotocol/server@2.0.0`,
  `@modelcontextprotocol/ext-apps@2.0.0`, `zod@4.2.0`. All four MCP packages are
  listed in `next.config.ts:serverExternalPackages`. `npm ls` shows a single
  deduped `zod@4.2.0` (the Pi SDK peers accept `^4.0.0`).
- **Server-only adapter** `lib/ask-user/mcp-app-adapter.ts`, imported only by the
  ask-view route (and node tests). It builds an in-process `McpServer` + `Client`
  over `InMemoryTransport.createLinkedPair()`, registers exactly one app-only
  projection tool (`project_ask_user`, `visibility: ["app"]`) plus the fixed
  `ui://pi-web/ask-user.html` resource (`text/html;profile=mcp-app`), reads the
  resource back and returns the bounded `structuredContent`. It pushes
  `PendingAskUser` through explicit clamps (20 questions, 12 options, id 128,
  text 1000) and rejects a model-visible tool list or any tool/URI other than the
  built-in one. The tool closes over the already-persisted ask, so it cannot open
  a second ask. Confirmed core negotiation is `2025-11-25` (not `2026-07-28`);
  Apps peer version is `2026-01-26`.
- **Authenticated GET** `app/api/agent/[id]/ask-view/route.ts`. It is covered by
  the existing `proxy.ts` `/api/:path*` admission (session cookie / Basic auth,
  host and origin checks). It reads the live `pendingAsk` or the persisted ask
  fallback and returns only `{uri, mimeType, appsProtocolVersion, toolName,
  toolInput, structuredContent, content, html}`. There is no generic MCP HTTP
  endpoint.
- **Static sandbox relay** `app/ask-user-sandbox/route.ts` + `public/ask-user-relay.js`,
  outside `/api` and therefore unauthenticated by design. The relay document has
  a restrictive CSP (`default-src 'none'; script-src 'self'; connect-src 'none';
  frame-ancestors http://127.0.0.1:* http://localhost:*`), sets no cookie, and
  loads only the fixed relay script. The relay computes its allowed parent as the
  opposite loopback hostname on its own port and accepts the view HTML **only**
  over postMessage (`ui/notifications/sandbox-resource-ready`), never from the
  query string. It mounts the fixed resource HTML in the nested
  `sandbox="allow-scripts allow-same-origin"` `about:srcdoc` iframe and relays
  `ui/*` messages plus `ui/notifications/size-changed`.
- **Browser view** `public/ask-user-view.js`, loaded by the resource HTML. It is a
  fixed, dependency-free script that speaks the Apps 2026-01-26 handshake
  (`ui/initialize` -> result -> `ui/notifications/initialized`), renders questions,
  options, custom text, supplement, submit/cancel, the locked/submitted state and
  partial answers, and requests only `ask_submit` / `ask_cancel`. Display labels
  and theme arrive from the host in `structuredContent`; no new user-visible
  strings were introduced, so no new i18n keys were needed (existing `chat.*`
  keys are reused).
- **Client host wrapper** `components/AskUserAppHost.tsx`, used by
  `components/ChatWindow.tsx` (`<AskUserAppHost key={pendingAsk.askId} ...>`;
  `key` preserved so drafts/lock/sandbox do not leak across asks). On the loopback
  pair it fetches the projection, mounts the opposite-origin relay and performs
  the handshake; it answers `ui/initialize`, sends tool-input/tool-result, and
  forwards **only** `ask_submit` / `ask_cancel` for the current `sessionId` +
  `askId` into the existing `submitAsk` / `cancelAsk` (=> `sendAgentCommand`).
  Any other tool name, wrong ask identity, non-loopback page, `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS=0`,
  fetch error or 6 s handshake timeout renders the existing `AskUserCard` with
  the ask still present. No MCP package is imported by any client component.
- **Pure origin logic** `lib/ask-user/sandbox-origin.ts` (import-free) is shared by
  the wrapper and tests.

## Security posture

- The view receives no credentials, cookies, host DOM access, session history or
  Pi tools; its origin has no auth cookie (probe confirmed `document.cookie === ""`).
- Submit/cancel never call arbitrary MCP tools: the host intercepts the two named
  actions and reuses the existing command path; server-side store validation,
  stale handling and follow-up delivery remain authoritative.
- The Apps path is a presentation layer only; it cannot open or close an ask by
  itself, and a failed handshake uses the native card without discarding the ask.

## Verification

- `node_modules/.bin/tsc --noEmit`: exit 0 (0 errors).
- `npm run lint`: exit 0 (0 errors, 0 warnings).
- Focused tests (`lib/ask-user/**/*.test.mjs`, `lib/ask-user/*.test.mjs`,
  `components/AskUserAppHost.test.mjs`, `components/ChatWindow.ask-user-layout.test.mjs`,
  `hooks/useAgentSession.pending-ask.test.mjs`): **89 pass / 0 fail**.
  - New: `lib/ask-user/sandbox-origin.test.mjs` (opposite-origin + fallback
    decisions), `lib/ask-user/mcp-app-adapter.test.mjs` (resource MIME
    `text/html;profile=mcp-app`, app-only visibility, wrong tool/URI rejection on
    a live in-process pair, projection bounds, negotiated core version),
    `components/AskUserAppHost.test.mjs` (fallback, action allowlist, keying,
    relay/CSP source contract).
  - Updated: `hooks/useAgentSession.pending-ask.test.mjs` now asserts
    `<AskUserAppHost key={pendingAsk.askId}>` instead of the directly-rendered
    card (the wrapper owns the card fallback now).
- Full suite (`npm test`): **1456 tests, 1456 pass / 0 fail** when the harness
  environment is neutralized as `NODE_PATH= XDG_STATE_HOME= npm test`. Without
  that, two pre-existing environment-sensitive tests fail and are unrelated to
  this change: `lib/ask-user/portable/discovery.test.mjs` (the harness sets
  `NODE_PATH` to the globally installed pi-web, so `require.resolve` finds a
  different package) and `lib/skill-lock.test.mjs` (the harness sets
  `XDG_STATE_HOME`). Both pass with those variables cleared.
- Existing offline fixture probe
  `.trellis/tasks/09-26-ask-user-mcp-migration/research/fixture/browser-probe.mjs`:
  re-ran, exit 0 (`PASS`). It still exercises the pinned MCP package pair and the
  already-recorded wire.

## Not run / not claimed

- No `next build` (per `AGENTS.md`), no `next dev` server, no real model call.
- No product browser screenshots or Playwright run of the actual Pi Web Apps
  iframe this pass, so the end-to-end product rendering is **not** browser-verified
  here. It rests on the recorded offline probe (same Apps wire) and fails closed
  to `AskUserCard` on any fetch/handshake/timeout error. This should be validated
  with a real dev-server + Chromium check before any rollout.
- `<AskUserAppHost>` currently shows the native card during the short probe/fetch
  window and swaps to the sandbox on success; this is intentional so an ask is
  never blank, and any failure simply keeps the card.
