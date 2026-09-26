# Minimal host fixture

`render.mjs` loads `../AskUserView.tsx` through `jiti` and renders it with
`react-dom/server`. It imports **no** Pi Web module and sets **no**
`--pi-ask-*` variable, so it proves the component renders with its
`light-dark()` / system-font fallbacks alone.

```bash
node lib/ask-user/portable/react/fixture/render.mjs
```

The script renders an ask with a single-choice question, a multiple-choice
question, both custom inputs, the supplement box and the action bar; then it
drives the host-neutral controller into a locked `submitting` state and renders
the locked view with a per-question summary. It fails loudly if any control or
fallback is missing.

Real-browser keyboard interaction is not automated (the repository has no DOM
test harness). Run the script, paste the printed markup into a page if you want
to click through it by hand, and record the observation in the task's
`research/fixture-evidence.md`.
