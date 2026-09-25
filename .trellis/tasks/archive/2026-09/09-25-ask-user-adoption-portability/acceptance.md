# Acceptance review

## Child: invocation guidance

- `lib/ask-user/tool.ts` now directs an available `ask_user` toward missing facts, scope choices and decisions that block the requested work, and away from optional/conversational questions. It retains one grouped call, run termination and follow-up delivery.
- `lib/ask-user/tool.test.mjs` checks the actual tool metadata and existing execution behavior. The four representative behavioral scenarios are recorded in `09-25-ask-user-invocation-guidance/research/validation.md`, not asserted as if metadata tests were model results.
- One post-change isolated Pi Web run with `sub2api-codex/gpt-6-sol` posted two clarification questions. There is no paired pre-change result; improved call rate, negative-scenario avoidance and model-independent compliance are unverified.

## Child: extension feasibility

- `09-25-ask-user-standalone-extension/research/feasibility.md` documents portable tool/core logic, required host adapter and Web state, controlled installation, scheduled-run isolation, write permission separation, lifecycle risks and a follow-up test matrix. Neither personal assistant nor a standalone package was modified.
- The conclusion is conditional: a reusable Pi tool is technically feasible, but its Pi Web browser form is not installable as a drop-in extension without explicit host integration.

## Cross-child verification

- `node --test lib/ask-user/tool.test.mjs`: 4/4 pass.
- `node_modules/.bin/tsc --noEmit`: pass. `npm run lint`: no issues. `git diff --check`: pass.
- `XDG_STATE_HOME= npm test`: 1411/1411 pass. With the inherited nonempty `XDG_STATE_HOME`, the untouched `lib/skill-lock.test.mjs` default-parameter assertion fails (1410/1411); this is an environment-dependent baseline, not a change in `ask_user`.
- Dev server on `127.0.0.1:30141`: `GET /` and `GET /api/models` returned HTTP 200. No new visual UI was built, and no browser screenshot is claimed.
- The current `node_modules` is an existing npm tree with `eslint-plugin-react-hooks@7.0.1` under `eslint-config-next`; it was not reinstalled via fresh `npm ci` for this task.
- Unrelated edits to `.pi/agents/trellis-{implement,check,research}.md` are not part of this task and must not be staged.
