## Intent

Keep built-in subagents on the model explicitly selected by the user across resume, idle reclamation, browser reopening and cold process restoration, instead of silently falling back when an extension-provided provider is unavailable.

## Changes

- Create independent child runtimes and default new profiles to currently installed, enabled and trusted extensions, preserving explicitly disabled extensions and historical exact tool permissions.
- Enforce branch-explicit model selection, authentication and execution scope before admission, including native catalog readiness and live model data consistency; refuse unavailable or mismatched targets without a fallback request.
- Apply registration-aware extension tool permissions to delayed registration and reload, preserving deny rules, hidden/inactive tools and reserved main-session controls.
- Keep explicit no-extension recovery provider-only, with bounded source hints reauthorized against current trust and resource configuration.
- Persist explicit cold model changes through the standard SDK model-change path, and carry safe HTTP/SSE refusals into three-language draft-preserving feedback.
- Preserve notification-center admission and canonical-history contracts; include real SDK/loopback browser regressions, executable specs, acceptance evidence, task archive and session journal.
