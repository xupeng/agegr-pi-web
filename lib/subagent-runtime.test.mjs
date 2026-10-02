import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createJiti } from "jiti";

const exec = promisify(execFile);
const jiti = createJiti(import.meta.url);
const { createSubagentController } = await jiti.import("./subagent-runtime.ts");
const { SubagentQueue } = await jiti.import("./subagent-queue.ts");
const { SUBAGENT_NOTIFICATION_PREFIX, subagentToolDetails } = await jiti.import("./subagent-extension.ts");
const { isFilePathReferencedByEntries } = await jiti.import("./session-file-references-core.ts");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function completedRun() {
  return {
    sessionId: "child-session",
    sessionPath: "/tmp/child.jsonl",
    parentSessionId: "parent-session",
    parentToolCallId: "tool-call",
    profile: "Explore",
    description: "Inspect parser",
    task: "Find the parser",
    runInBackground: true,
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:01:00.000Z",
    result: "Parser found",
  };
}

test("completion notification reopens an idle parent and uses its current session", async () => {
  const delivered = [];
  const reopened = [];
  let ready = false;
  let parent;
  const liveParent = {
    cwd: "/tmp",
    sessionFile: "/tmp/parent.jsonl",
    isAlive: () => true,
    isRunning: () => false,
    waitUntilReady: async () => { ready = true; },
    inner: {
      sendCustomMessage: async (message, options) => delivered.push({ message, options }),
    },
  };
  const controller = createSubagentController({
    getSession: () => parent,
    registerSession: () => {},
    reopenSession: async (sessionId, sessionFile) => {
      reopened.push([sessionId, sessionFile]);
      parent = liveParent;
      return liveParent;
    },
    resolveSessionPath: async () => "/tmp/parent.jsonl",
    invalidateSessionList: () => {},
  });

  await controller.extensionRuntime.notifyParent(completedRun());

  assert.deepEqual(reopened, [["parent-session", "/tmp/parent.jsonl"]]);
  assert.equal(ready, true);
  assert.equal(delivered.length, 1);
  assert.equal(
    delivered[0].message.content,
    `${SUBAGENT_NOTIFICATION_PREFIX}Subagent child-session completed.\n\nParser found`,
  );
  // Compaction reads custom messages as user turns, so the report must announce that it is not one (#875).
  assert.match(delivered[0].message.content, /^The following is a background subagent's report/);
  assert.equal(delivered[0].message.details.sessionId, "child-session");
  assert.deepEqual(delivered[0].options, { deliverAs: "followUp", triggerTurn: true });
});

test("disabled built-in subagents reject stale Agent calls before starting", async () => {
  const controller = createSubagentController({
    getSession: () => { throw new Error("must not inspect a parent"); },
    registerSession: () => {},
    reopenSession: async () => { throw new Error("unused"); },
    resolveSessionPath: async () => null,
    invalidateSessionList: () => {},
    isBuiltInSubagentsEnabled: () => false,
  });

  await assert.rejects(
    controller.extensionRuntime.start({
      parentContext: { sessionManager: { getSessionId: () => "parent" } },
      parentToolCallId: "call",
      profile: "explore",
      task: "Inspect",
      description: "Inspect",
    }),
    /built-in sub-agents are disabled/,
  );
});

test("resume reuses the persisted child session and keeps its session id", async () => {
  const calls = [];
  const entries = [
    { type: "custom", customType: "pi-web:subagent", data: {
      version: 1,
      parentSessionId: "parent",
      parentSessionPath: "/tmp/parent.jsonl",
      parentToolCallId: "old-call",
      profile: "explore",
      description: "old task",
      task: "old",
      runInBackground: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    } },
    { type: "custom", customType: "pi-web:subagent-result", data: {
      version: 1, status: "completed", completedAt: "2026-01-01T00:01:00.000Z", result: "old result",
    } },
  ];
  const childInner = {
    sessionId: "child",
    sessionFile: "/tmp/child.jsonl",
    sessionManager: { getEntries: () => entries, appendCustomEntry: (type, data) => entries.push({ type: "custom", customType: type, data }) },
    prompt: async (task) => { calls.push(task); },
    getLastAssistantText: () => "new result",
    abort: async () => {},
  };
  const child = { inner: childInner, sessionFile: childInner.sessionFile, cwd: "/tmp", isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  const parent = { inner: { sessionManager: { getSessionId: () => "parent" } }, sessionFile: "/tmp/parent.jsonl", cwd: "/tmp", isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  const controller = createSubagentController({
    getSession: (id) => id === "child" ? child : parent,
    registerSession: () => {},
    reopenSession: async () => child,
    resolveSessionPath: async () => child.sessionFile,
    invalidateSessionList: () => {},
    isBuiltInSubagentsEnabled: () => true,
  });
  const execution = await controller.extensionRuntime.resume({
    parentContext: parent.inner,
    parentToolCallId: "new-call",
    sessionId: "child",
    task: "continue this",
    description: "Continue task",
  });
  const result = await execution.completion;
  assert.equal(execution.run.sessionId, "child");
  assert.equal(result.sessionId, "child");
  assert.equal(result.status, "completed");
  assert.deepEqual(calls, ["continue this"]);
  // The resumed run's notification must be distinguishable from the first run's (#985).
  assert.equal(result.resumed, true);
  assert.equal(execution.run.resumed, true);
});

test("a run collected and resumed in the same turn keeps its held notification suppressed", async () => {
  const delivered = [];
  let parentRunning = true;
  const entries = [
    { type: "custom", customType: "pi-web:subagent", data: {
      version: 1,
      parentSessionId: "parent",
      parentSessionPath: "/tmp/parent.jsonl",
      parentToolCallId: "old-call",
      profile: "explore",
      description: "old task",
      task: "old",
      runInBackground: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    } },
    { type: "custom", customType: "pi-web:subagent-result", data: {
      version: 1, status: "completed", completedAt: "2026-01-01T00:01:00.000Z", result: "old result",
    } },
  ];
  let finishResumed;
  const childInner = {
    sessionId: "collect-and-resume-child",
    sessionFile: "/tmp/child.jsonl",
    sessionManager: { getEntries: () => entries, appendCustomEntry: (type, data) => entries.push({ type: "custom", customType: type, data }) },
    prompt: () => new Promise((resolve) => { finishResumed = resolve; }),
    getLastAssistantText: () => "new result",
    abort: async () => {},
  };
  const child = { inner: childInner, sessionFile: childInner.sessionFile, cwd: "/tmp", isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  const parent = {
    inner: {
      sessionManager: { getSessionId: () => "parent" },
      sendCustomMessage: async (message, options) => delivered.push({ message, options }),
    },
    sessionFile: "/tmp/parent.jsonl",
    cwd: "/tmp",
    isAlive: () => true,
    isRunning: () => parentRunning,
    waitUntilReady: async () => {},
  };
  const controller = createSubagentController({
    getSession: (id) => id === "collect-and-resume-child" ? child : parent,
    registerSession: () => {},
    reopenSession: async () => child,
    resolveSessionPath: async () => child.sessionFile,
    invalidateSessionList: () => {},
    isBuiltInSubagentsEnabled: () => true,
  });
  const first = await controller.extensionRuntime.get("collect-and-resume-child");

  // Run 1's notification is held while the parent turn runs; in that turn the parent
  // collects run 1 with get_subagent_result and immediately resumes the same child.
  const heldFirst = controller.extensionRuntime.notifyParent(first);
  await new Promise((resolve) => setTimeout(resolve, 250));
  controller.extensionRuntime.markResultConsumed(first);
  const execution = await controller.extensionRuntime.resume({
    parentContext: parent.inner,
    parentToolCallId: "new-call",
    sessionId: "collect-and-resume-child",
    task: "continue this",
    description: "Continue task",
  });
  parentRunning = false;
  await heldFirst;
  assert.equal(delivered.length, 0, "run 1 was already collected; delivering it again is the #889 duplicate");

  // The resumed run finishes later and is notified: the earlier mark names run 1, not this run.
  finishResumed();
  const second = await execution.completion;
  assert.notEqual(second.completedAt, first.completedAt);
  await controller.extensionRuntime.notifyParent(second);
  assert.equal(delivered.length, 1);
});

test("a resumed run that fails right away still notifies after the parent inspected the earlier failure (#987)", async () => {
  const delivered = [];
  const entries = [
    { type: "custom", customType: "pi-web:subagent", data: {
      version: 1,
      parentSessionId: "parent",
      parentSessionPath: "/tmp/parent.jsonl",
      parentToolCallId: "old-call",
      profile: "explore",
      description: "old task",
      task: "old",
      runInBackground: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    } },
    { type: "message", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "stream disconnected" } },
    { type: "custom", customType: "pi-web:subagent-result", data: {
      version: 1, status: "failed", completedAt: "2026-01-01T00:01:00.000Z", error: "stream disconnected",
    } },
  ];
  const childInner = {
    sessionId: "failed-resume-child",
    sessionFile: "/tmp/child.jsonl",
    sessionManager: { getEntries: () => entries, appendCustomEntry: (type, data) => entries.push({ type: "custom", customType: type, data }) },
    // The resumed run is rejected by the provider at once; pi records that as an errored assistant message.
    prompt: async () => {
      entries.push({ type: "message", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "400 Bad Request" } });
    },
    getLastAssistantText: () => undefined,
    abort: async () => {},
  };
  const child = { inner: childInner, sessionFile: childInner.sessionFile, cwd: "/tmp", isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  const parent = {
    inner: {
      sessionManager: { getSessionId: () => "parent" },
      sendCustomMessage: async (message, options) => delivered.push({ message, options }),
    },
    sessionFile: "/tmp/parent.jsonl",
    cwd: "/tmp",
    isAlive: () => true,
    isRunning: () => false,
    waitUntilReady: async () => {},
  };
  const controller = createSubagentController({
    getSession: (id) => id === "failed-resume-child" ? child : parent,
    registerSession: () => {},
    reopenSession: async () => child,
    resolveSessionPath: async () => child.sessionFile,
    invalidateSessionList: () => {},
    isBuiltInSubagentsEnabled: () => true,
  });

  // Run 1's failure is delivered, then the parent inspects it with get_subagent_result before retrying.
  const first = await controller.extensionRuntime.get("failed-resume-child");
  await controller.extensionRuntime.notifyParent(first);
  controller.extensionRuntime.markResultConsumed(first);

  const execution = await controller.extensionRuntime.resume({
    parentContext: parent.inner,
    parentToolCallId: "retry-call",
    sessionId: "failed-resume-child",
    task: "retry with the fix",
    description: "Retry",
  });
  const second = await execution.completion;
  assert.equal(second.status, "failed");
  await controller.extensionRuntime.notifyParent(second);

  assert.equal(delivered.length, 2, "the retry's failure must reach the parent, or it waits forever");
  assert.match(delivered[1].message.content, /Subagent failed-resume-child failed: 400 Bad Request/);
  assert.deepEqual(delivered[1].options, { deliverAs: "followUp", triggerTurn: true });
});

test("resume rejects a child owned by another parent", async () => {
  const controller = createSubagentController({
    getSession: (id) => id === "parent" ? { inner: { sessionManager: { getSessionId: () => "parent" } }, sessionFile: "/tmp/parent.jsonl", cwd: "/tmp", isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} } : undefined,
    registerSession: () => {},
    reopenSession: async () => { throw new Error("unused"); },
    resolveSessionPath: async () => null,
    invalidateSessionList: () => {},
    isBuiltInSubagentsEnabled: () => true,
  });
  await assert.rejects(controller.extensionRuntime.resume({
    parentContext: { sessionManager: { getSessionId: () => "parent" } },
    parentToolCallId: "call",
    sessionId: "missing",
    task: "continue",
    description: "Continue",
  }), /Subagent not found/);
});

test("abort waits for queued finalization before returning", async (t) => {
  const previousRuns = globalThis.__piSubagentRuns;
  const completion = deferred();
  let cleanupFinished = false;
  const queuedRun = {
    ...completedRun(),
    sessionId: "queued-child",
    status: "queued",
    completedAt: undefined,
    result: undefined,
  };
  globalThis.__piSubagentRuns = new Map([[queuedRun.sessionId, {
    run: queuedRun,
    completion: completion.promise,
    abortRequested: false,
    cancelQueued: () => {
      setTimeout(() => {
        cleanupFinished = true;
        completion.resolve({ ...queuedRun, status: "aborted" });
      }, 20);
      return true;
    },
  }]]);
  t.after(() => { globalThis.__piSubagentRuns = previousRuns; });

  const controller = createSubagentController({
    getSession: () => undefined,
    registerSession: () => {},
    reopenSession: async () => { throw new Error("unused"); },
    resolveSessionPath: async () => null,
    invalidateSessionList: () => {},
  });

  await controller.abort(queuedRun.sessionId);
  assert.equal(cleanupFinished, true);
});

test("queued abort waits for a real isolated subagent worktree to disappear", async (t) => {
  const repo = await mkdtemp(join(tmpdir(), "pi-web-runtime-isolation-"));
  const previousQueue = globalThis.__piSubagentQueue;
  const previousRuns = globalThis.__piSubagentRuns;
  const releaseBlockers = deferred();
  let childSessionPath;
  t.after(async () => {
    releaseBlockers.resolve();
    globalThis.__piSubagentQueue = previousQueue;
    globalThis.__piSubagentRuns = previousRuns;
    if (childSessionPath) await rm(childSessionPath, { force: true });
    await rm(repo, { recursive: true, force: true });
  });

  await exec("git", ["-C", repo, "init", "-q"]);
  await exec("git", ["-C", repo, "config", "user.email", "test@example.com"]);
  await exec("git", ["-C", repo, "config", "user.name", "Pi Web Test"]);
  await writeFile(join(repo, "README.md"), "parent\n");
  await mkdir(join(repo, ".pi", "agents"), { recursive: true });
  await writeFile(join(repo, ".pi", "agents", "isolated-check.md"), [
    "---",
    "description: Isolated check",
    "tools: []",
    "load_skills: false",
    "load_extensions: false",
    "enabled: true",
    "inherit_context: false",
    "run_in_background: true",
    "prompt_mode: replace",
    "---",
    "Perform the isolated check.",
    "",
  ].join("\n"));
  await exec("git", ["-C", repo, "add", "."]);
  await exec("git", ["-C", repo, "commit", "-qm", "initial"]);

  // Occupy the default ten slots for this parent so start() creates a real
  // AgentSession and git worktree but leaves its prompt queued.
  const parentId = "real-isolated-parent";
  const queue = new SubagentQueue();
  globalThis.__piSubagentQueue = queue;
  globalThis.__piSubagentRuns = new Map();
  for (let index = 0; index < 10; index += 1) {
    queue.enqueue(parentId, 10, async () => {
      await releaseBlockers.promise;
      return completedRun();
    }, () => {}, async () => {});
  }
  await new Promise((resolve) => setImmediate(resolve));

  const model = {
    id: "test-model",
    name: "Test Model",
    api: "openai-completions",
    provider: "test",
    baseUrl: "http://127.0.0.1:1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4096,
    maxTokens: 1024,
  };
  const modelRuntime = {
    refresh: async () => {},
    getModel: (provider, id) => provider === model.provider && id === model.id ? model : undefined,
    getModels: () => [model],
  };
  const parentInner = {
    model,
    modelRuntime,
    agent: { state: { thinkingLevel: "off" } },
    sessionManager: {
      getSessionId: () => parentId,
      buildSessionContext: () => ({ messages: [] }),
    },
  };
  const parent = {
    inner: parentInner,
    sessionFile: join(repo, "parent.jsonl"),
    cwd: repo,
    isAlive: () => true,
    isRunning: () => false,
    waitUntilReady: async () => {},
  };
  await writeFile(parent.sessionFile, `${JSON.stringify({ type: "session", version: 3, id: parentId, timestamp: new Date().toISOString(), cwd: repo })}\n`);
  const wrappers = new Map([[parentId, parent]]);
  const controller = createSubagentController({
    getSession: (id) => wrappers.get(id),
    registerSession: (inner) => {
      wrappers.set(inner.sessionId, {
        inner,
        sessionFile: inner.sessionFile,
        cwd: inner.cwd ?? repo,
        isAlive: () => true,
        isRunning: () => false,
        waitUntilReady: async () => {},
      });
    },
    reopenSession: async () => { throw new Error("unused"); },
    resolveSessionPath: async () => null,
    invalidateSessionList: () => {},
    isBuiltInSubagentsEnabled: () => true,
  });

  const execution = await controller.extensionRuntime.start({
    parentContext: parentInner,
    parentToolCallId: "real-isolated-call",
    profile: "isolated-check",
    task: "Check the isolated worktree",
    description: "Isolated check",
    runInBackground: true,
    isolation: "worktree",
  });
  childSessionPath = execution.run.sessionPath;
  assert.equal(execution.run.status, "queued");
  assert.ok(execution.run.worktreePath);
  await stat(execution.run.worktreePath);

  await controller.abort(execution.run.sessionId);
  const result = await execution.completion;
  assert.equal(result.status, "aborted");
  assert.equal(result.worktreeCleanupError, undefined);
  await assert.rejects(stat(execution.run.worktreePath), { code: "ENOENT" });
});

test("abort waits for a resumed running child to persist its result", async () => {
  const promptGate = deferred();
  let running = false;
  let abortCalled = false;
  const entries = [
    { type: "custom", customType: "pi-web:subagent", data: {
      version: 1,
      parentSessionId: "abort-parent",
      parentSessionPath: "/tmp/abort-parent.jsonl",
      parentToolCallId: "old-call",
      profile: "explore",
      description: "old task",
      task: "old",
      runInBackground: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    } },
    { type: "custom", customType: "pi-web:subagent-result", data: {
      version: 1, status: "completed", completedAt: "2026-01-01T00:01:00.000Z", result: "old result",
    } },
  ];
  const childInner = {
    sessionId: "abort-resumed-child",
    sessionFile: "/tmp/abort-resumed-child.jsonl",
    sessionManager: {
      getEntries: () => entries,
      appendCustomEntry: (type, data) => entries.push({ type: "custom", customType: type, data }),
    },
    prompt: async () => {
      running = true;
      await promptGate.promise;
      running = false;
    },
    getLastAssistantText: () => "partial result",
    abort: async () => { abortCalled = true; },
  };
  const child = {
    inner: childInner,
    sessionFile: childInner.sessionFile,
    cwd: "/tmp",
    isAlive: () => true,
    isRunning: () => running,
    waitUntilReady: async () => {},
  };
  const parent = {
    inner: { sessionManager: { getSessionId: () => "abort-parent" } },
    sessionFile: "/tmp/abort-parent.jsonl",
    cwd: "/tmp",
    isAlive: () => true,
    isRunning: () => false,
    waitUntilReady: async () => {},
  };
  const controller = createSubagentController({
    getSession: (id) => id === childInner.sessionId ? child : parent,
    registerSession: () => {},
    reopenSession: async () => child,
    resolveSessionPath: async () => child.sessionFile,
    invalidateSessionList: () => {},
    isBuiltInSubagentsEnabled: () => true,
  });
  const execution = await controller.extensionRuntime.resume({
    parentContext: parent.inner,
    parentToolCallId: "resume-call",
    sessionId: childInner.sessionId,
    task: "continue until aborted",
    description: "Continue",
  });

  let abortSettled = false;
  const aborting = controller.abort(childInner.sessionId).then(() => { abortSettled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(abortCalled, true);
  assert.equal(abortSettled, false, "abort must wait for persisted run settlement");

  promptGate.resolve();
  await aborting;
  const result = await execution.completion;
  assert.equal(result.status, "aborted");
  assert.equal(entries.at(-1).customType, "pi-web:subagent-result");
  assert.equal(entries.at(-1).data.status, "aborted");
});

function snapshotEvidenceEntries() {
  return [
    ["apply_patch", { result: { summaries: ["add: src/patch.ts"] }, preview: { files: [{ filePath: "src/patch.ts", added: 2, removed: 0 }] } }, "ok", false],
    ["remote.apply_patch", { result: { summaries: ["add: /outside-root/runtime-summary.md"] } }, "ok", false],
    ["apply_patch_remote", undefined, "add: /outside-root/runtime-legacy.md", false],
    ["apply_patch", { preview: { files: [{ filePath: "/outside-root/runtime-preview.md" }] } }, "add: /outside-root/runtime-preview.md", false],
    ["apply_patch", { result: { summaries: ["add: /outside-root/runtime-failed.md"] } }, "ok", true],
  ].flatMap(([name, details, text, isError], index) => [
    { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: `evidence-${index}`, name, arguments: { input: "noop" } }] } },
    { type: "message", message: { role: "toolResult", toolCallId: `evidence-${index}`, toolName: name, details, isError, content: [{ type: "text", text }] } },
  ]);
}

function assertRuntimeSnapshotSafety(result, cwd) {
  assert.deepEqual(result.writtenFiles, [
    { filePath: join(cwd, "src/a.ts"), operation: "write", origin: "tool-input" },
    { filePath: join(cwd, "src/patch.ts"), operation: "add", added: 2, removed: 0, origin: "apply-patch-details" },
  ]);
  const parent = [{ type: "message", message: { role: "toolResult", toolName: "Agent", content: [{ type: "text", text: "completed" }], details: subagentToolDetails(result) } }];
  assert.equal(isFilePathReferencedByEntries(join(cwd, "src/patch.ts"), parent), true);
  for (const suffix of ["summary", "legacy", "preview", "failed"]) {
    assert.equal(isFilePathReferencedByEntries(`/outside-root/runtime-${suffix}.md`, parent), false);
  }
}

test("new child completion snapshots use trusted-result policy without contacting a provider", async (t) => {
  const repo = await mkdtemp(join(tmpdir(), "pi-web-runtime-snapshot-"));
  let childInner;
  t.after(async () => {
    childInner?.dispose();
    await rm(repo, { recursive: true, force: true });
  });
  await mkdir(join(repo, ".pi", "agents"), { recursive: true });
  await writeFile(join(repo, ".pi", "agents", "snapshot-check.md"), [
    "---", "description: Snapshot fixture", "tools: []", "load_skills: false", "load_extensions: false",
    "enabled: true", "inherit_context: false", "run_in_background: false", "prompt_mode: replace", "---", "Fixture only.", "",
  ].join("\n"));
  const model = {
    id: "snapshot-test", name: "Fixture", api: "openai-completions", provider: "test", baseUrl: "http://127.0.0.1:1",
    reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 4096, maxTokens: 1024,
  };
  const parentInner = {
    model, modelRuntime: { refresh: async () => {}, getModel: () => model, getModels: () => [model] },
    agent: { state: { thinkingLevel: "off" } },
    sessionManager: { getSessionId: () => "new-snapshot-parent", buildSessionContext: () => ({ messages: [] }) },
  };
  const parent = { inner: parentInner, cwd: repo, sessionFile: join(repo, "parent.jsonl"), isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  const controller = createSubagentController({
    getSession: () => parent,
    registerSession: (inner) => {
      childInner = inner;
      // Use the real SDK-created child/manager but substitute only the provider turn.
      inner.prompt = async () => {
        await mkdir(join(repo, "src"));
        await writeFile(join(repo, "src/a.ts"), "written\n");
        await writeFile(join(repo, "src/patch.ts"), "patched\n");
        const evidence = [
          { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "real-write", name: "write", arguments: { path: "src/a.ts" } }] } },
          { type: "message", message: { role: "toolResult", toolCallId: "real-write", toolName: "write", content: [{ type: "text", text: "ok" }] } },
          ...snapshotEvidenceEntries(),
        ];
        for (const entry of evidence) inner.sessionManager.appendMessage(entry.message);
      };
    },
    reopenSession: async () => { throw new Error("unused"); }, resolveSessionPath: async () => null,
    invalidateSessionList: () => {}, isBuiltInSubagentsEnabled: () => true,
  });
  const execution = await controller.extensionRuntime.start({
    parentContext: parentInner, parentToolCallId: "new-snapshot", profile: "snapshot-check", task: "Fixture", description: "Fixture",
  });
  const result = await execution.completion;
  assert.equal(result.status, "completed");
  assertRuntimeSnapshotSafety(result, repo);
});

test("a reopened resumed child snapshots only trusted result paths", async () => {
  const entries = [
    { type: "custom", customType: "pi-web:subagent", data: {
      version: 1,
      parentSessionId: "snapshot-parent",
      parentSessionPath: "/tmp/snapshot-parent.jsonl",
      parentToolCallId: "old-call",
      profile: "explore",
      description: "old task",
      task: "old",
      runInBackground: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    } },
    { type: "custom", customType: "pi-web:subagent-result", data: {
      version: 1, status: "completed", completedAt: "2026-01-01T00:01:00.000Z", result: "old result",
    } },
    { type: "message", id: "m1", parentId: null, timestamp: "2026-01-01T00:00:02.000Z", message: {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc1", name: "write", arguments: { path: "src/a.ts" } }],
      model: "m",
      provider: "p",
    } },
    { type: "message", id: "m2", parentId: null, timestamp: "2026-01-01T00:00:03.000Z", message: {
      role: "toolResult",
      toolCallId: "tc1",
      content: [{ type: "text", text: "ok" }],
    } },
    ...snapshotEvidenceEntries(),
  ];
  const childInner = {
    sessionId: "snapshot-child",
    sessionFile: "/tmp/snapshot-child.jsonl",
    sessionManager: { getEntries: () => entries, appendCustomEntry: (type, data) => entries.push({ type: "custom", customType: type, data }) },
    prompt: async () => {},
    getLastAssistantText: () => "new result",
    abort: async () => {},
  };
  const child = { inner: childInner, sessionFile: childInner.sessionFile, cwd: "/repo", isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  const parent = { inner: { sessionManager: { getSessionId: () => "snapshot-parent" } }, sessionFile: "/tmp/snapshot-parent.jsonl", cwd: "/repo", isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  let childLookups = 0;
  let reopened = false;
  const controller = createSubagentController({
    // Retire the cached child after run discovery, forcing resume's reopen branch.
    getSession: (id) => id === childInner.sessionId ? (++childLookups === 1 ? child : undefined) : parent,
    registerSession: () => {},
    reopenSession: async (id, sessionFile) => {
      assert.equal(id, childInner.sessionId);
      assert.equal(sessionFile, childInner.sessionFile);
      reopened = true;
      return child;
    },
    resolveSessionPath: async () => child.sessionFile,
    invalidateSessionList: () => {},
    isBuiltInSubagentsEnabled: () => true,
  });

  const execution = await controller.extensionRuntime.resume({
    parentContext: parent.inner,
    parentToolCallId: "snapshot-call",
    sessionId: childInner.sessionId,
    task: "continue",
    description: "Continue",
  });
  const result = await execution.completion;
  assert.equal(reopened, true);
  assertRuntimeSnapshotSafety(result, "/repo");
});

test("a run whose last assistant message ended with a provider error is reported as failed, not completed", async () => {
  const entries = [
    { type: "custom", customType: "pi-web:subagent", data: {
      version: 1,
      parentSessionId: "parent",
      parentSessionPath: "/tmp/parent.jsonl",
      parentToolCallId: "old-call",
      profile: "builder",
      description: "old task",
      task: "old",
      runInBackground: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      resourceSnapshot: { version: 1, appendSystemPrompt: [], tools: [], loadSkills: false, loadExtensions: false },
    } },
    { type: "custom", customType: "pi-web:subagent-result", data: { version: 1, status: "completed", completedAt: "2026-01-01T00:01:00.000Z" } },
  ];
  const childInner = {
    sessionId: "child",
    sessionFile: "/tmp/child.jsonl",
    sessionManager: { getEntries: () => entries, appendCustomEntry: (type, data) => entries.push({ type: "custom", customType: type, data }) },
    // pi's agent loop records a provider stream error as an assistant message and resolves prompt() normally.
    prompt: async () => {
      entries.push({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "edit", arguments: {} }], stopReason: "error", errorMessage: "stream error: stream disconnected before completion" } });
    },
    getLastAssistantText: () => undefined,
    abort: async () => {},
  };
  const child = { inner: childInner, sessionFile: childInner.sessionFile, cwd: "/tmp", isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  const parent = { inner: { sessionManager: { getSessionId: () => "parent" } }, sessionFile: "/tmp/parent.jsonl", cwd: "/tmp", isAlive: () => true, isRunning: () => false, waitUntilReady: async () => {} };
  const controller = createSubagentController({
    getSession: (id) => id === "child" ? child : parent,
    registerSession: () => {},
    reopenSession: async () => child,
    resolveSessionPath: async () => child.sessionFile,
    invalidateSessionList: () => {},
    isBuiltInSubagentsEnabled: () => true,
  });
  const execution = await controller.extensionRuntime.resume({
    parentContext: parent.inner,
    parentToolCallId: "new-call",
    sessionId: "child",
    task: "continue this",
    description: "Continue task",
  });
  const result = await execution.completion;
  assert.equal(result.status, "failed");
  assert.match(result.error, /stream disconnected/);
  const persisted = entries.at(-1);
  assert.equal(persisted.customType, "pi-web:subagent-result");
  assert.equal(persisted.data.status, "failed");
  assert.match(persisted.data.error, /stream disconnected/);
});

function orphanedEntries(status) {
  return [
    { type: "custom", customType: "pi-web:subagent", data: {
      version: 1,
      parentSessionId: "parent",
      parentSessionPath: "/tmp/parent.jsonl",
      parentToolCallId: "call",
      profile: "explore",
      description: "Find parser",
      task: "Find the parser",
      runInBackground: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    } },
    { type: "custom", customType: "pi-web:subagent-status", data: { version: 1, status } },
  ];
}

function orphanController(child) {
  return createSubagentController({
    getSession: () => child,
    registerSession: () => {},
    reopenSession: async () => child,
    resolveSessionPath: async () => undefined,
    invalidateSessionList: () => {},
  });
}

test("a live child left with a running status but no active run reads as interrupted", async () => {
  for (const status of ["running", "queued"]) {
    const entries = orphanedEntries(status);
    const child = {
      inner: { sessionManager: { getEntries: () => entries } },
      sessionFile: "/tmp/child.jsonl",
      isAlive: () => true,
      isRunning: () => false,
    };

    const run = await orphanController(child).extensionRuntime.get("orphan-child");

    assert.equal(run.status, "interrupted", `persisted ${status} without a result`);
  }
});

test("a child whose wrapper is still running keeps reporting running", async () => {
  const entries = orphanedEntries("running");
  const child = {
    inner: { sessionManager: { getEntries: () => entries } },
    sessionFile: "/tmp/child.jsonl",
    isAlive: () => true,
    isRunning: () => true,
  };

  const run = await orphanController(child).extensionRuntime.get("orphan-child");

  assert.equal(run.status, "running");
});

test("a child session read back from disk after a restart mid-run reads as interrupted", async () => {
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "pi-web-orphaned-subagent-"));
  try {
    const sessionPath = join(dir, "child.jsonl");
    const header = { type: "session", version: 3, id: "orphan-child", timestamp: "2026-01-01T00:00:00.000Z", cwd: dir, parentSession: "/tmp/parent.jsonl" };
    const lines = [header, ...orphanedEntries("running").map((entry, index) => ({
      ...entry,
      id: `e${index}`,
      parentId: index === 0 ? null : `e${index - 1}`,
      timestamp: "2026-01-01T00:00:00.000Z",
    }))];
    await writeFile(sessionPath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);
    const controller = createSubagentController({
      getSession: () => undefined,
      registerSession: () => {},
      reopenSession: async () => { throw new Error("unused"); },
      resolveSessionPath: async () => sessionPath,
      invalidateSessionList: () => {},
    });

    const run = await controller.extensionRuntime.get("orphan-child");

    assert.equal(run.status, "interrupted");
    assert.equal(run.completedAt, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function idleParentDependencies(delivered, overrides = {}) {
  const parent = {
    cwd: "/tmp",
    sessionFile: "/tmp/parent.jsonl",
    isAlive: () => true,
    isRunning: () => false,
    waitUntilReady: async () => {},
    inner: {
      sendCustomMessage: async (message, options) => delivered.push({ message, options }),
    },
    ...overrides,
  };
  return {
    getSession: () => parent,
    registerSession: () => {},
    reopenSession: async () => parent,
    resolveSessionPath: async () => "/tmp/parent.jsonl",
    invalidateSessionList: () => {},
  };
}

test("a result already collected with get_subagent_result is never delivered again", async () => {
  const delivered = [];
  const controller = createSubagentController(idleParentDependencies(delivered));
  const run = { ...completedRun(), sessionId: "collected-child" };

  controller.extensionRuntime.markResultConsumed(run);
  await controller.extensionRuntime.notifyParent(run);

  assert.equal(delivered.length, 0);

  // The mark is consumed, so a later run reusing that session ID still notifies.
  await controller.extensionRuntime.notifyParent({ ...run, completedAt: "2026-01-01T00:05:00.000Z" });
  assert.equal(delivered.length, 1);
});

test("a mark left by an earlier run never swallows the next run's notification (#987)", async () => {
  const delivered = [];
  const controller = createSubagentController(idleParentDependencies(delivered));
  const first = { ...completedRun(), sessionId: "rerun-child" };

  // Run 1 notifies first; the parent then polls get_subagent_result and marks a result
  // whose notification has already been delivered, so no notifyParent ever takes that mark.
  await controller.extensionRuntime.notifyParent(first);
  controller.extensionRuntime.markResultConsumed(first);
  assert.equal(delivered.length, 1);

  const second = { ...first, parentToolCallId: "second-call", completedAt: "2026-01-01T00:05:00.000Z" };
  await controller.extensionRuntime.notifyParent(second);

  assert.equal(delivered.length, 2);
  assert.equal(delivered[1].options.triggerTurn, true);
});

test("a notification waits for a busy parent and is dropped when that turn collects the result", async () => {
  const delivered = [];
  let running = true;
  const controller = createSubagentController(idleParentDependencies(delivered, { isRunning: () => running }));
  const run = { ...completedRun(), sessionId: "racing-child" };

  const notified = controller.extensionRuntime.notifyParent(run);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(delivered.length, 0, "must not deliver while the parent turn is still running");

  // The parent's in-flight get_subagent_result call returns the same result, then the turn ends.
  controller.extensionRuntime.markResultConsumed(run);
  running = false;
  await notified;

  assert.equal(delivered.length, 0);
});

test("a notification held for a busy parent is delivered once that parent goes idle", async () => {
  const delivered = [];
  let running = true;
  const controller = createSubagentController(idleParentDependencies(delivered, { isRunning: () => running }));
  const run = { ...completedRun(), sessionId: "waiting-child" };

  const notified = controller.extensionRuntime.notifyParent(run);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(delivered.length, 0);

  running = false;
  await notified;

  assert.equal(delivered.length, 1);
  assert.equal(
    delivered[0].message.content,
    `${SUBAGENT_NOTIFICATION_PREFIX}Subagent waiting-child completed.\n\nParser found`,
  );
  assert.deepEqual(delivered[0].options, { deliverAs: "followUp", triggerTurn: true });
});
