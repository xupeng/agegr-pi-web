# Upstream delta being merged (frozen 2026-09-27)

Commands and their output at freeze time:

```bash
git rev-parse personal upstream/main
git merge-base personal upstream/main
git log --oneline --no-merges personal..upstream/main
git merge-tree --write-tree --name-only personal upstream/main
git diff --name-only $(git merge-base personal upstream/main) upstream/main | wc -l
```

* `personal` = `f186cdb` (after PR #16)
* `upstream/main` = `96966e5` — `fix(demo): CI typecheck, downloads on Pages, README auto-tab (#950)`
* upstream changes 404 files
* conflict inventory: 23 content conflicts + 2 modify/delete (design §1)
* unreleased on the fork's side at freeze time: 88 commits since `chore: release 0.10.0` (`8f537d0`)

## The 37 upstream commits (newest first)

```
96966e5 fix(demo): CI typecheck, downloads on Pages, README auto-tab (#950)
4857da3 feat(demo): static Pi Web demo for GitHub Pages (#949)
0876cf4 Release v0.9.3
b908729 chore(deps): upgrade pi to 0.87.1
a3f24ea fix(agent): deliver events to every listener when one unsubscribes mid-emit
499aa4f fix(models): read models.json like pi and never save over an unreadable file
6ad18cd fix(env): keep PI_WEB_PASSWORD out of agent bash and terminal shells
3e1f436 fix(auth): reject login redirects that resolve to another origin
beb32a9 fix(auth): throttle Basic Auth attempts with the login form
f101948 perf(ui): reduce session list scroll work
ea8a278 fix(ui): stabilize subtle scrollbars
79c2a44 chore(deps): trim the production install and bump next, semver, undici (#948)
040fadd Release v0.9.2
234e19e perf(session): #928 + #912 rebased onto main, with fixes (#940)
1bd40e4 feat(minimap): show a per-turn tool-call count in the hover preview (#939)
058341d feat(models): add a manual "Refresh catalog" button to the Models panel (#914) (#938)
12d3599 fix(subagents): drop the completion notification for an already collected result (#889) (#937)
03a9f5d fix(tools): stop overriding settings.json defaultTools on new sessions (#700) (#936)
54aa49c fix(subagents): mark background results as non-user messages (#875) (#935)
f07d4a2 feat(subagents): switch individual built-in sub-agents off (#874) (#934)
0b307d5 fix(chat): reopen the session event stream under Strict Mode effect re-runs (#933)
5933184 fix(ui): make scrollbars grabbable and show one in the chat (#873, #788) (#932)
8b084d3 fix(models): show relative time when provider usage was not updated today
da1b28b chore(deps): upgrade pi to 0.87.0 (#931)
50f6cce feat(models): enabledModels switches in Settings → Models, as minimal edits (#930)
0611857 fix(chat): keep earlier replies visible after a subagent notification (#891)
ef1de89 feat(sessions): remember the open session per browser tab (#887)
1eb5e66 feat: scroll to latest button (#845)
38cba2b feat(plugins): show package description in the Plugins panel (#868)
f3a4ff6 fix: keep selection toolbar above the session sidebar (#855)
be38e5d feat(files): add mention button and middle-ellipsis path to changed-file rows (#853)
31f0505 fix: raise Next.js proxy body buffer so large uploads work (#846)
20a2579 fix(subagents): include session ID in foreground completion text (#847)
9d282da fix(subagents): report provider stream errors as failed runs (#886)
b4a4539 fix(pwa): bound the navigation and asset fetches so a dead upstream cannot hang (#879)
6e95fba feat(models): show OpenCode Go provider usage quota (#844)
```

Upstream also moved its own release line (v0.9.2, v0.9.3). That is irrelevant to the
fork's versioning, which is independent (`@xup3ng/pi-web` 0.10.0 → 0.11.0).
