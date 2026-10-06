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
const source = fs.readFileSync(new URL("./[id]/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
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
  const exports = {};
  runInNewContext(code, { exports, require: (name) => {
    if (name === "fs") return { ...fs, unlinkSync: (path) => {
      if (path === paths[failUnlink]) throw Object.assign(Error("unlink denied"), { code: "EACCES" });
      fs.unlinkSync(path); unlinked.push(path);
    } };
    if (name === "path") return nativeRequire("node:path");
    if (name === "next/server") return { NextResponse: { json: (body, init) => Response.json(body, init) } };
    if (name === "@/lib/session-reader") return readers;
    if (name === "@/lib/session-path") return { sessionPathKey: (path) => path };
    if (name === "@/lib/rpc-manager") return rpc;
    if (name === "@/lib/ask-user/persist") return { forgetPersistedAsk: (id) => forgottenAsks.push(id) };
    if (name === "@/lib/notifications/store") return {
      beginNotificationSessionDeletion: (ids) => store.beginDeletion(ids), forgetNotificationSession: (id) => store.forget(id),
    };
    if (name === "@/lib/subagents") return { SUBAGENT_META_TYPE: "subagent", readSubagentRun: (_entries, id) => id === "child" ? { parentSessionId: "parent" } : null };
    return {};
  } });
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
  const f = fixture({ failUnlink: "child" });
  assert.equal((await f.remove()).status, 500);
  assert.deepEqual(f.forgottenAsks, ["parent"]);
  assert.deepEqual(f.store.completions().map((c) => c.sessionId).sort(), ["child", "fork"]);
  assert.equal(f.store.isDeleting("child"), false, "failure releases undeleted child guard");
  assert.equal(f.store.completions().find((c) => c.sessionId === "child").runIdentity, "run1");
  assert.equal(fs.existsSync(f.paths.parent), false);
  assert.equal(fs.existsSync(f.paths.child), true);
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
