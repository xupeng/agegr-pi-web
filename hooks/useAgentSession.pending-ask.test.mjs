import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const chatWindowSource = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { resolvePendingAskAfterClose } = await jiti.import("../lib/ask-user/resolve-pending-ask.ts");

function ask(id) {
  return { askId: id, askedAt: "2026-08-29T00:00:00.000Z", questions: [] };
}

test("rebuilds the ask card for each new ask so stale lock state cannot leak", () => {
  assert.match(chatWindowSource, /<AskUserCard[\s\S]*?key=\{pendingAsk\.askId\}/);
});

test("clears the card when the close response matches the current ask", () => {
  const current = ask("a");
  assert.equal(resolvePendingAskAfterClose(current, "a", undefined), null);
  assert.equal(resolvePendingAskAfterClose(current, "a", { result: "closed", outcome: { askId: "a" } }), null);
});

test("keeps a newer ask when a stale close response for the previous ask lands", () => {
  const newer = ask("b");
  // Response for ask "a" arrives while "b" is open and carries no replacement.
  assert.equal(resolvePendingAskAfterClose(newer, "a", undefined), newer);
  assert.equal(resolvePendingAskAfterClose(newer, "a", { result: "stale" }), newer);
});

test("applies the server-provided replacement when the stale close names one", () => {
  const newer = ask("b");
  const replacement = ask("c");
  assert.deepEqual(
    resolvePendingAskAfterClose(newer, "a", { result: "stale", pendingAsk: replacement }),
    replacement,
  );
});

test("falls back to the default clear behavior without a submitted ask id", () => {
  assert.equal(resolvePendingAskAfterClose(ask("a"), undefined, undefined), null);
  assert.deepEqual(
    resolvePendingAskAfterClose(ask("a"), undefined, { result: "stale", pendingAsk: ask("c") }),
    ask("c"),
  );
});
