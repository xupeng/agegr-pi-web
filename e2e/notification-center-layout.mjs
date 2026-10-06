// Narrow, self-contained FRONT-END layout proof for the desktop notification
// overlay against an ALREADY RUNNING pi-web dev server.
//
// It never starts a second Next server and never reaches the live API: every
// /api/** request from the page is fulfilled by local read-only fixtures, so it
// cannot trigger agent/new/commands, MCP writes, notification ack/import or any
// write to the real agent directory. It proves front-end geometry only.
//
//   E2E_LAYOUT_BASE_URL=http://192.168.11.233:8505 \
//   PLAYWRIGHT_EXECUTABLE_PATH=/sbin/chromium \
//   pi-tmp-run --keep-on-failure notif-layout -- node e2e/notification-center-layout.mjs
//
// The center is a modal <dialog>, so sidebar/file-panel controls are not
// reachable while it is open. Sidebar and right-panel changes are therefore
// applied between opens and the overlay is re-measured; only window resize is
// exercised while the overlay stays open.
//
// --list prints the plan and exits without launching a browser.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DESKTOP_VIEWPORTS = [
  { width: 667, height: 900 },
  { width: 800, height: 900 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
];
const MOBILE_VIEWPORT = { width: 390, height: 780 };
const MAX_WIDTH = 460;
const GAP = 12;
const plan = [
  { name: "desktop-column-anchor", ac: "AC14", description: "667/800/1024/1280: overlay centered in the real chat column within 12px gaps, below toolbar" },
  { name: "viewport-resize", ac: "AC14", description: "Resize the window while the overlay is open and re-measure" },
  { name: "sidebar-toggle", ac: "AC14", description: "Collapse/expand the sidebar and re-measure" },
  { name: "sidebar-drag", ac: "AC14", description: "Drag the sidebar resize handle and re-measure" },
  { name: "right-file-panel", ac: "AC14", description: "Open the real right file panel and re-measure" },
  { name: "mobile-fullscreen", ac: "AC14", description: "390px: overlay fullscreen with a >=44px close target" },
  { name: "both-panels-narrow-column", ac: "AC14", description: "Both panels expanded, large sidebar and right-panel drag, real narrow column" },
  { name: "breakpoint-roundtrip", ac: "AC14", description: "Keep dialog open through 641/640/390/641/1024px" },
  { name: "long-list-scroll-close", ac: "AC14", description: "Many fixture items scroll within the constrained list, header and buttons remain reachable" },
  { name: "compact-max-sidebar", ac: "AC14", description: "641px with sidebar dragged to its real maximum: narrowest compact chat column and wrapped controls" },
];
if (process.argv.includes("--list")) {
  console.log(JSON.stringify({
    plan,
    notAutomated: [
      "real iOS safe-area and hardware rotation",
      "server-side/API acceptance",
      "notification state, ack, navigation or SDK behavior",
      "sidebar/right-panel changes while the modal backdrop is up (not user-reachable; measured on reopen instead)",
    ],
  }, null, 2));
  process.exit(0);
}

const base = process.env.E2E_LAYOUT_BASE_URL ?? "http://192.168.11.233:8505";
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "/sbin/chromium";
const taskTmp = process.env.PI_TASK_TMPDIR;
assert.ok(taskTmp && isAbsolute(taskTmp) && existsSync(taskTmp), "Run inside pi-tmp-run so PI_TASK_TMPDIR exists");
const results = join(taskTmp, "results");
mkdirSync(results, { recursive: true });
const runId = new Date().toISOString().replace(/[:.]/g, "-");
// Chromium's process-singleton socket is length-limited (~108 bytes) and is
// created under the browser's own TMPDIR even for a persistent profile. The
// pi-tmp workspace path is too long for it, so the browser gets a short private
// TMPDIR under ~/.cache while the actual profile stays in PI_TASK_TMPDIR. The
// short dir is removed in the finally block.
const browserTmp = join(homedir(), ".cache", "pi-ncl", `${process.pid.toString(36)}${Date.now().toString(36)}`);
mkdirSync(browserTmp, { recursive: true, mode: 0o700 });
const evidence = join(root, ".trellis/tasks/10-06-notification-center-sync/research/validation-logs", `layout-${runId}`);
mkdirSync(evidence, { recursive: true });
const sourcePaths = ["components/AppShell.tsx", "components/NotificationCenter.tsx", "components/NotificationCenter.test.mjs", "app/globals.css", "e2e/notification-center-layout.mjs", "package.json", "package-lock.json"];
const hashSources = () => Object.fromEntries(sourcePaths.map((path) => [path, createHash("sha256").update(readFileSync(join(root, path))).digest("hex")]));
const sourceHashes = hashSources();
const report = {
  kind: "frontend-layout-only",
  base, executablePath, runId,
  sourceRoot: root, taskTmp, results, evidence,
  browserTmp,
  sourceHashes,
  startedAt: new Date().toISOString(),
  scenarios: plan.map((entry) => ({ ...entry, status: "not-run" })),
  apiRequests: [], measurements: [], failures: [], screenshots: [], cssResponses: [],
  notAutomated: ["real iOS safe-area and hardware rotation", "server-side/API acceptance", "notification state, ack, navigation or SDK behavior"],
};
const scenario = (name) => report.scenarios.find((entry) => entry.name === name);

// Self-contained read-only fixtures. Nothing here mutates the live instance.
const asks = [
  { id: "ask:layout-a", kind: "ask", sessionId: "layout-a", requestId: "ask-a", projectKey: "project-a", projectName: "personal-assistant", sessionName: "多Agent持久化与消息展示", timestamp: "2026-10-06T13:00:00Z", summary: "新的 ask_user 问题：你希望消息详情默认展开，还是按需查看？" },
  { id: "ask:layout-b", kind: "ask", sessionId: "layout-b", requestId: "ask-b", projectKey: "project-b", projectName: "agegr-pi-web", sessionName: "修复子代理恢复时丢失 provider 与静默换模", timestamp: "2026-10-06T12:59:00Z", summary: "新的 ask_user 问题：请确认失败时保留原始 provider 与 model，并明确显示诊断信息。" },
];
const SNAPSHOT = { instanceId: "layout-fixture", epoch: "layout-epoch", sequence: 1, storageHealth: "ok", items: asks };
const LONG_SNAPSHOT = { ...SNAPSHOT, items: Array.from({ length: 60 }, (_, i) => ({ ...asks[i % 2], id: `ask:long-${i}`, sessionId: `long-${i}` })) };
function fixture(method, pathname, snapshot) {
  if (method !== "GET") return { status: 403, body: { error: "layout-fixture refuses all writes" } };
  if (pathname === "/api/notifications") {
    return { status: 200, body: snapshot };
  }
  if (pathname === "/api/notifications/events") return { status: 200, sse: "event: connected\ndata: {}\n\n" };
  if (pathname === "/api/projects") return { status: 200, body: { projects: [], runningSessionIds: [], completionNotificationSuppressedSessionIds: [] } };
  if (pathname === "/api/sessions") return { status: 200, body: { sessions: [], sessionListVersion: 0, runningSessionIds: [], completionNotificationSuppressedSessionIds: [] } };
  if (pathname === "/api/agent/running") return { status: 200, body: { runningSessionIds: [], sessions: [] } };
  if (pathname === "/api/home") return { status: 200, body: { home: "/" } };
  if (pathname === "/api/default-cwd") return { status: 200, body: { cwd: "/" } };
  if (pathname === "/api/web-auth") return { status: 200, body: { enabled: false, authenticated: true } };
  if (pathname === "/api/worktrees") return { status: 200, body: { worktrees: [] } };
  if (pathname === "/api/open-in-explorer") return { status: 200, body: { enabled: false } };
  return { status: 200, body: {} };
}
async function installStubs(context, snapshot) {
  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    report.apiRequests.push({ method: request.method(), path: url.pathname });
    const stub = fixture(request.method(), url.pathname, snapshot);
    report.apiRequests[report.apiRequests.length - 1].status = stub.status;
    if (stub.sse !== undefined) {
      await route.fulfill({ status: stub.status, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" }, body: stub.sse });
      return;
    }
    await route.fulfill({
      status: stub.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify(stub.body),
    });
  });
}

async function measure(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector("dialog.notification-center");
    const anchor = document.querySelector('[data-notification-anchor="chat-column"]');
    if (!anchor) return null;
    const toolbar = anchor.parentElement?.firstElementChild;
    const c = anchor.getBoundingClientRect();
    const t = toolbar?.getBoundingClientRect();
    const result = {
      column: { left: c.left, right: c.right, top: c.top, width: c.width },
      toolbarBottom: t ? t.bottom : null,
    };
    if (!dialog) return { ...result, open: false, dialog: null, close: null };
    const d = dialog.getBoundingClientRect();
    const closeElement = dialog.querySelector(".notification-center-close");
    const close = closeElement?.getBoundingClientRect();
    const list = dialog.querySelector(".notification-center-list");
    const hit = close && document.elementFromPoint(close.left + close.width / 2, close.top + close.height / 2);
    return {
      ...result,
      open: dialog.open === true,
      dialog: { left: d.left, right: d.right, top: d.top, bottom: d.bottom, width: d.width, height: d.height },
      close: close ? { left: close.left, right: close.right, top: close.top, bottom: close.bottom, width: close.width, height: close.height, hittable: hit === closeElement || closeElement.contains(hit) } : null,
      actions: [...dialog.querySelectorAll(".notification-center-actions button")].map((button) => { const r = button.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }),
      headerStyle: { minWidth: getComputedStyle(dialog.querySelector("h2")).minWidth, overflowWrap: getComputedStyle(dialog.querySelector("h2")).overflowWrap },
      list: { height: list.clientHeight, scrollHeight: list.scrollHeight, scrollTop: list.scrollTop },
      itemCount: dialog.querySelectorAll(".notification-center-item").length,
      sidebarOpen: document.querySelector("#session-sidebar")?.classList.contains("sidebar-open"),
      rightPanelOpen: document.querySelector("#file-panel")?.classList.contains("right-panel-open"),
    };
  });
}

function assertDesktop(name, sample, viewport) {
  assert.ok(sample?.open, `${name}: dialog is open`);
  const { dialog: d, column: c } = sample;
  const columnCenter = c.left + c.width / 2;
  const dialogCenter = d.left + d.width / 2;
  assert.ok(Math.abs(dialogCenter - columnCenter) <= 2, `${name}: centered (Δ${(dialogCenter - columnCenter).toFixed(2)}px) at ${viewport}px`);
  assert.ok(d.width <= MAX_WIDTH + 0.5, `${name}: max width ${d.width.toFixed(1)}px at ${viewport}px`);
  assert.ok(d.width <= c.width - 24 + 0.5, `${name}: column width cap ${d.width} <= ${c.width}-24`);
  assert.ok(d.left >= c.left + GAP - 2, `${name}: left gap ${(d.left - c.left).toFixed(1)}px at ${viewport}px`);
  assert.ok(d.right <= c.right - GAP + 2, `${name}: right gap ${(c.right - d.right).toFixed(1)}px at ${viewport}px`);
  assert.ok(d.left >= GAP - 2 && d.right <= viewport - GAP + 2, `${name}: stays on screen at ${viewport}px`);
  assert.ok(sample.toolbarBottom !== null && d.top >= sample.toolbarBottom - 1 && d.top <= sample.toolbarBottom + 2,
    `${name}: below toolbar (top ${d.top.toFixed(1)} vs toolbar ${sample.toolbarBottom?.toFixed(1)}) at ${viewport}px`);
  assertControls(name, sample);
}

function assertControls(name, sample) {
  const { close, dialog: d, actions } = sample;
  assert.ok(close.width >= 44 && close.height >= 44 && close.hittable, `${name}: close target reachable`);
  assert.ok(close.left >= d.left && close.right <= d.right && close.top >= d.top && close.bottom <= d.bottom, `${name}: close inside dialog`);
  assert.equal(sample.headerStyle.minWidth, "0px", `${name}: served CSS lets header shrink`);
  assert.equal(sample.headerStyle.overflowWrap, "anywhere", `${name}: served CSS lets title wrap`);
  for (const b of actions) assert.ok(b.left >= d.left && b.right <= d.right && b.bottom <= d.bottom, `${name}: action wraps inside dialog`);
}

async function screenshot(page, name) {
  const path = join(evidence, `${name}.png`);
  await page.screenshot({ path });
  report.screenshots.push(path.replace(root + "/", ""));
}

async function openCenter(page) {
  // Fixture publication and a settled paint precede the user click. In dev a
  // just-reloaded SSR bell can be visible before its event handler hydrates.
  await page.waitForFunction(() => Number(document.querySelector(".notification-bell-count")?.textContent) > 0);
  await page.waitForTimeout(500);
  await page.locator(".notification-bell").click();
  await page.locator("dialog.notification-center[open]").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(() => {
    const dialog = document.querySelector("dialog.notification-center");
    return Boolean(dialog) && getComputedStyle(dialog).getPropertyValue("--notification-center-left").trim().endsWith("px");
  }, null, { timeout: 10_000 });
}
async function closeCenter(page) {
  await page.keyboard.press("Escape");
  await page.locator("dialog.notification-center").waitFor({ state: "detached", timeout: 10_000 });
}
const sidebarToggle = (page) => page.locator('[data-notification-anchor="chat-column"] >> xpath=../div[1]/div[1]/button[1]');
const rightPanelToggle = (page) => page.locator('button[aria-controls="file-panel"]:not(.file-panel-expand-button)').first();

// Profile/results stay in PI_TASK_TMPDIR. Singleton sockets use browserTmp,
// so PI_TASK_TMPDIR itself need not satisfy the Unix socket path limit.
async function runScenario(slot, viewport, extra, fn, snapshot = SNAPSHOT) {
  const profile = join(taskTmp, "bp", slot);
  const context = await chromium.launchPersistentContext(profile, {
    ...(existsSync(executablePath) ? { executablePath } : {}),
    env: { ...process.env, TMPDIR: browserTmp },
    viewport, locale: "en-US", deviceScaleFactor: 1, serviceWorkers: "block", ...extra,
  });
  let page;
  try {
    await installStubs(context, snapshot);
    page = await context.newPage();
    page.on("response", async (response) => {
      if (!new URL(response.url()).pathname.endsWith(".css")) return;
      try {
        const css = await response.text();
        report.cssResponses.push({ url: response.url(), sha256: createHash("sha256").update(css).digest("hex"), anchored: css.includes("--notification-center-left"), headerRule: css.match(/\.notification-center h2\s*\{[^}]*\}/)?.[0] ?? null, actionsRule: css.match(/\.notification-center-actions button\s*\{[^}]*\}/)?.[0] ?? null });
      } catch { /* context may be closing */ }
    });
    await fn(page);
  } catch (error) {
    if (page) await screenshot(page, `failure-${slot}`).catch(() => {});
    throw error;
  } finally {
    await context.close().catch(() => {});
  }
}

async function desktopScenarios(page, viewport) {
  await page.goto(`${base}/?layout-proof=${runId}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-notification-anchor="chat-column"]').waitFor({ timeout: 30_000 });
  await page.locator(".notification-bell").waitFor({ timeout: 30_000 });
  const record = (step, sample) => {
    report.measurements.push({ viewport, step, sample });
    return sample;
  };

  // 1) Baseline: default layout, sidebar open, right panel closed.
  await openCenter(page);
  const baseline = record("baseline", await measure(page));
  assertDesktop("desktop-column-anchor", baseline, viewport.width);
  scenario("desktop-column-anchor").status = "pass";
  assert.equal(baseline.itemCount, 2, "two ask fixtures are rendered, not an empty snapshot");
  await screenshot(page, `baseline-${viewport.width}`);

  // 2) Window resize while the overlay stays open.
  const resizedWidth = viewport.width <= 700 ? viewport.width + 60 : viewport.width - 40;
  await page.setViewportSize({ width: resizedWidth, height: viewport.height });
  await page.waitForTimeout(400);
  assertDesktop("viewport-resize", record("viewport-resized", await measure(page)), resizedWidth);
  scenario("viewport-resize").status = "pass";
  await page.setViewportSize(viewport);
  await page.waitForTimeout(300);
  await closeCenter(page);

  // 3) Sidebar collapse / expand.
  await sidebarToggle(page).click();
  await page.waitForTimeout(400);
  await openCenter(page);
  const collapsed = record("sidebar-collapsed", await measure(page));
  assertDesktop("sidebar-toggle", collapsed, viewport.width);
  assert.ok(collapsed.column.left < baseline.column.left - 1, "sidebar collapse moved the chat column left");
  await closeCenter(page);
  await sidebarToggle(page).click();
  await page.waitForTimeout(400);
  await openCenter(page);
  const expanded = record("sidebar-expanded", await measure(page));
  assertDesktop("sidebar-toggle", expanded, viewport.width);
  assert.ok(Math.abs(expanded.column.left - baseline.column.left) <= 2, "sidebar expand restored the column");
  await closeCenter(page);
  scenario("sidebar-toggle").status = "pass";

  // 4) Sidebar drag (real handle).
  const handle = page.locator('[data-resize-handle="sidebar"]');
  await handle.waitFor({ timeout: 10_000 });
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await openCenter(page);
  const dragged = record("sidebar-dragged", await measure(page));
  assertDesktop("sidebar-drag", dragged, viewport.width);
  assert.ok(dragged.column.width < expanded.column.width - 1, "sidebar drag narrowed the chat column");
  await closeCenter(page);
  await sidebarToggle(page).click();
  await page.waitForTimeout(400);
  scenario("sidebar-drag").status = "pass";

  // 5) Real right file panel. At >=960px it is a split pane that narrows the
  //    chat column; at 641-959px it is an overlay whose backdrop also covers
  //    the bell, so the column must simply stay put.
  const preRight = record("right-panel-closed", await measure(page));
  await rightPanelToggle(page).click();
  await page.locator("#file-panel.right-panel-open").waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  const rightOpen = record("right-panel-open", await measure(page));
  if (viewport.width >= 960) {
    await openCenter(page);
    assertDesktop("right-file-panel", await measure(page), viewport.width);
    assert.ok(rightOpen.column.width < preRight.column.width - 1, "split right panel narrowed the chat column");
    await closeCenter(page);
  } else {
    assert.ok(Math.abs(rightOpen.column.width - preRight.column.width) <= 1, "compact overlay must not resize the chat column");
    report.compactRightPanelOverlay = [...(report.compactRightPanelOverlay ?? []), viewport.width];
  }
  scenario("right-file-panel").status = "pass";
}

async function bothPanels(page) {
  await page.goto(`${base}/?layout-proof=${runId}`, { waitUntil: "domcontentloaded" });
  await page.locator(".notification-bell").waitFor();
  // Real pointer drag, not injected CSS or geometry. Start with a large left
  // sidebar before opening the right split; AppShell may reclamp it naturally.
  const drag = async (selector, dx) => {
    const b = await page.locator(selector).boundingBox();
    assert.ok(b, `real resize handle ${selector}`);
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  };
  await drag('[data-resize-handle="sidebar"]', 220);
  await rightPanelToggle(page).click();
  await page.locator("#file-panel.right-panel-open").waitFor();
  await page.waitForTimeout(600);
  await drag('[data-resize-handle="right-panel"]', 300);
  await drag('[data-resize-handle="sidebar"]', 300);
  await openCenter(page);
  let sample = await measure(page);
  report.measurements.push({ viewport: { width: 1280, height: 900 }, step: "both-panels-large-sidebar", sample });
  assert.ok(sample.sidebarOpen && sample.rightPanelOpen, "both panels really expanded");
  assert.ok(sample.column.left >= 400 && sample.column.width > 24, "large left sidebar with a usable chat column");
  assertDesktop("both-panels-narrow-column", sample, 1280);
  await screenshot(page, "both-panels-1280");
  for (const width of [1024, 960, 641, 640, 390, 641, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(500);
    sample = await measure(page);
    report.measurements.push({ viewport: { width, height: 900 }, step: "open-breakpoint-roundtrip", sample });
    assert.ok(sample?.open, "dialog remains open across breakpoint");
    if (width > 640) assertDesktop("breakpoint-roundtrip", sample, width);
    else {
      assert.ok(sample.dialog.left <= 1 && sample.dialog.right >= width - 1 && sample.dialog.top <= 1 && sample.dialog.height >= 899, "mobile fullscreen during roundtrip");
      assertControls("breakpoint-roundtrip-mobile", sample);
    }
    await screenshot(page, `roundtrip-${width}-${report.measurements.length}`);
  }
  scenario("both-panels-narrow-column").status = "pass";
  scenario("breakpoint-roundtrip").status = "pass";
  assert.ok(sample.list.scrollHeight > sample.list.height && sample.list.height > 0, "long content has constrained scroll area");
  await page.locator(".notification-center-list").evaluate((list) => { list.scrollTop = list.scrollHeight; });
  const scrolled = await measure(page);
  assert.ok(scrolled.list.scrollTop > 0, "list actually scrolls");
  assertControls("long-list-scroll-close", scrolled);
  report.measurements.push({ viewport: { width: 1024, height: 900 }, step: "long-list-scrolled", sample: scrolled });
  await screenshot(page, "long-list-scrolled");
  await page.locator(".notification-center-close").click();
  await page.locator("dialog.notification-center").waitFor({ state: "detached" });
  assert.ok(await page.locator(".notification-bell").evaluate((bell) => bell === document.activeElement), "native modal close returns focus to bell");
  scenario("long-list-scroll-close").status = "pass";
}

let failed = false;
try {
  let slot = 0;
  for (const viewport of DESKTOP_VIEWPORTS) {
    slot += 1;
    await runScenario(String(slot), viewport, {}, (page) => desktopScenarios(page, viewport));
  }
  await runScenario("b", { width: 1280, height: 900 }, {}, bothPanels, LONG_SNAPSHOT);
  await runScenario("c", { width: 641, height: 900 }, {}, async (page) => {
    await page.goto(`${base}/?layout-proof=${runId}`, { waitUntil: "domcontentloaded" });
    const handle = page.locator('[data-resize-handle="sidebar"]');
    await handle.waitFor();
    const b = await handle.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 400, b.y + b.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await openCenter(page);
    const sample = await measure(page);
    report.measurements.push({ viewport: { width: 641, height: 900 }, step: "compact-max-sidebar", sample });
    assertDesktop("compact-max-sidebar", sample, 641);
    assert.ok(sample.sidebarOpen && sample.column.left >= 320 && sample.column.width <= 321, "real resizer clamps to a 320px compact column");
    assert.ok(sample.list.scrollHeight > sample.list.height && sample.list.height > 0, "narrow long list remains scrollable");
    await page.locator(".notification-center-list").evaluate((list) => { list.scrollTop = list.scrollHeight; });
    const scrolled = await measure(page);
    assertControls("compact-max-sidebar-scrolled", scrolled);
    assert.ok(scrolled.list.scrollTop > 0);
    await screenshot(page, "compact-641-max-sidebar");
    await page.locator(".notification-center-close").click();
    await page.locator("dialog.notification-center").waitFor({ state: "detached" });
    scenario("compact-max-sidebar").status = "pass";
  }, LONG_SNAPSHOT);

  // Mobile: fullscreen panel, 44px close target, Escape close.
  await runScenario("m", MOBILE_VIEWPORT, { hasTouch: true, isMobile: true }, async (page) => {
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator(".notification-bell").waitFor({ timeout: 30_000 });
    await openCenter(page);
    const sample = await measure(page);
    report.measurements.push({ viewport: MOBILE_VIEWPORT, step: "mobile-fullscreen", sample });
    assert.ok(sample?.open, "mobile: dialog open");
    assert.ok(sample.dialog.left <= 1 && sample.dialog.right >= MOBILE_VIEWPORT.width - 1, `mobile: fullscreen width (${sample.dialog.left}..${sample.dialog.right})`);
    assert.ok(sample.dialog.top <= 1, `mobile: fullscreen top (${sample.dialog.top})`);
    assert.ok(sample.dialog.height >= MOBILE_VIEWPORT.height - 1, "mobile: fullscreen height");
    assert.ok(sample.close && sample.close.width >= 44 && sample.close.height >= 44, `mobile: 44px close target (${JSON.stringify(sample.close)})`);
    assertControls("mobile-fullscreen", sample);
    await screenshot(page, "mobile-390");
    await page.keyboard.press("Escape");
    await page.locator("dialog.notification-center").waitFor({ state: "detached", timeout: 5_000 });
    scenario("mobile-fullscreen").status = "pass";
  });
} catch (error) {
  failed = true;
  report.failures.push(String(error?.stack ?? error));
  process.exitCode = 1;
} finally {
  rmSync(browserTmp, { recursive: true, force: true });
  report.browserTmpCleaned = !existsSync(browserTmp);
  report.sourceHashesAfter = hashSources();
  report.sourceUnchanged = JSON.stringify(report.sourceHashesAfter) === JSON.stringify(sourceHashes);
  if (!report.sourceUnchanged) { failed = true; process.exitCode = 1; report.failures.push("source identity changed during browser run"); }
  report.finishedAt = new Date().toISOString();
  report.status = failed ? "fail" : "pass";
  const reportPath = join(evidence, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const manifestPath = join(root, ".trellis/tasks/10-06-notification-center-sync/research/tablet-layout-source-manifest.json");
  writeFileSync(manifestPath, JSON.stringify({ runId, base, sourceHashes, sourceHashesAfter: report.sourceHashesAfter, sourceUnchanged: report.sourceUnchanged, report: reportPath.replace(root + "/", "") }, null, 2));
  console.log(`layout-report: ${reportPath}`);
  console.log(`status: ${report.status}`);
}
