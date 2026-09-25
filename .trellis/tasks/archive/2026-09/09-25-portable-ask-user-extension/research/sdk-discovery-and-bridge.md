# SDK 0.85.1 discovery and explicit host bridge probe

## Result

**Feasible as a prototype, not yet a production integration.** On the installed `@earendil-works/pi-coding-agent@0.85.1` in both repositories, an isolated in-memory `packages: [<absolute local directory>]` resolves a `package.json` `pi.extensions: ["./index.ts"]` and loads the default factory and its `ask_user` tool. An independent copy under a temporary `$PA_HOME/extensions/` is admitted by PA's actual Stage A loader, independent of SDK package settings. An inline host extension and the file extension share a loader-scoped `pi.events` bus: the file tool can ask for a synchronous registration of an asynchronous `open` function at **execute time**, then await that function. No global variable, Web import, model call, settings change, service restart, or PA repository write was used.

This is only an interface/loader probe: the fixture uses minimal question fields and a fake acknowledgement, not the real schema, validator, store, durable persistence, or PA runtime/Web workflow. It directly invokes the loaded tool's `execute` with a mocked tool context; it does not assert end-to-end agent error-result rendering or run termination. It proves the binder can be implemented safely under the pinned SDK's synchronous event dispatch, **provided** the host explicitly installs a listener before tool execution and the package rejects zero/multiple registrations. It does not prove future SDK versions or third-party hosts.

## Reproduce (no model/network/service)

From `/home/xupeng/dev/personal/forked/agegr-pi-web`:

```bash
node .trellis/tasks/archive/2026-09/09-25-portable-ask-user-extension/research/fixture/probe.mjs
node --import "$(realpath ../../personal-assistant/node_modules/tsx/dist/loader.mjs)" .trellis/tasks/archive/2026-09/09-25-portable-ask-user-extension/research/fixture/pa-probe.mjs
```

Expected stdout:

```text
SDK 0.85.1: copied package discovered; missing/duplicate bridge, malformed ask, forged ack and host failure fail; async open verified
PA Stage A: copied directory resolves the real package entry; inline host open called; forged ack fails; global/entry/tool off deny it
```

The second command may also print Node's `DEP0205` warning from the installed tsx loader. Both probes independently copy the actual `lib/ask-user/portable/` package into temporary directories with no `node_modules`; the PA copy is a named controlled directory entry. The SDK probe uses `SettingsManager.inMemory`, so it tests resolution equivalent to declaring a local package in settings without running `pi install` or editing real `~/.pi/agent/settings.json`. The SDK docs also document `pi install /absolute/path/to/package` (personal) or `pi install -l /absolute/path/to/package` (trusted project), but those actual installer commands were intentionally **not** run. No npm/third-party compatibility claim is made.

## Bridge contract to implement

1. The package default factory registers a tool and retains only its loader-scoped `pi.events` reference. During `execute`, first validate the bounded questions. Emit a namespaced, versioned resolution event with a fresh mutable request exposing `register(open)`. A host inline factory listens through its own `pi.events.on(channel, handler)` and **synchronously** supplies one function `open({ version, conversationId, questions }) => Promise<ack>`; any disk commit, UI/event publish, and supersede happen inside the awaited `open` (host-owned). Do not perform asynchronous work *before* registering the function.
2. The tool checks exactly one valid registration immediately after `emit`; zero or multiple must throw. Then `await open(...)`. Throw on rejection or missing/invalid durable acknowledgement. Only a successful acknowledgement permits a tool result with `terminate: true`. Do not infer registration success from `emit` returning; the SDK event bus returns `void` and catches listener errors. The fixture uses `sessionId` and `askId` as placeholders; the stable public contract must separate generic conversation identity from Pi Web's wire names and define acknowledgement validation.
3. The event bus is instance-scoped (`DefaultResourceLoader` makes one by default), and `pi.events` subscribers are tracked/invalidated by the extension runtime. A listener attached to a different loader cannot supply the bridge. Invoke resolution at execution, not during package factory load: file-based factories load before inline factories in this SDK. Host admission and allowed run origins remain host decisions; package code must not enable itself or reach into Next/PA internals.

SDK evidence: `node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.js` (`reload` resolves `packages`, `additionalExtensionPaths`, then loads file extensions and inline factories); `dist/core/package-manager.js` (`resolveLocalExtensionSource`, `resolveExtensionEntries`); `dist/core/extensions/loader.js` (`resolveExtensionEntries`, `createExtensionAPI.events`); `dist/core/event-bus.js` (synchronous EventEmitter `emit`, listener wrapper catches asynchronous errors); `dist/core/extensions/types.d.ts` (`ExtensionAPI.events`, `ExtensionFactory`). The matching version's `docs/packages.md` specifies local package paths, `pi.extensions`, and Pi package peer dependency guidance. Pin/test the SDK at 0.85.1 in the package's peer range; Pi docs recommend `"*"` for SDK peers, but this prototype's compatibility guarantee is only 0.85.1. Do not bundle the SDK. The fixture's metadata records the exact tested peers.

## PA admission and limits

PA read-only source: `/home/xupeng/dev/personal/personal-assistant/src/server/config.ts` derives `$PA_HOME/extensions/` and requires `ASSISTANT_EXTENSIONS=1`; `src/assistant/extensions.ts` reads direct file/directory entries, constructs an isolated in-memory settings manager with `packages: []`, passes admitted directory paths as `additionalExtensionPaths`, checks reserved/conflicting/disabled tool names, and freezes the loader. The probe exercises this real `resolveRuntimeExtensions` with its own fixture directory, `enabled: true`, a host inline factory, and the global/entry/tool disabled cases. Neither `pi install` nor the operator's live extension switch enables PA: the package must also be deliberately placed as a controlled directory entry and admitted by PA. No changes to live `$PA_HOME` were made.

PA still appends all admitted external tool names to both interactive and scheduled tools (`src/server/host.ts`, `const tools = ...ext.toolNames`), while scheduled runs use `scheduled_result` for `needs_input` (`src/assistant/extension.ts`). The PA task must gate `ask_user` to interactive runs **in the host**, and implement its own authenticated card, durable open/close/answer delivery and restart policy. Its current run closes its SDK session in `src/server/host.ts` finally; the fixture does not establish that a future answer can wake that closed run. Stage B (`createRuntime` / binding), browser flow and lifecycle are not tested here. Approval to write is separate from selecting an option. Do not silently toggle the real operator switch.

## Pi Web extraction boundary

Existing `lib/ask-user/tool.ts` defines the tool, TypeBox schema, `postedText` and `terminate: true`; `lib/ask-user/store.ts` privately validates questions/answers and owns open/supersede/submit/cancel. `lib/ask-user/types.ts` mixes portable bounded DTOs with the Web-only `pi-web.ask.answers` custom type. `lib/ask-user/extension.ts` is the settings-gated inline adapter: it looks up the live wrapper by session id and throws when absent. `lib/rpc-manager.ts` keeps SSE, best-effort disk mirror, close and follow-up delivery. Extraction should share **one** real schema/validator with the Web factory and portable entry; it must not use the fixture's simplified validation or move host state/UI into the package. Preserve current Web behavior, tool metadata, and MIT notice (`LICENSE`) when copying substantial code. The older feasibility analysis is `.trellis/tasks/archive/2026-09/09-25-ask-user-standalone-extension/research/feasibility.md`.

Remaining integration test gaps: SDK schema failures before `execute`, full SDK session error/termination events, PA Stage B and scheduled exclusion. Duplicate IDs/length limits, ack and supersede failures, and Pi Web toggle/lookup now have focused tests. The bridge mechanism is proven; the host policies and production delivery guarantees are not.

## Post-implementation update (task 09-25-portable-ask-user-extension)

This probe has been superseded by the real package at `lib/ask-user/portable/`
and the automated `lib/ask-user/portable/discovery.test.mjs`. The fixture's
standalone `pa-home/extensions/ask-user/` package was removed. Both probe
scripts copy the real package into a temp directory (no symlink, no
`node_modules`) and load the copy. A symlink whose realpath is this repo is
not accepted as proof: PA's loader calls `realpathSync`, so a symlink would
execute the in-repo files and could walk up into Pi Web's `node_modules`.
The copy cannot `require.resolve` the SDK peers; the host loader aliases them.
Ack questions must match the validated ask, and a forged or unreportable
supersede fails closed. See `research/implementation-notes.md`.
