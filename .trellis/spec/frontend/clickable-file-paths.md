# Clickable file paths and the turn written-file pipeline

## 1. Scope / Trigger

This is the single frontend code-spec owner for four things:

1. which tool results count as "this turn wrote a file", and how those paths are extracted;
2. how rendered text becomes a **verified** in-app file link;
3. the artifact card rendered under a reply;
4. the callback that opens a path in the right preview pane.

Contract owners: `lib/written-file-sources.ts` (extraction), `lib/turn-written-files.ts`
(render-facing entry), `lib/path-linkify.ts` (linkification), `hooks/useFileIndex.ts` +
`components/FileIndexContext.tsx` (index distribution), `components/PathText.tsx` +
`components/MarkdownBody.tsx` (rendering), `components/TurnWrittenFiles.tsx` (card),
`app/api/file-index/route.ts` + `lib/file-index-paths.ts` (index production semantics).

Not owned here, and must not be reshaped by this feature:

- `.pi/extensions/trellis` producer: consume its `details`, never change it.
- `lib/trellis-subagent-records.ts`: its `MAX_RETAINED_TOOL_TRACES = 32` display bound is the
  Subagents panel contract. It is deliberately **unusable** as a file source (measured on this
  machine: 1242 paths visible through the last-32 window vs 1929 from the full trace list).
- `lib/git-changes.ts` / `GitFileStatus`: `git --numstat` is **worktree cumulative vs HEAD**, a
  different semantic from this turn's delta. Do not mix the two in one surface.
- `components/FileViewer.tsx` still carries its own markdown link handling; unifying it is
  explicitly out of scope.

## 2. Signatures

```ts
// lib/turn-written-files.ts (render-facing)
extractTurnWrittenFiles(content: AssistantContentBlock[], toolResults: Map<string, ToolResultMessage>,
  cwd?: string): WrittenFile[]

// lib/written-file-sources.ts
interface WrittenFile {
  filePath: string;                      // resolved absolute path
  operation?: "add" | "update" | "move" | "write" | "edit";
  added?: number; removed?: number;      // only when the source proves it is this turn's delta
  sourceSessionId?: string;              // only the built-in Agent snapshot carries one
  origin?: "tool-input" | "apply-patch-details" | "apply-patch-text" | "subagent-trellis" | "subagent-snapshot";
}
parseApplyPatchDetails(details: unknown): RawWrittenFile[] | null
parseApplyPatchSummaryText(text: string): RawWrittenFile[]
parseEditDiffCounts(details: unknown): { added: number; removed: number } | null
extractTrellisWrittenFiles(details: unknown): RawWrittenFile[]
extractSubagentSnapshotWrittenFiles(details: unknown): RawWrittenFile[]
extractWrittenFilesFromEntries(entries: SessionEntry[], cwd?: string): WrittenFile[]

// lib/path-linkify.ts
interface FileIndexLookup { cwd: string; relative: Set<string>; byBaseName: Map<string, string[]>;
  truncated: boolean }
buildFileIndexLookup(files: readonly string[], cwd: string, truncated?: boolean): FileIndexLookup
linkifyToken(raw: string, context: { lookup: FileIndexLookup | null }): LinkedFileMatch | null
linkifyPlainText(text: string, context: { lookup: FileIndexLookup | null }): LinkifiedSegment[]

// hooks/useFileIndex.ts
useFileIndex(cwd?: string): { lookup: FileIndexLookup | null; status: "idle" | "loading" | "ready" | "error" }

// components/TurnWrittenFiles.tsx
type OpenWrittenFileHandler = (filePath: string,
  options?: { modeHint?: "diff"; sourceSessionId?: string }) => void
```

## 3. Contracts

### 3.1 Extraction: sources and priority

`apply_patch` is **not** a pi built-in. It is the external `pi-apply-patch` extension, so its
shape is that extension's contract (`~/.pi/agent/settings.json` lists the package):

| Source | Read | Notes |
|---|---|---|
| `apply_patch` input | `input.path` / `input.file_path` do **not** exist | the argument is `input`: the whole patch text |
| `apply_patch` result | `details.result.summaries` **first** | one line per applied hunk with its operation; naturally excludes `delete` |
| | `details.result.appliedFiles` | only when `summaries` is absent; it **includes delete targets**, so a delete-only patch must return `[]` rather than fall back to it |
| | `details.preview.files[]` | **statistics only** (`added` / `removed` keyed by `filePath`) |
| | result text (last resort) | only when `details` is missing: `^(add\|update): (.+)$` and `^move: (.+) -> (.+)$`; never `delete:`, never the failure form `- <path> (<op>): <msg>` |
| `write` / `edit` | `input.path` (or `file_path`) | result text has drifted across pi versions, so never parse it when `path` is present |
| `trellis_subagent` | `details.runs[].tools[]` where `name` is `write`/`edit` **and** `status === "succeeded"` | walk the full array (producer caps at 100 runs x 256 traces); do **not** go through `decodeTools` |
| built-in `Agent` | `details.writtenFiles` | snapshot written by `lib/subagent-runtime.ts` at completion; absent on sessions recorded before this change |
| `pi-web:subagent-notification` | same `details.writtenFiles` | background subagent completion lands in a **later** turn's custom message; attribute the card to that notification, never to the originating turn |

Traps, all reproduced against real sessions:

- **`preview` is built before applying.** `createPendingPatchUpdate(cwd, input, progress, undefined,
  parsedHunks)` (external extension, `src/index.ts:1432`) derives the preview from every parsed hunk,
  so on partial failure it lists files that failed. A stale preview must never resurrect them.
- **Summary paths are the patch's original text**, which may be relative (282 absolute / 23 relative
  observed). Always resolve against `cwd`; a relative raw path with no `cwd` is dropped.
- **Partial failure lists only failures.** Successful files of a partially failed patch exist only in
  `details`, which is why text parsing cannot be the primary source.
- **Version drift is real.** The `write` result text changed from `Successfully wrote N bytes to X`
  to `Successfully wrote to X` between pi releases.
- **Do not extend `isEditToolName`.** It is also consumed by `MessageView` to decide whether to hide a
  tool input `<pre>`; `apply_patch` has a dedicated `isApplyPatchToolName` predicate.
- **Within one patch, a later `delete`/`move` cancels an earlier `add`/`update`** for the same path.
  The merger drops that path; it does not promise the same for writes spread across separate calls.
- Never derive files from the patch body (`*** Add File:` headers). On partial failure that is not the
  set of files actually written.

### 3.2 Linkification

- The index is `/api/file-index?cwd=`: cwd-relative `/`-separated paths, `MAX_FILES = 5000`,
  `GIT_HARD_CAP = 200_000`, 10 s server cache. It is `git ls-files --cached --others --exclude-standard`
  **minus** `git ls-files --deleted` (`lib/file-index-paths.ts`), because `--cached` still lists tracked
  files removed from the worktree. Only paths that exist on disk may become links.
- `truncated: true` disables unique-basename completion: a "unique" match is not unique in a cut list.
- `lookup === null` (not fetched, still loading, or fetch failed) means **no links at all**, and the
  rendering must be byte-identical to plain text.
- A candidate token that the index does not contain stays plain text. There is no "looks like a path"
  heuristic that bypasses the index.
- Tokens that are never paths: known false friends (`import.meta`, `e.g`, `i.e`, `etc`, `vs`, `a.m`,
  `p.m`), anything over `MAX_LINK_TOKEN_LENGTH = 300`, and anything with a URL scheme.
- `:line` / `:line:col` suffixes are display metadata and are stripped before matching.
- Markdown explicit links (`[x](./y.md)`) keep their previous behavior and are **exempt** from the
  index check. Never claim that all explicit links are guaranteed to exist.
- Card entries are also exempt: their existence is proven by the tool call that wrote them, which is
  why a card may legitimately point outside the allowed roots.

### 3.3 Rendering

- react-markdown 10.x calls custom components with `passNode: true`, so every override must
  `delete props.node` or React renders `node="[object Object]"` into the DOM.
- The sanitize schema strips tags injected by rehype plugins, so linkification must be a React
  component override, never a rehype plugin.
- Overrides: inline `code`, plus the string children of `p` / `li` / `td` / `th`. Deliberately **not**
  `h1`-`h6`, `a`, or `code` block content (noise, and nested-anchor risk).
- An inline `code` inside an existing markdown `<a>` must not produce a nested anchor. The existing
  anchor isolates its descendants with a `null` Provider instead of adding a DOM wrapper.
- Tool output and process details render as `<pre>`; there `PathText` is used. It returns a fragment
  with no wrapper so whitespace, alignment and wrapping are unchanged, and it emits the input verbatim
  when there is no lookup or no handler.
- Tool results stay collapsed by default. Linkification inside them is only observable after expanding.
- Any new chat-surface typography uses `calc(Xpx + var(--chat-font-size-offset, 0px))`, never a fixed
  `px`/`rem` value (see [settings-dialog-mobile.md](./settings-dialog-mobile.md)).

### 3.4 Opening and authorization

- `components/TurnWrittenFiles.tsx:19` defines the single chat-surface channel:
  `OpenWrittenFileHandler = (filePath, options?: { modeHint?, sourceSessionId?, page? })`.
  Chat components take this type rather than declaring their own inline signature, so a new option
  reaches every surface at once. Do not add a second shape (for example a positional `page`).
- `AppShell.handleOpenFile(filePath, fileName, { sourceSessionId, modeHint, page })`
  (`components/AppShell.tsx:1032`) opens the right pane and reuses the file-tab machinery;
  `modeHint: "diff"` starts in diff mode and `page` seeds the viewer's `initialPage`.
- `handleOpenLinkedFile` passes `options.sourceSessionId ?? selectedSession.id`. Markdown/`PathText`
  callers pass nothing and therefore keep the selected-session semantics.
  It accepts the same option object (`components/AppShell.tsx:1055`)
  and forwards `page` (`:1059`).
- `components/MarkdownBody.tsx:174` turns a PDF `#page=N` fragment into that option object
  (`openFile(filePath, { page: parsePdfPageFragment(href) ?? undefined })`).
  `components/FileViewer.tsx:42` is the deliberate exception: its own markdown link handler still
  uses the numeric form and is bridged by the inline adapter at
  `components/AppShell.tsx:2504`; do not unify it without checking that adapter.
- `GET /api/files/[...path]` authorizes when the path is inside an allowed root **or** when the given
  `sessionId`'s entries reference that path (`lib/session-file-references.ts`). This fallback is what
  lets a card open a subagent-written path outside the roots (for example `/tmp/...`), which is exactly
  why `sourceSessionId` is carried on the entry. An isolated subagent worktree is registered as an
  allowed root by `addWorktree`, so those paths already pass on the root check.

### 3.5 Card

- One row per file: icon, file name, type line (`Document · MD`), and `+N/-M`.
- `+N/-M` renders **only when the source proves this turn's delta** (`apply_patch` preview statistics,
  `edit` patch hunks). No git-worktree fallback: showing a different semantic in the same slot is worse
  than showing nothing. The group total appears only when every row has numbers.
- Actions expand inline (no floating popover): open preview, open diff, copy path.
- `files.length === 0` renders nothing.

## 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Tool result missing, or `isError === true` | Skipped; never listed |
| `details` absent | Result-text fallback (`apply_patch` only), or `input.path` for `write`/`edit` |
| `details` present but unparseable | **No** text fallback: returning nothing beats fabricating a written file |
| `delete` operation, or a delete-only patch | Not listed |
| Same patch adds then deletes/moves the same path | Earlier entry dropped |
| `preview` lists a file whose hunk failed | Not listed |
| `trellis_subagent` run `status !== "succeeded"` | Skipped |
| `trellis_subagent` trace `args` not valid JSON, or path truncated by the producer | That trace skipped, others kept |
| More than 32 traces in a run | All traces inspected; no file lost |
| Raw relative path with no `cwd` | Dropped |
| Index loading, failed, or `lookup === null` | Plain text, identical to the no-feature rendering |
| Index `truncated` | Exact matches still link; unique-basename completion disabled |
| Path not in the index | Plain text |
| `import.meta`, over-long token, URL scheme | Plain text |
| Inline code inside a markdown link | Plain code element, no nested anchor |
| Card open without `sourceSessionId` for a path outside allowed roots | `403` from `/api/files` |
| Missing `writtenFiles` (older sessions) | Card falls back to the other sources; no error |

## 5. Good / Base / Bad

- **Good:** a turn whose only writer is `apply_patch` lists every successfully applied file with its
  operation and `+N/-M`, including relative paths resolved against the cwd; a partially failed patch
  lists the successes and hides both the failures and the delete target.
- **Base:** `write` / `edit` behave exactly as before; a session with no index and no handler renders
  identically to the pre-feature build; a session with no writes renders no card.
- **Bad:** trusting `preview` (resurrects failed files); reading the last 32 traces (silently loses
  files); parsing the patch body (does not equal what was applied); linkifying without the index
  (dead links); extending `isEditToolName` (hides the patch body in the UI); showing git worktree
  numbers as if they were this turn's delta.

## 6. Tests Required

- `lib/written-file-sources.test.mjs`: `apply_patch` `add`/`update`/`delete`/`move`, partial failure,
  delete-only, stale preview, unparseable details, text fallback, >32 traces, malformed args,
  non-succeeded status, snapshot fields, entry pairing, dedupe/merge order, `sourceSessionId` backfill.
- `lib/turn-written-files.test.mjs`: the pre-existing 15 assertions must not change; new cases cover
  multi-file `apply_patch`, relative paths and the subagent branches.
- `lib/path-linkify.test.mjs`: exact hits, unique/completed basenames, ambiguity, `truncated` downgrade,
  `:line` suffixes, Windows drive and UNC forms, false friends, verify-only linkification.
- `lib/file-index-paths.test.mjs`: `subtractDeletedPaths` (normal, empty inputs, spaces, non-ASCII).
- `components/MarkdownBody.test.mjs`: inline code link, miss stays code, no nested anchor, no wrapper
  for table cells.
- `components/TurnWrittenFiles.test.mjs`: file name and `title` = absolute path, inline action row,
  numbers only when present, total only when complete.
- `components/MessageView.test.mjs`: tool-call structure assertions stay green; notification cards
  render under the notification.
- `lib/i18n/registry.test.mjs`: new keys exist in all three locales with identical placeholders.
- `e2e/clickable-file-paths.mjs`: real browser click-through for inline code, tool result and card
  actions, plus desktop and mobile viewports.

## 7. Wrong vs Correct

```ts
// Wrong: the 32-trace display bound silently drops files.
const traces = decodeTools(run.tools);
// Wrong: preview lists hunks that failed to apply.
const files = details.preview.files.map((f) => f.filePath);
// Wrong: a shape-based guess creates dead links.
if (/\.\w{2,4}$/.test(token)) return link(token);

// Correct: authoritative success list, statistics from the preview, always resolved against cwd.
const written = parseApplyPatchDetails(details) ?? parseApplyPatchSummaryText(resultText);
const files = resolveAndMergeWrittenFiles(written, cwd);
const match = linkifyToken(token, { lookup: lookupFromIndex });
```

## 8. Verification method

Code-level tests are not sufficient evidence for a click-through feature. Two kinds of evidence are
required and must be reported separately:

- **Data-path scripts** over real session files (see the task `research/verify-e2e.mjs` and
  `research/verify-ac5.mjs`, which measured 24 extracted files and 1242 -> 1929 paths).
- **Real browser runs** (`e2e/clickable-file-paths.mjs`) for anything that depends on a click, the
  right pane, or viewport layout. A data script is never "browser E2E". Uncovered paths are reported as
  uncovered, not inferred from code reading.

