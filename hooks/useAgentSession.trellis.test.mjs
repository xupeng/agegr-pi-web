import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useAgentSession.ts", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("../components/ChatWindow.tsx", import.meta.url), "utf8");
const appShellSource = await readFile(new URL("../components/AppShell.tsx", import.meta.url), "utf8");

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `${startMarker} not found`);
  assert.notEqual(end, -1, `${endMarker} not found`);
  return source.slice(start, end);
}

test("loadSession guards success, 404, error and loading writes by request ownership", () => {
  const loadSource = slice("  const loadSession = useCallback", "  const loadContext = useCallback");
  assert.match(loadSource, /const requestSeq = \+\+sessionReqSeqRef\.current/);
  assert.match(loadSource, /requestSeq === sessionReqSeqRef\.current/);
  assert.match(loadSource, /!sessionHookMountedRef\.current[\s\S]*?sessionIdRef\.current !== sid[\s\S]*?requestSeq !== sessionReqSeqRef\.current/);
  assert.match(loadSource, /showLoading[\s\S]*?sessionHookMountedRef\.current[\s\S]*?sessionIdRef\.current === sid[\s\S]*?requestSeq === sessionReqSeqRef\.current/);
  assert.match(loadSource, /sessionIdRef\.current === sid[\s\S]*?requestSeq === sessionReqSeqRef\.current[\s\S]*?setError/);
  assert.match(loadSource, /!messagesLoaded[\s\S]*?sessionIdRef\.current === sid[\s\S]*?requestSeq === sessionReqSeqRef\.current[\s\S]*?setLoading/);
});

test("loadContext clears the previous branch synchronously and rejects stale pages", () => {
  const contextSource = slice("  const loadContext = useCallback", "  const loadTools = useCallback");
  assert.match(contextSource, /const requestSeq = \+\+contextReqSeqRef\.current/);
  // Scope is cleared before awaiting the fetch.
  const resetIndex = contextSource.indexOf('dispatchTrellis({ type: "reset" })');
  const fetchIndex = contextSource.indexOf("await fetch(url");
  assert.ok(resetIndex !== -1 && fetchIndex !== -1 && resetIndex < fetchIndex);
  assert.match(contextSource, /sessionReqSeqRef\.current \+= 1/);
  assert.match(contextSource, /requestViewGeneration !== trellisViewGenerationRef\.current/);
  assert.match(contextSource, /trellisActiveLeafRef\.current !== leafId/);
  // Pagination never recomputes the Trellis scope.
  assert.match(contextSource, /if \(before\) \{[\s\S]*?setMessages\(\(prev\) => \[\.\.\.d\.context\.messages, \.\.\.prev\]\)[\s\S]*?\} else \{[\s\S]*?applyTrellisHistory\(/);
});

test("live tool events feed the shared decoder and are gated by branch ownership", () => {
  const eventsSource = slice("const handleAgentEvent = useCallback", "handleAgentEventRef.current = handleAgentEvent");
  assert.match(eventsSource, /case "connected"[\s\S]*?trellisHistoryCallsRef\.current,[\s\S]*?trellisAllowedCallsRef\.current,[\s\S]*?trellisReplayPendingRef\.current = event\.isStreaming === true[\s\S]*?markOverlaysStale/);
  assert.match(eventsSource, /case "connected"[\s\S]*?event\.isStreaming !== true[\s\S]*?!agentRunningRef\.current[\s\S]*?trellisHistoryRequestsInFlightRef\.current === 0[\s\S]*?refreshViewedSession/);
  assert.match(eventsSource, /case "message_start"[\s\S]*?allowTrellisCallsFromMessage\(msg\);[\s\S]*?flushTrellisReplay\(\)/);
  assert.match(eventsSource, /delta\.toolName === TRELLIS_SUBAGENT_TOOL_NAME[\s\S]*?trellisAllowedCallsRef\.current\.add\(delta\.id\)/);
  assert.match(eventsSource, /case "tool_execution_update"[\s\S]*?ingestTrellisToolDetails\(id, name, partial\?\.details, "partial"\)/);
  assert.match(eventsSource, /case "tool_execution_end"[\s\S]*?ingestTrellisToolDetails\(id, name, result\?\.details, "tool-end"\)/);
  assert.match(eventsSource, /completed\.role === "toolResult"[\s\S]*?ingestTrellisToolDetails\([\s\S]*?"message"/);
  // Generic one-line progress and completed tool-result chat messages remain.
  assert.match(eventsSource, /const progress = getToolExecutionProgress\(event\.partialResult\)/);
  assert.match(eventsSource, /including generic and Trellis tool results[\s\S]*?setMessages/);
});

test("ingest keeps generic tools out and rejects live events for an unviewed branch", () => {
  const ingestSource = slice("  const ingestTrellisToolDetails = useCallback", "  const trellisSelection = useMemo");
  assert.match(ingestSource, /if \(toolName !== TRELLIS_SUBAGENT_TOOL_NAME\) return/);
  assert.match(ingestSource, /trellisReplayPendingRef\.current[\s\S]*?length < 32[\s\S]*?trellisReplayBufferRef\.current\.push/);
  assert.match(ingestSource, /sessionIdRef\.current !== owner\.sessionId[\s\S]*?trellisViewGenerationRef\.current !== owner\.viewGeneration/);
  assert.match(ingestSource, /!liveEventsBelongToView\(\) \|\| !trellisAllowedCallsRef\.current\.has\(toolCallId\)/);
  assert.match(ingestSource, /projectTrellisSubagentRecords\(\{/);
});

test("publishes scoped snapshots and retires the owner on unmount", () => {
  assert.match(source, /onSubagentRecordsChangeRef\.current\?\.\(\{[\s\S]*?parentSessionId: null/);
  assert.match(source, /trellisOwnerRef\.current = nextTrellisOwner\(\)/);
  assert.match(source, /owner: trellisOwnerRef\.current/);
  assert.match(source, /historyCoverage: trellisSelection\.historyCoverage/);
});

test("ChatWindow forwards the typed subagent records callback without new commands", () => {
  assert.match(chatWindowSource, /onSubagentRecordsChange\?: \(snapshot: TrellisSubagentRecordsSnapshot\) => void/);
  assert.match(chatWindowSource, /onSubagentRecordsChange,\s+onSystemPromptChange/);
  // Read-only: the bridge has no session control commands.
  assert.doesNotMatch(chatWindowSource, /onSubagentRecordsChange[\s\S]{0,200}(navigate_tree|set_model|abort|fork_branch)/);
});

test("AppShell combines built-in children and Trellis records behind one predicate", () => {
  assert.match(appShellSource, /const hasSubagentsEntry = hasSubagentSessions \|\| hasTrellisRecords/);
  assert.match(appShellSource, /const subagentsEntryCount = \(activeSessionFamily\?\.subagents\.length \?\? 0\) \+ trellisRecords\.length/);
  assert.match(appShellSource, /shouldAcceptTrellisSnapshot\(trellisOwnerRef\.current, snapshot\)/);
  assert.match(appShellSource, /snapshot\.parentSessionId !== selectedId/);
  assert.match(appShellSource, /<TrellisSubagentRecords/);
  // Built-in family/catalog logic is unchanged.
  assert.match(appShellSource, /getSessionFamily\(sessionsWithSelection, selectedSession\?\.id\)/);
});
