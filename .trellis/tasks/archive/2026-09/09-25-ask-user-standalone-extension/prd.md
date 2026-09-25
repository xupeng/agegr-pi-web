# Evaluate standalone ask_user extension

## Goal

Assess the smallest viable installable Pi extension boundary and the work required for personal assistant to offer the same asynchronous question/answer experience.

## Background

- Pi Web registers the tool through an inline extension (`lib/ask-user/extension.ts:20-37`), but the pending state, persistence, answer delivery, SSE and UI are host-owned (`.trellis/spec/frontend/ask-user-protocol.md`).
- Personal assistant admits external tools through an allowlist and has its own Web UI (`src/assistant/extensions.ts`, `src/assistant/runtime.ts` in the personal-assistant repository). Its scheduled runs finish with `scheduled_result(needs_input)`, not interactive questions (`src/assistant/extension.ts:220-224`).

## Requirements

- Produce an evidence-backed feasibility report: what can be extracted, what needs a host adapter, packaging/loading prerequisites and a migration/test outline.
- Explicitly distinguish interactive clarification from scheduled runs and high-risk write approval; preserve personal assistant's extension admission, tool whitelist, and action permission model.
- Do not install or implement a package and do not modify personal assistant in this iteration.

## Acceptance Criteria

- [ ] The report identifies portable API/validation/instruction pieces and host-owned question lifecycle, state, answers and UI with source anchors.
- [ ] It gives at least one viable path for interactive use and explains why dropping the existing inline extension into `$PA_HOME/extensions/` alone is insufficient.
- [ ] It describes origin gating for scheduled runs, authorization boundaries, lifecycle/failure modes, packaging constraints and a follow-up test plan without claiming end-to-end support already exists.

## Out of Scope

- Delivering or publishing an installable extension, personal assistant application changes, scheduled-run interactive waits, and treating `ask_user` as an approval channel.
