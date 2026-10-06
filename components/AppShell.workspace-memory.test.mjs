import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createJiti } from "jiti";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url);
const draftStore = await jiti.import("../lib/draft-store.ts");
const sessionRestore = await jiti.import("../lib/session-restore.ts");

function callbackBody(name, nextName) {
  const start = source.indexOf(`const ${name} = useCallback`);
  const end = source.indexOf(`\n  const ${nextName}`, start);
  assert.notEqual(start, -1, `${name} callback not found`);
  assert.notEqual(end, -1, `${nextName} callback not found after ${name}`);
  return source.slice(start, end);
}

test("explicit context changes invalidate a pending workspace restore", () => {
  const callbacks = [
    ["handleCwdChange", "handleSelectSession"],
    ["handleSelectSession", "handleNewSession"],
    ["handleNewSession", "hydrateSelectedSession"],
    ["handleSessionCreated", "handleAgentEnd"],
    ["handleSessionForked", "handleInitialRestoreDone"],
    ["handleSessionDeleted", "handleOpenFile"],
  ];

  for (const [name, nextName] of callbacks) {
    assert.match(callbackBody(name, nextName), /invalidateWorkspaceRestore\(\);/);
  }
});

test("all active-session transitions share one persistence effect", () => {
  assert.match(
    source,
    /useEffect\(\(\) => \{\s+if \(!selectedSession\) return;[\s\S]*?setLastOpenSession\(projectKey, selectedSession\.id\);\s+\}, \[selectedSession\]\);/,
  );
});

test("keeps chat scroll positions in page memory by session id", () => {
  assert.match(source, /useRef\(new Map<string, ChatScrollPosition>\(\)\)/);
  assert.match(source, /sessionScrollPositionsRef\.current\.set\(sessionId, position\)/);
  assert.match(source, /initialScrollPosition=\{selectedSession \? sessionScrollPositionsRef\.current\.get\(selectedSession\.id\) \?\? null : null\}/);
  assert.match(source, /onScrollPositionChange=\{handleSessionScrollPositionChange\}/);
  assert.doesNotMatch(source, /localStorage[^\n]*sessionScroll/i);
});

test("workspace restoration remains inside the cross-project branch", () => {
  assert.match(
    callbackBody("handleCwdChange", "handleSelectSession"),
    /if \(currentProject !== newProject\) \{[\s\S]*?restoreWorkspaceContext\(newProject, cwd\);[\s\S]*?\}/,
  );
});

test("New restores the draft after session navigation and workspace auto-restore", async (t) => {
  const callbacks = [
    callbackBody("restoreWorkspaceContext", "handleCwdChange"),
    callbackBody("handleCwdChange", "handleSelectSession"),
    callbackBody("handleSelectSession", "handleNewSession"),
    callbackBody("handleNewSession", "hydrateSelectedSession"),
  ].join("\n");
  const parkedKeyHelper = source.slice(source.indexOf("function parkedNewSessionDraftKey"), source.indexOf("export function AppShell"));
  const hookSource = await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");
  const cleanupStart = hookSource.indexOf("    return () => {", hookSource.indexOf("  // Load session on mount"));
  const cleanupEnd = hookSource.indexOf("    // eslint-disable-next-line", cleanupStart);
  const notificationRetirement = hookSource.match(/  const retireNotificationHistory = useCallback\([\s\S]*?\n  \}, \[\]\);/);
  assert.ok(notificationRetirement, "the notification retirement callback must be exercised by the cleanup harness");

  for (const rememberedCwd of ["/draft-project", "/draft-project-worktree"]) {
    await t.test(`remembered session cwd: ${rememberedCwd}`, async () => {
      const cwd = "/draft-project";
      const session = { id: "remembered", cwd: rememberedCwd, projectKey: cwd };
      const response = Promise.withResolvers();
      const context = vm.createContext({
        ...draftStore,
        ...sessionRestore,
        crypto: globalThis.crypto,
        queueMicrotask,
        URLSearchParams,
        window: { location: { pathname: "/", search: "" } },
        router: { replace() {} },
        fetch: () => response.promise,
        getLastOpenSession: (key) => key === cwd ? session.id : null,
        clearLastOpen() {},
        workspaceKeyOf: (value) => value.projectKey ?? value.cwd,
        useCallback: (callback) => callback,
        useGlobalKeyboardShortcuts() {},
        activeNewSessionDraftKeyRef: { current: `new:initial:${cwd}` },
        activeProjectKeyRef: { current: cwd },
        workspaceRestoreTokenRef: { current: 0 },
        suppressCwdBumpRef: { current: false },
        branchLeafChangeFnRef: { current: null },
        liveFollowFrameRef: { current: null },
        bashRecoveryIdRef: { current: 0 },
        notificationNavigationRef: { current: 0 },
        notificationNavigationControllerRef: { current: null },
        cancelEventStreamGrace() {},
        closeEvents() {},
        isMobile: false,
        activeCwd: cwd,
        activeFileTabId: null,
        newSessionCwd: cwd,
        newSessionDraftId: "initial",
        selectedSession: null,
        // A user-initiated switch back to this project: no pending URL session.
        initialSessionRestored: true,
        sessionCatalog: [],
        sessionKey: 0,
      });
      context.invalidateNotificationNavigation = () => {
        context.notificationNavigationRef.current++;
        context.notificationNavigationControllerRef.current?.abort();
        context.notificationNavigationControllerRef.current = null;
      };
      context.invalidateWorkspaceRestore = () => context.workspaceRestoreTokenRef.current++;
      for (const [setter] of callbacks.matchAll(/\bset[A-Z]\w*(?=\()/g)) {
        const state = setter[3].toLowerCase() + setter.slice(4);
        context[setter] = (value) => {
          context[state] = typeof value === "function" ? value(context[state]) : value;
        };
      }
      vm.runInContext(stripTypeScriptTypes(`${parkedKeyHelper}\n${callbacks}
        globalThis.navigate = { handleCwdChange, handleSelectSession, handleNewSession };
      `), context);
      // Run the actual hook cleanup with the outgoing mount's captured draft key.
      const makeCleanup = vm.runInContext(stripTypeScriptTypes(`((isNew, newSessionDraftKey) => {
        const sessionHookMountedRef = { current: true };
        const notificationHistoryRef = { current: { sessionId: null, viewGeneration: 0, ready: false } };
        const notificationViewGenerationRef = { current: 0 };
        ${notificationRetirement[0]}
        const newSessionPromotedRef = { current: false };
        const sessionIdRef = { current: null };
        const dataRef = { current: null };
        const messagesRef = { current: [] };
        const entryIdsRef = { current: [] };
        const activeLeafIdRef = { current: null };
        const historyCursorRef = { current: null };
        const hasEarlierMessagesRef = { current: false };
        const getSessionViewSnapshot = () => null;
        const setSessionViewSnapshot = () => false;
        const deleteSessionViewSnapshot = () => {};
        ${hookSource.slice(cleanupStart, cleanupEnd)}
      })`), context);
      let mountedKey = context.sessionKey;
      let cleanup = makeCleanup(true, context.activeNewSessionDraftKeyRef.current);
      async function commit() {
        if (mountedKey !== context.sessionKey) {
          cleanup();
          mountedKey = context.sessionKey;
          const activeCwd = context.newSessionCwd ?? context.activeCwd;
          const key = context.selectedSession ? null : `new:${context.newSessionDraftId}:${activeCwd}`;
          context.activeNewSessionDraftKeyRef.current = key;
          cleanup = makeCleanup(!context.selectedSession, key);
        }
        await new Promise((resolve) => setImmediate(resolve));
      }

      const draft = { value: "unsent project draft", images: [{ data: "aGVsbG8=", mimeType: "image/png" }] };
      draftStore.setDraft(context.activeNewSessionDraftKeyRef.current, draft);
      context.navigate.handleSelectSession({ ...session, cwd });
      await commit();
      context.navigate.handleNewSession("direct-return", cwd);
      await commit();
      assert.deepEqual(draftStore.getDraft(context.activeNewSessionDraftKeyRef.current), draft);
      context.navigate.handleSelectSession({ ...session, cwd });
      await commit();
      context.navigate.handleCwdChange("/other-project", "/other-project", "/other-project");
      await commit();
      context.navigate.handleCwdChange(cwd, cwd, cwd);
      await commit();
      assert.deepEqual(draftStore.getDraft(context.activeNewSessionDraftKeyRef.current), draft);
      response.resolve({ ok: true, json: async () => ({ sessions: [session] }) });
      await new Promise((resolve) => setImmediate(resolve));
      await commit();
      assert.equal(context.selectedSession.id, session.id);
      context.navigate.handleNewSession("after-auto-restore", cwd);
      await commit();
      assert.deepEqual(draftStore.getDraft(context.activeNewSessionDraftKeyRef.current), draft);
      draftStore.clearDraft(context.activeNewSessionDraftKeyRef.current);
    });
  }
});

test("an unresolved ?session= blocks the remembered-session restore", async () => {
  const cwd = "/race-project";
  const otherCwd = "/other-project";
  const remembered = { id: "remembered", cwd, projectKey: cwd };
  const calls = [];
  const context = vm.createContext({
    ...draftStore,
    ...sessionRestore,
    crypto: globalThis.crypto,
    queueMicrotask,
    URLSearchParams,
    window: { location: { pathname: "/", search: "?session=url-session" } },
    router: { replace: (url) => calls.push(["replace", url]) },
    fetch: (url) => {
      calls.push(["fetch", url]);
      return Promise.resolve({ ok: true, json: async () => ({ sessions: [remembered] }) });
    },
    getLastOpenSession: (key) => (key === cwd || key === otherCwd ? remembered.id : null),
    clearLastOpen() {},
    workspaceKeyOf: (value) => value.projectKey ?? value.cwd,
    useCallback: (callback) => callback,
    useGlobalKeyboardShortcuts() {},
    activeNewSessionDraftKeyRef: { current: null },
    activeProjectKeyRef: { current: null },
    workspaceRestoreTokenRef: { current: 0 },
    suppressCwdBumpRef: { current: false },
    branchLeafChangeFnRef: { current: null },
    liveFollowFrameRef: { current: null },
    bashRecoveryIdRef: { current: 0 },
    notificationNavigationRef: { current: 0 },
    notificationNavigationControllerRef: { current: null },
    cancelEventStreamGrace() {},
    closeEvents() {},
    isMobile: false,
    activeCwd: null,
    activeFileTabId: null,
    newSessionCwd: null,
    newSessionDraftId: "initial",
    selectedSession: null,
    sessionKey: 0,
    initialSessionRestored: false,
    sessionCatalog: [],
  });
  context.invalidateNotificationNavigation = () => {
    context.notificationNavigationRef.current++;
    context.notificationNavigationControllerRef.current?.abort();
    context.notificationNavigationControllerRef.current = null;
  };
  context.invalidateWorkspaceRestore = () => context.workspaceRestoreTokenRef.current++;
  const restore = callbackBody("restoreWorkspaceContext", "handleCwdChange");
  const cwdChange = callbackBody("handleCwdChange", "handleSelectSession");
  const scope = `${restore}\n${cwdChange}`;
  for (const [setter] of scope.matchAll(/\bset[A-Z]\w*(?=\()/g)) {
    const state = setter[3].toLowerCase() + setter.slice(4);
    context[setter] = (value) => {
      context[state] = typeof value === "function" ? value(context[state]) : value;
    };
  }
  const parkedKeyHelper = source.slice(source.indexOf("function parkedNewSessionDraftKey"), source.indexOf("export function AppShell"));
  vm.runInContext(stripTypeScriptTypes(`${parkedKeyHelper}\n${scope}
    globalThis.navigate = { handleCwdChange };
  `), context);

  context.navigate.handleCwdChange(cwd, cwd, cwd);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(context.activeProjectKeyRef.current, cwd, "Project identity must still sync");
  assert.deepEqual(calls, [], "The pending URL session must block the remembered-session restore");
  assert.equal(context.selectedSession, null, "The pending URL session must not be displaced");
  assert.equal(context.sessionKey, 0, "The chat must not remount behind the URL restore");

  // Once the URL session has been adopted, switching projects restores normally.
  context.initialSessionRestored = true;
  context.navigate.handleCwdChange(otherCwd, otherCwd, otherCwd);
  await new Promise((resolve) => setImmediate(resolve));
  const restoredFetches = calls.filter(([kind]) => kind === "fetch");
  assert.equal(restoredFetches.length, 1, "A resolved URL session must not block the restore forever");
  assert.match(restoredFetches[0][1], /projectKey=/);
});
