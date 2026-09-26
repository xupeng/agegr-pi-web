import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const askUserAppHostSource = await readFile(new URL("./AskUserAppHost.tsx", import.meta.url), "utf8");

test("ask_user card scrolls inside the message column on non-empty sessions", () => {
  // The card is rendered right after the rendered messages, inside the scroll
  // container, so it follows the conversation scroll instead of pinning the
  // composer area and shrinking the message viewport.
  assert.match(
    chatWindowSource,
    /\{askUserCardElement && \(\s*<div style=\{\{ paddingBottom: 12 \}\}>\{askUserCardElement\}<\/div>\s*\)\}/,
  );
  assert.ok(
    chatWindowSource.indexOf("askUserCardElement") < chatWindowSource.indexOf("streamState.isStreaming && hasStreamingContent"),
  );
});

test("composer area no longer hosts the ask_user card", () => {
  // The fixed bottom strip holds only the composer and extension status bar;
  // the card lives above it (header/column region) or inside the scroll column.
  const bottomStrip = chatWindowSource.slice(
    chatWindowSource.indexOf('<div className="relative shrink-0">'),
    chatWindowSource.indexOf("{chatInputElement}", chatWindowSource.indexOf('<div className="relative shrink-0">')),
  );
  assert.ok(chatWindowSource.includes('<div className="relative shrink-0">'), "bottom composer strip exists");
  assert.doesNotMatch(bottomStrip, /askUserCard/);
});

test("empty new-session page keeps the column-aligned ask_user card", () => {
  assert.match(
    chatWindowSource,
    /\{askUserCardInColumn\}\s*<div className="relative shrink-0">\s*\{chatInputElement\}/,
  );
});

test("ask_user host has no fixed height cap and no inner scroll", () => {
  // The layout contract moved from the deleted AskUserCard to the host: the
  // app view column is width-bounded (maxWidth 820) and has a floor (minHeight
  // 220), but it is never height-capped and never scrolls internally — the
  // whole message column scrolls instead.
  assert.match(askUserAppHostSource, /maxWidth: 820/);
  assert.match(askUserAppHostSource, /minHeight: 220/);
  assert.doesNotMatch(askUserAppHostSource, /maxHeight/);
  assert.doesNotMatch(askUserAppHostSource, /overflowY:\s*"auto"/);
});
