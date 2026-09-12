import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import { SessionManager } from "@earendil-works/pi-coding-agent";

const jiti = createJiti(import.meta.url);
const { buildSessionContext } = await jiti.import("./session-reader.ts");
const { normalizeToolCalls } = await jiti.import("./normalize.ts");
const { projectTrellisSubagentHistory } = await jiti.import("./trellis-subagent-history.ts");

const PARENT = "persisted-parent";

function usage() {
  return {
    input: 1,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function detailsFor(mode, runs) {
  return {
    kind: "trellis-subagent-progress",
    agent: "trellis-implement",
    mode,
    startedAt: 1,
    updatedAt: 2,
    final: true,
    runs,
  };
}

function runState(id, overrides = {}) {
  return {
    id,
    agent: "trellis-implement",
    prompt: "do the work",
    status: "succeeded",
    finalText: `output ${id}`,
    textTail: "tail",
    thinkingTail: "",
    stderrTail: "",
    tools: [{ id: "t1", name: "bash", args: "ls", status: "succeeded" }],
    ...overrides,
  };
}

async function persistAndReopen(mode, runs) {
  const root = await mkdtemp(join(tmpdir(), "pi-web-trellis-persist-"));
  const sessionDir = join(root, "sessions");
  await mkdir(sessionDir);
  const manager = SessionManager.create(root, sessionDir);
  manager.appendMessage({ role: "user", content: "run a subagent", timestamp: Date.now() });
  manager.appendMessage({
    role: "assistant",
    content: [{ type: "toolCall", id: "call-1", name: "trellis_subagent", arguments: { agent: "trellis-implement" } }],
    api: "test",
    provider: "test",
    model: "test",
    usage: usage(),
    stopReason: "toolUse",
    timestamp: Date.now(),
  });
  manager.appendMessage({
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "trellis_subagent",
    content: [{ type: "text", text: "done" }],
    details: detailsFor(mode, runs),
    timestamp: Date.now(),
  });
  const file = manager.getSessionFile();
  // Reopen from disk: this is the real persistence -> read path.
  const reopened = SessionManager.open(file, sessionDir);
  const entries = reopened.getEntries();
  const leafId = reopened.getLeafId();
  return { root, file, entries, leafId, manager: reopened };
}

test("single mode result survives persistence, normalize and history projection", async () => {
  const { root, entries, leafId } = await persistAndReopen("single", [runState("s-1")]);
  try {
    const context = buildSessionContext(entries, leafId, {
      deferThinking: true,
      deferToolResultImages: true,
      tail: 50,
    });
    const toolResult = context.messages.find((message) => message.role === "toolResult");
    assert.ok(toolResult, "tool result should survive normalize");
    const normalized = normalizeToolCalls(toolResult);
    assert.equal(normalized.details.kind, "trellis-subagent-progress");
    assert.equal(normalized.details.runs[0].finalText, "output s-1");

    const projection = projectTrellisSubagentHistory(entries, leafId, PARENT);
    assert.equal(projection.records.length, 1);
    assert.equal(projection.records[0].mode, "single");
    assert.equal(projection.records[0].finalText, "output s-1");
    assert.deepEqual(projection.branchToolCallIds, ["call-1"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parallel mode round-trips every run", async () => {
  const { root, entries, leafId } = await persistAndReopen("parallel", [
    runState("p-1"),
    runState("p-2", { status: "failed", errorMessage: "boom" }),
  ]);
  try {
    const projection = projectTrellisSubagentHistory(entries, leafId, PARENT);
    assert.equal(projection.records.length, 2);
    assert.deepEqual(projection.records.map((r) => r.status), ["succeeded", "failed"]);
    assert.equal(projection.records[1].errorExcerpt, "boom");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a chain that failed before later steps only exposes its recorded steps", async () => {
  const { root, entries, leafId } = await persistAndReopen("chain", [
    runState("c-1", { step: 1 }),
    runState("c-2", { step: 2, status: "failed", errorMessage: "stopped" }),
  ]);
  try {
    const projection = projectTrellisSubagentHistory(entries, leafId, PARENT);
    assert.deepEqual(projection.records.map((r) => r.step), [1, 2]);
    assert.equal(projection.records[1].status, "failed");
    // A third step was never produced and must not be fabricated.
    assert.equal(projection.records.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
