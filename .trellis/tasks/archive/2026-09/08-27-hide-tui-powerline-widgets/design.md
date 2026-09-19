# Design: Configurable extension UI visibility

## Product Boundary

Pi Web continues supporting generic extension widgets and statuses, but exposes a global compatibility policy for hiding UI keys that are TUI-only or unwanted in the browser. Because the current Pi UI context does not identify the calling extension, the policy is explicitly key-based rather than claiming package-level attribution.

## Settings Model

Persist a versioned Pi Web extension UI settings object in a dedicated private file under `getAgentDir()`:

```ts
interface ExtensionUiVisibilitySettings {
  version: 1;
  hiddenWidgetKeys: string[];
  hiddenStatusKeys: string[];
}
```

Defaults:

```json
{
  "version": 1,
  "hiddenWidgetKeys": ["powerline-*"],
  "hiddenStatusKeys": []
}
```

Use the repository's private atomic-write helper. Preserve unknown top-level fields when updating so future versions can extend the file. Missing files resolve to defaults; malformed files return a clear API error and are never overwritten implicitly.

## Rule Contract

A rule is either:

- an exact non-empty key, such as `workflow-task`;
- a non-empty prefix followed by one trailing `*`, such as `powerline-*`.

Reject embedded/multiple wildcards, whitespace-only values, duplicate normalized rules, and unbounded `*`. Matching is case-sensitive because extension UI keys are identifiers.

Keep parsing, validation, normalization, defaulting, and matching in one server-safe module with pure exported helpers for tests.

## API And Settings UI

Add a same-origin protected GET/PUT API for reading and replacing the extension UI visibility settings. Validate JSON content type and request origin using existing request-security helpers.

Add an "Extension UI" block to General Settings:

- separate Widget and Status rule editors;
- concise copy explaining exact keys and `prefix-*` matching;
- the default `powerline-*` widget rule visible and removable;
- save/loading/error states;
- current-session reload after a successful change, following the existing shell/subagent reload pattern;
- translated labels and validation messages in the existing locale files.

The MVP edits hidden rules rather than presenting inferred extension names. This avoids misleading attribution.

## Runtime Boundary

`AgentSessionWrapper` reads the current policy through a shared server settings accessor when processing extension UI calls.

For visible keys, preserve the existing path:

1. validate/register array or factory widget content, or status text;
2. track wrapper state;
3. emit `extension_ui_request` updates;
4. expose state through `get_state`;
5. let React render the generic UI.

For hidden widget keys:

1. match before invoking a component factory or retaining array content;
2. dispose/remove matching active or stored stale state using generation-safe lifecycle helpers;
3. emit a clear event only when stale content may already be visible;
4. do not retain or expose replacement content.

For hidden status keys, remove stale stored status and emit a clear when needed, then ignore replacement text.

Defensively filter `get_state` snapshots through the same matcher so a wrapper preserved across HMR cannot rehydrate stale hidden entries.

## Reload Semantics

Changing settings triggers the existing session `reload` command when a session is active. Reload is required because ignored widget registrations are intentionally not retained and therefore cannot be reconstructed merely by changing browser state. A new or reloaded wrapper reads the latest global policy.

## Compatibility And Risks

- Non-matching extension UI remains unchanged.
- Dialogs, notifications, custom UIs, title/editor APIs, tools, and commands are unaffected.
- Key collisions remain possible until the SDK provides source metadata; settings copy must state this limitation.
- Filtering only in React is rejected because it would retain headless rendering cost and reconnect state.
- Matching settings on every high-frequency widget render should use a normalized/cached policy invalidated after settings writes.

## Testing

Cover four layers:

1. Pure rule parsing/default/matching tests.
2. Private atomic settings persistence and malformed-input tests.
3. GET/PUT request security and validation tests.
4. RPC adapter tests for array widgets, factory non-invocation, statuses, stale cleanup, snapshots, and visible-key compatibility.
5. General Settings component behavior and reload/error handling using the repository's existing frontend test style.

## Rollback

Removing the settings UI/API and restoring the adapter's unconditional path returns to current behavior. The dedicated settings file can remain harmlessly unused; no session data migration is involved.
