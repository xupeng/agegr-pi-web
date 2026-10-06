import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const hook = await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");
const visibility = await readFile(new URL("../lib/notifications/visible-content.ts", import.meta.url), "utf8");
const mermaid = await readFile(new URL("./MermaidBlock.tsx", import.meta.url), "utf8");

test("only the actual committed result gets a marker, not arbitrary entry wrappers", () => {
  assert.match(source, /completion\?\.resultEntryId === entryIds\[idx\]/);
  assert.match(source, /isCommittedNotificationResult\(committedHistory/);
  assert.match(source, /notificationResultTextIndexes\(messages\[idx\], msg\)/);
  assert.match(source, /data-notification-result-entry-id=\{resultTextIndexes\.length/);
});

test("viewing requires foreground, unoccluded answer content and the same committed history owner", () => {
  assert.match(source, /document\.visibilityState !== "visible" \|\| !document\.hasFocus\(\)/);
  assert.match(source, /getCommittedNotificationHistory\(\) !== observedHistory/);
  assert.match(source, /isNotificationAnswerContentVisible\(body, root/);
  assert.match(visibility, /range\.getClientRects\(\)/);
  assert.match(visibility, /element\.contains\(hit\)/);
  assert.match(source, /querySelector<HTMLElement>\("\.markdown-body, pre"\)/);
  assert.match(source, /pendingScrollRestore \|\| !notificationReadingActive/);
  assert.match(source, /acknowledgeNotification\(observedCompletion\)/);
});

test("notification history generation is independent of Trellis and invalidated before requests", () => {
  assert.match(hook, /const notificationViewGenerationRef = useRef\(0\)/);
  assert.match(hook, /const notificationGeneration = invalidateNotificationHistory\(sid\)/);
  assert.match(hook, /notificationGeneration !== notificationViewGenerationRef\.current/);
  assert.match(hook, /const notificationProof = bindNotificationHistoryProof\(/);
  assert.match(hook, /persistedMessages,[\s\S]*?d\.context\.entryIds \?\? \[\],[\s\S]*?d\.context\.messages/);
});

test("notification observer cleans every resource without changing the tail-follow implementation", () => {
  assert.match(source, /intersectionObserver\.disconnect\(\)/);
  assert.match(source, /mutations\.disconnect\(\)/);
  assert.match(source, /root\.removeEventListener\("scroll", scheduleVisibility\)/);
  assert.match(source, /window\.removeEventListener\("focus", scheduleVisibility\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange", scheduleVisibility\)/);
  assert.match(source, /content\.removeEventListener\("load", scheduleVisibility, true\)/);
  assert.equal((hook.match(/requestAnimationFrame\(/g) ?? []).length, 1);
});

test("code headings, action buttons and Mermaid placeholders cannot acknowledge an answer", () => {
  assert.match(visibility, /data-notification-nonresult/);
  assert.match(visibility, /button, \[role='button'\]/);
  assert.equal((mermaid.match(/className="markdown-code-header" data-notification-nonresult/g) ?? []).length, 2);
  assert.match(mermaid, /className="mermaid-block mermaid-block-error" data-notification-nonresult/);
  assert.match(mermaid, /className="mermaid-block mermaid-block-loading" data-notification-nonresult/);
});

test("notification target selects final answer text, not an entry's process preamble", () => {
  assert.match(source, /pendingSearchScroll\?\.notificationResult[\s\S]*?splitFinalAssistantBlocks\(searchMessage\)\.answerBlocks\.find/);
  assert.match(source, /const notificationTarget = searchTarget\.notificationResult === true/);
});
