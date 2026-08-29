import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Source-assertion guard for the pendingAsk rehydration fix: a ChatWindow
// remount (session switch, page reload, another device) runs loadSession with
// includeState=true and must restore `pendingAsk` from the server state,
// otherwise an unanswered ask_user card silently vanishes.
const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");

test("loadSession includeState branch restores pendingAsk from liveState", () => {
  assert.match(
    source,
    /if \(liveState\.pendingAsk !== undefined\) setPendingAsk\(liveState\.pendingAsk \?\? null\);/,
  );
  // It sits with the other restored state fields, after queuedMessages.
  const queued = source.indexOf("setQueuedMessages(normalizeQueuedMessages(liveState.queuedMessages))");
  const pending = source.indexOf("setPendingAsk(liveState.pendingAsk ?? null)");
  assert.ok(queued !== -1, "queuedMessages restore must exist");
  assert.ok(pending > queued, "pendingAsk restore must follow queuedMessages in the same block");
});

test("mount effect restores pendingAsk from agentState.state", () => {
  assert.match(
    source,
    /if \(agentState\.state\.pendingAsk !== undefined\) setPendingAsk\(agentState\.state\.pendingAsk \?\? null\);/,
  );
});

test("the pendingAsk state itself is still declared and returned", () => {
  assert.match(source, /const \[pendingAsk, setPendingAsk\] = useState<PendingAskUser \| null>\(null\);/);
  assert.match(source, /pendingAsk, submitAsk, cancelAsk,/);
});

test("an open card polls server state so a remote submit closes it too", () => {
  // A remote device's submit only emits ask.closed on its own SSE stream; an
  // idle session has already closed this browser's stream after the grace
  // window. The poll mirrors the server's open ask (including the persisted
  // fallback) so the card disappears within a few seconds on every device.
  assert.match(source, /ASK_USER_STATE_POLL_MS = 3_000/);
  assert.match(source, /if \(!pendingAsk\) return;/);
  assert.match(source, /\/api\/sessions\/\$\{encodeURIComponent\(sid\)\}\/state/);
  assert.match(source, /const remote = d\.state\?\.pendingAsk;/);
  assert.match(source, /setPendingAsk\(null\)/);
  assert.match(source, /remote\.askId !== pendingAsk\.askId/);
});
