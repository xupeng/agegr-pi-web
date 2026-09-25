# ask_user invocation guidance validation

## Scope

This iteration changes only `lib/ask-user/tool.ts` prompt metadata and its contract test. The actual async question/answer protocol and visibility policy are unchanged. Prompt metadata tests assert the instruction is present; they cannot demonstrate that a provider follows it.

## Representative behavioral scenarios

| Input to an enabled Pi Web main session | Expected observation |
| --- | --- |
| "Update the migration for our production database, but I have not told you which database we use." | When no local evidence resolves the database, post one `ask_user` question rather than end with a prose question. |
| "Export this report. I need to choose CSV or JSON before you implement it." | Post one `ask_user` choice question, then wait for the answer. |
| "The export works now. Anything else I could consider later?" | Respond normally; do not open a blocking question card for optional advice. |
| Same blocking scenario in a session with `ask_user` disabled or Chat only. | Ask in prose, do not attempt an unavailable tool. |

One post-change Pi Web API smoke used an isolated temporary cwd, `toolNames: ["read"]`, `thinkingLevel: "minimal"` and the configured default `sub2api-codex/gpt-6-sol`. For "Prepare a database migration for our production database, but I have not specified which database engine we use. Do not guess or edit files until that is clarified.", the completed session reported a pending `ask_user` form with two questions (database engine/version and intended migration changes). The session was deleted through its API and the temporary cwd removed. This is one observation, not a call-rate estimate. No controlled before/after provider run has been performed: the parent commit has previous metadata but no isolated same-model/same-settings pre-change observations. No nonblocking or tool-unavailable live scenario was exercised. Therefore neither an improvement magnitude nor avoidance rate is claimed.

## Local checks

- `node --test lib/ask-user/tool.test.mjs`: 4/4 pass after the scoped change.
- `node_modules/.bin/tsc --noEmit`: pass; `npm run lint`: pass, no issues.
- First `npm test` with inherited `XDG_STATE_HOME` failed 1 unrelated pre-existing `lib/skill-lock.test.mjs` assertion: it passes an explicit `xdgStateHome: undefined` but default initialization reads the inherited environment path. The file is unchanged from HEAD; `XDG_STATE_HOME= node --test lib/skill-lock.test.mjs` passes 4/4.
- Final `XDG_STATE_HOME= npm test`: 1411/1411 pass. `node_modules/.bin/tsc --noEmit`, `npm run lint` and `git diff --check` pass after review.
- Dependency tree includes npm's `node_modules/.package-lock.json` and the lockfile's nested `eslint-plugin-react-hooks@7.0.1`; no pnpm metadata was found. This is the existing tree, not a fresh `npm ci` baseline; do not claim a clean-install comparison.
- `npm run dev` on `127.0.0.1:30141`: `GET /` and `GET /api/models` returned HTTP 200 after the initial compile. This verifies server availability, not the visual browser layout.
