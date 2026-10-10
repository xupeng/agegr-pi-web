import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const windowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const input = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");

test("the app owns the viewport hook, while an explicit session change remounts only ChatWindow", () => {
  assert.equal((shell.match(/useViewportHeight\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(windowSource, /useViewportHeight/);
  assert.match(shell, /<ChatWindow\s*key=\{sessionKey\}/);
  assert.match(shell, /setSelectedSession\(session\);\s*setSessionKey\(\(k\) => k \+ 1\)/);
  const created = shell.slice(shell.indexOf("const handleSessionCreated"), shell.indexOf("const deliverSessionNotification"));
  assert.doesNotMatch(created, /setSessionKey/);
});

test("busy or read-only tool selection does not make the ordinary textarea readonly or autofocus it", () => {
  const textarea = input.slice(input.indexOf("<textarea"), input.indexOf("/>", input.indexOf("<textarea")));
  assert.ok(textarea.includes('className="chat-input-textarea"'));
  assert.doesNotMatch(textarea, /\b(?:readOnly|disabled|autoFocus)\b/);
  assert.match(input, /<fieldset\s*disabled=\{builtinCommandPending\}/);
  assert.match(input, /const runBuiltinCommand[\s\S]*?setBuiltinCommandPending\(true\)[\s\S]*?finally \{[\s\S]*?setBuiltinCommandPending\(false\)/);
  assert.doesNotMatch(input, /\.blur\(/);
});

test("existing conversations have no lower flex spacer; only extension status follows the primary composer", () => {
  assert.match(windowSource, /\{chatInputElement\}\s*<ExtensionStatusBar[^>]*\/>\s*<\/div>\s*\{isEmptyNew && <div className="chat-empty-bottom-spacer min-h-0 flex-1" \/>\}/);
  assert.match(windowSource, /if \(loading\) \{\s*return \(/);
  assert.equal((windowSource.match(/\{chatInputElement\}/g) ?? []).length, 1);
});
