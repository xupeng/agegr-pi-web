# PR CI follow-up: native search fixture temp-root portability

Date: 2026-10-06 UTC. PR 34, exact failed head 3b80ca1c85eaa39af49310c449f6d68bf5fc479a, run 37537286193.

CI lint/type passed, production build and broad e2e passed. npm test failed because the native-search isolation module asserted TMPDIR and rejected /tmp before its 13 tests could register. The original failed log is retained as pr-34-ci-37537286193-failed.log. This was a test fixture portability defect, not a model fallback or paid request.

The same task was reopened on the feature worktree, preserving its prior archive/history and approvals. Only lib/__fixtures__/subagent-native-search-hooks/isolation.mjs changed executable content: remove the assert import and environment assertions; prefer the owned PI_TASK_TMPDIR, otherwise use Node's standard tmpdir API with a unique mkdtemp directory. Before-SDK HOME/agent/XDG/Jiti isolation, fetch-origin allowlist/counters, keyless/owned backend controls and cleanup remain unchanged. No product runtime, CI workflow, dependency, test skip, retries, or auth bypass was changed.

## Verification

- Actual native-hook suite with TMPDIR and PI_TASK_TMPDIR unset: 13/13, 16 owned loopback Responses requests, real model/search/Kimi/external requests 0, listening servers 0.
- Full npm test with both variables unset: 3150/3150, fail/cancel/skip 0.
- Local fallback uses the platform TMP environment pointed inside an exclusive owned /var/tmp HOME/cache tree, avoiding this machine's limited /tmp. The fixture itself hardcodes no platform path. Remote CI's default-root case is to be proven by the new exact-head run, not claimed from this local fallback.
- Clean same npm-ci lock tree tsc0; ESLint763files/0errors/warnings. Formal pr-ci-portable-* logs retained.
- Read-only trellis-check 01a11340-ebf5-7540-97bf-c4fd8d3a67f0: focused helper/suite contracts pass, no weakened network/auth/trust controls or skipped cases.
- Owned outer HOME removed; finite SDK servers are all closed. No other services/configuration/history touched.

The post-notification desktop/mobile feature browser evidence at 21-51-40 and CI broad e2e are retained; this helper-only edit does not change their production code. New PR CI must still pass for the updated head before merge, without admin bypass. Task archive and new journal follow the fix on the feature branch before merge; do not append them afterward on personal.
