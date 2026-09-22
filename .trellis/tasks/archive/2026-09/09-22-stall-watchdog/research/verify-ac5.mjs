#!/usr/bin/env node
/**
 * AC5 driver for task 09-22-stall-watchdog.
 *
 * Drives a real dev server (`npm run dev` with PI_WEB_STALL_TIMEOUT_MS set) over the
 * HTTP API: create a session in the personal-assistant project, open its SSE stream,
 * dispatch a real `trellis_subagent` whose child process stays silent longer than the
 * stall threshold, then assert:
 *
 *   1. the in-flight tool was observed (`tool_execution_start` for trellis_subagent),
 *   2. a `stall_aborted` event reached the SSE stream with tool name + timings,
 *   3. the session settled afterwards instead of staying in streaming state,
 *   4. no `pi --mode json` child process survived the abort,
 *   5. the user-visible reason text renders from that event payload (all three locales).
 *
 * The raw timeline is written to research/ac5-events.jsonl. This is an API/data-path
 * run: it proves the server-side chain and the SSE payload, NOT the browser toast.
 *
 * Usage:
 *   PI_WEB_STALL_TIMEOUT_MS=90000 npm run dev        # in the pi-web checkout
 *   node .trellis/tasks/09-22-stall-watchdog/research/verify-ac5.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const BASE = process.env.PI_WEB_BASE ?? "http://127.0.0.1:30141";
const CWD = process.env.AC5_CWD ?? "/home/xupeng/dev/personal/personal-assistant";
const TOOLS = ["bash", "read", "edit", "write", "grep", "find", "ls"];
const STALL_MS = Number(process.env.AC5_STALL_MS ?? 90_000);
const DEADLINE_MS = Number(process.env.AC5_DEADLINE_MS ?? 480_000);
const SLEEP_SECONDS = Number(process.env.AC5_SLEEP_SECONDS ?? 240);
const TASK_LINE = process.env.AC5_TASK
  ?? "Active task: .trellis/tasks/09-22-chat-chrome-polish";
const EVENTS_PATH = new URL("./ac5-events.jsonl", import.meta.url);
const STALL_CUSTOM_TYPE = "pi-web.stall.abort";
/** Lifecycle events worth keeping in the timeline; message deltas would flood it. */
const NOTABLE_EVENT_TYPES = new Set([
  "agent_start", "agent_end", "agent_settled", "turn_start", "turn_end",
  "prompt_done", "stall_aborted", "tool_execution_start", "tool_execution_end",
]);

const childPrompt = [
  TASK_LINE,
  "",
  `只做一件事：用 bash 工具执行命令 \`sleep ${SLEEP_SECONDS}\`，命令返回后原样报告其输出。`,
  "不要读写任何文件，不要派发任何子代理，不要做其它事。",
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
  const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail).slice(0, 300)}`;
  console.log(`[${stamp()}] ${kind}${suffix}`);
}

function childPiProcesses() {
  const out = spawnSync("ps", ["-eo", "pid,args"], { encoding: "utf8" }).stdout ?? "";
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("--mode json") && !line.includes("ps -eo"));
}

/** Locate the session `.jsonl` pi wrote for this session id. */
function sessionFilePath(sessionId) {
  const root = join(homedir(), ".pi", "agent", "sessions");
  // Files are `<timestamp>_<sessionId>.jsonl`. Require exactly one suffix match so a
  // shared ULID prefix cannot silently pick the wrong transcript.
  const found = spawnSync("find", [root, "-name", `*_${sessionId}.jsonl`, "-type", "f"], {
    encoding: "utf8",
  }).stdout?.trim();
  const matches = found ? found.split("\n").filter(Boolean) : [];
  return matches.length === 1 ? matches[0] : null;
}

/** The persisted stall notice, read back from the session file (AC7). */
function persistedStallEntry(sessionId) {
  const path = sessionFilePath(sessionId);
  if (!path) return { path: null, entry: null };
  const entries = sessionEntries(path);
  const index = entries.findIndex((candidate) => candidate.type === "custom_message"
    && candidate.customType === STALL_CUSTOM_TYPE);
  return { path, entry: index === -1 ? null : entries[index], index, entries };
}

function sessionEntries(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

/**
 * True when nothing after the notice looks like a new model turn. The notice is
 * written with `triggerTurn: false`, so the only assistant message allowed after
 * it is the aborted one pi itself appends. A later user prompt or tool result
 * would also mean a new turn — counting assistants alone would miss that.
 */
function noTurnAfterNotice(persisted) {
  if (persisted.entry === null) return false;
  const after = persisted.entries.slice(persisted.index + 1);
  let abortedAssistants = 0;
  for (const entry of after) {
    if (entry.type !== "message") continue;
    const role = entry.message?.role;
    if (role === "assistant") {
      const stop = entry.message.stopReason;
      if (stop !== "error" && stop !== "aborted") return false;
      abortedAssistants += 1;
      if (abortedAssistants > 1) return false;
      continue;
    }
    if (role === "user" || role === "toolResult") return false;
  }
  return true;
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

async function renderReason(stallEvent) {
  const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
  const { formatStallAbortNotice } = await jiti.import("../../../../lib/message-display.ts");
  const { translateMessage } = await jiti.import("../../../../lib/i18n/format.ts");
  const en = await jiti.import("../../../../lib/i18n/messages/en.ts");
  const zhCN = await jiti.import("../../../../lib/i18n/messages/zh-CN.ts");
  const zhTW = await jiti.import("../../../../lib/i18n/messages/zh-TW.ts");
  const messages = {
    en: en.enLocale.messages,
    "zh-CN": zhCN.zhCNLocale.messages,
    "zh-TW": zhTW.zhTWLocale.messages,
  };
  const render = (locale) => formatStallAbortNotice(
    stallEvent,
    (key, params) => translateMessage(locale, key, messages, params),
  );
  return { en: render("en"), zhCN: render("zh-CN"), zhTW: render("zh-TW") };
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
  note("session.created", { sessionId, model: created?.model, thinking: created?.thinkingLevel });
  if (!checks.sessionCreated) throw new Error("no session id returned");

  const toolState = await api(`/api/agent/${encodeURIComponent(sessionId)}`, { type: "get_tools" });
  // The command envelope is { success, data }, and get_tools returns the tool array directly.
  const toolList = Array.isArray(toolState?.data)
    ? toolState.data
    : (toolState?.data?.tools ?? toolState?.tools ?? []);
  const toolNames = toolList.map((tool) => tool?.name);
  checks.trellisSubagentAvailable = toolNames.includes("trellis_subagent");
  note("tools.active", { count: toolNames.length, hasTrellisSubagent: checks.trellisSubagentAvailable });
  if (!checks.trellisSubagentAvailable) {
    throw new Error(`trellis_subagent is not available; active tools: ${toolNames.join(",")}`);
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => {
    note("deadline.reached", { deadlineMs: DEADLINE_MS });
    controller.abort();
  }, DEADLINE_MS);

  const startedAt = Date.now();
  let stallEvent = null;
  let stallAt = null;
  let settledAfterStall = false;
  let toolStartAt = null;
  let progressEvents = 0;
  let agentStartCount = 0;
  let turnStartedAfterStall = false;

  const sse = streamEvents(sessionId, controller, (event) => {
    const type = event?.type;
    if (NOTABLE_EVENT_TYPES.has(type) && type !== "tool_execution_start") {
      timeline.push({
        at: Date.now(),
        kind: `sse.${type}`,
        detail: type === "agent_start" ? { afterStall: stallAt !== null } : undefined,
      });
    }
    if (type === "agent_start") {
      agentStartCount += 1;
      if (stallAt !== null) turnStartedAfterStall = true;
      return;
    }
    if (type === "tool_execution_start" && event.toolName === "trellis_subagent") {
      toolStartAt = Date.now();
      checks.toolStarted = true;
      note("tool.start", { toolName: event.toolName, toolCallId: event.toolCallId });
      return;
    }
    if (type === "tool_execution_update" && event.toolName === "trellis_subagent") {
      progressEvents += 1;
      if (progressEvents <= 3) note("tool.update", { toolCallId: event.toolCallId });
      return;
    }
    if (type === "stall_aborted") {
      stallEvent = event;
      stallAt = Date.now();
      note("stall_aborted", {
        toolName: event.toolName,
        silentMs: event.silentMs,
        timeoutMs: event.timeoutMs,
        timeoutSource: event.timeoutSource,
        toolElapsedMs: event.toolElapsedMs,
      });
      return;
    }
    if (type === "agent_settled" && stallAt !== null) {
      settledAfterStall = true;
      note("agent.settled", { afterStallMs: Date.now() - stallAt });
      controller.abort();
      return;
    }
    if (type === "prompt_done" && stallAt !== null) note("prompt.done", {});
  }).catch((error) => {
    if (!controller.signal.aborted) throw error;
  });

  // Let the stream connect before the prompt so no event is missed.
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
  checks.stallEventReceived = stallEvent !== null;
  checks.stallToolName = stallEvent?.toolName === "trellis_subagent";
  checks.stallSilentMs = typeof stallEvent?.silentMs === "number"
    && stallEvent.silentMs >= STALL_MS * 0.9;
  checks.stallToolRanLongEnough = typeof stallEvent?.toolElapsedMs === "number"
    && toolStartAt !== null
    && stallEvent.toolElapsedMs >= STALL_MS * 0.9;
  checks.settledAfterStall = settledAfterStall;

  note("progress.events", { counted: progressEvents });

  const state = await api(`/api/agent/${encodeURIComponent(sessionId)}`);
  const streaming = state?.state?.isStreaming ?? state?.isStreaming;
  checks.notStreamingAfterAbort = streaming === false || streaming === undefined;
  note("session.state", { isStreaming: streaming, pendingPrompts: state?.state?.pendingPromptCount });

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const childrenAfter = childPiProcesses();
  const beforePids = new Set(childrenBefore.map((line) => line.split(/\s+/)[0]));
  const leaked = childrenAfter.filter((line) => !beforePids.has(line.split(/\s+/)[0]));
  checks.noLeftoverChildProcesses = leaked.length === 0;
  note("children.after", { total: childrenAfter.length, leaked });

  let reasons = null;
  if (stallEvent) {
    reasons = await renderReason(stallEvent);
    note("reason.text", reasons);
  }

  // AC7: the reason must outlive the toast, so it has to be in the session file
  // and in what a reload reads back.
  const persisted = persistedStallEntry(sessionId);
  const persistedDetails = persisted.entry?.details;
  checks.persistedStallEntry = persisted.entry !== null;
  checks.persistedEntryFields = persisted.entry !== null
    && persisted.entry.customType === STALL_CUSTOM_TYPE
    && persisted.entry.display === true
    && persistedDetails?.toolName === stallEvent?.toolName
    && persistedDetails?.silentMs === stallEvent?.silentMs
    && persistedDetails?.timeoutMs === stallEvent?.timeoutMs
    && persistedDetails?.timeoutSource === stallEvent?.timeoutSource
    && persistedDetails?.toolOverride === stallEvent?.toolOverride
    && persistedDetails?.elapsedMs === stallEvent?.elapsedMs
    && persistedDetails?.toolElapsedMs === stallEvent?.toolElapsedMs
    && typeof persisted.entry.content === "string"
    && persisted.entry.content.length > 0;
  // Two independent angles: the live stream must not show an agent run starting
  // after the stall, and the persisted transcript must not contain a model turn
  // after the notice. A retry before the stall can legitimately add an extra
  // `agent_start`, so only post-stall starts are counted.
  checks.noTurnStartedByTheNotice = !turnStartedAfterStall && noTurnAfterNotice(persisted);
  note("agent.starts", { total: agentStartCount, afterStall: turnStartedAfterStall });
  note("persisted.entry", {
    file: persisted.path,
    customType: persisted.entry?.customType,
    display: persisted.entry?.display,
    content: persisted.entry?.content,
    details: persisted.entry?.details,
  });

  // Cold-reload path: map the file through session-reader. The HTTP context
  // route may still be served by a live wrapper, so it is not proof the
  // transcript survives a process restart on its own.
  let mappedFromFile = null;
  if (Array.isArray(persisted.entries)) {
    const mapper = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
    const { buildSessionContext } = await mapper.import("../../../../lib/session-reader.ts");
    mappedFromFile = buildSessionContext(persisted.entries).messages
      .find((message) => message?.customType === STALL_CUSTOM_TYPE) ?? null;
  }

  const reload = await api(`/api/sessions/${encodeURIComponent(sessionId)}/context`);
  const reloadedMessages = reload?.context?.messages ?? [];
  const reloaded = reloadedMessages.find((message) => message?.customType === STALL_CUSTOM_TYPE);
  checks.reasonSurvivesReload = mappedFromFile !== null
    && mappedFromFile.role === "custom"
    && mappedFromFile.display === true
    && mappedFromFile.details?.silentMs === stallEvent?.silentMs
    && reloaded !== undefined
    && reloaded.role === "custom"
    && reloaded.details?.silentMs === stallEvent?.silentMs;
  note("reload.customMessage", {
    found: reloaded !== undefined,
    role: reloaded?.role,
    content: reloaded?.content,
    fileMapped: mappedFromFile !== null,
    fileSilentMs: mappedFromFile?.details?.silentMs,
  });

  const passed = Object.values(checks).every(Boolean);
  writeFileSync(
    EVENTS_PATH,
    `${timeline.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  );

  console.log("\n=== AC5 RESULT ===");
  console.log(JSON.stringify({
    passed,
    sessionId,
    elapsedMs,
    stallThresholdMs: STALL_MS,
    checks,
    reasons,
    eventsFile: EVENTS_PATH.pathname,
  }, null, 2));
  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error("\n=== AC5 DRIVER FAILED ===");
  console.error(error instanceof Error ? error.stack : error);
  console.log(JSON.stringify({ passed: false, checks, timeline }, null, 2));
  process.exit(1);
});
