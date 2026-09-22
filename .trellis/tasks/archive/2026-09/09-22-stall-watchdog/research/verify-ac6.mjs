#!/usr/bin/env node
/**
 * AC6 regression driver for task 09-22-stall-watchdog.
 *
 * AC5 proved the watchdog fires on real silence. This run proves the opposite
 * direction on a real dispatch: with the *default* threshold in effect (dev server
 * started WITHOUT PI_WEB_STALL_TIMEOUT_MS, i.e. 15 minutes), a subagent that keeps
 * producing progress must finish normally and must never be aborted.
 *
 * The child agent runs five sequential `sleep 25` bash calls, so the parent sees a
 * tool event every ~25s while the whole dispatch runs for minutes — exactly the
 * "healthy long run" shape the default must not kill.
 *
 * Deliberately self-contained rather than importing verify-ac5.mjs (that file runs
 * its own main() on import). Both are task-local evidence scripts, not product code.
 *
 * Usage:
 *   npm run dev                                      # NO PI_WEB_STALL_TIMEOUT_MS
 *   node .trellis/tasks/09-22-stall-watchdog/research/verify-ac6.mjs
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const BASE = process.env.PI_WEB_BASE ?? "http://127.0.0.1:30141";
const CWD = process.env.AC6_CWD ?? "/home/xupeng/dev/personal/personal-assistant";
const TOOLS = ["bash", "read", "edit", "write", "grep", "find", "ls"];
const DEADLINE_MS = Number(process.env.AC6_DEADLINE_MS ?? 480_000);
const MIN_PROGRESS_EVENTS = Number(process.env.AC6_MIN_PROGRESS ?? 3);
const ROUNDS = Number(process.env.AC6_ROUNDS ?? 5);
const ROUND_SECONDS = Number(process.env.AC6_ROUND_SECONDS ?? 25);
const MIN_DURATION_MS = Number(process.env.AC6_MIN_DURATION_MS ?? 120_000);
const TASK_LINE = process.env.AC6_TASK
  ?? "Active task: .trellis/tasks/09-22-chat-chrome-polish";
const EVENTS_PATH = new URL("./ac6-events.jsonl", import.meta.url);

const childPrompt = [
  TASK_LINE,
  "",
  `请按顺序执行 ${ROUNDS} 次 bash 命令，一次一条，等上一条返回后再执行下一条。`,
  `每条命令都是 \`sleep ${ROUND_SECONDS}\`。每执行完一条，用一句话报告第几次已完成。`,
  `${ROUNDS} 条全部完成后，汇报总耗时。不要读写文件，不要派发任何子代理，不要做其它事。`,
].join("\n");

const parentPrompt = [
  "请调用 trellis_subagent 工具派发一个子代理，然后等它返回并如实汇报结果。",
  "参数严格按下面给出，不要改写、不要增删：",
  "",
  'agent = "trellis-research"',
  'thinking = "off"',
  `prompt = ${JSON.stringify(childPrompt)}`,
].join("\n");

const timeline = [];
const checks = {};

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

function note(kind, detail) {
  timeline.push({ at: Date.now(), kind, detail });
  const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail).slice(0, 400)}`;
  console.log(`[${stamp()}] ${kind}${suffix}`);
}

function childPiProcesses() {
  const out = spawnSync("ps", ["-eo", "pid,args"], { encoding: "utf8" }).stdout ?? "";
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("--mode json") && !line.includes("ps -eo"));
}

async function api(path, body, timeoutMs = 120_000) {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function streamEvents(sessionId, controller, onEvent) {
  const res = await fetch(`${BASE}/api/agent/${encodeURIComponent(sessionId)}/events`, {
    headers: { Accept: "text/event-stream" },
    signal: controller.signal,
  });
  if (!res.ok || !res.body) throw new Error(`SSE -> HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch (error) {
      if (controller.signal.aborted) return;
      throw error;
    }
    if (chunk.done) return;
    buffer += decoder.decode(chunk.value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload) onEvent(JSON.parse(payload));
      }
      index = buffer.indexOf("\n\n");
    }
  }
}

async function main() {
  const childrenBefore = childPiProcesses();
  note("children.before", childrenBefore);

  const created = await api("/api/agent/new", {
    type: "ensure_session",
    cwd: CWD,
    toolNames: TOOLS,
  });
  const sessionId = created?.sessionId;
  checks.sessionCreated = typeof sessionId === "string" && sessionId.length > 0;
  note("session.created", { sessionId });
  if (!checks.sessionCreated) throw new Error("no session id returned");

  const controller = new AbortController();
  const deadline = setTimeout(() => {
    note("deadline.reached", { deadlineMs: DEADLINE_MS });
    controller.abort();
  }, DEADLINE_MS);

  const startedAt = Date.now();
  let stallEvent = null;
  let toolStartAt = null;
  let toolEndAt = null;
  let toolEndError = null;
  let toolEndText = null;
  let progressEvents = 0;
  const progressTimes = [];

  const sse = streamEvents(sessionId, controller, (event) => {
    const type = event?.type;
    if (type === "tool_execution_start" && event.toolName === "trellis_subagent") {
      toolStartAt = Date.now();
      checks.toolStarted = true;
      note("tool.start", { toolName: event.toolName, toolCallId: event.toolCallId });
      return;
    }
    if (type === "tool_execution_update" && event.toolName === "trellis_subagent") {
      progressEvents += 1;
      progressTimes.push(Date.now());
      note("tool.update", { index: progressEvents });
      return;
    }
    if (type === "tool_execution_end" && event.toolName === "trellis_subagent") {
      toolEndAt = Date.now();
      toolEndError = event.isError === true || event.result?.isError === true;
      toolEndText = JSON.stringify(event.result ?? null).slice(0, 300);
      note("tool.end", { isError: toolEndError, summary: toolEndText });
      return;
    }
    if (type === "stall_aborted") {
      stallEvent = event;
      note("stall_aborted.UNEXPECTED", { toolName: event.toolName, silentMs: event.silentMs });
      return;
    }
    if (type === "agent_settled" && toolEndAt !== null) {
      note("agent.settled", {});
      controller.abort();
    }
  }).catch((error) => {
    if (!controller.signal.aborted) throw error;
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const promptCall = api(
    `/api/agent/${encodeURIComponent(sessionId)}`,
    { type: "prompt", message: parentPrompt },
    DEADLINE_MS,
  ).catch((error) => note("prompt.post.failed", String(error)));

  await sse;
  clearTimeout(deadline);
  await promptCall;

  const elapsedMs = Date.now() - startedAt;
  const spreadMs = progressTimes.length > 1
    ? progressTimes[progressTimes.length - 1] - progressTimes[0]
    : 0;
  checks.noStallEvent = stallEvent === null;
  checks.toolCompleted = toolEndAt !== null;
  checks.toolSucceeded = toolEndAt !== null && toolEndError === false;
  checks.progressEventsFlowed = progressEvents >= MIN_PROGRESS_EVENTS;
  checks.dispatchRanForMinutes = toolStartAt !== null
    && toolEndAt !== null
    && (toolEndAt - toolStartAt) >= MIN_DURATION_MS;
  checks.progressSpreadOverTime = spreadMs >= 60_000;

  const state = await api(`/api/agent/${encodeURIComponent(sessionId)}`);
  const streaming = state?.state?.isStreaming ?? state?.isStreaming;
  checks.notStreamingAtEnd = streaming === false || streaming === undefined;

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const childrenAfter = childPiProcesses();
  const beforePids = new Set(childrenBefore.map((line) => line.split(/\s+/)[0]));
  const leaked = childrenAfter.filter((line) => !beforePids.has(line.split(/\s+/)[0]));
  checks.noLeftoverChildProcesses = leaked.length === 0;
  note("children.after", { total: childrenAfter.length, leaked });

  const passed = Object.values(checks).every(Boolean);
  writeFileSync(
    EVENTS_PATH,
    `${timeline.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );

  console.log("\n=== AC6 RESULT ===");
  console.log(JSON.stringify({
    passed,
    sessionId,
    elapsedMs,
    toolDurationMs: toolStartAt !== null && toolEndAt !== null ? toolEndAt - toolStartAt : null,
    progressEvents,
    progressSpreadMs: spreadMs,
    checks,
    toolEndText,
    eventsFile: EVENTS_PATH.pathname,
  }, null, 2));
  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error("\n=== AC6 DRIVER FAILED ===");
  console.error(error instanceof Error ? error.stack : error);
  console.log(JSON.stringify({ passed: false, checks, timeline }, null, 2));
  process.exit(1);
});
