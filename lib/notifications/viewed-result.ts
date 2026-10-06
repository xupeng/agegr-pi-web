import type { AgentMessage } from "../types";
import { splitFinalAssistantBlocks } from "../message-display";

/** Only committed persisted history, never an optimistic streaming message. */
export interface NotificationHistoryScope {
  sessionId: string | null;
  leafId: string | null;
  viewGeneration: number;
  ready: boolean;
  entryIds: readonly string[];
  messages: readonly AgentMessage[];
}

export const EMPTY_NOTIFICATION_HISTORY: NotificationHistoryScope = {
  sessionId: null,
  leafId: null,
  viewGeneration: 0,
  ready: false,
  entryIds: [],
  messages: [],
};

/** Survives observer rebinds: degraded-storage invalidations must not hammer ack. */
export class NotificationViewAckGate {
  private current: { revision: string; state: "pending" | "failed" | "sent"; retryAt: number } | null = null;
  delay(revision: string, now = Date.now()): number {
    if (this.current?.revision !== revision) return 0;
    if (this.current.state === "sent") return Infinity;
    if (this.current.state === "pending") return 2000;
    return Math.max(0, this.current.retryAt - now);
  }
  begin(revision: string, now = Date.now()): boolean {
    if (this.delay(revision, now) > 0) return false;
    this.current = { revision, state: "pending", retryAt: 0 };
    return true;
  }
  failed(revision: string, now = Date.now()): void {
    if (this.current?.revision === revision) this.current = { revision, state: "failed", retryAt: now + 2000 };
  }
  sent(revision: string): void {
    if (this.current?.revision === revision) this.current.state = "sent";
  }
}

/** Reconcile retained/paged rows without promoting an optimistic array to proof. */
export function bindNotificationHistoryProof(
  renderedEntryIds: readonly string[],
  renderedMessages: readonly AgentMessage[],
  authoritativeEntryIds: readonly string[],
  authoritativeMessages: readonly AgentMessage[],
  previous?: NotificationHistoryScope,
): Pick<NotificationHistoryScope, "entryIds" | "messages"> {
  const authoritative = new Map(authoritativeEntryIds.map((id, index) => [id, authoritativeMessages[index]]));
  const retained = new Map(previous?.entryIds.map((id, index) => [id, previous.messages[index]]) ?? []);
  const entryIds: string[] = [];
  const messages: AgentMessage[] = [];
  renderedEntryIds.forEach((id, index) => {
    const displayed = renderedMessages[index];
    if (displayed?.role !== "assistant") return;
    const committed = authoritative.get(id);
    const matches = committed
      ? committed === displayed || JSON.stringify(committed) === JSON.stringify(displayed)
      : retained.get(id) === displayed;
    if (matches) { entryIds.push(id); messages.push(displayed); }
  });
  return { entryIds, messages };
}

export function isCommittedNotificationResult(
  history: NotificationHistoryScope,
  sessionId: string | null,
  entryId: string | undefined,
  sourceMessage: AgentMessage,
): boolean {
  if (!history.ready || !sessionId || history.sessionId !== sessionId || !entryId) return false;
  const index = history.entryIds.indexOf(entryId);
  // Object identity binds the rendered source to the winning history response.
  // Equal text or a reused array index is not persisted-entry evidence.
  return index >= 0 && history.messages[index] === sourceMessage && sourceMessage.role === "assistant";
}

/** Indexes among rendered text blocks, excluding the final answer's process copy. */
export function notificationResultTextIndexes(
  original: AgentMessage,
  displayed: AgentMessage,
): number[] {
  if (original.role !== "assistant" || displayed.role !== "assistant") return [];
  const answerBlocks = new Set(splitFinalAssistantBlocks(original).answerBlocks);
  return (displayed.content ?? []).filter((block) => block.type === "text")
    .flatMap((block, index) => block.type === "text" && block.text.trim() && answerBlocks.has(block) ? [index] : []);
}

export interface NotificationViewRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function notificationVisibleIntersection(
  result: NotificationViewRect,
  scroller: NotificationViewRect,
  viewport: NotificationViewRect,
): NotificationViewRect | null {
  const intersection = {
    left: Math.max(result.left, scroller.left, viewport.left),
    top: Math.max(result.top, scroller.top, viewport.top),
    right: Math.min(result.right, scroller.right, viewport.right),
    bottom: Math.min(result.bottom, scroller.bottom, viewport.bottom),
  };
  if (!Object.values(intersection).every(Number.isFinite)
    || intersection.right <= intersection.left || intersection.bottom <= intersection.top) return null;
  return intersection;
}
