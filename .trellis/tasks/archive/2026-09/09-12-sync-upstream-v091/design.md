# Design: isolated upstream synchronization

## Boundary

Behavior gap: personal lacks the fixed upstream v0.9.1 changes; merging must not remove the fork's current behavior or the accepted Trellis snapshot contract. Owners are session routes, session hook/RPC lifecycle, UI consumers and existing customization modules, not a second adapter or a wholesale ours/theirs resolution.

Research authority: [research/merge-plan.md](./research/merge-plan.md), including P01–P14 retention matrix and ten actual conflict files; [research/inventory.md](./research/inventory.md) contains complete fixed-input commit/path inventory.

No implementation in this phase. Expected implementation edits: the ten conflicted files, narrowly necessary semantic fixes/tests in auto-merged hook/RPC/ChatWindow/session reader and related suites, and the owning Trellis spec if reconnect wording changes. Upstream's other 79 paths arrive through normal merge; untouched personal-only assets/configuration/history stay unchanged. No broad refactor, dependency upgrade, package version bump, release, workflow upgrade or independent bug-fix campaign.

## Contracts and data flow

1. Persisted entries and scoped SSE → existing exact Trellis tool/kind decoder → bounded branch projection/store → ChatWindow publication → AppShell owner/parent filter → read-only runs next to real built-in sessions.
2. Upstream selected-session lease and active-tool replay are lifecycle mechanisms, not Trellis record liveness or ownership. Keep assistant-call ownership, head/view gates, event/history watermarks and request/SSE/cleanup rejection. Never trust replayed start as proof a tool belongs to the currently viewed branch. Partial remains non-durable.
3. Detail JSON compression wraps the existing complete payload including Trellis envelope; no extra directory scan. List compression wraps the local targeted/project/all branches. Context explicit root/null/unknown/cycle and pagination envelope-absence remain unchanged.
4. Built-in descendant delete traverses real subagent relations, aborts/shuts down runtimes, removes their files and local persisted asks/caches. Ordinary forks survive/reparent per upstream contract; Trellis snapshots are never deletion targets or session IDs.
5. Built-in queue/resume/profile/worktree preserves upstream metadata and resource contracts. Tests create worktrees only in disposable fixture repositories, never through real project/profile UI. Preserve latest status/result with local incremental reader and family grouping.
6. Accept upstream theme/language-in-Settings, extension Markdown, first-message fork/Edit-from-here, shell stream resume, quotas/plugins/push changes. Preserve personal images, ask cards, touch Enter, fonts/font preference migration, settings safety, caching and Trellis-only entry. Canonical navigation must also obey view ownership; passive settlement must stay on historical view.

Compatibility: keep @xup3ng/pi-web 0.9.2 and Pi SDK 0.85.1. No new schema/version environment key. Root npm lock metadata stays local; pnpm lock remains unchanged unless an evidenced install incompatibility requires a separately reviewed correction. Old relative font-size and reverted Electron traffic-light behavior are not to be resurrected.

## Execution isolation

After fresh planning approval, create a named temporary merge branch/worktree from exact L, not upstream or moving HEAD. Create a separate baseline source from L (detached worktree or disposable archive copy). Both have private node_modules/.next/artifacts; no symlink to main dependencies. Install locked dependencies only there. Use isolated HOME/XDG and fresh PI_CODING_AGENT_DIR for test processes, explicit browser path/cache, scrub provider credentials; E2E dev servers bind 127.0.0.1 with dynamically allocated ports. Main and installed service remain untouched.

Read-only inspection found main dev on :8505, installed 0.9.2 on :26812, package default :30141. Treat these as observations, not reservations; recheck. Do not prune existing stale worktree registration. No next build, even in candidate. Native terminal postinstall can mutate only private dependencies. Main code checkout and .next are not part of merge/testing.

## Main-owned task documents and safe integration

The current task directory is untracked on L and intentionally remains authoritative in main throughout implementation. Do not symlink it into worktree, run task start against missing candidate artifacts, or stage an agent's divergent document copy. Load planning/spec context via absolute paths to main. Canonical task start happens in main only after approval; explicitly set candidate cwd for every business-code/test command. Record candidate path/branch in task metadata at that time. Agents return findings to main task research; spec/code changes live on candidate.

Recommended late-integration topology (all commits require the later integration authorization; none now):

```text
L ---- D (task-doc-only commit on personal, after validation)
 \\      \\
  M ---- I (candidate integrates D; personal then ff D -> I)
 /
U
```

- Candidate performs `merge --no-ff --no-commit U` from L, resolves conflicts, validates uncommitted result. Main still holds L plus its planning/report files. Preserve external backup/checksums of task documents.
- Present validation report and exact staged scope before committing/updating personal. Existing equivalent lint/E2E failures, if any, must be explicitly accepted here; new failures block.
- With authorization, create M on candidate containing upstream merge + conflict/semantic fixes/tests/spec only (parents L,U). Inspect cached diff; no auto-generated files or credentials.
- Confirm personal still L and main index/worktree match the recorded allowed task-only changes. If anything else changed, stop; never stash/reset another user's work. Commit D on main using an explicit path allowlist for this task (plus only pre-approved lifecycle bookkeeping), not `git add .`. D contains final pre-integration report and complete task artifacts. This is documentation only: business code remains L.
- Merge D normally into candidate M to form I, rather than cherry-picking and losing D's ancestry. Verify I has L,U,D as ancestors; compare I business tree to validated M, and run final diff/type/task-context checks (repeat affected/full tests if code changed). Task documents now reach candidate by Git, with main originals intact and no untracked-overwrite obstacle.
- Recheck main is exactly D, index/tracked/untracked state has no unexplained changes, candidate clean at recorded I, and target test evidence refers to I or identical code tree. Keep a named pre-integration recovery ref to D/L. In main run only `git merge --ff-only <candidate-branch>`; no `git branch -f personal` on a checked-out branch. If refs move concurrently, abort and replan rather than force.
- Task documentation may evolve during final checks: if changed materially, re-review and commit/reconcile before ff; don't hide drift or discard it. Operational ff result can be reported afterward without claiming a pre-ff report recorded a completed action. Keep task out of archive.

Alternative approaches (pre-commit docs now, automatic stash -u, move/delete untracked task just to force ff, force-update checked-out personal) are intentionally rejected. The late D merge adds a small metadata merge but avoids moving main code before validation and avoids losing task history. This topology remains possible while no main business changes occur; otherwise stop for revised approval.

## Operational impact / rollback

Isolation protects the current service during candidate work, not forever. Final ff updates source in the active checkout and **will trigger HMR/recompilation**, possibly browser reloads and a mixed old/new globalThis runtime. It does not restart the service or guarantee already-created wrappers upgrade. Notify user before ff and perform only at their approved window; explicit service restart is outside this task and needs separate permission if later required.

Before ff: abandon only our candidate merge/branch if needed; main business code stays L. After ff: do not hard-reset a live checkout automatically; preserve all refs, diagnose and propose a reviewed forward revert/fix. Any rollback source update also triggers HMR, and cannot undo runtime/session data changes; tests therefore use no real data. No push, publication, tag or prior-task archival at any stage.
