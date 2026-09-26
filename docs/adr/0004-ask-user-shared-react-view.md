# Render ask_user through a shared React view instead of MCP Apps

Pi Web renders `ask_user` through `AskUserView`, a React component that lives
with the `ask_user` Pi extension under `lib/ask-user/portable/react/`. The
component is driven by a framework-free reducer
(`lib/ask-user/portable/view-controller.ts`) and given display copy plus a
`--pi-ask-*` variable mapping
by a thin per-host adapter (`components/AskUserAppHost.tsx` in Pi Web). This
reverses the direction set by PR #9 (`9c2cd86`), which made a fixed
`ui://pi-web/ask-user.html` MCP Apps iframe the only presentation and deleted the
native card. The iframe path, its in-process MCP adapter, the projection
endpoint, the font manifest and byte delivery, the theme-token sanitiser, and
the degraded state are removed rather than sealed. The component contract is
`lib/ask-user/portable/react/README.md`.

## Why the MCP Apps direction was wrong here

The iframe existed to put an untrusted view in an opaque origin. But both
consumers are React applications, and an iframe between two React hosts buys no
isolation we actually rely on: Pi Web and Personal Assistant already render the
tool UI in their own document, and the view is authored by the same team. The
measured cost was lopsided — an adapter, a projection route, a font-manifest
parser and byte loader, a token allow-list, a handshake, a 6-second timeout, a
degraded renderer, three locales of failure copy, and five dependencies, all to
draw one card. The opaque origin was also the sole reason the view could not
resolve `var()`, which forced a computed-token mirror and a hard-coded fallback
palette. Moving the view into the host document deletes that whole layer.

## Alternatives considered

- **Keep the iframe and seal it with a conformance suite.** Rejected. It leaves
  two renderers and the pipeline — the cost is the thing being removed — while
  the isolation benefit remains unproven for a view we author ourselves.
- **Keep both renderers behind the `NEXT_PUBLIC_PI_WEB_ASK_USER_APPS` flag.**
  Rejected. A second renderer means a second behaviour surface to test forever,
  and the flag had no user; the native card had already been deleted, so the
  toggle was already near-vacuous.
- **Ship the view as its own package or repository.** Rejected. The component
  and the controller are co-developed, and the extension is already a
  `private: true`, TS-direct-load Pi package under `lib/ask-user/portable/`. A
  separate repository would only add a version-negotiation problem between the
  controller and the React layer that are released together.

## Consequences

- One renderer. `data-ask-user-view="shared"` is the single DOM marker; the old
  `loading` / `apps` / `failed` tri-state is gone because those were iframe
  lifecycle states.
- `zod` and `@modelcontextprotocol/{client,core,server,ext-apps}` left
  `package.json`, `package-lock.json`, and `next.config.ts`'s
  `serverExternalPackages`.
- The copy table now lives in the package (`lib/ask-user/portable/react/copy.ts`,
  three locales). Pi Web overlays all twelve keys from its own `lib/i18n`, so
  each side's wording has exactly one owner and the two may drift legitimately.
- The ban on `light-dark(#…)` is lifted. It was written for the opaque-origin
  frame, which could resolve neither inherited variables nor `var()`; the
  component now shares the host document and uses `light-dark()` as its
  no-host fallback.
- Honest cost: a third-party MCP Apps host can no longer render this view. Only
  React hosts (Pi Web, Personal Assistant) or a non-React host that drives the
  controller and repeats the documented accessibility contract can.
- The archived research fixtures under
  `.trellis/tasks/archive/2026-09/09-26-ask-user-mcp-migration/research/fixture/`
  still import the removed packages. They are historical evidence and are no
  longer runnable; they are left unedited.
