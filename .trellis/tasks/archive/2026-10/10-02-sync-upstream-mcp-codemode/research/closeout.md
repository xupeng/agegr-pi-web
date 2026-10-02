# Local merge closeout

## Approved scope and branch

User approved the five-batch local commit/archive/journal plan. Worktree:
`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-mcp-codemode-20261002`;
branch `merge/upstream-mcp-codemode-20261002`. No push, PR, publish, npm version/SDK upgrade,
or integration into personal/main. Baseline sibling and ignored diagnostics are retained.

## Frozen work commits and ancestry

- **Merge:** `56a45e4fdddea256a2fbf7fa9120f18e5acc98ba`
  (`merge: integrate upstream MCP and Code mode updates`).
  - First parent/L: `93e63e873481aea761cb2b2072c8a2da1654dc73`.
  - Second parent/U: `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`.
- **Specs:** `73f38dfcd19a6691f678da19b0ae8f802ddc7229`
  (`docs(spec): document MCP runtime and fork compatibility contracts`).
- B: `433d09ea2f2cc77b0ff356e8c57575cd4d30179e`; all 59 fixed upstream commits are integrated.

Observed `git rev-list --parents -n 1 56a45e4` matches both fixed parents;
`git merge-base --is-ancestor U HEAD` exits 0. No unresolved paths or tracked deletion against
the merge's first parent. Explicit approved path staging: 173 work files then 7 spec files;
no broad add, no amend. Main `personal` remains L. No product file changed after final tests:
current checksum verification passes and `git diff --quiet -- app components hooks lib public
demo e2e next.config.ts package.json package-lock.json` exits 0 after these commits.

## Final evidence (not intermediate targeted results)

| Gate | L baseline | Final candidate |
| --- | --- | --- |
| TypeScript | exit 0 | exit 0 |
| Committed-source lint | 565/0 errors/0 warnings | 629/0/0 |
| Full isolated units | 1755/1755 | **2123/2123**, 13 suites, no failed/cancelled/skipped/todo |
| Unfiltered browser | not claimed | **exit 0**, run.mjs then subagents.mjs |

Default candidate `eslint .` also exits 0; its 631 targets include two uncommitted diagnostic
observer programs, one with an unused-var warning. The separately reported source lint excludes
only ignored test-results, uses unchanged project rules, and covers all 629 committed targets.
No diagnostic code, raw logs, environment files or traces are in the commits.

Final full browser source manifest before/after/current SHA-256:
`c2e387c1df584e33cc3ddff1eae1cae2a0e943dc604a1ca14a5b15216edd5ee8`.
Evidence dirs: `test-results/final-validation-main-2/` and
`test-results/final-browser-verification-main-2/`, with full logs/traces/server output. Original
RED attempts remain in earlier directories and reports, not reclassified as passes.

Full browser covers 1280/390 pagination/DOM identity/reading position/branches/compaction,
minimap/fonts/layout, file panel, ask/dialogs/restore/tail and new MCP/Code mode/edit/FIFO cases;
touch Enter/overflow at 390/744; complete Trellis at 1280/744/390. Verified Chromium 153.0.8010.12
uses isolated HOME/TMPDIR and fixture agent dir, no real keys/user MCP/paid completions. The
reading fixture now requires a stable 120px capture without in-flight older requests; its
original <5px return assertion is unchanged. This stabilizes but does not universally eliminate
all conceivable future observer timing. No product scroll-precedence change was made.

## Repairs and limits

Independent checks found/fixed prospective child→snapshot→Agent source laundering, active ask
navigation carry, new chat label fonts, and inherited L Markdown renderer TTL identity. Full
scope and final increment/fixture reviews are persisted alongside baseline/conflict decisions.
Proxy agent OAuth/region failures were infrastructure interruptions; main completed actual
full commands and fresh configured-model review, without changing real auth/configuration.

Already-promoted historical polluted Agent.writtenFiles loses provenance and is not migrated
or revalidated; U's allowed model/exact Agent reference policy remains. MCP/Code mode browser
cases prove history rendering; real execution/trust/cancellation are fixture+SDK Node tests.
No actual Safari/iOS/Windows/IME hardware, user MCP/OAuth/paid provider, or running thinking/fork
browser-control guarantee. Existing dependency advisories are not remediated via scope creep.
Package remains `@xup3ng/pi-web@0.12.0`, four SDK pins 0.99.1. No MCP management panel was added.

## Bookkeeping checkpoint

This report is frozen in the planning/acceptance artifact commit **before** archive/journal.
Those two subsequent commits must be on this same feature branch, in the approved order.
They cannot be named here before they exist; final delivery reports their actual hashes and
clean Git state. PRD's AC7 checkbox intentionally represents this pre-bookkeeping checkpoint,
not an instruction to append archive/log to personal. If later product repair is required,
append a new fix/evidence commit; do not amend these reviewed work hashes.
