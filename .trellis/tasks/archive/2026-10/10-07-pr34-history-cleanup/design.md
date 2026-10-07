# Restricted clean-history reconstruction

## Locked boundaries

Host/repository: `github.com/xupeng/agegr-pi-web`, canonical remote `origin`, base `personal`. `for-sync` is read-only for this task. Original tip O is `c3f8aa3deb11a572e815378a1781f4397e638183`; pre-PR base B is `3f58d31b44865974f1c6cdaa9735596d0ed0bb13`.

Do not rewrite B or any earlier history. Do not alter any existing other branch/tag, user asset, dependency, runtime/test/fixture blob, or live configuration. Existing unrelated detached worktrees remain untouched.

## Publication graph

```text
B -> R (clean, logically grouped reconstruction of the original PR's final tree)
     -> C (new cleanup policy + this task archive + journal on its feature branch)
     -> M (normal merge of C's small PR into clean personal)
```

R includes the original task's concise archive and historical journal, not its contaminated ancestors. Verify R and C locally and review their trees before the remote rewrite. Push C only to the new task-owned `chore/pr34-clean-history` ref; use exact-lease CAS to replace `personal` O with R. Then create the small C→personal PR, verify its base is R and its merge base is clean, await exact-head CI, and merge normally. Do not use an old-personal merge, GitHub “Update branch”, or an automatic merge whose inputs were not inspected.

This separates reconstruction of the already-reviewed product from the new policy/bookkeeping review and avoids a new 123k-line deletion PR. Feature-ref creation and the small PR require the final planning approval. If the base advances unexpectedly, stop instead of overwriting or folding in unknown changes.

## Evidence retention and exclusion

Before any published write, create a private recovery directory outside the repo: `/home/xupeng/services/pi-web/history-backups/20261007-pr34/`. Put a self-contained Git bundle, independently checked recovery evidence, ref snapshot and compact recovery instructions there. Raw validation outputs generated for this task also live outside Git, not in automatic-cleanup cache.

Exclude only the original task's 280 raw research outputs, including generated JSONL and 13 browser-result directories. Preserve its 25 planning/manifest/metadata/Markdown files and all non-task changes. Its historical range contains 227 raw-content blob identities; 3 were already present in B. Verify the remaining 224 are unreachable from the replacement head. Preserve shared pre-base history rather than deleting unrelated material to make a false zero-object claim.

Retained Markdown records explicitly identify historical evidence and map it to the private recovery index. Repair stale manifest paths to existing archived Markdown. Preserve old SHA/PR references as historical identifiers and add reconstruction provenance; never rewrite old reports as if they ran on the new SHA.

## Prevention

Add narrow task-research ignore patterns for raw logs, browser output directories, binary captures and generated validator reports; do not globally ignore product/test JSON or task manifests. Add a short task-artifact guide and resolve the existing quality-guide wording so final validation is summarized in tracked Markdown while raw output is retained privately or in controlled CI artifacts. Inspect staged stats and artifact paths before each commit.

## Verification and deployment

Compare the complete original and reconstructed Git trees, including file modes, with only explicit task-evidence/documentation/policy differences allowed. All runtime/test/fixture/config/user-asset/package blobs must match. Keep the existing lock SHA.

Use one clean `npm ci --include=dev` tree for tsc, lint and full tests; private HOME/agent/XDG/ancestor discovery, disk-backed temp paths, no paid model/search calls. Original evidence is 3150 passing tests and 763 zero-diagnostic lint files; rerun and report actual new counts. PR CI covers clean-base checks and production/browser e2e; distinguish historical feature-browser evidence from fresh checks.

After M is confirmed, verify the primary checkout has no unknown dirty files, remove only the identical task-owned planning copy, and explicitly synchronize its now-divergent `personal` to M. This exceptional synchronization is part of the approved history rewrite, not ordinary PR closeout. Preserve other worktrees/ref tips.

Rebuild M in an isolated deployment worktree and deploy to 26812 with the established candidate/smoke/rollback supervisor. Do not falsify the old c3 build stamp to avoid rebuilding. Keep 8505's PID/start identity and independent scope unchanged. Retain a deployment rollback artifact and recovery bundle.

## Rollback and limitations

Before publishing, any failure leaves remote personal O and production c3 untouched. After publishing, stop on CI/base/identity failures; do not silently force O back or merge old polluted history. Retain private recovery evidence for an explicitly scoped recovery decision. Deployment failure uses its artifact rollback without undoing Git history.

GitHub read-only PR 34 refs/caches, other clones and offline recovery backups can retain the old objects. Normal branch-history cleanup is not physical erasure; no Support purge, repository deletion or recreation is authorized.
