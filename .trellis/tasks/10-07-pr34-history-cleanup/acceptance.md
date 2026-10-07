# Clean-history candidate acceptance

Local candidate verified on 2026-10-07. This is not yet a remote rewrite, PR merge or production acceptance record.

- AC1 passed: private original-all-refs.bundle (SHA256 d87e571a6a35eab97b28be335e91db7bb4d883a399b98fd94ac948fae119999e), independent bare restore/fsck/original tree check, and byte-identical copies of all 280 original raw artifacts.
- AC2 passed on the staged validation snapshot: independent reviewer checked 2710 tree entries; all 1314 non-administrative files and modes equal original c3. Package/lock/fixtures/assets remain unchanged.
- AC3 passed on the validation snapshot and formal R=31483c6f9c9d80929eee91a4af4751d14d109011: B is retained; O and all 11 contaminated post-B commits are not ancestors; all 224 task-specific raw blobs are unreachable. Three pre-B shared blobs remain, correctly excluded from the purge claim.
- AC4 local scope passed: four context manifests validate, historical provenance is retained, raw evidence is private, and the artifact ignore boundary is tested without hiding nested Markdown/metadata. Final staged checks repeat before delivery.
- AC5 local gates passed: clean npm-ci tree, tsc0, ESLint763/0 errors/warnings, npm test3150/3150/0 fail/cancel/skip. See research/validation.md. New exact-head CI and fresh browser coverage remain pending; prior product feature-browser evidence is historical only.
- AC6–AC8 pending delivery: exact-lease replacement, other-ref comparison, small clean-base PR/CI/merge, primary synchronization, clean-SHA 26812 rebuild, final smoke/8505 identity and owned cleanup.

Private operational evidence and recovery location: `/home/xupeng/services/pi-web/history-backups/20261007-pr34/`. Raw outputs are deliberately not part of this task's Git archive. Delivery outcomes will be kept there and reported explicitly; never mark pending operational criteria as passed before execution.

No real provider/search, Safari or Windows acceptance has been performed. GitHub PR refs/caches and offline backups can still retain the original history; normal branch cleanup is not physical deletion.
