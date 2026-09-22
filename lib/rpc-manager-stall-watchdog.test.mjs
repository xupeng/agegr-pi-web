import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const {
  DEFAULT_STALL_TIMEOUT_MS,
  DEFAULT_STALL_TOOL_TIMEOUTS,
  StallWatchdog,
  resolveStallWatchdogSettings,
} = await jiti.import("./stall-watchdog.ts");

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalStallEnv = process.env.PI_WEB_STALL_TIMEOUT_MS;
const testDir = mkdtempSync(join(tmpdir(), "pi-web-stall-watchdog-"));

after(() => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  if (originalStallEnv === undefined) delete process.env.PI_WEB_STALL_TIMEOUT_MS;
  else process.env.PI_WEB_STALL_TIMEOUT_MS = originalStallEnv;
  rmSync(testDir, { recursive: true, force: true });
});

/** Import rpc-manager under a specific env so module-level thresholds are fresh. */
async function importWrapper(stallEnv, settings) {
  process.env.PI_CODING_AGENT_DIR = testDir;
  if (stallEnv === undefined) delete process.env.PI_WEB_STALL_TIMEOUT_MS;
  else process.env.PI_WEB_STALL_TIMEOUT_MS = stallEnv;
  writeFileSync(
    join(testDir, "pi-web-settings.json"),
    JSON.stringify(settings ?? { version: 1 }),
    "utf8",
  );
  const freshJiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
  const { AgentSessionWrapper } = await freshJiti.import("./rpc-manager.ts");
  return AgentSessionWrapper;
}

function makeControllableInner() {
  let listener = () => {};
  return {
    sessionId: "session-1",
    sessionFile: "",
    isBashRunning: false,
    // A running turn keeps the independent idle timer from shutting down the
    // wrapper while the mocked clock advances.
    isStreaming: true,
    isCompacting: false,
    extensionRunner: {},
    agent: { state: {} },
    sessionManager: { getCwd: () => testDir },
    abortCalls: 0,
    async abort() {
      this.abortCalls += 1;
    },
    subscribe(callback) {
      listener = callback;
      return () => {
        listener = () => {};
      };
    },
    emit(event) {
      listener(event);
    },
    dispose() {},
  };
}

function countStallEvents(events) {
  return events.filter((event) => event.type === "stall_aborted").length;
}

// ============================================================================
// AC3: threshold resolution
// ============================================================================

test("defaults to a 15-minute main timeout and the default tool budgets", () => {
  const settings = resolveStallWatchdogSettings({ envValue: undefined, stored: {} });
  assert.equal(settings.stallTimeoutMs, DEFAULT_STALL_TIMEOUT_MS);
  assert.equal(settings.stallTimeoutMs, 15 * 60 * 1000);
  assert.equal(settings.timeoutSource, "default");
  assert.deepEqual(settings.stallToolTimeouts, { bash: DEFAULT_STALL_TOOL_TIMEOUTS.bash });
  assert.equal(settings.stallToolTimeouts.bash, 30 * 60 * 1000);
});

test("the environment variable wins over the persisted value", () => {
  const settings = resolveStallWatchdogSettings({
    envValue: "120000",
    stored: { stallTimeoutMs: 300000 },
  });
  assert.equal(settings.stallTimeoutMs, 120_000);
  assert.equal(settings.timeoutSource, "env");
});

test("the persisted value applies when the environment variable is unset or blank", () => {
  const settings = resolveStallWatchdogSettings({
    envValue: undefined,
    stored: { stallTimeoutMs: 300000 },
  });
  assert.equal(settings.stallTimeoutMs, 300_000);
  assert.equal(settings.timeoutSource, "config");

  const blank = resolveStallWatchdogSettings({
    envValue: "   ",
    stored: { stallTimeoutMs: 300000 },
  });
  assert.equal(blank.stallTimeoutMs, 300_000);
  assert.equal(blank.timeoutSource, "config");
});

test("zero disables the watchdog through either source", () => {
  const fromEnv = resolveStallWatchdogSettings({ envValue: "0", stored: {} });
  assert.equal(fromEnv.stallTimeoutMs, 0);
  assert.equal(fromEnv.timeoutSource, "env");

  const fromConfig = resolveStallWatchdogSettings({ envValue: undefined, stored: { stallTimeoutMs: 0 } });
  assert.equal(fromConfig.stallTimeoutMs, 0);
  assert.equal(fromConfig.timeoutSource, "config");
});

test("invalid or out-of-range values fall back to the default and warn", () => {
  const warnings = [];
  const warn = (message) => warnings.push(message);

  assert.equal(
    resolveStallWatchdogSettings({ envValue: "abc", stored: { stallTimeoutMs: 300000 }, warn }).stallTimeoutMs,
    DEFAULT_STALL_TIMEOUT_MS,
  );
  assert.equal(
    resolveStallWatchdogSettings({ envValue: "-5", stored: {}, warn }).stallTimeoutMs,
    DEFAULT_STALL_TIMEOUT_MS,
  );
  assert.equal(
    resolveStallWatchdogSettings({ envValue: "2147483648", stored: {}, warn }).stallTimeoutMs,
    DEFAULT_STALL_TIMEOUT_MS,
  );
  // Invalid config values fall back to the default too.
  assert.equal(
    resolveStallWatchdogSettings({ envValue: undefined, stored: { stallTimeoutMs: "soon" }, warn }).stallTimeoutMs,
    DEFAULT_STALL_TIMEOUT_MS,
  );
  assert.equal(
    resolveStallWatchdogSettings({ envValue: undefined, stored: { stallTimeoutMs: Infinity }, warn }).stallTimeoutMs,
    DEFAULT_STALL_TIMEOUT_MS,
  );
  assert.ok(warnings.length >= 5, `expected warnings, got ${warnings.length}`);
  assert.ok(warnings.every((message) => message.startsWith("[pi-web]")));
});

test("tool budgets merge over the defaults and can be removed with zero", () => {
  const merged = resolveStallWatchdogSettings({
    envValue: undefined,
    stored: { stallToolTimeouts: { bash: 600000, node: 900000 } },
  });
  assert.equal(merged.stallToolTimeouts.bash, 600_000);
  assert.equal(merged.stallToolTimeouts.node, 900_000);

  const removed = resolveStallWatchdogSettings({
    envValue: undefined,
    stored: { stallToolTimeouts: { bash: 0 } },
  });
  assert.equal(removed.stallToolTimeouts.bash, undefined);
});

test("invalid tool budgets are dropped with a warning", () => {
  const warnings = [];
  const settings = resolveStallWatchdogSettings({
    envValue: undefined,
    stored: { stallToolTimeouts: { bash: "soon", node: -1 } },
    warn: (message) => warnings.push(message),
  });
  assert.equal(settings.stallToolTimeouts.bash, DEFAULT_STALL_TOOL_TIMEOUTS.bash);
  assert.equal(settings.stallToolTimeouts.node, undefined);
  assert.equal(warnings.length, 2);
});

test("a malformed settings file falls back to defaults without throwing", () => {
  const brokenDir = mkdtempSync(join(tmpdir(), "pi-web-stall-broken-"));
  const brokenPath = join(brokenDir, "pi-web-settings.json");
  writeFileSync(brokenPath, "{ not json", "utf8");
  const warnings = [];
  try {
    const settings = resolveStallWatchdogSettings({
      envValue: undefined,
      settingsPath: brokenPath,
      warn: (message) => warnings.push(message),
    });
    assert.equal(settings.stallTimeoutMs, DEFAULT_STALL_TIMEOUT_MS);
    assert.equal(settings.timeoutSource, "default");
    assert.equal(warnings.length, 1);
  } finally {
    rmSync(brokenDir, { recursive: true, force: true });
  }
});

test("the config file is read from disk when no stored object is injected", () => {
  const configDir = mkdtempSync(join(tmpdir(), "pi-web-stall-config-"));
  const configPath = join(configDir, "pi-web-settings.json");
  writeFileSync(configPath, JSON.stringify({ version: 1, stallTimeoutMs: 450000 }), "utf8");
  try {
    const settings = resolveStallWatchdogSettings({ envValue: undefined, settingsPath: configPath });
    assert.equal(settings.stallTimeoutMs, 450_000);
    assert.equal(settings.timeoutSource, "config");
  } finally {
    rmSync(configDir, { recursive: true, force: true });
  }
});

// ============================================================================
// AC1: an active turn that goes silent is aborted and reported
// ============================================================================

test("AC1: aborts a stalled turn and reports the in-flight tool and elapsed time", async (t) => {
  const AgentSessionWrapper = await importWrapper("60000");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const inner = makeControllableInner();
  const wrapper = new AgentSessionWrapper(inner);
  t.after(() => wrapper.destroy());
  const events = [];
  wrapper.onEvent((event) => events.push(event));

  wrapper.start();
  inner.emit({ type: "agent_start" });
  inner.emit({ type: "tool_execution_start", toolCallId: "t1", toolName: "read" });

  t.mock.timers.tick(59_999);
  await nextTurn();
  assert.equal(inner.abortCalls, 0, "must not abort before the threshold");
  assert.equal(countStallEvents(events), 0);

  t.mock.timers.tick(1);
  await nextTurn();
  await nextTurn();

  assert.equal(inner.abortCalls, 1, "must take the shared abort path");
  const stallEvents = events.filter((event) => event.type === "stall_aborted");
  assert.equal(stallEvents.length, 1);
  const stall = stallEvents[0];
  assert.equal(stall.toolName, "read");
  assert.equal(stall.timeoutMs, 60_000);
  assert.equal(stall.timeoutSource, "env");
  assert.equal(stall.toolOverride, false);
  assert.equal(stall.silentMs, 60_000);
  assert.equal(stall.elapsedMs, 60_000);
  assert.equal(stall.toolElapsedMs, 60_000);
});

test("AC1: reports a stall with no active tool as a null tool name", async (t) => {
  const AgentSessionWrapper = await importWrapper("60000");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const inner = makeControllableInner();
  const wrapper = new AgentSessionWrapper(inner);
  t.after(() => wrapper.destroy());
  const events = [];
  wrapper.onEvent((event) => events.push(event));

  wrapper.start();
  inner.emit({ type: "agent_start" });

  t.mock.timers.tick(60_000);
  await nextTurn();
  await nextTurn();

  assert.equal(inner.abortCalls, 1);
  const stall = events.find((event) => event.type === "stall_aborted");
  assert.ok(stall);
  assert.equal(stall.toolName, null);
  assert.equal(stall.toolElapsedMs, null);
  assert.equal(stall.silentMs, 60_000);
});

test("AC1/R3: a tool with a longer configured budget survives the main threshold", async (t) => {
  const AgentSessionWrapper = await importWrapper("60000", {
    version: 1,
    stallToolTimeouts: { bash: 120000 },
  });
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const inner = makeControllableInner();
  const wrapper = new AgentSessionWrapper(inner);
  t.after(() => wrapper.destroy());
  const events = [];
  wrapper.onEvent((event) => events.push(event));

  wrapper.start();
  inner.emit({ type: "agent_start" });
  inner.emit({ type: "tool_execution_start", toolCallId: "bash-1", toolName: "bash" });

  t.mock.timers.tick(60_000);
  await nextTurn();
  assert.equal(inner.abortCalls, 0, "bash must be granted its longer budget");

  t.mock.timers.tick(60_000);
  await nextTurn();
  await nextTurn();
  assert.equal(inner.abortCalls, 1);
  const stall = events.find((event) => event.type === "stall_aborted");
  assert.ok(stall);
  assert.equal(stall.toolName, "bash");
  assert.equal(stall.timeoutMs, 120_000);
  assert.equal(stall.toolOverride, true);
});

// ============================================================================
// AC2: any event resets the clock
// ============================================================================

test("AC2: never fires while events keep arriving", async (t) => {
  const AgentSessionWrapper = await importWrapper("60000");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const inner = makeControllableInner();
  const wrapper = new AgentSessionWrapper(inner);
  t.after(() => wrapper.destroy());
  const events = [];
  wrapper.onEvent((event) => events.push(event));

  wrapper.start();
  inner.emit({ type: "agent_start" });
  inner.emit({ type: "tool_execution_start", toolCallId: "t1", toolName: "read" });

  for (let i = 0; i < 10; i += 1) {
    t.mock.timers.tick(30_000);
    inner.emit({ type: "tool_execution_update", toolCallId: "t1", toolName: "read" });
    await nextTurn();
  }

  assert.equal(inner.abortCalls, 0);
  assert.equal(countStallEvents(events), 0);
});

test("AC2: a model delta also resets the clock", async (t) => {
  const AgentSessionWrapper = await importWrapper("60000");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const inner = makeControllableInner();
  const wrapper = new AgentSessionWrapper(inner);
  t.after(() => wrapper.destroy());
  const events = [];
  wrapper.onEvent((event) => events.push(event));

  wrapper.start();
  inner.emit({ type: "agent_start" });

  for (let i = 0; i < 5; i += 1) {
    t.mock.timers.tick(59_000);
    inner.emit({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "x" } });
    await nextTurn();
  }

  assert.equal(inner.abortCalls, 0);
  assert.equal(countStallEvents(events), 0);
});

// ============================================================================
// AC4: lifecycle
// ============================================================================

test("AC4: a settled turn stops the clock and never fires", async (t) => {
  const AgentSessionWrapper = await importWrapper("60000");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const inner = makeControllableInner();
  const wrapper = new AgentSessionWrapper(inner);
  t.after(() => wrapper.destroy());
  const events = [];
  wrapper.onEvent((event) => events.push(event));

  wrapper.start();
  inner.emit({ type: "agent_start" });
  inner.emit({ type: "tool_execution_start", toolCallId: "t1", toolName: "read" });
  inner.emit({ type: "agent_settled" });

  t.mock.timers.tick(600_000);
  await nextTurn();
  assert.equal(inner.abortCalls, 0);
  assert.equal(countStallEvents(events), 0);
});

test("AC4: a user abort disarms the watchdog and it does not fire a second time", async (t) => {
  const AgentSessionWrapper = await importWrapper("60000");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const inner = makeControllableInner();
  const wrapper = new AgentSessionWrapper(inner);
  t.after(() => wrapper.destroy());
  const events = [];
  wrapper.onEvent((event) => events.push(event));

  wrapper.start();
  inner.emit({ type: "agent_start" });
  inner.emit({ type: "tool_execution_start", toolCallId: "t1", toolName: "read" });

  await wrapper.send({ type: "abort" });
  assert.equal(inner.abortCalls, 1, "the Stop command itself aborts once");

  t.mock.timers.tick(600_000);
  await nextTurn();
  assert.equal(inner.abortCalls, 1, "the watchdog must not abort again after Stop");
  assert.equal(countStallEvents(events), 0);
});

test("AC4: destroy releases the timer and never fires", async (t) => {
  const AgentSessionWrapper = await importWrapper("60000");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const inner = makeControllableInner();
  const wrapper = new AgentSessionWrapper(inner);
  const events = [];
  wrapper.onEvent((event) => events.push(event));

  wrapper.start();
  inner.emit({ type: "agent_start" });
  inner.emit({ type: "tool_execution_start", toolCallId: "t1", toolName: "read" });

  wrapper.destroy();
  t.mock.timers.tick(600_000);
  await nextTurn();

  assert.equal(inner.abortCalls, 0);
  assert.equal(countStallEvents(events), 0);
});

test("AC4: a zero threshold disables the watchdog entirely", async (t) => {
  const AgentSessionWrapper = await importWrapper("0");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const inner = makeControllableInner();
  const wrapper = new AgentSessionWrapper(inner);
  t.after(() => wrapper.destroy());
  const events = [];
  wrapper.onEvent((event) => events.push(event));

  wrapper.start();
  inner.emit({ type: "agent_start" });
  // bash has a 30-minute default budget; disabling the main threshold must
  // suppress that override too, not only tools that inherit the main value.
  inner.emit({ type: "tool_execution_start", toolCallId: "t1", toolName: "bash" });

  t.mock.timers.tick(3_600_000);
  await nextTurn();
  assert.equal(inner.abortCalls, 0);
  assert.equal(countStallEvents(events), 0);
});

function makeWatchdog(onStall, extra) {
  return new StallWatchdog({
    settings: {
      stallTimeoutMs: 60_000,
      stallToolTimeouts: { bash: 120_000 },
      timeoutSource: "default",
      ...extra?.settings,
    },
    onStall,
    ...extra,
  });
}

test("AC4: disarm and dispose clear the pending timer so a later tick cannot fire", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const stalls = [];
  const watchdog = makeWatchdog((stall) => stalls.push(stall));

  watchdog.arm();
  assert.equal(watchdog.isArmed, true);
  assert.equal(watchdog.hasPendingTimer, true);

  watchdog.disarm();
  assert.equal(watchdog.isArmed, false);
  assert.equal(watchdog.hasPendingTimer, false, "disarm must clearTimeout, not just drop the armed flag");
  t.mock.timers.tick(600_000);
  assert.equal(stalls.length, 0);

  watchdog.arm();
  assert.equal(watchdog.hasPendingTimer, true);
  watchdog.dispose();
  assert.equal(watchdog.isArmed, false);
  assert.equal(watchdog.hasPendingTimer, false, "dispose must clearTimeout, not just drop the armed flag");
  t.mock.timers.tick(600_000);
  assert.equal(stalls.length, 0);
});

test("AC1: a stall callback cannot reenter and fire twice", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const stalls = [];
  const watchdog = makeWatchdog(() => {
    stalls.push("stall");
    // If fire() left the watchdog armed, this observe would reschedule a
    // second stall for the next silence window.
    watchdog.observe({ type: "message_update" });
  }, { settings: { stallTimeoutMs: 1_000, stallToolTimeouts: {}, timeoutSource: "default" } });

  watchdog.arm();
  t.mock.timers.tick(1_000);
  await nextTurn();
  t.mock.timers.tick(1_000);
  await nextTurn();
  assert.equal(stalls.length, 1);
  assert.equal(watchdog.isArmed, false);
  assert.equal(watchdog.hasPendingTimer, false);
});

test("AC4: calling start twice disposes the previous watchdog before arming a new one", async (t) => {
  const AgentSessionWrapper = await importWrapper("60000");
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });

  const inner = makeControllableInner();
  const wrapper = new AgentSessionWrapper(inner);
  t.after(() => wrapper.destroy());
  const events = [];
  wrapper.onEvent((event) => events.push(event));

  wrapper.start();
  inner.emit({ type: "agent_start" });
  inner.emit({ type: "tool_execution_start", toolCallId: "t1", toolName: "read" });
  wrapper.start();

  t.mock.timers.tick(600_000);
  await nextTurn();
  assert.equal(inner.abortCalls, 0, "the first start's timer must not survive a second start");
  assert.equal(countStallEvents(events), 0);
});
