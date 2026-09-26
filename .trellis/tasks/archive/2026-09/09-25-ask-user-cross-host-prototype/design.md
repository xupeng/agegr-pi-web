# Cross-host ask_user plan

## Boundaries

The completed `09-25-ask-user-adoption-portability` iteration and merged fork PR #4 establish the current Pi Web behavior. This iteration contains independent behavioral measurement, then a portable extension/core prototype in Pi Web, followed by a personal-assistant host integration in its own repository. The PA task must not import Pi Web's Next routes or reuse its global wrapper registry.

## Data flow

1. The extension owns a bounded `questions[]` schema, prompt metadata, validation and an injected `open` capability. Without a valid bridge, tool execution fails before returning `terminate: true`; it never claims to have posted a card.
2. Pi Web keeps its current adapter and lifecycle: open/supersede/store, browser snapshot/SSE, submit/cancel, and answer follow-up. Moving shared logic must leave its observable protocol unchanged.
3. PA admits a locally installed entry through its existing controlled `$PA_HOME/extensions/` loader (not SDK package auto-discovery), and exposes the tool and prompt hints **only** for interactive turns. Its host persists ask state and projects it through shared Zod wire schemas, authenticated routes, SSE snapshot reconciliation and a compact chat card.
4. PA closes AgentSession after each turn (`src/server/host.ts:1045-1066`). A submitted answer therefore needs a distinct host-owned continuation using the saved Pi conversation, not `host.submit` as if the user wrote a new ordinary message. The continuation has no inherited write permit; pending/accepted/undeliverable outcomes remain durable and explicit. Validate the SDK follow-up behavior in an isolated prototype before committing to an adapter API.
5. A new ordinary message cancels the open ask before admitting the message; old askId submissions are stale. Unanswered asks survive restart with the same askId. Submission, supersede, cancellation, conversation deletion, stop and restart have idempotent/stale-safe transitions.

## Integration constraints

- Both hosts pin Pi SDK `0.85.1`. Keep the extracted package's SDK dependencies as peers and verify package discovery/local installation separately from PA's fixed-directory admission; an npm package setting does not make PA load a tool.
- Check how a loaded external extension receives a per-conversation, per-run host bridge in Stage A. An adapter must be opt-in, bound to the selected origin and live conversation, and fail closed without that binding. Never rely only on model prompt instructions for scheduled isolation. An SDK loader limitation found in the prototype must be reported and resolved in the plan before PA implementation expands.
- Separate ask answer acceptance from delivery success. Persist the question and any submission transition before acknowledging it; do not silently replay an uncertain delivery and risk duplicate turns. Report uncertain state for reconciliation. The browser is not authority for ask state or write permissions.
- PA's independent `feat/pi-pa-commands` commit `945eb94` owns `.pi/settings.json` and `.pi/extensions/pa.ts`; they are not modified or used as the install target. Recheck branch/merge state before creating an ask_user branch. Use temporary `$PA_HOME` fixtures for test installation and restart tests. Keep repository commits and PRs separate; PA's task is not a child across Git repositories.

## Verification order

Run the bounded paired behavioral evaluation in isolated sessions, extract and test the local package and Pi Web adapter, then exercise the PA bridge in a fixture server with restart and scheduled-origin cases. Pi Web canonical checks: `node_modules/.bin/tsc --noEmit`, `npm run lint`, `XDG_STATE_HOME= npm test`; never run `next build` during development. PA checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` before `npm run test:e2e` (isolated mock server). Do not run PA's potentially mutating `test:live` without a separate authorization.
