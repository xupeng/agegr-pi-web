# CI and browser regression tests

Adapted from @Nuctori's CI/E2E proposal in #617 and #599. The performance
scanner, reverse reader, sidebar changes, and timing benchmarks are not included.

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

Those three commands are the full local browser run. Use them for explicit slow
verification or for debugging one CI failure; the default development loop runs
only the tests for the files it changed.

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

## CI and the development loop

Two independent GitHub Actions workflows run verification, and neither waits for
the other:

- `CI` (`checks`) is the fast gate: `npm ci --include=dev`, `npm run lint`,
  `node_modules/.bin/tsc --noEmit`, then the full `npm test` suite. It runs on every pull
  request update and every push to `main` or `personal`.
- `Slow tests` (`e2e`) owns the browser suites in a clean checkout: install
  Chromium, `npm run build`, `node e2e/run.mjs` with `E2E_SERVER_MODE=start`
  against `next start`, then `node e2e/subagents.mjs` against a dev server.
  Pull request updates, `main`/`personal` pushes and manual `workflow_dispatch`
  are configured to start it; a newer run for the same event and pull request/ref
  cancels the older one. PR, push and manual events do not cancel each other.

`workflow_dispatch` requires the workflow file to exist on the repository's
default branch (`main`, not the development baseline `personal`). This new
manual entry is not activated by a feature-branch push alone; it remains pending
until the workflow is present on `main`. Automatic PR and `personal` push runs
are separate from that restriction.

Develop against the fast suite. Each round, run only the tests for the files you
changed (`node --experimental-strip-types --test lib/foo.test.mjs`); before
committing, run `node_modules/.bin/tsc --noEmit`, `npm run lint` and `npm test`.
Do not run `next build` or `npm run test:e2e` in the development loop: the
headless `e2e` job is the browser evidence, and a local `next build` breaks the
dev server.

A green `e2e` run only proves the commit it checked out. A pull request run
checks out the synthetic merge commit, so compare the run's checked-out SHA, the
pull request head and merge SHAs and the base SHA/ref with your current candidate before
claiming delivery, and never reuse an older green run. The job summary in the run
UI reports those identities, the run URL, each Actions outcome, command status,
exit code and wall-clock duration (including failed commands). Skipped or
incomplete stages are explicitly not successful.

Both jobs start commands through `env -i` and `lib/ci-test-env.mjs`, not just a
HOME override. The helper builds an explicit minimal environment and private
`HOME`, `TMPDIR`, `PI_TASK_TMPDIR` and `PI_CODING_AGENT_DIR` directories under
an owned runner-temporary tree. It does not pass provider/OAuth/MCP credentials,
GitHub action tokens, proxies, `NODE_OPTIONS`, XDG paths, user npm configs or
E2E diagnostic selectors. Workspace `.env`/`.env.*` files fail closed before
any command; they are not deleted. npm uses a job-owned download cache and the
same checkout dependency tree throughout. Chromium install and both suites
share an explicit `PLAYWRIGHT_BROWSERS_PATH` despite their different private
HOME directories. This isolates inherited config/credentials, **not** arbitrary
network access or untrusted PR code. The helper does not force `PI_OFFLINE`:
existing package/trust tests require their normal preflight callbacks, and some
catalogue tests intentionally clear offline mode. Fixtures are not a network sandbox.
`permissions` is limited to `contents: read`, the checkout does not persist
credentials, the timeout is 20 minutes and cancellation is per pull request/ref.
Failures upload `test-results/e2e/`, `test-results/e2e-subagents/` and command
logs/timing JSON in `test-results/ci/` for 7 days, including early build failures.
The independent subagent suite still runs after a main-suite failure if build
succeeded, never after cancellation. The wrapper forwards cancellation to only
its owned process group, escalates after one second, and removes only its
private command directories; the final cleanup validates job-root ownership.
Artifact/summary/cleanup steps also attempt to run on cancellation, but hard
termination or a runner outage can prevent them. The hosted runner lifecycle is
the final cleanup boundary; absent evidence is not a pass.

The merge/release gate is an explicit delivery rule, not newly configured GitHub
branch protection or an automated release blocker. `e2e` remains the job id but
the workflow changed from `CI` to `Slow tests`; any old required-check mapping
must be verified rather than assumed compatible. Safari, Windows and live
provider/MCP integrations remain unverified.

For an explicitly authorized local diagnostic, isolate the runtime TMPDIR as
well as HOME/agent, on a private disk-backed root whose ancestors do not contain
real `.pi`/`.agents` resources. SDK fixture discovery can walk project ancestors;
placing TMPDIR inside the real home can leak discovered skills/trust requirements
despite a private HOME. Use `pi-tmp-run` to own the finite command/processes and
clean only directories created for that run. Never touch shared `/tmp`, a dev
checkout's dependencies/build output, or live agent resources.

### Coverage classification

This is a declaration of what runs where, not a fast/slow ranking: splitting
`npm test` further will follow the durations reported in the job summaries, and
no test was removed to speed up the local loop.

| Entry point | Where it runs |
| --- | --- |
| `npm test` (`app/`, `components/`, `hooks/`, `lib/`, `public/`) | `CI` `checks` |
| `e2e/run.mjs` and its helpers (`file-panel`, `extension-dialog`, `chat-appearance`, `ask-user`, `session-restore`, `status-tail`, `upstream-interactions`) | `Slow tests` `e2e`, `E2E_SERVER_MODE=start` |
| `e2e/subagents.mjs` | `Slow tests` `e2e`, always a dev server |
| `e2e/terminal.mjs` (`npm run test:terminal`) | Not wired: needs a real PTY/`node-pty` session. Portable in principle; measured later |
| `e2e/pdf-page-fragment.mjs` | Not wired: needs a full Chromium build with the PDF viewer, not a headless shell |
| `e2e/ask-user-host.mjs` | Not wired: requires `PI_TASK_TMPDIR` and a real SDK prompt chain |
| `e2e/themes.mjs` | Not wired: expects a service already listening on the default port |
| `e2e/notification-center.mjs`, `e2e/notification-center-layout.mjs`, `e2e/clickable-file-paths.mjs` | Not wired: machine-specific (`/var/tmp` btrfs fixtures, LAN `8505`, `/sbin/chromium`, retained evidence from older tasks) |
| `e2e/subagent-model-selection.mjs` | Not wired: gated, and needs `/var/tmp` plus a specific Chromium |

The summary durations are wall-clock measurements of each command, not the
`test timeout` budget of individual assertions. npm test's Node output includes
test counts and per-test/subtest durations; inspect the Actions log, or the
uploaded `test-results/ci/tests.log` on failure. Downloaded logs can be re-read
to rank candidates before proposing a split; summaries alone do not rank files.
Runtime candidates include MCP timeout/child-process tests, project-command
descendants, cold SDK model restore, and real git/worktree tests. These remain
inside the full npm test collection; integration suffixes are not a timing measurement.

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
`test-results/e2e/`; `e2e/subagents.mjs` writes the same kinds of files under
`test-results/e2e-subagents/`. The CI job uploads both directories. Open a trace
with `npx playwright show-trace test-results/e2e/trace.zip`.
