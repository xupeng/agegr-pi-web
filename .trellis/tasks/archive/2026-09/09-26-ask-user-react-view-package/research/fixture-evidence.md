# Fixture evidence — shared React `AskUserView`

Task: `09-26-ask-user-react-view-package` (deliverable R7).

## What the fixture is

`lib/ask-user/portable/react/fixture/render.mjs` loads `../AskUserView.tsx`
through `jiti` and renders it with `react-dom/server`. It imports **no** Pi Web
module and sets **no** `--pi-ask-*` variable, so it exercises the
`light-dark()` / system-font fallback path. It fails via `assert` if any of the
interactive controls or fallbacks are missing.

## Command

```bash
node lib/ask-user/portable/react/fixture/render.mjs
```

Exit code `0`. Full output is in `fixture-output.txt`. Header:

```
fixture OK: AskUserView renders without any Pi Web import or host CSS variable
  live markup: 10395 bytes
  locked markup: 10600 bytes
  labels: 12 keys, locale default 'en'
```

The script asserts (and the markup confirms) that the live render contains:
`role="dialog"` + `aria-label`, `role="radiogroup"`, `role="group"`,
`role="radio"`, `role="checkbox"`, both `class="pi-ask-input"` custom inputs,
the `class="pi-ask-textarea"` supplement box, the submit and cancel buttons, and
the fallback `light-dark(` colours plus the `-apple-system, system-ui` font
stack. It then drives the pure controller into a locked `submitting` state and
asserts the locked render carries
`role="status" aria-live="polite" tabindex="-1"`, a per-question
`pi-ask-summary-check`, and the submitted status text.

A condensed slice of the live markup (the `<style>` body omitted):

```html
<div class="pi-ask" role="dialog" aria-label="Questions from the agent">
  <div class="pi-ask-header">…<div class="pi-ask-counter" role="status" aria-live="polite">0 of 2 answered</div></div>
  <div class="pi-ask-questions">
    <div class="pi-ask-question">… <div class="pi-ask-options" role="radiogroup" aria-labelledby="pi-ask-fixture-ask-q-0">
      <button type="button" class="pi-ask-option" role="radio" aria-checked="false" tabindex="0">…○ Development</button>
      <button type="button" class="pi-ask-option" role="radio" aria-checked="false" tabindex="-1">…○ Production live</button>
    </div> … <input type="text" class="pi-ask-input" aria-label="Type your own answer…"/> …</div>
    <div class="pi-ask-question">… <div class="pi-ask-options" role="group" aria-labelledby="pi-ask-fixture-ask-q-1">
      <button type="button" class="pi-ask-option" role="checkbox" aria-checked="false">…☐ Europe</button>
    </div> … <input type="text" class="pi-ask-input" aria-label="Add details (kept alongside the selected options)…"/> …</div>
  </div>
  <div class="pi-ask-supplement">… <textarea class="pi-ask-textarea" aria-label="Additional info (optional)"></textarea></div>
  <div class="pi-ask-footer">… <button class="pi-ask-cancel">Cancel</button> <button class="pi-ask-submit">Submit</button></div>
</div>
```

## What is not verified here

**Real-browser keyboard interaction is not automated, and was not run for this
task.** The repository has no jsdom / testing-library harness, which is exactly
why the keyboard index maths lives in the pure `keyboard.ts` module and is
asserted with ordinary assertions instead. This agent could not open a real
browser against the component (loading the TSX tree needs the host's bundler,
and hand-building a hydration page was out of scope), so the following remain
manual checks per `design.md`:

- Tab enters a single-choice group exactly once (one tab stop), not once per
  option.
- `ArrowDown` / `ArrowUp` / `Home` / `End` move the selection and the focus
  together; `Space` toggles a checkbox; arrow keys do nothing in a checkbox
  group.
- On lock, focus lands on the status row instead of `<body>`.

The structural assertions in `AskUserView.test.mjs` cover the roles, ARIA
attributes, roving `tabindex` values, the decorative glyphs and the focus
target; the arithmetic behind the arrow keys is covered by
`keyboard.test.mjs`. What is *not* covered is the browser's dispatch of a real
key event to those handlers.

## Verification run for this task

Baseline source: the repository's own `node_modules`, installed by npm alone —
`node_modules/.pnpm/`, `node_modules/.ignored/` and `node_modules/.modules.yaml`
are all absent, `node_modules/.package-lock.json` is present, and the only
lockfile is `package-lock.json` (no `pnpm-lock.yaml`). `eslint . -f json`
reported 529 files. Counts below are from that one tree.

```text
node --test lib/ask-user/portable/react/*.test.mjs      → tests 33, pass 33, fail 0
node_modules/.bin/tsc --noEmit                          → exit 0
npm run lint                                            → "ESLint: No issues found" (0 error / 0 warning, 529 files)
env -u NODE_PATH XDG_STATE_HOME= npm test               → tests 1545, pass 1545, fail 0
node --test lib/ask-user/mcp-view-html.test.mjs         → tests 17, pass 17, fail 0   (unchanged)
node --test lib/ask-user/portable/view-controller.test.mjs → tests 11, pass 11, fail 0 (unchanged)
```

The new tests live under `lib/ask-user/portable/react/`, inside the `npm test`
glob. No `lint` diagnostic appeared, so no rule-level attribution is needed.
`next build` was never run.
