# Conflict decisions — `personal` ← `upstream/main`

- Merge base `5e9b997`; `personal` = `f186cdb`; `upstream/main` = `96966e5` (37 commits).
- Branch `merge/upstream-pre-0110-20260927-171343`, real merge (`git merge --no-ff upstream/main`).
- `git merge` reported **21 content conflicts + 2 modify/delete conflicts = 23 total**
  (the design's "23 content conflicts" counted the two modify/delete entries as content).
- Format below is `file — resolution — reason (fork / upstream)`.

## Modify/delete

- `lib/session-list-scanner.ts` — **kept deleted** — the fork replaced the scanner with the
  incremental mtime cache (`lib/session-list-cache.ts`) plus `loadAllSessions()` in
  `lib/session-reader.ts` (AC2). The one upstream refinement inside the scanner worth
  carrying over, the SDK catalogue tie-break, was ported (see below); the scanner's
  fingerprint cache and `listSessionsIncremental()` have no counterpart to port into and
  are N/A.
- `lib/session-list-scanner.test.mjs` — **kept deleted** — tests only the deleted module;
  equivalent coverage lives in `lib/session-reader.test.mjs` against the real scan path.
- **Ported (AC2):** the scanner's ordering contract (newest `modified` first, then reverse
  filename for ties) now lives in `mergeSessionLists()` in `lib/session-reader.ts`, the
  function `app/api/sessions/route.ts` uses to merge the disk scan with runtime snapshots.
  The mtime tie-break is redundant here because `modified` is derived from the file mtime
  when there is no activity timestamp.

## Content conflicts

| File | Resolution | Reason |
|------|-----------|--------|
| `README.md` | Took upstream's demo-link lead-in + fork's `xupeng/agegr-pi-web` screenshot URL | Doc only; fork publishes the screenshot from its own repo (`4857da3`, `96966e5`) |
| `README.ja.md` | Same as `README.md` | Same screenshot URL fix |
| `README.ru.md` | Same as `README.md` | Same screenshot URL fix |
| `app/api/sessions/route.ts` | Kept fork's `projectKey` / `sessionId` routes + `mergeSessionLists`; dropped `listSessionSummaries` import and `startServerPerf`; dropped upstream's `summary=1` path | Fork's on-demand per-project API already provides cheap first paint; `listSessionSummaries` came from the deleted scanner (`234e19e`) |
| `app/api/sessions/[id]/route.ts` | Kept fork's trellis projection; adopted upstream's `treeFormat` / `snapshotRevision`; fixed stale `SessionManager.open` → `openSessionManager` | Independent features; the SM cache is upstream's (`234e19e`) |
| `app/api/sessions/[id]/context/route.ts` | Adopted upstream's `openSessionManager`; kept fork's trellis projection | Same SM cache; trellis is fork-only |
| `app/api/sessions/runtime-route.test.mjs` | Took fork (title + `params.get("force")`) | Matches the fork route's `?force=1` handling |
| `components/AppShell.tsx` | Kept the fork's workspace memory **and** integrated upstream's per-tab memory (`lib/tab-session.ts` + `withTabOpen`, the post-mount layout effect, `set/clearTabOpenSession`); adopted upstream `mergeCatalogRow` and the `adopt` / fast-path in `restoreWorkspaceContext` (fork `projectKey`-scoped fetch) | The two memories are layered, not competing: URL `?session=` > this tab's `sessionStorage` > workspace memory. Dropping the tab layer left upstream's `AppShell.tab-session.test.mjs` red (3 cases); the layered version keeps the `?session=` precedence invariant (`ef1de89`, PR #15) and passes both suites |
| `components/AppShell.tab-session.test.mjs` | Kept as upstream shipped it (new file, unchanged) | It is the proof that the per-tab layer is really integrated, not dropped |
| `components/AppShell.workspace-memory.test.mjs` | Reverted the persistence-effect regex to the fork's; merged upstream's `initialSessionRestored: true` + `sessionCatalog: []` | Matches the AppShell resolution above |
| `components/ChatWindow.tsx` | Kept fork structure; inserted upstream's scroll-to-bottom button (`chat-scroll-to-bottom`, `showScrollToBottom`, `CHAT_MINIMAP_WIDTH`) | Additive UI (`1eb5e66`) |
| `components/SessionSidebar.tsx` | Kept fork's on-demand per-project architecture (`/api/projects`, `projectKey`, `projectSessionsByKey`); adopted upstream's rounded `scrollTop` (`renderedListScrollTopRef`) and `detailsPending`; removed now-unused `sessionListUrl`, `SESSION_DETAILS_HYDRATION_DELAY_MS`, `searchRefreshKey`; took upstream's `SessionSearch` call | Structure wins locally, semantics win upstream (`f101948`) |
| `components/SessionSidebar.test.mjs` | Took HEAD (fork) | Fork already has equivalent subagent-fold coverage; upstream tests drove the dropped `deferDetails` path |
| `eslint.config.mjs` | Combined both ignore sets | Additive |
| `hooks/useAgentSession.ts` | Merged fork guards (`sessionHookMountedRef`, request `seq`) with upstream's session-view-cache freshness, single-flight `loadSession`, and `CONFIGURED_TOOL_PRESET`; kept fork deps | Both fixes are required — neither side's guard is dropped (`0b307d5`, `0611857`, `a3f24ea`) |
| `lib/next-config.test.mjs` | Kept both tests | Additive |
| `lib/session-reader.ts` | Kept fork's incremental scan; removed all scanner imports (`listSessionsIncremental`, `listSessionSummaries`, `buildSessionList`, `ScannedSessionInfo`); added `allowStale`; kept upstream `openSessionManager` SM cache, `allowStale` logic, and system-message filter (auto-merged); added the ordering tie-break | Structure wins locally; upstream semantics adopted (`234e19e`) |
| `lib/session-reader.test.mjs` | Took HEAD for the scanner-mock conflict; kept upstream's SM-cache test and system-message test (auto-merged); the fork's tests drive the real scan path | Never delete tests; the fork's file already adapted to the deleted scanner |
| `lib/subagent-runtime.test.mjs` | Union of fork worktree-isolation tests and upstream provider-error / notification tests | Both sides added tests; keep both (`9d282da`, `12d3599`, `54aa49c`) |
| `lib/worktree.ts` | Kept fork `clearCachedProjectsOnDisk()` + 600 s TTL; adopted upstream's generation bump + `__piProjectRefresh.clear()` | Both invalidate caches; compose them |
| `package.json` | Kept fork `name` / `version` (`@xup3ng/pi-web` 0.10.0); adopted upstream's dependency bumps | R5 decision — take upstream's bumps |
| `package-lock.json` | Regenerated by seeding upstream's lock and running `npm install` | Generated file, never hand-edited (design §3.3) |

## R4 — upstream security fixes adopted (AC4 spot-check references)

- `lib/project-command-env.ts` + `lib/terminal-manager.ts` — strip `PI_WEB_PASSWORD` from
  agent bash and terminal child environments (`6ad18cd`; tests
  `lib/project-command-env.test.mjs`, `lib/terminal-manager.test.mjs`).
- `proxy.ts` + `lib/auth-throttle.ts` — every `Authorization: Basic` attempt on `/api/*`
  shares the login-form throttle counter; valid session cookies are never blocked
  (`beb32a9`; test `lib/web-auth-proxy.test.mjs`).
- `lib/login-destination.ts` + `app/login/page.tsx` — reject a login redirect that resolves
  to another origin (`3e1f436`; test `lib/login-destination.test.mjs`).
- `lib/models-config-store.ts` + `app/api/models-config/route.ts` — read `models.json` the
  way pi does and never persist over an unreadable file (`499aa4f`; tests
  `lib/models-config-store.test.mjs`, `app/api/models-config/route.test.mjs`).
- `lib/rpc-manager.ts` — an unsubscribe mid-emit no longer drops the event for every other
  listener (`a3f24ea`; test `lib/rpc-manager-shutdown.test.mjs`).

## R3 — fork behaviour preserved

Shared React `ask_user` view, append-system prompt editor + its pi loader contract test
(`lib/append-system.test.mjs`, `lib/exact-system-prompt.ts`), incremental session-list
cache, `?session=` restore precedence + workspace memory
(`lib/session-restore.ts`, `lib/workspace-memory.ts`), built-in subagent toggle (global +
per-profile), tool presets, and worktree grouping all survive on the branch.

## R5 — dependency decision

Adopted upstream: `pi` 0.87.1 (`@earendil-works/pi-agent-core` / `pi-ai` /
`pi-coding-agent` / `pi-tui`), `next` 16.3.6, `semver` 7.8.5, `undici` 8.11.0, plus the
trimmed production install. `package.json` keeps `@xup3ng/pi-web` 0.10.0.

## AGENTS.md review (AC6)

`AGENTS.md` auto-merged and already carried the new sections (`models/enabled`,
`models/refresh`, `lib/enabled-models*`, `lib/exact-system-prompt.ts`,
`allowStale`, `SUBAGENT_NOTIFICATION_PREFIX`, `disabledBuiltIns`, shared Basic-auth
throttle). Re-read against the merged code; the only stale line was the transcript note
claiming `listSessionsIncremental()` reproduces the SDK order — rewritten to name
`listAllSessions()` / `mergeSessionLists()` instead (the scanner no longer exists).

## Test reconciliation

38 upstream commits add tests; the fork deletes `lib/session-list-scanner.test.mjs`
(7 upstream tests) and its `listSessionsIncremental` wiring. `lib/session-reader.test.mjs`
and `lib/subagent-runtime.test.mjs` keep **both** sides' tests, and the upstream
`allowStale` tests were ported onto the fork's real scan path (3 tests, since the
scanner's `listSessions` mock seam no longer exists).

**Result: `env -u NODE_PATH XDG_STATE_HOME= npm test` → 1720 pass, 0 fail** (fork baseline
1522; the +198 delta is upstream's added suites minus the 7 deleted scanner tests, plus
one check-agent test for the ported equal-`modified` ordering).
