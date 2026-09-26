# Design: ask_user as a Pi Web MCP App

## Boundaries

1. **Pi tool (unchanged authority):** `createAskUserToolDefinition` validates and opens a durable ask, returns `terminate: true`, and later receives the answer as the existing custom follow-up. Do not pin a Pi run waiting for a human, recast the answer as an ordinary prompt or make Apps the source of truth.
2. **MCP adapter (new, local-only):** provide a real MCP tool with `_meta.ui.resourceUri`, a matching `ui://` HTML resource (`text/html;profile=mcp-app`) and a standard tool result carrying an ask identity. The first offline probe must decide whether an in-process MCP server/client transport with Apps SDK helpers fits the pinned Pi runtime; the Pi tool's proprietary `details` are not themselves MCP metadata. Do not register a second model-visible `ask_user` that might open the same ask twice.
3. **Pi Web host (trusted):** read only the built-in resource, validate MIME/size/capabilities, serve a sandbox proxy from an isolated origin, handshake through Apps `AppBridge`/`PostMessageTransport`, send the ask projection on initial load and reconstruction, and allow only named submit/cancel operations after validating sessionId/askId and browser authorization. Apply server-side validation and existing stale handling again, irrespective of view input.
4. **View (untrusted):** bundle an Apps HTML page, use the Apps view SDK (React inside the iframe is allowed), render the supplied ask, submit via the scoped host action, and show pending/error states. No ambient auth token, host DOM, browser storage or direct write tool access. CSP denies undeclared network access. Theme/context is passed through the protocol.

## Lifecycle and data flow

Pi model calls the existing Pi tool -> host persists open ask -> Pi runtime finishes -> Pi Web discovers open ask from current/restored state -> trusted MCP adapter exposes a read-only view result for that ask and its built-in `ui://` resource -> browser host loads it in a sandbox, sends `tool-input` and `tool-result` after initialization -> user submits/cancels -> host checks session/ask identity, current state and permissions -> existing ask close command delivers the custom follow-up. Reload reconstructs the view from authoritative state, never from an iframe cache. Closing/superseding an ask tears down or updates the correct iframe; stale actions cannot close a newer ask.

The protocol probe must demonstrate that this projection is a conforming tool/resource path, not just protocol-shaped JSON passed into an iframe. Compare a local MCP client/server transport and the official basic-host flow. If Pi's tool format cannot carry Apps metadata, keep that metadata on the separate local MCP adapter and associate it with the host's ask snapshot, without changing the model-visible tool semantics. Capture exact tool/resource messages, app initialization, submit routing and teardown in task research before editing product UI.

## Probe decision (2026-09-26)

`research/browser-probe.md` records a passing offline browser exchange. Published MCP packages `2.0.0` negotiate core protocol `2025-11-25` and Apps protocol `2026-01-26`; do not implement or advertise core `2026-07-28` for this adapter.

Pi Web serves one port. The approved isolation for this task is the opposite loopback hostname on that same port (`127.0.0.1` and `localhost`), which are different origins and do not share cookies. The sandbox route is a static message relay with no ask payload and no authenticated API. Non-loopback pages, and any sandbox/handshake/resource failure, keep `components/AskUserCard.tsx`. This is not a general MCP Apps host and does not add a second long-running port.

### Superseded: opaque-origin view replaces the loopback relay

The loopback pair is unusable for the operator's actual deployment: Pi Web is
reached from another device over LAN (`http://192.168.11.233:8505`) or Tailscale,
where `decideAskUserView` returned `non-loopback` and the Apps view never mounted.
`localhost` cannot serve remote use, and a second hostname or port would add
deployment surface (firewall, reverse proxy, port collisions, mixed content under
HTTPS).

`research/opaque-sandbox-probe.md` records the replacement, verified in Chromium
against both `http://127.0.0.1:8505` and `http://192.168.11.233:8505`:

- The view document is mounted as `srcdoc` with `sandbox="allow-scripts"` and **no**
  `allow-same-origin`, so it runs in an **opaque origin**. Measured in that frame:
  `document.cookie`, `localStorage` and `window.parent.document` all raise
  `SecurityError`; the same frame with `allow-same-origin` can read all three.
- `srcdoc` documents inherit the parent's CSP, and Pi Web's own pages set no CSP, so
  the view's own meta CSP governs. An opaque origin never matches `'self'`, so the
  view script is inlined into the fixed document and allowed by `script-src 'sha256-…'`.
- The full Apps exchange runs there: `ui/initialize` → `ui/notifications/initialized`
  → `ui/notifications/tool-input` / `tool-result` → `ui/notifications/size-changed`
  → a real `tools/call` `ask_submit` carrying the injected `sessionId`/`askId`.

Consequences for the implementation: the view's message listener must not bail out
when it cannot read `window.parent.location.origin` (it cannot, in an opaque frame);
outbound messages target `"*"`; and the host accepts `event.origin === "null"` only
for messages whose `event.source` is exactly the mounted iframe's `contentWindow`.

`public/ask-user-relay.js`, `app/ask-user-sandbox/route.ts`,
`public/ask-user-view.js` and `lib/ask-user/sandbox-origin.ts` are therefore removed,
along with the `ready` / `sandbox-resource-ready` relay handshake.

Recorded deviation: the Apps `2026-01-26` specification places the sandbox proxy on a
different origin from the host. This implementation has no proxy layer; the untrusted
document runs in an opaque origin instead, which the measurements above show is at
least as strong for the properties that matter (no cookies, no storage, no host DOM,
no network). The MCP tool/resource side (`project_ask_user` with
`_meta.ui.resourceUri`, the `ui://pi-web/ask-user.html` resource read, and the
allowlisted host-gated actions) is unchanged, and the native `AskUserCard` remains the
fallback for a disabled flag, a failed handshake, or an invalid projection.

## Security and rollout

- This is a trusted, built-in ask_user App, not a generic MCP client. Gate the `ui://` URI and any view-callable tool by exact identity; never proxy arbitrary tool calls. Host endpoints keep existing auth/CSRF/path/session admission. Do not serialize credentials or unlimited session data into `structuredContent`.
- Follow the stable Apps double-iframe isolation for Web hosts, with a distinct sandbox origin and restrictive CSP. Check how the existing Next.js deployment can provide that origin before implementing the iframe. Failure to establish isolation blocks the Apps cutover.
- Feature-flag or contain the Apps rendering transition so unsupported clients and resource/handshake errors fall back to the existing React card. Retain current ask store and answer APIs. Do not cut over live or delete the card until all state/security/browser checks pass.
- No PA integration, MCP elicitation transport or capability claim for arbitrary extensions in this task.

## Sources

- [MCP Apps stable specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [Apps quickstart and resource registration](https://github.com/modelcontextprotocol/ext-apps/blob/main/docs/quickstart.md)
- [Official basic host](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/basic-host)
- [Apps AppBridge API](https://apps.extensions.modelcontextprotocol.io/api/classes/app-bridge.AppBridge.html)
- `research/protocol-boundaries.md` for core-version and local-lifecycle differences.
