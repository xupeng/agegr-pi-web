import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

// Isolate before importing any application/SDK module. No component mount or
// browser evidence is claimed by these source and shared-settings regressions.
const root = mkdtempSync(join(tmpdir(), "pi-web-ask-retirement-"));
const environmentKeys = ["HOME", "PI_CODING_AGENT_DIR", "PI_OFFLINE", "JITI_FS_CACHE", "PI_WEB_ASK_USER"];
const originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
process.env.HOME = join(root, "home");
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
process.env.PI_OFFLINE = "1";
process.env.JITI_FS_CACHE = "false";
process.env.PI_WEB_ASK_USER = "0";
mkdirSync(process.env.HOME, { recursive: true });
mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
after(() => {
  for (const key of environmentKeys) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
  rmSync(root, { recursive: true, force: true });
});

const panelSource = readFileSync(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const generalSource = panelSource.slice(panelSource.indexOf("function GeneralSettings("), panelSource.indexOf("export function SettingsPanel("));
const jiti = createJiti(import.meta.url, { moduleCache: false, fsCache: false });
const { getLocalePlugin, getSupportedLocales } = await jiti.import("../lib/i18n/registry.ts");
const { getPiWebSettingsPath, readPiWebSettings, writePiWebSettings } = await jiti.import("../lib/pi-web-settings.ts");

test("retires the AskUser settings API, helper and old enable/disable tests rather than leaving a facade", () => {
  for (const path of [
    "../app/api/settings/ask-user/route.ts",
    "../lib/ask-user-settings.ts",
    "../lib/ask-user-settings.test.mjs",
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, `${path} must be removed`);
  }
});

test("General has no AskUser section, setting state, fetch, toggle or dedicated reload UI", () => {
  assert.ok(generalSource.startsWith("function GeneralSettings("));
  assert.doesNotMatch(panelSource, /askUser|AskUser|ask-user|ask_user|PI_WEB_ASK_USER/);
  assert.doesNotMatch(generalSource, /agents\.reloadRequired|agents\.reloadSession/);
  // These are still General controls, not part of the retired setting.
  for (const key of [
    "settings.appearance", "settings.chat", "settings.thinkingExpandedDefault",
    "settings.chatContentWidth", "settings.chatContentFontSize", "settings.quoteSelection",
    "settings.enterSendMode", "settings.shellTool", "settings.usePowerShell",
    "settings.pushPermission", "common.language", "auth.logOut", "settings.extensionUi",
    "settings.hiddenWidgetKeys", "settings.hiddenStatusKeys",
  ]) assert.ok(generalSource.includes(`t("${key}")`), key);
  for (const endpoint of ["/api/extension-ui/settings", "/api/tools/settings", "/api/web-auth"]) {
    assert.ok(generalSource.includes(`fetch("${endpoint}"`), endpoint);
  }
});

test("General retains the session reload dependencies used by extension visibility and PowerShell saves", () => {
  assert.match(generalSource, /function GeneralSettings\(\{ sessionId, onSessionReloaded,/);
  for (const handler of ["saveExtensionUiSettings", "togglePowerShell"]) {
    const start = generalSource.indexOf(`const ${handler} = async`);
    assert.ok(start >= 0, handler);
    const body = generalSource.slice(start, generalSource.indexOf("\n  };", start));
    assert.match(body, /if \(sessionId\) \{\s*await sendAgentCommand\(sessionId, \{ type: "reload" \}\);\s*onSessionReloaded\(\);/);
  }
  assert.match(panelSource, /import \{ sendAgentCommand \} from "@\/lib\/agent-client"/);
  assert.match(panelSource, /<GeneralSettings sessionId=\{sessionId\} onSessionReloaded=\{onSessionReloaded\}/);
});

test("retirement leaves other panes' reload, trust and stacked dialog wiring intact", () => {
  for (const component of ["AgentsConfig", "PluginsConfig"]) {
    assert.match(panelSource, new RegExp(`<${component} embedded[^\\n]*sessionId=\\{sessionId\\}[^\\n]*onReloaded=\\{onSessionReloaded\\}`));
  }
  assert.match(panelSource, /<AppendSystemConfig embedded[^\n]*onSessionReloaded=\{onSessionReloaded\}/);
  assert.match(panelSource, /<McpConfig embedded[^\n]*trust=\{projectTrust\} onTrustProject=\{onOpenTrustDialog\} onProjectTrustChanged=\{onProjectTrustChanged\}/);
  assert.match(panelSource, /listenForPanelEscape\(document, onClose\)/);
  assert.match(panelSource, /focusModalPanel\(document, dialogRef\.current/);
  assert.match(panelSource, /mountedSections\.has\(id\)/);
  assert.match(panelSource, /hidden=\{section !== id\}/);
});

test("all locales drop only AskUser settings copy and retain form and shared reload copy", () => {
  assert.deepEqual(getSupportedLocales(), ["en", "zh-CN", "zh-TW"]);
  const englishKeys = Object.keys(getLocalePlugin("en").messages).sort();
  const retained = [
    "chat.askUserTitle", "chat.askUserAnswered", "chat.askUserOther",
    "chat.askUserOtherPlaceholder", "chat.askUserMultipleOtherPlaceholder",
    "chat.askUserSupplementTitle", "chat.askUserSupplementPlaceholder",
    "chat.askUserSubmitted", "chat.askUserCancelling", "chat.askUserHint", "chat.askUserActionFailed",
    "agents.reloadRequired", "agents.reloadSession", "agents.reloading",
    "settings.extensionUi", "settings.usePowerShell", "settings.appearance",
  ];
  for (const locale of getSupportedLocales()) {
    const { messages } = getLocalePlugin(locale);
    assert.equal(Object.hasOwn(messages, "settings.askUserTitle"), false);
    assert.equal(Object.hasOwn(messages, "settings.askUserDescription"), false);
    assert.deepEqual(Object.keys(messages).sort(), englishKeys, `${locale} registry keys`);
    for (const key of retained) assert.ok(messages[key], `${locale}.${key} is shared or still used`);
  }
});

test("shared settings keep retired askUser as an unknown field without a migration write", () => {
  const settingsPath = getPiWebSettingsPath();
  assert.equal(settingsPath, join(process.env.PI_CODING_AGENT_DIR, "pi-web-settings.json"));
  const original = { version: 1, askUser: false, stallTimeoutMs: 90000, futureSetting: { nested: "kept" } };
  const text = JSON.stringify(original, null, 2);
  writeFileSync(settingsPath, text, { mode: 0o600 });
  const before = statSync(settingsPath);
  assert.deepEqual(readPiWebSettings(), original);
  assert.equal(readFileSync(settingsPath, "utf8"), text);
  assert.equal(statSync(settingsPath).mtimeMs, before.mtimeMs);
  assert.deepEqual(writePiWebSettings({ stallTimeoutMs: 120000 }), { ...original, stallTimeoutMs: 120000 });
  assert.deepEqual(JSON.parse(readFileSync(settingsPath, "utf8")), { ...original, stallTimeoutMs: 120000 });
  if (process.platform !== "win32") assert.equal(statSync(settingsPath).mode & 0o777, 0o600);
});
