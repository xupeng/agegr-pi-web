# Pagination DOM identity fix — scoped handoff

## Boundary / frozen candidate

Only `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-mcp-codemode-20261002`, branch `merge/upstream-mcp-codemode-20261002`. HEAD remains L `93e63e873481aea761cb2b2072c8a2da1654dc73`, MERGE_HEAD remains U `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`. No stage/commit/push/archive, main-checkout or real Pi configuration changes. Existing checker snapshot-security/ask carry/font repairs are untouched. Main owns the other reports/specs and final full gates.

Own deliverables: `components/MarkdownBody.tsx` (17 additions/16 deletions relative to staged candidate), new `components/MarkdownBody.identity.test.mjs` (two tests), this report. No edits to `e2e/`, `ChatWindow`, `MessageView`, `useAgentSession`, file-index fetching or session APIs.

Read anchors: task prd/design/implement and `research/browser-verification.md`; trellis-before-dev/check skills; frontend index, component/hook/state/quality/type specs, session-list-refresh/session-restore, chat-tail-follow/settings-dialog-mobile/pi-sdk-admission/trellis-subagent-records; guide index, cross-layer and reuse guides. Candidate source is authoritative; no main-checkout codegraph index used.

## Proven root cause (not a whole-list remount)

The old runner's `getByText("E2E message 4998", { exact: true }).elementHandle()` is a Markdown **paragraph**, not the keyed message wrapper. Stable `data-entry-id` on a replacement does not identify which ancestor actually remounted.

1. `hooks/useFileIndex.ts:23,82,109` refreshes visible conversations every 10 seconds. Each successful fetch creates a fresh `FileIndexLookup`, including unchanged/empty file lists.
2. Before this fix, `MarkdownBody` read lookup in the parent, built `linkifyBlockChildren` with `[lookup, onOpenFile]`, and included that callback in the `components` factory's `useMemo` dependencies. Every new lookup therefore created new `p`, `li`, `td`, `th`, `code`, etc. **function element types**.
3. `react-markdown` retained the `p-0` key, but React cannot reuse an element with a different component function type. It removed the old P subtree while `message-e4998`, `message-view-e4998`, the FileIndexProvider and ChatWindow owner remained stable. This also threatened stateful code/Mermaid blocks, not just a testing handle.
4. The isolated TTL proof held the already-acquired handle for 11 seconds (normal refresh, no synthetic SSE/data changes). MutationObserver recorded **removed tag P only**, replacement under the same message keys, and `wrapperConnected:true`. At ~27055ms the old P disconnected; the unchanged runner subsequently failed `Prepending history must preserve existing message nodes`. Its diagnostic still showed 450 labelled nodes, zero empty IDs, all three matching text wrappers owned by e4998.

Evidence: ignored `test-results/pagination-diagnostic/ttl-proof-1280/{full.log,e2e/server.log,e2e/trace.zip,e2e/failure.png}`. The log includes both actual React fiber owner/key chains and detail/context IDs. `observe.mjs` is an ignored observer/preload, not product or e2e source; it adds the explicit TTL hold only for the proof runs. No assertions were changed, bypassed, disabled or reinterpreted as passes.

## SSR / SSE / prepend / grouping investigation

`useAgentSession.ts:874-939` refreshes canonical data and may preserve the paged window on unchanged revision; `:1008-1087` accepts owner/sequence/leaf-matching older pages and prepends messages and entry IDs together; `:1726-1760` reconciles idle connected SSE under the Trellis scope gates. ChatWindow's `renderMessage` keys wrappers by entry ID; process groups own assistant process views, not the user paragraph; render-window slicing retains the tail's key.

In the TTL failure trace, both force detail responses (leaf e4999 then the SDK session_start custom-entry leaf 02d60dcd, with unchanged e4950…e4999 message IDs) precede P removal. Subsequent responses around removal are older context pages plus a file-index refresh, not a whole-list loading replacement. Only P was removed. Session_start/revision advancement and pagination explain the surrounding traffic but **are not the demonstrated cause of this detached handle**. Re-keying ChatWindow, weakening the test to find a replacement, or disabling refresh would fix the symptom at the wrong owner.

The existing refresh/cache/restore logic is not rewritten. Investigation also encountered duplicate before cursors and a second pagination request timeout on pre-fix attempts; these are retained separately below, not folded into the paragraph-identity explanation.

## L / U comparison and narrow decision

This is **inherited fork behavior**, not a newly introduced merge hunk: L's MarkdownBody already has the lookup → callback → renderer-factory dependency; L's `hooks/useFileIndex.ts` is byte-identical to the candidate (SHA-256 `f8a3ac2e207c9a977fc44f2be9141238bd8c1b84e9e16ecf791a15401bfc7f33`). U has no fork file-index dependency and its renderer factory depends only on `[cwd, isStreaming, onOpenFile]`. Candidate merge retained L's dependency while absorbing U's keepLineBreaks support. More browser interactions/compilation timing can expose the 10-second race; no unsupported claim that the merge first created it, or that L's full browser suite was rerun here.

Fix: `MarkdownBody.tsx:80-83` reads lookup in a small private `useLinkifiedChildren` hook called by named, memo-stable block renderers (`:141-155`). Factory deps at `:198` return to `[cwd, isStreaming, onOpenFile]`. Existing inline-code renderer already reads context internally; existing-anchor provider masking remains. Lookup changes still update/add/remove confirmed links; the fix does not freeze index data, remove refresh, weaken file authorization, change Markdown plugins/text/line breaks, or alter layout/fonts.

No scroll, tail-follow, minimap, process/thinking collapse, fork, admission, ask, or snapshot ownership code changed. Real browser evidence below is limited; preserving source is not a claim that every contract has passed.

## Hashes / reproducible commands

| File | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| components/MarkdownBody.tsx | a7027248fb8bd98f88722541b4c4fdaaa8396288f41c4a4605ed6a20c4fc0072 | cceec4c401ee923e0ab9462dc425a2069069df7645b45fbe171d119162ae95b9 |
| components/MarkdownBody.identity.test.mjs | new | 2182f0d42b233e2ed16b41f2a81de84e08d2092253e4c61fff79b87d412f9c31 |
| components/ChatWindow.tsx | ccd8d78559317aa829f476a68b827b94298b08de55e11e7a8f6a725939f327dd | identical |
| hooks/useAgentSession.ts | 7b82ad3f04d9b1fd7f5ca6816c52511fd0d52cdfd92592021779ee7101b5893a | identical |
| e2e/run.mjs | 09e8aa324ecb112a223c0772c6dc8a9289c33ea93497bd6d121caafbd231e338 | identical |

L/U MarkdownBody source SHA-256: L `112e8fb480d3045f0d8fe8d59f9b379aaece334e7bafc95e6f411cac6c097970`, U `8e864b336cde7d2d894bcc74be7191ce95f2813eb2db269e081b8e1c49b84b7b`. Manifests/index evidence remain in `test-results/pagination-diagnostic/`.

Every browser invocation checked no listener on 30141 and no candidate `.next/dev/lock`. Installed executable verified as Google Chrome for Testing **153.0.8010.12**:

```sh
iso=$(mktemp -d /tmp/pi-pagination-XXXXXX); mkdir -p "$iso/home" "$iso/tmp"
env -i PATH="$PATH" LANG=C.UTF-8 NODE_ENV=development \
  HOME="$iso/home" TMPDIR="$iso/tmp" \
  PLAYWRIGHT_EXECUTABLE_PATH=/home/xupeng/.local/share/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell \
  E2E_SERVER_MODE=dev E2E_VIEWPORT_WIDTH=1280 node e2e/run.mjs
# Repeat at width 390, sequentially. Proof runs add:
# node --import ./test-results/pagination-diagnostic/observe.mjs e2e/run.mjs
```

No PI_OFFLINE, credentials, paid provider, user MCP, parallel dev, next build or webpack fallback. Runner owns fixture PI_CODING_AGENT_DIR and loopback server/browser cleanup; own HOME/TMPDIR cleanup runs after each invocation, with empty directory remnants explicitly removed at final cleanup after verifying no remaining holders. Complete stdout/stderr, runner artifacts and exit codes copied into separate ignored attempt directories, not the previous browser agent's report/artifact tree.

## Checks and remaining gate

- New memo-slot/actual-source Node regressions **0/2 before → 2/2 after**: all renderer function types survive initial/empty/unchanged/changed index refreshes; original stable block functions consume the current index and cease linking removed paths. Uses transpiled real component/React JSX with memo/context harness, not a fake DOM or claimed browser test.
- `node --test components/MarkdownBody.identity.test.mjs components/MarkdownBody.test.mjs`: **41/41**, exit 0 (`node-after.log`), retaining HTML/link/sanitization/anchor/Mermaid/line-break coverage.
- `node --test components/ChatWindow.*.test.mjs hooks/useAgentSession*.test.mjs components/MarkdownBody*.test.mjs lib/chat-lazy-load.test.mjs lib/path-linkify.test.mjs`: **157/157**, exit 0 (`node-focused.log`).
- `node_modules/.bin/eslint components/MarkdownBody.tsx components/MarkdownBody.identity.test.mjs`: exit 0, no warnings (`lint.log`); own diff whitespace check 0. No full static suite repeated; main will run it.

### Browser outcomes (selected width, not the unfiltered gate)

All paths below are under ignored `test-results/pagination-diagnostic/`; each has full.log, exit, and an e2e/ artifact copy. The shared runner output folder does not purge older screenshots/traces; use the attempt's full.log/server.log plus freshly produced failure trace.zip or successful trace-1280.zip, not an unrelated leftover artifact. Observer setup syntax errors in ttl-before-1280 are excluded from product results (no browser/server launched there).

| Attempt | Exit | Actual outcome |
| --- | ---: | --- |
| before-1280 | 1 | No outer-wrapper removal during pagination; DOM handle assertion passed, then duplicate before=e4750 response failed cursor progression (expected e4700). |
| before-390 | 1 | No outer-wrapper removal observed; second loop waitForRequest hit the original 30000ms timeout before reaching DOM handle assertion. |
| ttl-proof-1280 | 1 | Inner-P observer + explicit 11s normal TTL hold: original DOM handle assertion fails, P-only removal proves root cause. |
| ttl-after-1280 | 1 | Same hold after fix: original handle/contiguous pagination assertions pass; minimap typography, process/lazy thinking/order and compaction navigation proceed. Later original reading-offset restore assertion fails. Retained, not waived as a pass. |
| after-390 | 1 | **Unmodified runner**: original DOM handle, cursor/suffix checks pass; then original 300px short-viewport scrollability assertion fails (actual scrollable=false). No test/geometry adaptation made. |
| after-1280 | 0 | **Unmodified runner**: 1280px new AC6 interactions and all legacy checks pass, including pagination DOM handle, reading-offset restore, cancelled branch restoration, minimap/process/thinking, file panel, extension/ask, status attached/detached tail, session restore and ChatAppearance. Runner's final 390/744 coarse-pointer Enter and 180px overflow checks also pass. |

**Full AC6 remains RED/unverified on this fix.** Main must independently rerun static + unfiltered browser gates, review the retained 390px short-viewport failure and the TTL-diagnostic reading-offset failure. This agent does not rewrite layout/restore/cache or alter existing test expectations to make those failures green; the ordinary final 1280px run passed reading offsets, but that does not erase the retained failed timing case. No true Safari/iOS/Windows, paid-provider completion, live user MCP, or running thinking/fork browser validation claimed.

Cleanup: every owned runner completed its finally block; own servers/browsers and isolated HOME/TMPDIR are gone. Final no-listener/no-lock/no-owned-process checks and unchanged HEAD/MERGE_HEAD are saved in cleanup.log; the initial check showing six empty isolation-directory remnants is preserved as cleanup-initial.log. No unfiltered suite, second dev, staging or commit was run.
