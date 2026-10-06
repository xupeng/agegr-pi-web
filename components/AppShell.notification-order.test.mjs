import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("navigation retirement is initialized before its first eager dependency-array use", () => {
  const declaration = source.indexOf("const invalidateNotificationNavigation = useCallback");
  const firstUse = source.indexOf("[rightPanelFullWidth, invalidateNotificationNavigation]");
  assert.ok(declaration >= 0 && firstUse >= 0 && declaration < firstUse);
  assert.ok(source.indexOf("const notificationNavigationRef = useRef") < declaration);
  assert.ok(source.indexOf("const notificationNavigationControllerRef = useRef") < declaration);
});

test("panel toggle retires navigation outside a deferred or replayed state updater", () => {
  const start = source.indexOf("const toggleTopPanel = useCallback");
  const end = source.indexOf("const closeNotifications", start);
  const toggle = source.slice(start, end);
  assert.match(toggle, /activeTopPanelRef\.current === "notifications" \|\| panel === "notifications"/);
  assert.ok(toggle.indexOf("invalidateNotificationNavigation();") < toggle.indexOf("setActiveTopPanel("));
  assert.match(toggle, /setActiveTopPanel\(\(cur\) => cur === panel \? null : panel\)/);
});

test("auto-name retires an old notification lookup before closing its panel", () => {
  const start = source.indexOf("const handleAutoName = useCallback");
  const end = source.indexOf("const handleExplorerRefresh", start);
  const callback = source.slice(start, end);
  assert.ok(callback.indexOf("invalidateNotificationNavigation();") >= 0);
  assert.ok(callback.indexOf("invalidateNotificationNavigation();") < callback.indexOf("setActiveTopPanel(null)"));
  assert.match(callback, /selectedSession\?\.id, invalidateNotificationNavigation\]/);
});
