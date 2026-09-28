# Implement — parent sequence

- [x] 1. Review gate: confirm this plan (split, version, sync-first, flow, and the
      dependency question in `09-27-sync-upstream-pre-0110/prd.md`) with the user, then
      `task.py start` each child when its turn comes.
- [x] 2. Child A `09-27-sync-upstream-pre-0110`: merge `upstream/main` on a
      `merge/upstream-pre-0110-<ts>` branch, resolve conflicts with recorded decisions,
      run the gates, open the PR to `personal`, merge it.
- [x] 3. Child B `09-27-npm-release-0110`: freeze `H`, stop the dev server, follow
      `scripts/release-npm.sh` step by step for 0.11.0, archive and audit the package,
      stop at the publish gate for the user's `npm publish`, verify the registry, push
      the bump commit, restart the dev server.
      （偏差：bump 提交与归档经 `release/npm-0110` 分支的 PR #19 合入，而不是直推
      `personal`；见 `research/integration-review.md` 偏差 2。）
- [x] 4. Integration review per `design.md`, then archive the children and this parent.
      （复核结果写在本任务 `research/integration-review.md`；子任务已先归档。）

## Gates

```bash
node_modules/.bin/tsc --noEmit
npm run lint
env -u NODE_PATH XDG_STATE_HOME= npm test          # child A only; the release child must not change code
npm view @xup3ng/pi-web version dist-tags --json   # child B, after publishing
```

Child A also runs the e2e suite in an isolated worktree (`E2E_SERVER_MODE=dev`), because
this checkout's dev server owns `.next/dev/lock`.
