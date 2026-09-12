import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { createJiti } from "jiti";

const listRoute = await readFile(new URL("./route.ts", import.meta.url), "utf8");
const detailRoute = await readFile(new URL("./[id]/route.ts", import.meta.url), "utf8");
const contextRoute = await readFile(new URL("./[id]/context/route.ts", import.meta.url), "utf8");
const stateRoute = await readFile(new URL("./[id]/state/route.ts", import.meta.url), "utf8");
const agentStateRoute = await readFile(new URL("../agent/[id]/route.ts", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { DELETE: deleteSession, GET: getSessionDetail, PATCH: renameSession } = await jiti.import("./[id]/route.ts");
const { GET: getSessionList } = await jiti.import("./route.ts");
const { GET: getRunningSessions } = await jiti.import("../agent/running/route.ts");
const { GET: getSessionState } = await jiti.import("./[id]/state/route.ts");
const {
  cacheSessionPath,
  invalidateSessionPathCache,
  invalidateSessionListCache,
} = await jiti.import("../../../lib/session-reader.ts");
const { SessionManager } = await jiti.import("@earendil-works/pi-coding-agent");
const {
  forgetPersistedAsk,
  openAsksPath,
  persistOpenAsk,
  readPersistedAsk,
} = await jiti.import("../../../lib/ask-user/persist.ts");

test("list versions expose idle session creation, rename and deletion to other windows", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-list-sync-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  invalidateSessionListCache();
  let sessionId;
  t.after(async () => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    if (sessionId) invalidateSessionPathCache(sessionId);
    invalidateSessionListCache();
    await rm(dir, { recursive: true, force: true });
  });
  const list = async () => {
    const response = await getSessionList(new Request("http://localhost/api/sessions"));
    assert.equal(response.status, 200);
    return response.json();
  };
  const initial = await list();
  assert.deepEqual(initial.sessions, []);

  const manager = SessionManager.create(dir);
  manager.appendMessage({ role: "user", content: "Cross-window search fixture", timestamp: Date.now() });
  manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "Already finished" }], timestamp: Date.now() });
  sessionId = manager.getSessionId();
  invalidateSessionListCache();
  const created = await list();
  assert.ok(created.sessionListVersion > initial.sessionListVersion);
  assert.equal(created.sessions[0].id, sessionId);
  assert.deepEqual(created.runningSessionIds, []);

  const context = { params: Promise.resolve({ id: sessionId }) };
  const url = `http://localhost/api/sessions/${sessionId}`;
  const renamed = await renameSession(new Request(url, { method: "PATCH", body: JSON.stringify({ name: "Renamed elsewhere" }) }), context);
  assert.equal(renamed.status, 200);
  const poll = await (await getRunningSessions()).json();
  assert.deepEqual(poll.runningSessionIds, []);
  assert.ok(poll.sessionListVersion > created.sessionListVersion);
  const updated = await list();
  assert.equal(updated.sessionListVersion, poll.sessionListVersion);
  assert.equal(updated.sessions[0].name, "Renamed elsewhere");
  assert.equal((await list()).sessionListVersion, poll.sessionListVersion, "reads must not create a refresh loop");

  assert.equal((await deleteSession(new Request(url, { method: "DELETE" }), context)).status, 200);
  const deleted = await list();
  assert.ok(deleted.sessionListVersion > updated.sessionListVersion);
  assert.deepEqual(deleted.sessions, []);
  assert.equal((await (await getRunningSessions()).json()).sessionListVersion, deleted.sessionListVersion);
});

test("session listing returns a gzip-compressed response when the client accepts it", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-list-gzip-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  invalidateSessionListCache();
  t.after(async () => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    invalidateSessionListCache();
    await rm(dir, { recursive: true, force: true });
  });

  const firstMessage = "compressible session content ".repeat(500);
  const manager = SessionManager.create(dir);
  manager.appendMessage({ role: "user", content: firstMessage, timestamp: Date.now() });
  manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "done" }], timestamp: Date.now() });
  invalidateSessionListCache();

  const response = await getSessionList(new Request("http://localhost/api/sessions", {
    headers: { "Accept-Encoding": "gzip" },
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Encoding"), "gzip");
  assert.match(response.headers.get("Vary") ?? "", /(?:^|,\s*)Accept-Encoding(?:\s*,|$)/i);
  const payload = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8"));
  assert.equal(payload.sessions[0].firstMessage, firstMessage);
});

test("deleting an unpersisted session shuts down its runtime and invalidates caches", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-delete-empty-"));
  const previousRegistry = globalThis.__piSessions;
  const ids = [];
  globalThis.__piSessions = new Map();
  t.after(async () => {
    globalThis.__piSessions = previousRegistry;
    for (const id of ids) invalidateSessionPathCache(id);
    invalidateSessionListCache();
    await rm(dir, { recursive: true, force: true });
  });

  for (const persistOnShutdown of [false, true]) {
    const manager = SessionManager.create(dir, dir);
    const id = manager.getSessionId();
    const filePath = manager.getSessionFile();
    ids.push(id);
    await assert.rejects(readFile(filePath), { code: "ENOENT" });
    cacheSessionPath(id, filePath);
    let shutdownCalled = false;
    globalThis.__piSessions.set(id, {
      isAlive: () => true,
      isRunning: () => false,
      shutdown: async () => {
        shutdownCalled = true;
        if (persistOnShutdown) await writeFile(filePath, JSON.stringify(manager.getHeader()));
        globalThis.__piSessions.delete(id);
      },
    });
    const before = (await (await getRunningSessions()).json()).sessionListVersion;
    const response = await deleteSession(
      new Request(`http://localhost/api/sessions/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(shutdownCalled, true);
    assert.equal(globalThis.__piSessions.has(id), false);
    assert.equal(globalThis.__piSessionPathCache.has(id), false);
    assert.equal([...globalThis.__piPathToSessionIdCache.values()].includes(id), false);
    assert.ok((await (await getRunningSessions()).json()).sessionListVersion > before);
    await assert.rejects(readFile(filePath), { code: "ENOENT" });
  }
});

test("session listing merges live registry snapshots and honors force refresh", () => {
  assert.match(listRoute, /params\.get\("force"\) === "1"/);
  assert.match(listRoute, /listAllSessions\(\{ force \}\)/);
  assert.match(listRoute, /attachSessionProjectInfo\(getRpcSessionInfos\(\)\)/);
  assert.match(listRoute, /mergeSessionLists\(persistedSessions, runtimeSessions\)/);
  assert.match(listRoute, /"Cache-Control": "no-store"/);
});

test("session listing scopes to a project or a single session on demand", () => {
  assert.match(listRoute, /projectKey = params\.get\("projectKey"\)/);
  assert.match(listRoute, /sessionId = params\.get\("sessionId"\)/);
  assert.match(listRoute, /sessions\.filter\(\(s\) => \(s\.projectKey \?\? s\.projectRoot \?\? s\.cwd\) === projectKey\)/);
  // The single-session branch must not fall back to a full listAllSessions
  // scan: transient sessions answer from the RPC registry, persisted ones go
  // through the targeted readSessionById.
  assert.match(listRoute, /runtimeTarget\?\.transient/);
  assert.match(listRoute, /readSessionById\(sessionId\)/);
});

test("session reads use the live SessionManager before requiring a JSONL path", () => {
  for (const source of [detailRoute, contextRoute]) {
    const liveLookup = source.indexOf("getRpcSession(id)");
    const pathLookup = source.indexOf("resolveSessionPath(id)");
    assert.ok(liveLookup >= 0);
    assert.ok(pathLookup > liveLookup);
    assert.match(source, /liveRpc\?\.inner\.sessionManager \?\? SessionManager\.open/);
  }
});

test("live agent state is available before the session file is persisted", () => {
  const liveLookup = stateRoute.indexOf("getRpcSession(id)");
  const pathLookup = stateRoute.indexOf("resolveSessionPath(id)");
  assert.ok(liveLookup >= 0);
  assert.ok(pathLookup > liveLookup);
  assert.match(stateRoute, /if \(rpc\?\.isAlive\(\)\)/);
});

test("state routes serve a persisted open ask when the wrapper is gone", () => {
  // An unanswered ask_user must survive wrapper idle shutdown and server
  // restarts: both state routes fall back to the persisted ask so a reloaded
  // or remote browser can still render the card. The persistence round-trip
  // itself is covered by lib/ask-user/persist.test.mjs.
  for (const source of [stateRoute, agentStateRoute]) {
    assert.match(source, /readPersistedAsk\(id\)/);
    assert.match(source, /state: \{ pendingAsk: persisted \}/);
    assert.match(source, /running: false/);
  }
});

test("deleting a session removes real subagent descendants but preserves ordinary forks", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-delete-reparent-"));
  const grandparentPath = join(dir, "grandparent.jsonl");
  const parentPath = join(dir, "parent.jsonl");
  const childPath = join(dir, "child.jsonl");
  const grandchildPath = join(dir, "grandchild.jsonl");
  const forkPath = join(dir, "fork.jsonl");
  const forkChildPath = join(dir, "fork-child.jsonl");
  const parentId = "delete-reparent-parent";
  const childId = "delete-reparent-child";
  const grandchildId = "delete-reparent-grandchild";
  const forkId = "delete-surviving-fork";
  const forkChildId = "delete-surviving-fork-child";
  const allIds = [parentId, childId, grandchildId, forkId, forkChildId];
  const header = (id, parentSession) => JSON.stringify({
    type: "session",
    version: 3,
    id,
    timestamp: "2026-01-01T00:00:00.000Z",
    cwd: dir,
    ...(parentSession ? { parentSession } : {}),
  });
  const subagentMeta = (id, parentSessionId, parentSessionPath) => JSON.stringify({
    type: "custom",
    customType: "pi-web:subagent",
    id: `${id}-meta`,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    data: {
      version: 1,
      parentSessionId,
      parentSessionPath,
      parentToolCallId: `${id}-call`,
      profile: "Explore",
      description: `Inspect ${id}`,
      task: `Inspect ${id}`,
      runInBackground: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    },
  });
  const ask = (askId) => ({
    askId,
    askedAt: "2026-01-01T00:00:00.000Z",
    questions: [{ id: "q", question: "Continue?", options: [{ value: "yes", label: "Yes" }] }],
  });
  await mkdir(dirname(openAsksPath()), { recursive: true });
  await writeFile(grandparentPath, `${header("delete-reparent-grandparent")}\n`);
  await writeFile(parentPath, `${header(parentId, grandparentPath)}\n`);
  await writeFile(childPath, `${header(childId, parentPath)}\n${subagentMeta(childId, parentId, parentPath)}\n`);
  await writeFile(grandchildPath, `${header(grandchildId, childPath)}\n${subagentMeta(grandchildId, childId, childPath)}\n`);
  // A normal fork and the built-in child rooted under that fork are not
  // descendants in the subagent relation graph and must both survive.
  await writeFile(forkPath, `${header(forkId, parentPath)}\n`);
  await writeFile(forkChildPath, `${header(forkChildId, forkPath)}\n${subagentMeta(forkChildId, forkId, forkPath)}\n`);
  for (const id of allIds) persistOpenAsk(id, ask(`${id}-ask`));
  cacheSessionPath(parentId, parentPath);
  t.after(async () => {
    for (const id of allIds) {
      forgetPersistedAsk(id);
      invalidateSessionPathCache(id);
    }
    invalidateSessionListCache();
    await rm(dir, { recursive: true, force: true });
  });

  const response = await deleteSession(
    new Request(`http://localhost/api/sessions/${parentId}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: parentId }) },
  );

  assert.equal(response.status, 200);
  await assert.rejects(readFile(parentPath), { code: "ENOENT" });
  await assert.rejects(readFile(childPath), { code: "ENOENT" });
  await assert.rejects(readFile(grandchildPath), { code: "ENOENT" });
  const forkHeader = JSON.parse((await readFile(forkPath, "utf8")).split("\n")[0]);
  const forkChildHeader = JSON.parse((await readFile(forkChildPath, "utf8")).split("\n")[0]);
  assert.equal(forkHeader.parentSession, grandparentPath);
  assert.equal(forkChildHeader.parentSession, forkPath);
  for (const id of [parentId, childId, grandchildId]) assert.equal(readPersistedAsk(id), undefined);
  for (const id of [forkId, forkChildId]) assert.equal(readPersistedAsk(id)?.askId, `${id}-ask`);
});

test("deleting a parent waits for queued and running transient descendant cleanup", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-delete-live-descendants-"));
  const parentId = "delete-live-parent";
  const queuedId = "delete-live-queued";
  const runningId = "delete-live-running";
  const parentPath = join(dir, "parent.jsonl");
  const queuedPath = join(dir, "queued-transient.jsonl");
  const runningPath = join(dir, "running-transient.jsonl");
  const previousRegistry = globalThis.__piSessions;
  const previousRuns = globalThis.__piSubagentRuns;
  const events = [];
  let resolveQueued;
  let resolveRunning;
  const queuedCompletion = new Promise((resolve) => { resolveQueued = resolve; });
  const runningCompletion = new Promise((resolve) => { resolveRunning = resolve; });
  const meta = (id, parentSessionId, parentSessionPath) => ({
    type: "custom",
    customType: "pi-web:subagent",
    id: `${id}-meta`,
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    data: {
      version: 1,
      parentSessionId,
      parentSessionPath,
      parentToolCallId: `${id}-call`,
      profile: "Explore",
      description: id,
      task: id,
      runInBackground: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    },
  });
  const wrapper = (id, path, parentSessionId, parentSessionPath, running) => {
    const header = {
      type: "session",
      version: 3,
      id,
      timestamp: "2026-01-01T00:00:00.000Z",
      cwd: dir,
      parentSession: parentSessionPath,
    };
    return {
      sessionId: id,
      sessionFile: path,
      cwd: dir,
      isAlive: () => true,
      isRunning: () => running,
      inner: {
        sessionManager: {
          getHeader: () => header,
          getEntries: () => [meta(id, parentSessionId, parentSessionPath)],
          getSessionFile: () => path,
          getSessionName: () => undefined,
        },
        abort: async () => {
          events.push(`abort:${id}`);
          setTimeout(() => {
            events.push(`cleanup:${id}`);
            resolveRunning({ sessionId: id, status: "aborted" });
          }, 20);
        },
      },
      shutdown: async () => { events.push(`shutdown:${id}`); },
    };
  };
  const queuedWrapper = wrapper(queuedId, queuedPath, parentId, parentPath, false);
  const runningWrapper = wrapper(runningId, runningPath, queuedId, queuedPath, true);
  globalThis.__piSessions = new Map([
    [queuedId, queuedWrapper],
    [runningId, runningWrapper],
  ]);
  globalThis.__piSubagentRuns = new Map([
    [queuedId, {
      run: { sessionId: queuedId, status: "queued" },
      completion: queuedCompletion,
      abortRequested: false,
      cancelQueued: () => {
        events.push(`cancel:${queuedId}`);
        setTimeout(() => {
          events.push(`cleanup:${queuedId}`);
          resolveQueued({ sessionId: queuedId, status: "aborted" });
        }, 20);
        return true;
      },
    }],
    [runningId, {
      run: { sessionId: runningId, status: "running" },
      completion: runningCompletion,
      abortRequested: false,
    }],
  ]);
  await writeFile(parentPath, `${JSON.stringify({
    type: "session",
    version: 3,
    id: parentId,
    timestamp: "2026-01-01T00:00:00.000Z",
    cwd: dir,
  })}\n`);
  const ask = (askId) => ({
    askId,
    askedAt: "2026-01-01T00:00:00.000Z",
    questions: [{ id: "q", question: "Continue?", options: [{ value: "yes", label: "Yes" }] }],
  });
  await mkdir(dirname(openAsksPath()), { recursive: true });
  for (const id of [parentId, queuedId, runningId]) persistOpenAsk(id, ask(`${id}-ask`));
  cacheSessionPath(parentId, parentPath);
  t.after(async () => {
    globalThis.__piSessions = previousRegistry;
    globalThis.__piSubagentRuns = previousRuns;
    for (const id of [parentId, queuedId, runningId]) {
      forgetPersistedAsk(id);
      invalidateSessionPathCache(id);
    }
    invalidateSessionListCache();
    await rm(dir, { recursive: true, force: true });
  });

  const response = await deleteSession(
    new Request(`http://localhost/api/sessions/${parentId}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: parentId }) },
  );

  assert.equal(response.status, 200);
  assert.ok(events.indexOf(`cleanup:${runningId}`) < events.indexOf(`shutdown:${runningId}`));
  assert.ok(events.indexOf(`cleanup:${queuedId}`) < events.indexOf(`shutdown:${queuedId}`));
  for (const id of [parentId, queuedId, runningId]) assert.equal(readPersistedAsk(id), undefined);
  await assert.rejects(readFile(parentPath), { code: "ENOENT" });
  await assert.rejects(readFile(queuedPath), { code: "ENOENT" });
  await assert.rejects(readFile(runningPath), { code: "ENOENT" });
});

test("descendant cleanup failure returns 500 without unlinking sessions or asks", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-delete-cleanup-failure-"));
  const parentId = "delete-failure-parent";
  const childId = "delete-failure-child";
  const parentPath = join(dir, "parent.jsonl");
  const childPath = join(dir, "child.jsonl");
  const forkPath = join(dir, "ordinary-fork.jsonl");
  const previousRegistry = globalThis.__piSessions;
  const previousRuns = globalThis.__piSubagentRuns;
  let resolveCompletion;
  let running = true;
  let shutdownCalled = false;
  const completion = new Promise((resolve) => { resolveCompletion = resolve; });
  const header = (id, parentSession) => ({
    type: "session",
    version: 3,
    id,
    timestamp: "2026-01-01T00:00:00.000Z",
    cwd: dir,
    ...(parentSession ? { parentSession } : {}),
  });
  const metadata = {
    version: 1,
    parentSessionId: parentId,
    parentSessionPath: parentPath,
    parentToolCallId: "failure-call",
    profile: "Explore",
    description: "Dirty isolated child",
    task: "Modify files",
    runInBackground: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    worktreePath: join(dir, "retained-worktree"),
    worktreeBranch: "pi-web-agent-retained",
  };
  const childEntries = [{
    type: "custom",
    customType: "pi-web:subagent",
    id: "failure-meta",
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    data: metadata,
  }];
  const childWrapper = {
    sessionId: childId,
    sessionFile: childPath,
    cwd: dir,
    isAlive: () => true,
    isRunning: () => running,
    inner: {
      sessionManager: {
        getHeader: () => header(childId, parentPath),
        getEntries: () => childEntries,
        getSessionFile: () => childPath,
        getSessionName: () => undefined,
      },
      abort: async () => {
        running = false;
        childEntries.push({
          type: "custom",
          customType: "pi-web:subagent-result",
          id: "failure-result",
          parentId: "failure-meta",
          timestamp: "2026-01-01T00:01:00.000Z",
          data: {
            version: 1,
            status: "aborted",
            completedAt: "2026-01-01T00:01:00.000Z",
            worktreeCleanupError: "Worktree retained because it is dirty",
          },
        });
        resolveCompletion({
          sessionId: childId,
          status: "aborted",
          worktreeCleanupError: "Worktree retained because it is dirty",
        });
      },
    },
    shutdown: async () => { shutdownCalled = true; },
  };
  globalThis.__piSessions = new Map([[childId, childWrapper]]);
  globalThis.__piSubagentRuns = new Map([[childId, {
    run: { sessionId: childId, status: "running" },
    completion,
    abortRequested: false,
  }]]);
  await writeFile(parentPath, `${JSON.stringify(header(parentId))}\n`);
  await writeFile(childPath, `${JSON.stringify(header(childId, parentPath))}\n${JSON.stringify(childEntries[0])}\n`);
  await writeFile(forkPath, `${JSON.stringify(header("delete-failure-fork", parentPath))}\n`);
  await mkdir(metadata.worktreePath, { recursive: true });
  await mkdir(dirname(openAsksPath()), { recursive: true });
  const ask = {
    askId: "delete-failure-ask",
    askedAt: "2026-01-01T00:00:00.000Z",
    questions: [{ id: "q", question: "Continue?", options: [{ value: "yes", label: "Yes" }] }],
  };
  persistOpenAsk(parentId, ask);
  persistOpenAsk(childId, ask);
  cacheSessionPath(parentId, parentPath);
  t.after(async () => {
    globalThis.__piSessions = previousRegistry;
    globalThis.__piSubagentRuns = previousRuns;
    for (const id of [parentId, childId]) {
      forgetPersistedAsk(id);
      invalidateSessionPathCache(id);
    }
    invalidateSessionListCache();
    await rm(dir, { recursive: true, force: true });
  });

  const response = await deleteSession(
    new Request(`http://localhost/api/sessions/${parentId}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: parentId }) },
  );

  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /Worktree retained because it is dirty/);
  assert.ok((await readFile(parentPath, "utf8")).includes(parentId));
  assert.ok((await readFile(childPath, "utf8")).includes(childId));
  assert.equal(JSON.parse((await readFile(forkPath, "utf8")).split("\n")[0]).parentSession, parentPath);
  assert.equal(readPersistedAsk(parentId)?.askId, ask.askId);
  assert.equal(readPersistedAsk(childId)?.askId, ask.askId);
  assert.equal(shutdownCalled, false);

  // The completed run no longer exists in the transient execution map, but a
  // retry must still fail closed while its retained worktree exists.
  globalThis.__piSubagentRuns.delete(childId);
  const retry = await deleteSession(
    new Request(`http://localhost/api/sessions/${parentId}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: parentId }) },
  );
  assert.equal(retry.status, 500);
  assert.match((await retry.json()).error, /Worktree retained because it is dirty/);
  assert.ok((await readFile(parentPath, "utf8")).includes(parentId));
  assert.ok((await readFile(childPath, "utf8")).includes(childId));
  assert.equal(JSON.parse((await readFile(forkPath, "utf8")).split("\n")[0]).parentSession, parentPath);
});

test("live detail and state routes work without a persisted JSONL file", async (t) => {
  const previousRegistry = globalThis.__piSessions;
  const id = "live-route-test";
  const timestamp = "2026-08-12T01:02:03.000Z";
  const entry = {
    type: "message",
    id: "u1",
    parentId: null,
    timestamp,
    message: { role: "user", content: "hello live" },
  };
  const sessionManager = {
    getHeader: () => ({ type: "session", id, cwd: "/tmp", timestamp }),
    getEntries: () => [entry],
    getLeafId: () => entry.id,
    getTree: () => [],
    getSessionName: () => undefined,
    getSessionFile: () => `/tmp/pi-web-live-route-not-persisted-${process.pid}.jsonl`,
  };
  globalThis.__piSessions = new Map([[id, {
    isAlive: () => true,
    isRunning: () => true,
    inner: { sessionManager },
    sessionFile: sessionManager.getSessionFile(),
    sessionId: id,
    cwd: "/tmp",
    send: async () => ({ isStreaming: true }),
  }]]);
  t.after(() => {
    globalThis.__piSessions = previousRegistry;
  });

  const routeContext = { params: Promise.resolve({ id }) };
  const detailResponse = await getSessionDetail(
    new Request(`http://localhost/api/sessions/${id}`),
    routeContext,
  );
  const stateResponse = await getSessionState(
    new Request(`http://localhost/api/sessions/${id}/state`),
    routeContext,
  );
  const detail = await detailResponse.json();

  assert.equal(detailResponse.status, 200);
  assert.equal(detail.info.transient, true);
  assert.equal(detail.info.projectRoot, "/tmp");
  assert.equal(typeof detail.info.projectKey, "string");
  assert.deepEqual(detail.context.messages.map((message) => message.content), ["hello live"]);
  assert.equal(stateResponse.status, 200);
  assert.deepEqual(await stateResponse.json(), {
    running: true,
    state: { isStreaming: true },
  });
});

test("session detail returns a gzip-compressed response when the client accepts it", async (t) => {
  const previousRegistry = globalThis.__piSessions;
  const id = "live-route-gzip-test";
  const timestamp = "2026-09-05T00:00:00.000Z";
  const firstMessage = "large session detail content ".repeat(500);
  const entry = {
    type: "message",
    id: "u1",
    parentId: null,
    timestamp,
    message: { role: "user", content: firstMessage },
  };
  const call = {
    type: "message",
    id: "a1",
    parentId: entry.id,
    timestamp,
    message: {
      role: "assistant",
      provider: "test",
      model: "test",
      content: [{ type: "toolCall", id: "gzip-tool", name: "trellis_subagent", arguments: {} }],
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { total: 0 } },
    },
  };
  const result = {
    type: "message",
    id: "r1",
    parentId: call.id,
    timestamp,
    message: {
      role: "toolResult",
      toolCallId: "gzip-tool",
      toolName: "trellis_subagent",
      content: [{ type: "text", text: "compressed result" }],
      details: {
        kind: "trellis-subagent-progress",
        agent: "trellis-check",
        mode: "single",
        final: true,
        runs: [{ id: "gzip-run", status: "succeeded", finalText: "compressed result" }],
      },
    },
  };
  const sessionManager = {
    getHeader: () => ({ type: "session", id, cwd: "/tmp", timestamp }),
    getEntries: () => [entry, call, result],
    getLeafId: () => result.id,
    getTree: () => [],
    getSessionName: () => undefined,
    getSessionFile: () => `/tmp/pi-web-live-route-gzip-${process.pid}.jsonl`,
  };
  globalThis.__piSessions = new Map([[id, {
    isAlive: () => true,
    isRunning: () => false,
    inner: { sessionManager },
    sessionFile: sessionManager.getSessionFile(),
    sessionId: id,
    cwd: "/tmp",
  }]]);
  t.after(() => {
    globalThis.__piSessions = previousRegistry;
  });

  const response = await getSessionDetail(
    new Request(`http://localhost/api/sessions/${id}`, {
      headers: { "Accept-Encoding": "gzip" },
    }),
    { params: Promise.resolve({ id }) },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Encoding"), "gzip");
  const payload = JSON.parse(gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8"));
  assert.equal(payload.info.firstMessage, firstMessage);
  assert.equal(payload.trellisSubagentRecords.parentSessionId, id);
  assert.equal(payload.trellisSubagentRecords.leafId, result.id);
  assert.equal(payload.trellisSubagentRecords.records[0].runId, "gzip-run");
  assert.equal(payload.trellisSubagentRecords.records[0].finalText, "compressed result");
});
