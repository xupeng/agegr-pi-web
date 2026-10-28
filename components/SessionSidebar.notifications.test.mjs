import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
const source = await readFile(new URL("./SessionSidebar.tsx", import.meta.url), "utf8");
const treeSource = await readFile(new URL("./SessionTree.tsx", import.meta.url), "utf8");
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
  // Upstream moved the row's right-hand meta out of SessionSidebar into
  // SessionTree: the sidebar now only classifies rows (`runningIds` /
  // `unreadIds` -> `buildSessionTree`) and SessionTree paints the indicator.
  // The fork contract is unchanged — a running session and an older,
  // still-unread completion both surface in the sidebar rows — so the
  // assertions follow the merged identifiers instead of the old inline
  // `isRunning` / `isUnread` JSX.
  assert.match(source, /runningIds: runningSessionIds/);
  assert.match(source, /unreadIds: unreadSessionIds/);
  assert.match(treeSource, /status\.running\) \{\s*\n\s*meta = <SpinnerIcon size=\{12\} label=\{t\("sidebar\.agentRunning"\)\} \/>/);
  assert.match(treeSource, /status\.unread\) \{\s*\n\s*meta = <span className="session-tree-unread" role="img" aria-label=\{t\("sidebar\.newSessionActivity"\)\} \/>/);
  assert.match(source, /listSessionFamilies\(sessions\)/);
  assert.match(source, /session\.relation\?\.kind === "subagent"/);
});
