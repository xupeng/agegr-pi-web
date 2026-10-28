import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createJiti } from "jiti";

const root = fs.mkdtempSync(join(tmpdir(), "notification-delete-"));
const previous = { HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
process.env.HOME = join(root, "home");
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
fs.mkdirSync(process.env.HOME);
test.after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  fs.rmSync(root, { recursive: true, force: true });
});
const { NotificationStore } = await createJiti(import.meta.url).import("../../../lib/notifications/store.ts");
const transpile = (url) => ts.transpileModule(fs.readFileSync(url, "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
// DELETE /api/sessions/[id] only maps a status; the bookkeeping under test
// (notification rows, persisted asks, guards, re-parenting, unlinks) lives in
// lib/session-delete.ts, so both modules run against the same stubs.
const code = transpile(new URL("./[id]/route.ts", import.meta.url));
const deleteCode = transpile(new URL("../../../lib/session-delete.ts", import.meta.url));
const nativeRequire = createRequire(import.meta.url);

function fixture({ failUnlink, failShutdown = false } = {}) {
  const dir = fs.mkdtempSync(join(root, "fixture-"));
  const paths = Object.fromEntries(["parent", "child", "fork"].map((id) => [id, join(dir, `${id}.jsonl`)]));
  const parentHeader = { type: "session", version: 3, id: "parent", cwd: dir };
  fs.writeFileSync(paths.parent, `${JSON.stringify(parentHeader)}\n`);
  for (const id of ["child", "fork"]) fs.writeFileSync(paths[id], `${JSON.stringify({ ...parentHeader, id, parentSession: paths.parent })}\n`);
  const store = new NotificationStore({ load: () => null, save: () => {} });
  for (const id of ["parent", "child", "fork"]) store.record({ sessionId: id, runIdentity: "run1",
    resultEntryId: "entry", completionLeafId: "leaf", completedAt: "2026-10-06T00:00:00Z", summary: "Done" });
  const forgottenAsks = [];
  const unlinked = [];
  const shutdownGuards = [];
  const sessions = [
    { id: "parent", path: paths.parent },
    { id: "child", path: paths.child, relation: { kind: "subagent", parentSessionId: "parent" } },
    { id: "fork", path: paths.fork, relation: { kind: "fork", originSessionId: "parent" } },
  ];
  const readers = {
    resolveSessionPath: async (id) => paths[id], readSessionHeader: (path) => JSON.parse(fs.readFileSync(path, "utf8").split("\n")[0]),
    listAllSessions: async () => sessions, mergeSessionLists: (disk) => disk,
    openSessionManager: () => ({ getEntries: () => [] }),
    invalidateSessionPathCache: () => {}, invalidateSessionManagerCache: () => {}, invalidateSessionListCache: () => {},
  };
  const rpc = {
    getRpcSessionInfos: () => [], abortSubagent: async () => {},
    getRpcSession: (id) => ({ sessionFile: paths[id], isAlive: () => false,
      shutdown: async () => {
        shutdownGuards.push(store.isDeleting(id));
        store.record({ sessionId: id, runIdentity: "late", resultEntryId: "late-entry", completionLeafId: "late-leaf",
          completedAt: "2026-10-06T00:00:00Z", summary: "late" });
        if (failShutdown) throw Error("shutdown failure");
      } }),
  };
  const fsStub = { ...fs, unlinkSync: (path) => {
    if (path === paths[failUnlink]) throw Object.assign(Error("unlink denied"), { code: "EACCES" });
    fs.unlinkSync(path); unlinked.push(path);
  } };
  const pathStub = { sessionPathKey: (path) => path };
  const persistStub = { forgetPersistedAsk: (id) => forgottenAsks.push(id) };
  const storeStub = {
    beginNotificationSessionDeletion: (ids) => store.beginDeletion(ids), forgetNotificationSession: (id) => store.forget(id),
  };
  const subagentsStub = { SUBAGENT_META_TYPE: "subagent", readSubagentRun: (_entries, id) => id === "child" ? { parentSessionId: "parent" } : null };
  const uiStateStub = { forgetSessionUiState: async () => {} };
  // The route imports through the "@/lib/..." alias, lib/session-delete.ts
  // through relative specifiers; both must land on the same stubs.
  const modules = {
    fs: fsStub,
    path: nativeRequire("node:path"),
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/session-reader": readers, "./session-reader": readers,
    "@/lib/session-path": pathStub, "./session-path": pathStub,
    "@/lib/rpc-manager": rpc, "./rpc-manager": rpc,
    "@/lib/ask-user/persist": persistStub, "./ask-user/persist": persistStub,
    "@/lib/notifications/store": storeStub, "./notifications/store": storeStub,
    "@/lib/subagents": subagentsStub, "./subagents": subagentsStub,
    "@/lib/session-ui-state": uiStateStub, "./session-ui-state": uiStateStub,
  };
  const load = (transpiled) => {
    const exports = {};
    runInNewContext(transpiled, { exports, require: (name) => modules[name] ?? {} });
    return exports;
  };
  modules["@/lib/session-delete"] = load(deleteCode);
  const exports = load(code);
  return { store, paths, forgottenAsks, unlinked, shutdownGuards,
    remove: () => exports.DELETE(new Request("http://localhost/api/sessions/parent", { method: "DELETE" }), { params: Promise.resolve({ id: "parent" }) }) };
}

test("successful deletion forgets actual parent/descendants, preserves reparented ordinary fork", async () => {
  const f = fixture();
  const response = await f.remove();
  assert.equal(response.status, 200);
  assert.deepEqual(f.forgottenAsks.sort(), ["child", "parent"]);
  assert.deepEqual(f.store.completions().map((c) => c.sessionId), ["fork"]);
  assert.ok(f.shutdownGuards.every(Boolean), "guard armed before any async shutdown");
  assert.equal(JSON.parse(fs.readFileSync(f.paths.fork, "utf8").split("\n")[0]).parentSession, undefined);
  assert.equal(fs.existsSync(f.paths.parent), false);
  assert.equal(fs.existsSync(f.paths.child), false);
});
test("partial unlink failure clears only the actually successful deletion set", async () => {
  // lib/session-delete.ts unlinks descendants before their parent, so failing
  // the parent's unlink is the case with one success behind it; the assertions
  // below hold whichever order the unlink loop takes.
  const f = fixture({ failUnlink: "parent" });
  assert.equal((await f.remove()).status, 500);
  const deleted = ["parent", "child"].filter((id) => !fs.existsSync(f.paths[id]));
  const kept = ["parent", "child"].filter((id) => !deleted.includes(id));
  assert.equal(deleted.length, 1, "one unlink succeeds before the failing one");
  assert.deepEqual(f.forgottenAsks, deleted, "only actually unlinked sessions lose their persisted ask");
  assert.deepEqual(f.store.completions().map((c) => c.sessionId).sort(), ["fork", ...kept].sort());
  for (const id of kept) {
    assert.equal(f.store.isDeleting(id), false, "failure releases the guard of a session it could not delete");
    assert.equal(f.store.completions().find((c) => c.sessionId === id).runIdentity, "run1");
  }
});
test("pre-unlink shutdown failure preserves notifications and releases all temporary guards", async () => {
  const f = fixture({ failShutdown: true });
  assert.equal((await f.remove()).status, 500);
  assert.equal(f.unlinked.length, 0);
  assert.equal(f.forgottenAsks.length, 0);
  assert.deepEqual(f.store.completions().map((c) => c.sessionId).sort(), ["child", "fork", "parent"]);
  assert.equal(f.store.isDeleting("parent"), false);
  assert.equal(f.store.isDeleting("child"), false);
  assert.equal(JSON.parse(fs.readFileSync(f.paths.fork, "utf8").split("\n")[0]).parentSession, f.paths.parent);
});
