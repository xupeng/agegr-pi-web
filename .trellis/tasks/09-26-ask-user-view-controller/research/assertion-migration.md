# Assertion migration: `mcp-view-html.test.mjs` → `view-controller.test.mjs`

Task: `09-26-ask-user-view-controller` (deliverable R2).

## Scope and method

- Source of truth: `lib/ask-user/mcp-view-html.test.mjs` at the working-tree
  revision this task was implemented against. That file contains **17**
  `test(...)` cases in **510** lines. `prd.md`/`design.md`/`implement.md`
  describe it as "376 lines, 18 tests"; that snapshot predates the current
  revision. Every one of the 17 current cases is classified below, so no
  assertion is dropped regardless of the count drift.
- Behaviour reference for the semantics: the deleted React card
  (`git show 367d18c^:components/AskUserCard.tsx`) plus the inline script's
  current transitions. The card is a reference only, never a dependency.
- Classification per `design.md`:
  - **behavior → controller**: pure form state/transitions/payload. Must have
    an equivalent assertion in `view-controller.test.mjs`.
  - **view → B**: rendering, DOM, keyboard, focus, a11y. Stays with the view
    subtask; no controller assertion (the unchanged `mcp-view-html.test.mjs`
    remains the coverage for now).
  - **pipeline → C**: token mirroring, font-byte installation, `color-scheme`,
    JSON-RPC transport. Slated for deletion with the Apps pipeline.
  - **mixed-split**: one old test mixes classes and is split explicitly.
- New assertion names refer to test titles in
  `lib/ask-user/portable/view-controller.test.mjs`.

## Mapping table

| Old test (line) | Old assertion focus | Class | New assertion(s) | Equivalence note |
| --- | --- | --- | --- | --- |
| `:137` `view renders a projection and posts only ask_submit for a submit` | Envelope `ask_submit` with `sessionId`/`askId`; no other command | **mixed-split** | `buildAskUserSubmission skips empty questions and omits blank fields` (payload) | See "Split 1" below. The `answers[]` shape is controller-owned; the `sessionId`/`askId` envelope and "posts only ask_submit" are host/view plumbing (→B). |
| `:148` `a rejected action keeps the error visible and the retry/cancel controls usable` | Rejection surfaces an error and leaves retry/cancel usable | **behavior → controller** (+ view) | `a rejected action surfaces the error and unlocks so the user can retry` | Equivalent: `action-failed` sets `error` and returns `status` to `idle`, so `isLocked` is false — that is the whole of "retry/cancel usable". Rendering the error footer is view → B. No divergence. See "Split 2". |
| `:164` `question ids that collide with Object.prototype do not crash the render` | `__proto__`/`constructor` ids survive | **behavior → controller** | `question ids that collide with Object.prototype are stored safely` | Equivalent for the state half: `drafts` is a `Map`, so colliding ids are stored and read back, and `Object.prototype` is unchanged. The old render half ("Evil one"/"Evil two" shown) is view →B. |
| `:176` `a host response id that collides with Object.prototype is ignored` | JSON-RPC response-id index tolerates `__proto__` | **pipeline → C** | (none) | Not form behaviour: the controller has no request/response map. Explicitly recorded in Gaps (G2) rather than silently dropped; the unchanged view test still covers it until C deletes the transport. |
| `:182` `a host that omits Pi Web extras still renders with safe defaults` | Projection defaults render | **view → B** | (none) | Rendering/projection defaults, no controller state. |
| `:189` `submitting locks the view and shows the answered summary under each question` | Lock + per-question `✓ values · otherText`; a late click cannot rewrite it | **behavior → controller** | `submit and cancel lock the view and clear a previous error`; `questionSummary uses the raw option values plus trimmed custom text` | Equivalent for the state half: `submit-requested` → `submitting`/`isLocked`, and `questionSummary` yields `✓ yes` / `✓ eu · on dev only` from raw option values + trimmed custom text. The DOM half (disabled buttons/inputs, summary `display:block`, "late click cannot rewrite") is view →B; the controller exports `isLocked` so the view can gate dispatch, but the reducer itself has no locked guard by design (`design.md`: closure-free reducer, view gates). |
| `:225` `cancelling locks the view and reports the delivered cancel` | `ask_cancel` sent; view locked; inputs disabled | **behavior → controller** (+ view) | `submit and cancel lock the view and clear a previous error` | Equivalent for the state half: `cancel-requested` → `cancelling`/`isLocked`. The `ask_cancel` command shape and disabled inputs are view/host →B. |
| `:238` `the supplement box is forwarded with a submit only when it is not blank` | Blank supplement omitted; non-blank trimmed and forwarded | **behavior → controller** | `buildAskUserSubmission skips empty questions and omits blank fields` | Equivalent: `supplement.trim() === ""` omits the field; otherwise the trimmed value is returned. |
| `:256` `multiple questions keep options and custom text together; single questions stay exclusive` | Single: option clears text and vice versa. Multi: option + text coexist and both delivered. Placeholders differ. | **mixed-split** (behavior + view) | `single-choice options and custom text are mutually exclusive`; `multiple-choice options and custom text coexist and toggle`; `buildAskUserSubmission skips empty questions and omits blank fields` | Equivalent for the behaviour half, both directions and both delivery forms (`{id,values}` and `{id,values,otherText}`). The placeholder distinction (`otherPlaceholder` vs `multipleOtherPlaceholder`) and `aria-checked` are view →B. |
| `:289` `host tokens are mirrored into the frame and unusable values fall back` | Token mirroring + sanitization fallbacks | **pipeline → C** | (none) | Design classifies token mirroring as pipeline. |
| `:320` `the host's font bytes are installed as faces, and installed only once` | FontFace install + dedupe | **pipeline → C** | (none) | Design classifies font-byte installation as pipeline. |
| `:347` `font payloads the frame did not expect are never installed` | Font payload validation | **pipeline → C** | (none) | Design classifies font-byte installation as pipeline. |
| `:382` `color-scheme follows the host instead of the theme name` | `colorScheme`/`theme` fallback | **pipeline → C** | (none) | Design classifies `color-scheme` as pipeline. |
| `:397` `options expose radio and checkbox semantics with a roving tabindex` | `role`, `aria-checked`, roving tabindex, arrow/Home/End | **view → B** | (none) | Keyboard/focus/ARIA semantics belong to the view subtask. |
| `:453` `the answered counter and the locked footer are announced` | `aria-live` counter, locked `role="status"`, labels | **view → B** (+ behavior) | `answeredCount counts selections and non-blank custom text` (count rule) | The announcement mechanics (`aria-live`, focus move, `aria-label`) are view →B. The count rule itself (`values.length > 0 \|\| otherText.trim() !== ""`) is controller-owned and equivalently asserted. |
| `:471` `form controls inherit the host font and mobile text autosizing is off` | `font-family:inherit`, `text-size-adjust`, focus ring | **view → B** | (none) | CSS contract, no controller state. |
| `:485` `question blocks keep the native card's spacing and small metrics` | Grid gap, paddings, glyph opacity, hint colour | **view → B** | (none) | Visual metrics, no controller state. |

## Split details

### Split 1 — `:137`

One old test bundled three things:

1. `ask_submit` `answers[]` structure → **behavior → controller**:
   `buildAskUserSubmission ...` asserts `{ answers: [{ id, values }] }`, the
   `otherText` omission rule, and `supplement` omission.
2. The `sessionId`/`askId` envelope and "only `ask_submit` is posted" →
   **view/host → B**: the controller never sees session ids or command names.
3. "renders a projection" → **view → B**.

The behaviour half has a new equivalent; the other two are view-owned and still
covered by the unchanged view test until B replaces it.

### Split 2 — `:148`

One old test bundled the full reject path. Both halves are controller-owned:

1. A rejected callback surfaces `error` → **behavior → controller**:
   `action-failed` sets `state.error`.
2. "keeps ... the retry/cancel controls usable" → **behavior → controller**:
   `action-failed` also returns `status` to `idle`, so `isLocked(state)` is
   `false` and the view re-enables its controls.

Only the rendering of the error footer is view → B. The in-flight lock
(`submitting`/`cancelling`) is what carries the "answers may already have been
delivered" guarantee; the rejection path proves nothing was delivered, so
unlocking is correct.

## Gaps / intentional divergences (explicitly not silently dropped)

- **G1 — resolved: a rejection unlocks.** The first cut of this task kept the
  form locked after `action-failed`, copying the deleted `AskUserCard` (which
  never reset `status` on `catch` and therefore left a failed submit stuck
  forever). That was a regression against the current inline view, which
  unlocks and shows the error so the user can retry
  (`lib/ask-user/mcp-view-html.ts:605-623`, asserted by
  `mcp-view-html.test.mjs:148`, and documented by the `chat.askUserActionFailed`
  string "提问操作失败，可以重试。"). The controller now returns
  `status: "idle"` on `action-failed`. The "must not become editable again"
  guarantee for the slow/lost-response case is the **in-flight** lock
  (`submitting`/`cancelling`), not the rejection path. No divergence remains.
- **G2 — host response-id collision (`:176`).** Not a controller behaviour; the
  controller owns no JSON-RPC response-id index. No equivalent is required, but
  it is recorded here rather than treated as covered. Until the transport is
  deleted (C), `mcp-view-html.test.mjs` remains its only coverage.
- **G3 — locked reducer does not reject writes.** `design.md` makes the reducer
  closure-free and leaves gating to the view; there is no `locked` guard inside
  `toggle-option`/`set-other-text`. The old "late click cannot rewrite" assertion
  is therefore view →B (disabled controls). The controller only reports
  `isLocked` for the view to gate on. This is a deliberate boundary, not a
  coverage hole in the controller.
- **G4 — multiple-choice custom placeholder distinction.** `prd.md` R2 lists
  "多选自定义输入框占位区分" alongside the controller behaviours, but the
  placeholder string is presentation, not form state. `design.md`'s controller
  interface exposes no placeholder selector (and forbids view concerns), so this
  item is classified **view → B**, not migrated. The old `:256` case still asserts
  `otherPlaceholder` vs `multipleOtherPlaceholder` in the unchanged view test;
  the view subtask must keep it when it replaces the inline script.

## Behaviour assertions with no old counterpart (added, not migrated)

These are required by `prd.md` R1 but were not asserted in the old file; they
are new coverage rather than migrations:

- `the reducer returns a new state without mutating the input` (purity).
- `answeredCount counts selections and non-blank custom text` as a selector
  (the old file only asserted the rendered counter text).
- `questionSummary` returning `""` before lock (old only checked locked display).
- `the controller only imports relative modules (no React, @/, or node:)`
  (source assertion required by the acceptance criteria).

## Line-count evidence (behaviour vs pipeline)

**Method (`wc -l`; tests excluded from the aggregate).** The controller is a
whole new file. `mcp-view-html.ts` is split by top-level function boundary into
three buckets, with the remaining non-function HTML/CSP/init/listener scaffolding
counted as pipeline:

- behaviour functions (`mcp-view-html.ts`): `draftFor`, `answered`,
  `toggleOption`, `setOtherText`, `buildAnswers`, `submit`, `cancel` =
  **88** lines.
- view functions: `text`, `formatAnswered`, `el`, `refresh`, `refreshControls`,
  `buttonStyle`, `optionButton`, `onOptionKeyDown`, `detailBlock`,
  `buildQuestion`, `render`, `mergeLabels` = **428** lines.
- pipeline functions: `sanitizeToken`, `applyTokens`, `installBaseStyles`,
  `post`, `notify`, `reportSize`, `sanitizeFontStack`, `sanitizeFontEntry`,
  `installFonts`, the 9 colour getters, `callTool`, `fail` = **207** lines.
- pipeline shell (lines outside any function: document/CSP/init/message
  listener) = **101** lines.

Raw `wc -l`:

```
153 lib/ask-user/portable/view-controller.ts        (new controller)
196 lib/ask-user/portable/view-controller.test.mjs  (new tests)
510 lib/ask-user/mcp-view-html.test.mjs             (unchanged; behaviour source)
  88 behaviour funcs in lib/ask-user/mcp-view-html.ts
 428 view funcs in lib/ask-user/mcp-view-html.ts
 308 pipeline funcs + shell in lib/ask-user/mcp-view-html.ts
 824 lib/ask-user/mcp-view-html.ts (total)
604 components/AskUserAppHost.tsx
258 lib/ask-user/mcp-app-adapter.ts
158 lib/ask-user/view-fonts.ts
124 lib/ask-user/view-font-manifest.ts
 77 lib/ask-user/theme-tokens.ts
 46 app/api/agent/[id]/ask-view/route.ts
 21 app/api/ask-user/font-faces/route.ts
```

Aggregate under the stated method:

- controller + view behaviour = `153` (`view-controller.ts`) + `88` + `428` =
  **669** lines.
- pipeline = `308` (`mcp-view-html.ts` funcs + shell) + `258` + `604` + `158` +
  `124` + `77` + `46` + `21` = **1596** lines.
- ratio = **669 : 1596**.

Numbers and method only; no conclusion is drawn here.
