import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { AgentEventConnection } = await jiti.import("./agent-event-connection.ts");

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 2;

class FakeEventSource {
  readyState = CONNECTING;
  onmessage = null;
  onerror = null;
  closeCount = 0;

  open() { this.readyState = OPEN; }
  message(event) { this.onmessage?.({ data: JSON.stringify(event) }); }
  error() {
    this.readyState = CLOSED;
    this.onerror?.(new Event("error"));
  }
  close() {
    this.readyState = CLOSED;
    this.closeCount += 1;
  }
}

function createHarness({ readinessTimeoutMs = 100, reconnectDelayMs = 5 } = {}) {
  const sources = [];
  const events = [];
  const unexpectedErrors = [];
  let activeSession = "session-a";
  let demand = false;
  const connection = new AgentEventConnection({
    createSource(sessionId) {
      const source = new FakeEventSource();
      source.sessionId = sessionId;
      sources.push(source);
      return source;
    },
    onEvent(event) { events.push(event); },
    shouldMaintain: (sessionId) => demand && sessionId === activeSession,
    readinessTimeoutMs,
    reconnectDelayMs,
    onUnexpectedError(error) { unexpectedErrors.push(error); },
  });
  return {
    connection,
    sources,
    events,
    unexpectedErrors,
    setActiveSession(sessionId) { activeSession = sessionId; },
    setDemand(value) { demand = value; },
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("shares one source and waits past the former transport deadline", async () => {
  const { connection, sources, events } = createHarness();
  const first = connection.ensureConnected("session-a");
  const second = connection.ensureConnected("session-a");

  assert.equal(sources.length, 1);
  sources[0].open();
  await wait(20);
  sources[0].message({ type: "connected" });
  await Promise.all([first, second]);

  sources[0].message({ type: "agent_start" });
  assert.deepEqual(events.map((event) => event.type), ["connected", "agent_start"]);
});

test("times out all waiters and closes the stalled source", async () => {
  const { connection, sources } = createHarness({ readinessTimeoutMs: 10 });
  const first = connection.ensureConnected("session-a");
  const second = connection.ensureConnected("session-a");

  await assert.rejects(first, (error) => error.status === "ready_timeout");
  await assert.rejects(second, (error) => error.status === "ready_timeout");
  assert.equal(sources[0].closeCount, 1);
});

test("manual close rejects waiters and isolates late events", async () => {
  const { connection, sources, events } = createHarness();
  const abandoned = connection.ensureConnected("session-a");
  const oldSource = sources[0];
  connection.close();
  await assert.rejects(abandoned, (error) => error.status === "closed");

  const replacement = connection.ensureConnected("session-a");
  oldSource.open();
  oldSource.message({ type: "connected" });
  await nextTurn();
  assert.deepEqual(events, []);

  sources[1].open();
  sources[1].message({ type: "connected" });
  await replacement;
});

test("surfaces startup errors without retrying or dispatching them", async () => {
  const { connection, sources, events } = createHarness();
  const ready = connection.ensureConnected("session-a");
  sources[0].open();
  sources[0].message({ type: "startup_error", errorMessage: "broken config" });

  await assert.rejects(ready, (error) => (
    error.status === "startup_error" && error.message === "broken config"
  ));
  await wait(10);
  assert.equal(sources.length, 1);
  assert.deepEqual(events, []);
});

test("replaces a previously connected CONNECTING source only once", async () => {
  const { connection, sources } = createHarness();
  const initial = connection.ensureConnected("session-a");
  sources[0].open();
  sources[0].message({ type: "connected" });
  await initial;

  sources[0].readyState = CONNECTING;
  const first = connection.ensureConnected("session-a");
  const second = connection.ensureConnected("session-a");
  await nextTurn();
  assert.equal(sources.length, 2);

  sources[1].open();
  sources[1].message({ type: "connected" });
  await Promise.all([first, second]);
});

test("passive maintenance retries a transient failure once", async () => {
  const { connection, sources, setDemand } = createHarness();
  setDemand(true);
  connection.maintain("session-a");
  sources[0].error();
  await wait(10);
  assert.equal(sources.length, 2);

  sources[1].open();
  sources[1].message({ type: "connected" });
  await wait(10);
  assert.equal(sources.length, 2);
});

test("an explicit startup error cancels a pending passive retry", async () => {
  const { connection, sources, setDemand } = createHarness();
  setDemand(true);
  connection.maintain("session-a");
  sources[0].error();

  const explicit = connection.ensureConnected("session-a");
  sources[1].open();
  sources[1].message({ type: "startup_error", errorMessage: "terminal" });
  await assert.rejects(explicit, (error) => error.status === "startup_error");
  await wait(10);
  assert.equal(sources.length, 2);
});

test("dropped demand, session switches, and close cannot revive an old retry", async () => {
  const first = createHarness();
  first.setDemand(true);
  first.connection.maintain("session-a");
  first.sources[0].error();
  first.setDemand(false);
  await wait(10);
  assert.equal(first.sources.length, 1);

  const second = createHarness();
  second.setDemand(true);
  second.connection.maintain("session-a");
  second.sources[0].error();
  second.setActiveSession("session-b");
  const ready = second.connection.ensureConnected("session-b");
  second.sources[1].open();
  second.sources[1].message({ type: "connected" });
  await ready;
  await wait(10);
  assert.equal(second.sources.length, 2);

  const closed = createHarness();
  closed.setDemand(true);
  closed.connection.maintain("session-a");
  closed.sources[0].error();
  closed.connection.close();
  await wait(10);
  assert.equal(closed.sources.length, 1);
});

const selectionDTO = {
  code: "model_selection_failed", reason: "model-unavailable", message: "RAW_AUTH_SECRET",
  provider: "gateway", modelId: "retired-gpt:free", auth: "RAW_AUTH_SECRET",
};

test("startup negative ack projects safe selection data while retaining the connection status", async () => {
  const { connection, sources, events, setDemand } = createHarness();
  setDemand(true);
  const ready = connection.ensureConnected("session-a");
  sources[0].open();
  sources[0].message({
    type: "startup_error", code: "model_selection_failed", prePromptRejected: true,
    modelSelection: selectionDTO, errorMessage: "RAW_LOADER_SECRET",
  });
  await assert.rejects(ready, (error) => {
    assert.equal(error.status, "startup_error");
    assert.deepEqual(error.prePromptRejection.modelSelection, {
      code: "model_selection_failed", reason: "model-unavailable", message: "Model selection failed",
      provider: "gateway", modelId: "retired-gpt:free",
    });
    assert.equal(error.prePromptRejection.code, "model_selection_failed");
    assert.equal(error.prePromptRejection.accepted, undefined, "not a prompt HTTP acknowledgement");
    assert.doesNotMatch(error.message + JSON.stringify(error), /RAW_|"auth":/);
    return true;
  });
  await wait(10);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].closeCount, 1);
  assert.deepEqual(events, []);
  connection.close();
});

test("startup status, DTO or raw message alone cannot mint a pre-prompt negative ack", async () => {
  for (const extra of [
    { code: "model_selection_failed", modelSelection: selectionDTO },
    { code: "model_selection_failed", prePromptRejected: false, modelSelection: selectionDTO },
    { code: "model_selection_failed", prePromptRejected: "true", modelSelection: selectionDTO },
    { prePromptRejected: true, modelSelection: selectionDTO },
    { prePromptRejected: true, errorMessage: "No model request was sent" },
  ]) {
    const { connection, sources, setDemand } = createHarness();
    setDemand(true);
    const ready = connection.ensureConnected("session-a");
    sources[0].open();
    sources[0].message({ type: "startup_error", errorMessage: "legacy startup failure", ...extra });
    await assert.rejects(ready, (error) => (
      error.status === "startup_error" && error.prePromptRejection === undefined
    ));
    await wait(10);
    assert.equal(sources.length, 1, "terminal startup still stops retrying");
    connection.close();
  }
});

test("a startup event after connected cannot carry a negative ack for accepted input", async () => {
  const { connection, sources, events, setDemand } = createHarness();
  setDemand(true);
  const ready = connection.ensureConnected("session-a");
  sources[0].open();
  sources[0].message({ type: "connected" });
  // Fail after the handshake but before its awaiting caller resumes.
  sources[0].message({
    type: "startup_error", code: "model_selection_failed",
    prePromptRejected: true, modelSelection: selectionDTO,
  });
  await assert.rejects(ready, (error) => (
    error.status === "closed" && error.prePromptRejection === undefined
  ));
  assert.deepEqual(events.map((event) => event.type), ["connected"]);
  await wait(10);
  assert.equal(sources.length, 1);
  connection.close();
});

test("unsafe DTO with a strict startup ack degrades safely without retaining diagnostics", async () => {
  for (const modelSelection of [
    { code: "model_selection_failed", reason: "unknown", message: "RAW_AUTH_SECRET" },
    { ...selectionDTO, modelId: "https://RAW_AUTH_SECRET@example.test" },
  ]) {
    const { connection, sources } = createHarness();
    const ready = connection.ensureConnected("session-a");
    sources[0].open();
    sources[0].message({
      type: "startup_error", code: "model_selection_failed", prePromptRejected: true,
      modelSelection, errorMessage: "RAW_LOADER_SECRET",
    });
    await assert.rejects(ready, (error) => {
      assert.equal(error.status, "startup_error");
      assert.equal(error.prePromptRejection.modelSelection, undefined);
      assert.equal(error.prePromptRejection.modelSelectionFailed, true);
      assert.doesNotMatch(error.message + JSON.stringify(error), /RAW_|https/);
      return true;
    });
    connection.close();
  }
});
