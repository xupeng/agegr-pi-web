# Implementation report — candidate ready for independent checking

## Delivery boundary

Worktree `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-mcp-codemode-20261002`, branch `merge/upstream-mcp-codemode-20261002`. HEAD stays L (`93e63e8`); MERGE_HEAD stays frozen U (`d733d43`). All 27 actual conflict paths are resolved and explicitly staged. No unmerged paths, markers or tracked product deletions. This agent did not commit, push, run another merge, archive, start a browser/dev server, redo baseline gates, or modify the main checkout.

Seven approved planning artifacts were migrated to the candidate using patches: `prd.md`, `design.md`, `implement.md`, `implement.jsonl`, `check.jsonl`, `task.json`, `research/merge-analysis.md`. Approval and candidate worktree were recorded; task remains `in_progress`. Task/research files intentionally remain untracked for the main session's eventual artifact staging. Historical planning evidence remains historical, not rewritten as test results.

## Implementation

See `conflict-decisions.md` for every conflict and the automatic-merge audit. The runtime now composes upstream host MCP/Code mode/tool-search/exposure/queues/SSE/security with fork persistent shared-React ask, exact/append prompt, watchdog, Trellis snapshots, attachments/source-session paths, incremental/on-demand sidebar, restore order, fonts/minimap/tail-follow. No MCP browser management panel was added.

Added behavioral regressions:

- `lib/ask-user/codemode.integration.test.mjs` (2): real SDK and local faux provider prove direct model ask works in Code mode only and terminates after one request; script cannot list/execute ask or open a persistent ask.
- `lib/session-file-references.fork-evidence.test.mjs` (2): successful Trellis/structured apply_patch artifacts remain openable, without restoring arbitrary tool prose/details, errors, preview-only or deletion authorization; forged namespaced MCP apply_patch summaries are denied.
- `lib/rpc-manager-stall-watchdog.test.mjs` (+1): nested bash receives its longer silence budget but is not replayed as a top-level card.
- `lib/rpc-manager-shutdown.test.mjs` (+1): old-wrapper destruction does not erase a replacement's pending ask; current replacement destruction still clears its in-memory ask.

The candidate specs for ask protocol, watchdog replay/budget and mobile viewport were narrowly updated to match these explicit contracts. No gate weakening or failed-test deletion.

## Verification (all final commands exit 0)

Dependency tree is candidate-local and freshly installed from its lockfile with `npm ci --include=dev`. The first plain `npm ci` omitted dev dependencies because the harness sets NODE_ENV=production, so it was replaced by the complete clean install, not repaired incrementally. No lock rewrite or dependency upgrade was necessary.

| Gate | Result | Evidence under `research/logs/` |
| --- | --- | --- |
| `npm ci --include=dev` | exit 0; complete candidate lock-consistent tree | `npm-ci-dev.log` |
| `node_modules/.bin/tsc --noEmit` | exit 0; 0 diagnostics | `tsc-audited.log`, `tsc-audited-exit.log` |
| `npm run lint -- --format json` | exit 0; 627 files, 0 errors, 0 warnings | `lint-audited.log`, `lint-audited-exit.log` (earlier clean JSON: `lint-final.json`) |
| full isolated `npm test` | **2105 tests / 13 suites; 2105 pass, 0 fail/cancel/skip/todo**, 136015.636883 ms, exit 0 | `test-audited.log`, `test-audited-exit.log`, `test-audited-isolation.log` |
| focused combined compatibility suite | **92 tests, 92 pass; 0 fail/cancel/skip**, exit 0 | `compat-audited.log`, `compat-audited-exit.log` |
| `git diff --check`; marker/index audit | exit 0; no markers/unmerged paths; MERGE_HEAD preserved | `git-resolution-audit.log` |

Final full-unit invocation (only small fixtures live under /tmp; node_modules is not under /tmp):

```sh
iso=$(mktemp -d /tmp/pi-web-candidate-audited-XXXXXX)
mkdir -p "$iso/agent" "$iso/home" "$iso/tmp"
env -i PATH="$PATH" LANG=C.UTF-8 NODE_ENV=production \
  HOME="$iso/home" TMPDIR="$iso/tmp" PI_CODING_AGENT_DIR="$iso/agent" npm test
```

No PI_OFFLINE override (plugin-update cases require their mocked commands). env -i strips inherited provider secrets. MCP/SDK tests use local fixture servers/faux providers, not user MCP or paid credentials.

Focused suite: `node --test lib/ask-user/codemode.integration.test.mjs lib/session-file-references*.test.mjs lib/rpc-manager-stall-watchdog.test.mjs lib/rpc-manager-shutdown.test.mjs lib/agent-event-wire.test.mjs`, with the same isolated environment.

Main-session-provided L baseline, **not rerun by this agent**: clean `npm ci --include=dev`, tsc 0, lint **565 files / 0 errors / 0 warnings**, isolated units **1755/1755 pass / 0 fail / 0 skip**. Candidate difference: +350 passing tests, +62 lint targets. `new-lint-targets.txt` independently confirms all 62 targets were absent from L (60 upstream additions plus the 2 new integration/evidence files). Rule/config files were not changed.

Intermediate red runs are retained, not hidden: first full run hit the tool's time limit; subsequent source/VM fixture mismatches and duplicated import were corrected while preserving both sides' assertions. Second complete run passed 2099 tests; added compatibility regressions passed 2104 before the sixth replacement-ask test. A draft version of that test used a nonexported accessor/missing raw-store options and failed; corrected to wrapper public API plus a valid question, then whole suite passed 2105. Final exact-tool-name authorization hardening was followed by the audited whole-suite/static/focused reruns above. Earlier red logs are not the candidate gate result.

## Package / security / lifecycle audit

- Package + lock identity both `@xup3ng/pi-web@0.12.0`.
- pi-agent-core / pi-ai / pi-coding-agent / pi-tui manifest and installed lock versions all exact `0.99.1`; portable peers unchanged.
- `@types/mdast: ^4.0.4`; browserslist includes Safari/iOS 16.2. U GFM email loader is wired for Turbopack and webpack; Mermaid/parser transpilation preserved.
- Final U authorization deliberately still permits appropriate user/assistant references and model-issued arguments. Only system/untrusted result/store sources are rejected as U requires; shared path/root/realpath rules remain authoritative.
- The Trellis final SSE exception is limited to structured details from its exact top-level tool/kind; it is not a claim of a new hard serialized-byte bound on raw producer details.
- Install reports **2 audit vulnerabilities (1 moderate, 1 high)**. No npm audit fix/upgrade was silently applied. Dependency remediation is outside the approved pinned merge.

## Limits and main-session handoff

- **No browser/e2e/dev server was launched here**, as instructed. Main session owns real Chromium validation of ask, restore, FIFO/custom panels, mobile typing/layout, Code mode cards, fonts/minimap and attached/detached tail. Browser evidence cannot be inferred from static/unit/SDK results.
- Actual Safari/iOS 16.2, native WKWebView and Windows hardware/provider transports remain untested. Loader/config/unit checks are not real-device evidence.
- No paid-provider completion, user MCP, OAuth sign-in or MCP management UI was tested/implemented.
- This is an uncommitted merge candidate. `merge-base --is-ancestor U HEAD` cannot pass until the main session makes the approved merge commit. Do not report AC1/AC6/archive/commit closeout as complete yet.
- Only the original 27 conflict paths were staged by this agent. Main session must review/stage follow-up product/spec edits and the two untracked regression files explicitly before any final commit; do not use git add -A/.
- Planning artifacts and all evidence are in this candidate's task directory; the main checkout was treated read-only. Main session's baseline report remains its own responsibility.
