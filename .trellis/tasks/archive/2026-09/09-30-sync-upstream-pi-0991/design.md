# Design: isolated upstream sync and Pi upgrade

## Boundary

The behaviour gap is three missing upstream commits plus four Pi packages pinned to `0.87.1` instead of `0.99.1`. Integrate upstream in the modules that own the behaviour, then adapt the existing SDK integration; do not introduce a parallel runtime or rewrite unrelated UI.

Frozen inputs:
- L: `576e74f80b6fb271402369fde4bc0c5eee7cf509` (`personal`).
- U: `433d09ea2f2cc77b0ff356e8c57575cd4d30179e` (fetched `upstream/main`).
- Branch: `merge/upstream-pi-0991-20260930`, based on L, PR base metadata `personal`.
- Workspace: a new unique sibling worktree on ordinary disk, not `/tmp`; never reuse an occupied directory or branch.

One task owns the merge and the SDK upgrade because the final integrated compatibility result is the deliverable. Separate merge and upgrade commits make diagnosis easier.

## Upstream integration

Merge U with `--no-ff`; preserve history. Inspect base/ours/theirs for each conflict without whole-file ours/theirs selection. Resolve libraries before consumers and keep both sides' noncontradictory tests. Record intentional expectation changes.

Expected ownership:
- Composer list continuation: `lib/markdown-list-continuation*`, `components/ChatInput*`.
- Explicit defaults: `lib/default-preferences*`, models routes/cache, `lib/rpc-manager*`, `hooks/useAgentSession.ts`, selector components and `ChatWindow`. Accept the intentional removal of automatic startup persistence rather than retaining two writers.
- Dated cwd: default-cwd route/library, `lib/file-access.ts`, sidebar identity handling. Keep the shared path-security boundary and verify created paths, previously authorized session roots, and local-date semantics.
- Additional upstream files: translations and `AGENTS.md`; verify automatic merges against actual fork behaviour.

Six predicted conflicts are listed in PRD. Textually clean shared edits (especially `hooks/useAgentSession.ts` and RPC tests) also need semantic review.

## SDK integration

Update only the four direct Pi pins in `package.json`; use npm to regenerate `package-lock.json`, then validate a clean `npm ci` tree. Preserve the fork name, repository metadata and application version `0.12.0`.

Potential affected owners are `lib/pi-types.ts`, `lib/agent-event-wire.ts`, session services/runtime, RPC manager, session reader, model/auth adapters, inline prompt extensions, tools and subagent runtime. Extend existing adapters, not consumer-side casts, if `0.99.1` changes types or events. Read the installed target SDK changelog/API docs and relevant implementations before compatibility fixes.

Runtime chain to verify: SDK services/session construction -> wrapper/command adaptation -> SSE event projection -> hook state -> UI. Resource loading, exact-system-prompt and append-system contracts, model scope/catalogs, authentication and subagents require checks beyond type compilation.

The exact API fallout remains an execution-time technical investigation after installing the target SDK. It does not alter the target version or authorize unrelated rewrites; escalate if substantial product changes become necessary.

## Isolation, verification and recovery

Record hashes of the four pre-existing dirty files before/after work, and leave the original index/dependency tree/dev server alone. Copy task artifacts into the isolated workspace without committing unrelated source edits. Keep all task-owned commits and later archive/journal artifacts on the feature branch; do not archive before final acceptance.

Obtain baseline checks from frozen L with its lockfile in the isolated workspace. After merge/upgrade run TypeScript, lint and unit tests on a clean target dependency tree, plus e2e with temporary agent settings/session data and its own isolated server. Do not send model requests or change actual credentials/settings merely to test imports. Do not build in the development checkout.

Baseline failures are recorded separately from new failures. Browser/environment blockers are not passes. Keep the branch for diagnosis if upgrade verification fails; never silently downgrade the requested SDK or update `personal`. No destructive reset/checkout of user files and no push are part of recovery.
