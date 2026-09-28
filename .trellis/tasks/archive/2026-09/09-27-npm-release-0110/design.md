# Design — 0.11.0 release

## 1. What the in-repo script actually does (verified 2026-09-27)

`scripts/release-npm.sh` (read in full before planning):

| Step | Command | Notes |
|------|---------|-------|
| preflight | `git status --porcelain` must be empty; `npm whoami` must be `xup3ng` | both abort with a clear message |
| bump | `npm version 0.11.0 --no-git-tag-version` | writes `package.json` + `package-lock.json`, no git tag |
| build | `TURBOPACK= npm run build` | production build in this checkout |
| dry-run | `npm publish --dry-run` plus a needle grep for `LICENSE`, `README.md`, `bin/pi-web.js`, `next.config.ts` | aborts when a needle is missing |
| gate | `read -r -p "按回车继续，Ctrl+C 取消..."` | the only pause; Ctrl+C aborts |
| publish | `npm publish --access public` | browser 2FA; the script prints the auth flow |
| verify | polls `npm view @xup3ng/pi-web version` up to 18 x 10 s | exits 1 when it never matches |
| commit | `git add package.json package-lock.json && git commit -m "chore: bump version to 0.11.0"` | **does not push** |

Two consequences follow directly:

* The publish step cannot be automated (2FA), so **the user runs the script in their
  terminal**. This task orchestrates around it.
* The prompt is a natural, already-existing gate: the tree is built and bumped at that
  moment, which is exactly when the extra audit and the smoke test belong.

## 2. Execution shape

```
this task (background shells)                     user (own terminal)
------------------------------                    ----------------------------
preflight: tree clean, npm login, disk, dev server
freeze H, back up .next, stop dev server  ------> 
                                                  bash scripts/release-npm.sh 0.11.0
                                                   ... build ... dry-run ... prompt (paused)
audit at the prompt: npm pack + listing checks <--
smoke: install tgz into temp prefix, probe HTTP
report audit table  -----------------------------> Enter  -> npm publish (2FA)
                                                   ... verify poll ... bump commit
npm view verification, remote tgz compare <------
git push origin personal
restore dev server, cleanup, write report
```

## 3. Preflight (before the user starts the script)

1. `git status --porcelain` empty and `HEAD == origin/personal`.
2. `npm whoami` - currently **E401**; if it is not `xup3ng`, stop and ask the user to run
   `npm login` (their terminal, browser 2FA). The build does not need it.
3. `node -v` (v26.10.0), `npm -v` (11.19.1), free space on `/home` (408 GB) - for the
   build plus the tarball.
4. Confirm the dev server identity: listener PID on `8505` (`lsof -nP -iTCP:8505
   -sTCP:LISTEN`) and the exact command line from `/proc/<pid>/cmdline`, so it can be
   restored verbatim.
5. Re-read `scripts/release-npm.sh` (it may have changed since this design was written).

## 4. Dev server handling

```bash
kill -TERM <pid>                          # graceful; confirm the port is released
rm -f .next/dev/lock                      # only if a stale lock survives the process
mv .next "$(mktemp -d)/next-pre-0.11.0"   # same filesystem rename, keeps the 660 MB
```

A production build writes a production `.next`; after the release the backup is deleted
and `next dev` rebuilds its own development graph (the documented recovery in
`AGENTS.md`).

## 5. Package audit and the publish-artifact question

Audit (at the prompt, writing nothing into the checkout):

```bash
TMP="$(mktemp -d)"
npm pack --pack-destination "$TMP"                 # audited artifact, archived with sha256
tar -tzf "$TMP"/xup3ng-pi-web-0.11.0.tgz > "$TMP/list.txt"
```

Checks: entry sanity; version 0.11.0 in `package/package.json`; the version embedded in
the build matches 0.11.0; webfont files and their license files present; and absence of
`.git/`, `.trellis/`, `.next/dev`, `*.js.map`, `.env`, `e2e/`, `test-results/`.

**Decision (user, 2026-09-27): keep the script's own publish.** The script is the
registry-publishing tool (its `npm publish --access public` is what ships to
registry.npmjs.org), so it runs as written. Consequence: the published tarball is not
guaranteed byte-identical to the archived `npm pack` output (gzip metadata can differ),
and the verification therefore compares **content** — file list plus per-file sha256 of
the remote tarball against the archived one — in addition to npm's
`integrity`/`shasum`/`fileCount`.

## 6. Smoke test from the tarball

```bash
PREFIX="$(mktemp -d)"; AGENT_DIR="$(mktemp -d)"
npm install -g --prefix "$PREFIX" "$TMP"/xup3ng-pi-web-0.11.0.tgz
"$PREFIX"/bin/pi-web --help            # the binary starts
# then start it on a free port with PI_CODING_AGENT_DIR="$AGENT_DIR" and probe:
#   GET /                        -> 200, the app shell
#   GET /fonts/... (self-hosted) -> 200, the Oxanium/LXGW asset added in 6d0d8a3
```

The exact font URL is confirmed during implementation from `app/globals.css` or
`public/fonts`. Everything lives in temporary directories; the dev checkout is untouched.

## 7. Failure and recovery paths

| Failure point | State left behind | Recovery |
|---------------|-------------------|----------|
| preflight fails (`npm whoami`) | nothing changed | user runs `npm login`, rerun |
| build fails | `.next` replaced by a partial production build; `package.json` bumped | `git checkout -- package.json package-lock.json`, restore the `.next` backup, restart dev, investigate as a new task |
| audit/smoke fails at the prompt | same as above | user aborts with Ctrl+C; same recovery; the failure becomes a new task |
| publish fails after Enter | bumped tree, nothing on the registry | rerun the script with `0.11.0` once logged in; the audit is repeated |
| verification poll fails | the package may still be propagating | wait and re-check `npm view @xup3ng/pi-web@0.11.0`; never publish a different version to "fix" it |

## 8. Evidence set

`research/release-report.md` (main report, mirroring the 0.10.0 runbook) plus
`research/artifacts/` for the tarball listing, the sha256 files and the npm debug log
snippet. The tarball itself is archived outside the repository (it must not be committed).
