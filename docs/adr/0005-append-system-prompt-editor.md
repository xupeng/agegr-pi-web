# Edit pi's native append-system prompt from settings

> **Status: Retired (2026-10-06).** The Web editor and its `GET/PUT /api/append-system` endpoint
> described below were removed in task `10-06-remove-append-instructions`. pi's native
> `APPEND_SYSTEM.md` mechanism (discovery, trusted-project override, Chat only / sub-agent
> boundaries) is retained; edit the file directly. The original decision is kept as history.

Pi Web exposes `~/.pi/agent/APPEND_SYSTEM.md` through a settings section instead
of introducing a Pi Web-owned store for extra instructions. The file is pi's own
first-class mechanism (`ResourceLoader.getAppendSystemPrompt()`), so the TUI and
Pi Web share one source of truth and neither can drift from the other's
semantics. A Pi Web-only store would have needed its own injection path and would
have silently disagreed with the TUI about what the agent was told.

Only the global file is writable, and the writable path is derived server-side
from `getAgentDir()`: `PUT /api/append-system` accepts content and never a path,
so the endpoint cannot be turned into an arbitrary file-write primitive. The
project-level `<cwd>/.pi/APPEND_SYSTEM.md` is reported read-only together with its
trust state, because pi prefers that file over the global one **instead of
stacking them** — an untrusted project file is ignored and the global file still
wins. That distinction is why the panel phrases the two states differently.

Writes are capped at 65536 bytes. The content enters the system prompt of every
request in a normal session, so an unbounded file is an accidental prompt-size and
cost trap rather than a display detail. An empty save creates an empty file rather
than deleting it: pi only reads the file when it exists, so the two are equivalent
and keeping the file is the less surprising outcome.

Scope is deliberately not extended. Chat only mode and built-in sub-agents keep
ignoring this file, because changing those paths would alter prompt semantics that
are established elsewhere. Editing the file does not touch an existing
AgentSession either: new sessions pick it up, running sessions need the existing
reload, and the panel says so and offers that reload instead of restarting
sessions behind the user's back.

## Retirement

The fork's editor chain — `components/AppendSystemConfig.tsx`,
`app/api/append-system/route.ts`, `lib/append-system.ts`, their DTOs, the
`append-system` settings section, its CSS and the three locales' copy — was
removed on 2026-10-06. The reasoning above about path safety, byte caps and
prompt scope no longer describes a shipped surface; it records why the endpoint
was constrained while it existed, so a future re-introduction would have to meet
the same bar. What remains is pi's own file discovery, which the TUI also uses.
