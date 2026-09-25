# Preliminary extension boundaries

This is planning evidence, not an implemented extension or a final feasibility verdict.

## Pi Web

- `lib/ask-user/tool.ts:26-69,106-128`: Pi tool schema, definition, prompt metadata, `terminate: true`; depends on a supplied `open` callback.
- `lib/ask-user/extension.ts:20-37`: inline extension resolves a live host session before calling `openAsk`.
- `lib/rpc-manager.ts:485-584`: host registers a pending ask, closes it, and sends answers through a follow-up custom message. `.trellis/spec/frontend/ask-user-protocol.md` describes persistence, SSE and UI behavior.
- `components/AskUserCard.tsx` and `hooks/useAgentSession.ts` belong to Pi Web's browser/host interface, not the Pi extension runtime.

## Personal assistant (separate repository, read-only evidence)

- `src/server/config.ts:81-85,106-108`: external Pi extensions live under `$PA_HOME/extensions/` and loading is off unless `ASSISTANT_EXTENSIONS=1`.
- `src/assistant/extensions.ts:396-479`: admission/allowlist selects active tools and their prompt hints. Rejected or disabled tools do not contribute prompt guidance. Isolated settings and the fixed directory are `src/assistant/extensions.ts:108-117,174-181,212-219`.
- `src/server/host.ts:983-987`: admitted external tools are included for both interactive and scheduled runs. Without origin gating, `ask_user` could appear in a scheduled run.
- `src/assistant/extension.ts:221-224`: scheduled runs end through `scheduled_result`, including `needs_input` when clarification is necessary. Web confirmation is replace-only (`src/assistant/operations.ts:85-94`); save/append use a per-run permit (`src/assistant/operations.ts:68-70`).
- `src/assistant/runtime.ts:84-89`: runtime enforces the exact active tool whitelist after binding.
- `src/assistant/prompt.ts:231`: current interactive clarification is ordinary assistant Q&A.

## Questions for the execution report

- Specify a stable host/extension API for open/close/deliver that does not import Pi Web's Next server or browser modules; ensure namespace and tool admission policy remain host-owned.
- Check personal assistant's stop/restart, multi-device and persistence guarantees; a silent `open` failure or lost answer cannot be presented as success.
- Confirm license, package format and how interactive-only availability could be enforced in the host while retaining existing scheduled-run behavior.
- Define a minimal integration test matrix: register/deny tool, open, refresh, answer, cancel, new user input, stop/restart, scheduled origin, and no write permission escalation.
