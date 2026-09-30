# Implementation plan

## Approval gate

- [x] User consented to task creation and chose isolated feature-branch delivery.
- [x] PRD, design, implementation plan, and real context manifests prepared.
- [x] User explicitly approved the latest final planning summary on 2026-09-30.
- [x] Ran `task.py start` after approval; task is in progress.

## Execution

1. Revalidate L/U and dirty-file hashes; inspect sibling worktrees/branch names. If L changes, report the mismatch rather than silently changing the frozen input.
2. Create the unique isolated branch/worktree from L and make task artifacts available there. Dispatch `trellis-implement` with the exact active-task path and frozen inputs. Keep primary checkout/index/node_modules/.next untouched.
3. Run clean `npm ci` and baseline tsc/lint/unit tests against L, recording dependency tree, counts and failures.
4. Merge U with `--no-ff --no-commit`; resolve the six predicted conflicts in owner order, review auto-merges, and document each resolution. Stage only explicit task-owned paths. Verify ancestry and intended deletions. Commit the reviewed merge on the feature branch only.
5. Set four Pi direct pins to `0.99.1`; regenerate npm lockfile using npm, then clean `npm ci`. Inspect target SDK release/API documentation and exports. Repair only upgrade-required adaptations and add focused regressions. Do not weaken tests to mask a compatibility failure.
6. Re-run tsc/lint/unit checks. Verify real target SDK contracts, including system prompt/resource loading, session creation, model scope/auth, tool presets, subagents, event projection and context/usage handling.
7. Run `npm run test:e2e` using the isolated checkout and temporary agent data; include desktop/mobile and targeted composer/default/cwd regressions. Check server prerequisites and available browser executable. Record any blockers, never label unrun checks green.
8. Dispatch independent `trellis-check` in the isolated workspace with real check manifest, review conflict decisions/SDK fallout, and fix findings with fresh verification. Capture applicable spec updates without unrelated metadata churn.
9. Commit task-owned code/planning/verification only on the feature branch. Report branch/worktree, actual SDK versions, verification outcomes and remaining acceptance items. Do not push, create PR, advance `personal`, publish, or archive prematurely.

## Validation commands

Run in the isolated worktree with its lockfile-consistent installation:

```bash
npm ci
node_modules/.bin/tsc --noEmit
npm run lint
npm test
npm ls @earendil-works/pi-agent-core @earendil-works/pi-ai @earendil-works/pi-coding-agent @earendil-works/pi-tui
npm run test:e2e
git merge-base --is-ancestor 433d09ea2f2cc77b0ff356e8c57575cd4d30179e HEAD
git status --short
```

Preserve baseline and final counts/reports in `research/`. Never use a baseline from a stale/mixed dependency tree. E2E launch configuration must isolate settings/session files and avoid the original server's dev lock. If a server is started for acceptance, record its URL and shut down test-only processes after validation.

## Risk gates

- Upstream deletion of startup-preferences is intentional; replace automatic persistence coverage with explicit-save/session-local coverage.
- Scope of Pi migration is unknown until target SDK installation. Broad product/API changes require revised planning and user approval, not silent expansion.
- Primary checkout's four dirty files must have unchanged hashes at closeout. They are excluded from feature-branch verification and commits.
- Environmental browser failures or baseline failures must be disclosed. No partially verified integration into `personal` is allowed.

## Completion

- [x] Isolated clean baseline, reviewed merge, exact Pi 0.99.1 lockfile installation and SDK compatibility repairs.
- [x] Independent check and local default-request object guard with red/green regressions.
- [x] Final tsc, lint (565 files, zero diagnostics), unit suite (1755 pass), focused tests (84 pass), offline SDK lifecycle probe (zero network).
- [x] Full desktop/mobile/subagent e2e passed; cold first-run timeout and missing dedicated new-control browser coverage disclosed.
- [x] Work commits created separately; upstream ancestry verified; original dirty-file hashes preserved.
- [x] Isolated preview started at http://127.0.0.1:30142/ and returned HTTP 200; it uses its own Pi data directory and offline catalog mode.
- [x] Applicable SDK/default-settings/ask_user spec updates prepared.
- [ ] Task artifacts, final archive and journal committed on the feature branch before delivery; no PR or push authorized.
