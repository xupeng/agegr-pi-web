# Final fixture incremental review — stableHistoryPosition + memoSlot/EOF cleanup

## Scope / boundary (read-only, fixture-only increment)

- Sole reviewed checkout:
  `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-mcp-codemode-20261002`,
  branch `merge/upstream-mcp-codemode-20261002`.
- `HEAD` = L `93e63e873481aea761cb2b2072c8a2da1654dc73`; `MERGE_HEAD` = U
  `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`. No merge commit yet; no unmerged paths; no conflict
  markers in product/e2e/spec.
- This agent changed **no** product, `e2e/`, spec or test file and did **not**
  stage/commit/push/archive. It started **no** server or browser and ran **no** full
  `tsc`/`lint`/`npm test` gate. Only this report was written (the shell has no `apply_patch`
  binary; the harness file-write used here is the equivalent targeted patch). Main owns the
  final full browser + static gate in parallel and exclusively.
- Allowed scoped read-only checks were run in an `env -i` temp HOME/TMPDIR: `node --check`,
  `eslint` on the two changed files, one isolated Node test, `git diff --check`.

## Inputs read (SHA-256 at this review)

| Path | SHA-256 |
| --- | --- |
| `e2e/run.mjs` | `fa27e9e5eb089d5b600a2b9b1106e78710110a2175d3a58ed59c6668dd502c91` |
| `components/MarkdownBody.identity.test.mjs` | `430bc259f26f78286381f9a9cf15cf112daa493d20502aece0aba298ec2996a4` |
| `e2e/README.md` | `561cf6fbd0b1f0cdd6d87e8d579a79b79c6adea26239d13fa6d6d8c42afe18eb` |
| `components/MarkdownBody.tsx` | `cceec4c401ee923e0ab9462dc425a2069069df7645b45fbe171d119162ae95b9` |
| `components/ChatWindow.tsx` | `ccd8d78559317aa829f476a68b827b94298b08de55e11e7a8f6a725939f327dd` |
| `hooks/useAgentSession.ts` | `7b82ad3f04d9b1fd7f5ca6816c52511fd0d52cdfd92592021779ee7101b5893a` |
| `research/reading-offset-fix.md` | `616342c6abcc73a6ea184be64925b98caedc6d7bbbe4e23dcec18c88908d401b` |
| `research/final-incremental-review.md` | `c40eb1dbb5c6aa6d964fafbeaff97cb58ab7e91100fc07f0864de649d4250b4d` |
| `research/debug-retrospective.md` | `8841920d64818bd36491958fc812d1fcbc1b3bfcbc7e4d9295452ad1076a0d79` |
| `research/main-verification.md` | `dbeee9cb7adc4b38b751c23def37c124d563b9f62eaad4d40428c247cb3e3877` |

Also read (unchanged, hash-verified against `final-incremental-review.md`):
`components/MessageView.tsx` `a92f04b2…`, `components/CodemodeToolView.tsx` `57b5598d…`,
`lib/written-file-sources.ts` `0a54ba23…`, `lib/session-file-references-core.ts` `6fd2123e…`,
`lib/subagent-runtime.ts` `0442e566…`, `lib/rpc-manager.ts` `ff8fe162…`, `lib/tool-names.ts`
`9d59cf66…`, `hooks/useFileIndex.ts` `f8a3ac2e…`, `components/FileIndexContext.tsx`
`46c60f06…`, `e2e/upstream-interactions.mjs` `380f5c88…`, `e2e/subagents.mjs` `51138ec3…`,
`e2e/extension-dialog.mjs` `b8d8807c…`, `.trellis/spec/frontend/mcp-codemode.md` `83e26f0d…`.
Raw diagnostic evidence spotted-checked at `test-results/reading-offset-diagnostic/run1.full.log`
(`positionForReading` → `readingOffset res=9275`; return `res=24675`; line-557
`AssertionError: Returning to older history must restore its reading offset`).

Post-review file deltas (mtime after `final-incremental-review.md` at 13:51): only
`components/MarkdownBody.identity.test.mjs` (13:55, untracked), `e2e/run.mjs` (14:19),
`e2e/README.md` (14:20), plus this task's research files. No product runtime file changed.

## The approved contract, as implemented (`e2e/run.mjs:535-586`)

- `readingOffset` / `positionForReading` are unchanged (`120` target; `positionForReading`
  returns the post-set offset).
- `stableHistoryPosition(target, pendingRequests)`: 30 s deadline; each iteration re-parks,
  waits two `requestAnimationFrame`s, re-reads; `stableReads` becomes 2 only when
  `pendingRequests.size === 0 && Math.abs(offset - 120) < 5`; returns the measured offset, or
  `assert.fail(...)` on deadline.
- Request tracking is scoped to `new URL(request.url()).pathname ===
  \`/api/sessions/${LONG}/context\`` **and** `searchParams.has("before")`; added on `request`,
  removed on `requestfinished` and `requestfailed`; listeners registered immediately before the
  scroll, and removed in a `finally`.
- The return assertion is untouched: `assert.ok(Math.abs(await readingOffset(olderMessage) -
  olderOffset) < 5, "Returning to older history must restore its reading offset")`. No
  re-positioning on return.

## Findings

### No contract weakening / no cleanup hole found (verified)

- **Thresholds and return behavior are exact.** The only new numeric uses are the same
  literal `120` and `Math.abs(offset - 120) < 5` (line 555); lines 527/593/596 are unchanged.
  Return-side still uses its original `< 5`. No `waitForTimeout`/`setTimeout`/`delay` in the
  region (grep clean); waiting is frame-based. No reposition at return.
- **Listener cleanup is correct.** `page.off` in `finally` always runs (including when
  `Promise.all`/`assert.fail` throws), so no listener leak into the later branch-cancel test or
  the next viewport. `Set.delete` is idempotent.
- **Request-object identity cleanup is sound.** In Playwright 1.63.0 the client caches channel
  objects by guid (`coreBundle.js`: `Request2.from(r) => r._object`; `_tChannelImplFromWire`
  returns `_objects.get(guid)._channel`), so the `request` object added is the same instance
  later passed to `requestfinished`/`requestfailed`. Cleanup by object identity is therefore
  reliable, not accidental.
- **Event coverage is complete for this app.** The pagination fetch is a normal page `fetch`;
  Playwright emits `requestfinished` or `requestfailed` for it (abortion/route cases included).
  The path+`before` filter excludes `tail=1`/other context traffic, so the set really means
  "pending older pages".
- **No masking of a product regression.** A broken restore still fails line 593; a never-
  settling cascade still fails the 30 s `assert.fail`. The change only makes the *captured*
  precondition explicit.

### F-FFR-1 (Low, diagnosability) — failure message omits the last raw sample

`reading-offset-fix.md`'s own proposal said to "report the final raw value on failure". The
implemented `assert.fail("Earlier history must settle at 120px with no pending pages before
capturing its reading position")` is a static string; it does not include the last `offset`,
`stableReads`, or `pendingRequests.size`. A deadline failure is therefore less diagnosable than
proposed (e.g. a clamped scrollTop that can never reach 120 vs. a persistent page cascade look
identical). Not a contract breach and not a blocker; main may choose to keep it as-is. Flagged,
not fixed.

### F-FFR-2 (Info, residual, inherent to the approved signal) — `requestfinished` ≠ committed prepend

The helper's quiescence signal is "no in-flight `before` request", but a response finishing is
not the same as the prepend effect having committed. The two-`rAF` wait covers the normal case;
a very late React commit, or a new `before` request starting in the single frame **after** the
second stable read but before the switch-away capture, could still clobber 120. This is the same
class the comment and `reading-offset-fix.md` already disclose; the change narrows the window
rather than proving a hard guarantee. Do not claim the fixture race is eliminated — claim it is
stabilized. No action requested.

### F-FFR-3 (Info, low) — listeners attach after `selectSession`

`pendingOlderRequests` listeners are registered after `selectSession(text(0), "e4999")` (line
560). A `before=` request already in flight from the session switch would not be tracked.
In practice the switch loads the tail (e4999 visible) and the tracked request is the
sentinel-triggered one, and any missed prepend is self-corrected by the re-park loop. Noted for
completeness only.

### Resolved prior findings (re-verified)

- **F-IR-1 (lint warnings): resolved.** `npx eslint e2e/run.mjs
  components/MarkdownBody.identity.test.mjs` → exit 0, and `--format json` on the identity test
  reports `warningCount: 0, errorCount: 0`. The mock hook was renamed to the non-hook name
  `memoSlot` and referenced explicitly; no `eslint-disable` was added. `MarkdownBody` does not
  import `useCallback`, and `memoSlot` preserves the original memo/dep semantics (the two tests
  remain real regressions: test 1 fails if `lookup` is re-added to the factory deps, test 2
  fails on a stale closure).
- **F-IR-2 (EOF blank line): resolved.** The file ends `});\n` (single LF, no blank line,
  no trailing whitespace/tabs); `e2e/README.md` documents the stabilization accurately.
- **F-IR-3 (count boundary): consistent.** `main-verification.md` records 2123/2123 (2121 + the
  2 identity tests).
- **F-IR-4 (MCP header fixed `fontSize`): unchanged residual**, already documented as
  pre-existing debt; not re-opened here.

## Scoped checks actually run (isolated, read-only)

| Check | Result |
| --- | --- |
| `node --check e2e/run.mjs` / `components/MarkdownBody.identity.test.mjs` | both OK |
| `node --experimental-strip-types --test components/MarkdownBody.identity.test.mjs` (isolated `env -i`) | exit 0; 2/2 pass, 0 fail |
| `eslint e2e/run.mjs components/MarkdownBody.identity.test.mjs` | exit 0; 0 errors / 0 warnings |
| `git diff --check -- e2e/run.mjs` | exit 0 |
| `grep` trailing whitespace/tabs in identity test | none |
| Product/e2e/spec hash boundary vs `final-incremental-review.md` | identical; no product change |
| `git diff --name-only --diff-filter=U` / conflict-marker scan | none |
| `package.json` identity + four `@earendil-works/*` pins | `@xup3ng/pi-web@0.12.0`, all `0.99.1` |

## Explicit non-claims

- **No provider/backend/browser guarantee.** This review did not start a server or browser,
  did not exercise MCP/Code runtime transport, did not use any provider, and did not run the
  unfiltered `npm run test:e2e`. Nothing here certifies browser green, Safari/iOS/Windows, live
  model completion, or user MCP/OAuth.
- **No whole-gate substitution.** Main's final full `tsc`/`lint`/`npm test` and unfiltered
  browser gate are not certified by this static review; a later main-owned whole gate must not
  be represented as "passed by this report".
- **`U` is still `MERGE_HEAD`, not an ancestor of a merge commit.** AC1/AC6 remain open until
  main commits and completes the browser/static gate.
- The `AssertionError`/diagnostic observations above are Linux headless Chromium only and are
  cited from existing local artifacts; they are not re-executed here.
