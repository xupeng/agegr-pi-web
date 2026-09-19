# Fresh snapshot validation and authorized pre-integration record

Date: 2026-09-13. This is a **pre-D / pre-ff** record, not a claim that personal has already been integrated.

## Authorization and evidence boundary

The user explicitly accepted the existing lint/original-E2E/environment limitations and authorized the M/D/I commits plus personal fast-forward and its HMR/recompilation impact. The current delegation reiterates that authorization; no additional approval is needed. Earlier documents saying integration was not authorized are historical and superseded by this authorization record.

The previous integration preflight correctly stopped because it could not bind historical passing tests to a recorded final code hash. This run does **not** relabel a newly created hash as historical evidence. It captures the current candidate before new tests, reruns validation on that snapshot, and checks the same content/modes after every command.

External evidence root (E):
`/home/xupeng/dev/personal/forked/.pi-web-v091-iso-20260912-200432/revalidation-20260913-current/`

- Fresh canonical manifest SHA-256: `668dc9975e172604871cb093d3f2405af5194dec3c4b140f457bf5a7735e85e1`.
- Validated Git tree: `0a4cd3e69201f32950b8b5d68443fe363d349e99`.
- `before-manifest.json`: sorted path / Git mode / SHA-256 of actual file contents (symlink targets if present), covering all tracked files including staged additions. No candidate nonignored untracked files existed. Ignored inventory was restricted to private dependencies, `.next`, test artifacts, `next-env.d.ts`, and `tsconfig.tsbuildinfo`; no untracked business file was omitted.
- `before-*`, `after-*-*`, `pre-stage-*`: worktree/index/ref inventories and binary diffs. Original real index backed up as `original-index`; temporary `merged-index` stages only the reviewed 15-path allowlist. `tree-correspondence.txt` proves every tree blob SHA-256 and mode equals the tested manifest, with no extra/missing path.
- All per-command manifest digests equal the before digest. Status/index/diffs/HEAD/MERGE_HEAD were also identical at pre-stage. This proves this run's snapshot, not the historical checker's snapshot.
- Authoritative task documents backed up to `E/task-backup/`, with `task-backup-sha256.json`, before this update.

## Actual new commands and environment

Reproduction: `python3 E/verify.py` (initial-state verifier; do not rerun its preflight after commits). Existing candidate `e2e/subagents.mjs` and `e2e/run.mjs` were run unchanged. `E/prepare.py` records lint comparison and temporary-index tree correspondence. Each `*-command.json` contains exact command, cwd, complete child environment, start/end timestamps and exit code; corresponding `.log` captures stdout/stderr.

Commands ran in the isolated candidate. The environment was constructed from an allowlist, not inherited: fixed Node PATH, C.UTF-8, Asia/Shanghai, telemetry disabled, version-check disabled; distinct per-command HOME, XDG config/data/cache, PI_CODING_AGENT_DIR and TMPDIR under E. No provider credentials were passed. Browser executable explicitly points to existing Chromium 1234. E2E scripts allocate their own fixture agent/project directories beneath the isolated TMPDIR and bind dynamically allocated `127.0.0.1` ports; their isolated child servers clean themselves up. Private candidate node_modules and `.next` were reused; no install, lock regeneration, main build/dependency mutation or real-session API access occurred.

Versions: Node 26.1.0; npm 11.13.0; Git 2.55.0; TypeScript 5.9.3; Next 16.3.1; Playwright 1.63.0; Chrome for Testing 151.0.7922.34 (cache revision 1234).

| Command | Fresh result |
| --- | --- |
| `npm test` | Exit 0: 1222 tests, 10 suites, 1222 pass, 0 fail/cancel/skip/todo. |
| `node_modules/.bin/tsc --noEmit --incremental false` | Exit 0. |
| `npm run lint` | Exit 1: exactly 14 errors, 0 warnings. Not green. |
| `node e2e/subagents.mjs` (trellis-1) | Exit 0: complete 1280x800, 744x1133 hasTouch/coarse-pointer/Enter-newline, 390x844 matrix. |
| `node e2e/subagents.mjs` (trellis-2, consecutive) | Exit 0: same complete matrix. Natural first stream, replay ownership and stale navigation assertions unchanged. |
| `E2E_SERVER_MODE=dev node e2e/run.mjs` | Exit 0 **in this fresh run**: API/history, desktop reading-offset/cancellation, extension dialogs, chat appearance, desktop and mobile browser phases all reached and passed. No runner phase was skipped by early failure this time. |

Browser artifacts/server logs were copied externally per run. No assertion was weakened and no manual lifecycle event was added to make tests pass.

### Lint reconciliation

The entire diagnostic block is byte-identical to accepted `logs/check-lint-full-r3.log`, including file, line/column, callback/source excerpt, explanatory message and rule (`react-hooks/preserve-manual-memoization`). Only npm preamble/notices differ. Automated equality and all 14 positions are in `E/lint-comparison.txt`.

- ChatInput: 936:41 processImageFiles; 988:40 saveImagesToDisk; 1441:41 getNextSlashIndex; 1482:7 displayedSlashCommands dependency; 1485:5 handleKeyDown; 1618:81 slashQuery dependency; 1618:93 displayedSlashCommands dependency.
- ChatMinimap: 308:36 updateScroll; 318:36 measureNodes; 440:36 scrollToNode; 456:41 scrollToAssistant; 500:39 scrollToHeading.
- SessionSidebar: 1157:44 handleRemoveWorktree; 1185:30 currentWorktreePath dependency.

Baseline L results are reused from the prior isolated reports/logs, **not rerun in this delegation**: 1164 unit pass, tsc pass, 16 lint errors, original E2E historical history/minimap/reading-offset failures. The fresh original-run pass does not erase those failures or establish stable full-suite greenness. Earlier candidate original-E2E failures and incomplete phases remain accurately recorded in `check-report.md`; only this new run reached all phases.

## Pre-integration state and gates

Initial main: personal at L `fdb21ff968b7d99e38aae0a9901f28206d3e5258`, only this task untracked. Candidate: HEAD=L, MERGE_HEAD=U `8366762fa4b4ef3327f1b19e8ff7bf891a14c06c`, 77 staged plus 15 unstaged reviewed paths, zero conflicts and zero unknown untracked business paths. No code change was needed during this validation.

The 15 follow-ups were reviewed against the existing findings: deletion settlement/fail-closed cleanup, profile field retention, hook ownership/replay/StrictMode/model guards, matching regression tests, corrected Settings reachability, Trellis browser coverage and owning spec. Exact staging allowlist is `E/followup-allowlist.json`; no `git add .` is used.

Fresh validation and accepted-limit gates permit the already-authorized integration. The forthcoming D records **main business code still at L**. M is the candidate merge (parents L,U); D is task-only on main; I normally merges D into M. Final task/type checks, M/I business-content-and-mode comparison, ancestry, recovery refs and immediate pre-ff clean/ref checks must still succeed before `git merge --ff-only merge/upstream-v091-20260912-200432` in main. Actual M/D/I, final refs, command logs and ff outcome are recorded externally in `E/operation-report.md`; this document does not anticipate their success.

### Recorded M checkpoint, before D

M was created successfully as `83b76e439e7b7e23f9943d54a9f4e642394577e4`, with parents L and U and tree `0a4cd3e69201f32950b8b5d68443fe363d349e99`. Candidate is clean at M. Main remains at L with only this task untracked; D, I and personal ff have not occurred at this checkpoint. The real index was changed only by the explicit 15-path allowlist after backup, and `git write-tree` matched the independently checked temporary-index tree exactly.

## Explicit residual limits

Full lint remains non-green. Original full E2E has accepted historical intermittent failures despite this one complete fresh pass. No `next build` or production start was run. Node differs from CI 22.19.0; browser revision 1234 differs from expected 1243. Real iOS/WKWebView, physical paste/drop/picker/IME, live push/provider/auth and replacement of existing globalThis wrappers under HMR remain unverified. No service restart/stop, push/publish/tag, stash/reset/amend, task archive or worktree/backup deletion is authorized or performed. Final source ff will trigger HMR/recompilation; it does not guarantee existing runtime wrappers are upgraded.
