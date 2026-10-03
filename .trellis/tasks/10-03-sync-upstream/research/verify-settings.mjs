import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = process.cwd();
assert.ok(existsSync(join(root, "components/AppendSystemConfig.tsx")), "run from the candidate checkout");
assert.ok(!existsSync(join(root, ".next/dev/lock")), "never compete with an active dev server");
const { chromium } = createRequire(join(root, "package.json"))("playwright");
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert.ok(executablePath && existsSync(executablePath), "use the verified installed Chromium executable");
const artifacts = dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync("/var/tmp/pi-web-settings-smoke-");
const agentDir = join(scratch, "agent");
const home = join(scratch, "home");
const temp = join(scratch, "tmp");
for (const path of [agentDir, home, temp, join(agentDir, "sessions/settings")]) mkdirSync(path, { recursive: true });
// Playwright creates its profile using the parent process's os.tmpdir().
process.env.TMPDIR = temp;
writeFileSync(join(agentDir, "APPEND_SYSTEM.md"), "global smoke instructions\n");
writeFileSync(join(agentDir, "mcp.json"), JSON.stringify({ mcpServers: {
  globalSmoke: { command: process.execPath, args: ["-e", "process.exit(1)"], enabled: false },
} }));
const timestamp = "2026-10-03T00:00:00.000Z";
const fixtures = [1280, 390].map((width) => {
  const cwd = join(scratch, `project-${width}`);
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(join(cwd, ".pi/APPEND_SYSTEM.md"), "project smoke instructions\n");
  writeFileSync(join(cwd, ".pi/mcp.json"), JSON.stringify({ mcpServers: {
    localSmoke: { command: process.execPath, args: ["-e", "process.exit(1)"], enabled: false },
  } }));
  const id = `settings-smoke-${width}`;
  const entries = [
    { type: "session", version: 3, id, cwd, timestamp },
    { type: "message", id: "root", parentId: null, timestamp, message: { role: "user", content: `Settings fixture ${width}`, timestamp: Date.parse(timestamp) } },
  ];
  writeFileSync(join(agentDir, "sessions/settings", `2026-10-03T00-00-00-000Z_${id}.jsonl`), entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  return { width, cwd, id };
});
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
// A whitelist, not the host environment: no provider credentials or real Pi settings.
const env = {
  PATH: process.env.PATH, LANG: "C.UTF-8", HOME: home, TMPDIR: temp,
  PI_CODING_AGENT_DIR: agentDir, PI_WEB_PASSWORD: "", NEXT_TELEMETRY_DISABLED: "1",
};
const server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: root, env, stdio: ["ignore", "pipe", "pipe"],
});
const log = createWriteStream(join(artifacts, "settings-smoke-server.log"));
server.stdout.pipe(log, { end: false });
server.stderr.pipe(log, { end: false });
const exited = once(server, "exit");
let browser;
try {
  const deadline = Date.now() + 180_000;
  while (true) {
    if (server.exitCode !== null) throw new Error(`candidate server exited ${server.exitCode}`);
    try {
      const response = await fetch(`${base}/api/projects`, { signal: AbortSignal.timeout(10_000) });
      if (response.ok) break;
    } catch { /* Cold compilation can outlast one probe. */ }
    if (Date.now() > deadline) throw new Error("candidate HTTP preflight timed out");
    await delay(500);
  }
  browser = await chromium.launch({ executablePath, env });
  for (const { width, cwd, id } of fixtures) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: "en-US", ...(width < 640 ? { isMobile: true, hasTouch: true } : {}) });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/?session=${id}`, { waitUntil: "domcontentloaded" });
    await page.getByText(`Settings fixture ${width}`, { exact: true }).waitFor();
    if (width < 640) await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.waitFor();
    const selectSection = async (id, label) => {
      if (width < 640) await settings.locator(".settings-mobile-section-picker").selectOption(id);
      else await settings.locator(".settings-section-tabs").getByRole("button", { name: label, exact: true }).click();
    };
    await selectSection("mcp", "MCP");
    await settings.getByRole("button", { name: /^localSmoke:/ }).waitFor();
    await settings.getByRole("button", { name: /^globalSmoke:/ }).waitFor();
    await settings.getByText(/^global$/i).first().waitFor();
    await settings.getByText(/^project$/i).first().waitFor();
    await settings.getByRole("button", { name: /^Code mode:/ }).click();
    await settings.getByText("Automatic", { exact: true }).first().waitFor();
    await settings.getByText("Always on", { exact: true }).first().waitFor();
    await page.screenshot({ path: join(artifacts, `settings-mcp-${width}.png`) });
    await selectSection("append-system", "Append instructions");
    const editor = settings.locator(".append-system-editor");
    await editor.waitFor();
    await page.waitForFunction(() => document.querySelector(".append-system-editor")?.value === "global smoke instructions\n");
    assert.equal(await settings.locator(".append-system-override.is-active").count(), 0);
    await settings.locator(".append-system-override").waitFor();
    const draft = `unsaved ${width} draft\nKeep exactly this text.\n`;
    await editor.fill(draft);
    await selectSection("mcp", "MCP");
    await settings.getByRole("button", { name: "Trust project…", exact: true }).click();
    const trust = page.getByRole("dialog", { name: "Trust this project?", exact: true });
    await trust.waitFor();
    await trust.getByRole("button", { name: "Trust project", exact: true }).click();
    await trust.waitFor({ state: "hidden" });
    await selectSection("append-system", "Append instructions");
    await settings.locator(".append-system-override.is-active").waitFor();
    assert.equal(await editor.inputValue(), draft, "Trust must preserve the mounted editor's unsaved draft");
    const status = await (await page.request.get(`${base}/api/project-trust?cwd=${encodeURIComponent(cwd)}`)).json();
    assert.equal(status.trusted, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, [], "No browser runtime errors");
    await page.screenshot({ path: join(artifacts, `settings-append-trusted-${width}.png`) });
    console.log(`PASS: ${width}px Settings MCP global/project/Code mode; Trust updates Append hint and preserves unsaved draft`);
    await context.close();
  }
  console.log(`SETTINGS_SMOKE_PASS base=${base} fixture=${scratch}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([exited, delay(15_000)]);
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
  log.end();
}
