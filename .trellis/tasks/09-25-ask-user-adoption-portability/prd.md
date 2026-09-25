# Improve ask_user adoption and evaluate portability

## Goal

Increase the chance that Pi Web models use `ask_user` for clarification that blocks progress, and produce a grounded assessment of using the same interaction in personal assistant.

## Background

- Pi Web already gives the model an `ask_user` tool guideline (`lib/ask-user/tool.ts:108-115`); tool instructions cannot guarantee model compliance.
- Personal assistant is a separate SDK host with a distinct Web UI and guarded extension loading. A distributable Pi tool does not by itself provide a question card there.

## Requirements

- Child `09-25-ask-user-invocation-guidance` owns Pi Web invocation guidance and its verification.
- Child `09-25-ask-user-standalone-extension` owns feasibility, boundaries and integration requirements for an installable extension in personal assistant.
- This iteration does not ship an extension or change personal assistant. Do not treat clarification answers as authorization for sensitive operations.

## Acceptance Criteria

- [ ] Pi Web guidance covers blocking clarification without redirecting every conversational question to a form; results and limitations are reported.
- [ ] Feasibility assessment identifies portable and host-owned responsibilities, security/lifecycle constraints and a follow-up implementation/test path.
- [ ] Parent review reconciles the two child results; no unapproved changes are made in personal assistant.

## Out of Scope

- Installing a standalone extension, rendering a new card in personal assistant, runtime heuristics that auto-retry prose, or promising deterministic behavior from a model.
