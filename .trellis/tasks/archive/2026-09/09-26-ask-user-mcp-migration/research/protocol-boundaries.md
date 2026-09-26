# MCP ask_user migration: protocol boundaries (planning, 2026-09-26)

Scope update: user prioritizes MCP Apps in Pi Web; PA migration and core elicitation implementation are deferred. The elicitation and PA notes below are comparative evidence, not deliverables in this task.

## Authoritative versions

- Core MCP [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) and [elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation): MRTR returns `input_required` containing `inputRequests`, and the client retries with `inputResponses`. Do not implement the previous `2025-11-25` nested server-request lifecycle as though it were current.
- MCP Apps [2026-01-26 stable specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx): tool metadata points to `ui://` HTML (`text/html;profile=mcp-app`); a supporting host renders it in a sandboxed iframe and communicates over JSON-RPC/postMessage. A React tree mounted in the host is not this protocol.
- Rich Apps UI on `elicitation/create` is an [open proposal](https://github.com/modelcontextprotocol/ext-apps/issues/511), not part of the cited stable specs. Do not silently substitute tool UI for a blocking elicitation response.

## Repository constraints

- Both `package.json` files pin the Pi SDK to `0.85.1`; neither declares an MCP runtime dependency. A compatibility probe must establish actual client/server capabilities and supported protocol versions before choosing integration APIs.
- Pi Web: `lib/ask-user/portable/{tool,bridge,types,validation}.ts` owns the bounded tool contract; `lib/ask-user/{store,persist,extension}.ts`, `lib/rpc-manager.ts` and `components/AskUserCard.tsx` own delivery and lifecycle. Its spec `.trellis/spec/frontend/ask-user-protocol.md` describes nonblocking `terminate: true` plus a custom follow-up.
- PA: `src/server/{host,asks,app}.ts`, `src/shared/ask-user.ts` and `src/web/AskUserCard.tsx` own journal-backed asks, authenticated answer routes and UI. Existing changes are uncommitted on `feat/ask-user-host-bridge`; preserve them. PA uses a new Pi runtime after a completed turn and answers through a fresh no-write-permit continuation; scheduled runs hide the tool and hints.
- Neither stable protocol cited above specifies PA/Pi Web's durable askId, journal replay, duplicate/stale submission semantics, same-session wake-up or write-scope rules. Those remain explicit host invariants until a tested replacement exists.

## Investigation gates

1. Verify a flat MCP form can represent bounded options, multi-select, optional/omitted answers and free text, and whether task-level input requirements change the long-wait/restart design. Record exact wire traces for supported core versions rather than infer them from SDK typings.
2. Probe Apps handshake, view-to-host action permission checks, fallback text and CSP isolation. Keep form elicitation and rich Apps rendering separate unless a stable binding becomes available.
3. Test end-to-end cancellation, restart, duplicate answer, delivery uncertainty and write permissions against Pi Web before any cutover; defer PA-specific tests to a separate task.

No network-backed model test, `test:live`, npm publication or live PA restart is authorized by this planning task.
