import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

export const STATUS_TAIL_SESSION = "e2e-status-tail-session";

const TIMESTAMP = "2026-08-23T00:00:00.000Z";
// The status line renders `Running bash... <last output line>`
// (lib/tool-execution-progress.ts takes the last non-empty line of the partial
// result), so a long single output line is what makes the label wrap.
const LONG_PROGRESS_LINE = `npm run dev --prefix /home/runner/work/pi-web/pi-web --port 30141 --turbopack --verbose ${"and-more-output ".repeat(8)}`.trim();

/**
 * Session long enough that the message list really overflows, so the prompt
 * anchor spacer is zero and the tail is the scroll tail.
 */
export function statusTailEntries() {
  const entries = [];
  for (let i = 0; i < 6; i += 1) {
    entries.push({
      type: "message",
      id: `status-tail-u${i}`,
      parentId: i ? `status-tail-a${i - 1}` : null,
      timestamp: TIMESTAMP,
      message: { role: "user", content: `E2E status tail prompt ${i}` },
    });
    entries.push({
      type: "message",
      id: `status-tail-a${i}`,
      parentId: `status-tail-u${i}`,
      timestamp: TIMESTAMP,
      message: {
        role: "assistant",
        content: [{
          type: "text",
          text: `E2E status tail history ${i} paragraph. `.repeat(12)
            + "\n\n"
            + `E2E status tail history ${i} tail paragraph. `.repeat(12),
        }],
      },
    });
  }
  return entries;
}

/**
 * Mock the session's event stream so the test drives the app's own
 * `agentPhase` state machine (`tool_execution_start` / `tool_execution_update`)
 * without a model or a real run. Non-fixture streams keep the real
 * `EventSource`, and the running-state routes are stubbed so the 15s
 * reconcile does not declare the run finished.
 */
async function installStatusTailStubs(page, sessionId) {
  await page.addInitScript((targetSession) => {
    const OriginalEventSource = window.EventSource;
    class MockEventSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = 1;
      onmessage = null;
      onerror = null;
      constructor(url) {
        this.url = String(url);
        if (!this.url.includes(`/api/agent/${targetSession}/events`)) return new OriginalEventSource(url);
        window.__statusTailSources ??= [];
        window.__statusTailSources.push(this);
      }
      close() {
        this.readyState = 2;
      }
    }
    window.EventSource = MockEventSource;
    window.__emitStatusTailEvent = (event) => {
      const sources = window.__statusTailSources ?? [];
      // Target the stream the app currently maintains: it closes and reopens
      // the selected session's stream, so an earlier mock may be discarded.
      const open = sources.filter((source) => source.readyState === 1);
      const source = open.at(-1) ?? sources.at(-1);
      source?.onmessage?.({ data: JSON.stringify(event) });
    };
  }, sessionId);

  const runningState = {
    running: true,
    state: { isStreaming: false, isPromptRunning: true, isCompacting: false },
  };
  await page.route(`**/api/agent/${sessionId}`, (route) => route.fulfill({ json: runningState }));
  await page.route(`**/api/sessions/${sessionId}/state`, (route) => route.fulfill({ json: runningState }));
  // The SSE is mocked, so the server holds no lease; report renewed:0 so the
  // lifecycle-resume path reopens the stream deterministically.
  await page.route(`**/api/agent/${sessionId}/lease`, (route) => route.fulfill({
    json: { success: true, renewed: 0 },
  }));
}

/**
 * Geometry of the ephemeral run-status line: how many rows it wrapped to, and
 * how far its last row reaches past the bottom of the message viewport (the
 * composer edge). `clippedPx > 0` means the lower row is hidden behind the
 * composer, which is the bug this check guards.
 */
function measureStatusLine(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector(".chat-content .scrollbar-subtle");
    const label = [...document.querySelectorAll("span")]
      .find((span) => /^(Running|Waiting for model)/.test(span.textContent ?? ""));
    if (!scroller || !label) return null;
    // Per-line rects: the block wraps, so only the last wrapped line box can
    // answer "is the lower line visible".
    const range = document.createRange();
    range.selectNodeContents(label);
    const lines = [...range.getClientRects()].filter((rect) => rect.height > 0);
    const last = lines.at(-1);
    const scrollerRect = scroller.getBoundingClientRect();
    return {
      text: label.textContent ?? "",
      lineCount: lines.length,
      clippedPx: last ? Math.round(last.bottom - scrollerRect.bottom) : null,
      scrollerAtBottom: Math.abs(scroller.scrollTop + scroller.clientHeight - scroller.scrollHeight) < 2,
      scrollTop: Math.round(scroller.scrollTop),
    };
  });
}

/** `position` is "top", "bottom", or a pixel count short of the tail. */
async function scrollMessageList(page, position) {
  await page.evaluate((next) => {
    const scroller = document.querySelector(".chat-content .scrollbar-subtle");
    const max = scroller.scrollHeight - scroller.clientHeight;
    scroller.scrollTop = next === "top" ? 0 : typeof next === "number" ? max - next : max;
  }, position);
}

/**
 * The run-status line sits below the last message and grows on its own: a bash
 * tool streams its output, the progress label renders that last output line, and
 * the label wraps to another row without adding a message or an assistant delta.
 * Nothing followed that growth, so the extra row stayed clipped at the composer
 * edge while the tool ran (task: 09-28-mobile-status-line-clip). It must now be
 * followed, and only while the reader is attached to the tail.
 */
export async function checkStatusTailFollow(page, {
  base,
  sessionId = STATUS_TAIL_SESSION,
  expectWrap = true,
}) {
  await installStatusTailStubs(page, sessionId);
  await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  await page.getByText("E2E status tail prompt 5", { exact: true }).waitFor();
  await page.waitForFunction(() => (window.__statusTailSources ?? []).some((source) => source.readyState === 1));
  await delay(400);

  // Start attached to the tail, then let the stream report a running bash tool
  // whose last output line is long enough to wrap the status label.
  await scrollMessageList(page, "bottom");
  await delay(150);
  await page.evaluate(() => window.__emitStatusTailEvent({ type: "agent_start" }));
  await delay(150);
  await page.evaluate(() => window.__emitStatusTailEvent({
    type: "tool_execution_start",
    toolCallId: "status-tail-tool",
    toolName: "bash",
  }));
  await delay(150);
  await page.evaluate((line) => window.__emitStatusTailEvent({
    type: "tool_execution_update",
    toolCallId: "status-tail-tool",
    toolName: "bash",
    partialResult: { content: [{ type: "text", text: `first output line\n${line}` }] },
  }), LONG_PROGRESS_LINE);
  await delay(400);

  const wrapped = await measureStatusLine(page);
  assert.ok(wrapped, "run-status line did not render");
  assert.match(wrapped.text, /^Running bash/, `unexpected status label: ${wrapped.text}`);
  if (expectWrap) {
    assert.ok(
      wrapped.lineCount >= 2,
      `status label must wrap at this width to reproduce the follow bug (rows=${wrapped.lineCount})`,
    );
  }
  assert.ok(
    wrapped.clippedPx <= 0,
    `wrapped status line must stay inside the message viewport (clipped ${wrapped.clippedPx}px past the composer edge)`,
  );
  assert.ok(
    wrapped.scrollerAtBottom,
    "a reader attached to the tail must be re-pinned when the status line grows",
  );

  // A detached reader keeps their position: growing the status line must not
  // drag them back to the tail.
  await scrollMessageList(page, "top");
  await delay(250);
  const detachedBefore = await measureStatusLine(page);
  await page.evaluate(() => window.__emitStatusTailEvent({
    type: "tool_execution_update",
    toolCallId: "status-tail-tool",
    toolName: "bash",
    partialResult: { content: [{ type: "text", text: "another output line that rewraps the status label differently" }] },
  }));
  await delay(400);
  const detachedAfter = await measureStatusLine(page);
  assert.equal(
    detachedAfter?.scrollTop,
    detachedBefore?.scrollTop,
    "a status-line change must not move a reader who scrolled away from the tail",
  );

  // Still attached, but a few pixels short of the tail: an unchanged status
  // block must not scroll (the trigger keys on the rendered text, not on the
  // phase object every update replaces)…
  // Re-attach first: scrolling up from a detached position within the reattach
  // tolerance snaps back to the tail by design (getLiveFollowAttached).
  await scrollMessageList(page, "bottom");
  await delay(250);
  await scrollMessageList(page, 4);
  await delay(250);
  const shortOfTailBefore = await measureStatusLine(page);
  const tailOffset = await page.evaluate(() => {
    const scroller = document.querySelector(".chat-content .scrollbar-subtle");
    return Math.round(scroller.scrollHeight - scroller.clientHeight);
  });
  assert.ok(
    shortOfTailBefore.scrollTop < tailOffset,
    `the attached-but-not-at-tail probe must start short of the tail (scrollTop=${shortOfTailBefore.scrollTop}, tail=${tailOffset})`,
  );
  await page.evaluate(() => window.__emitStatusTailEvent({
    type: "tool_execution_update",
    toolCallId: "status-tail-tool",
    toolName: "bash",
    partialResult: { content: [{ type: "text", text: "another output line that rewraps the status label differently" }] },
  }));
  await delay(400);
  const shortOfTailAfter = await measureStatusLine(page);
  assert.equal(
    shortOfTailAfter?.scrollTop,
    shortOfTailBefore.scrollTop,
    "an unchanged status block must not scroll an attached reader either",
  );

  // …while a changed one does, so the assertion above cannot pass vacuously.
  await page.evaluate((line) => window.__emitStatusTailEvent({
    type: "tool_execution_update",
    toolCallId: "status-tail-tool",
    toolName: "bash",
    partialResult: { content: [{ type: "text", text: line }] },
  }), `${LONG_PROGRESS_LINE} second column of output`);
  await delay(400);
  const shortOfTailFollowed = await measureStatusLine(page);
  assert.ok(
    shortOfTailFollowed.scrollTop > shortOfTailBefore.scrollTop,
    "a changed status block must still re-pin an attached reader",
  );
}
