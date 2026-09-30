# Closeout

## Accepted candidate

Independent check passed after one local P2 input-validation repair. All five PRD acceptance
criteria are met with explicit limitations preserved in the verification reports.

| Commit | Purpose |
| --- | --- |
| `59f3d71` | Upstream merge, parents L `576e74f` and U `433d09e` |
| `d04c860` | Pi 0.99.1 exact pins/lockfile and necessary SDK compatibility adaptations |
| `06abb9a` | Non-object defaults request rejection and two red/green regressions |

Final target dependency pins, lock entries and installed package manifests agree at 0.99.1
for all four direct Pi packages. Package identity remains `@xup3ng/pi-web@0.12.0`.

## Validation

- TypeScript exit 0; lint 565 files / zero errors or warnings.
- Full unit suite 1755 pass / 0 fail; focused tests 84 pass / 0 fail.
- Complete desktop/mobile/subagent e2e passed on the second warm run; first cold timeout disclosed.
- Real SDK offline lifecycle probe: 6 simulated provider calls, zero network requests.
- `git merge-base --is-ancestor U HEAD` exit 0; no unresolved merge paths.
- Original `personal` remains L, and all four original dirty-file hashes match isolation-baseline.md.

## Delivery

Branch: `merge/upstream-pi-0991-20260930` (local only).
Worktree: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-pi-0991-20260930`.
Preview: `http://127.0.0.1:30142/`, isolated Pi data directory and offline catalog, HTTP 200.
No push, PR, publish, version bump or local personal integration occurred.

The final archive and journal belong to this feature branch and must travel with any later
PR to `personal`, never as follow-up commits on the base branch.

## Residual risks

No live provider/paid completion, Windows runtime or minimum Node 22.19 run; no dedicated
browser exercise of new default-save stars or list continuation native undo/mobile-beforeinput.
Two transitive audit advisories (one moderate, one high) match the pre-upgrade baseline.
New opt-in SDK capabilities were not comprehensively exercised. These limitations are not
reported as passes and do not block the scoped merge/SDK deliverable.
