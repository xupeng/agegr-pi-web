import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const navigation = source.slice(source.indexOf("  const handleNotificationNavigate = useCallback"), source.indexOf("  // Called by ChatWindow when a new session"));
function context(fetch) {
  const selections = [];
  const env = {
    AbortController, DOMException, encodeURIComponent, fetch,
    useCallback: (callback) => callback,
    notificationNavigationRef: { current: 0 }, notificationNavigationControllerRef: { current: null },
    activeTopPanelRef: { current: "notifications" },
    handleSelectSession: (...args) => selections.push(args),
    closeNotifications: () => { env.closed = true; env.activeTopPanelRef.current = null; },
  };
  vm.runInNewContext(stripTypeScriptTypes(`${navigation}
globalThis.navigate = handleNotificationNavigate;`), env);
  return { env, selections };
}
const completion = { kind: "completion", sessionId: "session-a", resultEntryId: "result-entry" };

test("completion targets exact result entry via explicit session adoption; pending only selects", async () => {
  const target = { id: "session-a", cwd: "/another-project", projectKey: "another-project" };
  const requests = [];
  for (const kind of ["completion", "ask", "extension"]) {
    const { env, selections } = context(async (url) => { requests.push(url); return { ok: true, json: async () => ({ sessions: [target] }) }; });
    await env.navigate({ ...completion, kind });
    assert.equal(selections.length, 1);
    assert.equal(selections[0][0], target);
    assert.equal(selections[0][1], false);
    assert.equal(selections[0][2], kind === "completion" ? "result-entry" : undefined);
    assert.equal(selections[0][4], kind === "completion" ? true : undefined);
    assert.equal(env.closed, true);
  }
  assert.deepEqual(requests, Array(3).fill("/api/sessions?sessionId=session-a"));
  assert.doesNotMatch(navigation, /acknowledge|ask_submit|ask_cancel|navigate_tree|sendAgentCommand/);
});

test("unavailable targets do not clear or navigate; late closed-center responses do not select", async () => {
  const { env, selections } = context(async () => ({ ok: true, json: async () => ({ sessions: [] }) }));
  await assert.rejects(env.navigate(completion));
  assert.equal(selections.length, 0); assert.notEqual(env.closed, true);
  const wait = Promise.withResolvers();
  const late = context(() => wait.promise);
  const request = late.env.navigate(completion);
  late.env.notificationNavigationRef.current += 1;
  late.env.activeTopPanelRef.current = null;
  wait.resolve({ ok: true, json: async () => ({ sessions: [{ id: completion.sessionId }] }) });
  await request;
  assert.equal(late.selections.length, 0);
});

test("delayed fetch -> globalNewSession -> reopen center -> release response cannot change selection/URL", async () => {
  const wait = Promise.withResolvers();
  const target = { id: "session-a", cwd: "/a", projectKey: "a" };
  const { env, selections } = context(async () => wait.promise);
  const request = env.navigate(completion);
  // Simulate globalNewSession invalidation
  env.notificationNavigationRef.current += 1;
  env.activeTopPanelRef.current = null;
  // Simulate reopen center (toggleTopPanel opens notifications and invalidates)
  env.notificationNavigationRef.current += 1;
  env.activeTopPanelRef.current = "notifications";
  wait.resolve({ ok: true, json: async () => ({ sessions: [target] }) });
  await request;
  assert.equal(selections.length, 0);
});

test("toggling another top panel retires pending notification navigation", async () => {
  const wait = Promise.withResolvers();
  const { env, selections } = context(async () => wait.promise);
  const request = env.navigate(completion);
  // toggleTopPanel switches from notifications to agents
  env.notificationNavigationRef.current += 1;
  env.activeTopPanelRef.current = "agents";
  wait.resolve({ ok: true, json: async () => ({ sessions: [{ id: "session-a" }] }) });
  await request;
  assert.equal(selections.length, 0);
});

test("aborted fetch does not select and does not propagate AbortError", async () => {
  let abortFn;
  const { env, selections } = context(async (_url, { signal }) => {
    return new Promise((_resolve, reject) => {
      abortFn = () => reject(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", abortFn);
    });
  });
  const request = env.navigate(completion);
  // Abort via a new navigation or explicit close
  env.notificationNavigationControllerRef.current?.abort();
  await request;
  assert.equal(selections.length, 0);
});

test("only AppShell owns connection; bell and center do not depend on showChat", () => {
  assert.match(source, /useEffect\(\(\) => startNotificationClient\(\), \[\]\)/);
  assert.equal((source.match(/startNotificationClient\(\)/g) ?? []).length, 1);
  const bell = source.slice(source.indexOf('className="notification-bell"'), source.indexOf('className="notification-bell-count"'));
  assert.match(bell, /aria-haspopup="dialog"/);
  assert.match(bell, /notifications\.snapshot\.items\.length/);
  assert.doesNotMatch(bell, /showChat|selectedSession/);
  assert.match(source, /activeTopPanel === "notifications" && \(\s*<NotificationCenter/);
  assert.match(source, /onAcknowledgeAll=\{acknowledgeAllNotifications\}/);
});

test("AppShell passes every outer reading obstruction; ChatWindow owns foreground and inner dialogs", () => {
  const gates = source.slice(source.indexOf("notificationReadingActive="), source.indexOf("searchTarget={", source.indexOf("notificationReadingActive=")));
  for (const obstruction of ["activeTopPanel", "settingsSection", "projectTrustDialogOpen", "rightPanelFullWidth", "mobileToolbarMoreOpen", "sidebarOpen", "rightPanelOpen", "sidebarResizer.isResizing", "rightPanelResizer.isResizing"]) assert.ok(gates.includes(obstruction), obstruction);
  assert.match(gates, /isMobile && \(sidebarOpen \|\| rightPanelOpen\)/);
});
