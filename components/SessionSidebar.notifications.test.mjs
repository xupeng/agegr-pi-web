import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url);
const { notificationSessionIds, notificationProjectCounts } = await jiti.import("../lib/notifications/client.ts");

test("one session with completion + waiting counts once; an unloaded project is counted from snapshot", () => {
  const items = [
    { kind: "completion", sessionId: "a", projectKey: "unloaded-project" },
    { kind: "ask", sessionId: "a", projectKey: "unloaded-project" },
    { kind: "extension", sessionId: "b", projectKey: "unloaded-project" },
  ];
  assert.equal(notificationSessionIds(items).size, 2);
  assert.equal(notificationProjectCounts(items).get("unloaded-project"), 2);
  assert.match(source, /notificationCounts\.get\(project\.key\) \?\? 0/);
});

test("sidebar is a read-only subscriber, not localStorage or running-diff unread authority", () => {
  assert.match(source, /snapshot: notificationSnapshot \} = useNotifications\(\)/);
  assert.match(source, /notificationSessionIds\(notificationItems\)/);
  assert.doesNotMatch(source, /pi-web:unread-session-ids|setUnreadSessionIds|saveUnreadSessionIds|acknowledgeNotification|startNotificationClient/);
  const running = source.slice(source.indexOf("const previous = previousRunningSessionIdsRef.current;"), source.indexOf("}, [runningSessionIds, selectedSessionId"));
  assert.match(running, /refreshLists\(true\)/);
  assert.equal((running.match(/onBackgroundTaskDone\?\.\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(running, /next\.add|next\.delete/);
});

test("running and older completion are rendered together, without subagent/Trellis rows", () => {
  assert.match(source, /\{isRunning && <RunningSessionIndicator \/>\}/);
  assert.match(source, /\{isUnread && <UnreadSessionIndicator \/>\}/);
  assert.match(source, /listSessionFamilies\(sessions\)/);
  assert.match(source, /session\.relation\?\.kind === "subagent"/);
});
