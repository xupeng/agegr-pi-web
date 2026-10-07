# Planning evidence: restricted history and delivery

Read-only observations on 2026-10-07; no branch/service write performed during planning.

## Repository and remote

- Bound target `github.com/xupeng/agegr-pi-web`, origin URL matches; authenticated actor xupeng has ADMIN permission. User explicitly targets the fork's personal branch; `for-sync` imports upstream and is not a delivery target.
- Local and published personal are O `c3f8aa3`; pre-PR B is `3f58d31`.
- GitHub branch-protection endpoint reports “Branch not protected” (404); effective branch rules are empty. Recheck before writing; this is not approval to disable future protections.
- Other existing remote heads are main, outline-hover-hit-area, remove-append-instructions; 10 personal-* tags exist. Their tips are known locally and do not descend from O. Preserve exact IDs and separately check excluded blob reachability, rather than infer it solely from merge ancestry.
- GitHub retains PR34 head `e19af9c` through a read-only ref; ordinary force push does not remove it. GitHub's official sensitive-data-removal documentation says Support does not remove non-sensitive data. No backend-erasure promise.

## Exclusion research

Read-only trellis-research session `01a113c2-769e-73ae-ac6b-18ed1413ae12` examined final/archive references and the historical range; no file/remote/service writes. Its actual TMPDIR was under its exclusive `~/.cache/pi-tmp/<session>/` and no temporary files were created.

- B→O changes 369 paths. The exact raw set is 280 original-task research outputs: 147 log, 68 JSON, 11 generated JSONL, 45 PNG, 1 JPEG, 8 ZIP; 13 browser-result directories.
- Keep the other 89 changed paths: 56 product/test/fixture, 3 product-doc, 3 spec, 2 workspace, and 25 original-task planning/metadata/manifest/Markdown files.
- The lock blob is unchanged: `0ce3fe4b3f6ec8b38e3c1b0928e73fbbc12804e9`.
- Historical raw outputs span 554 path identities and 227 unique contents. Three contents already occur in B; the 224 task-specific blob identities are the strict purge gate.
- Sixteen preserved Markdown files reference raw evidence. Label the evidence historical and moved outside Git, retaining failures and coverage limitations. Two entries in each original context manifest reference old active-task Markdown paths and should point to the archive.
- No dependency on these raw files was found in the 56 changed product/test/fixture files. Do not globally delete by extension or alter actual fixture JSON.

## Clean publication shape

Normal merging of an old-c3 descendant into the rebuilt branch would resurrect contaminated ancestry. Instead reconstruct original product/archive/history as R directly from B, validate it locally, replace personal using the exact O lease, then make the new policy/task bookkeeping a small feature PR C based on R. Ordinary feature-ref creation is an explicit item in the final planning review, not silently implied by force permission. Verify actual PR base/head and clean merge base; do not assume auto-merge or PR state.

## Runtime and validation

26812 currently runs c3 under `pi-web.service`; 8505 PID 1118396 is already isolated in its scope. The launcher compares build SHA with local repository SHA, so the final clean SHA must be independently rebuilt/deployed, not merely stamped over old artifacts.

Existing authoritative baseline is clean-lock 3150/3150 and ESLint763files/0 errors/warnings; prior final PR CI passed both checks/e2e. Keep its historical acceptance, but rerun current candidate gates and clean-head CI. Existing CI runs for pull requests and main pushes, not personal pushes; the small clean-base PR is the CI entrypoint. No SDK/dependency/workflow changes are needed.
