# Final incremental review — Markdown identity fix + final e2e/spec deltas

## Scope / boundary (read-only)

- Sole reviewed checkout: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-mcp-codemode-20261002`, branch `merge/upstream-mcp-codemode-20261002`.
- `HEAD` = L `93e63e873481aea761cb2b2072c8a2da1654dc73`; `MERGE_HEAD` = U `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`. No merge commit exists yet; merge is uncommitted.
- This agent did **not** stage/commit/push/archive, did not start a server/browser, and did not edit any source, e2e, spec or code. Only this new report was written (harness file write; the shell has no `apply_patch` binary, so no script overwrote code).
- No full `tsc`/lint/`npm test` gate and no browser run were performed here. `finalstatic`/browser remain main-owned. This report therefore does **not** certify full static/browser green.

## Inputs read

Task: `prd.md`, `design.md`, `implement.md` (candidate `.trellis/tasks/10-02-sync-upstream-mcp-codemode/`).
Research: `independent-check.md`, `pagination-fix.md`, `browser-verification.md`, `debug-retrospective.md`, `merge-analysis.md`.
Product/owners: `components/MarkdownBody.tsx`, `components/MarkdownBody.identity.test.mjs`, `components/FileIndexContext.tsx`, `hooks/useFileIndex.ts`, `lib/path-linkify.ts` (via tests), `lib/written-file-sources.ts`, `lib/session-file-references-core.ts`, `lib/subagent-runtime.ts`, `lib/rpc-manager.ts` (`SESSION_TOOL_NAMES`/`resolveActiveToolNames`/`navigateTreeKeepingToolSelection`), `lib/tool-names.ts`, `lib/global-settings-file.ts`, `components/MessageView.tsx` / `ChatWindow.tsx` / `CodemodeToolView.tsx` (diff + font lines), `next.config.ts`, `package.json`.
E2E: `e2e/run.mjs`, `e2e/upstream-interactions.mjs`, `e2e/subagents.mjs`, `e2e/extension-dialog.mjs`, `e2e/README.md`.
Specs: `.trellis/spec/frontend/{mcp-codemode,clickable-file-paths,ask-user-protocol,index,mobile-keyboard-viewport,stall-watchdog}.md`, `.trellis/spec/guides/upstream-sync.md`.

## Inspected increment and prior-fix integrity

- **F1 (snapshot source policy) intact.** `WrittenFileEvidencePolicy = "render" | "snapshot"`, `isTrustedWrittenFileResultToolName` is the single exact gate (`apply_patch`/Trellis/`Agent`), the guard precedes both structured and legacy text paths (`written-file-sources.ts:383-408`), `extractWrittenFilesFromEntries(..., "snapshot")` is called by the single `snapshotWrittenFiles` helper used by both fresh and resume completions (`subagent-runtime.ts:196-203,441,583`), and `session-file-references-core.ts:103-112` reuses the same gate. Historical already-promoted `Agent.writtenFiles` limitation remains explicitly disclosed, not silently claimed fixed.
- **F2 (ask carry) intact.** `SESSION_TOOL_NAMES` includes `ask_user` (`rpc-manager.ts:271`); navigation carries only `activeBefore` names and the existing resolver still requires registered/non-hidden (`rpc-manager.ts:795-803`, `resolveActiveToolNames:281-303`). No active-all blanket helper.
- **Final product increment is only the Markdown identity fix.** SHA-256 of `ChatWindow.tsx`/`MessageView.tsx`/`CodemodeToolView.tsx` still match `browser-verification.md`, so the only post-browser product change is `MarkdownBody.tsx` (+ its new test). The `e2e/run.mjs` mtime (13:42) is main's short-fixture `desktop 300 / mobile 180` adaptation, which retains the DOM-handle, overflow and width-alignment assertions.
- **Atomic-settings wording is now truthful.** `.trellis/spec/frontend/mcp-codemode.md` §配置与环境 states same-path SDK lock + minimal field edit + in-place `writeFileSync` then chmod 0600 (not rename-atomic, interrupted-write corruption disclosed). `lib/global-settings-file.ts:57-73` matches exactly. The earlier F4 over-claim is corrected.

### MarkdownBody identity fix — source assessment

- Root cause is pre-existing at L (lookup → callback → `useMemo` renderer factory); U added `keepLineBreaks`. The fix reads the lookup inside small named renderers via `useLinkifiedChildren` (`MarkdownBody.tsx:80-83,138-156`) and restores factory deps to `[cwd, isStreaming, onOpenFile]` (`:198`). `hooks/useFileIndex.ts` is unchanged (`f8a3ac2e…`).
- Hooks: `useLinkifiedChildren` calls `useFileIndexContext()` unconditionally as the first hook of each named component; `CodeRenderer` already did this. Element types stay stable across index TTL changes, so React reconciles instead of remounting P/li/td/th (and stateful CodeBlock/Mermaid subtrees stay mounted). Removed paths still stop linking because the renderer consumes the current context each render.
- Anchor masking: `<FileIndexProvider lookup={null}>` inside the `a` renderer now also masks descendant block renderers, because they read the nearest provider. This matches the documented intent ("an existing anchor disables automatic links for all its descendants") and the existing "no nested inline-code links inside anchors" test still passes. No valid Markdown block nests inside an inline link, so no legitimate link is lost.
- HTML / keepLineBreaks / CodeBlock / Mermaid untouched by the fix; the 41-test `MarkdownBody*.test.mjs` run (incl. raw-text line breaks, Mermaid streaming/default-preview, CJK autolink, no anchor nesting) passes.
- New `MarkdownBody.identity.test.mjs` is a real regression guard, not a tautology: it transpiles the actual source and injects a persistent memo-slot harness; if `lookup` were re-added to deps, test 1 fails on changed function identities, and if the lookup were captured in a stale closure, test 2 fails to link the current index.

### E2E contract check (no weakening found)

- `e2e/run.mjs`: full path still runs both widths and the complete legacy suite; `E2E_CHECK_GROUP`/`E2E_VIEWPORT_WIDTH` are explicitly labelled `TARGETED` diagnostics and cannot silently replace `npm run test:e2e`. The pagination assertion `assert.deepEqual(latestUserState, { connected: true, text: text(4998) }, …)` and its diagnostic dump are retained. Short-fixture scrollability now uses `desktop 300 / mobile 180`, keeping `scrollable === true`, message-column and composer alignment asserts. Session-list `deepEqual` was extended, not relaxed. HTTP preflight only warms routes; browser assertions keep the 30s budget.
- `e2e/upstream-interactions.mjs`: MCP original server/tool label + exact JSON, Code mode exact script (line-number chrome removed from a detached clone only), 2 nested rows with name/args/status/error/duration, output without the transport header, real font-offset +3 on all Code-mode nodes, no horizontal overflow; history edit click only prefills, cancel keeps draft + real branch, reload keeps branch, send does exactly `navigate_tree` then stubbed `prompt` (real SDK navigation, no provider completion); dialog/custom FIFO, id-specific close, reconnect dedupe, discarded-source rejection; touch Enter inserts newline with an offline stub. Assertions are strengthened/debt-aware, not removed.
- `e2e/subagents.mjs`: adds the upstream "running branch click must not navigate" rejection before settling, then keeps all original historical-settlement/output/race/reconnect assertions; executable alias and traces added.
- `e2e/extension-dialog.mjs`: only the faux select timeout 4000→8000ms and a countdown log line; server-expiry/cancel/draft/only-server-closes assertions unchanged.
- `e2e/README.md`: adds isolation/executable/diagnostic-group guidance and explicitly narrows claims ("history rendering, not transport execution", "not a real network disconnect"). Honest, not weakening.

### Spec accuracy

`mcp-codemode.md` (render≠snapshot, exact gate, historical limit, no byte-cap promise, no browser MCP panel, atomic-settings correction), `clickable-file-paths.md` (render/snapshot split, historical-promotion limitation, MarkdownBody identity contract + regression), `ask-user-protocol.md` (carry + `model-only` exposure + `forgetSession` registry identity), `index.md`, `mobile-keyboard-viewport.md`, `stall-watchdog.md` and `upstream-sync.md` all match the inspected source. No conflict markers in specs/product.

## Scoped checks run (isolated env: `env -i`, temp HOME/TMPDIR/PI_CODING_AGENT_DIR, `NODE_ENV=production`)

| Check | Result |
| --- | --- |
| `node --experimental-strip-types --test components/MarkdownBody.identity.test.mjs components/MarkdownBody.test.mjs` | exit 0; 41/41 pass, 0 fail, 0 skip/cancel |
| `node --experimental-strip-types --test components/MarkdownBody.identity.test.mjs` | exit 0; 2/2 pass |
| `eslint components/MarkdownBody.tsx components/MarkdownBody.identity.test.mjs e2e/upstream-interactions.mjs e2e/run.mjs` | exit 0; **2 warnings** in the new identity test (`react-hooks/exhaustive-deps` at `:38:102`), no errors |
| `git diff HEAD --check` over reviewed tracked files | exit 0 |
| `git diff --no-index --check` over the two new files | identity test: **"new blank line at EOF" (`:88`)**; `upstream-interactions.mjs` clean |

## Findings for main (none touch product correctness; two require claim/cleanup action)

- **F-IR-1 (Low, static-claim accuracy).** The final `eslint .` will include `components/MarkdownBody.identity.test.mjs` and emit **2 `react-hooks/exhaustive-deps` warnings** on the test's mock `useMemo(() => fn, deps)`. Exit code is still 0 (`lint` has no `--max-warnings`), so the gate is green, but this breaks the previously reported "0 errors / 0 warnings" shape (independent-check 628 files/0/0 and quality-guidelines' 0/0 baseline shape). `pagination-fix.md`'s "exit 0, no warnings" is contradicted by its own `test-results/pagination-diagnostic/lint.log` (same 2 warnings). Main should attribute the delta and either (a) update the final lint claim/checklist, or (b) add an inline, named-rule, reason-adjacent `// eslint-disable-next-line react-hooks/exhaustive-deps` in the harness, or restructure the mock. Not a runtime/product defect.
- **F-IR-2 (Low, hygiene).** `components/MarkdownBody.identity.test.mjs` ends with a blank line at EOF (`\n\n\n`), flagged by `git diff --check` as "new blank line at EOF". Independent-check's "no whitespace issues" predates this untracked file and pagination-fix's whitespace check did not cover it. Remove the extra blank line before commit (or explicitly accept).
- **F-IR-3 (Info, count boundary).** independent-check's final full unit count was **2121** (pre-markdown-identity). Adding the 2 identity tests makes the expected final full count **2123** unless other tests change; main's final `npm test` should be read against 2123, not 2121.
- **F-IR-4 (Info, residual debt — not a contract breach).** The generic MCP tool-name header/preview still inherits fixed `fontSize: 11` (`components/MessageView.tsx:1232`; browser measured `[11,11]` unchanged under Ctrl+Shift+Equal). `browser-verification.md` documents this as existing debt and `checkMcpCodemode` logs `mcpBefore/mcpAfter` without asserting. `CodemodeToolView` itself is compliant (`calc(... + var(--chat-font-size-offset))`), and `mcp-codemode.md` scopes the font contract to new Code-mode typography, so this is a deliberate residual, not a new regression. Flagging in case main wants uniform new-surface typography before commit.

## Hash boundary (SHA-256 at this review)

| File | SHA-256 |
| --- | --- |
| components/MarkdownBody.tsx | `cceec4c401ee923e0ab9462dc425a2069069df7645b45fbe171d119162ae95b9` |
| components/MarkdownBody.identity.test.mjs | `2182f0d42b233e2ed16b41f2a81de84e08d2092253e4c61fff79b87d412f9c31` |
| components/ChatWindow.tsx | `ccd8d78559317aa829f476a68b827b94298b08de55e11e7a8f6a725939f327dd` |
| components/MessageView.tsx | `a92f04b23b2dc4642aa489109a56aec6f045854e62b574308882fc96bf88623f` |
| components/CodemodeToolView.tsx | `57b5598dac3c59b8277e752dbab4ea3fcd53f959b8e4da087d600b4e1b6912b0` |
| lib/written-file-sources.ts | `0a54ba23ddbb4d7de5b3f17370354b4717b4cb04a4f92c1ca731898a06935237` |
| lib/session-file-references-core.ts | `6fd2123ed39bee3668e09b8614797ca033f6676c2faf91e33a12bd8fef1dfa3c` |
| lib/subagent-runtime.ts | `0442e5664a3b330180b7922760b5b04834d0ff442ece1d9c0baa1ba201ef6783` |
| lib/rpc-manager.ts | `ff8fe1620cbe27df110307700a3a93875668bae384e15edab93bf635e5cd85d3` |
| lib/tool-names.ts | `9d59cf6672742943b893060aeb098ea16a02e3a9af1446f665c5117305c4848a` |
| hooks/useFileIndex.ts | `f8a3ac2e207c9a977fc44f2be9141238bd8c1b84e9e16ecf791a15401bfc7f33` |
| components/FileIndexContext.tsx | `46c60f065e59e8e7149c38f4f289d07bd88e513d219ef1815c47dafe237d40f4` |
| e2e/run.mjs | `9006d7e21e86773f8483712edf3f3c426d43a61cd43b8ab5d0ac7f24b116458b` |
| e2e/upstream-interactions.mjs | `380f5c88b54742dfeefb667c23b4ae93379a41fa9e6a0bca7fe4318f546184a1` |
| e2e/subagents.mjs | `51138ec33ba3057ac618feaffffa3374d7ab4e3e7fc2e998468016bb76ed30b3` |
| e2e/extension-dialog.mjs | `b8d8807c194d05a0d592169bf2ac5f6a6c050bd89ca76b96815514c86c79255f` |
| e2e/README.md | `6c42b2b32ab827892ac15d4b6bed541c62f93eb0ab877682852da4035ef2e64d` |
| .trellis/spec/frontend/mcp-codemode.md | `83e26f0de0bcab83d8df9353468e5f3e9e93f0e6188afc6140db905e7e6ad6a8` |

HEAD/MERGE_HEAD unchanged; no unmerged index entries; no conflict markers in product/spec; `@xup3ng/pi-web@0.12.0` and all four `@earendil-works/*` pins remain `0.99.1`; no lint/tsconfig weakening.

## Remaining risks / explicit non-claims

- `finalstatic` and the unfiltered browser gate are **not** run or certified here; main must run them on this exact tree and reconcile the historical pagination/retained-diagnostic failures.
- Historical already-promoted `Agent.writtenFiles` pollution remains an accepted limitation (no retrospective child-session revalidation); do not claim recent cleanup erases it.
- No real Safari 16.2 / iOS / Windows hardware, no live provider completion, no user MCP/OAuth/transport execution was exercised.

**Conclusion:** the Markdown identity fix is sound, the approved F1/F2 fixes are intact, the final e2e/spec deltas do not weaken any contract, and the atomic-settings wording is corrected. The only actionable items for main are the lint-warning/claim attribution and the EOF blank-line nit (plus the 2123 count boundary and the noted MCP-header residual).
