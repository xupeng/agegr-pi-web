# @xup3ng/pi-web 0.11.0 release verification

## Frozen source and execution

- Source `H`: `92e4cec9b7d04b08bece47eea1d5c8e3769f732b`, tree
  `cbbc4dee3435a7599ddf06e0c1303e78840e00f8`, after the upstream sync.
- The user ran `bash scripts/release-npm.sh 0.11.0` with browser 2FA. At its confirmation
  prompt, the package was audited with `npm pack --pack-destination <tmp>` and smoke-tested
  from the archived tarball. See `research/artifacts/pre-publish-audit.md` for the entry,
  version, font-license, forbidden-pattern and installed-package checks.
- The registry records publication at `2026-09-27T12:06:53.849Z` (`npm view
  @xup3ng/pi-web time --json`). The original CLI publish debug lines were not retained
  in the available npm logs; the registry metadata below is observed independently,
  not presented as a quotation from that log. A later `npm whoami` returned E401, so
  this closeout did not attempt another publish.

## Registry and artifact

| Check | Command | Observed |
|-------|---------|----------|
| Version | `npm view @xup3ng/pi-web version` | `0.11.0` |
| Latest | `npm view @xup3ng/pi-web dist-tags.latest` | `0.11.0` |
| File count | `npm view @xup3ng/pi-web dist.fileCount` | `827` |
| SHA-1 | `npm view @xup3ng/pi-web dist.shasum`; `sha1sum <archive>` | both `db580f23b0a77b00c675dcf022d1d3157145f9ba` |
| Integrity | `npm view @xup3ng/pi-web dist.integrity`; `openssl dgst -sha512 -binary <archive> \| openssl base64 -A` | both `sha512-51taftQ8TVbPhD3a2UA76GJuMz4JE3QVaBGyysuCUwciP5eqVJNcTJHGVA+VXViCfYKau5e6Rud926hYUgWcJA==` |
| Remote bytes | `curl -fLsS https://registry.npmjs.org/@xup3ng/pi-web/-/pi-web-0.11.0.tgz \| sha256sum`; `sha256sum <archive>` | both `1c6112e18aafd5d4823a7cca79a9f06bc9a59d80069b1886a06e527c048aa1d4` |
| Entries | `tar -tzf <archive> \| wc -l` | `827` |

The archived tarball remains at
`/home/xupeng/pi-web-release-artifacts-0.11.0/pack/xup3ng-pi-web-0.11.0.tgz`.
Exact tarball-byte equality implies equal per-file content, not just a matching list.

## Closeout deviations

- The script published successfully but did not leave its final version-bump commit.
  This branch starts at the frozen `H` and records only that original two-file bump.
  Meanwhile PR #18 advanced `personal` to `134de42`; directly committing the bump
  there would misrepresent the published source. The version commit, report, task
  archive and session journal therefore travel in this task's PR targeting `personal`.
  `personal` receives the bump when that PR merges, not by a direct release push.
- The shared `personal` checkout still contains the already-published version edits
  and the original audit file as uncommitted changes. They were not discarded or
  overwritten. The separate release worktree is clean after committing; the original
  checkout's clean-tree acceptance criterion is not met until those duplicates are
  reconciled with the merged task PR.
- The 8505 development server was restored and answered HTTP 200 during closeout.
  No build or restart was performed after publication.

## Acceptance status

- AC1-AC4: verified by registry metadata, byte-identical tarball, audit and smoke.
- AC5: published version and file count verified from registry; original publish log
  lines unavailable (deviation, not a pass).
- AC6: version bump on task branch; `personal` receives it after PR merge (pending).
- AC7: dev server healthy; shared checkout clean-tree clause pending after PR merge.
- AC8: this report records the user-run publish and each deviation.
