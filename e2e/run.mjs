// Adapted from @Nuctori's script-style CI/E2E fixtures in PR #617 (issue #599).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { appendFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { checkFilePanel, filePanelFixture } from "./file-panel.mjs";
import { checkExtensionDialogs, extensionSource } from "./extension-dialog.mjs";
import { checkChatAppearance, checkChatColumnAlignment, checkMinimapTypography } from "./chat-appearance.mjs";
import { ASK_USER_SESSION, checkAskUserView, writeAskUserFixture } from "./ask-user.mjs";
import { checkSessionRestore } from "./session-restore.mjs";
import { STATUS_TAIL_SESSION, checkStatusTailFollow, statusTailEntries } from "./status-tail.mjs";
import { CODEMODE_SESSION, QUEUE_SESSION, codemodeEntries, checkMcpCodemode, checkHistoryEdit, checkExtensionQueues, checkTouchEnter } from "./upstream-interactions.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mode = process.env.E2E_SERVER_MODE || "dev";
assert.ok(mode === "dev" || mode === "start", "E2E_SERVER_MODE must be dev or start");
assert.ok(mode !== "dev" || !existsSync(join(root, ".next/dev/lock")), "Use a checkout without an active dev server");
// Diagnostic selection never replaces the unfiltered npm run test:e2e gate.
const checkGroup = process.env.E2E_CHECK_GROUP || "full";
assert.ok(["full", "interactive", "touch"].includes(checkGroup), "E2E_CHECK_GROUP must be full, interactive or touch");
if (checkGroup !== "full") console.log(`TARGETED: ${checkGroup} checks only; not the complete e2e gate`);
const selectedWidth = process.env.E2E_VIEWPORT_WIDTH ? Number(process.env.E2E_VIEWPORT_WIDTH) : null;
assert.ok(selectedWidth === null || selectedWidth === 1280 || selectedWidth === 390, "E2E_VIEWPORT_WIDTH must be 1280 or 390");
const viewports = [{ width: 1280, height: 800 }, { width: 390, height: 844 }]
  .filter(viewport => checkGroup !== "touch" && (selectedWidth === null || viewport.width === selectedWidth));
const artifacts = join(root, "test-results/e2e");
mkdirSync(artifacts, { recursive: true });
const agentDir = mkdtempSync(join(tmpdir(), "pi-web-e2e-"));
const project = join(agentDir, "project");
const sessionDir = join(agentDir, "sessions", "e2e");
mkdirSync(project);
const previewFile = join(project, "preview.html");
writeFileSync(previewFile, filePanelFixture);
mkdirSync(sessionDir, { recursive: true });
const timestamp = "2026-08-23T00:00:00.000Z";
const LONG = "e2e-long-session";
const BRANCH = "e2e-branch-session";
const RICH = "e2e-rich-session";
const COMPACTED = "e2e-compacted-session";
const APPEND = "e2e-external-append-session";
const TYPO = "e2e-typography-session";
const ASK_USER = ASK_USER_SESSION;
const STATUS_TAIL = STATUS_TAIL_SESSION;
const text = (i) => `E2E message ${String(i).padStart(4, "0")}`;
const ids = (start, end) => Array.from({ length: end - start }, (_, i) => `e${start + i}`);

function message(id, parentId, role, content) {
  return { type: "message", id, parentId, timestamp, message: { role, content } };
}

function writeSession(id, entries) {
  const header = { type: "session", version: 3, id, timestamp, cwd: project };
  writeFileSync(join(sessionDir, `2026-08-23T00-00-00-000Z_${id}.jsonl`),
    [header, ...entries].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

let server;
let serverExited;
let browser;
let page;
let context;
let serverError;
const serverLog = createWriteStream(join(artifacts, "server.log"));
const interrupt = () => {
  process.exitCode = 1;
  server?.kill("SIGTERM");
  void browser?.close().catch(() => {});
};
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

try {
  // Seed before startup so the first catalogue scan sees every fixture.
  mkdirSync(join(agentDir, "extensions"));
  writeFileSync(join(agentDir, "extensions", "e2e-dialog.js"), extensionSource);
  const longEntries = Array.from({ length: 5000 }, (_, i) =>
    message(`e${i}`, i ? `e${i - 1}` : null, i % 2 ? "assistant" : "user", text(i)));
  longEntries.splice(1, 0, message("alternate", "e0", "user", "E2E alternate history branch"));
  writeSession(LONG, longEntries);
  writeSession(BRANCH, [
    message("root", null, "user", "Branch root"),
    message("old", "root", "assistant", "Inactive branch answer"),
    message("new", "root", "assistant", "Active branch answer"),
  ]);
  const toolResult = message("result", "call", "toolResult", [{ type: "text", text: "E2E tool output" }]);
  Object.assign(toolResult.message, { toolCallId: "t1", toolName: "bash", isError: false });
  const richEntries = [
    message("user", null, "user", "Render **E2E markdown**"),
    message("call", "user", "assistant", [
      { type: "thinking", thinking: "" },
      { type: "thinking", thinking: "E2E intermediate reasoning\nIntermediate thinking details." },
      { type: "text", text: "E2E process paragraph.\n\n".repeat(20) },
      { type: "toolCall", id: "t1", name: "bash", arguments: { command: "echo E2E tool output" } },
    ]),
    toolResult,
    message("answer", "result", "assistant", [
      { type: "thinking", thinking: "" },
      { type: "thinking", thinking: "E2E follow-up reasoning\nFollow-up thinking details." },
      { type: "text", text: "E2E process note" },
      { type: "thinking", thinking: "E2E final reasoning\nFinal thinking details." },
      { type: "text", text:
        "E2E final answer\n```js\nconsole.log('E2E code');\n```\n\n"
        + "E2E answer paragraph.\n\n".repeat(20)
        + "## E2E reading position\n\n"
        + "E2E answer paragraph.\n\n".repeat(20),
      },
    ]),
  ];
  Object.assign(richEntries.at(-1).message, { provider: "test", model: "E2E Model" });
  writeSession(RICH, richEntries);
  // The default page is 50 *visible* messages (user / assistant / compaction).
  // toolResults ride along free after #810, so 48 tool-call assistants + the
  // final answer + the divider fill that window; the user prompt is the 51st
  // visible entry and must stay outside the first page.
  const compactedEntries = [
    message("user", null, "user", "E2E prompt outside the compacted page"),
    { type: "compaction", id: "compact", parentId: "user", timestamp, summary: "E2E compaction anchor", firstKeptEntryId: "user", tokensBefore: 100 },
  ];
  for (let i = 0; i < 48; i++) {
    compactedEntries.push(message(`call${i}`, compactedEntries.at(-1).id, "assistant", [
      { type: "toolCall", id: `t${i}`, name: "bash", arguments: { command: `echo step${i}` } },
    ]));
    const result = message(`result${i}`, `call${i}`, "toolResult", [{ type: "text", text: `step${i}` }]);
    Object.assign(result.message, { toolCallId: `t${i}`, toolName: "bash", isError: false });
    compactedEntries.push(result);
  }
  compactedEntries.push(message("answer", "result47", "assistant", [{ type: "text", text:
    "E2E compacted answer paragraph.\n\n".repeat(20)
    + "## E2E compacted heading\n\n"
    + "E2E compacted answer paragraph.\n\n".repeat(20),
  }]));
  writeSession(COMPACTED, compactedEntries);
  writeSession(APPEND, [
    message("root", null, "user", "E2E wrapper root"),
    message("reply", "root", "assistant", "E2E wrapper reply"),
  ]);
  // Minimap preview typography needs one heading-only answer (all three levels),
  // one paragraph-only answer, a user prompt and a tool call in the same
  // conversation, and enough content that the rail is visible.
  writeSession(TYPO, [
    message("typo-user", null, "user", "E2E typography question"),
    message("typo-answer", "typo-user", "assistant", [{ type: "text", text: "E2E typography paragraph line.\n\n".repeat(120) }]),
    message("typo-user-2", "typo-answer", "user", "E2E typography headings question"),
    message("typo-call", "typo-user-2", "assistant", [
      { type: "toolCall", id: "typo-t1", name: "bash", arguments: { command: "echo typo" } },
    ]),
    message("typo-answer-2", "typo-call", "assistant", [{ type: "text", text: [
      "# E2E typography h1",
      "## E2E typography h2",
      "### E2E typography h3",
      "E2E typography tail paragraph.\n\n".repeat(120),
    ].join("\n\n") }]),
  ]);
  // ask_user browser coverage needs no model and no wrapper: the state route
  // falls back to the persisted open ask when the wrapper is gone, so a plain
  // page.goto renders the shared view. The ask commands are stubbed in the
  // check itself.
  writeSession(ASK_USER, [
    message("root", null, "user", "E2E ask user root"),
    message("reply", "root", "assistant", "E2E ask user reply"),
  ]);
  writeAskUserFixture(agentDir, ASK_USER);
  writeSession(STATUS_TAIL, statusTailEntries());
  writeSession(CODEMODE_SESSION, codemodeEntries(message));
  writeSession(QUEUE_SESSION, [
    message("queue-root", null, "user", "AC6 queue fixture prompt"),
    message("queue-answer", "queue-root", "assistant", "AC6 queue fixture answer"),
  ]);

  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), mode, "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_WEB_PASSWORD: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.once("error", (error) => { serverError = error; });
  serverExited = once(server, "exit");
  server.stdout.pipe(serverLog, { end: false });
  server.stderr.pipe(serverLog, { end: false });

  async function api(path, status = 200) {
    const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, status, path);
    return response.json();
  }

  async function post(path, body) {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    assert.ok(response.ok, `POST ${path} -> ${response.status}`);
    return response.json();
  }

  const deadline = Date.now() + 120_000;
  while (true) {
    if (serverError) throw serverError;
    assert.equal(server.exitCode, null, "Server exited before readiness; see server.log");
    const response = await fetch(`${base}/api/sessions`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (response?.ok) {
      const { sessions } = await response.json();
      assert.deepEqual(sessions.map((session) => session.id).sort(), [LONG, BRANCH, RICH, COMPACTED, APPEND, ASK_USER, TYPO, STATUS_TAIL, CODEMODE_SESSION, QUEUE_SESSION].sort());
      break;
    }
    assert.ok(Date.now() < deadline, "Server readiness timed out; see server.log");
    await delay(250);
  }

  const detail = await api(`/api/sessions/${LONG}?deferThinking=1&deferMedia=1`);
  assert.deepEqual(detail.context.entryIds, ids(4950, 5000));
  assert.equal(detail.context.messages.length, 50);
  assert.equal(detail.context.hasMore, true);
  assert.ok(JSON.stringify(detail).length < 100_000, "Detail transferred unbounded history");
  const tail = await api(`/api/sessions/${LONG}/context?tail=50`);
  assert.deepEqual(tail.context.entryIds, ids(4950, 5000));
  assert.equal(tail.context.messages.length, 50);
  const selectedBranch = await api(`/api/sessions/${BRANCH}/context?leafId=old`);
  assert.deepEqual(selectedBranch.context.entryIds, ["root", "old"]);
  const rootPage = await api(`/api/sessions/${BRANCH}/context?before=old&tail=1`);
  assert.deepEqual(rootPage.context.entryIds, ["root"]);
  assert.equal(rootPage.context.hasMore, false);
  const beforeRoot = await api(`/api/sessions/${BRANCH}/context?before=root`);
  assert.deepEqual(beforeRoot.context.entryIds, []);
  assert.equal(beforeRoot.context.hasMore, false);
  await api("/api/sessions/e2e-does-not-exist", 404);
  await api("/api/files/..%2F..%2Fetc%2Fpasswd?type=read", 403);
  const compacted = await api(`/api/sessions/${COMPACTED}`);
  assert.equal(compacted.context.entryIds[0], "compact");
  assert.equal(compacted.context.messages.some((entry) => entry.role === "user"), false);
  console.log("PASS: bounded history, branch context, pagination root, and API errors");

  // #632 regression: a live wrapper shadows the session file. Ordinary reads
  // keep that snapshot (two processes writing one JSONL is unsupported). A
  // mount/refresh GET (?force=1) must see the external append and stay stable.
  {
    const file = join(sessionDir, `2026-08-23T00-00-00-000Z_${APPEND}.jsonl`);
    await post(`/api/agent/${APPEND}`, { type: "get_state" });
    const beforeAppend = await api(`/api/sessions/${APPEND}`);
    assert.deepEqual(beforeAppend.context.entryIds, ["root", "reply"], "the wrapper must serve its own snapshot first");
    appendFileSync(file, `${JSON.stringify(message("external", "reply", "assistant", "E2E external append"))}\n`);
    const ordinaryRead = await api(`/api/sessions/${APPEND}`);
    assert.deepEqual(ordinaryRead.context.entryIds, ["root", "reply"], "post-turn reads must not probe disk");
    assert.equal(ordinaryRead.wrapperRebuilt, undefined);
    const afterForce = await api(`/api/sessions/${APPEND}?force=1`);
    assert.deepEqual(afterForce.context.entryIds, ["root", "reply", "external"], "a mount/refresh read must see the external append");
    assert.equal(afterForce.wrapperRebuilt, true);
    const again = await api(`/api/sessions/${APPEND}`);
    assert.deepEqual(again.context.entryIds, ["root", "reply", "external"], "repeated reads must stay stable");
    const appended = await api(`/api/sessions/${APPEND}/context?tail=1`);
    assert.deepEqual(appended.context.entryIds, ["external"], "the appended entry must be readable on its own");
    console.log("PASS: external session-file appends are visible on force/mount reads");
  }

  // Cold Turbopack compilation can consume the browser's entire 30s response
  // budget before hydration even starts. Prepare only HTTP routes, then retain
  // the original browser/status assertions against this exact isolated server.
  const warmStarted = Date.now();
  const document = await fetch(`${base}/?session=${LONG}`, { signal: AbortSignal.timeout(120_000) });
  assert.equal(document.status, 200, "Candidate document HTTP preflight");
  await document.text();
  const statePreflight = await fetch(`${base}/api/sessions/${LONG}/state`, { signal: AbortSignal.timeout(120_000) });
  assert.equal(statePreflight.status, 200, "Candidate state HTTP preflight");
  await statePreflight.json();
  console.log(`HTTP preflight ${base}: document/state 200 in ${Date.now() - warmStarted}ms`);

  browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {});
  for (const viewport of viewports) {
    context = await browser.newContext({ viewport, locale: "en-US" });
    await context.tracing.start({ screenshots: true, snapshots: true });
    page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    const olderResponses = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (event) => { if (event.type() === "error") errors.push(event.text()); });
    page.on("response", (response) => {
      if (response.url().startsWith(base) && response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
      const url = new URL(response.url());
      if (url.pathname === `/api/sessions/${LONG}/context` && url.searchParams.has("before")) olderResponses.push(response);
    });
    // Independent AC6 fixtures run first so a retained legacy failure cannot
    // prevent collecting their evidence. The full legacy checks still follow.
    await checkMcpCodemode(page, { base, artifacts, width: viewport.width });
    await checkExtensionQueues(page, { base, artifacts, width: viewport.width });
    await checkHistoryEdit(page, { base, artifacts, width: viewport.width });
    if (checkGroup === "interactive") {
      // A retained history-node failure can prevent later smoke checks running.
      // This explicitly selected diagnostic group does not waive that failure.
      await page.goto(`${base}/?session=${RICH}`, { waitUntil: "domcontentloaded" });
      await page.locator(".markdown-code-block pre").waitFor();
      await checkFilePanel(page, previewFile);
      await checkExtensionDialogs(page, artifacts, viewport.width);
      await checkAskUserView(page, { base, sessionId: ASK_USER });
      await checkStatusTailFollow(page, { base, sessionId: STATUS_TAIL, expectWrap: viewport.width <= 600 });
      if (viewport.width > 600) {
        await checkSessionRestore(page, {
          base, sessionId: RICH, staleSessionId: ASK_USER,
          // The smoke path can leave this long answer at its reading tail.
          // Verify the whole fixture answer, not an offscreen code sub-block.
          marker: "[data-entry-id='answer']:not([data-message-role])", artifactsDir: artifacts,
        });
        await page.goto(`${base}/?session=${RICH}`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-entry-id='answer']:not([data-message-role])").waitFor();
        await page.locator(".chat-content .scrollbar-subtle").evaluate(scroll => { scroll.scrollTop = 0; });
        await page.locator(".markdown-code-block pre").waitFor();
        await checkChatAppearance(page);
      }
      assert.deepEqual(errors, [], `Browser errors in targeted interactive group at width ${viewport.width}`);
      console.log(`PASS: TARGETED ${viewport.width}px file panel, dialogs, ask, status tail and applicable restore/appearance`);
      await context.tracing.stop({ path: join(artifacts, `trace-${viewport.width}.zip`) });
      await context.close();
      context = undefined;
      page = undefined;
      continue;
    }
    const [, stateResponse] = await Promise.all([
      page.goto(`${base}/?session=${LONG}`, { waitUntil: "domcontentloaded" }),
      page.waitForResponse((response) => new URL(response.url()).pathname === `/api/sessions/${LONG}/state`),
    ]);
    assert.equal(stateResponse.status(), 200);
    await page.getByText(text(4999), { exact: true }).waitFor();
    const longGeometry = await checkChatColumnAlignment(page, `${viewport.width}px long conversation`);
    assert.equal(longGeometry.scrollable, true);
    await page.locator(".chat-content .scrollbar-subtle").evaluate((scroll) => { scroll.scrollTop = scroll.scrollHeight; });
    const scrolledGeometry = await checkChatColumnAlignment(page, `${viewport.width}px scrolled conversation`);
    assert.deepEqual(scrolledGeometry.message, longGeometry.message, "Scrolling must not move the message column sideways");
    assert.deepEqual(scrolledGeometry.composer, longGeometry.composer, "Scrolling must not move the composer sideways");
    if (viewport.width > 600) {
      const originalViewport = page.viewportSize();
      await page.setViewportSize({ width: 800, height: 800 });
      await checkChatColumnAlignment(page, "800px narrow desktop conversation");
      await page.setViewportSize(originalViewport);
    }
    const latestUser = await page.getByText(text(4998), { exact: true }).elementHandle();
    assert.ok(latestUser, "Latest user message must be mounted before pagination");
    const sentinel = page.getByText("Scroll up to load earlier messages", { exact: true });
    await sentinel.waitFor({ state: "attached" });
    assert.equal(await page.getByText(text(4949), { exact: true }).count(), 0);

    // Exercise the real IntersectionObserver and prepend path, twice.
    for (let turn = 0; turn < 2; turn++) {
      const responsePromise = page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/sessions/${LONG}/context`);
      const requestPromise = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return url.pathname === `/api/sessions/${LONG}/context` && url.searchParams.has("before");
      });
      const scrollToSentinel = () =>
        sentinel.evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
      // The sentinel's IntersectionObserver is installed by an effect, so a single
      // instant scroll can land before the app is listening (a cold dev server needs
      // seconds to become interactive, and then no request is ever made). Re-issue the
      // scroll until the fetch starts, then stop so no duplicate page is requested.
      const nudge = setInterval(() => { void scrollToSentinel().catch(() => {}); }, 750);
      try {
        await scrollToSentinel();
        await requestPromise;
      } finally {
        clearInterval(nudge);
      }
      const response = await responsePromise;
      const older = (await response.json()).context;
      const firstMessage = older.messages.find((message) => message.role === "user")?.content;
      assert.equal(typeof firstMessage, "string", "Older page must contain user messages");
      await page.getByText(firstMessage, { exact: true }).waitFor({ state: "attached" });
      await page.getByText(text(4999), { exact: true }).evaluate((element) => element.scrollIntoView({ block: "end", behavior: "instant" }));
    }
    const latestUserState = await latestUser.evaluate((element) => ({
      connected: element.isConnected,
      text: element.textContent,
    }));
    if (!latestUserState.connected) {
      // This assertion has failed intermittently (once in seven local runs after the
      // upstream sync, never pre-merge). Dump enough to tell the two mechanisms apart:
      // empty data-entry-id values mean the render fell back to index keys, which shift
      // when older pages are prepended, while a matching node with a real entry id
      // means the list container was recreated instead.
      const diagnostic = await page.evaluate(() => {
        const labelled = Array.from(document.querySelectorAll("[data-entry-id]"));
        const matches = Array.from(document.querySelectorAll("div")).filter((node) => node.textContent === "E2E message 4998");
        return {
          labelledNodes: labelled.length,
          emptyIds: labelled.filter((node) => !node.getAttribute("data-entry-id")).length,
          matchesWithText: matches.length,
          matchEntryIds: matches.slice(0, 3).map((node) => node.closest("[data-entry-id]")?.getAttribute("data-entry-id") ?? null),
        };
      });
      console.log(`DIAG prepended history detached the latest user node: ${JSON.stringify(diagnostic)}`);
    }
    assert.deepEqual(latestUserState, { connected: true, text: text(4998) }, "Prepending history must preserve existing message nodes");
    await latestUser.dispose();
    assert.ok(olderResponses.length >= 2, "Scrolling must fetch consecutive older pages");
    let oldest = Number(new URL(olderResponses[0].url()).searchParams.get("before")?.slice(1));
    assert.ok(Number.isInteger(oldest), "Older page must include a numeric before cursor");
    for (const response of olderResponses) {
      assert.equal(response.status(), 200);
      assert.equal(new URL(response.url()).searchParams.get("before"), `e${oldest}`);
      const older = (await response.json()).context;
      assert.deepEqual(older.entryIds, ids(oldest - 50, oldest));
      assert.equal(older.messages.length, 50);
      oldest -= 50;
      assert.equal(older.oldestEntryId, `e${oldest}`);
      assert.equal(older.hasMore, true);
    }
    // The sidebar also displays the first message as the session title.
    const mountedMessages = async () => (await page.getByText(/^E2E message \d{4}$/).allTextContents())
      .filter((value) => value !== text(0));
    const expectedMessages = Array.from({ length: 5000 - oldest }, (_, i) => text(oldest + i));
    const beforeCatchUp = await mountedMessages();
    // ChatWindow keeps the render window at least as large as the loaded messages
    // (components/ChatWindow.tsx:667-672), but only after that effect has flushed, so the
    // DOM legitimately lags the page that was just prepended. Wait for the oldest loaded
    // message to be mounted instead of reading the window mid-flush.
    await page.getByText(text(oldest), { exact: true }).waitFor({ state: "attached" });
    const rendered = await mountedMessages();
    if (beforeCatchUp.length !== rendered.length) {
      console.log(`PASS: history render window caught up (${beforeCatchUp.length} → ${rendered.length} of ${expectedMessages.length})`);
    }
    // The retry above stops as soon as a request is seen, but a nudge that was already
    // scheduled can still land one more page after the responses were counted, so the
    // window may be *longer* than the pages recorded in `olderResponses`. Assert what the
    // app actually guarantees: the mounted messages are a contiguous suffix of the session
    // that covers at least every page this test paged in. Gaps, duplicates, reordering, and
    // a window that lost the pages the test loaded all still fail.
    const suffixStart = 5000 - rendered.length;
    assert.ok(suffixStart > 0 && suffixStart <= oldest,
      `Rendered history must cover the paged-in range (window starts at ${suffixStart}, paged to ${oldest})`);
    assert.deepEqual(rendered, Array.from({ length: rendered.length }, (_, i) => text(suffixStart + i)),
      "Missing, reordered, or duplicate chat messages");
    await page.screenshot({ path: join(artifacts, `history-${viewport.width}.png`) });

    if (viewport.width > 600) {
      // Minimap preview typography (AC1/AC3/AC4): the rail is only hittable on a
      // scrollable session, so this probe runs on the dedicated TYPO fixture.
      await page.goto(`${base}/?session=${TYPO}`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-entry-id='typo-answer-2'] h1").waitFor();
      await checkMinimapTypography(page, `${viewport.width}px minimap preview`, "E2E typography question");
    }

    await page.goto(`${base}/?session=${BRANCH}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Active branch answer", { exact: true }).waitFor();
    const shortGeometry = await checkChatColumnAlignment(page, `${viewport.width}px short conversation`);
    assert.equal(shortGeometry.scrollable, false);
    assert.equal(shortGeometry.availableWidth - shortGeometry.scrollWidth, viewport.width > 600 ? 24 : 0,
      "The minimap rail must keep its layout slot even when hidden");
    // Compact mobile chrome lets this two-message fixture fit at 300px.
    // Keep the overflow/alignment assertions, using a genuinely short viewport.
    await page.setViewportSize({ width: viewport.width, height: viewport.width > 600 ? 300 : 180 });
    const resizedShortGeometry = await checkChatColumnAlignment(page, `${viewport.width}px short conversation after resize`);
    assert.equal(resizedShortGeometry.scrollable, true, "A short conversation should scroll in a short viewport");
    assert.deepEqual(resizedShortGeometry.message, shortGeometry.message, "Becoming scrollable must not move the message column sideways");
    assert.deepEqual(resizedShortGeometry.composer, shortGeometry.composer, "Becoming scrollable must not move the composer sideways");
    await page.setViewportSize(viewport);
    assert.equal(await page.getByText("Inactive branch answer", { exact: true }).count(), 0);
    const thinkingRequests = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/thinking")) thinkingRequests.push(request.url());
    });
    await page.goto(`${base}/?session=${RICH}`, { waitUntil: "domcontentloaded" });
    await page.locator("strong").filter({ hasText: "E2E markdown" }).waitFor();
    await page.locator("pre").filter({ hasText: "console.log('E2E code');" }).waitFor();
    await page.getByText("E2E final answer", { exact: true }).waitFor();
    const processDetails = page.getByRole("button", { name: /^Process details/ });
    const thinking = page.getByRole("button", { name: /^Thinking/ });
    assert.equal(await processDetails.count(), 1);
    assert.equal(await thinking.count(), 0, "All thinking stays inside process details");
    const finalMessage = page.locator("[data-entry-id='answer']");
    assert.equal(await finalMessage.getByRole("button", { name: /^Thinking/ }).count(), 0);
    assert.equal(await finalMessage.getByText("test/E2E Model", { exact: true }).count(), 1);
    assert.equal(thinkingRequests.length, 0);
    const collapsedGeometry = await checkChatColumnAlignment(page, `${viewport.width}px collapsed process details`);
    await processDetails.click();
    const expandedGeometry = await checkChatColumnAlignment(page, `${viewport.width}px expanded process details`);
    assert.deepEqual(expandedGeometry.message, collapsedGeometry.message, "Growing content must not move the message column sideways");
    assert.deepEqual(expandedGeometry.composer, collapsedGeometry.composer, "Growing content must not move the composer sideways");
    assert.equal(await thinking.count(), 3);
    assert.equal(await thinking.last().innerText(), "E2E final reasoning");
    assert.equal(thinkingRequests.length, 0);
    for (const [index, text] of ["Intermediate thinking details.", "Follow-up thinking details.", "Final thinking details."].entries()) {
      await thinking.nth(index).click();
      await page.getByText(text, { exact: false }).waitFor();
    }
    assert.equal(thinkingRequests.length, 3);
    const processText = await processDetails.locator("..").innerText();
    assert.ok(processText.indexOf("E2E intermediate reasoning") < processText.indexOf("echo E2E tool output"));
    assert.ok(processText.indexOf("echo E2E tool output") < processText.indexOf("E2E follow-up reasoning"));
    assert.ok(processText.indexOf("E2E follow-up reasoning") < processText.indexOf("E2E process note"));
    assert.ok(processText.indexOf("E2E process note") < processText.indexOf("E2E final reasoning"));
    assert.equal(processText.split("E2E final reasoning").length - 1, 1);
    assert.ok(!(await finalMessage.last().innerText()).includes("E2E final reasoning"));
    await page.getByText("echo E2E tool output", { exact: true }).waitFor();
    await page.getByRole("button", { name: /bash.*echo E2E tool output/ }).click();
    await page.getByText("E2E tool output", { exact: true }).waitFor();
    await page.goto(`${base}/?session=${COMPACTED}`, { waitUntil: "domcontentloaded" });
    const heading = page.getByRole("heading", { name: "E2E compacted heading", exact: true });
    await heading.waitFor({ state: "attached" });
    if (viewport.width > 600) {
      // The preview opens from the rail itself, so which tick the pointer lands on does not
      // matter: a tick only exists for an outline row, so the rail's node indices are the outline
      // rows' indices (sparse) rather than a dense 0..n sequence.
      const rail = page.locator(".chat-content .scrollbar-subtle + div");
      await rail.waitFor();
      const rect = await rail.boundingBox();
      assert.ok(rect);
      // Resting the pointer on the rail opens the preview panel; the click also covers the
      // touch-device path, where a tap is the only way in.
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const preview = page.locator("[data-minimap-preview-box]");
      await preview.getByRole("button", { name: "E2E compaction anchor", exact: true }).waitFor();
      await preview.getByRole("button", { name: "E2E compacted heading", exact: true }).click();
      await page.waitForFunction(() => {
        const heading = document.querySelector("[data-entry-id='answer'] h2");
        const scroll = heading?.closest(".overflow-y-auto");
        return heading && scroll && Math.abs(heading.getBoundingClientRect().top
          - scroll.getBoundingClientRect().top - scroll.clientHeight * 0.3) < 5;
      });
      await page.screenshot({ path: join(artifacts, "compaction-minimap.png") });

      const selectSession = async (title, entryId) => {
        await page.locator(`[title="${title}"]`).click();
        await page.locator(`[data-entry-id="${entryId}"]:not([data-message-role])`).waitFor({ state: "visible" });
      };
      const readingOffset = (target) => target.evaluate((element) => (
        element.getBoundingClientRect().top - element.closest(".overflow-y-auto").getBoundingClientRect().top
      ));
      const positionForReading = async (target) => {
        await target.evaluate((element) => {
          const scroll = element.closest(".overflow-y-auto");
          scroll.scrollTop += element.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 120;
        });
        return readingOffset(target);
      };
      const stableHistoryPosition = async (target, pendingRequests) => {
        // A response is not a committed prepend. Moving the sentinel starts a
        // cascade whose captured distance can overwrite this test's positioning.
        // Re-park without weakening the 120px/<5px condition or using sleeps.
        const deadline = Date.now() + 30_000;
        let stableReads = 0;
        while (Date.now() < deadline) {
          await positionForReading(target);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const offset = await readingOffset(target);
          stableReads = pendingRequests.size === 0 && Math.abs(offset - 120) < 5 ? stableReads + 1 : 0;
          if (stableReads === 2) return offset;
        }
        assert.fail("Earlier history must settle at 120px with no pending pages before capturing its reading position");
      };
      await selectSession(text(0), "e4999");
      const pendingOlderRequests = new Set();
      const trackOlderRequest = request => {
        const url = new URL(request.url());
        if (url.pathname === `/api/sessions/${LONG}/context` && url.searchParams.has("before")) pendingOlderRequests.add(request);
      };
      const finishOlderRequest = request => pendingOlderRequests.delete(request);
      page.on("request", trackOlderRequest);
      page.on("requestfinished", finishOlderRequest);
      page.on("requestfailed", finishOlderRequest);
      const olderMessage = page.locator("[data-entry-id='e4920']");
      let olderOffset;
      try {
        await Promise.all([
          page.getByText("Scroll up to load earlier messages", { exact: true }).evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" })),
          page.waitForResponse(response => {
            const url = new URL(response.url());
            return url.pathname === `/api/sessions/${LONG}/context` && url.searchParams.has("before");
          }),
        ]);
        olderOffset = await stableHistoryPosition(olderMessage, pendingOlderRequests);
        console.log(`READING ${viewport.width}px: captured settled older history at ${olderOffset}px`);
      } finally {
        page.off("request", trackOlderRequest);
        page.off("requestfinished", finishOlderRequest);
        page.off("requestfailed", finishOlderRequest);
      }
      await selectSession("Render **E2E markdown**", "user");
      const process = page.getByRole("button", { name: /process details/i });
      await process.click();
      const answerHeading = page.getByRole("heading", { name: "E2E reading position", exact: true });
      const answerOffset = await positionForReading(answerHeading);
      await selectSession(text(0), "e4920");
      assert.ok(Math.abs(await readingOffset(olderMessage) - olderOffset) < 5, "Returning to older history must restore its reading offset");
      await selectSession("Render **E2E markdown**", "user");
      assert.equal(await process.getAttribute("aria-expanded"), "false");
      assert.ok(Math.abs(await readingOffset(answerHeading) - answerOffset) < 5, "Collapsing process details on remount must not displace the answer");

      // Hold pagination until a different branch has loaded, exercising effect cancellation.
      let releaseHistory;
      const historyGate = new Promise((resolve) => { releaseHistory = resolve; });
      const contextRoute = `**/api/sessions/${LONG}/context?*`;
      await page.route(contextRoute, async (route) => {
        if (new URL(route.request().url()).searchParams.has("before")) await historyGate;
        await route.continue().catch(() => {});
      });
      // Context loading is real; avoid starting an agent just to persist the test branch.
      const agentRoute = `**/api/agent/${LONG}`;
      await page.route(agentRoute, (route) => route.fulfill({ json: {} }));
      try {
        const pendingHistory = page.waitForRequest((request) => request.url().includes(`/api/sessions/${LONG}/context?`) && new URL(request.url()).searchParams.has("before"));
        await page.locator(`[title="${text(0)}"]`).click();
        await pendingHistory;
        await page.getByRole("button", { name: "Branches", exact: true }).click();
        await page.getByText("E2E alternate history branch", { exact: true }).click();
        await page.locator("[data-entry-id='alternate']:not([data-message-role])").waitFor({ state: "visible" });
        await page.screenshot({ path: join(artifacts, "scroll-restore-branch.png") });
      } finally {
        releaseHistory();
        await page.unroute(contextRoute);
        await page.unroute(agentRoute);
      }
      console.log("PASS: session reading offsets, collapsed process details, and cancelled branch restoration");
      await page.goto(`${base}/?session=${COMPACTED}`, { waitUntil: "domcontentloaded" });
      await heading.waitFor({ state: "visible" });
    }
    await page.goto(`${base}/?session=${RICH}`, { waitUntil: "domcontentloaded" });
    await page.locator(".markdown-code-block pre").waitFor();
    await checkFilePanel(page, previewFile);
    await checkExtensionDialogs(page, artifacts, viewport.width);
    await checkAskUserView(page, { base, sessionId: ASK_USER });
    await checkStatusTailFollow(page, { base, sessionId: STATUS_TAIL, expectWrap: viewport.width <= 600 });
    if (viewport.width > 600) {
      await checkSessionRestore(page, {
        base,
        sessionId: RICH,
        staleSessionId: ASK_USER,
        marker: ".markdown-code-block pre",
        artifactsDir: artifacts,
      });
      await page.goto(`${base}/?session=${RICH}`, { waitUntil: "domcontentloaded" });
      await page.locator(".markdown-code-block pre").waitFor();
      await checkChatAppearance(page);
    }
    assert.deepEqual(errors, [], `Browser errors at width ${viewport.width}`);
    console.log(`PASS: ${viewport.width}px browser pagination, branch, markdown, code, tool call, and compaction navigation`);
    await context.tracing.stop({ path: join(artifacts, `trace-${viewport.width}.zip`) });
    await context.close();
    context = undefined;
    page = undefined;
  }
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.tracing.start({ screenshots: true, snapshots: true });
  page = await context.newPage();
  await page.goto(`${base}/?session=${BRANCH}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Active branch answer", { exact: true }).waitFor();
  const touchGeometry = await checkChatColumnAlignment(page, "390px touch short conversation");
  // Short coarse-pointer chrome now collapses at 300px, so two messages fit.
  // Use a genuinely overflowing viewport rather than demanding old chrome height.
  await page.setViewportSize({ width: 390, height: 180 });
  const touchScrolledGeometry = await checkChatColumnAlignment(page, "390px touch scrollable conversation");
  assert.equal(touchScrolledGeometry.scrollable, true);
  assert.deepEqual(touchScrolledGeometry.message, touchGeometry.message);
  assert.deepEqual(touchScrolledGeometry.composer, touchGeometry.composer);
  await checkTouchEnter(page, { sessionId: BRANCH, artifacts });
  await context.tracing.stop({ path: join(artifacts, "trace-touch.zip") });
  await context.close();
  context = undefined;
  page = undefined;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  if (page) await page.screenshot({ path: join(artifacts, "failure.png") }).catch(() => {});
  if (context) await context.tracing.stop({ path: join(artifacts, "trace.zip") }).catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    const forceKill = setTimeout(() => server.kill("SIGKILL"), 10_000);
    await serverExited;
    clearTimeout(forceKill);
  }
  serverLog.end();
  rmSync(agentDir, { recursive: true, force: true });
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", interrupt);
}
