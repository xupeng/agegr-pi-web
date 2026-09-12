import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
assert.ok(!existsSync(join(root, ".next/dev/lock")), "Use a checkout without an active dev server");
const artifacts = join(root, "test-results/e2e-subagents");
mkdirSync(artifacts, { recursive: true });
const agentDir = mkdtempSync(join(tmpdir(), "pi-web-e2e-subagents-"));
const project = join(agentDir, "project");
const sessionDir = join(agentDir, "sessions", "e2e-subagents");
mkdirSync(project);
mkdirSync(sessionDir, { recursive: true });

const timestamp = "2026-09-11T00:00:00.000Z";
const RECORDS_A = "trellis-records-a";
const RECORDS_B = "trellis-records-b";
const EMPTY = "trellis-empty";
const MIXED = "trellis-mixed";
const CHILD = "trellis-built-in-child";
const BUILTIN_ONLY = "trellis-built-in-only";
const BUILTIN_ONLY_CHILD = "trellis-built-in-only-child";
const BRANCH = "trellis-branches";

function entry(id, parentId, role, content, extra = {}) {
  return {
    type: "message",
    id,
    parentId,
    timestamp,
    message: { role, content, timestamp: Date.parse(timestamp), ...extra },
  };
}

function user(id, parentId, content) {
  return entry(id, parentId, "user", content);
}

function assistant(id, parentId, content) {
  return entry(id, parentId, "assistant", content, {
    api: "test",
    provider: "test",
    model: "test",
    stopReason: "toolUse",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  });
}

function trellisCall(id, parentId, callId, prompt) {
  return assistant(id, parentId, [
    { type: "text", text: "Delegating" },
    { type: "toolCall", id: callId, name: "trellis_subagent", arguments: { agent: "trellis-check", prompt } },
  ]);
}

function progressDetails(runId, prompt, status = "succeeded", finalText = `Result ${runId}`, final = true) {
  return {
    kind: "trellis-subagent-progress",
    agent: "trellis-check",
    mode: "single",
    startedAt: Date.parse(timestamp),
    updatedAt: Date.parse(timestamp) + 1000,
    final,
    runs: [{
      id: runId,
      agent: "trellis-check",
      prompt,
      status,
      finalText,
      textTail: `Tail ${runId}`,
      thinkingTail: "",
      stderrTail: "",
      tools: [],
      usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0, ctxTokens: 3, turns: 1 },
    }],
  };
}

function trellisResult(id, parentId, callId, runId, prompt, finalText = `Result ${runId}`) {
  return entry(id, parentId, "toolResult", [{ type: "text", text: finalText }], {
    toolCallId: callId,
    toolName: "trellis_subagent",
    isError: false,
    details: progressDetails(runId, prompt, "succeeded", finalText),
  });
}

function writeSession(id, entries, options = {}) {
  const file = join(sessionDir, `2026-09-11T00-00-00-000Z_${id}.jsonl`);
  const header = {
    type: "session",
    version: 3,
    id,
    timestamp,
    cwd: project,
    ...(options.parentSession ? { parentSession: options.parentSession } : {}),
  };
  writeFileSync(file, [header, ...entries].map((value) => JSON.stringify(value)).join("\n") + "\n");
  return file;
}

const aEntries = [
  user("a-root", null, "Records A session"),
  trellisCall("a-call", "a-root", "a-tool", "Old result beyond page 50"),
  trellisResult("a-result", "a-call", "a-tool", "a-run", "Old result beyond page 50", "A durable result"),
];
let aParent = "a-result";
for (let i = 0; i < 60; i += 1) {
  const id = `a-filler-${i}`;
  aEntries.push(user(id, aParent, `A filler ${i}`));
  aParent = id;
}
writeSession(RECORDS_A, aEntries);
writeSession(RECORDS_B, [
  user("b-root", null, "Records B session"),
  trellisCall("b-call", "b-root", "b-tool", "B prompt"),
  trellisResult("b-result", "b-call", "b-tool", "b-run", "B prompt", "B durable result"),
]);
writeSession(EMPTY, [user("empty-root", null, "Empty session")]);
const mixedPath = writeSession(MIXED, [
  user("mixed-root", null, "Mixed parent session"),
  trellisCall("mixed-call", "mixed-root", "mixed-tool", "Mixed Trellis prompt"),
  trellisResult("mixed-result", "mixed-call", "mixed-tool", "mixed-run", "Mixed Trellis prompt", "Mixed durable result"),
]);
writeSession(CHILD, [
  {
    type: "custom",
    customType: "pi-web:subagent",
    id: "child-meta",
    parentId: null,
    timestamp,
    data: {
      version: 1,
      parentSessionId: MIXED,
      parentSessionPath: mixedPath,
      parentToolCallId: "builtin-call",
      profile: "explore",
      description: "Built-in child",
      task: "Inspect fixtures",
      runInBackground: false,
      createdAt: timestamp,
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    },
  },
  {
    type: "custom",
    customType: "pi-web:subagent-result",
    id: "child-result",
    parentId: "child-meta",
    timestamp,
    data: { version: 1, status: "completed", completedAt: timestamp, result: "done" },
  },
], { parentSession: mixedPath });
const builtinOnlyPath = writeSession(BUILTIN_ONLY, [user("builtin-root", null, "Built-in only parent")]);
writeSession(BUILTIN_ONLY_CHILD, [
  {
    type: "custom",
    customType: "pi-web:subagent",
    id: "builtin-only-meta",
    parentId: null,
    timestamp,
    data: {
      version: 1,
      parentSessionId: BUILTIN_ONLY,
      parentSessionPath: builtinOnlyPath,
      parentToolCallId: "builtin-only-call",
      profile: "explore",
      description: "Built-in only child",
      task: "Inspect built-in behavior",
      runInBackground: false,
      createdAt: timestamp,
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    },
  },
  {
    type: "custom",
    customType: "pi-web:subagent-result",
    id: "builtin-only-result",
    parentId: "builtin-only-meta",
    timestamp,
    data: { version: 1, status: "completed", completedAt: timestamp, result: "done" },
  },
], { parentSession: builtinOnlyPath });
writeSession(BRANCH, [
  user("branch-root", null, "Trellis branch session"),
  user("branch-x", "branch-root", "Branch X choice"),
  trellisCall("branch-x-call", "branch-x", "x-tool", "X prompt"),
  trellisResult("branch-x-result", "branch-x-call", "x-tool", "x-run", "X prompt", "X durable result"),
  user("branch-y", "branch-root", "Branch Y choice"),
  trellisCall("branch-y-call", "branch-y", "y-tool", "Y prompt"),
  trellisResult("branch-y-result", "branch-y-call", "y-tool", "y-run", "Y prompt", "Y durable result"),
  trellisCall("branch-y-live", "branch-y-result", "live-tool", "Live reconnect prompt"),
]);

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
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_WEB_PASSWORD: "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.once("error", (error) => { serverError = error; });
  serverExited = once(server, "exit");
  server.stdout.pipe(serverLog, { end: false });
  server.stderr.pipe(serverLog, { end: false });

  const deadline = Date.now() + 120_000;
  while (true) {
    if (serverError) throw serverError;
    assert.equal(server.exitCode, null, "Server exited before readiness; see server.log");
    const response = await fetch(`${base}/api/sessions`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (response?.ok) {
      const { sessions } = await response.json();
      assert.deepEqual(sessions.map((session) => session.id).sort(), [
        RECORDS_A,
        RECORDS_B,
        EMPTY,
        MIXED,
        CHILD,
        BUILTIN_ONLY,
        BUILTIN_ONLY_CHILD,
        BRANCH,
      ].sort());
      break;
    }
    assert.ok(Date.now() < deadline, "Server readiness timed out; see server.log");
    await delay(250);
  }

  const detailA = await fetch(`${base}/api/sessions/${RECORDS_A}`).then((response) => response.json());
  assert.equal(detailA.context.messages.length, 50);
  assert.equal(detailA.context.messages.some((message) => message.details?.kind === "trellis-subagent-progress"), false);
  assert.equal(detailA.trellisSubagentRecords.records[0].runId, "a-run");
  assert.equal(detailA.trellisSubagentRecords.leafValid, true);
  console.log("PASS: records older than page 50 are included in the bounded detail projection");

  browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {});
  for (const device of [
    { viewport: { width: 1280, height: 800 }, hasTouch: false },
    { viewport: { width: 744, height: 1133 }, hasTouch: true },
    { viewport: { width: 390, height: 844 }, hasTouch: false },
  ]) {
    const { viewport, hasTouch } = device;
    context = await browser.newContext({ viewport, hasTouch, locale: "en-US" });
    await context.addInitScript((targetSession) => {
      const OriginalEventSource = window.EventSource;
      class MockEventSource {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSED = 2;
        readyState = 1;
        onmessage = null;
        onerror = null;
        constructor(url) {
          this.url = String(url);
          if (!this.url.includes(`/api/agent/${targetSession}/events`)) {
            return new OriginalEventSource(url);
          }
          window.__trellisMockSources ??= [];
          window.__trellisMockSources.push(this);
        }
        close() {
          this.readyState = 2;
        }
      }
      window.EventSource = MockEventSource;
      window.__emitTrellisAgentEvent = (event, index = -1) => {
        const sources = window.__trellisMockSources ?? [];
        // Target the source the app currently maintains: upstream closes and
        // reopens selected-session streams, so an earlier mock source may be
        // discarded even though its onmessage is still assigned.
        const open = sources.filter((source) => source.readyState === 1);
        const source = index < 0 ? open.at(-1) ?? sources.at(-1) : sources[index];
        source?.onmessage?.({ data: JSON.stringify(event) });
      };
      window.__failTrellisAgentEvent = () => {
        const sources = window.__trellisMockSources ?? [];
        const open = sources.filter((source) => source.readyState === 1);
        const source = open.at(-1) ?? sources.at(-1);
        source?.onerror?.(new Event("error"));
      };
    }, BRANCH);
    page = await context.newPage();
    page.setDefaultTimeout(30_000);
    const errors = [];
    const requests = [];
    const branchCommands = [];
    let branchRunning = false;
    let intentional404 = false;
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (event) => {
      if (
        event.type() === "error"
        && !(intentional404 && /status of 404/.test(event.text()))
      ) errors.push(event.text());
    });
    page.on("request", (request) => requests.push(request.url()));
    await page.route(`**/api/sessions/${BRANCH}/state`, (route) => route.fulfill({
      json: branchRunning
        ? { running: true, state: { isStreaming: true, isPromptRunning: false, isCompacting: false } }
        : { running: false },
    }));
    await page.route(`**/api/agent/${BRANCH}`, (route) => {
      if (route.request().method() === "POST") {
        try { branchCommands.push(route.request().postDataJSON()); } catch { /* ignore malformed fixture commands */ }
      }
      return route.fulfill({
        json: { running: branchRunning, state: branchRunning ? { isStreaming: true, isPromptRunning: false } : undefined },
      });
    });
    // Upstream keeps the selected session's SSE warm via a lease. The SSE
    // itself is mocked, so the server never holds a lease; report renewed:0 so
    // the app's lifecycle-resume path reopens the stream deterministically.
    await page.route(`**/api/agent/${BRANCH}/lease`, (route) => route.fulfill({
      json: { success: true, renewed: 0 },
    }));

    const openAgents = async (expectTrellis = true) => {
      const button = page.getByRole("button", { name: "Agents", exact: true });
      if (viewport.width <= 600 && await button.count() === 0) {
        await page.locator("[data-mobile-toolbar-more='true']").click();
      }
      await button.waitFor();
      if (await button.getAttribute("aria-pressed") !== "true") await button.click();
      if (expectTrellis) await page.locator("[data-trellis-subagent-records='true']").waitFor();
      return button;
    };
    const openBranches = async () => {
      const button = page.getByRole("button", { name: "Branches", exact: true });
      if (viewport.width <= 600 && await button.count() === 0) {
        await page.locator("[data-mobile-toolbar-more='true']").click();
      }
      await button.waitFor();
      if (await button.getAttribute("aria-pressed") !== "true") await button.click();
    };

    await page.goto(`${base}/?session=${RECORDS_A}`, { waitUntil: "domcontentloaded" });
    await page.getByText("A filler 59", { exact: true }).waitFor();
    const recordsOnlyButton = await openAgents();
    assert.match(await recordsOnlyButton.innerText(), /1/);
    const recordsOnlyRow = page.getByRole("button", { name: /trellis-check .* Succeeded/ });
    await recordsOnlyRow.focus();
    await recordsOnlyRow.press("Enter");
    await page.getByText("A durable result", { exact: true }).waitFor();
    assert.equal(await page.getByText("No matching agents", { exact: true }).count(), 0);
    await page.screenshot({ path: join(artifacts, `records-only-${viewport.width}.png`) });

    await page.goto(`${base}/?session=${MIXED}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Mixed parent session", { exact: true }).last().waitFor({ state: "attached" });
    const mixedButton = await openAgents();
    assert.match(await mixedButton.innerText(), /2/);
    await page.getByText("Built-in child", { exact: true }).waitFor();
    await page.getByRole("button", { name: /trellis-check .* Succeeded/ }).waitFor();
    await page.getByText("Built-in child", { exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get("session") === CHILD);
    await page.goto(`${base}/?session=${MIXED}`, { waitUntil: "domcontentloaded" });
    await openAgents();
    await page.screenshot({ path: join(artifacts, `mixed-${viewport.width}.png`) });

    await page.goto(`${base}/?session=${BUILTIN_ONLY}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Built-in only parent", { exact: true }).last().waitFor();
    const builtinOnlyButton = await openAgents(false);
    assert.match(await builtinOnlyButton.innerText(), /1/);
    await page.getByText("Built-in only child", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-trellis-subagent-records='true']").count(), 0);
    await page.screenshot({ path: join(artifacts, `built-in-only-${viewport.width}.png`) });

    await page.goto(`${base}/?session=${EMPTY}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Empty session", { exact: true }).last().waitFor();
    if (viewport.width <= 600) {
      await page.locator("[data-mobile-toolbar-more='true']").click();
    }
    assert.equal(await page.getByRole("button", { name: "Agents", exact: true }).count(), 0);
    if (viewport.width === 744) {
      assert.equal(
        await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
        true,
        "744px touch emulation must expose a coarse primary pointer",
      );
      const textarea = page.locator(".chat-input-textarea");
      await textarea.fill("tablet first line");
      await textarea.press("Enter");
      await textarea.type("tablet second line");
      assert.equal(await textarea.inputValue(), "tablet first line\ntablet second line");
      await textarea.fill("");
    }

    await page.goto(`${base}/?session=${BRANCH}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Delegating", { exact: true }).last().waitFor();
    await openAgents();
    await page.getByRole("button", { name: /trellis-check .* Succeeded/ }).click();
    await page.getByText("Y durable result", { exact: true }).waitFor();
    await openBranches();
    await page.getByText("Branch X choice", { exact: true }).click();
    await page.locator("[data-entry-id='branch-x']:not([data-message-role])").waitFor();
    await openAgents();
    await page.getByRole("button", { name: /trellis-check .* Succeeded/ }).click();
    await page.getByText("X durable result", { exact: true }).waitFor();
    assert.equal(await page.getByText("Y durable result", { exact: true }).count(), 0);

    if (viewport.width > 600) {
      // A -> B -> A with B's stale detail response released last.
      await page.goto(`${base}/?session=${RECORDS_A}`, { waitUntil: "domcontentloaded" });
      await page.getByText("A filler 59", { exact: true }).waitFor();
      let releaseB;
      let sawB;
      const bGate = new Promise((resolve) => { sawB = resolve; });
      const bRelease = new Promise((resolve) => { releaseB = resolve; });
      const bRoute = `**/api/sessions/${RECORDS_B}?*`;
      await page.route(bRoute, async (route) => {
        sawB();
        await bRelease;
        await route.continue().catch(() => {});
      });
      await page.locator(`[title="Records B session"]`).click();
      await bGate;
      await page.locator(`[title="Records A session"]`).click();
      await page.getByText("A filler 59", { exact: true }).waitFor();
      releaseB();
      await delay(300);
      await openAgents();
      await page.getByRole("button", { name: /trellis-check .* Succeeded/ }).click();
      await page.getByText("A durable result", { exact: true }).waitFor();
      assert.equal(await page.getByText("B durable result", { exact: true }).count(), 0);
      await page.unroute(bRoute);

      // A late 404/finally from an unmounted B request cannot clear A.
      let releaseB404;
      let sawB404;
      const b404Seen = new Promise((resolve) => { sawB404 = resolve; });
      const b404Release = new Promise((resolve) => { releaseB404 = resolve; });
      await page.route(bRoute, async (route) => {
        sawB404();
        await b404Release;
        await route.fulfill({ status: 404, json: { error: "Session not found" } }).catch(() => {});
      });
      await page.locator(`[title="Records B session"]`).click();
      await b404Seen;
      await page.locator(`[title="Records A session"]`).click();
      await page.getByText("A filler 59", { exact: true }).waitFor();
      intentional404 = true;
      const failedBResponse = page.waitForResponse((response) => (
        response.status() === 404 && response.url().includes(`/api/sessions/${RECORDS_B}`)
      ));
      releaseB404();
      await failedBResponse;
      await openAgents();
      const restoredARecord = page.getByRole("button", { name: /trellis-check .* Succeeded/ });
      if (await restoredARecord.getAttribute("aria-expanded") !== "true") await restoredARecord.click();
      await page.getByText("A durable result", { exact: true }).waitFor();
      await page.unroute(bRoute);
      // The exact failed response, rather than an arbitrary delay, bounds the
      // expected stale-request 404 suppression window.
      intentional404 = false;

      // X -> Y -> X with the first X response released after the second.
      await page.goto(`${base}/?session=${BRANCH}`, { waitUntil: "domcontentloaded" });
      await page.getByText("Delegating", { exact: true }).last().waitFor();
      let xCalls = 0;
      let releaseFirstX;
      let sawFirstX;
      const firstXSeen = new Promise((resolve) => { sawFirstX = resolve; });
      const firstXRelease = new Promise((resolve) => { releaseFirstX = resolve; });
      const contextRoute = `**/api/sessions/${BRANCH}/context?*`;
      await page.route(contextRoute, async (route) => {
        const leaf = new URL(route.request().url()).searchParams.get("leafId");
        if (leaf === "branch-x-result") {
          xCalls += 1;
          if (xCalls === 1) {
            sawFirstX();
            await firstXRelease;
          }
        }
        await route.continue().catch(() => {});
      });
      await openBranches();
      await page.getByText("Branch X choice", { exact: true }).click();
      await firstXSeen;
      await page.locator("span").filter({ hasText: /^Branch Y choice$/ }).click();
      await page.getByText("Branch X choice", { exact: true }).click();
      await page.locator("[data-entry-id='branch-x']:not([data-message-role])").waitFor();
      releaseFirstX();
      await delay(300);
      await openAgents();
      await page.getByRole("button", { name: /trellis-check .* Succeeded/ }).click();
      await page.getByText("X durable result", { exact: true }).waitFor();
      assert.equal(await page.getByText("Y durable result", { exact: true }).count(), 0);
      await page.unroute(contextRoute);

      // A stale Y context must not issue navigate_tree after X has taken
      // ownership. The API route is mocked, so inspect the real browser command
      // stream rather than inferring server state from the mock response.
      let releaseY;
      let sawY;
      let continuedY;
      const ySeen = new Promise((resolve) => { sawY = resolve; });
      const yRelease = new Promise((resolve) => { releaseY = resolve; });
      const yContinued = new Promise((resolve) => { continuedY = resolve; });
      await page.route(contextRoute, async (route) => {
        const leaf = new URL(route.request().url()).searchParams.get("leafId");
        if (leaf?.startsWith("branch-y")) {
          sawY();
          await yRelease;
          await route.continue().catch(() => {});
          continuedY();
          return;
        }
        await route.continue().catch(() => {});
      });
      await openBranches();
      await page.locator("span").filter({ hasText: /^Branch Y choice$/ }).click();
      await ySeen;
      await page.locator("span").filter({ hasText: /^Branch X choice$/ }).click();
      await page.locator("[data-entry-id='branch-x']:not([data-message-role])").waitFor();
      const commandCountBeforeStaleY = branchCommands.length;
      releaseY();
      await yContinued;
      await delay(200);
      assert.equal(
        branchCommands.slice(commandCountBeforeStaleY).some((command) => (
          command?.type === "navigate_tree" && String(command.targetId).startsWith("branch-y")
        )),
        false,
        "a stale Y response must not navigate the server away from X",
      );
      await page.unroute(contextRoute);

      // Synthetic SSE partial -> reconnect -> final, then settle while viewing X.
      branchRunning = true;
      await page.goto(`${base}/?session=${BRANCH}`, { waitUntil: "domcontentloaded" });
      // Wait for the app's full-branch history load before injecting a live
      // partial: ownership/allowed calls for a replayed update come from the
      // viewed branch, so injecting earlier would legitimately be rejected.
      await openAgents();
      await page.getByText("Y prompt", { exact: true }).waitFor();
      // The selected-session stream must survive React StrictMode's effect
      // replay without test-only lifecycle intervention.
      await page.waitForFunction(() => (window.__trellisMockSources ?? []).some((source) => source.readyState === 1));
      // The mocked SSE cannot create a server lease. Exercise renewed:0 as a
      // separate lifecycle path and require it to replace the source.
      const sourceCountBeforeLeaseRecovery = await page.evaluate(() => window.__trellisMockSources?.length ?? 0);
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await page.waitForFunction((previousCount) => (
        (window.__trellisMockSources?.length ?? 0) > previousCount
        && (window.__trellisMockSources ?? []).some((source) => source.readyState === 1)
      ), sourceCountBeforeLeaseRecovery);
      await page.evaluate(() => window.__emitTrellisAgentEvent({ type: "connected", isStreaming: true }));
      await delay(200);
      const ephemeralBeforeReconnect = progressDetails("ephemeral-run", "Ephemeral replay prompt", "running", "", false);
      ephemeralBeforeReconnect.runs[0].textTail = "Before reconnect output";
      await page.evaluate((details) => {
        // This ownership exists only in the current live assistant delta, not
        // in the persisted branch envelope. A reconnect must retain it for the
        // server's active-tool replay.
        window.__emitTrellisAgentEvent({
          type: "message_update",
          assistantMessageEvent: {
            type: "toolcall_start",
            contentIndex: 0,
            id: "ephemeral-tool",
            toolName: "trellis_subagent",
          },
        });
        window.__emitTrellisAgentEvent({
          type: "tool_execution_update",
          toolCallId: "ephemeral-tool",
          toolName: "trellis_subagent",
          partialResult: { content: [{ type: "text", text: "subagent running" }], details },
        });
      }, ephemeralBeforeReconnect);
      await page.evaluate((details) => window.__emitTrellisAgentEvent({
        type: "tool_execution_update",
        toolCallId: "live-tool",
        toolName: "trellis_subagent",
        partialResult: { content: [{ type: "text", text: "subagent running" }], details },
      }), progressDetails("live-run", "Live reconnect prompt", "running", "", false));
      await openAgents();
      await page.getByRole("button", { name: /trellis-check .* Running/ })
        .filter({ hasText: "Ephemeral replay prompt" }).waitFor();
      await page.evaluate(() => window.__failTrellisAgentEvent());
      await page.waitForFunction(() => (window.__trellisMockSources ?? []).filter((source) => source.readyState === 1).length >= 1 && (window.__trellisMockSources ?? []).length >= 2);
      await page.evaluate(() => window.__emitTrellisAgentEvent({ type: "connected", isStreaming: true }));
      const snapshotReplay = progressDetails("snapshot-run", "Snapshot-owned replay prompt", "running", "", false);
      snapshotReplay.runs[0].textTail = "Replay buffered before snapshot";
      await page.evaluate((details) => {
        // The real stream replays active tool updates before its assistant
        // snapshot. The update must wait for snapshot ownership, not disappear
        // or authorize itself.
        window.__emitTrellisAgentEvent({
          type: "tool_execution_update",
          toolCallId: "snapshot-tool",
          toolName: "trellis_subagent",
          partialResult: { content: [{ type: "text", text: "subagent still running" }], details },
        });
        window.__emitTrellisAgentEvent({
          type: "message_start",
          message: {
            role: "assistant",
            provider: "test",
            model: "test",
            content: [{ type: "toolCall", id: "snapshot-tool", name: "trellis_subagent", arguments: {} }],
            timestamp: Date.now(),
          },
        });
      }, snapshotReplay);
      const ephemeralReplay = progressDetails("ephemeral-run", "Ephemeral replay prompt", "running", "", false);
      ephemeralReplay.runs[0].textTail = "Replay progressed output";
      await page.evaluate((details) => window.__emitTrellisAgentEvent({
        type: "tool_execution_update",
        toolCallId: "ephemeral-tool",
        toolName: "trellis_subagent",
        partialResult: { content: [{ type: "text", text: "subagent still running" }], details },
      }), ephemeralReplay);
      await delay(250);
      await openAgents();
      await page.getByRole("button", { name: /trellis-check .* Running/ })
        .filter({ hasText: "Snapshot-owned replay prompt" }).click();
      await page.getByText("Replay buffered before snapshot", { exact: true }).waitFor();
      await page.getByRole("button", { name: /trellis-check .* Running/ })
        .filter({ hasText: "Ephemeral replay prompt" }).click();
      await page.getByText("Replay progressed output", { exact: true }).waitFor();
      await page.getByRole("button", { name: /trellis-check .* Running/ })
        .filter({ hasText: "Live reconnect prompt" }).click();
      await page.getByText("Not backed by a persisted record", { exact: true }).waitFor();
      const finalDetails = progressDetails("live-run", "Live reconnect prompt", "succeeded", "Live final result", true);
      await page.evaluate((details) => {
        window.__emitTrellisAgentEvent({
          type: "tool_execution_end",
          toolCallId: "live-tool",
          toolName: "trellis_subagent",
          result: { content: [{ type: "text", text: "Live final result" }], details },
          isError: false,
        });
        window.__emitTrellisAgentEvent({
          type: "message_end",
          message: {
            role: "toolResult",
            toolCallId: "live-tool",
            toolName: "trellis_subagent",
            content: [{ type: "text", text: "Live final result" }],
            details,
            timestamp: Date.now(),
          },
        });
      }, finalDetails);
      await page.getByText("Live final result", { exact: true }).last().waitFor();
      await page.getByRole("button", { name: /trellis-check .* Succeeded/ }).filter({ hasText: "Live reconnect prompt" }).waitFor();

      await openBranches();
      await page.getByText("Branch X choice", { exact: true }).click();
      await page.locator("[data-entry-id='branch-x']:not([data-message-role])").waitFor();
      await page.evaluate(() => window.__emitTrellisAgentEvent({ type: "agent_settled" }));
      await delay(400);
      await openAgents();
      await page.getByRole("button", { name: /trellis-check .* Succeeded/ }).click();
      await page.getByText("X durable result", { exact: true }).waitFor();
      assert.equal(await page.getByText("Y durable result", { exact: true }).count(), 0);
      assert.equal(await page.getByText("Live final result", { exact: true }).count(), 0);
      branchRunning = false;
      console.log("PASS: A-B-A success/404, X-Y-X, reconnect, final overlay, and historical settlement ownership");
    }

    assert.equal(requests.some((url) => /\/api\/sessions\/(a-run|b-run|x-run|y-run|live-run)(?:[/?]|$)/.test(url)), false);
    assert.deepEqual(errors, [], `Browser errors at width ${viewport.width}`);
    console.log(`PASS: ${viewport.width}px records-only, built-in-only, mixed, empty, branch, and read-only interactions`);
    await context.close();
    context = undefined;
    page = undefined;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  if (page) await page.screenshot({ path: join(artifacts, "failure.png") }).catch(() => {});
  if (context) await context.tracing?.stop?.({ path: join(artifacts, "trace.zip") }).catch(() => {});
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
