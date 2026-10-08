## Session 44: Preserve unsaved session identity

**Date**: 2026-10-09
**Task**: Preserve unsaved session identity
**Branch**: `fix/unsaved-session-identity`

### Summary

Guard persisted restoration and explicitly recover definitively unaccepted new-composer bindings without changing selected deep links or resending accepted input. User approved a draft PR to personal and publication of bounded sanitized task/current-session records only.

### Main Changes

- Reject missing/empty files and stale header identities before cold SDK resource startup; retain alive runtime and saved legacy compatibility.
- Keep draft/cwd/model/thinking/tools and gate passive recreation until explicit send; preserve unsaved runtime deletion.
- Publish only the executable contract, sanitized acceptance/archive metadata and this current session entry; original diagnostics, raw logs and earlier journals remain local.

### Git Commits

| Hash | Message |
|------|---------|
| `7b6b71d` | (see git log) |
| `e858ac8` | (see git log) |
| `b79498b` | (see git log) |
| `8fe3d6c` | (see git log) |

### Testing

- [OK] Reused byte-identical clean-lock validation: typecheck and lint passed; 3183/3183 unit tests passed without skips.
- [OK] Same isolated baseline: 3166/3166 passed. Independent read-only closure review found no confirmed blocker.
- [OK] No deployment, service restart, real-provider request or live configuration/history mutation; owned verification workspaces were cleaned.

### Status

[OK] **Completed**

### Next Steps

- Create the approved draft PR and verify asynchronous CI and Slow tests on its actual head/base. Callback tests do not establish React/browser or platform-specific coverage.
