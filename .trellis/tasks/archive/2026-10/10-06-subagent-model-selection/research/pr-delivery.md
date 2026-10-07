# PR delivery integration record

> 原始验收产物现留在私有离线副本；本文仍是原 SHA 的历史记录，见 [证据留存](../evidence-retention.md)。

Date: 2026-10-06 (UTC). The user explicitly authorized commits, PR creation, merge and Git closeout, not production deployment.

Target: github.com/xupeng/agegr-pi-web, base personal, head feat/subagent-model-selection. The for-sync remote imports upstream into this fork; it is not the delivery target for these fork-specific contracts. No matching existing PR was found before creation.

## Integrated tree

- Product: 8e20421; contracts: 3fdb1df.
- Fixed confirmed personal baseline: 3f58d31b44865974f1c6cdaa9735596d0ed0bb13, including the merged notification center and its CI-portable fixtures.
- Integration commit: 0ba3761. No ours/theirs or strategy preference was used. Two RPC conflict blocks were resolved semantically: independent child services remain separate; normal/Chat-only run observers stay installed; source assertions retain both exact-prompt and observer contracts.
- The original notification test's suppressed fixture lacked a child policy. The fixture now persists its canonical policy and awaits genuine SDK keyless native auth publication on its owned child runtime. No dummy credential/sleep/gate weakening. Added invalid first-marker refusal asserts no request/tracker/completion and unchanged old ask/history.
- Read-only trellis-check session 01a1132c-db9c-7540-97bf-c4f561e7e60b reviewed both conflicts, automatic notification/history/hook/locale merges, and fixture corrections; no remaining P1/P2 in that focused integration scope.

## Fresh validation after integration

- pr-notification-focused.log: 24/24.
- pr-final-tsc.log: exit 0.
- pr-final-eslint.json/pr-final-lint.log: 763 files, zero errors/warnings, exit 0.
- pr-final-tests.log: 3150/3150, zero failed/cancelled/skipped, exit 0.
- pr-final-browser.log and subagent-model-selection-browser-2026-10-06T21-51-40-146Z/: complete desktop/mobile new/warm/idle/reload/cold/refusal/picker/retry/legacy/settings matrix, exit 0. GPT/replacement loopback calls 15, searches 5, Kimi/external TCP/browser requests/page exceptions 0; exact dev metadata suppression 2 separately recorded.
- Owned Next PGIDs 1334213/1334786 stopped; browser/backend finally closed; outer HOME removed. Existing services untouched.
- Same clean npm-ci dependency tree, lock unchanged (SHA256 18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f). Protected package/lock/AGENTS/.github/.pi paths have no feature delta against the confirmed base.
- Feature-scope diff-check against 3f58d31 is clean. Imported notification archive raw logs retain their pre-existing whitespace, without unrelated edits.
- 2047 task files/zip entries scanned for private-key/GitHub/OpenAI key markers: no hit paths. No real credentials/config/history are included.

These results supersede the pre-notification 2997/728-file snapshot, retained as historical implementation evidence. First failed integration snapshots are labeled by their logs; they are not green acceptance evidence.

## Remaining boundaries

CI will validate the exact pushed PR head before merge. No override of red checks or admin bypass is authorized by this record. Real plugins/search backend/paid providers, Safari and Windows remain untested; browser is English while three locales have executable stream/connection/hook tests. Git closeout does not deploy or restart production.

Task artifacts, archive and journal belong on this feature branch before PR merge. The original checkout's eight untracked planning files were compared with the candidate: three research/design files identical, remaining files superseded by reviewed candidate artifacts; no missing file. Remove only this task-owned stale copy after the archive is merged. Do not stash/discard unrelated work or append post-merge journal/archive commits on personal.
