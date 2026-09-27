# Design — upstream merge

## 1. Delta being merged

`personal..upstream/main` = 37 commits (10 feat, 19 fix, 2 perf, 3 chore, 2 Release),
touching 404 files. Anchors at freeze time: `personal` = `f186cdb`,
`upstream/main` = `96966e5`; the full commit list and the exact commands live in
`research/upstream-delta.md`.

`git merge-tree --write-tree --name-only personal upstream/main` reports **23 content
conflicts**:

```
README.md, README.ja.md, README.ru.md
app/api/sessions/route.ts, app/api/sessions/[id]/route.ts, app/api/sessions/[id]/context/route.ts,
app/api/sessions/runtime-route.test.mjs
components/AppShell.tsx, components/AppShell.workspace-memory.test.mjs, components/ChatWindow.tsx,
components/SessionSidebar.tsx, components/SessionSidebar.test.mjs
eslint.config.mjs
hooks/useAgentSession.ts
lib/next-config.test.mjs, lib/session-reader.ts, lib/session-reader.test.mjs,
lib/subagent-runtime.test.mjs, lib/worktree.ts
package.json, package-lock.json
```

plus two **modify/delete** conflicts: `lib/session-list-scanner.ts` and
`lib/session-list-scanner.test.mjs` were deleted on `personal` (replaced by
`lib/session-list-cache.ts` plus the incremental scan in `lib/session-reader.ts`) and
modified upstream.

## 2. Semantic collisions (the part that needs judgement)

These upstream commits overlap fork features built on other code paths. Each needs a
decision that keeps *both* behaviours when they are compatible:

| Upstream change | Fork counterpart | Expected resolution |
|-----------------|------------------|---------------------|
| `ef1de89 feat(sessions): remember the open session per browser tab` | `lib/workspace-memory.ts` + the `?session=` precedence fix from PR #15 | Compose: per-tab memory is upstream's model of the same need. Pick one mechanism per concern and keep the URL-precedence invariant; if upstream's storage key differs, unify on the fork's to avoid two competing memories, and keep `e2e/session-restore.mjs` green |
| `fix(chat): reopen the session event stream under Strict Mode effect re-runs`, `fix(chat): keep earlier replies visible after a subagent notification`, `fix(agent): deliver events to every listener when one unsubscribes mid-emit` | `hooks/useAgentSession.ts` (SSE grace window, run ids, reconciliation) + `lib/agent-event-*` | Adopt upstream's delivery semantics inside our stream management; drop neither side's guards |
| `feat(subagents): switch individual built-in sub-agents off` + 4 more subagent fixes | built-in subagent toggle + `AgentsConfig` + `lib/subagents.ts` | Upstream's per-agent switches sit on top of our global toggle; keep both and re-verify the reserved-tool guard |
| `perf(session)` + `perf(ui): reduce session list scroll work` | incremental scan + `session-list-cache` | Take upstream's perf intent into our scan path; the scanner they modified no longer exists here (AC2) |
| `feat(models): enabledModels switches`, `fix(models): read models.json like pi`, `feat(models): refresh catalog`, quota additions | `lib/model-scope.ts`, `ModelsConfig` | Adopt; our `resolveModelScopeWithDiagnostics` path must stay the only scope resolver |
| `chore(deps): upgrade pi to 0.87.1`, `chore(deps): trim the production install and bump next, semver, undici` | pinned pi 0.85.1 + SDK-contract tests (`lib/append-system.test.mjs`, ask_user type imports, tool presets) | Explicit decision, see prd "Open decision" |
| `feat: scroll to latest button`, `feat(files): mention button`, `feat(plugins): package description`, `feat(minimap): tool-call count` | fork UI work in ChatWindow/Sidebar/SettingsPanel | Adopt; these are additive |

The README conflicts (3 languages) are documentation: upstream rewrote large parts, the
fork documents its own package name and install line. Take upstream's text and re-apply
the fork-specific facts (package name, install command, release channel).

## 3. Resolution policy

1. **Structure wins locally, semantics win upstream.** A conflict is only "take ours"
   when the fork deliberately replaced the mechanism (session-list-scanner → cache); a
   conflict that carries a fix is "take theirs" unless a fork invariant depends on it.
2. **Never resolve a test conflict by deleting tests.** If both sides added tests, the
   merged file keeps both; if a fork test asserts a behaviour upstream changed, decide the
   behaviour first, then update the test to the decided behaviour.
3. **Generated files are regenerated, not merged.** `package-lock.json` is resolved by
   taking one side's `package.json` and running `npm install` (never hand-edited);
   `package.json` keeps `@xup3ng/pi-web` and the current version.
4. **Every decision is written down** in `research/conflict-decisions.md` as
   `file — resolution — reason (fork commit / upstream commit)`.
5. **`AGENTS.md` is re-read.** It auto-merged, so nothing guarantees it still matches the
   code; the sections covering session list scanning, SSE/reconciliation, worktrees and
   subagents are checked against the merged implementation.

## 4. Verification

| Check | How |
|-------|-----|
| Types / lint | `node_modules/.bin/tsc --noEmit`, `npm run lint` |
| Unit | `env -u NODE_PATH XDG_STATE_HOME= npm test`; reconcile the count against 1522 (upstream adds tests, our scanner tests are gone) |
| e2e | isolated worktree, `E2E_SERVER_MODE=dev`, temp `PI_CODING_AGENT_DIR`, both viewports, must include the ask_user, append-system, session-restore and history sections |
| Security fixes (R4) | targeted checks: `PI_WEB_PASSWORD` absent from a shell spawned through the terminal/bash tool; Basic Auth throttle shows the doubling delay; a cross-origin login redirect is rejected; an unreadable `models.json` is not overwritten; event delivery survives an unsubscribe mid-emit |
| Fork features (R3) | the e2e sections above plus the unit suites for the append-system loader contract, tool presets and workspace memory |

## 5. Escalation

If adopting upstream's dependencies (pi 0.87.1 in particular) produces fallout that
cannot be repaired and verified inside one bounded session, do **not** land a
half-verified merge: keep the branch, record the state in `research/escalation.md`, and
create a follow-up child for the SDK upgrade with this merge rebased on the
pin-keeping variant. The release child then proceeds on the pin-keeping merge.
