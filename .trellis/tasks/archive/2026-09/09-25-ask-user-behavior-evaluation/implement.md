# Execution checklist

1. Verify tool availability and the model selection without changing the live 8505 server. Build an isolated harness or checkout that substitutes only the old/new prompt metadata.
2. Run the four recorded scenarios three times per side (maximum 24 turns). Capture each result and its session/tool evidence, then remove temporary sessions and files.
3. Review classification and failures, write a comparative report with raw observations and caveats. Run focused harness checks, `tsc --noEmit`, `npm run lint` and `XDG_STATE_HOME= npm test` if tracked code changes.
