// Regression coverage for the workspace-session restore race.
//
// `?session=<id>` is restored by the sidebar, which needs a round trip before the
// session is adopted. The workspace restore in AppShell's cwd handler runs in that
// same window and reads the remembered session synchronously — still the previous
// document's value — then selects it and rewrites the URL. A later reload therefore
// lands on the wrong session (this is what made `checkChatAppearance`'s reload
// flaky).
//
// The check makes that previous-document state deterministic instead of hoping for
// the right timing: it renders a session, points the per-workspace memory at a
// different session, and then loads the first one again from a fresh document.

import assert from "node:assert/strict";
import { join } from "node:path";

/** `lib/workspace-memory.ts` storage key. */
const MEMORY_KEY = "pi-web:last-open-by-workspace";

async function seedRememberedSession(page, staleSessionId) {
  await page.waitForFunction((key) => window.localStorage.getItem(key) !== null, MEMORY_KEY);
  const seeded = await page.evaluate(({ key, stale }) => {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    const next = Object.fromEntries(Object.keys(stored).map((workspace) => [workspace, stale]));
    window.localStorage.setItem(key, JSON.stringify(next));
    return next;
  }, { key: MEMORY_KEY, stale: staleSessionId });
  assert.ok(Object.keys(seeded).length > 0, "The sidebar must remember the open session per workspace");
}

export async function checkSessionRestore(page, { base, sessionId, staleSessionId, marker, artifactsDir }) {
  const open = async () => {
    await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
    await page.locator(marker).waitFor({ timeout: 10_000 });
  };
  const sessionParam = () => new URL(page.url()).searchParams.get("session");

  await open();
  await seedRememberedSession(page, staleSessionId);

  // A fresh document whose URL names a session while the workspace memory points at
  // another one: the URL must win, and it must keep winning after the restore window.
  await open();
  await page.waitForTimeout(1500);
  assert.equal(sessionParam(), sessionId, "An explicit ?session= must survive the remembered-session restore");
  if (artifactsDir) await page.screenshot({ path: join(artifactsDir, "session-restore.png") });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(marker).waitFor({ timeout: 10_000 });
  assert.equal(sessionParam(), sessionId, "Reloading must stay on the session named by the URL");
  console.log("PASS: an explicit ?session= outranks the remembered workspace session");
}
