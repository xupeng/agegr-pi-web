# Browser MCP Apps probe (2026-09-26)

Command: `node .trellis/tasks/09-26-ask-user-mcp-migration/research/fixture/browser-probe.mjs`

Result: **PASS**. Raw trace: `research/fixture/browser-probe-result.json`. This authorizes the Pi Web adapter design below. It does not by itself authorize deleting the native card or enabling arbitrary MCP Apps.

## What passed

- In-process `McpServer` + `Client` over `InMemoryTransport.createLinkedPair()`, packages pinned in `research/fixture/package.json` to `@modelcontextprotocol/{client,core,server,ext-apps}@2.0.0` and `zod@4.2.0`.
- Negotiated MCP protocol version is **`2025-11-25`**. Published SDK `LATEST_PROTOCOL_VERSION` does not include `2026-07-28`. Do not claim that core revision.
- Apps view/host handshake uses Apps protocol **`2026-01-26`**.
- Tool `submit_ask` is registered with `_meta.ui.resourceUri = ui://pi-web/ask-user.html` and `visibility: ["app"]`. Host policy sees no model-visible tools. Resource read returns `text/html;profile=mcp-app`.
- Separate origins: host `http://127.0.0.1:<port>`, sandbox proxy `http://localhost:<other-port>`. Inner view is `about:srcdoc` on the sandbox origin. `document.cookie` in the view was empty; `window.top.document` was blocked.
- Wire observed: `sandbox-proxy-ready` equivalent ready signal, `ui/notifications/sandbox-resource-ready`, `ui/initialize`, initialized notification, `ui/notifications/tool-input`, `ui/notifications/tool-result`, view `tools/call`, `ui/resource-teardown` handler and result, then iframe removal.
- Gateway allowlist rejected `unlisted_tool`. Duplicate and wrong-session submits were rejected with `stale or unauthorized ask`. The first matching submit returned `structuredContent.answer = yes`.

## Product constraint from the probe

A same-origin Next route or a directly embedded `srcdoc` does not satisfy the Apps different-origin rule. For the local Pi Web server, the practical pair is the **opposite loopback hostname on the same port** (`127.0.0.1` vs `localhost`). Those origins do not share cookies. The sandbox document must be a static relay with a restrictive CSP and no session data.

If the page origin is not one of those two loopback names, do not attempt the iframe. Render the existing `AskUserCard`. LAN, custom hostnames, handshake failure, and resource failure use the same fallback. The existing ask submit/cancel commands remain the authority; the view may only request those named actions for the current session and askId.
