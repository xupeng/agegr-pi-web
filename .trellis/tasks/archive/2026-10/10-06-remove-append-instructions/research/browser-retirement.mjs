import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const worktree = resolve(process.argv[2]);
assert.ok(!existsSync(join(worktree, ".next/dev/lock")), "Only use the isolated validation worktree");
const { chromium } = await import(pathToFileURL(join(worktree, "node_modules/playwright/index.mjs")).href);
const scope = mkdtempSync(join(process.env.PI_VALIDATION_TMP_BASE, "append-retirement-browser-"));
const home = join(scope, "home");
const agent = join(home, ".pi/agent");
const project = join(scope, "project");
const results = join(process.env.PI_TASK_TMPDIR, "results");
const evidence = join(dirname(fileURLToPath(import.meta.url)), "verification/browser");
for (const dir of [agent, project, results, evidence]) mkdirSync(dir, { recursive: true });
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const base = `http://127.0.0.1:${port}`;
const serverLog = createWriteStream(join(evidence, "server.log"));
const server = spawn(process.execPath, [join(worktree, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: worktree,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, HOME: home, PI_CODING_AGENT_DIR: agent, TMPDIR: scope, TMP: scope, TEMP: scope,
    PI_OFFLINE: "1", JITI_FS_CACHE: "false", PI_WEB_PASSWORD: "", NEXT_TELEMETRY_DISABLED: "1" },
});
const serverExited = once(server, "exit");
server.stdout.pipe(serverLog, { end: false });
server.stderr.pipe(serverLog, { end: false });
writeFileSync(join(evidence, "server-metadata.json"), JSON.stringify({ pid: server.pid, port, base, worktree, scope }, null, 2));
let browser;
let failed = false;
const report = { http: [], browser: [], errors: [] };
async function waitUntil(check) {
  for (let attempt = 0; attempt < 180; attempt++) {
    assert.equal(server.exitCode, null, "isolated dev server exited");
    if (await check()) return;
    await delay(500);
  }
  throw new Error("Isolated server did not become ready");
}
try {
  await waitUntil(async () => {
    try { return (await fetch(base, { signal: AbortSignal.timeout(3000) })).ok; }
    catch { return false; }
  });
  for (const method of ["GET", "PUT"]) {
    const response = await fetch(`${base}/api/append-system`, {
      method,
      signal: AbortSignal.timeout(60000),
      ...(method === "PUT" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "retirement-probe" }) } : {}),
    });
    assert.equal(response.status, 404, `${method} retired endpoint`);
    report.http.push({ method, path: "/api/append-system", status: response.status });
  }
  assert.equal(existsSync(join(agent, "APPEND_SYSTEM.md")), false, "Probe never wrote an agent instruction file");
  browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM_EXECUTABLE, headless: true });
  for (const [label, width, height, withProject] of [
    ["desktop-global", 1280, 800, false],
    ["mobile-global", 390, 844, false],
    ["desktop-project", 1280, 800, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: "en-US" });
    await context.addInitScript(() => {
      localStorage.setItem("pi-locale", "en");
      if (!localStorage.getItem("pi-web:settings-navigation")) {
        localStorage.setItem("pi-web:settings-navigation", JSON.stringify({ section: "append-system", selections: { models: "kept-model-selection", mcp: "kept-global-selection" } }));
      }
    });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(withProject ? `${base}/?cwd=${encodeURIComponent(project)}` : base, { waitUntil: "domcontentloaded" });
      const openSidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
      if (width <= 640) { await openSidebar.waitFor(); await openSidebar.click(); }
      const opener = page.getByRole("button", { name: "Settings", exact: true });
      await opener.click();
      const dialog = page.locator(".settings-dialog-backdrop");
      await dialog.waitFor();
      const picker = dialog.locator(".settings-mobile-section-picker");
      const tabs = dialog.locator(".settings-section-tabs");
      assert.deepEqual(await picker.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value)), ["general", "models", "skills", "agents", "plugins", "mcp"]);
      assert.equal(await picker.inputValue(), "general", "retired section restores to General");
      assert.equal(await tabs.locator("button").count(), 6);
      assert.equal(await dialog.getByText("Append instructions", { exact: true }).count(), 0);
      assert.equal(await dialog.locator(".append-system-editor").count(), 0);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pi-web:settings-navigation")));
      assert.equal(saved.section, "general");
      assert.deepEqual(saved.selections, { models: "kept-model-selection", mcp: "kept-global-selection" });
      await page.screenshot({ path: join(evidence, `${label}-general.png`) });
      const select = async (section, name) => {
        if (width <= 640) await picker.selectOption(section);
        else await tabs.getByRole("button", { name, exact: true }).click();
        assert.equal(await picker.inputValue(), section);
        await dialog.locator(".settings-section-host:not([hidden]) .config-panel-root").waitFor();
      };
      const modelsResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/models-config");
      await select("models", "Models");
      assert.equal((await modelsResponse).status(), 200, "Models loaded through its real settings API");
      const mcpResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/mcp");
      await select("mcp", "MCP");
      assert.equal((await mcpResponse).status(), 200, "MCP loaded through its real settings API");
      assert.equal(await dialog.locator(".settings-general").count(), 1, "visited General remains mounted");
      assert.equal(await dialog.locator(".settings-general").isVisible(), false);
      await page.screenshot({ path: join(evidence, `${label}-mcp.png`) });
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      if (width > 640) assert.equal(await opener.evaluate((node) => document.activeElement === node), true, "desktop focus returns to opener");
      await opener.click();
      await dialog.waitFor();
      assert.equal(await picker.inputValue(), "mcp", "global/project MCP selection restores");
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(requests.some((path) => path.startsWith("/api/append-system")), false);
      assert.ok(requests.includes("/api/models-config"), "Models made a real request");
      assert.ok(requests.includes("/api/mcp"), "MCP made a real request");
      assert.deepEqual(errors, [], "no browser runtime error");
      report.browser.push({ label, width, height, withProject, sections: 6, retiredRequests: 0, checks: ["General fallback", "selections retained", "Models/MCP", "visited pane mounted", "Escape/close", "MCP restored"], requests: [...new Set(requests.filter((path) => path.startsWith("/api/")))] });
      console.log(`${label}: passed`);
    } catch (error) {
      await page.screenshot({ path: join(evidence, `${label}-failure.png`) }).catch(() => {});
      throw error;
    } finally {
      await context.close();
    }
  }
} catch (error) {
  failed = true;
  report.errors.push(error.stack ?? String(error));
  throw error;
} finally {
  await browser?.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
  const stopped = await Promise.race([serverExited.then(() => true), delay(8000).then(() => false)]);
  if (!stopped) {
    try { process.kill(-server.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    await serverExited;
  }
  // Next may leave the recorded lock after group shutdown. Remove only our
  // own port's lock, and only after the worker PID is confirmed gone.
  const lockPath = join(worktree, ".next/dev/lock");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (lock.port === port) {
      let alive = true;
      for (let attempt = 0; attempt < 40; attempt++) {
        try { process.kill(lock.pid, 0); }
        catch (error) { if (error.code === "ESRCH") { alive = false; break; } throw error; }
        await delay(100);
      }
      assert.equal(alive, false, "our dev worker must be stopped before clearing its lock");
      rmSync(lockPath);
    }
  }
  serverLog.end();
  report.serverStopped = true;
  writeFileSync(join(evidence, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  rmSync(scope, { recursive: true, force: true });
  if (failed) process.exitCode = 1;
}
