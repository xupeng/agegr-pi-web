# Native auth readiness: deterministic SDK race and child-only candidate

Status: **main applied the source-proof assertion correction with native apply_patch; latest combined focused 69/69 and full 2984/2984 pass, tsc0, ESLint728files/0errors/0warnings. Ready for fresh browser execution, not complete acceptance.** New read-only queue review and fresh complete Chromium matrix remain in progress. No browser research/e2e file was edited by this owner.

Main evidence: `native-auth-readiness-parent-focused.log`, `after-auth-tsc.log`, `after-auth-eslint.json`, `after-auth-lint.log`, `after-auth-tests.log`. Unique outer `/var/tmp/pi-subagent-after-auth.*` HOME/XDG/agentDir/ancestor isolation; cleanup trap removed that HOME after formal logs. Failed legacy validation can retain the old native identity/source hint; the test now checks that distinction and still requires the sticky ledger to refuse with zero requests. Filtered replacement invalidates the hint. Product provenance was not weakened to satisfy a test.

Below 67/68 / pending-patch entries are retained **historical child snapshots**, superseded by the above combined run. The original browser failure's exact interleaving remains unproven even though the real SDK mechanism is deterministically reproduced.

## Boundary and dependencies

Worktree only: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`.
Product edits only `lib/subagent-session-services.ts` and `lib/subagent-model-selection.ts`.
New test: `lib/subagent-native-auth-readiness.integration.test.mjs`; own fixture:
`lib/__fixtures__/subagent-native-auth-readiness/provider.mjs`.
No rpc/runtime edits, SDK/private field access, lock update, install, deploy, commit/archive, real config/auth/history edits, browser run, provider search or external request.

Same existing `npm ci --include=dev` candidate dependency tree (906 packages; baseline e0ad630), all four direct Pi packages 1.0.0. Installed versions match package-lock entries; lock SHA256 remains
`18c40d7685f7501d46e66450e5470fd064124f9662b17ac310fce042491d322f`.
Read design/implement/sdk-gates/review-findings/browser-report and frontend subagent selection/type-safety/quality/default/admission specs. Read SDK ModelRuntime and pi-ai Models implementation/types, SDK/auth/provider docs and examples. Crucial public contract: `checkAuth` and availability checks do not refresh OAuth; request `getAuth` may refresh OAuth and is NOT added to the product gate.

## Proven mechanism (not invented fixture credentials)

Browser evidence referenced read-only:
`research/subagent-model-selection-browser-2026-10-06T16-43-48-680Z/`: factory ran; no child session_start/request/search; auth-unavailable; auth.json intentionally `{}`. Same browser native faux registers gateway plus OpenRouter sentinel. Two prior fresh runs reached genuine new/warm/reload/cold child requests with that same keyless fixture.

SDK 1.0.0 public implementation facts:

1. `ModelRuntime.registerNativeProvider` synchronously registers the provider, then calls `void this.refresh({allowNetwork:false})`.
2. `refresh` awaits config reload and pi-ai cache-only refresh before it calls an availability pass.
3. Each availability pass increments a sequence; only the latest pass publishes its auth/catalog snapshot. An awaited pass can finish without publishing if a newer pass began during its await.
4. `hasConfiguredAuth` reads the last published snapshot. Native keyless API auth resolving `{auth:{}}` is legal but has no stored credential/config key for the SDK's provisional marker.
5. Global `getAvailable()` also publishes availability and returns the snapshot, so serializing only explicit refresh would leave a second overlapping-publication path.

The new real-SDK barrier test wraps only PUBLIC runtime.refresh and uses AsyncLocalStorage to label calls. A local async native auth resolver supplies `{auth:{},source:...}`; no dummy key, timer, network, full-Class fake or private SDK member. Exact schedule:

- Registration schedules a refresh whose public invocation is held at a start barrier.
- An explicit offline refresh reaches its local async auth resolver.
- Release registration's start barrier; its availability pass starts later and waits on its own resolver barrier.
- Release explicit pass; await explicit refresh completes.
- Actual runtime has the exact gateway/fixture-gpt model. Request auth resolution genuinely returns empty auth, but hasConfiguredAuth is false and available snapshot is empty. Existing strict selection refuses auth-unavailable with zero provider requests.
- Release registration's resolver; that pass publishes. Identical reference now selects successfully, without config/auth changes or retrying any model request.

This **proves the SDK scheduling failure mode underlying this symptom**. The historical browser run did not instrument availability sequences, so it does not retrospectively prove its exact interleaving. No browser/fixture key or delay workaround is applied.

`native-auth-readiness-before.log`: raw SDK barrier proof passes; actual child-services regression fails with max concurrent refresh count **3**, expected 1 (exit 1; 1/2 tests pass).

## Candidate fix and preserved gates

- `createRuntime` installs child catalog readiness immediately after constructing its OWN runtime and before flushing registrations. A supplied/caller-owned runtime returns unchanged. No parent runtime/credential object is wrapped, refreshed, copied or modified.
- Public `refresh` and `getAvailable` are queued per runtime. Original real SDK methods execute unchanged, including offline options, catalog filtering and authentication checks. Registration fire-and-forget refreshes now participate in the same queue as the services helper's explicit offline refresh.
- Concrete selection and execution scope await the readiness tail. Registrations/queries that arrived during the wait are also drained by awaiting their promises, NOT sleeps, polling, auth retries, default fallback or requests.
- After the final availability query, selection drains readiness again and uses the owned runtime's settled available snapshot; checks current target presence/auth and the provider failure ledger again. A query superseded by a public mutation cannot authorize its old candidate list.
- Existing exact references, scoped parsing/pins, missing-auth refusal, failed registration ledger, source authorization/provenance, false-provider-only lifecycle and trusted-resource rules remain in force. Availability serialization never starts or resets a provider/source generation.
- No product getAuth call is added. Offline refresh/catalog/auth configuration checks do not login or refresh OAuth.

Only ~two-file focused product adaptation; no RPC/runtime permission expansion needed.

## Runtime coverage and current verification

New suite currently 10 tests, including:

- deterministic raw public-SDK barrier proof;
- real child factories register gateway and Kimi sentinel; max concurrent refresh 1 after fix;
- 20 fresh independently created native keyless child services + genuine SDK bind/prompt completions; exact gateway/fixture-gpt, 20 child requests, Kimi 0, isolated auth `{}` unchanged;
- already-bound revalidation: initially genuinely unauthenticated provider becomes keyless-authenticated through public native registration while auth resolver is held. Selection, concrete lookup, scope and global getAvailable all await readiness. Subsequent genuine auth loss refuses without adding requests;
- public mutation during the FINAL availability query: filter excludes the target, or registration fails. Old candidate availability cannot bypass the final ledger/catalog gate;
- offline expired isolated OAuth fixture: login/refresh/toAuth traps never called; auth file byte-identical, zero requests;
- outside scope, zero match, partial misses, empty scope and thinking pin retain strict behavior;
- genuine native resolver returning undefined remains typed auth-unavailable before session_start/request;
- binding failure stays sticky even after successful same-generation registration; a fresh loader generation clears it legitimately, and dynamic extension registration does not retain source proof;
- explicit false provider-only replay selects and requests exact target but transfers no lifecycle/tools/hidden session, and leaves inherited runtime unchanged.

The new worker's public Socket.connect tripwire denies all TCP (no backend needed) and after-hook asserts zero attempts; native faux performs genuine in-process SDK requests. Other focused SDK/RPC tests keep their existing isolated loopback fixtures.

Evidence progression (do not erase failed runs):

| Formal log | Result |
|---|---|
| native-auth-readiness-before.log | exit 1; 1/2; proven overlap countercase |
| native-auth-readiness-after.log | exit 1; 7/8; initial test used invalid native id-only registration which mutates SDK catalog before throwing; corrected test to legacy validation failure retaining the native definition |
| native-auth-readiness-focused.log | exit 0; **66/66** across 8 focused files |
| native-auth-readiness-tsc.log / static.log / eslint.json | tsc exit 0; **4 focused lint files, 0 errors/0 warnings**, exit 0 |
| native-auth-readiness-focused-final.log | exit 1; **67/68** after adding query mutation and OAuth cases. Only failure is an overly broad SOURCE-PROOF ASSERTION, not execution authorization. Direct failed legacy registration retains the old native identity/proof; ledger must still refuse. Main owner has the precise test correction patch. |

Final repeat evidence: `native-auth-readiness-loops.log`, exit 0: **5 fresh test workers**, each runs the explicit barrier/owned-initialization/20-child-completion name filter, **3/3 selected tests pass per worker (15/15 total)**. This adds **100 genuine exact native child completions, Kimi 0 and TCP attempts 0**; it deliberately does not substitute for the pending complete suite's source-proof assertion correction. `native-auth-readiness-static-final.log`, `native-auth-readiness-tsc-final.log`, `native-auth-readiness-eslint-final.json`: latest candidate tsc exit 0, focused lint 4 files / 0 errors / 0 warnings / exit 0.

Full unified tsc/lint/npm test belongs to the main owner. No full test run claimed here. Browser, Safari/Windows, real provider/plugin/network auth and native-search hooks are not claimed by this suite.

## Isolation and cleanup

First inherited TMPDIR was actually inspected:
`/home/xupeng/.cache/pi-tmp/01a11220-ae3f-7540-97bf-c4a8895f401c`; filesystem /dev/mapper/root, not used for runtime validation.
All validation used unique small `/var/tmp/pi-native-auth-home.XXXXXXXX` (static uses pi-native-auth-static-home), unset XDG_STATE/CONFIG/DATA/CACHE, outer HOME-local TMPDIR accepted by pi-tmp-run --keep-on-failure, then inner HOME/agentDir below PI_TASK_TMPDIR. Existing test support adds per-worker scratch and removes it in node:test after. No large /tmp copy or dependency duplication.
Shell trap deletes only its exact owned outer HOME after formal log output is retained in this research directory. All listed validation outer HOMEs are absent (final read-only survey). No browser/backend/Next process was started; sessions are disposed in finally; held barriers are released in finally; public prototype wrappers/global fixture state are restored/removed. No port-based kills or operation on 8505/26812/30141.

## Tooling disclosure / handoff

This child had no native apply_patch command/tool. Before the new explicit prohibition, two product edits were made using a shell apply_patch function backed by patch -p1 and exact generated unified hunks. After the instruction, this method is STOPPED; remaining source edits are handed to the main session's native apply_patch. No helper/patch file was installed.

Remaining action: main applies the one source-proof test correction; owner reruns the complete focused tests on the corrected on-disk file and updates this status to product-ready only after passing (barrier/completion loops and latest static gates have already passed). Then fresh browser owner may rerun unchanged e2e. Existing 2961 full-suite result precedes this candidate and must not stand in for final unified verification.
