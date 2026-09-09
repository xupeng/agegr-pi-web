import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const askUserCardSource = await readFile(new URL("./AskUserCard.tsx", import.meta.url), "utf8");

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

test("ask_user card has no fixed height cap and no inner scroll", () => {
  // The card grows naturally; the whole message column scrolls instead.
  assert.doesNotMatch(askUserCardSource, /maxHeight/);
  assert.doesNotMatch(askUserCardSource, /overflowY:\s*"auto"/);
});
