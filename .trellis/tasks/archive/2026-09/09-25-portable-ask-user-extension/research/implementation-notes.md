# Portable `ask_user` implementation notes

Companion to `sdk-discovery-and-bridge.md`; records what was built, the final
bridge contract, and the verification evidence for task
`09-25-portable-ask-user-extension`.

## What shipped

A local, package-discoverable Pi extension at
`lib/ask-user/portable/` (a real `package.json` with
`"pi": { "extensions": ["./index.ts"] }`, `private: true`, MIT `LICENSE`, and
SDK peers pinned to `0.85.1`). It owns only the portable core:

- `types.ts` — bounded DTOs and limits (moved out of `lib/ask-user/types.ts`);
- `validation.ts` — the single ask/submission validator and clone/require
  helpers (extracted from the private helpers in `lib/ask-user/store.ts`);
- `format.ts` — `renderAskUserAnswersText` / `renderSupersededAskText`;
- `tool.ts` — `createAskUserToolDefinition` (same TypeBox schema and metadata
  as the former `lib/ask-user/tool.ts`, with shared runtime validation);
- `bridge.ts` — the explicit host bridge contract and resolver;
- `index.ts` — the Pi package entry that registers the bridge-backed tool.

Pi Web now imports the shared core:

- `lib/ask-user/types.ts` re-exports `./portable/types` and keeps only the
  Pi Web-only `ASK_USER_ANSWERS_CUSTOM_TYPE` and `AskUserCloseResponse`.
- `lib/ask-user/tool.ts` re-exports `./portable/tool`.
- `lib/ask-user/store.ts` keeps the in-memory open/supersede/submit/cancel state
  machine and outcome computation and delegates validation/formatting to the
  package. Its public export surface is unchanged, so `lib/ask-user/index.ts`
  and `lib/rpc-manager.ts` did not need behavioral changes.

Pi Web's inline adapter (`lib/ask-user/extension.ts`) is unchanged: it still
gates on `isAskUserEnabled()` and injects `open` directly from the live
wrapper. It does **not** use the bridge, so visibility, SSE, persistence,
follow-up delivery and cards are untouched. The bridge is for external hosts
that install the package.

## Final bridge contract

- Channel: `pi.ask-user.bridge:resolve-open:v1`; request carries
  `version: 1`, `conversationId`, and validated `questions`.
- At tool execution the package validates the questions, emits the channel on
  the loader-scoped `pi.events` bus with `{ register(open) }`, requires exactly
  one **synchronous** `register`, awaits `open`, and requires a durable ack
  (`{ ask: { askId, askedAt, questions } }`, non-empty id/timestamp/questions).
- Closed on every failure: no bridge, >1 bridge, post-await registration,
  malformed ask, host rejection, missing/invalid ack. No ambient global and no
  default adapter.

## Loader paths verified

- **SDK package discovery** (`research/fixture/probe.mjs`, and the automated
  `lib/ask-user/portable/discovery.test.mjs`): the directory resolves through
  `pi.extensions` to `index.ts`, and the tool negotiates one inline host over
  the shared event bus.
- **PA fixed-directory loader** (`research/fixture/pa-probe.mjs`): a temp
  `$PA_HOME`-style `extensions/ask-user` **copy** of the package (not a
  symlink) is admitted by PA's real `resolveRuntimeExtensions`. The loaded
  entry's realpath is that copy, the inline host is called, a forged question
  ack fails closed, and global/entry/tool disables remove the tool. `cwd` and
  `agentDir` stay in the temp dir. The probe imports the PA repo read-only and
  does not change it; the operator's live extension switch and `pi install`
  were not run.
- **Pi Web inline adapter** (`lib/ask-user/extension.test.mjs`): registers only
  while enabled, injects `openAsk` with the live session, and fails when the
  session is gone.

The old fixture package (`pa-home/extensions/ask-user/`) was removed; both
probes now target the real package directory, so the fixture no longer carries
a reduced schema/ack. `probe.mjs` still uses the isolated
`SettingsManager.inMemory({ packages: [<dir>] })`, so no real
`~/.pi/agent/settings.json` or `pi install` is involved.

## Verification (this checkout, single `package-lock.json` tree)

Dependency tree check: no `node_modules/.pnpm`, no `node_modules/.modules.yaml`;
`node_modules/.package-lock.json` present (npm); nested
`eslint-config-next/node_modules/eslint-plugin-react-hooks` present — a clean npm
tree, not a pnpm/npm mix. `npm ci` was not re-run; counts are from this tree.

| Gate | Command | Result |
| --- | --- | --- |
| Types | `node_modules/.bin/tsc --noEmit` | 0 errors |
| Lint | `npm run lint` (`eslint .`) | 504 files, 0 errors, 0 warnings |
| Unit | `XDG_STATE_HOME= npm test` | 1443 tests, 0 fail |
| SDK probe | `node …/fixture/probe.mjs` | passed |
| PA probe | `node --import …/tsx …/fixture/pa-probe.mjs` | passed (plus Node `DEP0205` from the PA tsx loader) |

No model call, npm publish, `next build`, PA repo change, or git commit was
made. `.next/dev/lock` was already present; no build was run.

## Check review (same npm tree, no `npm ci`)

Baseline source: this checkout's npm tree (`node_modules/.package-lock.json`
present; no `node_modules/.pnpm` or `node_modules/.modules.yaml`; nested
`eslint-plugin-react-hooks@7.0.1`). Compared with the implementation note
above, which used the same tree and reported 504 lint files / 1430 tests.

| Gate | Result | Attribution |
| --- | --- | --- |
| `node_modules/.bin/tsc --noEmit` | 0 errors | no new diagnostics |
| `npm run lint` and `eslint . -f json` | 504 files, 0 errors, 0 warnings | file count unchanged; plugin still 7.0.1 |
| `XDG_STATE_HOME= npm test` | 1443 pass, 0 fail | +13 tests for copy discovery, ack identity, supersede failure, and malformed runtime inputs |

Fixes applied in review:

- SDK and PA probes/tests load a temp **copy**. The copy has no
  `node_modules` and cannot resolve the SDK peers by Node walk-up; the host
  loader still loads `index.ts` via its aliases. PA `cwd`/`agentDir` stay in
  that temp dir and the temp dir is removed in `finally`.
- A host ack must echo the validated question identity. A present `superseded`
  must be `reason: "superseded"` with a bounded string `unansweredIds` list.
  Either failure throws `AskUserBridgeError` and the tool does not return
  `terminate: true`.
- Malformed runtime questions/answers throw `PendingAskValidationError` before
  an open ask is replaced or a submission closes it.

Not claimed: `pi install` writing real settings, npm publication, PA Stage B,
scheduled-run exclusion, or a live PA service. Browser e2e is not applicable
to this extraction (no click/viewport change) and was not run.

## Merge-order compatibility

The preceding behavior-evaluation PR merged into `personal` at `f7ccb2e`.
Its archived research runner read the *current* tool metadata from
`lib/ask-user/tool.ts` via a TypeScript AST `defineTool` search. This task
moves that definition to `lib/ask-user/portable/tool.ts`, leaving the old path
as a re-export. After fast-forwarding this branch to the merged base, the
archived runner now reads current metadata from `portable/tool.ts` when it
exists, but still reads old metadata from `922f7e1:lib/ask-user/tool.ts`.
Its offline test, `--plan`, and `--self-check` exercise the post-merge layout.
The original 24 observations and their raw report are unchanged; no paid
trials were repeated.
