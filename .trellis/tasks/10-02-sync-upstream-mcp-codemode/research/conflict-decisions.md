# Conflict decisions — independently checkable merge candidate

## Inputs and method

- L / unchanged HEAD: `93e63e873481aea761cb2b2072c8a2da1654dc73`.
- U / preserved MERGE_HEAD: `d733d4346ac52cf96fa5aad69c5e8f0237bd4a4e`.
- B: `433d09ea2f2cc77b0ff356e8c57575cd4d30179e`.
- Worktree: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-mcp-codemode-20261002`; branch `merge/upstream-mcp-codemode-20261002`.
- Resolved the actual 27 diff3 conflict paths by individual hunks, bottom-up. No whole-file ours/theirs, merge command, commit, push, archive, or main-checkout edits by this agent. Main session had already begun the real merge.
- `logs/git-resolution-audit.log`: explicitly staged exactly those 27 paths, no remaining index conflicts, no markers, `git diff --check` exit 0. Other follow-up edits remain unstaged; task artifacts and the two new regression files remain untracked. This is not yet a commit-ready fully staged tree.

## All 27 conflict paths

| Path | Resolution and retained contract |
| --- | --- |
| `AGENTS.md` | Union of fork operating/contributor constraints and U MCP/Code mode, active/exposure, lifecycle and environment guidance. No browser management panel promise. |
| `README.md` | Keep fork package/install identity, personal-feature section and metadata; insert U MCP/Code mode guidance without replacing fork instructions. |
| `app/api/file-index/route.ts` | Keep git index, deleted-path subtraction, cache and UNC behavior; use U shared tree visibility. `.pi-web` stays a display exclusion in that shared helper, not an authorization rule. |
| `app/api/files/[...path]/route.ts` | Adopt U request-path, real-path/symlink and outside-root authorization flow. Fork `sourceSessionId`, attachments and common open-options chain remain at callers. Do not restore old blanket result-string authorization. |
| `components/ChatInput.test.mjs` | Keep both fork touch/pending-image cases and U enter-send-mode matrix. VM fixtures now supply `isMobileOrTouch` as well as mode; file-mention navigation fixtures explicitly describe desktop input. |
| `components/ChatInput.tsx` | Combine enter-send preference with `isMobileOrTouch`; coarse-pointer Enter still inserts a newline. Preserve pending attachment send/follow-up semantics and accessible action labels; adopt U mobile icon/send chrome. |
| `components/ChatWindow.tsx` | Keep pending ask in the message flow, Trellis callback and tail-follow gate. Add U compaction status, dialog/custom-panel queues, running historical edit/fork/thinking controls. Status text and follow key share `phaseLabel(..., isCompacting)`. |
| `components/MarkdownBody.test.mjs` | Retain fork verified-path/PDF/options tests and U CJK URL, image preview and line-break tests. No test family removed. |
| `components/MarkdownBody.tsx` | Preserve FileIndexContext, verified plain-text linking and options-object handler; add `keepLineBreaks` and U remark/rehype plugin construction. Explicit links remain distinct from verified index links. |
| `components/MessageView.tsx` | Merge U codemode card/history-edit/image preview/tool detail controls with fork PathText, written-file cards, source-session options, minimap-visible structure and localized watchdog notice. Add `hasAssistantAnswer`, retaining existing thinking/notice helpers. |
| `components/SessionSidebar.tsx` | Keep fork project-on-demand catalog, row overrides, request ownership, session restore/family aggregation and fixed row windowing. Use U DismissButton (rather than a stale icon import) and new chat badge text/style. |
| `components/SettingsPanel.tsx` | Union append-system and extension-UI config sections with U Code mode/send-key controls and response types. Do not add an MCP management UI. |
| `hooks/useAgentSession.test.mjs` | Union fork ownership/ask/Trellis/tail-follow regressions with U FIFO, locked historical edit/fork/thinking tests. Shared closure/VM fixtures reflect the combined hook, not reduced behavior. |
| `hooks/useAgentSession.ts` | Keep ask hydration/close-race/state polling and Trellis scoped store. Add id-based dialog and custom-panel queues and reconnect reconciliation independently; pending ask never joins them. Combine codemode progress with Trellis ingestion and the single tail-follow primitive. |
| `hooks/useViewportHeight.test.mjs` | Keep fork delayed-focus/capture-input/cleanup tests and U zoom/60px/settling tests. Former no-zoom assumption is replaced by the explicitly approved scale-normalized policy. |
| `hooks/useViewportHeight.ts` | Adopt U scale normalization, 60px threshold, keyboard data attribute and settling chain; retain fork focus retry delays and capture keydown/input fallback. Consolidate input owner, preserve transition-only unscaled page-position repair and clean all timers/listeners. |
| `lib/agent-event-wire.test.mjs` | Keep fork Trellis details regression and U nested start/end suppression, codemode caps, linear traffic and system-message omission tests. Trellis has one narrow top-level final-details exception, not raw result text. |
| `lib/i18n/messages/en.ts` | Keep fork ask/shared renderer, append-system, watchdog and Trellis keys; add all U Code mode/send/historical edit/queue strings. Registry tests enforce key/placeholder parity. |
| `lib/i18n/messages/zh-CN.ts` | Same union, retaining the combined fork and U hints without duplicate keys. |
| `lib/i18n/messages/zh-TW.ts` | Same union and placeholder contract. |
| `lib/message-display.ts` | Preserve localized stall notice parsing/formatting and add U assistant-answer detection as a separate function. |
| `lib/model-catalog-refresh.integration.test.mjs` | Preserve fork exact/current prompt mock and readonly SDK prompt compatibility; U provider/runtime refresh tests elsewhere remain in the suite. |
| `lib/pi-types.ts` | Keep fork pendingAsk/stall/session options and SDK disposition signatures; retain automatic U MCP/nested/UI additions. Do not restore assignment to SDK readonly prompt state. |
| `lib/rpc-manager-shutdown.test.mjs` | Keep fork readonly prompt/disposition/settlement fixtures while retaining U shutdown/idle/nested replay tests. Added replacement-wrapper pending-ask identity regression. |
| `lib/rpc-manager.test.mjs` | Keep fork clone cancellation, explicit-default boundary, prompt/context, ask and readonly-state mocks together with U wrapper behavior and separate MCP/exposure integration suites. |
| `lib/rpc-manager.ts` | Use U final `resolveActiveToolNames`, not fork's old force-activate-extension helper. Preserve hidden portable ask factory, persisted ask restoration, exact prompt, acceptance-only invalidation and inner-subscription watchdog. Keep U lazy MCP prepare/Stop, closing/deadline/idle logic and identity-aware unregister. Raw nested calls share the watchdog map but are not replayed as top-level cards; parent completion removes descendants. Late old-wrapper cleanup cannot erase replacement pending ask. |
| `lib/subagents.ts` | Union fork written-file snapshot/source-session metadata and U resume/new-run, extension allow/deny selectors and persisted run fields. |

## Necessary adaptations outside conflicted hunks

1. `lib/ask-user/portable/tool.ts`: `exposure: "model-only"`. Nested tools cannot propagate this tool's model-turn termination contract. Metadata assertion plus `lib/ask-user/codemode.integration.test.mjs` prove direct model declaration/call/one provider request and denied script execution/no persistent ask in Code mode only.
2. `lib/agent-event-wire.ts`: retain only top-level `trellis_subagent` final `result.details` with the exact progress-kind gate, to bridge tool-end → canonical message. No result content forwarded; nested updates and other raw end results remain suppressed. Existing Trellis field/aggregate bounds are owned by projection, **not a claimed hard raw SSE byte cap**.
3. `lib/session-file-references-core.ts`: preserve U final policy including allowed user/assistant prose, direct model tool arguments, coding-tool nested arguments and explicit fullOutputPath. Gate exact `apply_patch` / `trellis_subagent` / `Agent` tool names before reusing the existing successful fork write-evidence extractor for structured apply_patch/Trellis/Agent artifacts; do not create a second parser or allow preview-only, failed traces, arbitrary details, arbitrary MCP result prose/forged namespaced apply_patch details or codemode store. The upstream core test now uses the project's jiti loader because this shared helper has normal TS module imports; assertions are unchanged. Two new negative/positive regressions exercise the boundary.
4. `components/CodemodeToolView.tsx`: both card labels use chat font offset; script typography already uses shared CodeBlock. No settings-panel offset added.
5. Removed one automatically duplicated `setToolCallExpanded` import in `components/MessageView.test.mjs` (kept the helper and both test sets).
6. Adapted source-pattern regressions in ChatInput send-shortcut, MobilePwaLayout, ChatWindow status-tail-follow and useAgentSession Trellis tests to actual combined conditions. No assertions disabled, tests deleted, lint exemptions added or gate configuration weakened.

## Automatic merge semantic audit

- `components/AppShell.tsx`: retained Trellis owner cleanup, selected-parent filtering, URL > tab > workspace restore, targeted hydration/row activity and sourceSessionId/modeHint/page forwarding. Existing fork browser fixtures remain unchanged.
- `lib/session-reader.ts`: retained fork disk-mtime summaries/project TTL, bounded concurrency, generation/single-flight, force waits, allowStale, targeted readSessionById and branch pagination. U changes against B in this file were only a flush-timing comment; its inherited alternate scanner is not a new B→U requirement. The separate upstream scanner and its tests remain present, not substituted for fork's hot API path.
- `lib/subagent-runtime.ts` / `lib/subagent-extension.ts`: retained fork exact prompt/resource snapshots/written-file snapshots/queued-abort cleanup. Adopted U model-only control tools, `completedAt`-qualified consumed-result marks, resumed-report identity and orphan interruption. New and reopened subagents do not get host builtin MCP factories.
- `app/globals.css` / viewport: kept fork fonts/layout/appearance tokens and added U keyboard chrome collapse and codemode script border treatment. Scale policy is documented explicitly in the candidate viewport spec.
- `package.json` / lock / `next.config.ts`: fork `@xup3ng/pi-web@0.12.0`, four exact 0.99.1 pins and portable peers remain. U `@types/mdast`, browserslist Safari/iOS 16.2, both email loaders and Mermaid transpilation are present. No eslint/tsconfig/.github gate changes or tracked product deletions.
- `e2e/run.mjs` / `e2e/subagents.mjs`: unchanged from L; retain installed-browser override, isolated agent fixtures, ask/restore/Trellis/tail/font/minimap coverage. They were reviewed, **not executed by this agent**. Runners inherit environment; main session must launch with a sanitized temporary HOME as well as their own agentDir to avoid real credentials/ancestor skills. New Code mode/dialog queue interactions still need real browser coverage.

Evidence: `conflict-hunks.log`, `upstream-rpc-manager.log`, `auto-merge-audit.log`, `upstream-auto-changes.log`, `logs/git-resolution-audit.log`, and `implementation-report.md`.
