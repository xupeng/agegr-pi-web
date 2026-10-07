# Reconstructed-tree verification

Date: 2026-10-07. Validation snapshot is based on 3f58d31, with original c3 product bytes preserved. The approved reconstruction is now R=31483c6; remote refs have not yet changed.

- Dependencies: one clean `npm ci --include=dev --no-audit --no-fund` tree in the owned stable worktree; Node24.21.0, unchanged package-lock SHA18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f.
- Canonical commands: `tsc --noEmit --incremental false`; `eslint . -f json`; `npm test`. Correct isolated run: tsc exit0, ESLint763files/0errors/warnings, 3150tests/3150pass/0fail/cancel/skip.
- Initial run was not green: fixtures under the real-home ancestor and an explicit XDG_STATE_HOME caused 26 failures (3124/3150). Host diagnose-crash/omarchy skill discovery and the default-path test established the environmental cause. No product/test code was changed to fix this.
- Corrected runner uses a unique disk-backed `/var/tmp` outer sandbox, private HOME/agent/TMPDIR/cache, unset optional config/data/state/runtime XDG overrides, same source/dependencies. Its trap cleans the sandbox; raw failed and successful output is retained separately in the private recovery directory.
- Independent read-only trellis-check session 01a113d5-ed76-73ae-ac6b-18fdf752fb1f checked full path/mode/blob equivalence, all excluded historical blobs, every private evidence copy, contexts and provenance. No product delta found. Its ignore-directory and stale phase-note findings were corrected, then rechecked without weakening tests.
- Ignore tests: all 280 original excluded paths are ignored; task metadata/context JSONL/Markdown and product fixture examples remain addable, including nested generated-browser directories after the fix.
- Old task context validation:12 implement/9 check entries; new task:3 implement/2 check entries, all passed. Candidate diff-check passes.

Raw evidence location: `/home/xupeng/services/pi-web/history-backups/20261007-pr34/validation/`; independent recovery metadata and original artifacts are siblings. No raw logs/JSON/screenshots/ZIP are staged. New PR CI/browser, actual publication, deployment and final cleanup have not yet run.
