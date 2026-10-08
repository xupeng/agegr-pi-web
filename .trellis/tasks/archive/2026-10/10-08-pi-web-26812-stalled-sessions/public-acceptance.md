# Unsaved session identity — public acceptance record

## Intent and authorized scope

Prevent cold restoration of a lazily persisted session from silently changing
its identity or working directory. Work is limited to application boundaries,
regressions and documentation; no deployment, service restart, SDK upgrade,
real-provider request or live-session/configuration mutation is authorized.

## Accepted behavior

- Alive runtimes retain their original manager, ID and cwd without requiring a file.
- A cached planned filename is not proof of persistence. Cold restore rejects
  missing, empty or nonregular files before SDK open, and rejects a manager whose
  header identity differs from the requested ID before loading resources.
- Saved header identity remains authoritative even when the filename differs;
  valid oversized legacy headers remain compatible.
- Explicit pre-readiness or HTTP negative acknowledgements preserve the unsent
  draft and choices. Only the current unpromoted new composer retires its binding;
  passive palette/control loads cannot recreate it before the next explicit send.
- Accepted or ambiguous input is never automatically resent. Explicit selected
  sessions are not redirected through filename aliases or workspace memory.
- Unsaved runtime deletion remains teardown, including shutdown-first-flush
  cleanup; stale header cache keys cannot expose or rename another session.

## Evidence and limits

The final source/test/documentation tree matched validation snapshot
`30183107a0485be72f8bc677b96139f0c42dfa7d`. A lock-consistent clean
`npm ci --include=dev` dependency tree was reused in an isolated verification
worktree. HOME, agent storage and temporary files were isolated; a read-only
filesystem sandbox hid ancestor resources without modifying the host.

- Baseline: 3166/3166 unit tests passed.
- Candidate: typecheck and lint passed; 3183/3183 unit tests passed, no skips.
- Independent read-only closure review found no confirmed blocker.
- Real-SDK create/open and production-callback tests are not React mounting or
  a complete historical browser reproduction. Existing browser suites are left
  to the PR's asynchronous fast/slow CI; dedicated platform coverage is not claimed.
- An unrelated provider/compaction failure was not repaired or configured around.

Temporary verification workspaces were removed. Original diagnostics, runtime
identifiers/paths, raw logs and historical journals remain local and are excluded
from this public archive. Only this bounded acceptance record, task metadata,
the executable contract and the current session's sanitized journal entry are
approved for publication with the feature branch.
