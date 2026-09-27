# Design — deterministic history-window assertion

## 1. What the test does today

`e2e/run.mjs:261-292` (per viewport):

1. Opens `?session=e2e-long-session` (5000 alternating `E2E message NNNN` entries plus
   one alternate branch entry) and waits for the newest message.
2. Runs two pagination turns: scroll the "load earlier" sentinel into view, await the
   `/context` response, wait for that page's first user message to be *attached*, then
   scroll back to the newest message.
3. Derives `oldest` from the fetched pages' `before` cursors (asserting entry ids,
   message counts, `oldestEntryId` and `hasMore` for each response).
4. `allTextContents()` over `/^E2E message \d{4}$/` and `deepEqual`s the result against
   `[oldest .. 4999]`.

Step 4 assumes every loaded message is mounted *at that instant*.

## 2. Why it flakes

`components/ChatWindow.tsx:1217` renders `rendered.slice(startIndex)` with
`startIndex` from `getVisibleRenderWindow(rendered.length, visibleCount)`
(`lib/chat-lazy-load.ts:6`), i.e. it mounts the newest `visibleCount` items. The
comment at `components/ChatWindow.tsx:667-672` states the intended invariant — "keep
the rendered window at least as large as what's loaded, so prepended (older) pages
stay visible instead of being sliced off the top" — implemented as
`setVisibleCount((current) => Math.max(current, messages.length))` in an effect keyed
on `messages.length`.

An effect runs after the commit that changed `messages.length`, so between the
prepend and that effect's re-render the DOM is legitimately short by the newest page's
tail. The failing log shows exactly that state: the mounted window started 16 messages
after the oldest loaded one (`/tmp/race-fixed-run2.log`).

Two properties make the bug hard to see and easy to misread:

- It is invisible on a fast machine (the flush wins) and shows up under load.
- When it fails, the message set is a *suffix* of the expectation, which looks like
  dropped data rather than a stale render window.

## 3. Fix

Wait for the invariant before comparing, and keep everything else:

```js
const expected = Array.from({ length: 5000 - oldest }, (_, i) => text(oldest + i));
const mounted = (await page.getByText(/^E2E message \d{4}$/).allTextContents())
  .filter((value) => value !== text(0));
// ChatWindow keeps the render window at least as large as the loaded messages
// (`components/ChatWindow.tsx:667-672`), but only after that effect flushes, so the
// DOM can legitimately lag the prepend that just happened. Wait for the oldest loaded
// message to be mounted instead of reading the window mid-flush.
await page.getByText(text(oldest), { exact: true }).waitFor({ state: "attached" });
const afterWait = ...allTextContents() filter...;
if (mounted.length !== afterWait.length) {
  console.log(`PASS: history render window caught up (${mounted.length} → ${afterWait.length} of ${expected.length})`);
}
assert.deepEqual(afterWait, expected, "Missing, reordered, or duplicate chat messages");
```

Why this one:

- Waiting on `text(oldest)` is precisely the app's documented invariant: once the oldest
  *loaded* entry is mounted, the window covers the whole loaded range, so the strict
  `deepEqual` is valid (R1).
- Playwright's auto-waiting `waitFor` is retried with the test's 30 s default timeout, so
  the assertion becomes deterministic rather than timing-dependent (R2), and a genuine
  regression (window never catching up) still fails, with a clear timeout.
- The `mounted` snapshot taken before the wait is kept only for the diagnostic, which
  turns the race itself into evidence (R4/AC3) at the cost of one extra DOM read.

## 3b. The second race in the same loop (found while verifying §3)

The loop's trigger is a single instant scroll:

```js
await sentinel.evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
const response = await responsePromise;   // e2e/run.mjs:250
```

The sentinel is observed by an `IntersectionObserver` that the app installs in an
effect, and an observer only reports the state it sees once it starts observing. On a
cold `next dev` start (page still compiling; `/api/models` took 2.9 s in the recorded
run) the scroll happens before that effect ran, so nothing is ever requested and the run
times out on `waitForResponse` after 30 s. Evidence: that run's `server.log` contains the
initial `GET /api/sessions/e2e-long-session/context?tail=50` and no `?before=` request at
all.

Fix: re-issue the scroll on an interval until the *request* is observed, then stop:

```js
const requestPromise = page.waitForRequest((request) => {
  const url = new URL(request.url());
  return url.pathname === `/api/sessions/${LONG}/context` && url.searchParams.has("before");
});
const scrollToSentinel = () => sentinel.evaluate(/* same scroll */);
const nudge = setInterval(() => { void scrollToSentinel().catch(() => {}); }, 750);
try {
  await scrollToSentinel();
  await requestPromise;
} finally {
  clearInterval(nudge);
}
const response = await responsePromise;
```

Waiting for the request rather than the response is deliberate: the loop later asserts
that every fetched `before` cursor forms one descending 50-step series, so nudging after
the fetch started could request the same page twice and fail that assertion for the wrong
reason. The interval stops the moment the app is known to be listening.

## 4. Rejected alternatives

- **Weaken to "is a contiguous suffix"**: passes even when a page is dropped from the
  render window, which is the regression the assertion exists for.
- **Wait on a fixed timeout** (`waitForTimeout`): the same coin flip with extra latency.
- **Wait for `messages.length` via `waitForFunction` on app internals**: needs the app to
  expose its loaded count to the page; `text(oldest)` is the same condition observed
  through the DOM.
- **Change `ChatWindow` so the window is never short**: the windowing is intentional and
  the pre-flush state is a legitimate React commit; the test is what assumed otherwise.

## 5. Verification

1. Reproduce: the unmodified assertion's failure is already recorded
   (`/tmp/race-fixed-run2.log`, copied into `research/`).
2. Fixed: run the full e2e suite twice in an isolated worktree (dev mode) — once warm and
   once after removing `.next`, so the cold start exercises the trigger retry — and require
   the history section to pass both times; collect the catch-up diagnostic if it prints.
3. Gates: `tsc`, `lint`, unit suite (unchanged, e2e-only diff).
4. CI on the PR re-runs the whole suite, including the 390 px pass.
