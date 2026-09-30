# Implementation progress

## Frozen inputs
- L: 576e74f80b6fb271402369fde4bc0c5eee7cf509 (personal)
- U: 433d09ea2f2cc77b0ff356e8c57575cd4d30179e (upstream/main)
- Branch: merge/upstream-pi-0991-20260930
- Worktree: /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-pi-0991-20260930

## Dirty-file hashes (main checkout, must remain unchanged)
Verified identical to isolation-baseline.md on start:
- components/ChatMinimap.tsx f95c1d2b...
- e2e/chat-appearance.mjs b0552543...
- e2e/extension-dialog.mjs bff3739c...
- e2e/run.mjs cc46fc18...

## Timeline
- [x] Revalidated L/U, missing commits (3: fd037e4, 6a1246e, 433d09e), dirty hashes.
- [x] Clean npm ci at L + baseline gates (tsc 0, lint 0/0 558 files, test 1736 pass).
- [x] Merge U --no-ff --no-commit; resolved all 6 conflicts by hand; reviewed auto-merges; merge gates tsc 0, lint 0, test 1752 pass.
- [x] Staged pure merge product (index); all Pi upgrade/repair edits left unstaged (`lib/rpc-manager.{ts,test.mjs}` are MM).
- [x] Upgraded 4 Pi pins to 0.99.1; regenerated lockfile; clean npm ci; npm ls all 0.99.1.
- [x] SDK fallout fixed (preflight disposition, steer/followUp return, catalog URL types, session-file-on-first-message, portable peer pins). Added focused regression.
- [x] Final gates: tsc 0, lint 0/0 (564 files), test 1753 pass; e2e pass (2nd run; 1st was cold-compile timeout).
- [x] Real-SDK runtime smoke (session/tools/commands/settings/chat-only exact prompt).
- [x] Parent commits: merge `59f3d71`, upgrade `d04c860`, local input guard `06abb9a`, spec `96fce15`, artifacts `64c623e`.

## Status: implementation complete, merge ACTIVE, no commit/push/PR/archive performed.
## Details: research/conflict-decisions.md, research/verification-report.md, research/logs/.

The status above is the implementer's handoff checkpoint. The parent subsequently
committed the resolved merge and upgrade separately, verified upstream ancestry, and
accepted the independently checked candidate; final archive/journal follow on the same branch.

## Commit-separation constraint (from parent)
- Stage ONLY pure upstream merge product paths with explicit `git add` BEFORE any Pi 0.99.1 upgrade/API edits.
- Snapshot merge index, then keep all Pi upgrade/repair edits UNSTAGED (including already-staged files).
- Task artifacts stay untracked/unstaged.
- Record exactly which paths belong to the upgrade phase.
- Never `git add -A`/`.`. No commit by implement agent.
