// One-off Playwright smoke run for 09-28-chat-font-size-shortcut.
//
// Targets the dev server this checkout already had running (http://127.0.0.1:8505,
// reused per AGENTS.md — never restarted, never a second `next dev`). This is NOT
// the e2e suite: e2e/chat-appearance.mjs holds the committed assertions and was
// deliberately not executed (user chose manual acceptance).
//
//   node .trellis/tasks/09-28-chat-font-size-shortcut/research/smoke-font-size-shortcut.mjs
import { chromium } from "../../../../node_modules/playwright/index.mjs";

const log = (...a) => console.log("SMOKE", ...a);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://127.0.0.1:8505/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
log("title", await page.title());

const showSidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
if (await showSidebar.isVisible().catch(() => false)) await showSidebar.click();
await page.getByRole("button", { name: "Settings", exact: true }).click();
await page.getByRole("slider", { name: "Chat font size", exact: true }).waitFor({ timeout: 15000 });
const slider = page.getByRole("slider", { name: "Chat font size", exact: true });

const hintText = "Shortcut: Ctrl/⌘ + Shift + - / = / 0 (0 restores the default)";
log("hint", await page.getByText(hintText, { exact: true }).isVisible());
log("aria-keyshortcuts", await slider.getAttribute("aria-keyshortcuts"));
log("hint style", await page.getByText(hintText, { exact: true }).evaluate((el) => {
  const s = getComputedStyle(el);
  const out = document.querySelector(".settings-chat-range-header output");
  return { color: s.color, fontSize: s.fontSize, sameFamilyAsOutput: s.fontFamily === getComputedStyle(out).fontFamily };
}));

const applied = () => page.evaluate(() => document.documentElement.style.getPropertyValue("--chat-content-font-size"));
const stored = () => page.evaluate(() => localStorage.getItem("pi-chat-content-font-size"));

await slider.press("Home");
log("after Home", await slider.inputValue(), await applied());
await page.keyboard.press("Control+Shift+Minus");
log("ctrl+shift+minus at 12 (clamp)", await slider.inputValue(), await applied());
await page.keyboard.press("Control+Shift+Equal");
log("ctrl+shift+equal", await slider.inputValue(), await applied(), "stored", await stored());
await page.keyboard.press("Meta+Shift+Equal");
log("meta+shift+equal", await slider.inputValue(), await applied());
log("before ctrl+shift+0", await slider.inputValue());
await page.keyboard.press("Control+Shift+0");
log("ctrl+shift+0 (reset)", await slider.inputValue(), await applied(), "stored", await stored());
await page.keyboard.press("Control+Shift+Equal");
log("before meta+shift+0", await slider.inputValue());
await page.keyboard.press("Meta+Shift+0");
log("meta+shift+0 (reset)", await slider.inputValue(), await applied());
await page.keyboard.press("Control+Equal");
log("ctrl+equal (browser zoom, must not change ours)", await slider.inputValue(), await applied());
await page.keyboard.press("Control+0");
log("ctrl+0 (browser zoom reset, must not change ours)", await slider.inputValue(), await applied());

const field = page.locator("textarea, input[type='text'], input[type='search']").first();
if (await field.count()) {
  await field.focus();
  const tag = await field.evaluate((el) => el.tagName + ":" + (el.className || "").slice(0, 40));
  await page.keyboard.press("Control+Shift+Equal");
  log("with field focused", tag, await slider.inputValue(), await applied());
  await page.keyboard.press("Control+Shift+0");
  log("reset with field focused", await slider.inputValue(), await applied());
} else {
  log("no text field on the page to focus");
}
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
log("after reload", await page.evaluate(() => document.documentElement.style.getPropertyValue("--chat-content-font-size")), await page.evaluate(() => localStorage.getItem("pi-chat-content-font-size")));
log("page errors", errors.length ? errors : "none");
await browser.close();
