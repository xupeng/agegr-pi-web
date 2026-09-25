# Evaluate ask_user invocation behavior

## Goal

Measure whether the merged guidance is used for necessary clarification and avoided for nonblocking conversation, with a transparent pre-change comparator.

## Background

Archived `09-25-ask-user-invocation-guidance/research/validation.md` records four prompts and only one post-change positive observation. The old prompt metadata is in `922f7e1:lib/ask-user/tool.ts`; the new metadata is on `personal` after PR #4. Contract tests alone do not establish model behavior.

## Requirements

- Fix one available model, thinking setting, tool selection and prompt per scenario; run three independent old/new trials each (at most 24 model turns) in isolated temporary sessions.
- Exercise blocking missing fact, blocking scope decision, nonblocking optional advice, and ask_user-unavailable/Chat-only fallback. Record actual tool call/name/questions or prose, plus errors and cleanup of test sessions.
- Do not equate repeated samples with statistical significance, or use a provider failure as evidence about model choice. Keep prompts, settings, case outcomes and limitations in a reviewable report without secrets or private conversation data.

## Acceptance Criteria

- [ ] Raw case-by-case old/new outcomes and provider/environment failures are distinguishable; no test session or generated files remain in the user's normal sessions.
- [ ] Report covers all four scenarios, three trials per side with the same configuration, and states exactly which calls used ask_user, prose or neither.
- [ ] Summary makes no unsupported claim about generalized adoption, call-rate improvement or deterministic compliance.

## Out of Scope

- Modifying model/provider behavior, automatically converting prose questions, and using metadata assertions as a behavioral test.
