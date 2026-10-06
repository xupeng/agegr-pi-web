import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const root = mkdtempSync(join(tmpdir(), "notification-persist-"));
const previous = { HOME: process.env.HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
process.env.HOME = join(root, "home");
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
mkdirSync(process.env.HOME);
test.after(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
});
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { loadNotifications, saveNotifications, notificationsPath, decodeNotificationsFile } = await jiti.import("./persist.ts");
const { NotificationStore } = await jiti.import("./store.ts");

test("import alone never creates agent directory; missing file loads null", () => {
  assert.equal(existsSync(process.env.PI_CODING_AGENT_DIR), false);
  assert.equal(loadNotifications(), null);
  assert.equal(existsSync(process.env.PI_CODING_AGENT_DIR), false);
});
test("0600 atomic save round-trips latest completion and ack watermark without metadata/history", () => {
  const store = new NotificationStore();
  store.record({ sessionId: "s1", runIdentity: "run1", resultEntryId: "entry", completionLeafId: "leaf",
    completedAt: "2026-10-06T00:00:00Z", summary: "Visible result" });
  const revision = store.completions()[0].revision;
  assert.equal(statSync(notificationsPath()).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(process.env.PI_CODING_AGENT_DIR), ["pi-web-notifications.json"]);
  const restarted = new NotificationStore();
  assert.equal(restarted.completions()[0].revision, revision);
  assert.equal(restarted.version().instanceId, store.version().instanceId);
  restarted.acknowledge(restarted.completions());
  const saved = loadNotifications();
  assert.deepEqual(saved.completions, []);
  assert.deepEqual(saved.watermarks, [{ sessionId: "s1", runIdentity: "run1" }]);
  assert.doesNotMatch(readFileSync(notificationsPath(), "utf8"), /Visible result/);
});
test("corrupt and unknown-version originals are not silently replaced", () => {
  for (const contents of ["broken {", JSON.stringify({ version: 999 })]) {
    const file = join(root, `bad-${Math.random()}.json`);
    writeFileSync(file, contents);
    const store = new NotificationStore({ load: () => loadNotifications(file), save: (value) => saveNotifications(value, file) });
    store.record({ sessionId: "s1", runIdentity: "run1", resultEntryId: null, completionLeafId: null,
      completedAt: "2026-10-06T00:00:00Z", summary: "new" });
    assert.equal(readFileSync(file, "utf8"), contents);
    assert.equal(store.version().storageHealth, "degraded");
  }
});
test("hostile persisted fields, duplicates and missing watermarks are rejected", () => {
  assert.equal(decodeNotificationsFile({ version: 1, instanceId: "instance", completions: [], watermarks: [{ sessionId: "../x", runIdentity: "run" }] }), null);
  assert.equal(decodeNotificationsFile({ version: 1, instanceId: "instance", completions: [], watermarks: [{ sessionId: "s", runIdentity: "run" }, { sessionId: "s", runIdentity: "other" }] }), null);
  assert.equal(decodeNotificationsFile({ version: 2, instanceId: "instance", completions: [], watermarks: [] }), null);
});
