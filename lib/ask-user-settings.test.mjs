import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const {
  getAskUserSettingsPath,
  isAskUserEnabled,
  readAskUserSetting,
  writeAskUserSetting,
} = await jiti.import("./ask-user-settings.ts");

const testDir = mkdtempSync(join(tmpdir(), "pi-web-ask-settings-"));
const settingsPath = join(testDir, "pi-web-settings.json");
const originalEnv = process.env.PI_WEB_ASK_USER;

after(() => {
  if (originalEnv === undefined) delete process.env.PI_WEB_ASK_USER;
  else process.env.PI_WEB_ASK_USER = originalEnv;
  rmSync(testDir, { recursive: true, force: true });
});

test("defaults to enabled when nothing is persisted and no env is set", () => {
  delete process.env.PI_WEB_ASK_USER;
  assert.equal(readAskUserSetting(settingsPath), undefined);
  assert.equal(isAskUserEnabled(), true);
});

test("writeAskUserSetting persists and readAskUserSetting round-trips", () => {
  writeAskUserSetting(false, settingsPath);
  assert.equal(readAskUserSetting(settingsPath), false);
  writeAskUserSetting(true, settingsPath);
  assert.equal(readAskUserSetting(settingsPath), true);
});

test("write preserves unknown fields in the settings file", () => {
  writeFileSync(settingsPath, JSON.stringify({ version: 1, someOther: "kept" }, null, 2));
  writeAskUserSetting(true, settingsPath);
  const stored = JSON.parse(readFileSync(settingsPath, "utf8"));
  assert.equal(stored.someOther, "kept");
  assert.equal(stored.askUser, true);
});

test("missing file with unknown fields read is not an error", () => {
  const missing = join(testDir, "does-not-exist.json");
  assert.equal(readAskUserSetting(missing), undefined);
  assert.equal(isAskUserEnabled(), true);
});

test("PI_WEB_ASK_USER env wins over the persisted preference", () => {
  writeAskUserSetting(true, settingsPath);
  process.env.PI_WEB_ASK_USER = "0";
  assert.equal(isAskUserEnabled(), false);
  process.env.PI_WEB_ASK_USER = "true";
  assert.equal(isAskUserEnabled(), true);
  delete process.env.PI_WEB_ASK_USER;
  assert.equal(isAskUserEnabled(), true);
});

test("settings path lives under the agent dir", () => {
  const path = getAskUserSettingsPath("/tmp/fake-agent-dir");
  assert.equal(path, "/tmp/fake-agent-dir/pi-web-settings.json");
});
