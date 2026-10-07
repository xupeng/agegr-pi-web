# Execution plan

Status: implementation and the concrete eight-group commit batch approved. Clean R is 31483c6; final local verification is complete. Publication and deployment remain pending delivery.

## Ordered work

1. Reconfirm origin/repository identity, source O, base B, all existing remote refs, clean primary checkout and current service identities. Stop if anything drifted.
2. Create private disk-backed offline backup outside Git. Verify bundle closure and independent recovery of O, original task evidence and expected tree; retain a checksum/ref snapshot there, not in tracked task logs.
3. Create one owned stable worktree. Reconstruct logically grouped source/test/spec/original-task commits from B using the final O tree minus the exact raw artifact set. Never commit raw artifacts and delete them later.
4. Compare all blob/mode pairs against O; review exception allowlist; prove B ancestry and absence of O/polluted ancestors and 224 task-specific raw blobs. Repair archived Markdown/manifest references without fabricating new acceptance.
5. Prepare the small policy/documentation change and this task's curated context/acceptance on the task feature branch. Check agent handoffs in isolated contexts; no agent may push, force refs or modify services.
6. Run clean-lock tsc, lint, full tests and independent full-tree/history review. Keep raw output in private recovery evidence; commit only counts, commands, environment and coverage summaries. List complete intended staged files/stats for the one-shot commit review.
7. Finish work/spec/task commits, then archive and journal on the feature branch before its PR. Verify archive/journal refs and logical compileable commit grouping. No commit-amend or blind add-all.
8. Recheck all existing refs and the exact O lease. Normally push only the new task feature ref; CAS-rewrite personal to reviewed R with `--force-with-lease=refs/heads/personal:<O>` and an explicit destination. No --mirror, bare --force, tag rewrite or remote contaminated backup branch.
9. Create the small feature PR against clean personal, inspect actual base/head/merge-base and auto-merge state, wait for exact-head checks/e2e, and normally merge only with matching head and known base. Stop on concurrent advancement. Verify M's ancestry/tree is still clean.
10. Synchronize the verified clean primary checkout, clear only this task's planning breadcrumb, and rebuild/deploy M to 26812 using an independent supervisor. Preserve 8505; compare protected config metadata and run read-only health/static/API smoke checks.
11. Verify normal clone reachability/history and all unaffected remote ref tips. Clean owned worktrees/candidate units/build homes, retain explicit recovery/rollback evidence and scope lifecycle, and complete finish-work on the feature-delivery record.

## Mandatory checks

- `git bundle verify` plus independent bundle restoration/tree check.
- Full Git tree and mode comparison; exact scoped raw-path/blob reachability; parent graph verification.
- Existing remote heads/tags snapshot comparison, new task-ref exception, exact old-tip CAS.
- Lock-consistent `npm ci --include=dev`; `tsc --noEmit --incremental false`; ESLint file/diagnostic counts; full npm test counts.
- Exact clean-head GitHub `checks` and `e2e`, with real production Chromium from CI; retained prior controlled feature matrix explicitly historical.
- Production build-stamp SHA, page/static/API status, settings/auth metadata only, development PID/start/cgroup identity, no candidate port/process/override residue.

## Risk ownership

Only the main session performs commits, remote writes, primary ref synchronization and production operations. Use native apply_patch for source/document edits. Backups and source worktrees are on the main disk, never `/tmp` or auto-expiring cache. Subagents must verify TMPDIR, remain read-only or hand patches back, and return compact summaries rather than raw outputs.

Stop on unknown dirty files, changed protected configuration, old-history contamination, unexplained test/count drift, branch protection, non-matching remote tips or unsafe service ownership. History changes require existing clones to rebase/reclone rather than merge old history into the replacement.
