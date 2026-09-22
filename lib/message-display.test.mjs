import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  return import("./message-display.ts");
}

function assistant(content) {
  return {
    role: "assistant",
    provider: "test",
    model: "test-model",
    content,
  };
}

test("bounds thinking previews to the first nonblank line without splitting Unicode characters", async () => {
  const { getThinkingPreview } = await loadSubject();
  assert.equal(getThinkingPreview(" \r\n **First line** \r\nSecond line"), "**First line**");
  assert.equal(getThinkingPreview("First\rSecond"), "First");
  assert.equal(getThinkingPreview(" \n\t"), "");
  assert.equal(getThinkingPreview("\u{1F4A1}".repeat(300)), "\u{1F4A1}".repeat(240));
});

test("splits trailing final answer blocks from process blocks", async () => {
  const { splitFinalAssistantBlocks } = await loadSubject();
  const message = assistant([
    { type: "thinking", thinking: "work through it" },
    { type: "toolCall", toolCallId: "call-1", toolName: "bash", input: {} },
    { type: "text", text: "Final answer" },
    { type: "image", source: { type: "url", url: "https://example.com/final.png" } },
  ]);

  const result = splitFinalAssistantBlocks(message, { isStreaming: false });

  assert.deepEqual(result.answerBlocks.map((block) => block.type), ["text", "image"]);
  assert.deepEqual(result.processBlocks.map((block) => block.type), ["thinking", "toolCall"]);
});

test("keeps pre-tool text in process blocks", async () => {
  const { splitFinalAssistantBlocks } = await loadSubject();
  const message = assistant([
    { type: "text", text: "I will inspect the repo first." },
    { type: "toolCall", toolCallId: "call-1", toolName: "bash", input: {} },
    { type: "text", text: "Final answer" },
  ]);

  const result = splitFinalAssistantBlocks(message, { isStreaming: false });

  assert.deepEqual(result.answerBlocks.map((block) => block.type), ["text"]);
  assert.equal(result.answerBlocks[0].text, "Final answer");
  assert.deepEqual(result.processBlocks.map((block) => block.type), ["text", "toolCall"]);
});

test("does not expose text before a trailing tool call as final answer", async () => {
  const { splitFinalAssistantBlocks } = await loadSubject();
  const message = assistant([
    { type: "thinking", thinking: "work through it" },
    { type: "text", text: "I need to call a tool." },
    { type: "toolCall", toolCallId: "call-1", toolName: "bash", input: {} },
  ]);

  const result = splitFinalAssistantBlocks(message, { isStreaming: false });

  assert.deepEqual(result.answerBlocks, []);
  assert.deepEqual(result.processBlocks.map((block) => block.type), ["thinking", "text", "toolCall"]);
});

test("drops empty thinking blocks after completion", async () => {
  const { getDisplayableAssistantBlocks, splitFinalAssistantBlocks } = await loadSubject();
  const message = assistant([
    { type: "thinking", thinking: "" },
    { type: "text", text: "Final answer" },
  ]);

  assert.deepEqual(
    getDisplayableAssistantBlocks(message, { isStreaming: false }).map((block) => block.type),
    ["text"],
  );

  const result = splitFinalAssistantBlocks(message, { isStreaming: false });
  assert.deepEqual(result.answerBlocks.map((block) => block.type), ["text"]);
  assert.deepEqual(result.processBlocks, []);
});

test("keeps empty thinking while streaming", async () => {
  const { splitFinalAssistantBlocks } = await loadSubject();
  const message = assistant([
    { type: "thinking", thinking: "" },
    { type: "text", text: "Partial answer" },
  ]);

  const result = splitFinalAssistantBlocks(message, { isStreaming: true });

  assert.deepEqual(result.answerBlocks.map((block) => block.type), ["text"]);
  assert.deepEqual(result.processBlocks.map((block) => block.type), ["thinking"]);
});

test("keeps deferred historical thinking placeholders", async () => {
  const { getDisplayableAssistantBlocks } = await loadSubject();
  const message = assistant([
    { type: "thinking", thinking: "", deferred: true },
    { type: "text", text: "Final answer" },
  ]);

  assert.deepEqual(
    getDisplayableAssistantBlocks(message, { isStreaming: false }).map((block) => block.type),
    ["thinking", "text"],
  );
});

test("returns completed provider errors even when the message has no content", async () => {
  const { getAssistantErrorMessage } = await loadSubject();
  const message = {
    ...assistant([]),
    stopReason: "error",
    errorMessage: "OpenAI API error (403): request forbidden",
  };

  assert.equal(
    getAssistantErrorMessage(message),
    "OpenAI API error (403): request forbidden",
  );
  assert.equal(getAssistantErrorMessage(message, { isStreaming: true }), null);
});

test("falls back when a provider error has no message", async () => {
  const { getAssistantErrorMessage } = await loadSubject();

  assert.equal(
    getAssistantErrorMessage({ ...assistant([]), stopReason: "error" }),
    "Unknown provider error",
  );
  assert.equal(
    getAssistantErrorMessage({ ...assistant([]), stopReason: "stop" }),
    null,
  );
});

test("treats compaction summaries as turn anchors", async () => {
  const { isMessageGroupAnchor } = await loadSubject();

  assert.equal(isMessageGroupAnchor({ role: "user", content: "prompt" }), true);
  assert.equal(isMessageGroupAnchor({
    role: "custom",
    customType: "compaction",
    content: "summary",
    display: true,
  }), true);
  assert.equal(isMessageGroupAnchor(assistant([])), false);
});

test("isAssistantTruncated is true only for a finished stopReason length", async () => {
  const { isAssistantTruncated } = await loadSubject();

  const truncated = {
    ...assistant([{ type: "thinking", thinking: " lengthy reasoning " }]),
    stopReason: "length",
  };
  assert.equal(isAssistantTruncated(truncated), true);
  // Still streaming: the final stopReason is not known yet.
  assert.equal(isAssistantTruncated(truncated, { isStreaming: true }), false);
  assert.equal(isAssistantTruncated({ ...assistant([]), stopReason: "stop" }), false);
  assert.equal(isAssistantTruncated({ ...assistant([]), stopReason: "error", errorMessage: "oops" }), false);
  assert.equal(isAssistantTruncated({ ...assistant([]) }), false);
});

test("formatStallAbortNotice names the tool, silence and running time", async () => {
  const { formatStallAbortNotice } = await loadSubject();
  const translate = (key, params) => `${key} ${JSON.stringify(params)}`;

  assert.equal(
    formatStallAbortNotice(
      { toolName: "bash", silentMs: 16 * 60_000, toolElapsedMs: 95 * 60_000 },
      translate,
    ),
    'chat.stalledTurnAborted {"tool":"bash","minutes":16,"elapsed":"1h 35m"}',
  );

  // No tool: falls back to the turn elapsed time and the no-tool copy.
  assert.equal(
    formatStallAbortNotice({ silentMs: 60_000, elapsedMs: 90_000 }, translate),
    'chat.stalledTurnAbortedNoTool {"minutes":1,"elapsed":"1m 30s"}',
  );

  // Missing/invalid fields must not produce NaN or throw.
  assert.equal(
    formatStallAbortNotice({ toolName: "  ", silentMs: "nope" }, translate),
    'chat.stalledTurnAbortedNoTool {"minutes":1,"elapsed":"0s"}',
  );

  for (const value of [null, "stall", { toolName: 123, silentMs: Number.NaN }, { silentMs: -5000 }]) {
    const text = formatStallAbortNotice(value, translate);
    assert.equal(text.includes("NaN"), false, `payload ${JSON.stringify(value)} leaked NaN`);
    assert.equal(
      text,
      'chat.stalledTurnAbortedNoTool {"minutes":1,"elapsed":"0s"}',
    );
  }
});

test("formatDurationMs renders compact hour, minute and second labels", async () => {
  const { formatDurationMs } = await loadSubject();
  assert.equal(formatDurationMs(0), "0s");
  assert.equal(formatDurationMs(-10), "0s");
  assert.equal(formatDurationMs(45_000), "45s");
  assert.equal(formatDurationMs(95_000), "1m 35s");
  assert.equal(formatDurationMs(3_600_000 + 120_000), "1h 2m");
  assert.equal(formatDurationMs(Number.NaN), "0s");
});
