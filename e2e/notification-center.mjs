// Independent OFFLINE acceptance: real Next + SDK 1.0.0 fauxProvider + Chromium.
// No test endpoints, store imports, synthetic notification snapshots or mock SSE.
// WAIT for the coordinator's clean npm-ci/checks/start signal before running:
// pi-tmp-run --keep-on-failure notification-center -- env E2E_NOTIFICATION_START=1 \
//   PLAYWRIGHT_EXECUTABLE_PATH=<installed-chromium> node e2e/notification-center.mjs
// --list is safe: it neither creates fixtures nor starts a service/browser.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  appendFileSync, cpSync, createWriteStream, existsSync, mkdirSync, readFileSync,
  realpathSync, rmSync, statfsSync, statSync, writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const planned = [
  ["global-aggregation", "AC1/10/13", "No project selected; two projects; completion plus real ask/extension; pending first; summaries never ack; denied permission"],
  ["revision-bulk-fallback", "AC2/3/7/8", "Two independent contexts; delayed frozen R1 bulk with SDK R2; stale individual R1 ack; pending survives; <=3s remote synchronization with global SSE blocked"],
  ["new-run-preserves-old", "AC8", "Public SDK gated actual run does not remove its previous completion"],
  ["result-center-gate", "AC2/6", "Selected session/history response delayed: no ack; modal center covers actual marked markdown: no ack; sidebar and center share status; closing permits actual final-body ack"],
  ["result-settings-long", "AC6", "Settings covers actual final body; no ack; long body partially visible after closing can ack"],
  ["result-file-fullscreen", "AC6", "Real file explorer opens a real fixture file in expanded fullscreen FileViewer; underlying result remains unviewed until panel hides"],
  ["result-focus-gate", "AC6", "Actual browser focus loss while final body loaded; remains unviewed until focused"],
  ["pagination", "AC6", "Public SDK adds 360 display messages beyond the 300 raw-entry page ceiling; API proves unloaded result; notification selection pages then actual markdown ack"],
  ["process-final-target", "AC5/6", "Same-entry long process prelude and thinking are not actual answer; process-only visibility does not ack; notification navigates/scrolls to final split answer"],
  ["code-only-body", "AC6", "Code-only result: visible language/Copy header never acks; first actual code text line entering viewport does"],
  ["mermaid-loading-error", "AC6", "Delay real Mermaid module fetch to witness loading; invalid real Mermaid preview error is not result-body viewing"],
  ["metadata-navigation-retired", "AC5/11", "Real metadata response delayed across CtrlAltN/center reopen cannot resurrect old session selection or URL"],
  ["sibling-busy-mobile", "AC5/6/13", "Actual API tree navigation creates sibling; busy selection does not navigate_tree; hint and unread retained; 390px fullscreen center, 44px close, Escape not Stop, focus return"],
  ["healthy-sse-sync", "AC2/3", "Fresh independent remote context with real healthy global SSE; local immediate and remote <=3s acknowledgment UI update"],
  ["browser-close-restart", "AC4/7", "Close browser, actual SDK completion while offline, exact graceful own-server restart, same revision/instance and ask identity, obsolete extension absent, refresh persistence"],
];
const notAutomated = [
  "AC4: system-notification dedup across restart (permission deliberately denied)",
  "AC6: true document-hidden/background gate; headless focus test alone is not hidden-state evidence",


  "AC6: independently windowed/unmounted/restoring-scroll result and child-branch inclusion",
  "AC5: full session-restore regression in existing e2e/session-restore.mjs (this script separately seeds stale memory for busy cross-project notification click/reload)",
  "AC7/11: all extension confirm/select/editor/custom, custom redraw/supersede/late close and ask wrapper negative-state races",
  "AC9: multi-turn/retry/compaction/queued/deferred/handled classification and special finish errors (runtime SDK suites own these)",
  "AC9: Stop/watchdog/independent bash classification (Escape no-Stop regression is narrower)",
  "AC10/11: subagent/Trellis suppression, deletion/partial-delete/late-wrapper guards",
  "AC3/11: offline/online and half-open SSE recovery, late cross-epoch response ordering",
  "AC12: legacy migration multi-device invalid IDs/watermarks, atomic-write corruption/retry, untrusted requests and size bounds",
  "AC13: full three-language/theme/font/tool-pin/ask/tail-follow regression matrix",
  "AC13: Safari 16.2, iOS real device/safe-area, Windows (Chromium/Linux cannot prove these)",
];
if (process.argv.includes("--list")) {
  console.log(JSON.stringify({ planned: planned.map(([name, ac, description]) => ({ name, ac, description, status: "not-run" })), notAutomated }, null, 2));
  process.exit(0);
}
assert.equal(process.env.E2E_NOTIFICATION_START, "1", "Await coordinator signal; explicitly set E2E_NOTIFICATION_START=1");
const taskTmp = process.env.PI_TASK_TMPDIR;
const originalTMPDIR = process.env.TMPDIR;
assert.ok(taskTmp && isAbsolute(taskTmp) && existsSync(taskTmp), "Run this finite harness inside pi-tmp-run");
assert.ok(!existsSync(join(root, ".next/dev/lock")), "Never start a second shared-.next server; stop if a dev lock exists");
assert.ok(!realpathSync(root).startsWith(realpathSync(taskTmp) + "/"), "Source/node_modules must remain outside the temporary workspace");
for (const name of ["pi-ai", "pi-agent-core", "pi-coding-agent", "pi-tui"]) {
  assert.equal(JSON.parse(readFileSync(join(root, "node_modules/@earendil-works", name, "package.json"), "utf8")).version, "1.0.0");
}
// Same explicitly corrected ancestor boundary as research/validation-baseline.md.
assert.equal(realpathSync("/var/tmp"), "/var/tmp", "Do not follow a changed /var/tmp symlink");
assert.equal(Number(statfsSync("/var/tmp").type), 0x9123683e, "Revalidate baseline's btrfs main-disk /var/tmp; not tmpfs");
for (const ancestor of ["/", "/var", "/var/tmp"]) {
  for (const path of [".agents/skills", ".pi/extensions", ".pi/skills", ".pi/settings.json", ".pi/mcp.json", "AGENTS.md"]) {
    assert.ok(!existsSync(join(ancestor, path)), `Unsafe fixture ancestor resource: ${join(ancestor, path)}`);
  }
}
const temporary = spawnSync("mktemp", ["-d", "-p", "/var/tmp", "notification-browser.XXXXXXXX"], { encoding: "utf8" });
assert.equal(temporary.status, 0, temporary.stderr);
const fixture = temporary.stdout.trim();
assert.match(fixture, /^\/var\/tmp\/notification-browser\.[a-zA-Z0-9]+$/);
assert.equal(statSync(fixture).uid, process.getuid());
const results = join(taskTmp, "results"); // All Playwright artifacts belong to this wrapper.
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const evidence = join(root, ".trellis/tasks/10-06-notification-center-sync/research/validation-logs", `browser-${runId}`);
const home = join(fixture, "home"), agent = join(fixture, "agent"), gates = join(fixture, "gates");
const alpha = join(fixture, "NC-alpha"), beta = join(fixture, "NC-beta");
const isolatedEnv = {
  PATH: process.env.PATH, LANG: "C.UTF-8", HOME: home, PI_CODING_AGENT_DIR: agent,
  TMPDIR: join(fixture, "tmp"), PI_TASK_TMPDIR: taskTmp,
  XDG_CONFIG_HOME: join(fixture, "config"), XDG_CACHE_HOME: join(fixture, "cache"),
  PI_OFFLINE: "1", PI_WEB_DISABLE_MCP: "1", PI_WEB_PASSWORD: "", JITI_FS_CACHE: "false",
  NEXT_TELEMETRY_DISABLED: "1", NOTIFICATION_FIXTURE_GATE_DIR: gates,
  NOTIFICATION_FIXTURE_CALL_LOG: join(results, "faux-calls.jsonl"),
};
const productPaths = ["components/AppShell.tsx", "components/ChatWindow.tsx", "components/NotificationCenter.tsx", "components/SessionSidebar.tsx",
  "components/MermaidBlock.tsx", "components/MarkdownBody.tsx", "hooks/useAgentSession.ts", "lib/notifications/viewed-result.ts",
  "lib/notifications/client.ts", "lib/notifications/runtime.ts", "lib/notifications/store.ts", "lib/notifications/persist.ts",
  "lib/rpc-manager.ts", "lib/agent-run-observer.ts", "lib/agent-run-tracker.ts", "app/api/notifications/route.ts", "app/api/notifications/events/route.ts",
  "lib/notifications/visible-content.ts", "lib/notifications/types.ts", "hooks/useNotifications.ts", "app/globals.css",
  "lib/i18n/messages/en.ts", "lib/i18n/messages/zh-CN.ts", "lib/i18n/messages/zh-TW.ts",
  "lib/session-view-cache.ts", "lib/session-reader.ts", "lib/message-display.ts", "lib/types.ts", "components/MessageView.tsx",
  "app/api/sessions/[id]/route.ts", "app/api/sessions/[id]/context/route.ts", "app/api/agent/[id]/route.ts", "app/api/agent/[id]/events/route.ts"];
const sourceHashes = () => Object.fromEntries(productPaths.map((path) => [path, createHash("sha256").update(readFileSync(join(root, path))).digest("hex")]));
const runnerHashes = () => Object.fromEntries(["e2e/notification-center.mjs", "e2e/fixtures/notification-faux-provider.ts", "package.json", "package-lock.json"]
  .map((path) => [path, createHash("sha256").update(readFileSync(join(root, path))).digest("hex")]));
const traceEnabled = process.env.E2E_RETRY !== "0";
const report = {
  startedAt: new Date().toISOString(), sourceRoot: root, taskTmp, fixture, evidence,
  node: process.version, sourceRef: spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim(),
  // This is mutable candidate-source browser evidence, not a fixed-ref clean baseline.
  candidateStatus: spawnSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).stdout,
  scenarios: planned.map(([name, ac, description]) => ({ name, ac, description, status: "not-run" })),
  notAutomated, servers: [], timings: [], sseConnections: [], browserErrors: [], observerEvidence: [],
  sdkFixtureScope: "Public SDK faux provider + existing minimal protocol peer; not the installed ask_user source",
  productHashesStart: sourceHashes(),
  runnerHashesStart: runnerHashes(), artifacts: { video: "off", trace: traceEnabled ? "failure-or-explicit-retry" : "off", retry: process.env.E2E_RETRY ?? null },
};
let server, serverLog, browser, a, b, pageA, pageB, base, port;
let failed = false, interrupted = false, serverNumber = 0, scenarioName = "setup";
let autoTarget = null;
const network = { a: [], b: [] }, commands = [], routeErrors = [];
const contexts = new Set();
const note = (type, detail) => {
  appendFileSync(join(results, "runner.jsonl"), JSON.stringify({ at: new Date().toISOString(), type, detail }) + "\n");
  console.log(type, typeof detail === "string" ? detail : JSON.stringify(detail));
};
const saveReport = () => writeFileSync(join(results, "report.json"), JSON.stringify(report, null, 2));
async function until(fn, label, timeout = 60_000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    assert.ok(!interrupted, "Harness interrupted");
    if (routeErrors.length) throw routeErrors[0];
    const value = await fn();
    if (value) return value;
    await delay(25);
  }
  throw new Error(`Timed out: ${label}`);
}
function latch() {
  const barrier = { ready: false, promise: null, resolve: null };
  barrier.promise = new Promise((done) => { barrier.resolve = () => { barrier.ready = true; done(); }; });
  return barrier;
}
async function api(path, body, method = body ? "POST" : "GET") {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(60_000),
    headers: { ...(body ? { "Content-Type": "application/json", Origin: base } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(response.status, 200, `${method} ${path}: ${await response.clone().text()}`);
  return response.json();
}
const snapshot = () => api("/api/notifications");
const command = (id, body) => api(`/api/agent/${id}`, body);
const prompt = (id, message) => command(id, { type: "prompt", message });
const state = async (id) => (await api(`/api/agent/${id}`)).state;
const completion = async (id) => (await snapshot()).items.find((item) => item.kind === "completion" && item.sessionId === id);
const waitCompletion = (id, revision) => until(async () => {
  const item = await completion(id); return item && item.revision !== revision ? item : null;
}, `SDK completion for ${id}`);
const waitIdle = (id) => until(async () => { const s = await state(id); return !s?.isStreaming && !s?.isPromptRunning; }, `idle ${id}`);
const releaseGate = (token) => writeFileSync(join(gates, token), "released\n");
const center = (page) => page.locator("dialog.notification-center");
const row = (page, name) => center(page).locator(".notification-center-item").filter({ has: page.getByText(name, { exact: true }) });
const bell = (page) => page.locator(".notification-bell");
const sidebarRow = (page, name) => page.locator(`#session-sidebar div[title="${name}"]`).locator("xpath=../..");
// Initial history is bundled in GET /sessions/[id]; /context is used for paging.
const historyPattern = (id) => new RegExp(`/api/sessions/${id}(?:\\?|$)`);
async function openCenter(page) {
  if (!await center(page).isVisible()) await bell(page).click();
  await center(page).waitFor();
}
async function closeCenter(page) {
  if (await center(page).isVisible()) await center(page).getByRole("button", { name: "Close notifications", exact: true }).click();
  await center(page).waitFor({ state: "hidden" });
}
async function assertRevision(item, label) {
  assert.equal((await completion(item.sessionId))?.revision, item.revision, label);
}
async function createSession(cwd, name) {
  const created = await api("/api/agent/new", { type: "ensure_session", cwd,
    provider: "notification-faux", modelId: "notification-test", thinkingLevel: "off" });
  assert.ok(created.sessionId);
  await prompt(created.sessionId, `/nc-name ${name}`);
  return created.sessionId;
}
async function startServer() {
  assert.ok(!server || server.exitCode !== null || server.signalCode !== null, "Only one owned server at a time");
  assert.ok(!existsSync(join(root, ".next/dev/lock")), "A shared dev graph appeared; refuse concurrent server");
  serverNumber++;
  const path = join(results, `server-${serverNumber}.log`);
  serverLog = createWriteStream(path);
  // Own process group, only within this finite invocation. Never reused after return.
  server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(port)],
    { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"], env: isolatedEnv });
  server.stdout.pipe(serverLog, { end: false }); server.stderr.pipe(serverLog, { end: false });
  report.servers.push({ pid: server.pid, port, log: path, startedAt: new Date().toISOString(), argv: server.spawnargs, stoppedAt: null });
  note("server-start", report.servers.at(-1)); saveReport();
  await until(async () => {
    assert.equal(server.exitCode, null, "Owned Next process exited during startup");
    assert.equal(server.signalCode, null, "Owned Next process was signalled during startup");
    try { return (await fetch(base, { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; }
  }, "isolated Next ready", 120_000);
  await snapshot(); // Warm real routes before measuring the <=3s client bound.
  await api("/api/notifications", { type: "ack_many", items: [] });
}
async function stopServer({ requireGraceful = false } = {}) {
  if (!server) return;
  const owned = server;
  let forced = false;
  const kill = (signal) => { try { process.kill(-owned.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; } };
  if (owned.exitCode === null && owned.signalCode === null) {
    const exited = once(owned, "exit");
    kill("SIGTERM");
    const timer = setTimeout(() => { forced = true; kill("SIGKILL"); }, 10_000);
    try { await exited; } finally { clearTimeout(timer); }
  }
  const stopped = report.servers.find((item) => item.pid === owned.pid && !item.stoppedAt);
  if (stopped) Object.assign(stopped, { stoppedAt: new Date().toISOString(), exitCode: owned.exitCode, signal: owned.signalCode, forced });
  // Reap any child still in precisely this server's process group, never pkill.
  kill("SIGTERM");
  await new Promise((resolve) => serverLog.end(resolve));
  server = null; serverLog = null;
  await until(() => !existsSync(join(root, ".next/dev/lock")), "owned dev lock released", 15_000);
  saveReport();
  if (requireGraceful) assert.equal(forced, false, "Normal restart must not need SIGKILL");
}
async function launchBrowser() {
  browser = await chromium.launch({ headless: true, env: isolatedEnv,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  report.chromium = browser.version();
}
async function newDevice(label, viewport, fallback = false) {
  const context = await browser.newContext({ viewport }); // No storageState: devices MUST be independent.
  contexts.add(context);
  if (label === "a") a = context; else b = context;
  // Chromium's override grants this empty allowlist and denies other permissions.
  // Unlike a JS Notification stub, this changes the actual browser permission backend.
  await context.grantPermissions([], { origin: base });
  await context.addInitScript(() => localStorage.setItem("pi-locale", "en"));
  // Explicit E2E_RETRY=0 disables acquisition as well as retention, even on failure.
  if (traceEnabled) await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  if (fallback) await context.route("**/api/notifications/events", (route) => route.abort());
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base && /^https?:$/.test(url.protocol)) { await route.abort(); return; }
    if (request.method() === "POST" && url.pathname === "/api/notifications" && autoTarget) {
      const body = request.postDataJSON();
      if (body.type === "ack" && body.id === autoTarget.id) {
        try {
          assert.equal(body.revision, autoTarget.revision, "Automatic ack binds observed revision");
          const page = request.frame().page();
          const proof = await resultGeometry(page, autoTarget.resultEntryId);
          assert.equal(proof.markerCount, 1, "Unique actual-result marker, never generic data-entry-id");
          assert.ok(proof.markdown && proof.bodyText.includes("NC"), "Actual rendered markdown body, not summary/sentinel");
          assert.ok(proof.intersectionHeight > 0 && proof.focused && proof.visibility === "visible", "Real foreground/body intersection required");
          assert.equal(proof.covered, false, "Covered result must not emit automatic ack");
          if (autoTarget.codeOnly) assert.ok(proof.codeFirstLineIntersection > 0, "Code header alone is not actual answer text");
          report.observerEvidence.push({ label, scenarioName, at: new Date().toISOString(), body, proof });
        } catch (error) { routeErrors.push(error); await route.abort(); return; }
      }
    }
    await route.fallback();
  });
  const page = await context.newPage();
  if (label === "a") pageA = page; else pageB = page;
  page.on("pageerror", (error) => report.browserErrors.push({ label, error: String(error) }));
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/notifications/events" && response.status() === 200) {
      report.sseConnections.push({ label, serverNumber, at: performance.now(), contentType: response.headers()["content-type"] });
    }
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) network[label].push({ at: performance.now(), path: url.pathname, search: url.search, method: request.method() });
    if (request.method() === "POST" && /^\/api\/agent\/[^/]+$/.test(url.pathname)) commands.push({ label, body: request.postDataJSON() });
  });
  await page.goto(base, { waitUntil: "domcontentloaded" }); await bell(page).waitFor();
  // Let the app's automatic initial cwd adoption settle before opening a panel.
  // Explicit context transitions correctly retire panels; this is not a project-selection action.
  await page.locator("#session-sidebar").getByText("notification-note.txt", { exact: true }).waitFor({ state: "attached" });
  await page.waitForTimeout(200);
  const permission = await page.evaluate(async () => ({ notification: Notification.permission,
    queried: (await navigator.permissions.query({ name: "notifications" })).state, secure: isSecureContext, url: location.href }));
  note("browser-permission", { label, ...permission });
  assert.equal(permission.notification, "denied", "Real Chromium permission denial, not a JS stub");
  assert.equal(new URL(page.url()).searchParams.get("session"), null);
  return { context, page };
}
async function closeBrowsers() {
  for (const context of contexts) {
    if (traceEnabled) await context.tracing.stop(failed || process.env.E2E_RETRY === "1"
      ? { path: join(results, `trace-server${serverNumber}-${scenarioName}-${context === a ? "a" : context === b ? "b" : "extra"}.zip`) } : {}).catch(() => {});
    await context.close().catch(() => {});
  }
  contexts.clear();
  await browser?.close().catch(() => {}); browser = null;
  await delay(250); // Let owned Chromium/helper and Next configuration writes drain before removing HOME.
}
async function nativeFocusPage(page) {
  // Playwright forces every page focused by default. Disable its CDP override
  // before switching actual Chromium targets; never redefine document.hasFocus.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  return async () => { await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }); await cdp.detach(); };
}
async function resultGeometry(page, entryId) {
  return page.evaluate((id) => {
    const markers = [...document.querySelectorAll("[data-notification-result-entry-id]")].filter((el) => el.dataset.notificationResultEntryId === id);
    const marker = markers[0];
    const indexes = (marker?.dataset.notificationResultTextIndexes ?? "").split(",").filter(Boolean).map(Number);
    const blocks = marker?.querySelectorAll("[data-message-text]") ?? [];
    const body = indexes.map((index) => blocks[index]?.querySelector(".markdown-body")).find(Boolean);
    let scroller = marker?.parentElement;
    while (scroller && getComputedStyle(scroller).overflowY !== "auto") scroller = scroller.parentElement;
    const r = body?.getBoundingClientRect(), s = scroller?.getBoundingClientRect();
    const intersection = (rect) => rect && s ? Math.max(0, Math.min(rect.bottom, s.bottom, innerHeight) - Math.max(rect.top, s.top, 0)) : 0;
    const walker = body && document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let firstCodeRect = null;
    if (walker) while (walker.nextNode()) {
      const text = walker.currentNode;
      if (text.textContent.includes("NC_FIRST_CODE_LINE")) {
        const range = document.createRange(); range.selectNodeContents(text); firstCodeRect = range.getBoundingClientRect(); break;
      }
    }
    return { markerCount: markers.length, markdown: !!body, bodyText: body?.textContent?.slice(0, 200) ?? "",
      bodyHeight: r?.height ?? 0, scrollerHeight: s?.height ?? 0,
      intersectionHeight: intersection(r), codeFirstLineIntersection: intersection(firstCodeRect),
      focused: document.hasFocus(), visibility: document.visibilityState,
      covered: !!document.querySelector("dialog.notification-center[open], .settings-dialog-backdrop, #file-panel.right-panel-full-width") };
  }, entryId);
}
async function scenario(name, operation) {
  scenarioName = name;
  const entry = report.scenarios.find((item) => item.name === name);
  entry.startedAt = new Date().toISOString(); entry.status = "running"; saveReport();
  try { await operation(); entry.status = "pass"; note("PASS", name); }
  catch (error) {
    entry.error = String(error.stack ?? error);
    if (error.unsupported) { entry.status = "not-run-environment"; note("UNSUPPORTED", { name, reason: error.message }); }
    else { entry.status = "fail"; throw error; }
  }
  finally { entry.finishedAt = new Date().toISOString(); saveReport(); }
}
// Delay a REAL winning context response, not substitute a fixture response.
async function coveredLoad(page, id, cover) {
  const entered = latch(), release = latch();
  const pattern = historyPattern(id);
  const handler = async (route) => { entered.resolve(); await release.promise; await route.fallback(); };
  await page.route(pattern, handler);
  try {
    await page.goto(`${base}/?session=${id}`, { waitUntil: "domcontentloaded" });
    await bell(page).waitFor(); await until(() => entered.ready, "real context request intercepted", 30_000);
    // DOMContentLoaded is not AppShell's asynchronous URL adoption. Opening a
    // cover earlier lets the still-pending adoption legitimately close it.
    await page.waitForFunction((sessionId) => {
      const raw = sessionStorage.getItem("pi-web:tab-open-session");
      if (!raw) return false;
      try { const memory = JSON.parse(raw); return memory.kind === "session" && memory.sessionId === sessionId; }
      catch { return raw === sessionId; }
    }, id);
    if (cover === "center") await openCenter(page);
    if (cover === "settings") {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.locator(".settings-dialog-backdrop").waitFor({ state: "visible" });
    }
    if (cover === "file") {
      await page.getByTitle(join(alpha, "notification-note.txt"), { exact: true }).click();
      await page.locator("#file-panel").getByRole("button", { name: "Expand file panel", exact: true }).click();
      const bounds = await page.locator("#file-panel.right-panel-full-width").boundingBox();
      assert.ok(bounds && Math.abs(bounds.width - page.viewportSize().width) < 1, "Actual file panel covers the viewport");
    }
    await delay(2100);
    if (cover === "settings") assert.equal(await page.locator(".settings-dialog-backdrop").isVisible(), true, "Settings cover must remain real before releasing history");
    assert.ok(await completion(id), "Selected but not yet committed/loaded is not viewed");
  } finally { release.resolve(); await page.unroute(pattern, handler); }
}
const interrupt = () => { interrupted = true; failed = true; void browser?.close().catch(() => {}); };
process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt);
try {
  for (const path of [results, home, agent, alpha, beta, gates, isolatedEnv.TMPDIR, isolatedEnv.XDG_CONFIG_HOME, isolatedEnv.XDG_CACHE_HOME]) mkdirSync(path, { recursive: true });
  // Playwright's own parent-side mkdtemp also needs the safe main-disk TMPDIR.
  for (const key of ["HOME", "PI_CODING_AGENT_DIR", "TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"]) process.env[key] = isolatedEnv[key];
  writeFileSync(join(alpha, "notification-note.txt"), "NC fixture file fullscreen: the actual chat result is underneath this file panel.\n");
  writeFileSync(join(beta, "notification-note.txt"), "NC fixture second-project file; permits either default workspace to finish its actual initial adoption.\n");
  note("environment", { originalTMPDIR, correctedTMPDIR: isolatedEnv.TMPDIR, home, agent, root, sdk: "1.0.0" });
  // Direct local package discovery, no repository source/node_modules copy into temp.
  writeFileSync(join(agent, "settings.json"), JSON.stringify({
    packages: [join(root, "lib/ask-user/fixtures/protocol-package")],
    extensions: [join(root, "e2e/fixtures/notification-faux-provider.ts"), "-builtin:mcp", "-builtin:codemode", "-builtin:tool-search"],
    defaultProvider: "notification-faux", defaultModel: "notification-test", defaultThinkingLevel: "off",
    compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off",
  }));
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  port = probe.address().port; await new Promise((resolve) => probe.close(resolve)); base = `http://127.0.0.1:${port}`;
  await startServer();
  const idA = await createSession(alpha, "NC Alpha"), idB = await createSession(beta, "NC Beta"), idE = await createSession(alpha, "NC Extension");
  await prompt(idA, "NC COMPLETE alpha-r1"); const r1 = await waitCompletion(idA);
  await prompt(idB, "NC COMPLETE beta-r1"); const betaR1 = await waitCompletion(idB);
  await prompt(idB, "NC ASK beta");
  const ask = await until(async () => (await state(idB))?.pendingAsk, "real host pending ask");
  await waitIdle(idB);
  await prompt(idE, "NC EXTENSION");
  const extension = await until(async () => (await snapshot()).items.find((item) => item.sessionId === idE && item.kind === "extension"), "real ctx.ui extension pending");
  assert.ok(extension.requestId && ask.askId);
  assert.equal((await completion(idB)).revision, betaR1.revision, "Current ask does not replace older completion");
  await launchBrowser();
  ({ context: a, page: pageA } = await newDevice("a", { width: 1280, height: 900 }));
  ({ context: b, page: pageB } = await newDevice("b", { width: 390, height: 844 }, true));
  await pageA.evaluate(() => localStorage.setItem("nc-context-proof", "device-a"));
  assert.equal(await pageB.evaluate(() => localStorage.getItem("nc-context-proof")), null, "Independent localStorage proof");
  await scenario("global-aggregation", async () => {
    await openCenter(pageA); await openCenter(pageB);
    for (const page of [pageA, pageB]) {
      await until(async () => await center(page).locator(".notification-center-item").count() === 4, "global aggregate rows");
      const labels = await center(page).locator(".notification-center-kind").allTextContents();
      assert.ok(labels.slice(0, 2).every((value) => value !== "Completed") && labels.slice(2).every((value) => value === "Completed"), "Pending group is first");
      const text = await center(page).innerText();
      for (const name of ["NC Alpha", "NC Beta", "NC-alpha", "NC-beta", "NC question", "NC extension"]) assert.ok(text.includes(name), name);
    }
    await delay(2200); await assertRevision(r1, "Summary viewing must not ack"); await assertRevision(betaR1, "Summary viewing does not dismiss beta");
    for (const label of ["a", "b"]) {
      assert.deepEqual(network[label].filter((r) => /^\/api\/sessions\/[^/]+(?:\/context|\/state)?$/.test(r.path) || /^\/api\/agent\/[^/]+\/events$/.test(r.path)), [], "Center does not download each session/history/SSE");
      assert.deepEqual(network[label].filter((r) => r.path === "/api/sessions" && !new URLSearchParams(r.search).has("projectKey") && !new URLSearchParams(r.search).has("sessionId")), [], "No all-session summary download");
    }
    await pageA.screenshot({ path: join(results, "global-desktop.png") }); await pageB.screenshot({ path: join(results, "global-mobile.png") });
  });
  await scenario("revision-bulk-fallback", async () => {
    const entered = latch(), release = latch(); let observed;
    const handler = async (route) => {
      if (route.request().method() !== "POST" || route.request().postDataJSON().type !== "ack_many") { await route.fallback(); return; }
      observed = route.request().postDataJSON(); entered.resolve(); await release.promise; await route.fallback();
    };
    await pageA.route("**/api/notifications", handler);
    try {
      await center(pageA).getByRole("button", { name: "Mark all completions as viewed", exact: true }).click();
      await until(() => entered.ready, "frozen real bulk request intercepted", 30_000);
      assert.deepEqual(observed.items.map((item) => item.id).sort(), [r1.id, betaR1.id].sort(), "Bulk freezes only completions, no pending IDs");
      await prompt(idA, "NC COMPLETE alpha-r2"); const r2 = await waitCompletion(idA, r1.revision);
      const accepted = pageA.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/notifications");
      release.resolve(); const response = await accepted; assert.equal(response.status(), 200);
      const committed = performance.now();
      await until(async () => await row(pageA, "NC Beta").count() === 1 && await row(pageA, "NC Alpha").count() === 1
        && (await row(pageA, "NC Alpha").innerText()).includes("alpha-r2"), "local bulk UI commit", 1000);
      const localMs = performance.now() - committed;
      await until(async () => await row(pageB, "NC Beta").count() === 1 && await row(pageB, "NC Alpha").count() === 1
        && (await row(pageB, "NC Alpha").innerText()).includes("alpha-r2"), "remote fallback UI commit", 3000);
      const remoteMs = performance.now() - committed;
      assert.ok(localMs <= 750, `Own response should update immediately: ${localMs}ms`); assert.ok(remoteMs <= 3000, `${remoteMs}ms`);
      report.timings.push({ scenarioName, globalSSE: "aborted for device b", localMs, remoteMs });
      await assertRevision(r2, "Frozen R1 bulk does not clear R2");
      const stale = await pageA.request.post(base + "/api/notifications", { data: { type: "ack", id: r1.id, revision: r1.revision } });
      assert.equal(stale.status(), 200); await assertRevision(r2, "Late individual R1 ack cannot clear R2");
      const pending = (await snapshot()).items.filter((item) => item.kind !== "completion");
      assert.deepEqual(pending.map((item) => item.requestId).sort(), [ask.askId, extension.requestId].sort());
      await center(pageA).getByRole("button", { name: "Mark all completions as viewed", exact: true }).click();
      await until(async () => !(await completion(idA)), "current explicit bulk commits");
      await until(async () => await row(pageB, "NC Alpha").count() === 0, "fallback removes current completion", 3000);
      assert.ok(network.b.some((r) => r.path === "/api/notifications/events"), "B really attempted the prohibited global SSE");
      const polls = network.b.filter((r) => r.path === "/api/notifications" && r.method === "GET");
      assert.ok(polls.length >= 3, "Global 2s poll really ran with no SSE");
      report.timings.push({ scenarioName: "fallback-poll", requestTimes: polls.map((r) => r.at), gapsMs: polls.slice(1).map((r, i) => r.at - polls[i].at) });
    } finally { release.resolve(); await pageA.unroute("**/api/notifications", handler); }
  });
  await scenario("new-run-preserves-old", async () => {
    await prompt(idA, "NC COMPLETE retained"); const old = await waitCompletion(idA);
    await prompt(idA, "NC HOLD preserve-old");
    await until(async () => (await state(idA))?.isStreaming, "actual new run started");
    await delay(2200); await assertRevision(old, "New run keeps previous completion");
    await until(async () => await row(pageA, "NC Alpha").count() === 1, "old completion is still in the actual center while running");
    releaseGate("preserve-old"); await waitCompletion(idA, old.revision); await waitIdle(idA);
    await api("/api/notifications", { type: "ack", id: old.id, revision: (await completion(idA)).revision });
  });
  const idC = await createSession(alpha, "NC Result");
  for (const [name, cover, message] of [
    ["result-center-gate", "center", "NC COMPLETE COVER"],
    ["result-settings-long", "settings", "NC COMPLETE LONG"],
    ["result-file-fullscreen", "file", "NC COMPLETE file-covered"],
  ]) await scenario(name, async () => {
    await prompt(idC, message); const item = await waitCompletion(idC); autoTarget = item;
    await coveredLoad(pageA, idC, cover);
    const marker = pageA.locator(`[data-notification-result-entry-id="${item.resultEntryId}"]`);
    await marker.waitFor({ state: "attached" });
    const proof = await resultGeometry(pageA, item.resultEntryId);
    assert.equal(proof.markerCount, 1); assert.ok(proof.markdown);
    await sidebarRow(pageA, "NC Result").waitFor({ state: "attached" });
    assert.equal(await sidebarRow(pageA, "NC Result").locator('[aria-label="New session activity"]').count(), 1, "Opened project sidebar and center share unviewed state");
    await delay(2200); await assertRevision(item, `${cover} overlay must prevent ack`);
    await pageA.screenshot({ path: join(results, `${name}.png`) });
    if (cover === "center") await closeCenter(pageA);
    else if (cover === "settings") {
      assert.ok(proof.bodyHeight > proof.scrollerHeight, "Long final body cannot be entirely visible");
      await pageA.getByRole("dialog").filter({ has: pageA.locator(".settings-dialog-surface") }).getByRole("button", { name: "Close", exact: true }).click();
    }
    else await pageA.locator("#file-panel").getByRole("button", { name: "Hide file panel", exact: true }).click();
    await pageA.bringToFront();
    await until(async () => !(await completion(idC)), "Actual visible final result auto-acks", 15_000);
    assert.ok(report.observerEvidence.some((entry) => entry.body.revision === item.revision), "Automatic ack was witnessed against unique real markdown");
    await until(async () => await sidebarRow(pageA, "NC Result").locator('[aria-label="New session activity"]').count() === 0, "Result ack also clears sidebar marker");
    autoTarget = null;
  });
  await scenario("result-focus-gate", async () => {
    await prompt(idC, "NC COMPLETE focus"); const item = await waitCompletion(idC); autoTarget = item;
    const entered = latch(), release = latch(), pattern = historyPattern(idC);
    const handler = async (route) => { entered.resolve(); await release.promise; await route.fallback(); };
    await pageA.route(pattern, handler);
    const restoreFocus = await nativeFocusPage(pageA);
    const sink = await a.newPage();
    try {
      await pageA.goto(`${base}/?session=${idC}`, { waitUntil: "domcontentloaded" });
      await until(() => entered.ready, "focus-test context request intercepted", 30_000);
      await sink.goto("about:blank"); await sink.bringToFront();
      try { await until(async () => !(await pageA.evaluate(() => document.hasFocus())), "Real browser document loses focus", 2000); }
      catch {
        const error = new Error("Headless Chromium retains native document focus across target activation even after disabling Playwright forced-focus; no JS focus/visibility stub permitted");
        error.unsupported = true; throw error;
      }
      release.resolve(); await pageA.locator(`[data-notification-result-entry-id="${item.resultEntryId}"] .markdown-body`).waitFor({ state: "attached" });
      await delay(2200); await assertRevision(item, "Unfocused loaded final body does not ack");
      await pageA.bringToFront(); await until(async () => !(await completion(idC)), "Focus restores actual-body viewing", 15_000);
    } finally { release.resolve(); await pageA.unroute(pattern, handler); await sink.close(); await restoreFocus(); autoTarget = null; }
  });
  await scenario("pagination", async () => {
    await openCenter(pageA);
    await prompt(idC, "NC COMPLETE paged"); const item = await waitCompletion(idC); autoTarget = item;
    await prompt(idC, "/nc-padding 360"); await waitIdle(idC);
    const initial = await api(`/api/sessions/${idC}?tree=summary&tail=50`);
    assert.equal(initial.context.entryIds.includes(item.resultEntryId), false, "Real initial API page must exclude the result before testing unloaded DOM");
    assert.equal(initial.context.hasMore, true, "Real page has older history to load");
    await coveredLoad(pageA, idC, "center");
    await until(async () => await pageA.getByText(/NC history padding 360:/).count() > 0, "later public-SDK padding loaded");
    assert.equal(await pageA.locator(`[data-notification-result-entry-id="${item.resultEntryId}"]`).count(), 0, "Unloaded result cannot have a body marker");
    await delay(2200); await assertRevision(item, "Pagination-unloaded result remains unviewed");
    await row(pageA, "NC Result").click();
    await until(async () => !(await completion(idC)), "Notification target loads older context and actual body", 20_000);
    assert.ok(report.observerEvidence.some((entry) => entry.body.revision === item.revision)); autoTarget = null;
  });
  await scenario("process-final-target", async () => {
    await openCenter(pageA); // Block viewing before SDK appends the actual answer.
    await prompt(idC, "NC COMPLETE PROCESS LONG"); const item = await waitCompletion(idC); autoTarget = item;
    await pageA.locator(`[data-notification-result-entry-id="${item.resultEntryId}"]`).waitFor({ state: "attached" });
    try {
      // Prepare real layout while the center covers the reading surface. Native DOM
      // activation expands an existing process group; no transcript/marker injection.
      await pageA.getByRole("button", { name: /Process details/ }).last().evaluate((el) => el.click());
      const processBody = pageA.locator(".markdown-body").filter({ hasText: "NC PROCESS PRELUDE" });
      await processBody.waitFor({ state: "attached" });
      assert.equal(await processBody.evaluate((el) => el.closest("[data-notification-result-entry-id]") !== null), false, "Process copy must not carry actual-result marker");
      await processBody.evaluate((el) => {
        let root = el.parentElement; while (root && getComputedStyle(root).overflowY !== "auto") root = root.parentElement;
        root.scrollTop += el.getBoundingClientRect().top - root.getBoundingClientRect().top;
      });
      await closeCenter(pageA);
      await pageA.bringToFront();
      assert.equal((await resultGeometry(pageA, item.resultEntryId)).intersectionHeight, 0, "Actual final answer is outside viewport");
      await delay(2200); await assertRevision(item, "Visible same-entry process prelude is not viewed final answer");
      await pageA.screenshot({ path: join(results, "process-only-unviewed.png") });
      await openCenter(pageA); await row(pageA, "NC Result").click();
      await until(async () => !(await completion(idC)), "Explicit notification result scrolls to actual split final answer", 20_000);
      assert.ok(report.observerEvidence.some((entry) => entry.body.revision === item.revision && entry.proof.bodyText.includes("NC LONG final answer")));
      await pageA.screenshot({ path: join(results, "process-final-target.png") });
    } finally { autoTarget = null; }
  });
  await scenario("code-only-body", async () => {
    await openCenter(pageA); await prompt(idC, "NC COMPLETE CODE_ONLY"); const item = await waitCompletion(idC);
    autoTarget = { ...item, codeOnly: true };
    await pageA.locator(`[data-notification-result-entry-id="${item.resultEntryId}"] .markdown-code-header`).waitFor({ state: "attached" });
    const position = (showText) => pageA.locator(`[data-notification-result-entry-id="${item.resultEntryId}"]`).evaluate((marker, visible) => {
      const header = marker.querySelector(".markdown-code-header"), pre = marker.querySelector("pre");
      let root = marker.parentElement; while (root && getComputedStyle(root).overflowY !== "auto") root = root.parentElement;
      const target = visible ? pre.getBoundingClientRect().top + 32 : header.getBoundingClientRect().bottom;
      root.scrollTop += target - (root.getBoundingClientRect().bottom - 2);
      const h = header.getBoundingClientRect(), p = pre.getBoundingClientRect(), r = root.getBoundingClientRect();
      return { headerVisible: Math.min(h.bottom, r.bottom) - Math.max(h.top, r.top), preTop: p.top, rootBottom: r.bottom };
    }, showText);
    try {
      const positioned = await position(false); assert.ok(positioned.headerVisible > 0);
      await closeCenter(pageA);
      await pageA.bringToFront();
      assert.equal((await resultGeometry(pageA, item.resultEntryId)).codeFirstLineIntersection, 0, "First code line is not visible yet");
      await delay(2200); await assertRevision(item, "Language/Copy header is never actual-result viewing");
      await pageA.screenshot({ path: join(results, "code-header-only-unviewed.png") });
      await position(true);
      await until(async () => !(await completion(idC)), "First actual code text line in viewport auto-acks", 15_000);
      assert.ok(report.observerEvidence.some((entry) => entry.body.revision === item.revision && entry.proof.codeFirstLineIntersection > 0));
    } finally { autoTarget = null; }
  });
  await scenario("mermaid-loading-error", async () => {
    const entered = latch(), release = latch();
    const pattern = /\/_next\/static\/chunks\/.*mermaid/i;
    const handler = async (route) => {
      if (await pageA.locator(".mermaid-block-loading").count() === 0) { await route.fallback(); return; }
      entered.resolve(); await release.promise; await route.fallback();
    };
    await pageA.route(pattern, handler);
    try {
      await openCenter(pageA); await prompt(idC, "NC COMPLETE MERMAID_ERROR"); const item = await waitCompletion(idC);
      const marker = pageA.locator(`[data-notification-result-entry-id="${item.resultEntryId}"]`);
      await marker.locator(".mermaid-block-loading").waitFor({ state: "attached" });
      await until(() => entered.ready, "Real lazy Mermaid chunk fetch intercepted", 30_000);
      await closeCenter(pageA); await marker.scrollIntoViewIfNeeded(); await pageA.bringToFront();
      await delay(2200); await assertRevision(item, "Mermaid loading skeleton is not actual answer content");
      await pageA.screenshot({ path: join(results, "mermaid-loading-unviewed.png") });
      release.resolve(); await marker.locator(".mermaid-block-error").waitFor({ timeout: 30_000 });
      await delay(2200); await assertRevision(item, "Invalid Mermaid preview error is not result-body viewing");
      await pageA.screenshot({ path: join(results, "mermaid-error-unviewed.png") });
      await api("/api/notifications", { type: "ack", id: item.id, revision: item.revision }); // Explicit user-style acknowledgement can clear an undisplayable result.
    } finally { release.resolve(); await pageA.unroute(pattern, handler); }
  });
  await scenario("metadata-navigation-retired", async () => {
    const idN = await createSession(beta, "NC Navigation"); await prompt(idN, "NC COMPLETE metadata"); const item = await waitCompletion(idN);
    const entered = latch(), release = latch();
    const pattern = `**/api/sessions?sessionId=${idN}`;
    const handler = async (route) => {
      const response = await route.fetch(); entered.resolve(); await release.promise;
      await route.fulfill({ response }).catch((error) => note("expected-retired-request-abort", String(error)));
    };
    await pageA.route(pattern, handler);
    try {
      await openCenter(pageA); await row(pageA, "NC Navigation").click();
      await until(() => entered.ready, "Real targeted metadata response delayed", 30_000);
      await pageA.keyboard.press("Control+Alt+n"); await center(pageA).waitFor({ state: "hidden" });
      await until(() => new URL(pageA.url()).searchParams.get("session") === null, "CtrlAltN adopted new conversation");
      await openCenter(pageA); const newUrl = pageA.url(); release.resolve();
      await delay(3000);
      assert.equal(pageA.url(), newUrl, "Late metadata cannot overwrite new-conversation URL");
      assert.equal(await center(pageA).isVisible(), true, "Late old navigation cannot close the reopened center");
      assert.equal(await pageA.locator(`[data-notification-result-entry-id="${item.resultEntryId}"]`).count(), 0, "Late old navigation cannot select previous target");
      await assertRevision(item, "Retired navigation leaves old completion unviewed");
      await pageA.screenshot({ path: join(results, "retired-metadata-reopened-center.png") });
    } finally { release.resolve(); await pageA.unroute(pattern, handler); }
  });
  await scenario("sibling-busy-mobile", async () => {
    const idD = await createSession(beta, "NC Branch");
    await prompt(idD, "NC COMPLETE branch-original"); const original = await waitCompletion(idD);
    const { context: history } = await api(`/api/sessions/${idD}/context?tail=200`);
    const index = history.messages.findIndex((message) => message.role === "user" && JSON.stringify(message.content).includes("branch-original"));
    assert.ok(index >= 0 && history.entryIds[index]);
    await command(idD, { type: "navigate_tree", targetId: history.entryIds[index] });
    await prompt(idD, "NC HOLD branch-busy");
    await until(async () => (await state(idD))?.isStreaming, "Sibling actual run is busy");
    await pageA.evaluate(({ key, stale }) => {
      const memory = JSON.parse(localStorage.getItem("pi-web:last-open-by-workspace") ?? "{}");
      memory[key] = stale;
      localStorage.setItem("pi-web:last-open-by-workspace", JSON.stringify(memory));
    }, { key: original.projectKey, stale: idB });
    await openCenter(pageA); await row(pageA, "NC Branch").click();
    await pageA.getByRole("status").filter({ hasText: /not loaded yet or is on another branch/ }).waitFor();
    await assertRevision(original, "Sibling cannot acknowledge original branch result");
    await until(() => new URL(pageA.url()).searchParams.get("session") === idD, "Explicit notification target URL commits", 10_000);
    await delay(1000);
    assert.equal(new URL(pageA.url()).searchParams.get("session"), idD, "Explicit notification target is adopted");
    await pageA.screenshot({ path: join(results, "branch-hint.png") });
    await pageA.reload({ waitUntil: "domcontentloaded" }); await bell(pageA).waitFor();
    // The navigation hint is transient to that explicit click, not persisted UI.
    // Reload must retain the actual sibling/session/URL and unviewed completion.
    await pageA.getByText("NC HOLD branch-busy", { exact: true }).waitFor();
    await assertRevision(original, "Reload on sibling still cannot view original branch result");
    assert.equal(new URL(pageA.url()).searchParams.get("session"), idD, "Explicit cross-project notification target survives stale memory and reload");
    await until(async () => await sidebarRow(pageA, "NC Branch").locator('[aria-label^="Agent running"]').count() === 1, "Running sidebar indicator");
    assert.equal(await sidebarRow(pageA, "NC Branch").locator('[aria-label="New session activity"]').count(), 1, "Running does not hide older unviewed sidebar marker");
    assert.equal(commands.some((entry) => entry.body.type === "navigate_tree"), false, "Notification click must not secretly issue tree navigation");
    // B is a truly independent mobile device viewing the same busy sibling.
    await closeCenter(pageB); await pageB.goto(`${base}/?session=${idD}`, { waitUntil: "domcontentloaded" }); await bell(pageB).waitFor();
    await pageB.getByText("NC HOLD branch-busy", { exact: true }).waitFor();
    await openCenter(pageB);
    const box = await center(pageB).boundingBox(), close = await center(pageB).getByRole("button", { name: "Close notifications", exact: true }).boundingBox();
    assert.ok(box && Math.abs(box.x) < 1 && Math.abs(box.y) < 1 && Math.abs(box.width - 390) < 1 && Math.abs(box.height - 844) < 2, JSON.stringify(box));
    assert.ok(close && close.width >= 44 && close.height >= 44, "390px close target >=44px");
    await pageB.screenshot({ path: join(results, "mobile-busy-center.png") });
    const before = commands.length; await pageB.keyboard.press("Escape"); await center(pageB).waitFor({ state: "hidden" });
    assert.equal(commands.slice(before).some((entry) => ["abort", "abort_bash", "abort_compaction"].includes(entry.body.type)), false, "Center Escape is not Stop");
    assert.equal(await bell(pageB).evaluate((element) => element === document.activeElement), true, "Focus returns to mobile bell");
    assert.equal((await state(idD)).isStreaming, true, "Actual held run was not stopped by Escape");
    await assertRevision(original, "Busy sibling still retains original completion");
    await pageA.screenshot({ path: join(results, "branch-reload-preserved.png") });
    releaseGate("branch-busy"); await waitIdle(idD);
  });
  await scenario("healthy-sse-sync", async () => {
    // Replace only B's device context. The new one has its own empty storage and
    // a real global stream, independent of both A and the previous fallback device.
    if (traceEnabled) await b.tracing.stop(process.env.E2E_RETRY === "1" ? { path: join(results, "trace-fallback-device-before-healthy-sse.zip") } : {});
    contexts.delete(b); await b.close();
    const connections = report.sseConnections.filter((entry) => entry.label === "b").length;
    ({ context: b, page: pageB } = await newDevice("b", { width: 390, height: 844 }));
    await until(() => report.sseConnections.filter((entry) => entry.label === "b" && entry.contentType?.includes("text/event-stream")).length > connections,
      "Remote healthy global SSE response", 15_000);
    await openCenter(pageA); await openCenter(pageB);
    await prompt(idA, "NC COMPLETE healthy-sse"); const item = await waitCompletion(idA);
    await until(async () => await row(pageA, "NC Alpha").count() === 1 && await row(pageB, "NC Alpha").count() === 1, "Both devices see real new completion");
    await pageB.screenshot({ path: join(results, "healthy-sse-before-ack.png") });
    const accepted = pageA.waitForResponse((response) => response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/notifications");
    await center(pageA).getByRole("button", { name: "Mark all completions as viewed", exact: true }).click();
    const response = await accepted; assert.equal(response.status(), 200); const committed = performance.now();
    await until(async () => await row(pageA, "NC Alpha").count() === 0, "Local healthy-SSE ack UI commit", 1000);
    const localMs = performance.now() - committed;
    await until(async () => await row(pageB, "NC Alpha").count() === 0, "Remote healthy-SSE ack UI commit", 3000);
    const remoteMs = performance.now() - committed;
    assert.ok(localMs <= 750 && remoteMs <= 3000, JSON.stringify({ localMs, remoteMs }));
    assert.equal(await completion(item.sessionId), undefined);
    report.timings.push({ scenarioName, globalSSE: "healthy real stream on both independent devices", localMs, remoteMs });
    await pageB.screenshot({ path: join(results, "healthy-sse-after-ack.png") });
  });
  await scenario("browser-close-restart", async () => {
    autoTarget = null; await closeBrowsers();
    const idP = await createSession(alpha, "NC Persistent");
    await prompt(idP, "NC COMPLETE while-browser-closed"); const persisted = await waitCompletion(idP);
    const before = await snapshot();
    await stopServer({ requireGraceful: true }); await startServer();
    const after = await snapshot();
    assert.equal(after.instanceId, before.instanceId); assert.notEqual(after.epoch, before.epoch);
    assert.equal(after.items.find((item) => item.sessionId === idP)?.revision, persisted.revision, "Exact persisted revision restored");
    assert.equal(after.items.find((item) => item.sessionId === idB && item.kind === "ask")?.requestId, ask.askId, "Ask mirror recovers same request identity");
    assert.equal(after.items.some((item) => item.sessionId === idE && item.kind === "extension"), false, "Dead wrapper extension request is not actionable after restart");
    await launchBrowser();
    ({ context: a, page: pageA } = await newDevice("a", { width: 1280, height: 900 }));
    ({ context: b, page: pageB } = await newDevice("b", { width: 390, height: 844 }, true));
    await openCenter(pageA); await openCenter(pageB);
    await row(pageA, "NC Persistent").waitFor(); await row(pageB, "NC Persistent").waitFor();
    await pageA.reload({ waitUntil: "domcontentloaded" }); await bell(pageA).waitFor();
    // The server-rendered bell exists before React has attached its handler.
    // The actual async file tree proves client hydration, just as newDevice().
    await pageA.locator("#session-sidebar").getByText("notification-note.txt", { exact: true }).waitFor({ state: "attached" });
    await openCenter(pageA);
    await row(pageA, "NC Persistent").waitFor(); await assertRevision(persisted, "Refresh preserves pending completion");
    await pageA.screenshot({ path: join(results, "restart-persistent.png") });
  });
  assert.deepEqual(routeErrors, []);
  report.status = report.scenarios.some((entry) => entry.status === "not-run-environment") ? "pass-with-environment-limitations" : "pass";
  note("coverage", { status: "Core scenarios ran; not the complete acceptance matrix", notAutomated });
} catch (error) {
  failed = true; report.status = "fail"; report.error = String(error.stack ?? error); process.exitCode = 1;
  console.error(error);
  for (const [page, label] of [[pageA, "a"], [pageB, "b"]]) await page?.screenshot({ path: join(results, `failure-${scenarioName}-${label}.png`) }).catch(() => {});
} finally {
  await closeBrowsers();
  await stopServer().catch((error) => { failed = true; process.exitCode = 1; report.cleanupError = String(error); });
  process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
  report.finishedAt = new Date().toISOString(); report.status = failed ? "fail" : report.status ?? "fail";
  report.productHashesEnd = sourceHashes();
  report.runnerHashesEnd = runnerHashes();
  report.sourceChangedDuringRun = productPaths.filter((path) => report.productHashesStart[path] !== report.productHashesEnd[path]);
  if (!failed && report.sourceChangedDuringRun.length) { report.status = "checks-passed-source-mutated-retest-required"; process.exitCode = 2; }
  writeFileSync(join(results, "network.json"), JSON.stringify(network, null, 2));
  writeFileSync(join(results, "commands.json"), JSON.stringify(commands, null, 2));
  if (failed) {
    // Preserve only this run's notification/ask state and small fixture session data.
    for (const path of ["pi-web-notifications.json", "pi-web-open-asks.json", "sessions"]) {
      if (existsSync(join(agent, path))) cpSync(join(agent, path), join(results, "fixture-evidence", path), { recursive: true });
    }
  }
  saveReport();
  try {
    mkdirSync(evidence, { recursive: true }); cpSync(results, evidence, { recursive: true });
    await delay(1000); // Drain asynchronous owned Next configuration-directory cleanup races.
    rmSync(fixture, { recursive: true, force: true });
    console.log(`Formal evidence: ${evidence}; owned fixture removed: ${fixture}`);
  } catch (error) {
    process.exitCode = 1;
    console.error(`Evidence transfer/cleanup failed; retain only our owned paths: ${fixture}, ${results}`, error);
  }
}
