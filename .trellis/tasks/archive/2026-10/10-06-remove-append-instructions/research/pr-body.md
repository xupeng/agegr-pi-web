## Intent

Remove the fork-only Append instructions Web editor and API to reduce maintenance against upstream. Git history confirms that the editor/API were added by this fork; pi's native `APPEND_SYSTEM.md` loading is a separate capability and remains intact.

## Changes

- Remove the settings entry, dedicated component and GET/PUT route, file-writing helper, response types, editor styles, and all 21 dedicated keys in each locale.
- Let persisted `append-system` navigation fall back to General through the existing validator, without clearing other pane selections.
- Preserve native global/project prompt loading, project-trust gates, Chat only and built-in subagent behavior, shared reload controls, and existing user files.
- Replace editor-specific tests with real SDK loading/source/trust regressions and assertions that the retired files and production references stay absent.
- Keep desktop/mobile settings, global MCP, visited panes, and Escape/focus behavior; the retired endpoint now returns 404 and settings no longer request it.
- Retire the editor spec/ADR, update current file maps, and include task planning, verification evidence, archive, and session journal in this branch.
