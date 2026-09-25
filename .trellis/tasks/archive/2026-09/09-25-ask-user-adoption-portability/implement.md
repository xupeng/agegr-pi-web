# Execution plan

1. Review the existing `ask_user` tool metadata, registration, protocol spec and focused tests; verify exactly where the guidance appears when enabled.
2. Update the invocation-guidance child only after final planning approval. Add focused contract tests; perform representative behavior checks when a model is available, recording observations separately from deterministic tests.
3. Complete the feasibility child as a source-anchored report using Pi Web protocol and personal assistant runtime/extension admission/UI evidence. Keep personal assistant unchanged.
4. Run typecheck, targeted tests and relevant lint checks. Review cross-child consistency, security boundary and git diff; report any validation limitations.
5. Perform final parent integration review before archiving tasks. Preserve the project's task/archive/session ordering if committing a PR later.

Rollback point: metadata/test changes in the guidance child can be reverted independently; the assessment must not introduce runtime changes.
