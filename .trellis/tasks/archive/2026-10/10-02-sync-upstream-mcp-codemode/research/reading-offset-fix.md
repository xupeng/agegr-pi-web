# Reading-offset restore blocker — diagnostic handoff (fixture race, no product fix)

## Boundary / frozen candidate

- Sole candidate: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-mcp-codemode-20261002`, branch `merge/upstream-mcp-codemode-20261002`.
- `HEAD` = L `93e63e873481aea761cb2b2072c8a2da1654dc73`; `MERGE_HEAD` = U `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e` (merge still uncommitted).
- This agent changed **no** product, `e2e/`, spec or tracked file. Only added the ignored out-of-tree diagnostic `test-results/reading-offset-diagnostic/{observe.mjs,run1..3.*}` and this report.
- Own server/browser processes and isolated `/tmp/pi-reading-*` HOME/TMPDIR trees are gone; final `ss` shows no 3000/30141 listener (see below).

Product hashes at the time of these runs (unchanged by me):

| File | SHA-256 |
| --- | --- |
| `components/ChatWindow.tsx` | `ccd8d78559317aa829f476a68b827b94298b08de55e11e7a8f6a725939f327dd` |
| `hooks/useAgentSession.ts` | `7b82ad3f04d9b1fd7f5ca6816c52511fd0d52cdfd92592021779ee7101b5893a` |
| `components/MarkdownBody.tsx` | `cceec4c401ee923e0ab9462dc425a2069069df7645b45fbe171d119162ae95b9` |
| `e2e/run.mjs` (main's short-fixture edit, unchanged) | `9006d7e21e86773f8483712edf3f3c426d43a61cd43b8ab5d0ac7f24b116458b` |
| `test-results/reading-offset-diagnostic/observe.mjs` (diagnostic) | `760a1ea84e07810e5f76c06f4f3529d27b9634a222195dbe11dda415b84aa247` |

## What the failing assertion actually measures

`e2e/run.mjs:535-557` (inside the `viewport.width > 600` block, after the minimap/compaction checks):

1. `selectSession(LONG title, "e4999")` and `scrollIntoView` on the `Scroll up to load earlier messages` sentinel; wait for **one** `/api/sessions/e2e-long-session/context?...before=...` response (`olderPage`).
2. `positionForReading(page.locator("[data-entry-id='e4920']"))` — programmatically sets `scroll.scrollTop` so that e4920's top is **120 px** below the nearest `.overflow-y-auto` (verified to be the main `.chat-content .scrollbar-subtle` container), then returns `readingOffset` = e4920.top − container.top.
3. Switch to RICH, collapse/expand process details, set the heading to 120, then switch back to LONG.
4. `assert.ok(Math.abs(await readingOffset(olderMessage) - olderOffset) < 5, "Returning to older history must restore its reading offset")` at line **557**.

`olderOffset` is therefore **not fixed at 120** — it is whatever `positionForReading` managed to establish. The assertion only compares the captured value with the value after returning.

## Reproduction (real dev server + verified Chromium, isolated)

```sh
iso=$(mktemp -d /tmp/pi-reading-XXXXXX); mkdir -p "$iso/home" "$iso/tmp"
env -i PATH="$PATH" LANG=C.UTF-8 NODE_ENV=development \
  HOME="$iso/home" TMPDIR="$iso/tmp" \
  PLAYWRIGHT_EXECUTABLE_PATH=/home/xupeng/.local/share/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell \
  E2E_SERVER_MODE=dev E2E_VIEWPORT_WIDTH=1280 \
  node --import <candidate>/test-results/reading-offset-diagnostic/observe.mjs e2e/run.mjs
```

`observe.mjs` only patches `chromium.launch`/`newContext`/`page` and `Locator.evaluate` to record the real scroll/layout timeline and the sample values. It changes no request, no product state, no test assertion, and no threshold. No `PI_OFFLINE`, paid provider, user MCP, second dev server or `next build`.

## Raw evidence

`DIAG_EVAL` records the values the test samples. `before`/`after` bracket the test's own `locator.evaluate`, so they are the actual scroll state at that instant. Offsets are `e4920.top − main-container.top` (px).

| Attempt | `positionForReading` result (olderOffset) | container after set | `readingOffset` on return | line-557 outcome |
| --- | --- | --- | --- | --- |
| run1 | `9275` | `st=14` (top) throughout | `24675` | **FAIL** |
| run2 | `-2275` | `st=7714, sh=11599` (clobbered) | `-2275` | match (would pass) |
| run3 | `120` | `st=5319, sh=11599`, e4920 at `+120` | `120` | **match (line 557 passes)** |

Raw lines (abridged):

```
run1: DIAG_EVAL positionForReading ; readingOffset res=9275 ; [switch] ; readingOffset res=24675 ; AssertionError line 557
run2: DIAG_EVAL positionForReading info{scIsMain:true, scScrollTop:7714, scScrollHeight:11599, elTop:-2239} ; readingOffset res=-2275 ; return readingOffset res=-2275
run3: DIAG_EVAL positionForReading after{scIsMain:true, scScrollTop:5319, scScrollHeight:11599, elTop:156} ; readingOffset res=120 ; return readingOffset res=120
```

An independent passing trace from the same tree (`test-results/final-browser-verification-main/e2e/trace-1280.zip`, 13:36) shows the same e4920 wait resolving once at `131859` (restore ≈4.5 s). The failing main run's `full.log` and `e2e/trace.zip` show the same line-557 `AssertionError`, with the scroll container hidden (`pendingScrollRestore` non-null) for ~14 s and e4920 "resolved to hidden" repeatedly while more `before=` pages arrived — i.e. the same cascade/divergence class.

## Proven mechanism

The pagination/scroll-anchor machinery is the fork's, not new in this merge. `git show HEAD:components/ChatWindow.tsx` already contains `prevScrollDistanceRef` (`:482`), the `captureScrollDistance` in the IntersectionObserver (`:661`), and the `visibleCount` effect that does `container.scrollTop = restoreScrollTop(container.scrollHeight, prevScrollDistanceRef.current)` (`:683-685`). The merge's diff to `ChatWindow.tsx` (68/54) does not touch those lines. `hooks/useFileIndex.ts` / `MarkdownBody` are irrelevant here.

Sequence:

1. The test scrolls the `Scroll up to load earlier messages` sentinel to `block: "start"`, so the viewport sits at the top (`st≈14`). The IntersectionObserver keeps firing and prepending pages (`e4900, e4850, e4800, e4750, e4700, e4650, …` in the logs) — **far more than the one `olderPage` response the fixture waits for**.
2. `positionForReading` runs while one or more prepends are in flight. If it runs **before** the in-flight observer captured `prevScrollDistanceRef`, the set survives and later prepends keep e4920 at +120 (run3: `st 5319 → 9169` as `sh 11599 → 15449`, offset stays `120`).
3. If it runs **after** the capture, the pending `useEffect([visibleCount])` overwrites the test's scroll with the pre-set anchor: run2 ends at `st=7714, sh=11599` and e4920 at `-2239` (offset `-2275`), exactly the position the app had before the test scrolled.
4. Run1 additionally kept cascading across the switch-away capture and the return restore, so the anchor captured (`top ≈ e4750`) and the anchor restored diverged (`9275` vs `24675`). The return restore then loaded further down and the final viewport showed e4750 (the failure screenshot), not e4920.

In run2 the product still rewound to the *captured* anchor exactly (`-2275 → -2275`): the restore is faithful to the position it was given. In run3, with a stable 120 capture, the restore returned 120. **The product's session-switch restore logic is correct; the fixture's `olderOffset` precondition is what is racing.**

The `visibility: hidden` / `pendingScrollRestore` gate means a return restore that is still paginating is not yet visible; the assertion runs after the gate opens, so the failure is not "sampled mid-restore on the return side". It is the **capture side** that was never a stable 120.

## Classification and recommendation

**Fixture race, not a product restore race. No product fix.**

A product change here would have to decide precedence between a user/programmatic scroll and the fork's prepend anchor restoration (`prevScrollDistanceRef`). That is pre-existing L behavior and is the page-ownership/scroll-anchor contract the task requires preserving (detached tail, minimap click, pagination stability). Rewriting it is out of scope and would risk those contracts; the evidence does not show the restore math is wrong.

Proposed **e2e-only** stabilization for main's approval (do **not** silently apply; exact 120 px and <5 px thresholds, DOM handle, branch-cancel, detached tail/minimap are untouched):

- After `await olderPage`, replace the single `olderOffset = await positionForReading(olderMessage)` with a bounded stabilization: re-apply `positionForReading` until the measured offset is within the existing 5 px of 120 on **two consecutive reads** with no outstanding `before=` `/context` request; report the final raw value on failure.
- This makes the completion condition explicit ("position stable and pagination quiescent") instead of relying on an imprecise single `waitForResponse`, and it is not a blind `sleep` or a relaxed threshold.

If main prefers no fixture change, the retained red on line 557 is a fixture-timing defect and must not be reported as a green AC6.

## Commands / artifacts

- Reproduced 3× (1280px, dev): raw logs and exits under ignored `test-results/reading-offset-diagnostic/run{1,2,3}.full.log` / `.exit`.
- run1 is the genuine line-557 failure; run2/run3 additionally tripped the runner's `Browser errors at width 1280` assertion because the **first observer version** raised `MutationObserver: parameter 1 is not of type 'Node'` before `document.documentElement` existed. That is diagnostic noise, fixed in the current `observe.mjs`; it is **not** a product browser error.
- Existing reports/artifacts were not overwritten (`test-results/final-browser-verification-main/` untouched).

## Risks / non-claims

- Evidence is Linux headless Chromium 1280px only; not the unfiltered whole gate, not Safari/iOS/Windows, no paid provider or user MCP.
- The main run's raw offset values were not instrumented (only its line-557 failure + trace). The mechanism is proven on the same fixture/code with the observer, not inferred from the main log alone.
- Do not treat run3's later observer-induced failure, or run2's `-2275` match, as line-557 green: only a run where line 557 passes without diagnostic noise counts.
- No product/e2e/hash change is proposed here without main's explicit approval.
