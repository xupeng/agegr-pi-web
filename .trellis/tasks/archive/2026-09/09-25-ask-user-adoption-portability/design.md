# Design: two independent deliverables

## Boundary

- Pi Web improvement changes only the guidance surfaced with the available `ask_user` tool and its focused tests. It leaves tool execution, state protocol, prompts in sessions without the tool, and UI unchanged.
- Feasibility is a written investigation of portable Pi tool logic versus required host adapters. It does not introduce a new package or alter personal assistant.
- Parent task owns integration review, not source changes. Child tasks may be completed separately, guidance first and feasibility second, with no runtime dependency.

## Rationale and limits

Instruction changes may improve selection but cannot force a model to call a tool. A deterministic runtime detector could misclassify prose; it is deferred. Standalone Pi extension registration only supplies a tool and metadata. Pi Web's browser card and continuation use application-owned state and endpoints; personal assistant has different session/permission policy and must deliberately integrate that lifecycle. Clarification must not act as write approval.

## Compatibility and rollback

Maintain current `ask_user` schema and follow-up semantics. If guidance regresses behavior, reverting tool metadata restores prior behavior. Feasibility assessment is documentation-only; no deployment or rollback is needed for personal assistant.
