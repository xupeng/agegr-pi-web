# Introduce MCP Apps to Pi Web ask_user

## Goal

Learn and use the stable MCP Apps protocol for Pi Web's interactive `ask_user` view. Replace the direct React presentation with an Apps view only after an isolated protocol probe proves a safe, working integration; keep the existing durable asynchronous ask lifecycle and a usable fallback.

## Background

- The earlier `09-25-ask-user-cross-host-prototype` task owns the portable Pi tool and PA host bridge. This task is limited to Pi Web; PA migration and MCP elicitation are deferred by the user's latest scope decision.
- Pi Web pins Pi SDK `0.85.1` (`package.json`). `lib/ask-user/extension.ts` and `lib/ask-user/portable/tool.ts` register an inline Pi tool, not an MCP tool. `lib/ask-user/{store,persist}.ts` and `lib/rpc-manager.ts` own ask identity, persistence, submission and follow-up. `components/AskUserCard.tsx` renders the current host React form. There is no declared MCP runtime or Apps host in Pi Web.
- Stable [MCP Apps 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) links a tool's metadata to a `ui://` HTML resource rendered in a sandboxed iframe. It does not define durable ask identity, host React injection, or UI on elicitation. [Apps on elicitation](https://github.com/modelcontextprotocol/ext-apps/issues/511) is a proposal, not a shipped dependency. Core [MCP 2026-07-28 elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation) uses MRTR, and is not part of this phase.
- The user chose ask_user-only Apps adoption, approved host-owned state/security adapters, and asked that PA not be touched yet. The earlier choice to migrate both hosts is superseded.

## Requirements

- First verify an actual MCP Apps tool/resource and host/view exchange with a source-linked version/compatibility matrix, including resource loading, capability negotiation, sandbox lifecycle, action authorization and text fallback. Distinguish Pi tool output from an MCP `CallToolResult` and spell out any local adapter.
- The Pi Web `ask_user` presentation may use Apps only if the isolated protocol path works. Keep a working native card fallback for unavailable Apps, unsupported environments, resource/handshake failure and reload; do not replace it with an inert iframe or discard an open ask.
- Preserve bounded questions, optional/partial answers, selectable options and custom text, supplement, supersede, cancellation, stale and duplicate submission semantics, stable askId through restart, and the existing same-session follow-up. The server remains authoritative for validation and state; Apps view actions cannot access unrestricted Pi tools, credentials, host DOM/storage or file-write permission.
- Scope resources, tool actions and sandbox origin/CSP to an explicitly trusted built-in ask_user app. No arbitrary extension or remote MCP server gets Apps rendering merely because it declares `ui.resourceUri`.
- Keep Pi Web's existing enable/reload behavior and message layout usable on desktop and mobile. Verify with isolated offline tests and browser interaction; no real model conversation without separate authorization.

## Acceptance criteria

- [ ] Versioned research/probe records the Apps wire exchange (registered tool metadata and `ui://` resource, sandbox handshake, tool input/result and host-gated submit), compatibility with pinned Pi runtime, and a failure decision if real integration is not feasible.
- [ ] A successful ask displays a usable Apps view; answering/cancelling validates against the authoritative askId, wakes the correct session, and survives page refresh and runtime restart. When Apps cannot load, the existing form remains usable.
- [ ] Regression tests cover partial/custom/supplement answers, supersede, stale/duplicate/cancel, missing or malicious view actions, unsupported capabilities and Apps loading failure. Neither UI nor an answer grants write authorization.
- [ ] Desktop/mobile browser checks show correct framing, nonblank content, controls and no overlap; typecheck, lint and relevant tests pass. No production rollout proceeds on an unproven compatibility claim.

## Out of scope

- PA code/service, PA's uncommitted host bridge, MCP elicitation migration, or a general-purpose MCP Apps host for third-party tools.
- npm publication, real provider tests without approval, arbitrary React/CSS injection into host DOM, or broad SDK compatibility promises.

## Risks and deferred work

- Pi SDK's custom tool result may not expose standard MCP tool metadata; the design must prove a genuine MCP boundary and leave the native card in place if it cannot. A material change to the implementation after the probe requires revisiting this plan before rollout.
- PA and elicitation are separate future tasks. Retaining host-owned persistence is intentional: stable MCP Apps does not define it.
