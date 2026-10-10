import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const input = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/keyboard-viewport.css", import.meta.url), "utf8");

test("only empty new sessions have a lower centring spacer after the composer", () => {
  assert.match(source, /const isEmptyNew = isNew && messages\.length === 0 && !streamState\.isStreaming && !sessionBusy;/);
  assert.match(source, /\{chatInputElement\}\s*<ExtensionStatusBar[^>]*\/>\s*<\/div>\s*\{isEmptyNew && <div className="chat-empty-bottom-spacer min-h-0 flex-1" \/>\}/);
  assert.equal((source.match(/chat-empty-bottom-spacer/g) ?? []).length, 1);
  assert.match(source, /className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"/);
});

test("only the mobile keyboard-open rule removes the empty lower spacer", () => {
  assert.match(css, /@media \(max-width: 640px\), \(pointer: coarse\) and \(max-height: 500px\) \{\s*html\[data-keyboard-open\] \.chat-empty-bottom-spacer \{\s*display: none;\s*\}\s*\}/);
  assert.equal((css.match(/chat-empty-bottom-spacer/g) ?? []).length, 1);
  assert.doesNotMatch(css, /justify-content|margin\s*:|padding\s*:/);
  assert.match(source, /\{isEmptyNew && \(\s*<div className="mb-3 w-full"/);
  assert.match(source, /\{askUserCardInColumn\}\s*<div className="relative shrink-0">/);
});

test("the app-owned diagnostic selector identifies one noncompact composer", () => {
  assert.equal((shell.match(/<ChatWindow\b/g) ?? []).length, 1);
  assert.equal((source.match(/<ChatInput\b/g) ?? []).length, 2);
  assert.match(source, /<ChatInput\s*ref=\{quoteChatInputRef\}\s*compact/);
  assert.match(input, /className=\{compact \? undefined : "chat-input-shell"\}/);
  assert.equal((source.match(/\{chatInputElement\}/g) ?? []).length, 1);
});
