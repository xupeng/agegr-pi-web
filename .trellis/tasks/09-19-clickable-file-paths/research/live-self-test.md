# Live self-test in the development session

Recorded 2026-09-19 from the session that implemented this feature, at the user's request
("do a test in this session"). The point is that **this very conversation is the test fixture**:
the running pi-web instance renders the reply below with the new code, so the human can click
the paths and compare against the expectations listed here.

## What was executed

| Check | Command | Result |
|---|---|---|
| Feature-focused unit tests | `node --experimental-strip-types --test lib/written-file-sources.test.mjs lib/written-file-sources.check.test.mjs lib/path-linkify.test.mjs lib/file-index-paths.test.mjs lib/turn-written-files.test.mjs components/MarkdownBody.test.mjs components/TurnWrittenFiles.test.mjs` | exit 0, **100/100 pass** |
| Full unit suite | `npm test` | exit 0, **1311/1311 pass**, 0 fail, 10 suites |
| Dev server inventory | `lsof -nP -iTCP:30141 -sTCP:LISTEN` / `-iTCP:8505` | nothing on 30141; an existing `next-server` on 192.168.11.47:8505 returns 200 (reused, not restarted; no `next build` was run) |
| Server serves the new code | fetch the served CSS and grep the new class names | `markdown-file-link` and `path-text-link` present in `/_next/static/chunks/_09_v455._.css` |
| Server serves the new index semantics | `GET /api/file-index?cwd=<repo>` | 875 files, `truncated: false`, includes the untracked new files (`lib/path-linkify.ts`, `components/PathText.tsx`) |

## Live click checklist (what a human should observe in the reply)

1. Inline code that names a real file becomes a link and opens the right pane on the correct file.
2. A bare (non-code) path in prose is linked too.
3. A `:line` suffix is display metadata: the link still opens the file itself.
4. A path that is **not** in the index stays plain text. This is the D2 / AC8 rule; if a
   non-existent path ever becomes clickable, the feature is broken.
5. The artifact card under the reply lists the file written during this turn with its type line
   and `+N/-M`, and its `...` actions offer preview / diff / copy path.

## Known limits of this test

- It exercises the extraction-to-render path with a single `apply_patch` write. It does not
  re-run the Playwright suite (see `browser-check-report.md`) or cover AC6's background-subagent
  notification, which still has no real background run behind it.
- Clicking depends on the browser reaching this same server. If the tab is served by a different
  instance, the expectations above do not apply.
