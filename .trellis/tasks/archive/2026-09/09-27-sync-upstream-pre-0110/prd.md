# Merge upstream/main into personal

## Goal

`personal` is far ahead of the upstream merge base and 37 commits behind
`upstream/main@96966e5`. Bring the upstream work in **before** the 0.11.0 release so the
published package carries it, without losing any fork-specific behaviour.

## Requirements

- **R1 — Real merge, reviewed.** Merge on a `merge/upstream-pre-0110-<YYYYMMDD-HHMMSS>`
  branch (precedent: `merge/upstream-v091-20260912-200432`) and ship it through a PR to
  `personal`. Merge commit, not rebase: the fork's history stays intact.
- **R2 — Every conflict decided and recorded.** `git merge-tree` already reports 23
  content conflicts and 2 modify/delete conflicts; each resolution gets one line in
  `research/conflict-decisions.md` saying what won and why.
- **R3 — Fork behaviour survives.** The fork's own features must still work after the
  merge: shared React `ask_user` view, append-system prompt editor (plus its pi loader
  contract test), session-list incremental cache, `?session=` restore precedence and
  workspace memory, built-in subagent toggle, tool presets, worktree grouping.
- **R4 — Upstream's security fixes are adopted, not skipped.** At minimum:
  `PI_WEB_PASSWORD` must not reach agent bash/terminal shells; Basic Auth attempts
  throttled; login redirects rejected when they resolve to another origin; `models.json`
  read/save guarded like pi; agent events delivered to every remaining listener when one
  unsubscribes mid-emit.
- **R5 — Dependency question answered explicitly.** Upstream bumps `pi` to 0.87.1
  (we pin 0.85.1 and assert its loader behaviour in `lib/append-system.test.mjs`), bumps
  Next/semver/undici, and trims the production install. Decide adopt-vs-keep for each
  with the user at the review gate, then either fix the fallout or record why the pin
  stays.
- **R6 — Verification is the acceptance.** `tsc --noEmit`, `npm run lint`, the unit suite
  (baseline 1522 — reconcile any delta against upstream's added/removed tests) and the
  full e2e suite in an isolated worktree must be green, plus targeted checks for R4.
- **R7 — No drive-by changes.** The merge branch contains the merge and the repairs it
  forces, nothing else.

## Acceptance Criteria

- [ ] AC1 `git log --merges -1` on the branch shows the upstream merge; the PR body lists
      the conflict count and links `research/conflict-decisions.md`.
- [ ] AC2 The 2 modify/delete conflicts are resolved deliberately:
      `lib/session-list-scanner.*` stays deleted on `personal`, and any upstream fix
      inside it is ported to the module that replaced it (or explicitly documented as not
      applicable).
- [ ] AC3 `tsc`, `lint`, unit and e2e are green; the unit count is reconciled and the e2e
      run covers both viewports.
- [ ] AC4 The R4 fixes are present in the merged tree and spot-checked (file/line
      references recorded).
- [ ] AC5 The dependency decision is recorded with its rationale and, when adopted, the
      SDK-dependent tests pass against the new version.
- [ ] AC6 `AGENTS.md` (auto-merged) still describes the fork's real architecture — the
      conflicting sections are re-read, not trusted to the merge.

## Decision — take upstream's dependency bumps (user, 2026-09-27)

**Adopt.** `package.json` / `package-lock.json` are merged from upstream (pi 0.87.1,
the trimmed production install, the next/semver/undici bumps) and whatever the SDK bump
breaks is repaired here. A green suite is still the acceptance bar; if the repair cannot
be finished and verified inside one bounded session, escalate per design §5 instead of
landing a half-verified merge (the fallback is the pin-keeping variant plus a follow-up
child for the SDK upgrade).
