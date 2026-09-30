# Conflict decisions — upstream 433d09e merge into fork 576e74f

Frozen base L: `576e74f80b6fb271402369fde4bc0c5eee7cf509`
Upstream U: `433d09ea2f2cc77b0ff356e8c57575cd4d30179e`
Merge base: `96966e5`

Predicted and actual conflicts: exactly 6.
No whole-file ours/theirs selection was used; no `-X ours`/`-X theirs`.

Upstream commits integrated:
- `fd037e4` feat(chat): continue Markdown lists on new lines in the composer (#884)
- `6a1246e` fix: do not persist new-session model picks into global defaults (#871)
- `433d09e` feat(default-cwd): create dated folders under ~/pi-cwd using the local date (#996)

---

## C1. `lib/file-access.ts` (UU)

Fork side (ours) added the shared `~/pi-web-attachments` persistence scan (fork-only
image fallback) and still carried the base's flat `~/pi-cwd-*` home scan.
Upstream deleted the whole `readdirSync(homedir())` block: the new default cwd is
`~/pi-cwd/<YYYYMMDD>`, selected through `/api/cwd/validate`, so the allow-list no longer
scans home at all (older `~/pi-cwd-YYYYMMDD` folders with sessions are ordinary session cwds).

Resolution (union of the two intents):
- Adopt upstream's removal of the flat `~/pi-cwd-*` home scan; its rationale holds and the
  nested `~/pi-cwd/<date>` path is authorized by `/api/cwd/validate` → `allowFileRoot()`.
- Preserve the fork `~/pi-web-attachments` block verbatim.
- Imports reduced to `import { existsSync } from "fs"` (still needed by the attachments
  block); dropped `readdirSync`.
- Updated the attachments comment so it no longer refers to the removed `pi-cwd-*` scan.

Security boundary untouched: `isPathWithinRoots()` / `isExistingPathWithinRoots()`
(`lib/path-security.ts`) remain the single implementation; no copied authorization logic.

## C2. `lib/rpc-manager.ts` (UU)

Conflict only in the import block. Upstream removed `import { persistExplicitStartupPreferences }
from "./startup-preferences"`; the fork had added `message-display` (stall notice) and
`stall-watchdog` imports next to it.

Resolution: drop the `startup-preferences` import (adopt upstream), keep the fork's
`message-display` and `stall-watchdog` imports. The upstream deletion of the
`persistExplicitStartupPreferences(...)` call site auto-merged cleanly; verified the
symbol is gone from the merged file and `invalidateModelsCache` is still used by the
unrelated `set_model` and reload paths (lines 978, 1223).

## C3. `components/ChatInput.tsx` (UU)

Import block only. Fork added `@/lib/image-mentions`; upstream `fd037e4` added
`getMarkdownListContinuation` from `@/lib/markdown-list-continuation`.

Resolution: keep both imports. The upstream `beforeinput` list-continuation `useEffect`
auto-merged cleanly (verified at the merged file's handler) and does not collide with the
fork's image/`@`-mention handling.

## C4. `components/ChatWindow.tsx` (UU)

Conflict in the `useAgentSession` destructuring. Upstream added
`handleSetDefaultModel, handleSetDefaultThinkingLevel`; fork added `followTailIfAttached`.

Resolution: union — `handleToolPresetChange, handleThinkingLevelChange, handleSetDefaultModel,
handleSetDefaultThinkingLevel, loadSlashCommands, scrollUserMsgToTop,` then
`loadContext, activeLeafId, scrollToBottom, scrollToMessage, followTailIfAttached,`.
Upstream's `defaultModel, savedDefaultThinkingLevel` destructuring auto-merged; the
`ChatInput` prop wiring (`onSetDefaultModel`, `onSetDefaultThinkingLevel`,
`savedDefaultThinkingLevel`) auto-merged and is present.

## C5. `components/SessionSidebar.tsx` (UU, two hunks)

Hunk 1 — `commitCustomPath`: upstream introduced `{ remember = true }` and gated
`saveLastCustomCwd` + `setCustomPathValue` behind it. The fork had removed the redundant
`setCustomPathValue(data.cwd)` because it is reset to `""` immediately below.

Resolution: adopt upstream's `remember` gate, keep the fork's removal of the redundant
`setCustomPathValue(data.cwd)`:
```
if (remember) {
  saveLastCustomCwd(data.cwd);
}
setSelectedCwd(data.cwd);
setCustomPathOpen(false);
setCustomPathValue("");
```

Hunk 2 — `handleDefaultCwd`: adopt upstream's delegation
`if (data.cwd) await commitCustomPath(data.cwd, { remember: false });` and drop the fork's
inline `setSelectedCwd`/`setCustomPathValue("")` block. Default cwd now goes through the
same `/api/cwd/validate` path; `handleDefaultCwd` is already `async` and its dep array was
auto-updated to `[commitCustomPath]`.

## C6. `components/ChatInput.test.mjs` (UU)

Both sides appended new tests (spec rule: keep the union).
- Fork: "shows the follow-up shortcut in the button tooltip",
  "renders the compact composer with the standard Send button and no session controls".
- Upstream: "only the chat composer offers saving a default model or reasoning level",
  "selector rows keep the default star and the floating save button in one gutter".

Resolution: keep all four tests + the base's `only the composer...` etc. No expectation was
rewritten. Required imports (`readFileSync`, `createJiti`/`jiti`) were already present.

---

## Auto-merged files reviewed semantically (spec §5)

- `hooks/useAgentSession.ts`: diff against ours is exactly upstream's additions
  (`savedDefaultThinkingLevel`, `saveDefaultPreferences`, `handleSetDefaultModel`,
  `handleSetDefaultThinkingLevel`, exported keys); fork additions (stall handling,
  `followTailIfAttached`, dispatch surface) intact.
- `lib/rpc-manager.test.mjs`: upstream test rewritten from "persists explicit preferences"
  to "never writes the global model defaults"; fork's other assertions intact. Expected
  upstream test change, not a weakened fork test.
- `hooks/model-loading.test.mjs`: upstream added `SavedDefaultThinkingLevel` to the setter
  list; fork harness otherwise unchanged.
- `components/SessionSidebar.project-identity.test.mjs`: upstream added the default-cwd
  delegation test; fork's two tests intact. Passing after C5.
- `app/api/models/route.ts`, `lib/models-cache.ts`: add `savedDefaultThinkingLevel`.
- `lib/enabled-models-runtime.ts`: `displayPath` → exported `displaySettingsPath`
  (consumed by the new `lib/default-preferences.ts`).
- `app/api/default-cwd/route.ts`: now creates `~/pi-cwd/YYYYMMDD` and no longer calls
  `allowFileRoot()`.
- `lib/i18n/messages/{en,zh-CN,zh-TW}.ts`: upstream keys present in all three languages
  (enforced by `lib/i18n/registry.test.mjs`).
- `AGENTS.md`: upstream documentation aligned with C1 (no `~/pi-cwd-*` home scan; default
  cwd selected via `/api/cwd/validate`). No generated `nextjs-agent-rules` block present.
- Deletions `lib/startup-preferences.ts` + `.test.mjs`: intentional upstream removal,
  matched by the removed call site (C2) and the rewritten RPC test.

## Intentional upstream expectation changes

1. New-session model/thinking picks are session-scoped; saving a global default requires
   the explicit star (`PUT /api/models/default`). Documented in AGENTS.md and covered by the
   rewritten `lib/rpc-manager.test.mjs` test plus `lib/default-preferences.test.mjs`.
2. Default cwd moved from `~/pi-cwd-YYYYMMDD` to `~/pi-cwd/YYYYMMDD` (local date) and is no
   longer force-added to the allow-list by the route; it is validated like any cwd.
   Covered by `lib/default-cwd.test.mjs` and the new sidebar test.
