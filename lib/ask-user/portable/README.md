# pi-ask-user-portable (local prototype)

A bounded `ask_user` tool and its schema/validator, packaged as a **locally
installable Pi extension**. It is a prototype: it is `private`, has no npm
release, and makes no compatibility claim beyond the SDK version pinned below.

The package owns only the portable core:

| In this package | Stays in the host |
| --- | --- |
| `AskUserQuestion` / `AskUserOutcome` DTOs and limits (`types.ts`) | Pending-ask state, persistence, authentication |
| The single validator for asks and submissions (`validation.ts`) | Browser/terminal card, submit route, SSE |
| Answer/outcome text formatting (`format.ts`) | Delivering the follow-up turn that wakes the model |
| The Pi tool factory (`tool.ts`) | Product-specific names, settings, and origins |
| The host bridge contract and resolver (`bridge.ts`) | |
| The Pi package entry (`index.ts`, this `package.json`) | |

## Pinned SDK peers

Pinned exactly, not `"*"`:

- `@earendil-works/pi-ai`: `0.85.1`
- `@earendil-works/pi-coding-agent`: `0.85.1`

Only that SDK version was probed. Do not treat a different SDK as supported
without re-running the discovery probes.

## Local installation

The package is a normal Pi package: `package.json` declares its entry with
`"pi": { "extensions": ["./index.ts"] }`.

- Pi (SDK package discovery), personal scope:
  `pi install /absolute/path/to/lib/ask-user/portable`
- Pi, trusted project scope:
  `pi install -l /absolute/path/to/lib/ask-user/portable`

A host that does not use SDK package discovery can instead load the same
directory as a **controlled extension entry** (the personal-assistant pattern:
place a **copy** of the directory under `$PA_HOME/extensions/<id>` and enable
extension admission). The directory resolves to `index.ts` through the same
`pi.extensions` manifest field, so both loader paths load the identical entry.

Do not treat a symlink whose realpath is this repository, or a `node_modules`
link back to Pi Web, as installation. The package has no local `node_modules`;
SDK peers resolve through the host loader's aliases, which is why the peers
are declared and not bundled. A copied directory that Node itself cannot
`require.resolve` those peers from must still load when the host uses Pi's
extension loader.

Installing the extension is not enough to use it: the host must also install a
bridge listener (below) and admit the `ask_user` tool for the runs it wants.

## Host bridge contract

The package never imports a host, never reads a global, and never falls back to
a stub. At `ask_user` execution time it:

1. validates the bounded question set with the shared validator;
2. emits `ASK_USER_BRIDGE_CHANNEL` = `pi.ask-user.bridge:resolve-open:v1`
   on the SDK's **loader-scoped** `pi.events` bus, passing one mutable request
   object `{ register(open) }`;
3. requires exactly **one** host to call `request.register(open)`
   **synchronously** in that handler — before any `await`;
4. `await`s `open(request)` and requires a durable acknowledgement.

```ts
import {
  ASK_USER_BRIDGE_CHANNEL,
  ASK_USER_BRIDGE_VERSION,
  type AskUserBridgeRequest,
  type AskUserBridgeResolution,
} from "./path/to/copied/pi-ask-user-portable/index.ts";
// This package is private and has no published specifier. Import the local
// directory through the host's TypeScript loader; do not import Pi Web.

// Installed as an inline extension factory in the SAME resource loader as the
// package entry. The listener only registers; all durable work happens inside
// `open`, which the tool awaits.
const hostBridge = (pi) => pi.events.on(ASK_USER_BRIDGE_CHANNEL, (data) => {
  const request = data as AskUserBridgeResolution;
  request.register(async (ask: AskUserBridgeRequest) => {
    if (ask.version !== ASK_USER_BRIDGE_VERSION) throw new Error("unsupported ask_user bridge version");
    // Host-owned: persist, publish a card, supersede the previous ask, ...
    const registered = await myHost.registerOpenAsk(ask.conversationId, ask.questions);
    return {
      ask: { askId: registered.id, askedAt: registered.at, questions: ask.questions },
      // Optional: the outcome of the ask this one superseded.
      ...(registered.superseded ? { superseded: registered.superseded } : {}),
    };
  });
});
```

### Failure is always closed

| Situation | Result |
| --- | --- |
| No listener registers | `AskUserBridgeError`, no card |
| Two or more listeners register | `AskUserBridgeError`, no card |
| Listener registers after an `await` | treated as no registration |
| Malformed question set | `PendingAskValidationError`, the bridge is never called |
| Host `open` rejects / times out | the rejection propagates |
| Ack missing, empty, or without a non-empty bounded `askId`/`askedAt` | `AskUserBridgeError` |
| Ack questions differ in id, text, options, `multiple`, or order from the validated ask | `AskUserBridgeError` |
| `superseded` present but not an object, not `reason: "superseded"`, or without a string `unansweredIds` list | `AskUserBridgeError` |

A thrown error becomes an error tool result; the model can correct the ask and
retry. The package never returns `terminate: true` unless a host returned a
durable acknowledgement whose questions match the validated ask. A supersede
notice is included only when that acknowledgement names the replaced ask and
its unanswered ids; an invalid notice is an error, not a silent success.
Hosts should build that acknowledgement before committing, because a thrown
bridge error means the tool did not accept the ask even if the host already
wrote state.

The bus is per resource loader, so a bridge listener installed in a different
loader cannot answer this call. The package does **not** enable itself and does
not decide which run origins may see the tool — admission is a host concern.

## Pi Web

Pi Web does not install this package through SDK discovery. It imports the
portable core directly and keeps its own inline adapter
(`lib/ask-user/extension.ts`), so its settings gate, session lookup, async
open/supersede/submit/cancel lifecycle, `pi-web.ask.answers` follow-up,
persistence, SSE, and card are unchanged. The inline adapter registers the same
`createAskUserToolDefinition` factory from `lib/ask-user/portable/tool.ts` and
injects `open` directly, without going through the bridge.

## License

MIT. This package contains substantial code copied from Pi Web; see
[`LICENSE`](./LICENSE) for the retained notice.
