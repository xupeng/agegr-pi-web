import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const chatWindow = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const chatInput = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const settingsPanel = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const chatAppearanceHook = await readFile(new URL("../hooks/useChatAppearance.ts", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url);
const {
  CHAT_CONTENT_FONT_SIZE_STORAGE_KEY,
  LEGACY_CHAT_FONT_SIZE_OFFSET_STORAGE_KEY,
  clampChatContentWidth,
  clampChatContentFontSize,
  readStoredChatContentFontSize,
} = await jiti.import("../hooks/useChatAppearance.ts");

const widthVariable = /var\(--chat-content-max-width, 820px\)/g;

test("chat content keeps the existing 820px default behind one shared variable", () => {
  assert.equal((chatWindow.match(widthVariable) ?? []).length, 2);
  assert.equal((chatInput.match(widthVariable) ?? []).length, 1);
  assert.match(globals, /--chat-content-max-width: 820px;/);
  assert.doesNotMatch(chatWindow, /max-w-\[820px\]|maxWidth: 820/);
  assert.doesNotMatch(chatInput, /maxWidth: 820/);
});

test("General chat settings own the chat width preference", () => {
  assert.match(chatInput, /useChatAppearance\(\)/);
  assert.match(settingsPanel, /useChatAppearance\(\)/);
  assert.match(settingsPanel, /type="range"/);
  assert.match(settingsPanel, /min=\{CHAT_CONTENT_WIDTH_MIN\}/);
  assert.match(settingsPanel, /max=\{CHAT_CONTENT_WIDTH_MAX\}/);
  assert.match(settingsPanel, /step=\{10\}/);
  assert.match(chatAppearanceHook, /pi-chat-content-width/);
  assert.match(chatAppearanceHook, /localStorage\.setItem/);
});

test("chat width validation preserves the default and supported range", () => {
  assert.equal(clampChatContentWidth(undefined), 820);
  assert.equal(clampChatContentWidth("invalid"), 820);
  assert.equal(clampChatContentWidth(700), 820);
  assert.equal(clampChatContentWidth(1104), 1104);
  assert.equal(clampChatContentWidth(2400), 2000);
});

test("chat font size preserves the default and bounds stored or supplied values", () => {
  for (const value of [undefined, null, "invalid", Infinity, NaN]) {
    assert.equal(clampChatContentFontSize(value), 14);
  }
  assert.equal(clampChatContentFontSize(8), 12);
  assert.equal(clampChatContentFontSize("18"), 18);
  assert.equal(clampChatContentFontSize(18.7), 19);
  assert.equal(clampChatContentFontSize(30), 24);
});

test("migrates the former relative font offset into the canonical absolute preference", () => {
  function storageWith(entries) {
    const values = new Map(entries);
    return {
      values,
      storage: {
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { values.set(key, value); },
      },
    };
  }

  const legacy = storageWith([[LEGACY_CHAT_FONT_SIZE_OFFSET_STORAGE_KEY, JSON.stringify(3)]]);
  assert.equal(readStoredChatContentFontSize(legacy.storage), 17);
  assert.equal(legacy.values.get(CHAT_CONTENT_FONT_SIZE_STORAGE_KEY), "17");

  const clamped = storageWith([[LEGACY_CHAT_FONT_SIZE_OFFSET_STORAGE_KEY, JSON.stringify(-4)]]);
  assert.equal(readStoredChatContentFontSize(clamped.storage), 12);
  assert.equal(clamped.values.get(CHAT_CONTENT_FONT_SIZE_STORAGE_KEY), "12");

  const currentWins = storageWith([
    [CHAT_CONTENT_FONT_SIZE_STORAGE_KEY, "19"],
    [LEGACY_CHAT_FONT_SIZE_OFFSET_STORAGE_KEY, JSON.stringify(4)],
  ]);
  assert.equal(readStoredChatContentFontSize(currentWins.storage), 19);
  assert.equal(currentWins.values.get(CHAT_CONTENT_FONT_SIZE_STORAGE_KEY), "19");

  assert.equal(readStoredChatContentFontSize(null), 14);
  assert.doesNotMatch(globals, /Fork defaults: larger comfortable chat font/);
});
