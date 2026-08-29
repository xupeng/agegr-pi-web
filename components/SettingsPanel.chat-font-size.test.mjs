import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelSource = await readFile(new URL("./SettingsPanel.tsx", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const hookSource = await readFile(new URL("../hooks/useChatFontSize.ts", import.meta.url), "utf8");
const preferenceSource = await readFile(new URL("../lib/chat-font-preference.ts", import.meta.url), "utf8");
const globalsCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const settingsCss = await readFile(new URL("../app/settings.css", import.meta.url), "utf8");
const enSource = await readFile(new URL("../lib/i18n/messages/en.ts", import.meta.url), "utf8");
const zhSource = await readFile(new URL("../lib/i18n/messages/zh-CN.ts", import.meta.url), "utf8");
const zhTwSource = await readFile(new URL("../lib/i18n/messages/zh-TW.ts", import.meta.url), "utf8");

test("settings panel exposes a relative chat font size control", () => {
  assert.match(panelSource, /useChatFontSize\(\)/);
  assert.match(panelSource, /normalizeChatFontSizeOffset/);
  assert.match(panelSource, /CHAT_FONT_SIZE_OFFSET_MIN/);
  assert.match(panelSource, /CHAT_FONT_SIZE_OFFSET_MAX/);
  assert.match(panelSource, /settings\.chatFontSize/);
  assert.match(panelSource, /t\("settings\.fontSizeDefault"\)/);
  assert.match(panelSource, /settings-font-size__controls/);
  // 相对偏移：- / 默认 / + 三个按钮，非绝对字号输入
  assert.match(panelSource, /setChatFontSizeOffset\(normalizedOffset - 1\)/);
  assert.match(panelSource, /setChatFontSizeOffset\(0\)/);
  assert.match(panelSource, /setChatFontSizeOffset\(normalizedOffset \+ 1\)/);
});

test("chat window injects the offset as a CSS variable only", () => {
  assert.match(chatWindowSource, /useChatFontSize\(\)/);
  assert.match(chatWindowSource, /"--chat-font-size-offset": `\$\{chatFontSizeOffset\}px`/);
});

test("preference layer clamps and persists a relative offset", () => {
  assert.match(preferenceSource, /CHAT_FONT_SIZE_OFFSET_MIN = -4/);
  assert.match(preferenceSource, /CHAT_FONT_SIZE_OFFSET_MAX = 4/);
  assert.match(preferenceSource, /"pi-chat-font-offset"/);
  assert.match(preferenceSource, /normalizeChatFontSizeOffset/);
  assert.match(hookSource, /useSyncExternalStore/);
});

test("markdown font size stays base + offset with responsive bases", () => {
  assert.match(globalsCss, /--chat-font-size-base: 15\.5px/);
  assert.match(globalsCss, /font-size: calc\(var\(--chat-font-size-base\) \+ var\(--chat-font-size-offset, 0px\)\)/);
  assert.match(globalsCss, /@media \(min-width: 768px\)[\s\S]*?--chat-font-size-base: 17px/);
  assert.match(globalsCss, /@media \(min-width: 1024px\)[\s\S]*?--chat-font-size-base: 16px/);
  assert.match(settingsCss, /\.settings-font-size__controls/);
});

test("settings content area keeps a bounded scroll container", () => {
  // .settings-general 必须有高度约束，overflow-y: auto 才有溢出可滚；
  // 否则内容被 .settings-dialog-main 的 overflow: hidden 裁剪且无法滚动。
  const generalBlock = settingsCss.match(/\.settings-general \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(generalBlock, /height: 100%;/);
  assert.match(generalBlock, /min-height: 0;/);
  assert.match(generalBlock, /overflow-y: auto;/);
});

test("dialog surfaces center via margin auto and scroll when taller than the viewport", () => {
  // iOS Safari 上 100dvh/vh 可能算出大于可视区的高度；若用 align-items: center
  // 居中，弹窗顶部（标题栏/关闭按钮）会被顶出屏幕导致无法关闭。margin: auto
  // 在空间不足时回落顶部对齐，backdrop 滚动兜底。
  const backdrop = settingsCss.match(/\.settings-dialog-backdrop \{[\s\S]*?\}/)?.[0] ?? "";
  const surface = settingsCss.match(/\.settings-dialog-surface \{[\s\S]*?\}/)?.[0] ?? "";
  const modalRoot = settingsCss.match(/\.config-panel-root\.is-modal \{[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(backdrop, /align-items:\s*center/);
  assert.match(backdrop, /overflow-y: auto;/);
  assert.match(surface, /margin: auto;/);
  assert.doesNotMatch(modalRoot, /align-items:\s*center/);
  assert.match(modalRoot, /overflow-y: auto;/);
});

test("small screens render settings as a fullscreen page with a safe-area header", () => {
  const mobileBlock = settingsCss.match(/@media \(max-width: 640px\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(mobileBlock, /\.settings-dialog-surface \{/);
  assert.match(mobileBlock, /width: 100vw;/);
  // 全屏高度提供 vh fallback，避免不支持的 webview 中 dvh 失效回落 auto。
  assert.match(mobileBlock, /height: 100vh;\s*height: 100dvh;/);
  assert.match(mobileBlock, /height: 100dvh;/);
  assert.match(mobileBlock, /max-width: none;/);
  assert.match(mobileBlock, /border-radius: 0;/);
  assert.match(mobileBlock, /margin: 0;/);
  // 全屏模式下 backdrop 不再留边距，header 用安全区 padding 避开状态栏。
  assert.match(mobileBlock, /\.settings-dialog-backdrop \{\s*padding: 0;/);
  assert.match(mobileBlock, /\.settings-dialog-header \{[\s\S]*?padding-top: max\(env\(safe-area-inset-top\), 0px\);/);
  // × 关闭按钮必须叠加安全区（absolute 不受 padding 影响），移动端放大到 44pt。
  const closeRule = settingsCss.match(/\.settings-dialog-close \{[\s\S]*?\}/)?.[0] ?? "";
  assert.match(closeRule, /top: calc\(10px \+ env\(safe-area-inset-top\)\);/);
  assert.match(mobileBlock, /\.settings-dialog-close \{[\s\S]*?top: calc\(3px \+ env\(safe-area-inset-top\)\);\s*width: 44px;\s*height: 44px;/);
});

test("chat font size labels exist in all three locales", () => {
  for (const source of [enSource, zhSource, zhTwSource]) {
    for (const key of [
      "settings.chatFontSize",
      "settings.chatFontSizeDescription",
      "settings.fontSizeDefault",
      "settings.fontSizeDecrease",
      "settings.fontSizeIncrease",
      "settings.fontSizeReset",
    ]) {
      assert.match(source, new RegExp(`"${key}"`));
    }
  }
});
