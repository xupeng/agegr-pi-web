// OFFLINE host-chain browser test: real Next routes + SDK discovery + faux provider.
// Default source is a tiny test protocol peer, NOT the actual installed package.
// Set ASK_USER_HOST_SOURCE to an independently copied installed source for a real-source smoke.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tmp = process.env.PI_TASK_TMPDIR;
assert.ok(tmp && existsSync(tmp), "Run under pi-tmp-run with PI_TASK_TMPDIR");
assert.ok(!existsSync(join(root, ".next/dev/lock")), "Use a checkout without a running dev graph");
const agent = join(tmp, "agent");
const home = join(tmp, "home");
const project = join(tmp, "project");
const results = join(tmp, "results");
const pkg = join(tmp, "discovered-package");
for (const dir of [agent, home, project, results, pkg, join(agent, "extensions")]) mkdirSync(dir, { recursive: true });
const source = process.env.ASK_USER_HOST_SOURCE || join(root, "lib/ask-user/fixtures/protocol-package");
// Copy only package entry/modules, never node_modules/.git/.codegraph or the Web tree.
for (const entry of readdirSync(source, { withFileTypes: true })) {
  if (entry.isFile() && (entry.name === "package.json" || /\.(ts|js)$/.test(entry.name)) && !/\.test\./.test(entry.name)) {
    cpSync(join(source, entry.name), join(pkg, entry.name));
  }
}
assert.ok(existsSync(join(pkg, "package.json")));
cpSync(join(root, "e2e/fixtures/ask-user-faux-provider.ts"), join(agent, "extensions/ask-host-provider.ts"));
writeFileSync(join(agent, "settings.json"), JSON.stringify({ packages: [pkg],
  defaultProvider: "ask-host-faux", defaultModel: "ask-host", defaultThinkingLevel: "off",
  extensions: ["-builtin:mcp", "-builtin:codemode", "-builtin:tool-search"],
  compaction: { enabled: false }, retry: { enabled: false }, cacheWarming: "off",
}));
writeFileSync(join(agent, "pi-web-settings.json"), '{"askUser":false}');
const callLog = join(results, "faux-calls.jsonl");
const log = createWriteStream(join(results, "server.log"));
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
let server, browser, context, deviceContext, page, failed = false;
const tracing = process.env.E2E_TRACE === "1";
try {
  server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: root, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1", JITI_FS_CACHE: "false",
      PI_WEB_ASK_USER: "0", PI_WEB_PASSWORD: "", PI_WEB_DISABLE_MCP: "1", ASK_USER_HOST_CALL_LOG: callLog, NEXT_TELEMETRY_DISABLED: "1" },
  });
  server.stdout.pipe(log, { end: false }); server.stderr.pipe(log, { end: false });
  async function api(path, body) {
    const res = await fetch(base + path, { method: body ? "POST" : "GET", signal: AbortSignal.timeout(60000),
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    assert.equal(res.status, 200, `${path}: ${await res.clone().text()}`);
    return res.json();
  }
  async function until(fn) {
    const end = Date.now() + 120000;
    while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(200); }
    throw new Error("Host fixture condition timed out");
  }
  await until(async () => {
    assert.equal(server.exitCode, null, "isolated server exited");
    try { return (await fetch(base, { signal: AbortSignal.timeout(3000) })).ok; } catch { return false; }
  });
  const created = await api("/api/agent/new", { cwd: project, type: "ensure_session", provider: "ask-host-faux", modelId: "ask-host", thinkingLevel: "off" });
  const id = created.sessionId;
  const toolResponse = await api(`/api/agent/${id}`, { type: "get_tools" });
  writeFileSync(join(results, "tools.json"), JSON.stringify(toolResponse, null, 2));
  const tools = toolResponse.data?.tools ?? toolResponse.data;
  assert.ok(Array.isArray(tools), JSON.stringify(toolResponse));
  const asks = tools.filter((t) => t.name === "ask_user");
  assert.equal(asks.length, 1); assert.equal(asks[0].exposure, "model-only");
  assert.equal(asks[0].sourceInfo.source, pkg);
  const state = async () => (await api(`/api/agent/${id}`)).state;
  await api(`/api/agent/${id}`, { type: "prompt", message: "HOST ask now" });
  const pending = await until(async () => (await state())?.pendingAsk);
  assert.ok(pending.askId);
  assert.equal(JSON.parse(readFileSync(join(agent, "pi-web-open-asks.json"), "utf8")).asks[id].askId, pending.askId);
  await until(async () => { const s = await state(); return !s?.isStreaming && !s?.isPromptRunning; });
  assert.equal(readFileSync(callLog, "utf8").trim().split("\n").length, 1, "direct ask terminates before a second provider request");
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  if (tracing) await context.tracing.start({ screenshots: true, snapshots: true });
  page = await context.newPage();
  const retiredFetches = []; page.on("request", (request) => { if (request.url().includes("/api/settings/ask-user")) retiredFetches.push(request.url()); });
  await page.addInitScript(() => localStorage.setItem("pi-locale", "en"));
  await page.goto(`${base}/?session=${id}`, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-ask-user-view="shared"]');
  await card.getByRole("dialog").waitFor(); assert.equal(await card.count(), 1);
  // Navigate away through a second actual persisted session, then restore the ask.
  const otherId = "ask-host-navigation-fixture";
  const sessionDir = join(agent, "sessions", "host-navigation"); mkdirSync(sessionDir, { recursive: true });
  const timestamp = new Date().toISOString();
  writeFileSync(join(sessionDir, `host-navigation_${otherId}.jsonl`), [
    { type: "session", version: 3, id: otherId, timestamp, cwd: project },
    { type: "message", id: "nav-user", parentId: null, timestamp, message: { role: "user", content: "HOST other history" } },
    { type: "message", id: "nav-answer", parentId: "nav-user", timestamp, message: { role: "assistant", content: [{ type: "text", text: "HOST navigation history answer" }] } },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  await page.goto(`${base}/?session=${otherId}`, { waitUntil: "domcontentloaded" });
  await page.getByText("HOST navigation history answer", { exact: true }).waitFor();
  assert.equal(await card.count(), 0);
  await page.goto(`${base}/?session=${id}`, { waitUntil: "domcontentloaded" });
  await card.getByRole("dialog").waitFor();
  assert.equal((await state()).pendingAsk.askId, pending.askId, "switching sessions preserves pending identity");
  await page.reload({ waitUntil: "domcontentloaded" }); await card.getByRole("dialog").waitFor();
  assert.equal((await state()).pendingAsk.askId, pending.askId, "refresh preserves identity");
  // Existing set_tools with an unpinned configured loadout gracefully shuts down
  // and rebuilds the wrapper. There is no production "kill" endpoint to invent.
  const rebuilt = await api(`/api/agent/${id}`, { type: "set_tools" });
  assert.equal(rebuilt.data.recreated, true); assert.equal(rebuilt.data.sessionId, id);
  assert.equal((await state()).pendingAsk.askId, pending.askId, "wrapper rebuild hydrates the original askId");
  await page.reload({ waitUntil: "domcontentloaded" }); await card.getByRole("dialog").waitFor();
  // Independent device with SSE deliberately unavailable: only state polling
  // can close its view after the first device submits.
  deviceContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await deviceContext.addInitScript(() => localStorage.setItem("pi-locale", "en"));
  const device = await deviceContext.newPage();
  await device.route(`**/api/agent/${id}/events`, (route) => route.abort());
  let polls = 0;
  device.on("request", (request) => { if (request.url().includes(`/api/sessions/${id}/state`)) polls++; });
  await device.goto(`${base}/?session=${id}`, { waitUntil: "domcontentloaded" });
  const remoteCard = device.locator('[data-ask-user-view="shared"]');
  await remoteCard.getByRole("dialog").waitFor(); const initialPolls = polls;
  await card.getByRole("radio").first().click();
  await card.getByRole("checkbox").first().click(); await card.getByRole("checkbox").last().click();
  await card.locator('input[type="text"]').nth(2).fill("HOST custom answer");
  await card.locator("textarea").fill("HOST supplement");
  await card.getByRole("button", { name: "Submit", exact: true }).click();
  await card.waitFor({ state: "detached" });
  await remoteCard.waitFor({ state: "detached", timeout: 15000 });
  assert.ok(polls > initialPolls, "independent device used the periodic state poll to close");
  await page.getByText(/HOST CONTINUED:/).first().waitFor();
  assert.equal((await state()).pendingAsk, undefined);
  assert.equal(readFileSync(callLog, "utf8").trim().split("\n").length, 2, "answer continues on the same session");
  const followup = JSON.parse(readFileSync(callLog, "utf8").trim().split("\n")[1]).text;
  for (const text of ["HOST custom answer", "HOST supplement", "Unanswered.", "selected small", "selected eu", "selected us"]) assert.ok(followup.includes(text), text);
  // Reload through the actual wrapper, then invoke/cancel another ask with real commands.
  await api(`/api/agent/${id}`, { type: "reload" });
  await api(`/api/agent/${id}`, { type: "prompt", message: "HOST ask again" });
  const next = await until(async () => (await state())?.pendingAsk);
  assert.notEqual(next.askId, pending.askId);
  await card.getByRole("dialog").waitFor();
  await card.getByRole("button", { name: "Cancel", exact: true }).click(); await card.waitFor({ state: "detached" });
  await until(async () => readFileSync(callLog, "utf8").trim().split("\n").length === 4);
  assert.equal((await state()).pendingAsk, undefined);
  // Browser evidence for settings retirement, not just the absence of fetches.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  // The dialog is .settings-dialog-backdrop with a .settings-dialog-surface,
  // not .settings-dialog. Keep its locator stable while its aria-label translates.
  const settings = page.getByRole("dialog").filter({ has: page.locator(".settings-dialog-surface") });
  await settings.waitFor();
  await settings.getByRole("navigation", { name: "Settings", exact: true })
    .getByRole("button", { name: "General", exact: true }).click();
  const general = settings.locator(".settings-general");
  await general.getByRole("heading", { name: "General", exact: true }).waitFor();
  const languages = general.locator(".settings-language-options").getByRole("radio");
  assert.equal(await languages.count(), 3);
  const languageFor = (locale) => languages.filter({ has: page.getByText(locale, { exact: true }) });
  for (const locale of ["en", "zh-CN", "zh-TW"]) {
    const option = languageFor(locale);
    assert.equal(await option.count(), 1, `language option ${locale} is present`);
    await option.scrollIntoViewIfNeeded();
    await option.click();
    await until(async () => (await option.getAttribute("aria-checked")) === "true");
    assert.deepEqual(await page.evaluate(() => ({
      lang: document.documentElement.lang, stored: localStorage.getItem("pi-locale"),
    })), { lang: locale, stored: locale });
    assert.doesNotMatch(await general.innerText(), /ask.?user|向用户提问|向使用者提问/i);
    assert.equal(await general.getByRole("button", { name: /Reload session|重新加载会话|重新載入工作階段/i }).count(), 0);
  }
  await languageFor("en").click();
  await until(async () => (await languageFor("en").getAttribute("aria-checked")) === "true");
  assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
  assert.equal(await page.evaluate(() => localStorage.getItem("pi-locale")), "en");
  const appearance = general.getByRole("radiogroup", { name: "Appearance", exact: true });
  const light = appearance.getByRole("radio", { name: "Light", exact: true });
  // Click the real label: its native input is deliberately sr-only.
  await appearance.locator('.settings-theme-option:has(input[name="theme"][value="light"])').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light"
    && localStorage.getItem("pi-theme") === "light");
  assert.equal(await light.isChecked(), true, "unrelated Appearance setting still works");
  await settings.getByRole("button", { name: "Close", exact: true }).click();
  await settings.waitFor({ state: "detached" });
  for (const method of ["get", "put"]) {
    const response = await page.request[method](`${base}/api/settings/ask-user`, method === "put" ? { data: { enabled: false } } : {});
    assert.equal(response.status(), 404, `retired AskUser ${method.toUpperCase()} endpoint is absent`);
  }
  assert.deepEqual(retiredFetches, []);
  await page.screenshot({ path: join(results, "host-closed.png") });
  console.log(`PASS offline host browser chain (${process.env.ASK_USER_HOST_SOURCE ? "explicit installed-source copy" : "minimal protocol fixture only"}), session ${id}`);
} catch (error) {
  failed = true; process.exitCode = 1; console.error(error);
  await page?.screenshot({ path: join(results, "failure.png") }).catch(() => {});
} finally {
  if (tracing) await context?.tracing.stop(failed ? { path: join(results, "failure-trace.zip") } : {}).catch(() => {});
  await deviceContext?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    const kill = (signal) => { try { if (process.platform === "win32") server.kill(signal); else process.kill(-server.pid, signal); } catch {} };
    kill("SIGTERM"); const timer = setTimeout(() => kill("SIGKILL"), 10000); await exited; clearTimeout(timer);
  }
  log.end();
}
