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
  assert.equal(delivered[0].message.content, "Parser found");
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
