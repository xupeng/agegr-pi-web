import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The repository has no DOM test environment, so these assertions read the
// component source the same way SettingsPanel.test.mjs does.
const source = await readFile(new URL("./AppendSystemConfig.tsx", import.meta.url), "utf8");

test("states the effective scope of the append instructions", () => {
  // R3/AC5: the three exclusions are exactly what users get wrong, so they are
  // a hard requirement of this surface rather than a footnote.
  assert.match(source, /settings\.appendSystemScopeNormal/);
  assert.match(source, /settings\.appendSystemScopeChatOnly/);
  assert.match(source, /settings\.appendSystemScopeSubagent/);
  // ...and changing the file must not silently imply a running session changed.
  assert.match(source, /settings\.appendSystemReloadHint/);
});

test("reports both project-override states, and only when a file was found", () => {
  assert.match(source, /\{state\?\.projectOverride && \(/);
  assert.match(source, /settings\.appendSystemProjectOverrideActive/);
  assert.match(source, /settings\.appendSystemProjectOverrideUntrusted/);
  // The heading must not claim an override for a project that has no file.
  assert.doesNotMatch(source, /settings\.appendSystemProjectOverrideTitle[\s\S]{0,400}?\n\s*\{?state\?\.projectOverride/);
});

test("takes the file path from the server instead of rebuilding it", () => {
  assert.match(source, /\{state && <code[^>]*>\{state\.path\}/);
  // A hand-built path would drift from getAgentDir() (and would be wrong on
  // Windows); the writable target is the server's answer.
  assert.doesNotMatch(source, /APPEND_SYSTEM\.md/);
  assert.doesNotMatch(source, /homedir\(\)/);
});

test("measures UTF-8 bytes and blocks over-limit saves", () => {
  // content.length counts UTF-16 units, so a CJK draft could pass the UI check
  // and then be rejected by the server at the 65536-byte boundary.
  assert.match(source, /new TextEncoder\(\)\.encode\(draft\)\.length/);
  assert.match(source, /const overLimit = byteLength > maxBytes;/);
  assert.match(source, /const canSave = state !== null && dirty && !overLimit && !saving;/);
  assert.match(source, /method: "PUT"/);
});
