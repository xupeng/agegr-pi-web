// Targeted browser check for ChatInput's slash-command menu keyboard navigation.
//
// Why this exists: `getNextSlashIndex` (geometry-based arrow navigation) and `handleKeyDown`
// depend on `displayedSlashCommands`, which the 2026-09 lint fix moved inside `useMemo`.
// A wrong dependency set there would show up as stale filtering or wrong highlight movement,
// and no existing script covers it (`grep slash e2e/run.mjs` has no hits).
//
// It boots its own dev server on a free port with an isolated PI_CODING_AGENT_DIR, so it can be
// pointed at an untouched fixture (baseline) and at the fixed tree, then diffed:
//
//   SLASH_MENU_ROOT=/path/to/repo node slash-menu-keyboard.mjs --out before.json
//   SLASH_MENU_ROOT=/path/to/repo node slash-menu-keyboard.mjs --out after.json
//   diff before.json after.json
//
// The script is self-checking: the committed value must equal the item that was highlighted
// immediately before Enter, and Escape must close the menu.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = process.env.SLASH_MENU_ROOT || "/home/xupeng/dev/personal/forked/agegr-pi-web";
const outArgIndex = process.argv.indexOf("--out");
const outPath = outArgIndex >= 0 ? process.argv[outArgIndex + 1] : null;

const require = createRequire(import.meta.url);
const { chromium } = require(join(root, "node_modules/playwright"));

const agentDir = mkdtempSync(join(tmpdir(), "pi-web-slash-"));
// A synthetic session is what makes the app render the composer with a cwd
// (same trick as e2e/run.mjs and e2e/subagents.mjs: write a session file, open ?session=<id>).
const project = join(agentDir, "project");
const sessionDir = join(agentDir, "sessions", "slash");
mkdirSync(project, { recursive: true });
mkdirSync(sessionDir, { recursive: true });
const FIXTURE_SESSION = "slash-menu-fixture";
const timestamp = "2026-09-22T00:00:00.000Z";
writeFileSync(
  join(sessionDir, `2026-09-22T00-00-00-000Z_${FIXTURE_SESSION}.jsonl`),
  [
    { type: "session", version: 3, id: FIXTURE_SESSION, timestamp, cwd: project },
    {
      type: "message",
      id: "root",
      parentId: null,
      timestamp,
      message: { role: "user", content: "slash menu keyboard fixture" },
    },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n",
);
const serverLog = [];
let server;
let browser;
let page;

const collectMenu = (page) => page.evaluate(() => {
  // Palette items are the only buttons that are "/"-labelled *and* carry the item shape from
  // ChatInput's JSX (minHeight 58, column flex). The composer toolbar also renders a
  // "/"-prefixed button, so the style check keeps it out.
  const itemOf = (button) => {
    const label = (button.querySelector("span")?.textContent ?? "").trim();
    if (!label.startsWith("/")) return null;
    const style = button.getAttribute("style") ?? "";
    if (!style.includes("min-height:") || !style.includes("flex-direction: column")) return null;
    return {
      button,
      name: label.split(/\s+/)[0],
      active: /var\(--accent\)/.test(style),
    };
  };
  const items = Array.from(document.querySelectorAll("button")).map(itemOf).filter(Boolean);
  return {
    names: items.map((item) => item.name),
    activeIndex: items.findIndex((item) => item.active),
  };
});

// Same shape test as collectMenu, as a page-side predicate for waitForFunction.
const PALETTE_ITEM_PREDICATE = () => Array.from(document.querySelectorAll("button")).some((button) => {
  const label = (button.querySelector("span")?.textContent ?? "").trim();
  const style = button.getAttribute("style") ?? "";
  return label.startsWith("/")
    && style.includes("min-height:")
    && style.includes("flex-direction: column");
});

const cleanup = async () => {
  await browser?.close().catch(() => {});
  server?.kill("SIGTERM");
};

try {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${port}`;

  server = spawn(
    process.execPath,
    [join(root, "node_modules/next/dist/bin/next"), "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: root,
      env: {
        ...process.env,
        PI_CODING_AGENT_DIR: agentDir,
        PI_WEB_PASSWORD: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverLog.push(String(chunk)));

  const deadline = Date.now() + 180_000;
  for (;;) {
    if (Date.now() > deadline) throw new Error("dev server did not become ready in 180s");
    try {
      // Any non-5xx answer means Next is serving; API routes are origin-gated from a bare
      // fetch, so do not use them as the readiness probe.
      const response = await fetch(`${base}/`, { signal: AbortSignal.timeout(5000) });
      if (response.status < 500) break;
    } catch {
      // not ready yet
    }
    await delay(1000);
  }

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // First load compiles the session route plus a dozen API routes; allow well beyond the 30s default.
  await page.goto(`${base}/?session=${FIXTURE_SESSION}`, { waitUntil: "domcontentloaded", timeout: 120_000 });

  const composer = page.locator("textarea.chat-input-textarea").first();
  await composer.waitFor({ state: "visible", timeout: 120_000 });
  // A session that is still hydrating remounts the composer mid-sequence and would drop the
  // palette, so wait for the load to finish before driving the keyboard.
  await page.waitForFunction(
    () => !document.body.innerText.includes("Loading session"),
    null,
    { timeout: 120_000 },
  );
  await delay(500);

  // Typing before hydration silently loses the keystroke, so open the palette with a retry
  // loop and require a real palette item (not just any "/"-labelled button) to be present.
  const openPaletteWith = async (text) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await composer.fill("");
      await composer.click();
      await composer.type(text, { delay: 15 });
      try {
        await page.waitForFunction(PALETTE_ITEM_PREDICATE, null, { timeout: 15_000 });
        return;
      } catch {
        await delay(500);
      }
    }
    throw new Error(`slash palette did not open for ${JSON.stringify(text)}`);
  };

  // 1) Open the palette with "/" and snapshot the full list.
  await openPaletteWith("/");
  const opened = await collectMenu(page);
  assert.ok(opened.names.length > 1, `expected several slash commands, got ${opened.names.length}`);

  // 2) Arrow navigation must move the highlight and stay inside the list.
  const keys = ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown"];
  const afterKeys = [];
  for (const key of keys) {
    await page.keyboard.press(key);
    await delay(60);
    const snapshot = await collectMenu(page);
    assert.equal(snapshot.names.length, opened.names.length, "arrow keys must not change the filtered list");
    assert.ok(snapshot.activeIndex >= 0, `no highlighted item after ${key}`);
    afterKeys.push({ key, active: snapshot.names[snapshot.activeIndex] });
  }

  // 3) Enter applies the highlighted command: the textarea becomes "/<name> ".
  const highlighted = afterKeys.at(-1).active;
  await page.keyboard.press("Enter");
  await delay(120);
  const committed = await composer.inputValue();
  assert.equal(committed, `${highlighted} `, "Enter must apply the highlighted command");
  const menuAfterEnter = await collectMenu(page);
  assert.equal(menuAfterEnter.names.length, 0, "applying a command must close the menu");

  // 4) Query changes must re-filter, then Escape must close without applying.
  await openPaletteWith("/re");
  await delay(80);
  const filtered = await collectMenu(page);
  assert.ok(filtered.names.length > 0, "expected at least one match for /re");
  // Matching is on command name *or* description, so the names themselves are not a reliable
  // oracle; the exact list is captured in the snapshot and compared before/after instead.
  assert.ok(
    filtered.names.length <= opened.names.length,
    `filtering must not grow the list: ${opened.names.length} -> ${filtered.names.length}`,
  );
  const valueBeforeEscape = await composer.inputValue();
  await page.keyboard.press("Escape");
  await delay(80);
  const afterEscape = await collectMenu(page);
  assert.equal(afterEscape.names.length, 0, "Escape must close the menu");
  assert.equal(await composer.inputValue(), valueBeforeEscape, "Escape must not rewrite the input");

  const snapshot = {
    root,
    opened: { count: opened.names.length, names: opened.names, activeIndex: opened.activeIndex },
    afterKeys,
    committed,
    filteredForRe: filtered.names,
    escaped: { menuItemsAfterEscape: afterEscape.names.length },
  };
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  process.stdout.write(json);
  if (outPath) writeFileSync(outPath, json);
  await cleanup();
} catch (error) {
  if (page) {
    try {
      const text = await page.evaluate(() => document.body.innerText.slice(0, 1500));
      console.error("--- page text (first 1500 chars) ---");
      console.error(text);
      await page.screenshot({ path: join(dirname(fileURLToPath(import.meta.url)), "slash-menu-failure.png") });
      console.error("screenshot: research/slash-menu-failure.png");
    } catch {
      // best effort
    }
  }
  await cleanup();
  console.error("--- server log (tail) ---");
  console.error(serverLog.join("").split("\n").slice(-25).join("\n"));
  throw error;
}
