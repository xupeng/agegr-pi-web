# Harness check verification

> Later status: this file is the pre-trial snapshot. The runner moved to `research/ask-user-behavior-eval.mjs` (`harness-refactor.md`). The 24 paid trials, classifications, and cleanup are in `results.md`. The "not run" sentence below is historical, not the current result.

Checked the evaluation harness before any paid model trial. No live `--execute` run, no Next server restart, no PA repository changes, no commit.

## Commands

| Check | Result | Notes |
| --- | --- | --- |
| `XDG_STATE_HOME= node --experimental-strip-types --test "lib/ask-user/eval/**/*.test.mjs"` | 64 pass / 0 fail | Focused harness tests only |
| `node_modules/.bin/tsc --noEmit` | exit 0 | Existing checkout tree |
| `npm run lint` | no issues | eslint 9.39.4, eslint-config-next 16.3.5, nested eslint-plugin-react-hooks 7.0.1 |
| `node scripts/ask-user-behavior-eval.mjs --trials 4 --plan` | exit 2 | Refused 32 calls; no model call |
| `node scripts/ask-user-behavior-eval.mjs --plan` | exit 0 | 24 planned calls; extractor matched the live tool. No model call |

Baseline source: the existing `node_modules` from `package-lock.json` (no `node_modules/.pnpm`, no `.modules.yaml`). This was not a fresh `npm ci`.

## Not covered

The four-scenario old/new model trials have not been run. Contract tests and this offline harness check do not establish model behavior.
