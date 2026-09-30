# Verification report — merge upstream `433d09e` + Pi 0.99.1 upgrade

Worktree: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/upstream-pi-0991-20260930`
Branch: `merge/upstream-pi-0991-20260930`
Node `v24.21.0`, npm `11.19.0`.

## Frozen inputs

- L = `576e74f80b6fb271402369fde4bc0c5eee7cf509` (`personal`)
- U = `433d09ea2f2cc77b0ff356e8c57575cd4d30179e` (`upstream/main`)
- Missing upstream commits: `fd037e4`, `6a1246e`, `433d09e` (3).

## Merge state

- `git merge --no-ff --no-commit 433d09e` performed; `MERGE_HEAD = 433d09ea2f2cc77b0ff356e8c57575cd4d30179e`.
- Exactly the 6 predicted conflicts (`components/ChatInput.test.mjs`, `components/ChatInput.tsx`,
  `components/ChatWindow.tsx`, `components/SessionSidebar.tsx`, `lib/file-access.ts`,
  `lib/rpc-manager.ts`), all resolved by hand; `git ls-files -u` is empty.
- No whole-file ours/theirs, no `-X ours`/`-X theirs`, no `git add -A`.
- Full per-conflict rationale and auto-merge review: `research/conflict-decisions.md`.
- Upstream deletions `lib/startup-preferences.ts` + `.test.mjs` adopted; the call site and
  the persisted-new-session-pick behavior are gone (intentional, documented).
- Index holds the **pure merge product** (see staging status below) and is the merge commit
  the parent will create. Ancestry of U will be established by that commit.

## Upgrade changes (Pi 0.87.1 → 0.99.1)

`package.json` pins all four direct packages to exact `0.99.1`; `package-lock.json` regenerated
with `npm install` then validated with a clean `npm ci`. Dependency tree resolved by npm:

```
@earendil-works/pi-agent-core@0.99.1
@earendil-works/pi-ai@0.99.1
@earendil-works/pi-coding-agent@0.99.1
@earendil-works/pi-tui@0.99.1
```

### SDK compatibility fallout fixed (necessary, no unsafe casts)

1. **`AgentSession.prompt()` preflight contract changed** (pi-coding-agent 0.99.0 changelog:
   "Added per-input disposition to successful RPC prompt, steer, and follow_up responses ...").
   - `lib/pi-types.ts`: `preflightResult?: (success: boolean) => void` →
     `(disposition: "started" | "queued" | "handled") => void`.
   - `lib/rpc-manager.ts` `case "prompt"`: the SDK now invokes `preflightResult` **only after
     acceptance** and passes the disposition. The gate `if (success) acceptPreflight()` became
     `preflightResult: () => { acceptPreflight(); }`. A rejected prompt throws before the
     callback fires, so rejection still rejects the POST (unchanged wrapper contract).
2. **`AgentSession.steer()` / `followUp()` now return `Promise<QueuedInputDisposition>`**
   instead of `Promise<void>`.
   - `lib/pi-types.ts`: return types updated to `"handled" | "queued"`. Callers ignore the value.
3. **Remote catalog request shape** now appends `?types=chat,image,classifier`
   (`lib/model-catalog-refresh.integration.test.mjs` stub matched the exact URL and got 0 hits).
   - Test fixture matches by path; unused `CATALOG_URL` constant removed.
4. **Session file is created on the first user message** (pi-coding-agent 0.99.0: "Fixed new
   sessions being lost when pi exits before the first assistant response ... #10000").
   - `lib/rpc-manager.test.mjs` clone test: the assistant-free source file now exists before the
     clone. Assertion changed from "list is empty" to "the clone adds no new file"
     (`readdir` before/after), and cleanup uses recursive `rm`. Clone still returns
     `{cancelled:true}`. Behavior assertion strengthened, not weakened.
5. **Portable ask_user package peer pins** `0.87.1` → `0.99.1` (`lib/ask-user/portable/package.json`
   and its `discovery.test.mjs`), matching the installed SDK.

No `any` / `@ts-expect-error` / `enum` introduced; `lib/pi-types.ts` remains the sole adapter
surface. Changelogs read for the upgrade window (pi-coding-agent 0.99.0/0.99.1); checked that
inline extension factories are still named `<inline:...>` (`resource-loader.js`) so the fork's
`<inline:` extension preference constants stay valid.

### Verified real-SDK runtime chain (isolated agent dir, `PI_OFFLINE=1`, no model calls)

- `startRpcSession` on a real `AgentSession`: `get_state` (model/thinkingLevel/contextUsage),
  `get_tools` (shape + count), `get_commands`, `get_session_stats`, `set_thinking_level` + readback.
- Chat-only session (`toolNames: []`): `isChatOnly()` true, exact `systemPrompt` inlines the
  project `AGENTS.md` context (59 chars, contains the context text), 0 tools/commands.
- `lib/default-preferences.test.mjs` exercises the real `SettingsManager`
  (`setDefaultModelAndProvider`, `setDefaultThinkingLevel`, `getProjectSettings`, `drainErrors`,
  `flush`) — passes.

## Gates

| Gate | Baseline @ L (0.87.1) | Merge tree (0.87.1) | Final (0.99.1) |
|------|----------------------|---------------------|----------------|
| `tsc --noEmit` | 0 | 0 | 0 |
| `npm run lint` | 0 err / 0 warn (558 files) | 0 / 0 | 0 err / 0 warn (564 files) |
| `npm test` | 1736 pass / 0 fail | 1752 pass / 0 fail | **1753 pass / 0 fail** |
| `npm run test:e2e` | not run at baseline | not run | **pass** (second run; see below) |
| `npm audit` | 2 vulns (1 moderate js-yaml, 1 high brace-expansion) | — | same 2 vulns |

Baseline commands used `env -u NODE_PATH XDG_STATE_HOME= npm test` per the parent's instruction.
Baseline counts: `research/logs/baseline-{tsc,lint,test}.log`; merge: `merge-*`; final: `final-*`.

`npm test` grew 1736 → 1753: +16 from upstream merge tests (composer continuation, explicit
defaults, dated cwd, SelectorRow, sidebar identity) and +1 focused regression added here
(`lib/rpc-manager-shutdown.test.mjs`: every acceptance disposition acknowledges the prompt).

## E2E

`npm run test:e2e` (both `e2e/run.mjs` and `e2e/subagents.mjs`).

- Run 1 **failed** at the first page's `/api/sessions/<id>/state` wait: cold Turbopack compile
  took ~20.5s for `/` plus per-route compiles, exceeding the runner's 30s `waitForResponse`.
  Server log shows no errors and the route returned `200`; browser launch succeeded
  (Playwright 1.63.0 bundled chromium, no executable-path override needed). Classified as an
  environmental cold-start timeout, not a product failure. Artifact: `test-results/e2e/failure.png`,
  `server.log`.
- Run 2 (warm `.next` cache) **passed** end to end: desktop 1280/800 and mobile 390/touch
  viewports, bounded history/pagination, branch navigation, markdown/tool/compaction rendering,
  extension dialogs, ask_user, session restore, chat appearance, and subagent records/built-in
  interactions. Exit code 0.
- Runner isolation confirmed: random free port, its own temp `PI_CODING_AGENT_DIR`, `PI_WEB_PASSWORD=""`.
  The worktree's `.next/dev/lock` was clear; no `next build` was run. Pre-existing main-checkout
  dev servers (ports 8505/26812) were left untouched; nothing listened on 30141.

## Application identity preserved

- `name`: `@xup3ng/pi-web`, `version`: `0.12.0` (unchanged).
- Fork behavior preserved in allowed-file-root security, composer image/`@` mentions, session
  sidebar project identity, auth, tool presets, subagents, SSE, and session restore.

## Staging status (for the parent)

Index = pure merge product; worktree = upgrade/repair edits; task artifacts untracked.

Staged merge paths (29): `AGENTS.md`, `app/api/default-cwd/route.ts`, `app/api/models/default/route.ts`,
`app/api/models/route.ts`, `components/ChatInput.test.mjs`, `components/ChatInput.tsx`,
`components/ChatWindow.tsx`, `components/ModelSelector.tsx`, `components/SelectorRow.tsx`,
`components/SessionSidebar.project-identity.test.mjs`, `components/SessionSidebar.tsx`,
`hooks/model-loading.test.mjs`, `hooks/useAgentSession.ts`, `lib/default-cwd.test.mjs`,
`lib/default-cwd.ts`, `lib/default-preferences.test.mjs`, `lib/default-preferences.ts`,
`lib/enabled-models-runtime.ts`, `lib/file-access.ts`, `lib/i18n/messages/{en,zh-CN,zh-TW}.ts`,
`lib/markdown-list-continuation.test.mjs`, `lib/markdown-list-continuation.ts`, `lib/models-cache.ts`,
`lib/rpc-manager.test.mjs`, `lib/rpc-manager.ts`, `lib/startup-preferences.test.mjs` (D),
`lib/startup-preferences.ts` (D).

Unstaged upgrade paths (9): `package.json`, `package-lock.json`, `lib/pi-types.ts`,
`lib/rpc-manager.ts` (upgrade hunks only), `lib/rpc-manager.test.mjs` (upgrade hunks only),
`lib/rpc-manager-shutdown.test.mjs`, `lib/ask-user/portable/package.json`,
`lib/ask-user/portable/discovery.test.mjs`, `lib/model-catalog-refresh.integration.test.mjs`.

`lib/rpc-manager.ts` and `lib/rpc-manager.test.mjs` are `MM` (staged merge part + unstaged
upgrade part). The staged versions are the 0.87.1-compatible merge and passed the merge-tree
gates (1752 tests); the upgrade hunks are only in the worktree.

Untracked: `.trellis/tasks/09-30-sync-upstream-pi-0991/` (task artifacts, not staged).
Ignored: `.next/`, `test-results/`.

## Dirty-file integrity (main checkout)

SHA-256 unchanged vs `isolation-baseline.md`:
`components/ChatMinimap.tsx`, `e2e/chat-appearance.mjs`, `e2e/extension-dialog.mjs`, `e2e/run.mjs`.

## Residual risks / caveats

- No live model request was made; prompt/streaming behavior is covered by unit/mock tests, the
  real-SDK construction smoke, and e2e fixture flows, not by a real completion.
- The 0.99.0 changelog lists many large features (codemode, MCP, virtual/classifier models,
  themes). pi-web does not opt into them, and the imported SDK surface is type-checked and
  smoke-tested, but they were not exercised end to end.
- `npm audit` still reports 2 pre-existing transitive vulnerabilities (same as baseline); no
  `npm audit fix` was run and unrelated dependency scope was not broadened.
- The e2e cold-start timeout is environmental; a cold first run can still exceed 30s on this
  machine.

## Blockers

None blocking. Merge remains active and uncommitted by the implement agent as instructed.

## Parent closeout and independent final validation

The sections above preserve the implementer's original handoff state. It has since been
reviewed and committed by the parent:

- `59f3d71`: merge parents `576e74f` and `433d09e`; upstream ancestry check exits 0.
- `d04c860`: exact Pi 0.99.1 upgrade and SDK adapters/tests.
- `06abb9a`: reject non-object JSON in the new default-preferences API, with two red/green route regressions.

Independent post-repair results supersede the initial candidate gate counts: **1755 unit
tests pass / 0 fail**, **84 focused tests pass**, tsc exit 0, lint **565 files / 0 errors /
0 warnings**. A real SDK offline lifecycle probe passes using **6 simulated provider
calls and zero network requests**, checking preflight dispositions, rejection, steering/
follow-up, queue/idle settlement, deferred custom notices and ask answer delivery.
Full evidence and residual limitations: `independent-check.md`.

The earlier full desktop/mobile/subagent e2e success is reused because review only changed
rejection of malformed defaults requests. Dedicated browser interactions for the new
default-save stars and list continuation's native undo/mobile-beforeinput remain untested;
their source/component/pure-function/unit coverage is not mislabeled browser coverage.

Local preview is running at `http://127.0.0.1:30142/` (HTTP 200), from the isolated checkout
with `PI_OFFLINE=1` and its own `test-results/pi-0991-preview-agent` data directory. It does
not load the real session/credential/settings files. Log: `/tmp/pi-web-upstream-pi-0991-preview.log`.

Raw console logs in `research/logs/` remain local and are excluded from commits by this
task's `.gitignore`. The concise reports and reproducible offline SDK probe are versioned.
No original checkout code/index/dependency/server changes, no push/PR/publish, no app-version bump.
