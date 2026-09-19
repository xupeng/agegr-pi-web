# Configure extension widget and status visibility in Pi Web

## Goal

Give users control over which extension widgets and statuses Pi Web exposes, while defaulting TUI-only `pi-powerline-footer` widgets to hidden and preserving useful generic extension UI.

## Background

- Pi Web currently passes every extension `ui.setWidget()` and `ui.setStatus()` call through the RPC wrapper into browser state.
- Extension UI calls currently contain only a caller-chosen key and content. They do not contain a reliable extension package ID or path, so true per-extension attribution is not currently possible.
- The installed `pi-powerline-footer` extension consistently uses the `powerline-*` key namespace for editor-composition widgets.
- Other extensions use widgets for useful workflow, task, context, todo, and progress information, so globally disabling `setWidget()` would be unnecessarily destructive.
- Server-side filtering is required to avoid constructing disabled widget factories and transmitting hidden output.

## Requirements

1. Add global Pi Web settings for extension widget and status visibility.
2. Support ordered key rules with exact keys and a simple trailing-wildcard prefix form such as `powerline-*`; widget and status rules must be configured independently.
3. Default widget rules must hide `powerline-*`; default status rules must not hide anything.
4. Preserve backward compatibility for all keys not matched by a disabled rule.
5. Apply filtering in the server-side extension UI adapter before a disabled widget factory is instantiated, rendered, retained, or emitted.
6. A disabled update must remove matching stale state held by a hot-reloaded wrapper and clear already connected browser clients when necessary.
7. Persist settings globally for Pi Web in a private, atomic settings file under the Pi agent directory; malformed settings must fail safely without exposing or overwriting unrelated Pi configuration.
8. Expose the controls in General Settings with separate Widget and Status controls, editable key/prefix rules, validation feedback, and an explanation that rules match UI keys rather than verified extension identities.
9. Saving changed rules must offer or perform a reload of the current session so extensions re-register under the new policy.
10. The setting must not disable extension loading, commands, tools, dialogs, notifications, custom UI, or editor-text APIs.
11. Centralize rule parsing and matching so RPC state snapshots, live events, and the settings API share one policy.

## Acceptance Criteria

- [ ] A fresh installation defaults to hiding `widget:powerline-*` and showing other widgets and all statuses.
- [ ] Users can add and remove exact-key or trailing-wildcard prefix rules separately for widgets and statuses from General Settings.
- [ ] Invalid patterns are rejected with actionable feedback and do not corrupt the last valid persisted settings.
- [ ] Calling `setWidget("powerline-top", ...)` with array or factory content produces no visible widget and leaves no entry in `get_state().extensionWidgets` under default settings.
- [ ] A disabled widget factory is not invoked, rendered, or retained.
- [ ] A disabled status is absent from live events and `get_state().extensionStatuses`.
- [ ] Previously retained matching widget/status state is cleared after settings change and session reload, including wrappers that survive development HMR.
- [ ] Non-matching widget/status keys preserve their current update, placement, ANSI rendering, expansion, and reconnect behavior.
- [ ] Relevant settings, API, RPC adapter, and UI tests cover defaults, persistence, pattern matching, filtering, stale cleanup, reload behavior, and non-matching compatibility.
- [ ] `node_modules/.bin/tsc --noEmit`, focused tests, and `npm run lint` pass.

## Out Of Scope

- Reliable package-level extension attribution without corresponding Pi SDK/runtime metadata.
- Changing `pi-powerline-footer` upstream.
- Disabling all extension functionality when one of its UI keys is hidden.
- Arbitrary glob/regular-expression syntax beyond exact keys and a trailing `*` prefix match.
- Per-project or per-session rule sets; the initial setting is global.

## Future Direction

If Pi's extension runtime later supplies `extensionId` or `extensionPath` with every UI call, the same settings surface can migrate from key rules to true per-extension Widget and Status switches without changing the server-side filtering boundary.
