# Final live-data-guard Chromium acceptance — COMPLETE PASS

main最终一次fresh执行（在最后live model公共数据guard之后），证据`subagent-model-selection-browser-2026-10-06T18-04-41-459Z/`与`final-browser-parent.log`，exit0。全部15groupedchecks、model15/search5/Kimi0/externalTCP0/browserblocked0/pageexceptions0/devmetadata2；7截图与API/backend/fixture日志已正式保存，main查看390坏目标草稿/未发与replacement成功截图。Next PGID1273199/1273758已停、runner关闭browser/backend、outer HOME已删除。最新代码tsc0/ESLint728files0/npm2997/2997、liveguardfocused12/12；最新只读guard复审无新P级。覆盖/未覆盖仍与下文一致，browser只English。

下文17:43的完整pass是**历史after-SSE快照**，不是最后guard之后证据；最终结论以本段18:04与acceptance.md为准。

# Historical after-SSE fresh Chromium acceptance — COMPLETE PASS

Latest actual run: **2026-10-06 17:43:54–17:44:46 UTC, exit 0; complete existing browser matrix passed**.
This supersedes the historical 17:11:31 pre-P2/SSE-UX failure below. One fresh run only;
no product failure, locator calibration, workaround or retry. Fresh browser owner/session
`01a1124f-792f-7540-97bf-c4b503b2cb59`; no historical harness child resumed or agent spawned.
Sole worktree: `/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`.

Read existing runner and fixture completely, full historical browser report, browser plan,
current implement record, native-auth readiness report, updated selection/scope and admission
specs, typed SSE wire and supplied final countertest logs before execution. Product readiness
was supplied by main: after-SSE tsc0, ESLint728files/0errors/0warnings, npm tests2996/2996;
SSE-focused82/82 and catalog/scope fence11/11. Those are separate supplied gates, not tests
rerun by this browser owner. The current implement record still contains pre-final pending
wording; this owner does not edit implement/task status. This run is after the supplied fixes.

**No product/lib test/docs/task status/runner/fixture source changed.** Existing script ran with
`E2E_PRODUCT_READY=1`; complete history, provider count, UI and end-of-run assertions retained.
No API/SSE mocks, React state injection, force-click, dummy key, product readiness sleep or
request retry. The fixture's existing delayed lifecycle registration is the tested condition,
not a workaround. All model/search traffic was literal loopback; Kimi sentinel remains fatal.

Formal evidence: **`subagent-model-selection-browser-2026-10-06T17-43-54-390Z/`**.
Outer command log: `browser-after-sse-fresh-20261006T174354Z.log`.
Owned process observations: `browser-after-sse-ownership-20261006T174354Z.log`.
Final PID/hash survey: `browser-after-sse-cleanup.log`.

## Actual complete matrix and counters

`summary.json` is passed:true with all 15 grouped checks. Actual `backend.json` and
`fixture.jsonl` agree: **15 model calls = 13 gateway/fixture-gpt + 2 gateway/fixture-replacement**;
parent5, normal child8, recovered child2. **5 searches:** new/warm/reload/cold/recovered.
Retired-model calls0, Kimi sentinel0, external TCP attempts0, external browser requests0,
page exceptions0. **Next dev-only metadata suppressions2**, counted independently (one per
owned Next process); exact npm dist-tags URL + getVersionInfo caller rejected before networking.
No other non-loopback destination permitted. This is fixture tripwire evidence, not an OS sandbox.

| Stage | Actual result | Model/search delta → cumulative | Screenshot |
| --- | --- | --- | --- |
| Parent GPT label; 1280 New sub-agent extensions on/skills off/bounds, no save | PASS | 1/0 → 1/0 | `new-profile-1280.png` |
| Real Agent new explore child, inherited snapshot, standard GPT model_change, delayed search, coding declarations read/grep/find/ls, label | PASS | 4/1 → 5/1 | `child-new-1280.png` |
| Context/SSE release; running:false idle disposal; real Agent same-id warm resume | PASS | 4/1 → 9/2 | warm screenshot below |
| Real reload RPC then browser send/search; page refresh model label | PASS | 2/1 → 11/3 | `child-warm-reload-1280.png` |
| Fresh cold Next; parent running:false; same id/leaf on open; physical historical Kimi not authority; GPT search/refresh at 390 | PASS | 2/1 → 13/4 | `child-cold-390.png` |
| 390 New sub-agent defaults/bounds, actual Settings combobox and exposed sidebar backdrop dismissal | PASS | 0/0 → 13/4 | `new-profile-390.png`, `child-cold-390.png` |
| Bad target actual Send; real pre-connected SSE safe negative ack; explicit target/not-sent, draft restored, full history/result/branch equality; 0 prompt POST / 0 model calls | PASS | 0/0 → 13/4 | `unavailable-draft-390.png` |
| Real mobile picker replacement; HTTP success + standard model_change before retry; no request on set_model; draft kept; user retry searches, refresh label persists | PASS | 2/1 → 15/5 | `explicit-recovery-390.png` |
| Legacy false prompt HTTP409 prompt_rejected/accepted:false; exact old metadata retained, no lifecycle permission/search/request gained | PASS | 0/0 → 15/5 | API + lifecycle audit |
| Final settings byte equality, zero fallback/network counters and page exceptions | PASS | 0/0 → 15/5 | `summary.json`, `acceptance-audit.log` |

Fresh real parent `01a11250-a84c-77e5-bdf8-d86640f3acca`; newly created child
`01a11250-de2b-77e5-bdf8-d869075e126e`. Same-id resume is within this run only, not prior-run reuse.
Unavailable child `01a11250-9baf-7309-b3f6-0028bdb390fa`; legacy false child
`01a11250-9baf-7309-b3f6-002ae840b903`. Isolated SDK fixtures/history were never real user data.

## Actual bad-target SSE refusal and recovery

Real 390px Send with draft `E2E_SEARCH:recovered` returned HTTP200 from GET events, not a
prompt POST. Runner parsed actual response body, verified no connected event, audited zero
prompt POSTs and compared complete SDK branch entries before/after refusal. Actual projected event
is retained in `api.json` and `acceptance-audit.log`:

```json
{"type":"startup_error","errorMessage":"Failed to start agent: Model selection failed","code":"model_selection_failed","prePromptRejected":true,"modelSelection":{"code":"model_selection_failed","reason":"model-unavailable","message":"The selected model is no longer available. Choose another model.","provider":"gateway","modelId":"retired-gpt"}}
```

Actual screenshot `unavailable-draft-390.png`, inspected by this owner, shows old answer,
retained draft and English notice: **“No model request was sent for gateway/retired-gpt.
The selected model is no longer available. Select another model. Your draft was kept;
choose an available model and retry.”** No raw loader/auth/URL diagnostic is shown.
The expected connection refusal is logged in next-cold.log; browser page exception list is empty.

Then genuinely clicked model selector/listbox Fixture replacement. Existing runner asserted
HTTP success, standard SDK model_change, no model request on selection, kept draft, successful
user Send/search and replacement label after refresh. The picker response/model_change snapshot
is asserted at runtime but not separately copied into apiLog by the unchanged runner; do not
misdescribe api.json as containing that response or persisted JSONL files. Recovery screenshot,
actual replacement transcripts/search and successful runner assertions are retained evidence.
Legacy false real HTTP409 remains code:prompt_rejected, accepted:false, with safe
provider-context-unavailable DTO; no session_start for that id, no metadata widening.

**Browser locale was English only.** Three-language pre-POST target/not-sent and negative-ack
countercases belong to supplied SSE82/82 tests, not three-locale browser execution. Likewise,
same-ID catalog/scope/barrier race11/11 is separate deterministic SDK evidence; this single
browser matrix does not independently exercise/prove all race schedules.

## Isolation, ownership and precise finally cleanup

Unique outer HOME `/var/tmp/pi-subagent-browser-home.aD5Jm4XL`, all four XDG state/config/data/
cache variables unset before `/home/xupeng/.pi/agent/bin/pi-tmp-run --keep-on-failure`.
Outer HOME-local TMPDIR; inner workspace
`.cache/pi-tmp/shared/subagent-model-browser-7ssksrn2`, HOME/PI_CODING_AGENT_DIR and isolated
project/ancestors beneath it, inner cache per existing plan. `NO_UPDATE_NOTIFIER=1` and
`npm_config_update_notifier=false` set. Existing facade uses tiny config copies and source/deps
symlinks; no big copy, `/tmp` runtime or external credentials/config. Installed Chromium only:
`/home/xupeng/.cache/assistant-check-browser/manual/chrome-linux/headless_shell`; no download.

Outer shell1260008, wrapper1260011, inner/runner/backend owner PID=PGID1260016.
Warm Next PID=PGID1260025, worker1260042, port38465; cold Next PID=PGID1260690,
worker1260721, port36449. Browser PID=PGID1260075, parent1260016, observed while alive with
its exact subprocess ownership. `services.json` retains cwd/app/source/log ownership.
Finally browser.close, backend.closeAllConnections/close and exact spawned Next PGID TERM/KILL
were awaited; no port lookup/broad kill. All successful traces discarded, no failure trace/video
created. Formal evidence copied before deleting the sole outer HOME (log: exists=no).

Final survey found **none of the captured owned PID/PGID members remaining**. Other-task
8505 leader1118376/server1118396 and deployed26812 leader1005786/server1005816 unchanged;
30141 untouched. No install/build/deploy/commit/push/archive/SDK lock or real settings change.
Runner/fixture, AGENTS.md, tsconfig/package/lock SHA256 identical before/after;
next-env.d.ts absent and no candidate .next/dev/lock. Only owned research logs/artifacts and
this report were written; no automatic generated candidate edits were included.

Artifacts: api.json, complete backend.json, fixture.jsonl, next-warm/cold.log, runner.log,
services.json, summary.json, acceptance-audit.log and **7 successful screenshots**. Audit is
post-run read-only reconstruction/assertion of recorded evidence, not a second browser run.

Remaining untested here: **real plugins, real pi-sub2api, real search service/native-search
request hooks, Safari, Windows, live/paid providers**. Public native faux + direct late-search
fixture exercises the real Next/Turbopack/API/SSE/SDK host, not those real compatibility claims.
Controlled native hooks13/13 and broader safety/concurrency suites remain separate supplied
coverage. Task status/final delivery decision stays with main; no archive/status edit here.

---

# Historical after-auth fresh Chromium acceptance — BLOCKED at unavailable-model real Send

Latest actual run: **2026-10-06 17:11:31–17:12:49 UTC, exit 1; NOT a complete pass**.
**PRE-P2-FIX SNAPSHOT, not final product acceptance.** After this run had already finished and
cleaned up, the main owner reported a proven final-getAvailable race: public native registration
retains same id while changing scope alias/baseURL, allowing stale scope/model to authorize a
now-excluded target. A final selection consistency fence + countertest is pending. This browser
run did not cover that race and cannot prove its resolution. No further retry/new run is started;
a later fresh final browser run must wait for the final-scope fence correction and readiness.
Fresh browser owner; no historical harness child resumed, no agent spawned. Sole worktree:
`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`.
User supplied latest product-ready confirmation (after-auth tsc/lint/2984 tests and focused 69).
Those gates are not this owner's checks. Read browser-report/native-auth-readiness/browser-plan
and both e2e files completely, then ran the **unchanged** existing runner with `E2E_PRODUCT_READY=1`.
No product, lib test, docs, task status or e2e source edited; no key/delay/retry/fallback workaround.

Formal evidence: **`subagent-model-selection-browser-2026-10-06T17-11-31-724Z/`**.
Outer command log: `browser-after-auth-fresh-20261006T171131Z.log`.
Cleanup/hash survey: `browser-after-auth-cleanup.log`.

## Exact blocking countercase: SSE startup refusal before prompt POST

New/warm/reload/cold all passed; the prior native keyless auth blocker did not recur in this run.
At 390px, genuinely clicked Send on unavailable child
`01a11232-f715-7270-bdff-877f3397121b`, draft `E2E_SEARCH:recovered`, selected
`gateway/retired-gpt`, with the old physical Kimi answer visible.
The real browser creates/connects SSE before it dispatches prompt. That startup rejects the
unavailable model. Trace records HTTP 200 `text/event-stream` from
`/api/agent/<id>/events`, containing exactly:

```text
:

data: {"type":"startup_error","errorMessage":"Failed to start agent: The selected model is no longer available. Choose another model."}
```

Actual browser console: `AgentEventConnectionError` with that same message. Actual toast,
extracted from the failure trace as `unavailable-startup-notice-390.jpeg`, says:
**“Failed to start agent: The selected model is no longer available. Choose another model.”**
It does **not** explicitly say the message was not sent, and carries no safe target/reason DTO.
The real draft is visibly restored/preserved and old answer remains visible (both this frame and
`failure.png`). No prompt POST was made for this child: the trace contains two GET events,
GET agent state, and a cleanup lease POST, not POST agent prompt.
Runner correctly stopped, timing out at line 392's expected prompt response; did not retry Send.

Two distinct issues must not be conflated:

1. **Actual product UX gap:** cold SSE startup failure bypasses the typed prompt-error display;
   user gets generic startup failure, not explicit not-sent/target messaging. This is runtime
   screenshot + SSE evidence, not merely a source assertion. Read-only lead: send awaits
   `ensureEventsConnected` before prompt; `formatModelSelectionError` only accepts
   `AgentCommandError`, while this path throws `AgentEventConnectionError`. Main owner must
   decide/correct the safe typed startup-failure boundary without relaxing auth/selection gates.
2. **Runner calibration needed if SSE refusal is the intended contract:** its unavailable Send
   helper assumes every rejection has a prompt POST. A legal future helper should accept the
   actual definitive pre-dispatch SSE refusal while still asserting explicit not-sent UI, draft,
   exact history/branch equality and zero new provider calls. Merely accepting the current generic
   toast or starting the runtime via direct API would hide the UX gap. No helper/source patch was
   applied here; no complete pass can be obtained by only loosening the POST expectation.

## Latest actual reached matrix and counters

Counts reconstructed from actual `backend.json`, corroborated by `fixture.jsonl`; audit in
`countercase-audit.log`. All 13 requests are native `gateway/fixture-gpt` to literal loopback.
Parent **5**, child **8**. Replacement/retired model requests **0**. Search **4** (new/warm/reload/cold).
Kimi sentinel **0**; external TCP attempts **0**; external browser routes **0**; page exceptions **0**.
Exact Next HMR npm dist-tags pre-dispatch suppressions **2**, counted separately (one per process).

| Stage | Actual result | Model/search counts (stage / cumulative) | Screenshot |
| --- | --- | --- | --- |
| Parent GPT label; 1280 new form extensions on/skills off, no save | PASS | 1/0 → 1/0 | `new-profile-1280.png` |
| New explore child, inherited snapshot, delayed search, real coding declarations read/grep/find/ls, explicit standard GPT model_change + label | PASS | 4/1 → 5/1 | `child-new-1280.png` |
| Idle disposal then same-id Agent warm resume | PASS | 4/1 → 9/2 | warm group screenshot below |
| Real extension reload, send/search, browser refresh label | PASS | 2/1 → 11/3 | `child-warm-reload-1280.png` |
| New Next cold, parent unopened, same id/leaf on open, physical Kimi does not authorize; GPT search + refresh at 390 | PASS | 2/1 → 13/4 | `child-cold-390.png` |
| 390 form defaults/bounds, real Settings combobox, real exposed drawer backdrop closes sidebar | PASS (previously unexecuted helper now genuinely executed) | 0/0 → 13/4 | `new-profile-390.png`, `child-cold-390.png` |
| Unavailable target real Send | BLOCKED by SSE startup UX/POST-expectation countercase; actual zero new calls and visibly retained draft/old answer | 0/0 → 13/4 | `unavailable-startup-notice-390.jpeg`, `failure.png` |
| Exact unavailable history/result/branch equality and complete not-sent assertion group | NOT EXECUTED after response wait blocked | — | No successful stage screenshot |
| Real replacement picker/standard model_change/retry/refresh persistence | NOT REACHED | replacement 0 | None |
| Legacy false policy exact non-widening | NOT REACHED | — | None |
| Final settings byte equality / end-of-run safety assertion group | NOT REACHED | observed counters above, not claimed final assertion pass | None |

Real parent: `01a11233-03b1-7106-91fb-41643b4ba98a`; newly created child:
`01a11233-399f-7106-91fb-4167b9472a57`. No prior-run child reused.

## Isolation, owned processes, artifacts and finally cleanup

Unique outer HOME `/var/tmp/pi-subagent-browser-home.UxIa4YuA`; unset all four XDG state/config/
data/cache variables before `/home/xupeng/.pi/agent/bin/pi-tmp-run`. Outer TMPDIR was
`$HOME/.cache/pi-tmp`; inner workspace
`.cache/pi-tmp/shared/subagent-model-browser-v9w3haom`, with its own HOME/agent/resources/project.
Inner cache matches plan. `npm_config_update_notifier=false NO_UPDATE_NOTIFIER=1` were set for
CLI metadata; existing Next fixture retains its separate exact URL + getVersionInfo caller guard.
Installed Chrome only: `/home/xupeng/.cache/assistant-check-browser/manual/chrome-linux/headless_shell`.
Tiny facade/source/dependency symlinks only; no big copies or `/tmp`, no product API/SSE mocks.

Ownership: outer shell **1246060**, pi-tmp wrapper **1246063**, inner shell PID=PGID **1246064**,
runner/backend owner **1246065**. Next warm PID=PGID **1246074**, server **1246106**, port **37345**;
cold PID=PGID **1246594**, server **1246623**, port **38635**. Browser PID=PGID **1246136**, parent
runner 1246065, captured while alive; its subprocesses remain in that owned group. Services'
exact cwd/app/source/log paths retained in `services.json`. Next stopped only via its precise
spawned groups, browser closed via owned Playwright object, backend closeAllConnections/close
awaited in runner finally. No broad/port-based kill. No other service started.

Runner copied logs/screenshots/JSON and failure-only trace to formal research **before** outer
trap deleted HOME, including the retained-on-failure workspace. Outer log says exit 1 and HOME
absent. Final survey found none of the above owned PID/PGID members. Other-task/original
1118376/1118396 and deployed 1005816 remained unchanged; 8505/26812/30141 untouched.
`AGENTS.md`, tsconfig/package/lock hashes unchanged; `next-env.d.ts` initially absent and remains
absent; no candidate `.next/dev/lock`. E2e SHA256 unchanged. No automatic config/root-AGENTS
edits included. No install/build/deploy/commit/push/archive/login/real configuration/paid request.

Artifacts include `api.json`, full actual `backend.json`, `fixture.jsonl`, `next-warm.log`,
`next-cold.log`, `runner.log`, `services.json`, `summary.json`, six screenshots plus extracted
actual toast frame, `failure-trace.zip`, and `countercase-audit.log`. No video. Successful traces
discarded; only failure trace retained. Extracted toast frame is original trace JPEG, not a new
browser run or synthetic image.

Unrun here: **real plugins, real pi-sub2api, native-backend integration, Safari, Windows,
live/paid providers**. Direct late-search fixture is not real native-search/plugin coverage.
Controlled native request/stream-hook 13/13 is separately supplied evidence, not rerun or expanded
by this browser owner. Core safety/concurrency suites remain separate from this browser matrix.

---

# Historical after-review fresh Chromium acceptance — BLOCKED by intermittent auth refusal

Date: 2026-10-06. Fresh owner/session `01a11212-bd54-7540-97bf-c49c06b0be9e`; no harness child agent resumed or spawned. Only worktree
`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`, branch
`feat/subagent-model-selection`. **Full browser acceptance is NOT complete.** The prior absolute-source
blocker did not recur in these four runs; a new real `auth-unavailable` refusal stopped the last run.
No further retry was made after that refusal. Main owner's supplied tsc/lint/2961-tests results are
not this browser owner's verification and are not substituted for missing browser cases.

## Current blocker: exact request, response and real provider transcript

Latest formal evidence: `subagent-model-selection-browser-2026-10-06T16-43-48-680Z/`.

- Isolated settings explicitly enable the UNMOVED global absolute fixture file
  `<worktree>/e2e/fixtures/subagent-model-selection.mjs`, scope `gateway/**`, packages `[]`.
  Empty isolated auth `{}` is deliberate: public SDK `fauxProvider` supplies its own native auth
  resolver (`{ auth: {} }`). There are no real credentials or paid/model/search destinations.
- Real parent id: `01a11219-a4af-73bb-b883-9c296f947acb`. Browser POST
  `/api/agent/01a11219-a4af-73bb-b883-9c296f947acb` with
  `{ "type": "prompt", "message": "E2E_DELEGATE_NEW" }` returned HTTP **200**
  `{ "success": true, "data": null }`: this is parent admission, NOT child success.
- Actual gateway parent emitted `Agent` with
  `{ "subagent_type": "explore", "description": "E2E inherited child", "prompt": "E2E_SEARCH:new", "run_in_background": false }`.
  Next really loaded the independent child extension factory. No child session_start/provider
  request/search followed. The real toolResult in `backend.json` call index 2 has `isError:true`:

  ```json
  {
    "toolName": "Agent",
    "content": [{"type":"text","text":"No configured authentication for the selected model's provider."}],
    "details": {"modelSelection": {
      "code": "model_selection_failed", "reason": "auth-unavailable",
      "message": "No configured authentication for the selected model's provider.",
      "provider": "gateway", "modelId": "fixture-gpt"
    }},
    "isError": true
  }
  ```

- Parent's third real GPT response displayed that refusal; `failure.png` shows it. Browser timed
  out waiting for the search answer, correctly not treating parent HTTP 200 as child completion.
- Counts: **3 parent gateway/fixture-gpt calls; child 0; search 0; Kimi 0; external TCP attempts 0;
  blocked browser routes 0; browser page exceptions 0; dev-only metadata suppressions 1**.
  Exact evidence: `api.json`, `backend.json`, `fixture.jsonl`, `next-warm.log`, `failure.png`,
  `failure-trace.zip`, `services.json`, `summary.json`, `runner.log`.

This is intermittent across fresh runs: two preceding independent HOMEs/processes reached new,
warm/reload and cold GPT/search with the same native provider fixture. No auth file was added,
no configured-auth gate mocked, no delay inserted before product selection, and no retry of the
failed delegation was used to make this a pass. Requires product/SDK owner investigation.
Read-only lead, NOT a proven root cause: `resolveConcreteModel` checks synchronous
`hasConfiguredAuth` before scope resolution; SDK `ModelRuntime.hasConfiguredAuth` reads an
availability snapshot, while `registerNativeProvider` starts `void refresh({allowNetwork:false})`.
Child services also await an explicit offline refresh. Whether overlapping refresh generations
can leave that snapshot transiently unconfigured remains unproven by this browser run. The
fixture is public native faux (same auth resolver in every run); do not bypass with synthetic keys.

## Actual reached matrix — distinguish earlier execution from last run

No row below claims full acceptance or success of a matrix not reached.

| Case | Earlier after-review actual execution | Latest run |
| --- | --- | --- |
| Parent GPT label 1280; new form extensions on/skills off | PASS each run; real controls, no save | PASS |
| New inherited explore child, GPT/search, snapshot/label | PASS runs 2/3; global absolute fixture unchanged | BLOCKED auth-unavailable before child request |
| Coding declarations read/grep/find/ls + delayed web_search | PASS runs 2/3, actual provider `system.toolsAdded` and get_tools assertions | NOT REACHED |
| Same-id Agent resume after idle disposal | PASS runs 2/3; GET running:false before genuine Agent resume | NOT REACHED |
| Real extension reload + send + browser refresh label | PASS runs 2/3 | NOT REACHED |
| New process cold direct child; parent unopened; historical physical Kimi ignored | PASS assertions before form in runs 2/3: same id/leaf on open, GPT selected, real cold search and refresh | NOT REACHED |
| 390px default form/bounds (not saved) | PASS assertions/screenshot run 3; subsequent sidebar-close helper failed | NOT REACHED |
| Full cold/mobile stage including sidebar dismissal and final screenshot | INCOMPLETE: desktop tab helper run 2; occluded toolbar toggle helper run 3 | NOT REACHED |
| Unavailable model real Send/not-sent/draft/history/zero calls | NOT REACHED in any run | NOT REACHED |
| Real picker replacement/standard model_change/retry/refresh | NOT REACHED in any run | NOT REACHED |
| Old false policy does not widen | NOT REACHED in any run | NOT REACHED |
| Final global settings equality/end-of-run safety assertions | NOT REACHED in any run | NOT REACHED |

Run 2 child `01a11216-4212-705a-9b65-64ab36f1f976`; run 3 child
`01a11218-3054-7472-8dd1-372027f354a1`. Each was created in its own fresh HOME, only then
resumed within that run for the intended warm matrix. No child from a prior run was reused.
The runner's `passedChecks` marks only completed grouped stages; cold assertions completed
before checkForm errors, so the logs/transcripts plus source ordering are the evidence for
those narrower cold rows, not a claim that the whole cold/mobile group passed.

## Four fresh attempts and honest network accounting

All evidence folders below use prefix `subagent-model-selection-browser-2026-10-06T`.
All model calls are literal-loopback native gateway/fixture-gpt. Run 1 has one blocked Next HMR
TCP attempt, NOT a model/search call. It made no external connection; it did not pass the strict
end-of-run guard. Runs 2–4 use the precise framework isolation described next.

| Evidence suffix | Exit / result | Parent + child model calls | Search | Kimi | TCP blocked | Dev-only suppressed |
| --- | --- | --- | --- | --- | --- | --- |
| 16-38-22-419Z | 1; SDK discovery helper used non-recursive custom-dir overload | 3 + 2 = 5 | 1 new | 0 | 1 Next metadata | 0 |
| 16-39-53-101Z | 1; 390 Settings uses combobox, not desktop tab | 5 + 8 = 13 | 4 new/warm/reload/cold | 0 | 0 | 2 |
| 16-41-58-928Z | 1; mobile sidebar occludes toolbar Hide sidebar | 5 + 8 = 13 | 4 new/warm/reload/cold | 0 | 0 | 2 |
| 16-43-48-680Z | 1; REAL auth-unavailable blocker, stopped | 3 + 0 = 3 | 0 | 0 | 0 | 1 |

### Framework-specific fixture (not a product API/SSE mock)

Read actual Next 16.3.6 `hot-reloader-shared-utils.js` and Turbopack caller. No offline version
switch exists in that function; telemetry/product skip-version flags do not suppress it.
`SUBAGENT_MODEL_NEXT_DEV_OFFLINE=1` affects only the test preload. It locally throws before
Undici networking **only** when URL is exactly
`https://registry.npmjs.org/-/package/next/dist-tags` AND stack identifies
`next/dist/server/dev/hot-reloader-shared-utils.js` + `getVersionInfo`. Next's own catch returns
unknown staleness. It records URL/stack as `dev-only-update-suppressed` (counts above); no fake
registry response, installation, network allowance or product output is supplied.

First global-fetch wrapper was ineffective because Next replaces fetch with bundled polyfills;
the retained run-1 stack proves that. Final narrow fixture wraps the existing Undici Agent's
PUBLIC dispatch, not any SDK auth/runtime/model API. All other dispatches are unchanged and
still encounter the Socket non-loopback tripwire. Model/search destinations remain loopback
validated; Kimi sentinel remains fatal. Final safety expectation is zero external TCP attempts
and zero non-loopback browser routes, while explicitly reporting dev-only suppressed attempts
separately. This is a test tripwire, not an OS sandbox/full packet capture guarantee.

### Legal helper corrections and their remaining execution boundary

- SDK `SessionManager.listAll(customDir)` lists files directly within that directory, not its
  nested cwd dirs. Changed to public no-argument `listAll()` with already-isolated agentDir;
  runs 2/3 discover/assert the real child. No product API was added or mocked.
- Mobile Settings: use its actual visible `combobox` labelled Settings and select Sub-agents.
  Run 3 executed this, asserted defaults and control bounds, saved `new-profile-390.png`.
- Sidebar: mobile drawer covers toolbar toggle; final helper clicks the actual visible backdrop
  at exposed x=380/y=400 then waits for closed state, never force-clicks or mutates React state.
  **This corrected dismissal has NOT executed yet**: run 4 blocked earlier. Static checks pass,
  but its downstream mobile/unavailable/picker cases still require a fresh retry after product ready.
- Added actual provider transcript assertions for coding declarations, and summary counters /
  passed stages. Global absolute fixture was never relocated into fake agentDir. No product edit.

## Commands, precise process ownership and artifacts

First inherited TMPDIR verified before work: `/home/xupeng/.cache/pi-tmp/01a11212-bd54-7540-97bf-c49c06b0be9e`.
Never used for validation. First process survey recorded unrelated Next server PIDs 1005816 /
1118396 and dev leader 1118376 (8505); none was operated on.
Each runtime command first cd'd the worktree and used exactly this shape:

```sh
SANDBOX_HOME=$(mktemp -d --tmpdir=/var/tmp pi-subagent-browser-home.XXXXXXXX)
trap 'rm -rf -- "$SANDBOX_HOME"' EXIT
env -u XDG_STATE_HOME -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME \
  HOME="$SANDBOX_HOME" TMPDIR="$SANDBOX_HOME/.cache/pi-tmp" \
  /home/xupeng/.pi/agent/bin/pi-tmp-run --keep-on-failure subagent-model-browser -- bash -c '
    cd /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection
    export HOME="$PI_TASK_TMPDIR/home" PI_CODING_AGENT_DIR="$PI_TASK_TMPDIR/home/.pi/agent"
    export XDG_CACHE_HOME="$PI_TASK_TMPDIR/cache" E2E_PRODUCT_READY=1
    export PLAYWRIGHT_EXECUTABLE_PATH=/home/xupeng/.cache/assistant-check-browser/manual/chrome-linux/headless_shell
    printf "INNER TMPDIR=%s PI_TASK_TMPDIR=%s HOME=%s PID=%s\n" "$TMPDIR" "$PI_TASK_TMPDIR" "$HOME" "$$"
    node e2e/subagent-model-selection.mjs
  '
```

Each runner keeps the previous legal tiny Next facade: real route directories/file symlinks,
source/dependency symlinks, only small package/tsconfig copies; no .pi/AGENTS ancestor links,
no large copy, no /tmp runtime. Public Next dev directory + isolated project spawn cwd;
ctx.cwd asserted in real lifecycle. No video; failure-only traces copied before outer deletion.

| Outer HOME suffix / runner PID | Exact Next PID=PGID / phase port | Inner workspace suffix |
| --- | --- | --- |
| ttrMNSN8 / 1227541 | 1227551 warm 38909 | subagent-model-browser-7vany4kj |
| XU38hn7v / 1228290 | 1228306 warm 40029; 1228903 cold 35691 | subagent-model-browser-fkwtoxzz |
| E1qvAP74 / 1229973 | 1229984 warm 35331; 1230684 cold 45945 | subagent-model-browser-l8hum8og |
| HpCTp1up / 1232160 | 1232168 warm 42109 | subagent-model-browser-hgvc7jy4 |

Exact full cwd/app/log/source for each is retained in its `services.json` and `runner.log`;
`next-warm.log`/`next-cold.log` are copied formal logs. Browser/backend are owned objects in
runner, closed in finally; no port-based kill. Finally TERM/KILL touches only exact spawned
Next groups; backend closeAllConnections/close and browser.close are awaited, logs flushed,
then all results copied to formal research before deleting the sole outer HOME (including
retained-on-failure cache). Browser PID was not separately captured; lifecycle ownership is
through this runner's launched Playwright browser, not discovery/pkill.

Screenshots: runs 2/3 `child-new-1280.png`, `child-warm-reload-1280.png`, `new-profile-1280.png`;
run 3 `new-profile-390.png` is a real successful form assertion. No successful
`child-cold-390.png`, unavailable/recovery screenshots exist yet. Latest `failure.png` shows
actual auth refusal; earlier failure screenshot/trace shows the legitimate locator issue.

## Static verification and cleanup

After all source helper edits, final two `node --check` commands and focused ESLint
`--max-warnings=0 e2e/subagent-model-selection.mjs e2e/fixtures/subagent-model-selection.mjs`
exit **0**, 0 errors/warnings; focused diff check exit **0**. No full test/tsc/build rerun by this
owner; product stays untouched. `browser-fresh-validation.log` records final commands/cleanup.
Edits used apply_patch-compatible shell function backed by patch -p1, exact Python-generated
unified hunks; no helper/patch file installed or left behind.

Final survey: all four unique outer HOMEs absent; no own Next groups, browser or runner survives.
Other-task leader/server PIDs 1118376/1118396 and deployed server 1005816 unchanged. Candidate
AGENTS.md/next-env.d.ts/tsconfig.json/package.json/package-lock.json status remains empty.
No original checkout WIP edits, deploy, true config/auth/history/model/search operation, install,
SDK/lock changes, commit/push/archive or next build.

Uncovered: **Safari, Windows, live/paid providers, real pi-sub2api plugin and native-search
request hooks**. This is public native faux + synthetic direct late web_search through the real
Next/API/SSE/SDK host, not a claim of real plugin/native-search coverage. Concurrent cold
set_model, noExtensions provider-only lifecycle, trust/revoke/allow/deny/nested safety remain
core test responsibilities; this browser run does not replace them. Bad-model Send/explicit
picker/old false/final settings checks MUST still be executed once the new blocker is resolved.

---

## Historical prior-owner report (superseded status; retained evidence)

# Fresh Chromium acceptance — BLOCKED by real product refusal

Date: 2026-10-06, fresh owner (no old child resume). Worktree:
`/home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection`,
branch `feat/subagent-model-selection`. **Not a pass and not complete acceptance.**
Product-ready confirmation was supplied by the parent; final full tests belong to that owner.

## Reproduced product blocker — do not move fixture to bypass

Last run evidence directory: `subagent-model-selection-browser-2026-10-06T15-42-52-934Z/`.

1. Fake HOME/agentDir settings explicitly enabled the absolute local extension file
   `<worktree>/e2e/fixtures/subagent-model-selection.mjs`, no packages, no credentials.
   Native `gateway/fixture-gpt` is registered factory-ready through public fauxProvider API.
   models.json is valid `{ "providers": {} }` (not the earlier invalid empty-object fixture).
2. Real Chromium opened persisted parent `01a111e1-db39-7218-b5f2-a0f1ea380aec`.
   Browser POST `/api/agent/01a111e1-db39-7218-b5f2-a0f1ea380aec`:
   `{ "type": "prompt", "message": "E2E_DELEGATE_NEW" }`.
   Response HTTP 200 `{ "success": true, "data": null }` confirms parent admission only.
3. Actual local faux parent requested tool `Agent` with
   `{subagent_type:"explore", description:"E2E inherited child", prompt:"E2E_SEARCH:new", run_in_background:false}`.
   Child factory and awaited session_start really ran: child id
   `01a111e2-1008-7218-b5f2-a0f29bf59839`; ctx.cwd and Node process cwd were both
   `/var/tmp/pi-subagent-browser-home.9Z5XouBf/.cache/pi-tmp/shared/subagent-model-browser-n7iwkhqb/project`.
4. Agent tool result had `isError:true`, text
   `The saved provider source is no longer valid. Choose a model to continue.` and details:

   ```json
   {"modelSelection":{"code":"model_selection_failed","reason":"provider-source-invalid","message":"The saved provider source is no longer valid. Choose a model to continue.","provider":"gateway","modelId":"fixture-gpt"}}
   ```

5. Parent then generated a real faux reply displaying the refusal. No child model request/search
   ran. The browser expected an actual local search marker and timed out, not a mocked success.

Narrow likely cause, based on read-only product inspection:
`lib/rpc-manager.ts:827–835` reauthorizes captured sources even for inherited extensions;
`lib/subagent-provider-sources.ts:165–166` selects
`info.packageRoot ?? info.baseDir ?? agentDir` for a global source and requires containment.
The globally enabled absolute-file extension is outside the fake agentDir although the SDK
discovery and independent child factory successfully loaded that explicitly enabled file.
Do not relocate it into agentDir or substitute another provider to make this pass: parent must
coordinate the product correction and ask for a fresh retry. No product files edited here.

Exact evidence: `api.json` contains request/response; `backend.json` contains the real Agent
call result in the third provider transcript; `fixture.jsonl` contains lifecycle/cwd/counters;
`next-warm.log`, `failure.png` and `failure-trace.zip` retain runtime/browser diagnostics.

## Actual matrix (last run)

| Case | Result |
| --- | --- |
| Real Next/API/SDK parent initial turn | PASS, loopback native gateway request |
| Chromium 1280 parent explicit model label | PASS, Fixture GPT |
| 1280 Settings → Sub-agents → New sub-agent | PASS, extensions checked, skills unchecked, viewport bounds; no save |
| New explore child | FAIL before its first provider request: provider-source-invalid |
| Delayed search execution/new child model label | NOT REACHED |
| Idle shutdown + same-id Agent warm resume | NOT REACHED |
| Extension reload + browser refresh | NOT REACHED |
| Cold process, no parent, physical historical Kimi ignored | NOT REACHED |
| 390 profile defaults/label/layout | NOT REACHED |
| Unavailable selection Send/refusal/draft/history preservation | NOT REACHED |
| Explicit UI set_model persistence/retry/reload | NOT REACHED |
| Legacy false fail-closed without permission widening | NOT REACHED |
| Global settings final equality | NOT REACHED |

Last-run counters: gateway/fixture-gpt **3** model requests, all parent; child **0**;
loopback search **0**; Kimi sentinel **0**; real/non-loopback model/search connections **0**.
Browser page exceptions/blocked external browser routes are in summary.json; this does not
claim total external connection attempts were zero (see next section).

Screenshots in last-run directory: `new-profile-1280.png` (successful actual form assertion),
`failure.png` (actual parent showing Agent refusal). No mobile screenshot exists.
Safari, Windows, live/paid providers, real pi-sub2api and native-search request hooks untested.

## Fixture/host calibration and remaining host risk

Only e2e files and browser-plan/report/evidence were changed. Node process.cwd is no longer
asserted at factory; real session_start asserts SDK ctx.cwd against SUBAGENT_MODEL_PROJECT.

To guarantee default-cwd resource isolation independent of Next cwd changes, runner builds a
tiny temporary Next facade using unchanged candidate source symlinks (real route directories,
individual route-file symlinks). No .pi/AGENTS/real ancestor resources are linked. Dependencies
and source trees are not copied; package.json and tsconfig.json are small temporary copies.
The facade imports candidate next.config.ts and widens both public bundler/tracing roots to `/`
for resolving the symlink graph. This changes source resolution only, not product resource CWD.
Spawn cwd is the fake project, app directory is separate, SDK ctx.cwd is asserted as fake project.
Factory/session logs show process.cwd actually stayed fake project in the successful host runs.

Legal calibrations: settings tab label is **Sub-agents**, not Agents; models.json requires a
providers object. PI_WEB_SKIP_VERSION_CHECK=1 disables the separate product update check.
No API/SSE/selection/policy/tool response was mocked.

Remaining host risk: Next HMR itself fetches
`https://registry.npmjs.org/-/package/next/dist-tags` on its dev WebSocket connection.
TCP tripwire rejected the attempt before connection; fixture.jsonl stack identifies
`next/dist/server/dev/hot-reloader-shared-utils.js:getVersionInfo` via getVersionInfoCached.
This is not a provider/search request or installation. Nevertheless the runner requires zero
blocked-network events and would fail that final safety assertion. A retry must suppress only
this dev HMR metadata path via a legal public browser/Next mechanism; never allow non-loopback
connections or weaken model/search zero-request assertions. No such workaround is implemented
or claimed tested in this handoff.

## Commands and attempts

Every run used this exact shape, with a new unique outer HOME:

```sh
cd /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection
SANDBOX_HOME=$(mktemp -d --tmpdir=/var/tmp pi-subagent-browser-home.XXXXXXXX)
trap 'rm -rf -- "$SANDBOX_HOME"' EXIT
env -u XDG_STATE_HOME -u XDG_CONFIG_HOME -u XDG_DATA_HOME -u XDG_CACHE_HOME \
  HOME="$SANDBOX_HOME" TMPDIR="$SANDBOX_HOME/.cache/pi-tmp" \
  /home/xupeng/.pi/agent/bin/pi-tmp-run --keep-on-failure subagent-model-browser -- bash -c '
    cd /home/xupeng/dev/personal/forked/agegr-pi-web-worktrees/subagent-model-selection
    export HOME="$PI_TASK_TMPDIR/home" PI_CODING_AGENT_DIR="$PI_TASK_TMPDIR/home/.pi/agent"
    export XDG_CACHE_HOME="$PI_TASK_TMPDIR/cache" E2E_PRODUCT_READY=1
    export PLAYWRIGHT_EXECUTABLE_PATH=/home/xupeng/.cache/assistant-check-browser/manual/chrome-linux/headless_shell
    node e2e/subagent-model-selection.mjs
  '
```

| Attempt / evidence timestamp | Exit | Own Next PID/PGID / port | Actual result |
| --- | --- | --- | --- |
| 15-36-02-950Z | 1 | 1209812 / 32813 | No Chromium; tracing/bundler root mismatch, host startup failed |
| 15-36-23-704Z | 1 | 1209904 / 33041 | No Chromium; symlink app directory not route-discovered |
| third, outer 180wdp5v | 1 | none | No service/browser; attempted hardlink route files hit EXDEV; changed to individual symlinks |
| 15-39-09-527Z | 1 | 1210737 / 34471 | Chromium ran; outdated Agents locator; screenshot shows Sub-agents |
| 15-41-35-686Z | 1 | 1211556 / 45159 | Chromium ran; same source refusal, additionally invalid `{}` models.json shown; fixture corrected |
| 15-42-52-934Z | 1 | 1212041 / 44579 | Chromium ran; valid config reproduces product blocker described above |

The five timestamped evidence directories retain logs/counters; failed Chromium runs retain
trace only on failure. The early EXDEV stack is recorded here, not a product/runtime result.
Next panic logs are now copied by runner when present; first panic detail is retained in its
next-warm.log (the separate initial panic file was not copied before cleanup).

Final static checks, after fixture calibrations: both `node --check` commands exit **0**;
`node_modules/.bin/eslint --max-warnings=0 e2e/subagent-model-selection.mjs e2e/fixtures/subagent-model-selection.mjs`
exit **0**, no errors/warnings; focused `git diff --check` exit **0**. No full gates claimed here.

## Cleanup and excluded automatic edits

Finally closed browser/backend, terminated only each exact own Next process group, flushed logs,
copied failure artifacts to research, then the outer shell trap deleted its unique HOME.
Process check found no owned groups/browser still running. All six outer directories removed:
eFVD34n2, g4B9vc0u, 180wdp5v, sApeRsmK, joMYJKCe, 9Z5XouBf.
Original 8505 PID 1118396 and deployed 26812 PID 1005816 still listen unchanged; 30141 absent.
No port-based kill, /tmp runtime, browser download, video, deploy, next build, commit/push,
SDK/lock change, real configuration/history edit or notification-center WIP edit.

Next automatic AGENTS/next-env/tsconfig changes are not product deliverables: candidate
`git status --short -- AGENTS.md next-env.d.ts tsconfig.json` remained empty after all runs.
Any Next-generated files in the unique facade were temporary and deleted, not restored over
user edits. The symlink app approach prevented candidate automatic AGENTS pollution.
