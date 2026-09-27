# Publish @xup3ng/pi-web 0.11.0

## Goal

Publish **0.11.0** of the fork's package to npmjs, using the repository's own release
flow (`scripts/release-npm.sh`), from the `personal` tip that already contains the
upstream sync. Deliver a verified registry artifact plus a recorded bump commit, and
leave the developer checkout usable.

## Requirements

- **R1 — Frozen release point.** Record `H` = `personal` tip after the upstream merge PR
  is merged (`git rev-parse HEAD` plus the tree hash). The only commit allowed to move
  `personal` afterwards is the version bump this flow creates.
- **R2 — The in-repo flow, executed by the user.** `scripts/release-npm.sh 0.11.0` is run
  by the user in their own terminal: its publish step needs browser 2FA, which cannot be
  automated. This task owns the preflight, the package audit taken at the script's
  confirmation prompt, the post-publish verification, the push and the cleanup.
- **R3 — The dev server is protected.** This checkout runs a dev server (PID 1604984 on
  `0.0.0.0:8505`, `.next/dev/lock` present). It must be stopped gracefully before the
  script's `next build` and restored afterwards, so that `npm run dev` and the app stay
  healthy.
- **R4 — Package audit before the irreversible step.** At the script's prompt the built
  package is audited: the version embedded in the build is 0.11.0; `package.json` version
  is 0.11.0; the entry list is sane (LICENSE, README, `bin/pi-web.js`, `next.config.ts`,
  `.next/**`, self-hosted webfonts and their licenses); and no `.git`, `.trellis`,
  `.next/dev`, `*.js.map`, `.env*`, or `test-results` entries are shipped.
- **R5 — The audited artifact is archived.** `npm pack --pack-destination <tmp>` produces
  the tarball before publishing; its sha256, size and file count are recorded, and the
  tarball is kept under the task's evidence area (outside the repository checkout).
- **R6 — Smoke test the installed package, not just the build.** Install the packed
  tarball globally into a temporary prefix and start it against a temporary
  `PI_CODING_AGENT_DIR`; the app must serve its page (and a self-hosted font asset) with a
  successful HTTP status before the user publishes.
- **R7 — Explicit publish gate.** Nothing is published before the user says so. After the
  audit result is reported, the user completes the browser-2FA publish; the npm debug log
  lines (`shasum`, `integrity`, `fileCount`) are captured as evidence.
- **R8 — Post-publish verification against the registry.** `npm view` confirms version
  `0.11.0`, `dist-tags.latest === 0.11.0`, `dist.integrity`, `dist.shasum`,
  `dist.fileCount` and the tarball URL; the remote tarball is re-downloaded and compared
  with the archived one.
- **R9 — Bump commit pushed.** The script commits `chore: bump version to 0.11.0`; this
  task pushes it with `git push origin personal` and records `HEAD == origin/personal`.
- **R10 — Cleanup.** The dev server is restarted with its original command line and the
  production `.next` is moved aside so development rebuilds its own graph; the checkout is
  left clean.
- **R11 — Release report.** `research/release-report.md` records every step with its exact
  command and observed output, the audit table, the publish log lines, the verification
  table, deviations and the AC result.

## Acceptance Criteria

- [ ] AC1 `npm view @xup3ng/pi-web version` → `0.11.0`; `dist-tags.latest` → `0.11.0`.
- [ ] AC2 `dist.integrity`, `dist.shasum` and `dist.fileCount` are recorded and the remote
      tarball matches the archived one (content comparison; see design §5).
- [ ] AC3 The audit table shows version 0.11.0 and no forbidden entries; the webfont
      license files are present.
- [ ] AC4 The smoke test from the packed tarball reported a successful page and font
      request; the temporary prefix was removed afterwards.
- [ ] AC5 The publish log lines are quoted in the report, including the exact published
      `@xup3ng/pi-web@0.11.0` file count.
- [ ] AC6 `personal` has the `chore: bump version to 0.11.0` commit, pushed, with
      `HEAD == origin/personal`.
- [ ] AC7 The dev server listens on 8505 again and serves the app; `git status
      --porcelain` is empty.
- [ ] AC8 `research/release-report.md` exists and every deviation (notably that the user
      ran the script while this task audited at its prompt) is explained.

## Out of scope

- Any code or dependency change (a defect found here becomes a new task).
- Publishing from the archived tarball instead of the script's own `npm publish`
  (accepted on purpose; the consequence is recorded in design §5).
- Rewriting `scripts/release-npm.sh`, tagging upstream-style releases, or updating the
  README badges/changelog.
