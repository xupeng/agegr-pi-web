# CI and browser regression tests

Adapted from @Nuctori's CI/E2E proposal in #617 and #599. The performance
scanner, reverse reader, sidebar changes, and timing benchmarks are not included.

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

The script starts and stops its own Turbopack dev server on an available
loopback port. Run it in a checkout without an active dev server; Next.js
shares `.next/dev/lock` within a checkout. All fixtures are created before
startup in a temporary `PI_CODING_AGENT_DIR` and removed on completion.
No model credentials or existing Pi sessions are needed. The server inherits
its environment: for local verification, launch with `env -i` and an isolated
`HOME`/`TMPDIR` so real provider credentials, MCP configuration and auth are not
inherited. `PLAYWRIGHT_EXECUTABLE_PATH` (or the older
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`) selects an already installed Chromium.
The main runner preflights the document/state HTTP routes for cold Turbopack
compilation; browser assertions still use the original 30-second budget.

CI runs lint, type checking, and unit tests in one job. A separate job builds
the application in a clean checkout and runs the same browser tests with
`E2E_SERVER_MODE=start` against `next start`. Do not build in a checkout used
for development.

Coverage:

- A 5,000-message session opens with exactly the last 50 entries, bounded
  detail/context responses, and no browser errors.
- Desktop and mobile scrolling load two consecutive older pages. Each response
  has the expected IDs, no gaps or duplicates, and the messages appear once in
  the chat. A small session checks pagination through the root.
- Reading-position capture parks the real older message at 120px and requires two
  consecutive within-5px frame samples with no pending older-page requests. A page
  response alone is not a committed prepend; the later session-switch restoration
  assertion keeps its original <5px tolerance and does not reposition on return.
- Branch context follows the selected leaf and excludes the other branch.
- Markdown, code blocks, and real tool-call/tool-result blocks render.
- Chat width and font size persist, existing drafts resize, and short settings
  panels keep every language option reachable on desktop and mobile.
- Unknown sessions and paths outside the fixture project are rejected.
- A local extension checks dialog keyboard navigation, Esc cancellation,
  collapse/expand draft preservation, countdown display, and server-side expiry.
- Completed MCP history cards display the original server/tool names from
  result details and indented JSON; Code mode displays JavaScript, nested call
  status/error/duration and measured chat-font-offset typography at both widths.
- History edit clicks only prefill; cancel preserves the leaf and page-local
  draft; reload preserves the branch (document-reload draft persistence is not
  provided). Sending performs real isolated SDK navigation before a stubbed
  prompt (no provider completion); the branch is restored for the next width.
- Controlled SSE exercises independent dialog/custom queues with three concurrent
  requests, id-specific non-head close, FIFO advancement, replay deduplication,
  and pending-id reconnect reconciliation. Custom input/close commands retain id.
- Coarse-pointer Chromium contexts at 390px and 744px keep Enter as newline,
  with an offline safety stub to prevent a regression invoking a provider.
- Trellis execution snapshots cover records-only and mixed built-in views on
  desktop/mobile, restore beyond 50 entries, A-B-A/session and X-Y-X/branch
  races, synthetic SSE reconnect/final reconciliation, and historical-branch
  settlement without navigating back to head.

Run only the Trellis feature browser regression with `npm run test:e2e:subagents`.
For diagnostic reruns when one viewport's retained failure blocks the other,
`E2E_VIEWPORT_WIDTH=390 node e2e/run.mjs` (or `1280`) selects one width. This is
not the complete gate: use unfiltered `npm run test:e2e` for the final result.
`E2E_CHECK_GROUP=interactive node e2e/run.mjs` separately collects the later
file/dialog/ask/status/restore/appearance checks when an earlier history-node
failure blocks them. `E2E_CHECK_GROUP=touch` selects only the final coarse-pointer
geometry/Enter checks. These outputs say TARGETED and never waive the full gate.

Paid model prompts, live provider streaming and user MCP execution are outside
this suite. The MCP/Code mode additions prove history rendering, not transport
execution. Queue reconnect coverage drives the app's real event handler through
fixture EventSource messages, not a real network disconnect.
Failures save a screenshot, Playwright trace, and server log under
`test-results/e2e/`; CI uploads that directory. Open a trace with
`npx playwright show-trace test-results/e2e/trace.zip`.
