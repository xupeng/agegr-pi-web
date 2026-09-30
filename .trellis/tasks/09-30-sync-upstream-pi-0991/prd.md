# Sync upstream and upgrade Pi to 0.99.1

## Goal

Bring the latest `agegr/pi-web` changes into this fork and upgrade its four directly pinned `@earendil-works/pi-*` packages to `0.99.1` without losing fork-specific behaviour or the user's uncommitted work.

## Confirmed facts

- Current fork branch `personal` is `576e74f`; fetched `upstream/main` is `433d09e` (the `for-sync` URL tracks under `refs/remotes/upstream/*`). Three upstream commits are missing from the fork: `fd037e4`, `6a1246e`, `433d09e`.
- `git merge-tree --write-tree --name-only HEAD upstream/main` predicts six content conflicts: `components/ChatInput.test.mjs`, `components/ChatInput.tsx`, `components/ChatWindow.tsx`, `components/SessionSidebar.tsx`, `lib/file-access.ts`, `lib/rpc-manager.ts`.
- Upstream has removed `lib/startup-preferences.ts` and its test. Its `package.json` still pins Pi `0.87.1`; the requested `0.99.1` is a separate fork upgrade. npm publishes version `0.99.1` for all four direct Pi packages.
- The current checkout has pre-existing edits to `components/ChatMinimap.tsx`, `e2e/chat-appearance.mjs`, `e2e/extension-dialog.mjs`, and `e2e/run.mjs`. They are not task-owned and must remain untouched.
- The fork has one tracked dependency lockfile, `package-lock.json`; never run `next build` in the development checkout.

## Requirements

- R1: Incorporate all three upstream commits as a real merge, reviewing and recording each conflict's semantic resolution; preserve local fork contracts and upstream fixes together where compatible.
- R2: Pin `@earendil-works/pi-agent-core`, `pi-ai`, `pi-coding-agent`, and `pi-tui` to `0.99.1`, regenerate the npm lockfile, and address SDK API/behaviour differences revealed by tests and runtime checks.
- R3: Preserve fork-specific behaviour in allowed-file-root security, chat composer, session sidebar, auth, tool presets, built-in subagents, SSE, and session restore. Adopt the upstream default-selection change deliberately: model/thinking picks remain session-scoped, and only explicit default saving changes global settings. Keep the four pre-existing edits unchanged.
- R4: Verify from a lockfile-consistent dependency tree: TypeScript, lint, unit tests, plus relevant browser/e2e checks, with explicit reporting of any environmental blockers and residual risks.
- R5: No npm publish, version bump of `@xup3ng/pi-web`, unrelated refactor, or implicit push of `personal`/`main`.
- R6: Deliver on an isolated local feature branch based on the frozen `personal` commit, using a sibling worktree. Do not update local `personal`, push, or open a PR in this task.

## Acceptance criteria

- [x] AC1: The resulting branch contains a merge commit with `upstream/main@433d09e` as an ancestor, and each of the six predicted conflicts has a documented resolution. New upstream behaviour has targeted regression coverage.
- [x] AC2: The four direct Pi dependencies and the npm lockfile resolve to `0.99.1`; runtime SDK imports and affected integration paths pass focused tests.
- [x] AC3: Existing fork contracts and security checks remain intact; any intentional behaviour adjustment is documented and tested.
- [x] AC4: `tsc --noEmit`, `npm run lint`, and `npm test` pass using the updated lockfile; relevant e2e coverage runs if the local browser/server environment permits, with results and limitations recorded.
- [x] AC5: Existing uncommitted edits remain intact; no publish or unintended remote push occurs.

## Decisions and exclusions

- User selected an isolated feature branch on 2026-09-30. The existing dirty checkout is neither the merge destination nor the dependency-install/test workspace.
- Incorporate upstream Markdown-list continuation and local-date folders under `~/pi-cwd`, along with the explicit-default-saving behaviour described in R3.
- Package publishing, PR creation, remote pushes, and upgrading unrelated dependencies independently of Pi's required transitive changes are out of scope.
