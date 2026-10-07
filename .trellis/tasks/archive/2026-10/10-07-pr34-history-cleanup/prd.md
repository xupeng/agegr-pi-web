# Rebuild clean PR 34 history

## Goal

Remove the raw PR 34 verification artifacts from the normal `personal` branch history without changing the shipped application or losing recovery evidence. Keep future task delivery reviewable.

## Confirmed background

- GitHub reports PR 34 added 132,846 lines across 369 files; the local merge diff attributes 122,959 added lines to raw task evidence.
- Published and deployed tip: `c3f8aa3deb11a572e815378a1781f4397e638183`; confirmed pre-PR base: `3f58d31b44865974f1c6cdaa9735596d0ed0bb13`.
- GitHub retains read-only `refs/pull/34/head` at `e19af9cf5e05df0362678e76aab8a9030394572f`. Rewriting a branch does not purge that reference or all GitHub storage.
- Production 26812 runs `pi-web.service`; development 8505 runs in the independent `pi-web-dev-8505-20261006.scope` with listener PID 1118396.
- User approved the latest final implementation plan and concrete eight-group commit batch. Publication remains bounded to the specified refs and exact lease.

## Requirements

- R1: Preserve an independently verifiable, private offline Git backup and original evidence outside the repository before rewriting any published ref.
- R2: Rebuild from the confirmed pre-PR base, retaining the final product sources, tests, fixtures, user assets, package metadata and lockfile byte-for-byte.
- R3: Omit only this PR's raw verification logs, generated JSON/JSONL reports, screenshots and trace archives. Retain concise planning, design, acceptance, specs and truthful session records; repair evidence references.
- R4: Add a small task-artifact policy/ignore boundary to prevent recurrence. No runtime behavior changes or newly fabricated acceptance evidence.
- R5: Rewrite only `origin/personal`, using an exact lease against the confirmed old tip. A new task-owned feature branch may be normally pushed for its small review PR after final approval. Preserve every other existing remote branch/tag; stop on concurrent advancement or prohibiting protections.
- R6: The reconstructed feature/history includes the original task's archive and journal. Publish the new cleanup policy, task archive and journal together through its feature PR based on the clean replacement; never merge contaminated history back into the clean branch.
- R7: Synchronize only clean, verified local state and rebuild/deploy the clean SHA to 26812. Preserve 8505's processes, settings, credentials and unrelated worktrees.
- R8: Report both ordinary branch-history cleanup and the remaining GitHub PR/cache limitations honestly. Do not claim permanent erasure of every old object.

## Acceptance criteria

- [ ] AC1: Offline backup verifies and contains the original published tip and complete recovery evidence.
- [ ] AC2: Reconstructed runtime/test/fixture/config/user-asset blobs equal the original deployed tree; the lock SHA is unchanged.
- [ ] AC3: Excluded raw artifact paths and the 224 identified task-specific blobs are absent from history reachable on the replacement branch, not merely deleted in its final tree. Three blobs already shared with the pre-PR base are not falsely claimed purged.
- [ ] AC4: Task/spec/journal summaries remain consistent; raw outputs are retained outside Git and no raw artifacts enter the cleanup commits.
- [ ] AC5: Typecheck, lint and the full lock-consistent isolated suite pass; applicable browser/CI evidence is explicitly recorded without overstating coverage.
- [ ] AC6: Exact-lease push succeeds only for `personal`; all other recorded remote branches and tags remain unchanged.
- [ ] AC7: Production serves the new clean SHA and passes read-only smoke checks; 8505 retains its original PID/start identity and remains healthy.
- [ ] AC8: Owned temporary units/worktrees/build homes are cleaned; private backups, evidence and rollback retention paths are documented.

## Out of scope

Changing application behavior, dependencies, real model/search calls, credentials, deployment of other ports, rewriting `main`/other branches/tags, deleting or recreating the repository, altering GitHub read-only PR refs, and promising physical erasure from GitHub caches, forks or other clones.
