# Harness refactor (research-only runner)

The one-off evaluation harness was reduced from 24 modules under
`lib/ask-user/eval/` plus `scripts/ask-user-behavior-eval.mjs` (3089 lines) to a
single runner and its focused test under this task's `research/` directory
(1367 + 233 = 1600 lines, about 52% of the previous 3089). No committed product
`ask_user` logic changed. The observed raw report
(`test-results/ask-user-behavior-eval/`) was not rerun or altered by this refactor;
`research/results.md` was subsequently expanded with the per-trial observations.

## What the runner keeps

- The same four fixed scenarios (blocking fact, blocking scope, nonblocking,
  unavailable) and the same 4 × 2 × 3 = 24-turn cap; `buildTrialMatrix` refuses
  more before any model call.
- Old metadata from `922f7e1:lib/ask-user/tool.ts` and current metadata from the
  worktree, extracted with the TypeScript AST (direct string-literal
  `promptSnippet` / `promptGuidelines` only; ambiguous, malformed or non-literal
  sources fail closed).
- Isolated temp run root; every session file is asserted outside the user
  session root.
- Bounded prompt execution: a timeout aborts and waits for both the abort and
  the prompt; an abort that does not settle is unresolved, stops the run before
  the next trial, and keeps the temp files. Cleanup never claims "removed" when
  it did not remove.
- Redacted JSON + Markdown report written with mode `0600`; `--execute` is the
  only mode that calls a model.

## Reproducibility (no model calls)

```bash
# Focused invariants (budget, isolation, metadata, redaction, halt/cleanup, report)
node --test .trellis/tasks/09-25-ask-user-behavior-evaluation/research/ask-user-behavior-eval.test.mjs

# Scenario matrix + old/current metadata + extractor matches the live tool
node .trellis/tasks/09-25-ask-user-behavior-evaluation/research/ask-user-behavior-eval.mjs --plan

# Offline proof the two sides differ only in ask_user metadata (real settings,
# temporary session files; no model calls)
node .trellis/tasks/09-25-ask-user-behavior-evaluation/research/ask-user-behavior-eval.mjs --self-check
```

`--execute` is the paid path and was not run in this refactor:

```bash
node .trellis/tasks/09-25-ask-user-behavior-evaluation/research/ask-user-behavior-eval.mjs --execute
```

The path only moves with the task directory; the runner finds the repository
root by walking up to `package.json`, so archiving does not break it.

## Refactor verification

| Check | Result |
| --- | --- |
| `node --test …/ask-user-behavior-eval.test.mjs` | 9 pass / 0 fail |
| `… --plan` | exit 0; extractor matches the live tool |
| `… --self-check` (real settings, temp sessions) | exit 0; 11 checks pass |
| `… --trials 4 --plan` | exit 2; refuses 32 turns with no model call |
| `node_modules/.bin/tsc --noEmit` | exit 0 |
| `npm run lint` | no issues |
| `XDG_STATE_HOME= npm test` | 1411/1411 pass |

These focused tests live under `research/` on purpose (the delegated task asked
for a research-only runner), so they are outside the five `npm test` globs and
are run explicitly. The default `--out` is the same gitignored
`test-results/ask-user-behavior-eval/` directory, so a future `--execute`
reproduces the published report shape.
