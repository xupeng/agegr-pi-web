// Real Chromium + Next/API/SSE + independent SDK sessions. No product responses mocked.
// Run only after implementation readiness is explicitly confirmed; see browser-plan.md.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmp = process.env.PI_TASK_TMPDIR;
assert.equal(process.env.E2E_PRODUCT_READY, "1", "Wait for product-ready confirmation; set E2E_PRODUCT_READY=1 only then");
assert.ok(tmp && existsSync(tmp), "Run inside the isolated pi-tmp-run described in browser-plan.md");
assert.ok(resolve(tmp).startsWith("/var/tmp/"), "Ancestor isolation requires a unique outer /var/tmp validation HOME");
assert.ok(!existsSync(join(root, ".next/dev/lock")), "Do not use or stop an existing worktree dev service");
for (const name of [".env", ".env.local", ".env.development", ".env.development.local"]) {
  assert.ok(!existsSync(join(root, name)), `Refuse dotenv credentials/config from source: ${name}`);
}
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert.ok(executablePath && existsSync(executablePath), "Pass the installed Chromium executablePath; never download a browser");
for (const key of ["XDG_STATE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME"]) assert.equal(process.env[key], undefined, `Unset ${key}`);
const home = join(tmp, "home");
const agent = join(home, ".pi/agent");
const project = join(tmp, "project");
const app = join(tmp, "app");
const results = join(tmp, "results");
const fixture = join(root, "e2e/fixtures/subagent-model-selection.mjs");
const evidence = join(root, ".trellis/tasks/10-06-subagent-model-selection/research",
  `subagent-model-selection-browser-${new Date().toISOString().replace(/[:.]/g, "-")}`);
assert.equal(process.env.HOME, home, "Inner HOME must equal PI_TASK_TMPDIR/home before importing SDK");
assert.equal(process.env.PI_CODING_AGENT_DIR, agent, "Use the isolated agent directory");
for (const path of [agent, join(agent, "agents"), project, app, results]) mkdirSync(path, { recursive: true });
// Public Next directory argument: symlink the unchanged candidate source graph, not its
// .pi/AGENTS/ancestor resources. Next may chdir into this app directory; SDK cwd remains project.
// Next route discovery does not traverse a symlinked app directory. Directory entries
// are real, while its individual files are symlinks (no source copy).
function linkRoutes(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory()) linkRoutes(join(source, entry.name), join(target, entry.name));
    else if (entry.isFile()) symlinkSync(join(source, entry.name), join(target, entry.name));
  }
}
linkRoutes(join(root, "app"), join(app, "app"));
for (const name of ["components", "hooks", "lib", "public", "node_modules",
  "instrumentation.ts", "instrumentation-node.ts", "proxy.ts", "postcss.config.mjs", "tailwind.config.ts"]) {
  symlinkSync(join(root, name), join(app, name));
}
for (const name of ["package.json", "tsconfig.json"]) copyFileSync(join(root, name), join(app, name));
// Only widen Turbopack source resolution for the symlinked graph; product config is otherwise unchanged.
writeFileSync(join(app, "next.config.ts"), `import candidate from ${JSON.stringify(join(root, "next.config.ts"))};\nexport default { ...candidate, outputFileTracingRoot: "/", turbopack: { ...candidate.turbopack, root: "/" } };\n`);
process.env.JITI_FS_CACHE = "false";
process.env.SUBAGENT_MODEL_FIXTURE_LOG = join(results, "fixture.jsonl");
process.env.SUBAGENT_MODEL_NETWORK_GUARD = "1";
const { createHistoryFixtures, startBackend, TARGET, REPLACEMENT, SEARCH_MARKER } = await import(fixture);
const { SessionManager } = await import("@earendil-works/pi-coding-agent");

writeFileSync(join(agent, "settings.json"), JSON.stringify({
  defaultProvider: TARGET.provider, defaultModel: TARGET.modelId, defaultThinkingLevel: "off",
  enabledModels: ["gateway/**"],
  extensions: [fixture, "-builtin:mcp", "-builtin:codemode", "-builtin:tool-search"],
  packages: [], compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off",
}));
writeFileSync(join(agent, "auth.json"), "{}");
writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: {} }));
writeFileSync(join(agent, "agents/settings.json"), JSON.stringify({ builtInEnabled: true }));
const settingsBefore = readFileSync(join(agent, "settings.json"), "utf8");
const history = createHistoryFixtures(agent, project);
const oldFalseBefore = SessionManager.open(history.legacyFalse.path).getBranch()
  .find((entry) => entry.type === "custom" && entry.customType === "pi-web:subagent").data;
const controller = new AbortController();
const apiLog = [];
const browserErrors = [];
const blockedBrowserRequests = [];
const services = [];
const passedChecks = [];
const logs = [];
let service, backend, browser, context, page, base, failed = false;

function note(text) { console.log(text); appendFileSyncLog(text); }
function appendFileSyncLog(text) {
  // A single runner owns the log; keep it available even if Chromium cannot launch.
  writeFileSync(join(results, "runner.log"), text + "\n", { flag: "a" });
}
async function until(label, condition, timeout = 120000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    controller.signal.throwIfAborted();
    const value = await condition();
    if (value) return value;
    await delay(150, undefined, { signal: controller.signal });
  }
  throw new Error(`Timed out: ${label}`);
}
async function freePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  assert.notEqual(port, 30141, "Never use the original dev port");
  return port;
}
async function api(path, body, expectSuccess = true) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET", signal: AbortSignal.timeout(60000),
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  apiLog.push({ path, command: body, status: response.status, data });
  if (expectSuccess) assert.ok(response.ok && !data.error, `${path}: ${JSON.stringify(data)}`);
  return { status: response.status, data };
}
const command = (id, body, expectSuccess) => api(`/api/agent/${id}`, body, expectSuccess);
const state = async (id) => (await api(`/api/agent/${id}`)).data;
const tools = async (id) => {
  const { data } = await command(id, { type: "get_tools" });
  const list = data.data?.tools ?? data.data;
  assert.ok(Array.isArray(list), JSON.stringify(data));
  return list;
};
function entries(path) { return SessionManager.open(path).getBranch(); }
function selected(path) { return entries(path).filter((entry) => entry.type === "model_change").at(-1); }
function assertSelected(path, target = TARGET) {
  const model = selected(path);
  assert.ok(model, "An explicit standard model_change must exist");
  assert.equal(model.provider, target.provider);
  assert.equal(model.modelId, target.modelId);
}
function assertZeroFallback() {
  const events = existsSync(process.env.SUBAGENT_MODEL_FIXTURE_LOG)
    ? readFileSync(process.env.SUBAGENT_MODEL_FIXTURE_LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
  assert.equal(events.filter((entry) => entry.kind === "sentinel-request").length, 0, "OpenRouter/Kimi requests must remain zero");
  assert.equal(events.filter((entry) => entry.kind === "blocked-network").length, 0, "No external TCP attempts; only exact Next dev metadata is isolated before networking");
  assert.deepEqual(blockedBrowserRequests, [], "Browser must request loopback resources only");
  assert.ok(backend.calls.every((call) => call.provider === "gateway"));
}
async function startService(phase) {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  const logPath = join(results, `next-${phase}.log`);
  const log = createWriteStream(logPath);
  logs.push(log);
  // Default-cwd routes see only the isolated facade, never real /home ancestors.
  const env = {
    PATH: process.env.PATH, HOME: home, TMPDIR: tmp, PI_TASK_TMPDIR: tmp,
    PI_CODING_AGENT_DIR: agent, XDG_CACHE_HOME: join(tmp, "cache"),
    PI_OFFLINE: "1", PI_WEB_PASSWORD: "", PI_WEB_DISABLE_MCP: "1", PI_WEB_SKIP_VERSION_CHECK: "1",
    PI_WEB_IDLE_TIMEOUT_MS: "2000", NEXT_TELEMETRY_DISABLED: "1", JITI_FS_CACHE: "false",
    SUBAGENT_MODEL_BACKEND: backend.url,
    SUBAGENT_MODEL_FIXTURE_LOG: process.env.SUBAGENT_MODEL_FIXTURE_LOG,
    SUBAGENT_MODEL_NETWORK_GUARD: "1", SUBAGENT_MODEL_NEXT_DEV_OFFLINE: "1", NODE_OPTIONS: `--import=${fixture}`,
    SUBAGENT_MODEL_PROJECT: project,
  };
  const child = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", app,
    "--turbopack", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: project, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const owned = { child, pid: child.pid, pgid: child.pid, port, phase, cwd: project, app, source: root, logPath,
    exited: new Promise((resolve) => { child.once("exit", resolve); child.once("error", resolve); }),
    closed: new Promise((resolve) => child.once("close", resolve)) };
  service = owned;
  services.push(owned);
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  child.once("error", (error) => { owned.error = error; });
  writeFileSync(join(results, "services.json"), JSON.stringify(services.map((entry) => ({
    pid: entry.pid, pgid: entry.pgid, port: entry.port, phase: entry.phase, cwd: entry.cwd, app: entry.app, source: entry.source, logPath: entry.logPath,
  })), null, 2));
  note(`START ${phase}: pid=${owned.pid} pgid=${owned.pgid} port=${port} spawnCwd=${project} app=${app} source=${root} log=${logPath}`);
  await until(`Next ${phase} readiness`, async () => {
    if (owned.error) throw owned.error;
    assert.equal(child.exitCode, null, `Next exited; see ${logPath}`);
    try { return (await fetch(`${base}/api/sessions`, { signal: AbortSignal.timeout(3000) })).ok; }
    catch { return false; }
  });
}
async function stopService() {
  const owned = service;
  if (!owned) return;
  service = undefined;
  const kill = (signal) => {
    if (!owned.pid) return;
    try { process.kill(-owned.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  // This exact spawned process group owns Next and its dev worker, never a port lookup/pkill.
  kill("SIGTERM");
  const force = setTimeout(() => kill("SIGKILL"), 10000);
  await owned.exited;
  clearTimeout(force);
  // The leader may exit before a worker finishes; remove only its owned group.
  kill("SIGKILL");
  await owned.closed;
  note(`STOP ${owned.phase}: pid=${owned.pid}`);
}
async function newContext(width) {
  context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width === 390,
    locale: "en-US", serviceWorkers: "block" }); // No video configured.
  await context.tracing.start({ screenshots: true, snapshots: true });
  await context.addInitScript(() => localStorage.setItem("pi-locale", "en"));
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "[::1]"].includes(url.hostname)) return route.continue();
    blockedBrowserRequests.push(url.href);
    return route.abort("blockedbyclient");
  });
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => browserErrors.push(error.message));
}
async function closeContext() {
  if (!context) return;
  await context.tracing.stop(); // Discard successful trace; failure handler saves only failure trace.
  await context.close(); context = undefined; page = undefined;
}
async function visit(id, answer) {
  await page.goto(`${base}/?session=${id}`, { waitUntil: "domcontentloaded" });
  if (answer) await page.getByText(answer, { exact: true }).last().waitFor();
  await page.locator(".chat-input-textarea").waitFor();
}
async function modelButton() {
  const more = page.locator("[data-mobile-toolbar-more=true]");
  if (await more.isVisible() && await more.getAttribute("aria-expanded") !== "true") await more.click();
  const button = page.locator(".model-selector.is-toolbar > button");
  await button.waitFor();
  return button;
}
async function assertLabel(target = TARGET) {
  const button = await modelButton();
  await until(`model label ${target.name}`, async () => (await button.innerText()).includes(target.name));
}
async function sendBrowser(id, message, expectedMarker) {
  const textarea = page.locator(".chat-input-textarea");
  await textarea.fill(message);
  const pending = page.waitForResponse((response) => response.url() === `${base}/api/agent/${id}`
    && response.request().method() === "POST" && response.request().postDataJSON()?.type === "prompt");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const response = await pending;
  const data = await response.json();
  apiLog.push({ browser: true, id, message, status: response.status(), data });
  assert.ok(response.ok() && !data.error, JSON.stringify(data));
  await page.getByText(new RegExp(`FIXTURE-ANSWER:.*${expectedMarker}`)).last().waitFor();
  await until("prompt settled", async () => {
    const current = await state(id);
    return !current.state?.isStreaming && !current.state?.isPromptRunning;
  });
}
async function assertSearch(id, path, query) {
  const list = await tools(id);
  assert.ok(list.some((tool) => tool.name === "web_search" && tool.active), "Late web_search is active");
  assert.ok(!list.some((tool) => ["Agent", "get_subagent_result", "steer_subagent", "ask_user"].includes(tool.name)));
  for (const name of ["read", "grep", "find", "ls"]) {
    assert.ok(list.some((tool) => tool.name === name && tool.active), `Explore coding tool active: ${name}`);
  }
  const searchRequest = backend.calls.find((call) => JSON.stringify(call.context.messages).includes(`E2E_SEARCH:${query}`)
    && call.context.messages.some((message) => message.role === "system" && message.toolsAdded?.some((tool) => tool.name === "web_search")));
  assert.ok(searchRequest, `Real provider transcript declares delayed search for ${query}`);
  const declarations = searchRequest.context.messages.filter((message) => message.role === "system")
    .flatMap((message) => message.toolsAdded ?? []).map((tool) => tool.name);
  for (const name of ["read", "grep", "find", "ls", "web_search"]) {
    assert.ok(declarations.includes(name), `Actual provider declaration for ${query}: ${name}`);
  }
  assert.ok(backend.searches.some((search) => search.query === query));
  const result = entries(path).find((entry) => entry.type === "message" && entry.message.role === "toolResult"
    && entry.message.toolName === "web_search" && JSON.stringify(entry.message.content).includes(`${SEARCH_MARKER}:${query}`));
  assert.ok(result, `Actual local tool result persisted for ${query}`);
  assertSelected(path);
  assertZeroFallback();
}
async function checkForm(width) {
  const sidebar = page.locator("#session-sidebar");
  if ((await sidebar.getAttribute("class"))?.includes("sidebar-closed")) {
    await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
  }
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog").filter({ has: page.locator(".settings-dialog-surface") });
  await dialog.waitFor();
  const mobilePicker = dialog.getByRole("combobox", { name: "Settings", exact: true });
  if (await mobilePicker.isVisible()) await mobilePicker.selectOption({ label: "Sub-agents" });
  else await dialog.getByRole("navigation", { name: "Settings", exact: true })
    .getByRole("button", { name: "Sub-agents", exact: true }).click();
  await dialog.getByRole("button", { name: "New sub-agent", exact: true }).click();
  const extensions = dialog.getByRole("checkbox", { name: "Load extensions", exact: true });
  await extensions.waitFor();
  assert.equal(await extensions.isChecked(), true, "New AgentsConfig defaults extensions on");
  assert.equal(await dialog.getByRole("checkbox", { name: "Load skills", exact: true }).isChecked(), false);
  await extensions.scrollIntoViewIfNeeded();
  const bounds = await extensions.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, "Resource control stays within viewport");
  await page.screenshot({ path: join(results, `new-profile-${width}.png`) });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await dialog.waitFor({ state: "hidden" }); // No save: do not mutate profiles.
  if (width === 390 && (await sidebar.getAttribute("class"))?.includes("sidebar-open")) {
    // Mobile sidebar overlays the toolbar toggle; dismiss its actual exposed
    // backdrop as a user would, rather than force-clicking an occluded button.
    await page.locator(".sidebar-overlay-backdrop").click({ position: { x: width - 10, y: 400 } });
    await until("mobile sidebar closed", async () => (await sidebar.getAttribute("class"))?.includes("sidebar-closed"));
  }
}
const interrupt = () => {
  controller.abort(new Error("Interrupted"));
  void browser?.close().catch(() => {});
};
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);

try {
  backend = await startBackend();
  await startService("warm");
  browser = await chromium.launch({ executablePath, headless: true,
    args: ["--disable-background-networking", "--disable-component-update", "--no-first-run"] });
  await newContext(1280);
  const created = (await api("/api/agent/new", { type: "ensure_session", cwd: project,
    provider: TARGET.provider, modelId: TARGET.modelId, thinkingLevel: "off" })).data;
  const parentId = created.sessionId;
  assert.ok(parentId);
  // ensure_session alone may not persist a file yet; the first real SDK turn does.
  await command(parentId, { type: "prompt", message: "E2E_PARENT_HELLO" });
  await until("parent persisted", async () => {
    const current = await state(parentId);
    return !current.state?.isStreaming && !current.state?.isPromptRunning
      && Boolean(await SessionManager.findById(project, parentId));
  });
  await visit(parentId);
  await assertLabel();
  await checkForm(1280);
  passedChecks.push("parent label 1280", "new profile defaults 1280");
  await sendBrowser(parentId, "E2E_DELEGATE_NEW", `${SEARCH_MARKER}:new`);
  const all = await SessionManager.listAll();
  const child = all.map((info) => ({ info, meta: entries(info.path).find((entry) => entry.type === "custom"
    && entry.customType === "pi-web:subagent")?.data }))
    .find(({ meta }) => meta?.parentSessionId === parentId && meta.description === "E2E inherited child");
  assert.ok(child, "A real Agent tool run must create the child");
  const id = child.info.id;
  const path = child.info.path;
  assert.equal(child.meta.resourceSnapshot.loadExtensions, true);
  assert.deepEqual(child.meta.resourceSnapshot.toolPolicy?.extensionAllow, ["ext:*"]);
  await assertSearch(id, path, "new");
  await visit(id);
  await assertLabel();
  await page.screenshot({ path: join(results, "child-new-1280.png") });
  passedChecks.push("new child: inherited resources, GPT, search, coding declarations, label");
  note(`PASS new real child ${id}: native gateway/fixture-gpt, delayed local search, model label`);
  await closeContext(); // Release real SSE leases before testing idle disposal.
  await until("child idle shutdown", async () => !(await state(id)).running);
  await newContext(1280);
  await visit(parentId);
  await sendBrowser(parentId, `E2E_RESUME:${id}:warm`, `${SEARCH_MARKER}:warm`);
  await assertSearch(id, path, "warm");
  await visit(id);
  await assertLabel();
  await command(id, { type: "reload" });
  await sendBrowser(id, "E2E_SEARCH:reload", `${SEARCH_MARKER}:reload`);
  await assertSearch(id, path, "reload");
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertLabel();
  await page.screenshot({ path: join(results, "child-warm-reload-1280.png") });
  passedChecks.push("warm same-id resume after idle", "extension reload", "browser refresh label");
  note(`PASS same-id Agent resume after idle + extension reload + browser refresh: ${id}`);
  await closeContext();
  await stopService();

  // New Next process, no parent wrapper opened. A misleading physical historical
  // Kimi response must not replace the explicit GPT selection on this branch.
  const { fauxAssistantMessage } = await import("@earendil-works/pi-ai");
  const childManager = SessionManager.open(path);
  childManager.appendMessage({ ...fauxAssistantMessage("E2E physical Kimi historical answer"),
    provider: "openrouter", model: "moonshotai/kimi-k2.6" });
  const coldLeaf = childManager.getLeafId();
  await startService("cold");
  assert.equal((await state(parentId)).running, false, "Cold child must not require opening the parent");
  await newContext(390);
  await visit(id, "E2E physical Kimi historical answer");
  await assertLabel();
  assert.equal(SessionManager.open(path).getSessionId(), id);
  assert.equal(SessionManager.open(path).getLeafId(), coldLeaf, "Opening history must not change branch/leaf");
  await sendBrowser(id, "E2E_SEARCH:cold", `${SEARCH_MARKER}:cold`);
  await assertSearch(id, path, "cold");
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertLabel();
  await checkForm(390);
  await page.screenshot({ path: join(results, "child-cold-390.png") });
  passedChecks.push("cold process without parent: historical Kimi ignored", "cold search + label 390", "new profile defaults 390");
  note(`PASS cold process, no parent runtime, historical Kimi ignored, 390px GPT label + search`);

  await visit(history.unavailable.id, "E2E unavailable old answer");
  const beforeRefusal = entries(history.unavailable.path);
  const beforeRequests = backend.calls.length;
  const draft = "E2E_SEARCH:recovered";
  await page.locator(".chat-input-textarea").fill(draft);
  const rejectedPromptPosts = [];
  const observeRejectedPrompt = (request) => {
    if (request.url() === `${base}/api/agent/${history.unavailable.id}`
      && request.method() === "POST" && request.postDataJSON()?.type === "prompt") rejectedPromptPosts.push(request.postDataJSON());
  };
  page.on("request", observeRejectedPrompt);
  // A cold unavailable selection refuses during the real SSE readiness handshake,
  // before the prompt POST. Audit that stronger boundary rather than requiring a POST.
  const rejection = page.waitForResponse((response) => response.url() === `${base}/api/agent/${history.unavailable.id}/events`
    && response.request().method() === "GET");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const response = await rejection;
  const startupEvents = (await response.text()).split("\n\n")
    .filter((frame) => frame.startsWith("data: ")).map((frame) => JSON.parse(frame.slice(6)));
  const rejected = startupEvents.find((event) => event.type === "startup_error");
  apiLog.push({ browser: true, phase: "unavailable-pre-prompt", status: response.status(), data: rejected });
  assert.ok(rejected, "actual SSE startup refusal must be present");
  assert.equal(rejected.code, "model_selection_failed");
  assert.equal(rejected.prePromptRejected, true);
  assert.equal(rejected.modelSelection.reason, "model-unavailable");
  assert.equal(rejected.modelSelection.provider, TARGET.provider);
  assert.equal(rejected.modelSelection.modelId, "retired-gpt");
  assert.ok(!startupEvents.some((event) => event.type === "connected"), "failed startup must not advertise readiness");
  assert.match(JSON.stringify(rejected), /retired-gpt/);
  await page.getByText(/not sent|no (?:model )?request (?:was )?sent/i).last().waitFor();
  await until("rejected draft restored", async () => (await page.locator(".chat-input-textarea").inputValue()) === draft);
  await page.getByText(/gateway\/retired-gpt/).last().waitFor();
  assert.deepEqual(rejectedPromptPosts, [], "startup rejection must dispatch zero prompt POSTs");
  page.off("request", observeRejectedPrompt);
  assert.equal(backend.calls.length, beforeRequests, "Unavailable model must send zero model requests");
  assert.deepEqual(entries(history.unavailable.path), beforeRefusal, "Refusal must retain history/result/branch without fake completion");
  assertZeroFallback();
  await page.screenshot({ path: join(results, "unavailable-draft-390.png") });
  passedChecks.push("unavailable model: explicit not-sent, draft/history retained, zero provider calls");

  const switchResponse = page.waitForResponse((response) => response.url() === `${base}/api/agent/${history.unavailable.id}`
    && response.request().method() === "POST" && response.request().postDataJSON()?.type === "set_model");
  await (await modelButton()).click();
  await page.getByRole("listbox").getByText(REPLACEMENT.name, { exact: true }).click();
  const switched = await switchResponse;
  assert.ok(switched.ok(), await switched.text());
  assertSelected(history.unavailable.path, REPLACEMENT); // Standard SDK setModel persistence, not constructor state.
  assert.equal(backend.calls.length, beforeRequests, "set_model must not issue a model request");
  await assertLabel(REPLACEMENT);
  assert.equal(await page.locator(".chat-input-textarea").inputValue(), draft, "Explicit selection preserves draft");
  await sendBrowser(history.unavailable.id, draft, `${SEARCH_MARKER}:recovered`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertLabel(REPLACEMENT);
  assertSelected(history.unavailable.path, REPLACEMENT);
  await page.screenshot({ path: join(results, "explicit-recovery-390.png") });
  passedChecks.push("real picker: standard model_change then successful retry and refresh");
  note("PASS unavailable original target: real browser refusal/draft preserved; explicit set_model persisted; send/reload successful");

  const beforeFalseRequests = backend.calls.length;
  const oldFalse = await command(history.legacyFalse.id, { type: "prompt", message: "E2E_SEARCH:forbidden-old-false" }, false);
  assert.ok(oldFalse.status >= 400, "Old false with no proven provider source must refuse rather than inherit");
  assert.equal(oldFalse.data.code, "prompt_rejected");
  assert.equal(oldFalse.data.accepted, false);
  assert.equal(backend.calls.length, beforeFalseRequests);
  const afterFalse = entries(history.legacyFalse.path).find((entry) => entry.type === "custom" && entry.customType === "pi-web:subagent").data;
  assert.deepEqual(afterFalse, oldFalseBefore, "Old false/tools exact snapshot must not be widened or migrated");
  assert.ok(!backend.searches.some((search) => search.query === "forbidden-old-false"));
  const falseEvents = readFileSync(process.env.SUBAGENT_MODEL_FIXTURE_LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  assert.ok(!falseEvents.some((event) => event.kind === "session-start" && event.sessionId === history.legacyFalse.id),
    "Old false must not gain fixture lifecycle permission");
  assert.equal(readFileSync(join(agent, "settings.json"), "utf8"), settingsBefore, "No global defaults were written");
  assertZeroFallback();
  assert.deepEqual(browserErrors, [], "No page exceptions");
  passedChecks.push("legacy false: fail-closed without permission widening", "global defaults unchanged", "zero Kimi/external model/search/TCP", "no page exceptions");
  note("PASS legacy false fail-closed, global defaults unchanged, zero OpenRouter/Kimi/external requests");
} catch (error) {
  failed = true; process.exitCode = 1;
  console.error(error); appendFileSyncLog(String(error.stack ?? error));
  await page?.screenshot({ path: join(results, "failure.png") }).catch(() => {});
  await context?.tracing.stop({ path: join(results, "failure-trace.zip") }).catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  await stopService().catch((error) => { failed = true; process.exitCode = 1; appendFileSyncLog(`Cleanup failure: ${error}`); });
  await backend?.close().catch((error) => { failed = true; process.exitCode = 1; appendFileSyncLog(`Backend cleanup failure: ${error}`); });
  for (const log of logs) { log.end(); await once(log, "finish").catch(() => {}); }
  writeFileSync(join(results, "api.json"), JSON.stringify(apiLog, null, 2));
  writeFileSync(join(results, "backend.json"), JSON.stringify({ calls: backend?.calls, searches: backend?.searches }, null, 2));
  const events = existsSync(process.env.SUBAGENT_MODEL_FIXTURE_LOG)
    ? readFileSync(process.env.SUBAGENT_MODEL_FIXTURE_LOG, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
  const counts = { modelCalls: backend?.calls.length ?? 0, searches: backend?.searches.length ?? 0,
    kimi: events.filter((event) => event.kind === "sentinel-request").length,
    externalTcpAttempts: events.filter((event) => event.kind === "blocked-network").length,
    devOnlyUpdateSuppressed: events.filter((event) => event.kind === "dev-only-update-suppressed").length };
  writeFileSync(join(results, "summary.json"), JSON.stringify({ passed: !failed, passedChecks, counts, executablePath, browserErrors,
    blockedBrowserRequests, home, agent, project, source: root, results, evidence,
    untested: ["Safari", "Windows", "real pi-sub2api extension", "live/paid providers", "native search request hooks"] }, null, 2));
  mkdirSync(evidence, { recursive: true });
  for (const name of readdirSync(tmp).filter((name) => name.startsWith("next-panic-") && name.endsWith(".log"))) {
    copyFileSync(join(tmp, name), join(evidence, name));
  }
  for (const entry of readdirSync(results, { withFileTypes: true })) {
    if (entry.isFile()) copyFileSync(join(results, entry.name), join(evidence, entry.name));
  }
  console.log(`Evidence: ${relative(root, evidence)}`);
  if (!failed) {
    // Leave no test HOME/project/backend/session data; formal evidence has already been copied.
    for (const path of [home, project, app, join(tmp, "cache"), results]) rmSync(path, { recursive: true, force: true });
  }
  process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt);
}
