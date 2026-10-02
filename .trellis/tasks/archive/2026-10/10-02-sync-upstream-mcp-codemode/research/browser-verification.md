# Browser verification — final handoff (full gate RED)

## Candidate and ownership

- Only worktree: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-mcp-codemode-20261002`.
- Branch `merge/upstream-mcp-codemode-20261002`; unchanged HEAD `93e63e873481aea761cb2b2072c8a2da1654dc73`; preserved MERGE_HEAD `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`.
- This agent changed only `e2e/` and this browser report. No product TS/TSX/spec changes, staging, commit, push, archive, next build or webpack fallback.
- Browser: verified installed `chromium_headless_shell-1243`, Chrome **153.0.8010.12**, Linux headless Chromium/Playwright. Safari, Windows and native iOS are not inferred from this result.

**The latest unfiltered browser gate exits 1.** Supplemental passes below do not turn AC6 green. Main session must review/resolve the retained pagination DOM-node failure and rerun the unfiltered suite before claiming the complete gate passed.

## Product hash and run boundary

`final-current` is the last unfiltered attempt on the checker's final product files: **2026-10-02 12:54:48–12:57:42 +08:00**. All seven product hashes below match its start/end metadata and current files. Thus this failure is on the actual final candidate, not another checkout or old HMR product code.

| Product file | SHA-256 |
| --- | --- |
| `components/ChatWindow.tsx` | `ccd8d78559317aa829f476a68b827b94298b08de55e11e7a8f6a725939f327dd` |
| `components/MessageView.tsx` | `a92f04b23b2dc4642aa489109a56aec6f045854e62b574308882fc96bf88623f` |
| `components/CodemodeToolView.tsx` | `57b5598dac3c59b8277e752dbab4ea3fcd53f959b8e4da087d600b4e1b6912b0` |
| `lib/rpc-manager.ts` | `ff8fe1620cbe27df110307700a3a93875668bae384e15edab93bf635e5cd85d3` |
| `lib/written-file-sources.ts` | `0a54ba23ddbb4d7de5b3f17370354b4717b4cb04a4f92c1ca731898a06935237` |
| `lib/session-file-references-core.ts` | `6fd2123ed39bee3668e09b8614797ca033f6676c2faf91e33a12bd8fef1dfa3c` |
| `lib/subagent-runtime.ts` | `0442e5664a3b330180b7922760b5b04834d0ff442ece1d9c0baa1ba201ef6783` |

The broader product manifest (tracked files under app/components/hooks/lib/public/demo plus next config/package/lock, excluding `*.test.mjs`) is `test-results/browser-verification/product-manifest.sha256`; its digest is **`238a91be96ace205b9555c6b340c5479d7bd99d886ce9884fa76e2b182ca89db`**. Full start/end records, e2e script hashes and source mtimes remain ignored evidence. Earlier `final-warm` predates the final session-reference-core change; do not substitute it for `final-current`. UI hashes were already the repaired font-label versions in the final supplemental runs.

Main-session/checker-provided product gates: **2121/2121 units, 628 lint targets/0 errors/0 warnings, tsc 0**. This agent did not repeat those Node gates. Own final scoped lint of the four e2e JS files: exit 0; syntax checks and `git diff --check -- e2e` also exit 0.

## Isolation and commands

Every server gets a fresh runner-generated fixture `PI_CODING_AGENT_DIR`, and every invocation its own temporary HOME/TMPDIR. No agent auth file, user MCP, real HOME, inherited provider keys or global PI_OFFLINE; candidate root has no `.env*` files. Tests use disk history, existing SDK UI-command fixtures, controlled EventSource/SSE and a stubbed prompt. Navigation reaches the real isolated SDK; no paid completion is requested.

```sh
iso=$(mktemp -d /tmp/pi-web-browser-XXXXXX)
mkdir -p "$iso/home" "$iso/tmp"
env -i PATH="$PATH" LANG=C.UTF-8 NODE_ENV=development \
  HOME="$iso/home" TMPDIR="$iso/tmp" \
  PLAYWRIGHT_EXECUTABLE_PATH=/home/xupeng/.local/share/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell \
  E2E_SERVER_MODE=dev npm run test:e2e
```

The default script is `node e2e/run.mjs && node e2e/subagents.mjs`, sequential, with runner-owned loopback ports. Diagnostic supplements use the same environment and fixture server, never a parallel dev server:

- `E2E_VIEWPORT_WIDTH=390 node e2e/run.mjs` — one-width full-check diagnostic.
- `E2E_CHECK_GROUP=interactive node e2e/run.mjs` — later file/dialog/ask/status/restore/appearance checks explicitly labeled TARGETED.
- `E2E_CHECK_GROUP=touch node e2e/run.mjs` — final coarse-pointer geometry/Enter checks, explicitly TARGETED.
- `node e2e/subagents.mjs` — complete Trellis runner after the failed first runner's cleanup.

## Attempts, first failures and last warm evidence

All paths below are relative to ignored **`test-results/browser-verification/`**. Each attempt preserves full output, server log, and available screenshots/traces. Nothing is silently overwritten as the final pass.

| Attempt | Exit | Actual outcome |
| --- | ---: | --- |
| `initial`, `existing` | 1, 1 | Old launchers ignored requested PLAYWRIGHT_EXECUTABLE_PATH, searched isolated HOME's empty cache. Added compatible alias, preserving older variable. No browser pass claimed. |
| `existing-browser` | 1 | First 30s browser state wait exhausted by cold root compile (22.7s) plus hydration/API compilation; retained failure/trace. |
| `existing-warm` | 1 | Fresh-process compilation; unhandled pending wait rejection escaped cleanup. Owned orphan independently confirmed in candidate. |
| `cold-diagnostic` | failed | First diagnostic had its own response.status typo. Retry: root HTTP 200/87ms, orphan state fetch timed out at 120s; no browser reload was reached. Not a pass. |
| `expanded-1`, `expanded-3` | 1, 1 | Original 1280px pagination DOM-node preservation assertion fails with correct nonempty entry IDs. |
| `expanded-2` | 1 | Existing desktop checks passed through ask/restore/fonts/status; new fixture initially included SyntaxHighlighter line-number chrome in script text. Extract only number chrome from a detached clone and retain exact script-byte assertion. |
| `expanded-4`, `expanded-5` | 1, 1 | New fixture multiline innerText assumption; then root offset override did not affect descendant `.chat-content`. Use exact row fields and actual font shortcuts. |
| `expanded-6` | 1 | Code mode sizes correctly +3; added generic MCP-header font demand was beyond approved Code mode typography scope. Retain measurement/debt, not a new production requirement. |
| `expanded-7` | 1 | Extra draft-persistence-across-reload demand contradicted existing page-local Map. Approved cancel-preserves-draft remains; reload verifies unchanged branch, not a new persistence feature. |
| `expanded-8` | 1 | 4s timeout closed before second countdown sample; screenshot already shows healthy successor input dialog. Faux timeout now 8s; all countdown/change/server-only expiry/answer assertions retained. |
| `final-warm` | 1 | Unfiltered default suite still fails original 1280px pagination node assertion. |
| `mobile-and-trellis/mobile.log` | 1 | New 390px checks pass; original pagination node assertion also fails at 390px. |
| `mobile-and-trellis/trellis.log` | 1 | Old fixture tried to navigate while running, contrary to merged hook policy. First failure preserved. |
| **`trellis-warm`** | **0** | Corrected fixture retains running-click rejection and original historical settlement/output assertions. **1280, 744 touch, 390 all pass**, including builtin-only/records-only/mixed/empty and applicable races/replay. |
| `interactive-warm` | 1 | Desktop new/file/dialog/ask/status checks pass; overly narrow offscreen code-subblock marker times out in supplemental restore. Screenshot shows correct Rich answer at remembered reading tail, not another session. |
| `interactive-warm-2` | 1 | **Desktop/mobile interactive checks all pass**, including restore and ChatAppearance; last old touch geometry assumed two messages overflow 300px despite compact More controls chrome. First failure preserved. |
| **`final-current`** | **1** | Latest final-product unfiltered gate again fails original 1280px pagination node assertion. Not a complete pass. |
| **`touch-warm`** | **0** | Truly overflowing 180px coarse viewport passes unchanged scrollability/column assertions; Enter newline/no prompt passes at **390 and 744px**. |

Fixture adaptations are evidence-based, not product changes: SDK running branch click now asserts no navigate_tree, settles before choosing X, then receives connected/settled on historical X. All original X durable / Y absent / live absent assertions remain. Supplemental restore uses the whole answer row (default full-suite marker untouched), then scrolls to the code for typography measurement. Touch uses 180px to actually overflow with the newly compact chrome. All preexisting assertion sites remain; no assertion or lint rule is disabled.

Cold-start preparation now HTTP-preflights exact candidate document/state routes with a 120s compile budget; original browser 30s assertions remain. Promise.all attaches the initial response rejection immediately, so its failure takes the runner cleanup path. Subsequent fresh-document/reload checks run on newly owned candidate servers, not retained HMR sessions.

## Covered browser interactions

| Case | Browser evidence / boundary |
| --- | --- |
| MCP completed card | Both 1280/390: click to expand, **docs.v2/search.pages** from original result details (registered name deliberately differs), exact indented JSON in rendered pre. History rendering, not MCP transport execution. |
| Code mode | Both widths: click to expand, JavaScript label/exact script excluding line-number chrome, two nested rows with name/args/status/error/duration, output without transport header, no horizontal overflow. |
| Font fixes | Real Ctrl+Shift+Equal: script/row/label/count **[12.5,11.5,11,11] → [15.5,14.5,14,14]** at both widths. Waiting-count +1 also measured. Generic MCP header/preview stays [11,11], explicitly observed existing debt. |
| History edit | Both widths: actual click only prefills; cancel keeps edited page-local draft and leaf/answer; document reload keeps branch; Send performs exactly navigate_tree then stubbed prompt; real SDK branch changes and is restored for next viewport. |
| Dialog/custom queues | Three concurrent requests per independent queue, non-head id close, FIFO advancement, ordinary response/custom input IDs, custom close waits for server closed. Force onerror, wait for replacement source, reconcile pending IDs, dedupe replay, reject discarded-source callbacks. Mock lifecycle, not real network outage. |
| Existing fork interactive checks | Final supplemental run: desktop/mobile ask shared view/keyboard/locked summary/reject+retry/cancel/themes, extension keyboard/cancel/draft/countdown/server expiry, status attached/detached/unchanged/changed tail, file panel. Desktop restore URL > workspace memory and font/minimap-related ChatAppearance typography/reset/short settings hit tests also exercised. |
| Minimap/process/history | Earlier unfiltered `expanded-2` passed original desktop minimap click preview/font family/sizes, process/lazy thinking/order, compaction navigation, reading offsets/cancelled branch restore. **Pagination node stability remains failed** and is not covered by a green substitute. |
| Trellis | Warm runner all three widths: builtin/records/mixed/empty, read-only behavior, old records beyond page 50, branch/race/reconnect/final/historical ownership at applicable widths. Successful traces saved for all widths. |
| Touch input | Corrected overflowing geometry plus 390/744 coarse-pointer Enter newline/no model prompt. Chromium emulation, not native soft-keyboard or iPad/Safari hardware. |

New fixture has **36 static `assert.*` call lines**, with loops adding repetitions; script runners do not emit a runtime assertion tally. Do not present this as a Node test count. Screenshots and success/failure traces include `ac6-codemode-*`, `ac6-history-edit-*`, `ac6-extension-queues-*`, `ac6-touch-enter-*`, `trace-1280.zip`, `trace-390.zip`, `trace-744.zip` and `trace-touch.zip` in their corresponding attempt directories.

## Unresolved product finding / handoff gate

**Reproduction:** seed the unchanged 5000-message history fixture; open LONG on 1280 or 390px, retain actual DOM handle for E2E message 4998, trigger two real older-page fetches via sentinel, return toward tail. The old handle has `isConnected:false` while replacement nodes still have correct `data-entry-id=e4998`. Last diagnostic: 525 labeled nodes, **0 empty IDs**, 3 matching text nodes with e4998. Earlier failures show 600/0/3. This is not a fixture missing entry IDs. Logs show wrapper session_start / new custom-entry leaf / full refresh around pagination; whole-list remount is a hypothesis, not a proven root cause. Existing runner already noted intermittent reproduction before this task; that is not a waiver.

Evidence: `final-current/{full.log,e2e/failure.png,e2e/trace.zip,e2e/server.log}` and earlier four failures, including 390px. Main session was notified repeatedly. No product fix made by this browser agent. **Resolve or explicitly review this failure, then rerun the unfiltered gate on the final tree; do not use targeted passes to mark AC6 complete.**

Uncovered/limits: live paid-provider completion, user MCP/OAuth, actual MCP browser transport, running thinking/fork controls, native Safari/iOS 16.2/WKWebView/IME/Windows. Existing polluted Agent history migration is not browser-validated or automatically repaired here; main's spec limit remains authoritative. No page-reload draft persistence promise added.

## Cleanup and files

30141 had no listener at initial/final check. Runner-owned ports only; no same-checkout parallel dev server. The one orphan (parent 2702023 / Next child 2702035, port 33863) was stopped precisely after cwd/pid/listener verification; stale lock explicitly named that dead child and was removed after both pids disappeared. Other three preexisting Next servers were untouched. Final checks show no candidate lock holder, owned server/browser/e2e process or 30141 listener; all owned temporary HOME/TMPDIR trees removed, artifacts retained ignored.

Files for main's explicit review/staging:

- **New** `e2e/upstream-interactions.mjs` — shared-server AC6 browser fixtures/checks.
- `e2e/run.mjs` — seed/wiring, cold preflight/error handling, explicit diagnostic selection, success traces, overflowing touch fixture.
- `e2e/subagents.mjs` — executable alias, trace collection, evidence-based running-navigation fixture correction.
- `e2e/extension-dialog.mjs` — 8s faux timeout and countdown evidence; assertions unchanged.
- `e2e/README.md` — fixture/isolation/diagnostic boundaries.
- This report; no raw environment/credential logs are staged/submitted.
