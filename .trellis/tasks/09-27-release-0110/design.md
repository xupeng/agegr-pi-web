# Design — parent task map for the 0.11.0 release

## Why a parent with two children

The user's request contains two independently verifiable deliverables: a repository
state (upstream merged, suite green) and a published artifact (registry + verification).
Both need their own branch, evidence set and review, and the second cannot start before
the first is merged — that ordering is written into `09-27-npm-release-0110/prd.md`
rather than assumed by the task system.

## Boundaries between the children

| Concern | Child |
|---------|-------|
| Conflict resolution, dependency/SDK fallout, suite repair | `sync-upstream-pre-0110` |
| Version number, build, package contents, publish, registry verification, bump commit, dev-server restoration | `npm-release-0110` |
| Deciding whether a discovered code defect blocks the release | parent review (the release child stops; the defect becomes a new task) |

## Integration review (parent, after both children)

1. `git log --oneline -3 personal` shows the upstream merge commit followed by
   `chore: bump version to 0.11.0`; `git rev-parse HEAD origin/personal` are identical.
2. `npm view @xup3ng/pi-web version dist-tags.latest dist.fileCount` matches the archived
   tgz, and the archived tgz sha256 matches the re-downloaded remote tgz.
3. The dev server answers on 8505 and `git status --porcelain` is empty.
4. Both children's `research/` reports exist and their AC tables are complete; any
   deviation (for example the release child executing the script's steps manually to
   insert the package audit) is explained there.
5. `task.py archive` both children and then this parent, in that order.

## Risks carried by the split

- **The merge is the risk, not the publish.** 404 upstream-changed files, 23 content
  conflicts, 2 modify/delete conflicts, and a `pi` SDK bump (0.85.1 → 0.87.1) that our
  own contract tests assert against. The merge child owns a documented escalation rule:
  if the dependency fallout cannot be finished inside one bounded session, split it into
  a follow-up child instead of landing a half-verified merge.
- **The release touches the developer checkout.** The chosen in-repo script builds in
  place, so the release child stops the dev server first and restores it afterwards; a
  failed publish leaves a production `.next` and a bumped-but-unpublished `package.json`,
  whose recovery path is written into that child's design.
- **Publish is irreversible and gated by 2FA.** Nothing in either child may publish
  before the explicit user approval step; the archived tgz is the exact artifact the
  user publishes, and its sha256 is recorded before the gate.
