import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const { DELETE: deleteSession, GET: getSessionDetail } = await jiti.import("./[id]/route.ts");
const { GET: getSessionState } = await jiti.import("./[id]/state/route.ts");
const {
  cacheSessionPath,
  invalidateSessionPathCache,
} = await jiti.import("../../../lib/session-reader.ts");

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

test("deleting an intermediate subagent reparents both relation representations", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "pi-web-delete-reparent-"));
  const grandparentPath = join(dir, "grandparent.jsonl");
  const parentPath = join(dir, "parent.jsonl");
  const childPath = join(dir, "child.jsonl");
  const parentId = "delete-reparent-parent";
  const header = (id, parentSession) => JSON.stringify({
    type: "session",
    version: 3,
    id,
    timestamp: "2026-01-01T00:00:00.000Z",
    cwd: dir,
    ...(parentSession ? { parentSession } : {}),
  });
  await writeFile(grandparentPath, `${header("delete-reparent-grandparent")}\n`);
  await writeFile(parentPath, `${header(parentId, grandparentPath)}\n`);
  await writeFile(childPath, [
    header("delete-reparent-child", parentPath),
    JSON.stringify({
      type: "custom",
      customType: "pi-web:subagent",
      id: "meta",
      parentId: null,
      timestamp: "2026-01-01T00:00:00.000Z",
      data: {
        version: 1,
        parentSessionId: parentId,
        parentSessionPath: parentPath,
        profile: "Explore",
        description: "Inspect parser",
      },
    }),
    "",
  ].join("\n"));
  cacheSessionPath(parentId, parentPath);
  t.after(async () => {
    invalidateSessionPathCache(parentId);
    await rm(dir, { recursive: true, force: true });
  });

  const response = await deleteSession(
    new Request(`http://localhost/api/sessions/${parentId}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: parentId }) },
  );

  assert.equal(response.status, 200);
  await assert.rejects(readFile(parentPath), { code: "ENOENT" });
  const [childHeaderLine, childMetadataLine] = (await readFile(childPath, "utf8")).trim().split("\n");
  assert.equal(JSON.parse(childHeaderLine).parentSession, grandparentPath);
  assert.deepEqual(JSON.parse(childMetadataLine).data, {
    version: 1,
    parentSessionId: "delete-reparent-grandparent",
    parentSessionPath: grandparentPath,
    profile: "Explore",
    description: "Inspect parser",
  });
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
