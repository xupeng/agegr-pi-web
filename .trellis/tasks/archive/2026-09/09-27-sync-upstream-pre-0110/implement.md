# Implement — upstream merge

- [ ] 1. Freeze the inputs: record `personal` HEAD, `upstream/main` HEAD, the merge base,
      the conflict list from `git merge-tree --write-tree --name-only personal upstream/main`,
      and the upstream commit list into `research/upstream-delta.md`.
- [ ] 2. Review gate: settle the dependency question (adopt vs keep pins) with the user.
- [ ] 3. Create the merge branch and merge:
      `git checkout -b merge/upstream-pre-0110-<ts> personal` then `git merge upstream/main`.
- [ ] 4. Resolve conflicts file by file per design §3, writing
      `research/conflict-decisions.md` as you go; handle `package.json` + lockfile
      regeneration early and the READMEs last.
- [ ] 5. Re-read the `AGENTS.md` sections listed in design §3.5 and correct anything the
      merge made stale.
- [ ] 6. Gates: `tsc --noEmit`, `npm run lint`, the unit suite, the e2e suite in an
      isolated worktree, then the R4 spot checks.
- [ ] 7. Open the PR to `personal` (body: conflict count, decision file link, gate
      results, dependency decision) and merge it once green.
- [ ] 8. Write `research/verification-baseline.md` (gates, numbers, deviations), tick
      this file, then archive the child.

## Commands

```bash
git merge-tree --write-tree --name-only personal upstream/main   # conflict inventory
git checkout -b merge/upstream-pre-0110-$(date +%Y%m%d-%H%M%S) personal
git merge upstream/main
node_modules/.bin/tsc --noEmit && npm run lint
env -u NODE_PATH XDG_STATE_HOME= npm test
# e2e must run outside this checkout: the dev server owns .next/dev/lock
```
