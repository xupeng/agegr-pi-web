# Publish @xup3ng/pi-web 0.11.0 after syncing upstream

## Goal

Publish a new npm version of the fork's package, **0.11.0**, on top of an updated
`personal`: first merge `upstream/main` (37 commits behind) and only then run the
release. The user picked every branch of this decision up front, so the plan below is
already narrowed; this parent owns the request, the split, the cross-child order and the
final integration check.

## Task map

| Child | Scope | Depends on | Ships via |
|-------|-------|-----------|-----------|
| `09-27-sync-upstream-pre-0110` | Merge `upstream/main@96966e5` into `personal`; resolve 23 content conflicts + 2 modify/delete; adopt the upstream fixes; full verification | — | `merge/upstream-pre-0110-<ts>` branch → PR to `personal` |
| `09-27-npm-release-0110` | Freeze the release commit, run `scripts/release-npm.sh 0.11.0`, user-2FA publish gate, registry verification, package audit, tgz archive, bump commit, restore the dev server | the merge above must be **merged** first | bump commit `chore: bump version to 0.11.0` pushed straight to `personal` (no PR, as 0.10.0 did) |

## Decisions already taken (do not re-litigate)

1. **Version 0.11.0 (minor).** 88 commits since `chore: release 0.10.0` (`8f537d0`),
   including 9 `feat` (shared React `ask_user` view + MCP Apps retirement, append-system
   prompt editor, self-hosted Oxanium/LXGW webfonts) and 5 `fix`. Precedent: 0.9.5 →
   0.10.0 was a minor bump for 22 commits with no `feat`.
2. **Sync upstream first.** `upstream/main` moved to `96966e5` (+37 commits, 10 feat /
   19 fix / 2 perf) while `personal` is 225 ahead. The batch contains security-relevant
   fixes (`PI_WEB_PASSWORD` no longer reaching agent bash/terminal shells, Basic Auth
   throttling, same-origin check for login redirects, `models.json` read/save guard,
   event delivery when a listener unsubscribes mid-emit), so the release ships them.
3. **Release flow: `scripts/release-npm.sh`** (the in-repo script), not the 0.10.0
   isolated-root procedure. See `09-27-npm-release-0110/design.md` for the consequences
   (the main checkout's dev server must be stopped, `.next` is rebuilt in place) and for
   the audits that are added around the script's own steps.
4. **Channel**: npm public, `latest` tag, published by the user in their own terminal
   (`~/.npmrc` + browser 2FA). `npm whoami` currently answers **E401**, so a
   `npm login` is a prerequisite of the publish gate, not of the build.

## Cross-child constraints

- Release point `H` is the `personal` tip **after** the upstream merge PR is merged;
  the bump commit is the only thing that moves `personal` afterwards (0.10.0 order:
  publish → verify → bump).
- This checkout has an active dev server (PID 1604984, `0.0.0.0:8505`,
  `.next/dev/lock` present, `.next` = 660 MB). `next build` must not run while it is
  alive; the release child stops it and restores it, and `npm run dev` in general must
  keep working afterwards.
- Pushing is always `git push origin <branch>` (this machine has
  `push.default=matching`).
- No product changes inside the release child: if the release surfaces a code defect,
  it becomes a new task, not a silent fix during publishing.

## Acceptance (whole request)

- [x] AC1 `upstream/main` is merged into `personal` through a reviewed PR, with the
      conflict decisions recorded, and the full suite green (typecheck, lint, unit,
      e2e). 已核实：PR #17（`c477bec`）；tsc / lint / unit 绿（1720 通过 0 失败），
      e2e 在隔离 worktree 5/7 绿，两条红色见 `09-27-sync-upstream-pre-0110` 的报告。
- [x] AC2 `@xup3ng/pi-web@0.11.0` is on the registry with `latest` pointing at it, and
      the published artifact is verified (integrity / shasum / fileCount / remote tgz
      byte-compare against the archived tgz). 已核实：复核时重新下载远程 tgz，与归档包
      sha256 相同；registry metadata 见 `research/integration-review.md`。
- [x] AC3 The package audit passed: embedded version 0.11.0, expected entry list,
      webfont licenses present, and no `.git`/`.trellis`/`.next/dev`/`*.js.map`/`.env`
      entries. 已核实：`09-27-npm-release-0110/research/artifacts/pre-publish-audit.md`。
- [x] AC4 `personal` carries `chore: bump version to 0.11.0` and is pushed; `HEAD ==
      origin/personal`. 已核实：`8891b62` 经 PR #19 合入，`HEAD == origin/personal ==
      91cd660`。
- [x] AC5 The main checkout is healthy again: dev server listening on 8505, the app
      serves a page, `git status` clean. 已核实：PID 2228435 在 8505 监听并返回 200。
- [x] AC6 Each child has its own evidence report, and this parent records the final
      integrated state (identifiers, tgz sha256, publish log lines, verification table).
      已核实：见 `research/integration-review.md`；其中 **publish 原始日志行无法提供**，
      改用 registry metadata 作为独立来源，已作为偏差记录。

## 验收结论（2026-09-28）

两个子任务的交付物都已合并并核验：上游同步经 PR #17 合入，0.11.0 已在公开发布并经
字节比对确认，bump 提交与归档产物经 PR #19 进入 `personal`，开发服务与工作区状态正常。
`research/integration-review.md` 记录最终集成状态与四项偏差——其中最重要的是 **npm 上的
0.11.0 早于 PR #18，因此不含对话区对齐修复**，该修复随下一个版本发布。

## Out of scope

- Upstream release channels (GitHub Releases, `personal-*` tags, `release-personal.sh`)
  and any change to `@agegr/pi-web` itself.
- Publishing a patch line (0.10.1) or a major bump.
- Rewriting `scripts/release-npm.sh` into a fully non-interactive pipeline (a possible
  follow-up, not needed to ship 0.11.0).
