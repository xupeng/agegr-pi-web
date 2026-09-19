# Curated adapter context for implementation/check injection

This short context avoids truncating the full `research/findings.md` (over the 32 KiB injection limit). Read the full findings manually when checking an original claim; read current prd.md/design.md/implement.md before work. This document does not authorize implementation.

## Scope and gate

User approved the direction, not execution of the latest plan: pi-web-only adapter for tool `trellis_subagent` and `details.kind=trellis-subagent-progress`. Shared Subagents entry/panel shows built-in sessions plus Trellis read-only execution records. Current delegation is documents/research only. Final saved planning summary must be approved in a subsequent message. No Trellis edits, session/config edits, git commit, task.py start or structural-version protocol.

## Essential evidence

- AppShell.tsx:124-140,334-338,1526-1564,2244-2253: family controls entry/count/close/panel. ChatWindow.tsx:242-299 forwards existing callbacks, but has no structured Trellis bridge.
- `.pi/extensions/trellis/index.ts:111-157,551-579,1553-1661`: single/parallel/chain full progress snapshots, `runs[]`, final flag, reused agent-ordinal run IDs, truncated prompt, tails/tools/usage. Chain appends steps and stops early on failure; never fabricate future steps. Partial content is only `subagent running`.
- Trellis index.ts:696-710,1441: external CLI uses --no-session. It is not a Web child session or registry member. Existing finalText/tails/tool traces are snapshots, not a full conversation.
- `lib/agent-event-wire.ts:87-95` preserves partialResult details. `lib/agent-event-stream.ts:90-110` reconnects with streamingMessage, not a tool progress replay. `lib/agent-event-connection.ts:140-168` rejects discarded-source callbacks but does not establish branch ownership.
- `hooks/useAgentSession.ts:1300-1330` currently keeps only generic text progress in agentPhase and drops it on end. `:1259-1285` appends final tool-result messages. Separate record state is needed; keep generic phase behavior unchanged.
- Pinned Pi 0.85.1 agent-loop.js:532-554 copies final result.details to toolResult. AgentSession agent-session.js:383-399 notifies subscribers then appendMessage (an immediate read can lag the event). SessionManager session-manager.js:739-790 persists the full message through JSON.stringify. Partials are not durable.
- `lib/normalize.ts:45-65` passes toolResult unchanged. `lib/session-reader.ts:612-677,698-771` walks the requested ancestor path, preserves details even with media/thinking deferral, and aligns message entry IDs.
- Detail GET route.ts:38-52 and context GET route.ts:14-20 default to 50 entries. Preserved details do not imply full initial top-entry coverage. Add a bounded full-viewed-branch projection over already loaded entries; no session-list scan/new endpoint.
- `useAgentSession.ts:466-577,1566-1586`: loadSession/loadContext lack same-session leaf/request ownership guards; loadSession 404/finally also needs scoped acceptance. Same-parent branch responses may race. Null leaf omission currently falls back to default history; explicit root/effective/invalid leaf handling is necessary.

## Required design invariants

1. Built-in family behavior remains unchanged. Trellis scope is only selected parent + viewed branch, not all family members. Count built-in children plus retained Trellis runs; not main row or calls.
2. Identity is collision-free tuple(parentSessionId, toolCallId, run.id); reject oversized/missing IDs, do not truncate them. Parent comes from scope, never details. A copied fork result is a snapshot owned by the new parent ID.
3. One shared unknown decoder/projection/reducer. Limit runs to 100 inspected/retained, tools to latest 32 per run, identity/labels 256 chars, prompt/args/error 2048, finalText 16384, tails 4096, total text 512 Ki chars. Validate finite nonnegative numbers and known statuses; optional/malformed fields fail soft; unknown details stay ordinary tool results. Mark omitted data.
4. Current branch projection is independent of 50-entry messages and skipped on page-up. One map/ancestor walk with cycle protection. Resolve actual sm.getLeafId for default, null for explicit root; invalid leaf cannot fall back to another branch.
5. Hook-local view generation + requested leaf + request sequence + event watermark protect success/error/404/finally, paging, reconnect and shell callback. Clear old records before awaiting branch/session changes. Do not retag late live events with a new branch. Only branch-owned tool calls can update overlays. Old cleanup cannot clear a newer owner.
6. End snapshot remains until canonical message/persistence arrives. Deduplicate update/end/message/history; no late partial regression or slow-load erasure of final data. Use event order, not producer timestamps, for merge ordering.
7. All Trellis statuses are qualified last-reported snapshots. No live running spinner/counter/timer from parent running, final:false, or old timestamps. Partial-only crashes can lose records after reload; never invent state or child sessions.
8. Details are escaped text, explicitly snapshot/not-full-conversation. Mark upstream possible truncation and extra UI truncation. No continue/steer/fork/stop or session selection callback for Trellis records, no automatic path/URL access. Preserve built-in main-first navigation/status/search/listbox.
9. Existing built-in short-task list sampling gap remains deferred. Do not implement section 6's older structural-version recommendations; they are research history, not this scope.

## Verification

Research ran 60 existing tests (normalize, progress, event wire/stream/connection, family, panel and hook) with JITI_FS_CACHE=false: all passed. An stdin-only probe using SessionManager.inMemory -> appendMessage -> JSON round-trip -> buildSessionContext/normalize/wire checked three modes: 9/9 passed. No real session writes/model/API calls; not a persisted-disk or browser feature verification.

Existing hooks/panel tests mostly assert source strings. New feature acceptance requires actual shared reducer tests, isolated temp-directory persistence round-trip and Playwright route-intercepted delayed HTTP/synthetic SSE. e2e/README.md defines a temporary PI_CODING_AGENT_DIR and dedicated server; run in an idle disposable checkout, never next build in the dev checkout. Broad tests require fixture side-effect audit. Commands are in implement.md.

Requirement map: R1-R4 / AC1-AC3 original investigation retained; R5/AC4 mixed entry; R6/AC5 live+history durability/coverage; R7/AC6 ownership; R8/AC7 compatibility/bounds; R9/AC8 honest read-only snapshots; R10/AC9 no built-in regressions or excluded scope.

Pi docs were read completely at the provided installation root (sdk.md, relevant extensions.md and session-format.md cross-references; examples/sdk/11-sessions.ts read only). Pinned local dist source confirms actual serialization. `rg` binary fails with Exec format error; use system grep/find, do not change global tools/config.
