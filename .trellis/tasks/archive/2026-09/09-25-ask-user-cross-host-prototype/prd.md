# Validate ask_user and prototype cross-host extension

## Goal

Establish behavioral evidence for the new `ask_user` invocation guidance, prototype a reusable Pi extension boundary in Pi Web, and make an interactive-only host bridge work in the separate personal-assistant project. This is a new iteration following the completed and archived `09-25-ask-user-adoption-portability` task and merged fork PR #4.

## Background

- Guidance and metadata tests are merged, but the archived `09-25-ask-user-invocation-guidance/research/validation.md` records only one post-change blocking-case smoke. No paired baseline, negative-case observation or call-rate estimate exists.
- The archived `09-25-ask-user-standalone-extension/research/feasibility.md` finds that tool/schema/validation may be reusable, while pending state, persistence, authenticated answer delivery, SSE and Web UI require a host adapter. A drop-in Pi extension alone cannot supply the personal-assistant experience.
- Personal assistant currently loads approved external tools from `$PA_HOME/extensions/` only when enabled; scheduled runs share admitted external names and finish via `scheduled_result(needs_input)`. `ask_user` must not become an approval channel or appear in scheduled runs.
- Personal assistant already persists conversations/requests through its journal and projects a `Snapshot` with SSE-driven refresh (`src/server/host.ts:717-723`, `src/shared/web.ts:78-99`). It closes the AgentSession at the end of each run (`src/server/host.ts:1045-1066`), so Pi Web's idle-wrapper follow-up cannot be copied directly. Existing Web confirmation cards are runtime-owned (`src/server/host.ts:717-723`) and do not establish a restart guarantee for asks.
- Its ordinary user input is admitted through `host.submit`, which durably records a `RequestRecord` before launching the runtime (`src/server/host.ts:765-803`); treating an ask answer as an ordinary user prompt would misattribute it and risks bypassing the existing per-run permission semantics.
- Pi Web is on `personal`. During planning, personal assistant moved from `main` to an unrelated `feat/pi-pa-commands` branch whose commit `945eb94` includes `.pi/settings.json` and `.pi/extensions/pa.ts`; do not fold that work into ask_user. Recheck the PA base before starting. Both hosts pin Pi SDK `0.85.1`; PA backend and SPA specs apply to its bridge task.

## Requirements

- Run a repeatable behavioral evaluation for blocking and nonblocking/tool-unavailable cases: three matched old/new trials per archived scenario (at most 24 model turns) with the same model/configuration. Record failures separately; distinguish observation from metadata assertions, causation or statistical significance.
- Prototype a reusable tool/validation/DTO boundary with an explicit host `open` bridge. Preserve Pi Web behavior and fail visibly when the bridge is absent; avoid importing Next server state into the reusable package/extension.
- Plan personal-assistant integration through its existing extension admission and runtime allowlist. Host-level origin gating must keep scheduled runs on `scheduled_result`; interactive pending asks need authenticated state, answer delivery, UI and documented restart/stop/failure semantics.
- Preserve personal-assistant's existing write permits and separate replace confirmation. An `ask_user` answer only clarifies requested work.
- Deliver a locally installable/testable Pi extension and host adapters; treat cross-repository commits and reviews as separate ownership boundaries. Do not alter or include PA's unrelated service-command changes.
- In personal assistant, persist unanswered asks across process restart with the same ask identity; keep them visible and answerable on reconnect. Explicitly report failure or uncertain delivery rather than acknowledging an answer that was not delivered.
- In personal assistant, admitting an ordinary new message cancels any outstanding ask in that conversation before the new turn; a later submission for the old askId must return stale. The answer path must not be attributed to that ordinary user message.

## Acceptance Criteria

- [ ] Behavioral evidence records prompts, identical model/configuration, three old/new trials for each of the four scenarios, observed calls/prose, provider failures and limitations. No unsupported compliance or significance claim.
- [ ] A locally testable reusable extension/core boundary is documented and demonstrated without changing Pi Web's existing ask lifecycle or silently accepting an ask when no host bridge exists.
- [ ] Interactive personal-assistant sessions can show and resolve a question via a host-owned bridge; scheduled runs never expose `ask_user`, and write approval remains separate.
- [ ] Refresh, stop/restart, stale submission and failure outcomes are defined and tested; unanswered asks survive restart and remain answerable with the same identity. PA's independent service-command changes remain untouched.

## Out of Scope

- Publishing to npm or promising third-party host compatibility, automatic conversion of prose questions to cards, and interactive waits inside scheduled runs.
- Treating a form answer as authorization for sensitive actions.

## Technical Notes

- Pi Web owns the evaluation and locally installable extension prototype as two child tasks of this parent. Personal assistant owns a separate `09-25-ask-user-host-bridge` task with its own review/branch; it depends on the extension prototype's tested bridge contract.
- The prototype is exercised in isolated fixtures and a local installation path, not enabled in the operator's live PA service by default. Any live enablement or external publication is a separate decision.
