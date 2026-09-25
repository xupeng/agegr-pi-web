# Improve ask_user invocation guidance

## Goal

Improve the model's choice of `ask_user` in Pi Web when it cannot meaningfully proceed without the user's answer.

## Background

- `lib/ask-user/tool.ts:108-115` already supplies a tool description, `promptSnippet`, and `promptGuidelines`. The existing guideline mentions decisions, but not blocking factual clarification or scope confirmation.
- The tool is registered through an optional inline extension (`lib/ask-user/extension.ts:20-37`); tool availability differs by session.

## Requirements

- When `ask_user` is available, tell the model to use it for clarification, scope choice or a required user decision that blocks the requested work, grouping related questions into one call and ending that run.
- Preserve plain prose for normal discussion, nonblocking optional suggestions, and sessions where the tool is unavailable; avoid redirecting every sentence with a question mark to a card.
- Keep clarification separate from consent or authorization for a sensitive operation. No server-side prose rewriting or automatic retry in this iteration.

## Acceptance Criteria

- [ ] Tool-facing instruction covers the trigger, exclusions and follow-up behavior without contradicting the existing asynchronous protocol.
- [ ] Focused contract tests assert the metadata/instruction contract; representative prompts include blocking factual clarification, a required choice, and nonblocking conversation.
- [ ] Where an accessible model can be exercised, manually compare representative prompt outcomes before/after the instruction change; report model identity, scenario results, and limitations. Otherwise disclose that behavioral validation was unavailable; do not infer model compliance from metadata tests.

## Out of Scope

- Guaranteed tool use, prompt-independent enforcement, changes to tool visibility policy, automatic detection/conversion of final prose questions, or UI changes.
