import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { I18nProvider } = await jiti.import("@/hooks/useI18n");
const { NotificationCenter, sortNotificationItems, computeNotificationCenterBox } = await jiti.import("./NotificationCenter.tsx");
const entry = (id, kind, timestamp = "2026-10-06T12:00:00Z") => ({ id, kind, sessionId: id, timestamp, summary: `<script>${id}</script>`, projectKey: "p", projectName: "Project", sessionName: id, origin: "live" });
function render(items = [], options = {}) {
  return renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(NotificationCenter, {
    state: { snapshot: { instanceId: "i", epoch: "e", sequence: 1, items, storageHealth: "ok" }, loading: false, error: null, connected: true, ...options },
    onClose() {}, onNavigate: async () => {}, onAcknowledgeAll: async () => {}, onRefresh: async () => {},
  })));
}

test("waits precede completions; each group sorts latest first without mutating source", () => {
  const items = [entry("completion", "completion"), entry("old-ask", "ask", "2026-10-05T12:00:00Z"), entry("extension", "extension")];
  assert.deepEqual(sortNotificationItems(items).map((item) => item.id), ["extension", "old-ask", "completion"]);
  assert.equal(items[0].id, "completion");
  const html = render(items);
  assert.ok(html.indexOf("Waiting for input</h3>") < html.indexOf("Completed, not yet viewed</h3>"));
  assert.match(html, /Project/); assert.match(html, /<time dateTime=/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Notifications \(3\)/);
});

test("empty, loading, synchronization, migration, ack and storage states are explicit", () => {
  assert.match(render(), /No pending notifications/);
  assert.match(render([], { loading: true }), /Loading notifications/);
  assert.doesNotMatch(render([], { loading: true }), /No pending notifications/);
  assert.match(render([], { error: "sync-failed" }), /role="alert"/);
  assert.match(render([], { error: "ack-failed" }), /They remain available/);
  assert.match(render([], { error: "legacy-import-failed" }), /local input is kept/);
  assert.match(render([], { connected: false }), /Connection interrupted/);
  assert.match(render([], { snapshot: { instanceId: "i", items: [], storageHealth: "degraded" } }), /storage is degraded/);
});

test("batch is disabled for pending-only lists and long lists render an initial bounded page", () => {
  assert.match(render([entry("q", "ask")]), /disabled="">Mark all completions as viewed/);
  assert.doesNotMatch(render([entry("result", "completion")]), /disabled="">Mark all completions as viewed/);
  const html = render(Array.from({ length: 300 }, (_, i) => entry(String(i), "completion")));
  assert.equal((html.match(/class="notification-center-item"/g) ?? []).length, 100);
  assert.match(html, /Show more/);
  assert.match(html, /does not dismiss|is not dismissed/);
});

test("modal captures Escape through shared focus helper and has mobile safe-area 44px close target", async () => {
  const source = await readFile(new URL("./NotificationCenter.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(render(), /aria-label="Close notifications"/);
  assert.match(render([entry("legacy", "completion")]), /Its unviewed status has been kept/);
  assert.match(render(), /aria-labelledby="notification-center-title"/);
  assert.match(source, /dialog.showModal\(\)/);
  assert.match(source, /openStackedDialog\(document, dialog/);
  assert.match(source, /dialog.close\(\); cleanup\(\)/);
  assert.ok(source.indexOf("const cleanup = openStackedDialog") < source.indexOf("    dialog.showModal();"));
  assert.match(css, /notification-center-close \{ width: 44px; height: 44px/);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.notification-center/);
  assert.match(css, /notification-center-header[^}]*safe-area-inset-top/);
  assert.doesNotMatch(source, /Notification\.requestPermission|ask_submit|ask_cancel|sendAgentCommand|dangerouslySetInnerHTML|chat-font-size-offset/);
});

test("desktop box centers on the real chat column across tablet/desktop widths", () => {
  const scenarios = [
    { viewport: 667, anchor: { left: 250, width: 417, top: 96 } },
    { viewport: 800, anchor: { left: 250, width: 550, top: 96 } },
    { viewport: 1024, anchor: { left: 280, width: 744, top: 96 } },
    { viewport: 1280, anchor: { left: 280, width: 680, top: 96 } },
    { viewport: 641, anchor: { left: 200, width: 150, top: 90 } },
    { viewport: 1024, anchor: { left: 480, width: 244, top: 36 } },
    { viewport: 641, anchor: { left: 321, width: 320, top: 36 } },
  ];
  for (const { viewport, anchor } of scenarios) {
    const box = computeNotificationCenterBox(anchor, { width: viewport }, 48);
    const columnCenter = anchor.left + anchor.width / 2;
    assert.ok(Math.abs(box.left + box.width / 2 - columnCenter) <= 2, `centered at ${viewport}`);
    assert.ok(box.width <= 460, `max width at ${viewport}`);
    assert.ok(box.width <= anchor.width - 24 + 1e-6, `bounded by column at ${viewport}`);
    assert.ok(box.left >= anchor.left + 12 - 1e-6, `left gap at ${viewport}`);
    assert.ok(box.left + box.width <= anchor.left + anchor.width - 12 + 1e-6, `right gap at ${viewport}`);
    assert.ok(box.left >= 12 && box.left + box.width <= viewport - 12, `on screen at ${viewport}`);
    assert.equal(box.top, anchor.top, `stays below toolbar at ${viewport}`);
  }
});

test("desktop box falls back only for unavailable columns, not narrow positive columns", () => {
  const fallback = computeNotificationCenterBox(null, { width: 667 }, 48);
  assert.equal(fallback.width, 460);
  assert.equal(fallback.top, 48);
  assert.ok(Math.abs(fallback.left + fallback.width / 2 - 667 / 2) <= 2);
  const collapsed = computeNotificationCenterBox({ left: 200, width: 150, top: 90 }, { width: 641 }, 48);
  assert.equal(collapsed.width, 126);
  assert.equal(collapsed.left, 212);
  assert.equal(collapsed.left + collapsed.width, 338);
  assert.ok(collapsed.left >= 12 && collapsed.left + collapsed.width <= 641 - 12);
  assert.equal(collapsed.top, 90);
  const zero = computeNotificationCenterBox({ left: 0, width: 0, top: 90 }, { width: 800 }, 48);
  assert.equal(zero.left, 170);
  assert.equal(zero.width, 460);
  assert.equal(zero.top, 48);
  const offscreen = computeNotificationCenterBox({ left: 900, width: 150, top: 90 }, { width: 800 }, 48);
  assert.deepEqual(offscreen, zero);
  for (const anchor of [{ left: -100, width: 450, top: 36 }, { left: 600, width: 300, top: 36 }]) {
    const box = computeNotificationCenterBox(anchor, { width: 800 }, 48);
    assert.ok(box.left >= Math.max(12, anchor.left + 12));
    assert.ok(box.left + box.width <= Math.min(788, anchor.left + anchor.width - 12));
    assert.ok(box.width <= anchor.width - 24);
  }
  const tiny = computeNotificationCenterBox({ left: 200, width: 20, top: 36 }, { width: 641 }, 48);
  assert.equal(tiny.width, 0, "an impossible 24px gap must not create an unapproved width floor");
  const clippedTiny = computeNotificationCenterBox({ left: 790, width: 20, top: 36 }, { width: 800 }, 48);
  assert.equal(clippedTiny.width, 0);
  assert.ok(clippedTiny.left >= 790 && clippedTiny.left <= 800, "even a zero-width origin stays in the visible column");
});

test("overlay measures the real chat column ref, cleans up observers and keeps mobile fullscreen", async () => {
  const source = await readFile(new URL("./NotificationCenter.tsx", import.meta.url), "utf8");
  const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(source, /anchorRef\?: RefObject<HTMLElement \| null>/);
  assert.match(source, /anchor\?\.getBoundingClientRect\(\)/);
  assert.match(source, /new ResizeObserver\(update\)/);
  assert.match(source, /observer\.observe\(anchor\)/);
  assert.match(source, /observer\?\.disconnect\(\);[\s\S]*window\.removeEventListener\("resize", update\)/);
  assert.match(source, /window\.addEventListener\("resize", update\)/);
  assert.match(source, /"--notification-center-left": box \? `\$\{box\.left\}px` : "50%"/);
  assert.match(source, /"--notification-center-width": box \? `\$\{box\.width\}px`/);
  assert.ok(source.indexOf("export function computeNotificationCenterBox(") < source.indexOf("anchorRef?.current"), "helper precedes effect");
  assert.match(shell, /<div ref=\{notificationAnchorRef\} data-notification-anchor="chat-column" style=\{\{ flex: 1, overflow: "hidden", position: "relative" \}\}>/);
  assert.match(shell, /anchorRef=\{notificationAnchorRef\}/);
  assert.match(css, /\.notification-center \{\s*position: fixed; inset: auto;/);
  assert.match(css, /left: var\(--notification-center-left, 50%\)/);
  assert.match(css, /width: var\(--notification-center-width, min\(460px, calc\(100vw - 24px\)\)\)/);
  assert.match(css, /transform: var\(--notification-center-shift, translateX\(-50%\)\)/);
  assert.match(css, /notification-center h2[^}]*min-width: 0; overflow-wrap: anywhere/);
  assert.match(css, /notification-center-actions button[^}]*max-width: 100%; overflow-wrap: anywhere/);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.notification-center \{[\s\S]*?transform: none !important;/);
  assert.doesNotMatch(source, /localStorage|querySelector/);
});
