# Implementation Plan

1. Add a server-safe extension UI visibility settings module with defaults, exact/prefix rule validation, normalization, matching, cached reads, and private atomic persistence.
2. Add focused unit tests for defaults, exact matching, `prefix-*` matching, invalid patterns, malformed files, unknown-field preservation, and cache invalidation.
3. Add a protected GET/PUT API route and shared response types; test origin/content-type checks, payload validation, reads, and writes.
4. Apply the matcher to `AgentSessionWrapper.setWidget()` before array storage or factory construction; reuse generation-safe cleanup for stale hidden widgets and defensively filter snapshots.
5. Apply the same policy to `setStatus()`, including stale clear behavior and defensive snapshot filtering.
6. Extend `lib/rpc-manager-widgets.test.mjs` and relevant status tests for hidden arrays, factory non-invocation, stale cleanup, snapshots, and unchanged visible keys.
7. Add an Extension UI block to General Settings with separate Widget and Status hidden-rule editors, loading/save/error states, explanatory copy, and current-session reload after successful changes.
8. Add English and Chinese translations and frontend tests for editing, validation errors, persistence failures, and reload behavior.
9. Run focused tests, `node_modules/.bin/tsc --noEmit`, and `npm run lint`.
10. Review the final diff for server-side enforcement, private atomic writes, no misleading package attribution, and no changes to unrelated extension APIs.

## Review Gates

- `powerline-*` is a visible default rule, not an undocumented hard-coded branch in React.
- Disabled widget factories are never instantiated.
- Live events and reconnect snapshots use the same matcher.
- Settings changes cannot overwrite malformed or unrelated Pi configuration.
- Only exact and trailing-wildcard prefix syntax is accepted.
- Non-matching generic widgets/statuses behave exactly as before.

## Validation Commands

```bash
node --test lib/*extension-ui*test.mjs lib/rpc-manager-widgets.test.mjs
node_modules/.bin/tsc --noEmit
npm run lint
```

Adjust the focused test glob to the final filenames if the shell does not expand it as intended.

## Rollback Point

The feature is isolated to its settings module/API/UI, RPC adapter guards, types/translations, and tests. Reverting those files restores unconditional extension UI handling without session migration.
