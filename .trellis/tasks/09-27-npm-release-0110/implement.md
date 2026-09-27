# Implement — 0.11.0 release

- [ ] 1. Confirm the upstream merge PR is merged and freeze the release point:
      `git fetch origin && git rev-parse HEAD origin/personal` (must be equal), record the
      commit and tree hash as `H`.
- [ ] 2. Preflight per design §3: clean tree, `npm whoami` (ask the user to run
      `npm login` when it is not `xup3ng`), node/npm versions, disk space, dev-server PID
      and exact command line.
- [ ] 3. Prepare the checkout: stop the dev server gracefully, remove a stale
      `.next/dev/lock` if it survives, move `.next` to a temporary backup, confirm port
      8505 is free.
- [ ] 4. Hand off to the user: `bash scripts/release-npm.sh 0.11.0` in their terminal;
      wait until it is paused at `按回车继续`.
- [ ] 5. Audit at the prompt per design §5: `npm pack --pack-destination "$TMP"`, entry
      list, `package.json` version, embedded build version, forbidden patterns, webfont
      licenses; record sha256, size and file count under `research/artifacts/`.
- [ ] 6. Smoke test per design §6: global install into a temp prefix, start with a temp
      `PI_CODING_AGENT_DIR`, probe the page and a font asset, then remove the prefix.
- [ ] 7. Report the audit and smoke results to the user and request the publish decision
      (the irreversible gate).
- [ ] 8. After the user publishes: capture the npm debug log lines (`shasum`, `integrity`,
      `fileCount`) and let the script finish its verification plus bump commit.
- [ ] 9. Post-publish verification: `npm view @xup3ng/pi-web version dist-tags.latest
      dist.integrity dist.shasum dist.fileCount dist.tarball`; re-download the remote
      tarball and compare its file list and per-file sha256 with the archived tarball.
- [ ] 10. Push: `git push origin personal`; confirm `HEAD == origin/personal`.
- [ ] 11. Restore the checkout: delete the `.next` backup, restart the dev server with its
      recorded command line, probe `http://127.0.0.1:8505/`, confirm `git status` clean.
- [ ] 12. Write `research/release-report.md`, tick this file, then archive the child.

## Commands (reference)

```bash
lsof -nP -iTCP:8505 -sTCP:LISTEN
tr '\0' ' ' < /proc/<pid>/cmdline            # exact restart command
kill -TERM <pid>
npm pack --pack-destination "$TMP"
sha256sum "$TMP"/xup3ng-pi-web-0.11.0.tgz
npm view @xup3ng/pi-web version dist-tags.latest dist.fileCount dist.integrity --json
git push origin personal
```

Publishing itself is **never** run from this task's shell: `npm publish` needs the user's
browser 2FA, and the script prints the authorisation URL anyway.
