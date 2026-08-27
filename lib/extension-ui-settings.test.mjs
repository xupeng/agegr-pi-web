import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const {
  clearExtensionUiVisibilitySettingsCache,
  matchesExtensionUiKeyRule,
  normalizeExtensionUiKeyRules,
  readExtensionUiVisibilitySettings,
  writeExtensionUiVisibilitySettings,
} = await createJiti(import.meta.url).import("./extension-ui-settings.ts");

test("extension UI settings default to hiding powerline widgets", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-extension-ui-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.deepEqual(readExtensionUiVisibilitySettings(join(root, "settings.json")), {
    hiddenWidgetKeys: ["powerline-*"],
    hiddenStatusKeys: [],
  });
});

test("matches exact and trailing-wildcard prefix rules", () => {
  assert.equal(matchesExtensionUiKeyRule("powerline-top", ["powerline-*"]), true);
  assert.equal(matchesExtensionUiKeyRule("powerline", ["powerline-*"]), false);
  assert.equal(matchesExtensionUiKeyRule("task", ["task"]), true);
  assert.equal(matchesExtensionUiKeyRule("tasks", ["task"]), false);
});

test("validates and normalizes extension UI rules", () => {
  assert.deepEqual(normalizeExtensionUiKeyRules([" powerline-* ", "task"], "rules"), ["powerline-*", "task"]);
  assert.throws(() => normalizeExtensionUiKeyRules(["*"], "rules"), /exact keys or prefixes/);
  assert.throws(() => normalizeExtensionUiKeyRules(["a*b"], "rules"), /exact keys or prefixes/);
  assert.throws(() => normalizeExtensionUiKeyRules(["task", "task"], "rules"), /duplicate/);
  assert.throws(() => normalizeExtensionUiKeyRules([""], "rules"), /empty/);
});

test("persists settings privately and preserves unknown fields", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-extension-ui-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const settingsPath = join(root, "settings.json");
  await writeFile(settingsPath, JSON.stringify({ futureSetting: 3 }));

  const saved = writeExtensionUiVisibilitySettings({
    hiddenWidgetKeys: ["powerline-*", "todo"],
    hiddenStatusKeys: ["stash"],
  }, settingsPath);
  assert.deepEqual(saved, {
    hiddenWidgetKeys: ["powerline-*", "todo"],
    hiddenStatusKeys: ["stash"],
  });
  assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), {
    futureSetting: 3,
    version: 1,
    hiddenWidgetKeys: ["powerline-*", "todo"],
    hiddenStatusKeys: ["stash"],
  });
});

test("malformed settings are not overwritten", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-extension-ui-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const settingsPath = join(root, "settings.json");
  await writeFile(settingsPath, "{");
  clearExtensionUiVisibilitySettingsCache();

  assert.throws(() => readExtensionUiVisibilitySettings(settingsPath));
  assert.throws(() => writeExtensionUiVisibilitySettings({
    hiddenWidgetKeys: [],
    hiddenStatusKeys: [],
  }, settingsPath));
  assert.equal(await readFile(settingsPath, "utf8"), "{");
});
