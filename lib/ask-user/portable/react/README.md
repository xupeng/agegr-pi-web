# `AskUserView` — shared React view

Host-neutral React rendering for the `ask_user` questions. One component and
one accessibility implementation are shared by every host; a host only supplies
the display copy and a palette mapping.

```
lib/ask-user/portable/view-controller.ts   pure form state (no framework)
lib/ask-user/portable/react/AskUserView.tsx React view (peer: react)
        ↑ consumes
Pi Web  AskUserAppHost                     host adapter: copy + CSS vars + commands
PA      its own host adapter               same, another repository
```

The view never imports a host: no `@/` alias, no `lib/i18n`, no Next, no
`node:`, no host palette module. It only reads props and the
`--pi-ask-*` CSS namespace. `react` is a peer dependency; the host also provides
`react-dom` (the component itself never imports it).

## Public API

```tsx
import { AskUserView } from "./AskUserView";

<AskUserView
  key={ask.askId}                 // remount when the open ask changes
  ask={ask}                       // { askId, questions }
  locale="zh-CN"                  // optional, defaults to "en"
  labels={{ title: "…" }}         // optional, per-key override
  disabled={false}                // optional, host-side read-only switch
  onSubmit={(askId, answers, supplement) => submitAsk(askId, answers, supplement)}
  onCancel={(askId) => cancelAsk(askId)}
/>
```

- `onSubmit` receives the `buildAskUserSubmission` payload: untouched questions
  are skipped, blank custom text and a blank supplement are omitted.
- `onCancel` receives only the `askId`.
- Both callbacks may return a promise. A **rejection unlocks the form** and
  shows `labels.actionFailed`, so the user can retry. The "answers may already
  be in flight" guarantee is the in-flight lock (`submitting` / `cancelling`),
  not the rejection path.
- `AskUserViewContent` is also exported: the hook-free render surface, used by
  the structural tests to render a seeded state. Prefer `AskUserView`.

## Bundled copy and label overriding

```ts
ASK_USER_VIEW_LOCALES = ["en", "zh-CN", "zh-TW"]
DEFAULT_ASK_USER_VIEW_LOCALE = "en"
askUserViewLabels(locale): AskUserViewLabels
```

`AskUserViewLabels` is exactly these 12 keys:

| key | used for |
| --- | --- |
| `title` | dialog title and `aria-label` |
| `answered` | counter, template with `{count}` / `{total}` |
| `otherPlaceholder` | single-choice custom input (placeholder + `aria-label`) |
| `multipleOtherPlaceholder` | multiple-choice custom input (placeholder + `aria-label`) |
| `supplementTitle` | supplement label and textarea `aria-label` |
| `supplementPlaceholder` | supplement placeholder |
| `submitted` | locked status after submit |
| `cancelling` | locked status after cancel |
| `hint` | footer hint |
| `cancel` | cancel button |
| `submit` | submit button |
| `actionFailed` | error shown after a rejected callback |

Resolution order: `askUserViewLabels(locale ?? "en")`, then every defined key
of `labels` overwrites it. A host that passes all 12 keys fully controls the
display text; the `{count}` / `{total}` interpolation stays in the view.

### Why the bundled table is not a double-write point

Pi Web overrides **all 12 keys** with its own `lib/i18n` translations, so it
never reads the bundled table. Personal Assistant uses the bundled table
untouched. Each side's wording therefore has exactly one owner. The bundled
strings are a one-time transcription of
`lib/i18n/messages/{en,zh-CN,zh-TW}.ts` (plus `chat.cancel` / `chat.submit`);
if the two drift, only the Personal Assistant wording changes — Pi Web is
unaffected. **Do not "unify" them** by making Pi Web read the bundled table or
by adding a sync step; that would turn two independently-owned strings into one
coupled pair for no gain.

## CSS variables

The component reads **only** the `--pi-ask-*` namespace. A host maps its own
tokens onto the namespace on any ancestor element; the component falls back to
`light-dark()` / a system font stack when a variable is absent, so it stays
readable in a plain document with no host styling at all.

| variable | meaning | component fallback |
| --- | --- | --- |
| `--pi-ask-surface` | card body background | `light-dark(#ffffff, #1b1b1d)` |
| `--pi-ask-field` | header / footer / detail / unselected option / inputs | `light-dark(#f6f6f7, #232326)` |
| `--pi-ask-field-hover` | hovered unselected option | `light-dark(#ececee, #2b2b2f)` |
| `--pi-ask-border` | borders | `light-dark(#d9d9de, #3a3a40)` |
| `--pi-ask-text` | body text | `light-dark(#111114, #ececef)` |
| `--pi-ask-text-muted` | counter, detail, locked status | `light-dark(#5c5c66, #a5a5b0)` |
| `--pi-ask-text-dim` | footer hint | `light-dark(#8a8a94, #7d7d88)` |
| `--pi-ask-accent` | selected background / focus ring | `light-dark(#2f6fed, #a4c2f4)` |
| `--pi-ask-accent-contrast` | selected text | `light-dark(#ffffff, #14161a)` |
| `--pi-ask-success` | summary `✓` | `#16a34a` |
| `--pi-ask-danger` | error text | `#ef4444` |
| `--pi-ask-max-width` | container max width | `820px` |
| `--pi-ask-font-size-offset` | added to every font size | `0px` |
| `--pi-ask-font-family` | font stack | `-apple-system, system-ui, "Segoe UI", Roboto, sans-serif` |

Notes:

- The component sets `color-scheme: light dark` on `.pi-ask`; `light-dark()`
  needs it. A host that pins a scheme can override it with a more specific
  rule.
- `--pi-ask-accent-contrast` must stay a separate variable: in a dark theme
  `--pi-ask-accent` is a light blue, and hard-coded white text would fail
  contrast.
- `--pi-ask-success` is `#16a34a` (the value the rest of Pi Web uses), not the
  retired native card's `#10b981`.
- The stylesheet is rendered by the component itself as one `<style>` element;
  the package is a `private: true` TS-direct-load Pi extension and cannot
  assume a CSS loader.

Pi Web mapping example:

```tsx
<div
  style={
    {
      "--pi-ask-surface": "var(--bg-panel)",
      "--pi-ask-field": "var(--bg)",
      "--pi-ask-field-hover": "var(--bg-hover)",
      "--pi-ask-border": "var(--border)",
      "--pi-ask-text": "var(--text)",
      "--pi-ask-text-muted": "var(--text-muted)",
      "--pi-ask-text-dim": "var(--text-dim)",
      "--pi-ask-accent": "var(--accent)",
      "--pi-ask-accent-contrast": "var(--accent-contrast)",
      "--pi-ask-max-width": "var(--chat-content-max-width)",
      "--pi-ask-font-size-offset": "var(--chat-font-size-offset, 0px)",
    } as React.CSSProperties
  }
>
  <AskUserView … />
</div>
```

## Accessibility contract

| item | behaviour |
| --- | --- |
| single-choice group | `role="radiogroup"` + `aria-labelledby` pointing at the question text (`id="pi-ask-<askId>-q-<index>"`) |
| single-choice option | `role="radio"` + `aria-checked` + roving `tabindex` (one tab stop per group: the selected option, else the first) |
| single-choice keys | `ArrowDown` / `ArrowRight` next, `ArrowUp` / `ArrowLeft` previous, `Home` / `End` first / last; with no selection a forward key picks the first option and a backward key picks the last; moving selects and focuses |
| multiple-choice group | `role="group"` + `role="checkbox"`; every option keeps its default tab stop; `Space` toggles; arrow keys are not handled |
| state glyphs | `○ ◉ ☐ ☑ ✓ ✎` are all `aria-hidden="true"`; state is carried by `aria-checked` |
| counter | `role="status"` + `aria-live="polite"` |
| locked status | `role="status"` + `aria-live="polite"` + `tabindex="-1"`; focus moves here when the lock engages so disabling the controls does not strand focus on `<body>` |
| error | `role="alert"` |
| text inputs | the custom input and the supplement textarea each carry an `aria-label` |
| container | `role="dialog"` + `aria-label`; **no** `aria-modal` — a cross-boundary focus trap is not implemented, so claiming modality would be false |
| focus ring | one `:focus-visible` rule in the stylesheet; input controls set no inline `outline: none` |

## Host integration (Personal Assistant example)

1. Render `<AskUserView>` inside the container that holds the open ask, keyed by
   `ask.askId` so a new ask remounts the form.
2. Map the `--pi-ask-*` variables on an ancestor element (or omit them to keep
   the `light-dark()` fallbacks).
3. Pass `locale` and/or `labels`; omit both to use the bundled table.
4. Implement `onSubmit` / `onCancel` as command senders only. Any open-ask
   lifecycle (supersede, close, retry) stays with the host, not the view.
5. A host without React can drive `../view-controller.ts` directly and render
   its own markup; it must then repeat the accessibility contract above.

## Unverified

- Real-browser keyboard interaction (Tab into a group once, arrow selection,
  `Space` on a checkbox, focus landing on the locked status row) is verified
  manually only; the automated suite asserts structure, ARIA and the pure
  keyboard maths, not a live browser. See the task's
  `research/fixture-evidence.md`.
- How the component looks after iOS/WebKit font autosizing. The retired iframe
  view needed an explicit `viewport` meta and `text-size-adjust`; the shared
  component inherits the host document's viewport, which was not measured here.
- Non-React hosts rendering from the controller themselves.
