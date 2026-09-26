# Opaque-origin sandbox probe (2026-09-26)

Trigger: the opposite-loopback design (`127.0.0.1` vs `localhost`) cannot work for
the operator's real usage. Pi Web is reached from another device over LAN
(`http://192.168.11.233:8505`) or Tailscale, so `decideAskUserView` returned
`non-loopback` and the Apps view never mounted. `localhost` is not an option for
remote use, and a second hostname or port would add deployment surface
(firewall, reverse proxy, port collisions, mixed content under HTTPS).

Probed alternative: mount the fixed view document in an iframe whose `sandbox`
attribute omits `allow-same-origin`, so the document gets an **opaque origin**
(`event.origin === "null"`). This is origin-independent: it works on loopback,
LAN IP, Tailscale address, hostname and HTTPS alike.

All probes are Chromium (Playwright, `/usr/bin/chromium`). Firefox and Safari are
not covered by this record.

## 1. What the opaque frame can reach

Inline script inside a `srcdoc` frame, results read back by the parent:

| sandbox attribute | `document.cookie` | `localStorage` | `window.parent.document` |
| --- | --- | --- | --- |
| `allow-scripts` | `SecurityError` | `SecurityError` | `SecurityError` |
| `allow-scripts allow-same-origin` | `""` | readable | readable |
| (no sandbox attribute) | `""` | readable | readable |

Chromium also logs `An iframe which has both allow-scripts and allow-same-origin
for its sandbox attribute can escape its sandboxing.` for the second row.

So the opaque frame is strictly better isolated than the current relay: it cannot
read cookies (the auth cookie is `HttpOnly` anyway), cannot touch storage, and
cannot reach the host DOM. `location.origin` inside such a frame reports the
string `"null"`, and reading `window.parent.location` throws.

## 2. CSP inheritance for `srcdoc`

A parent document served with `script-src 'self'` blocks an inline script in its
`srcdoc` child ("Executing inline script violates ... 'script-src 'self''"), so a
`srcdoc` document **inherits its parent's CSP**. Pi Web's own pages set no CSP
(`next.config.ts` only sets `Cache-Control` for `/`), so the child's own meta CSP
is what governs the view.

Consequence: an opaque-origin document cannot use `script-src 'self'` (an opaque
origin never matches `'self'`), so the view script cannot be a separate
`/ask-user-view.js` fetch. The script must be inline, allowed by a SHA-256 hash in
the view document's meta CSP.

## 3. Real end-to-end exchange through the opaque frame

The unmodified `public/ask-user-view.js` was fetched by the probe page, inlined
into the view document, and mounted with `sandbox="allow-scripts"` from two page
origins: `http://127.0.0.1:8505` and `http://192.168.11.233:8505`. Both produced
the same result:

```
ui/initialize                 origin=null
ui/notifications/initialized   origin=null
ui/notifications/size-changed  origin=null
tools/call                     origin=null
  name: "ask_submit"
  arguments: { sessionId: "s1", askId: "a1", answers: [{ id: "q1", values: ["yes"] }] }
```

The rendered view text was `需要你的补充 / 1/1 / opaque 沙箱里能回答吗？ / ◉ 可以 / ✓ 已提交`,
i.e. clicking an option and 提交 in the opaque frame produced a real host-gated
`ask_submit` call with the injected sessionId/askId. No console errors.

## 4. Two view-side changes this requires

1. The message listener currently does `catch { return; }` when it cannot read
   `window.parent.location.origin`. In an opaque frame that catch always fires, so
   every host message is dropped and the handshake stalls after `ui/initialize`
   (observed). The listener must fall back to "parent origin unknown" and rely on
   `event.source === window.parent` instead of returning.
2. An opaque frame cannot read the parent origin, so outbound messages must target
   `"*"` (already the fallback in `post()`), and the host must accept
   `event.origin === "null"` for messages whose `event.source` is exactly the
   mounted iframe's `contentWindow`.

## Decision

Replace the opposite-loopback relay with a single opaque-origin `srcdoc` view:

- `lib/ask-user/mcp-view-html.ts` owns the whole document, with the view script
  inline and pinned by `script-src 'sha256-…'`.
- `public/ask-user-view.js`, `public/ask-user-relay.js`,
  `app/ask-user-sandbox/route.ts` and `lib/ask-user/sandbox-origin.ts` are removed.
- The host mounts `srcdoc` with `sandbox="allow-scripts"` (no `allow-same-origin`,
  no `allow-forms`, `allow-popups`, `allow-downloads`, `allow-modals`) and accepts
  only the built-in document, only `ask_submit` / `ask_cancel` for the current
  session and ask id.

Deviation to record: the Apps `2026-01-26` specification puts the sandbox proxy on
a different origin from the host. This implementation has no proxy layer; the
untrusted document instead runs in an opaque origin, which the table in section 1
shows is at least as strong for the properties that matter here (no cookies, no
storage, no host DOM, no network). The MCP tool/resource side (app-only
projection, `_meta.ui.resourceUri`, `ui://` resource read) is unchanged.

Still not claimed: third-party Apps support, a generic MCP Apps host, or
Firefox/Safari verification.
