import type { NotificationCompletionInput } from "./notifications/types";

export type RunOutcome = "completed" | "aborted" | "error";

export interface RunTurnWitness {
  outcome: RunOutcome;
  resultEntryId: string;
  stopReason: string;
  summary: string;
}

interface TrackedRun {
  sequence: number;
  identity: string;
  promptTicket: number | null;
  turn: RunTurnWitness | null;
  beforeSettle: RunOutcome | null;
  stopped: boolean;
  askPaused: boolean;
  failed: boolean;
}

interface PromptTicket {
  started: boolean;
  stopped: boolean;
  run: TrackedRun | null;
}

/** Only the persisted assistant's visible text belongs in a completion summary. */
export function completionResultText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const value = message as Record<string, unknown>;
  if (value.role !== "assistant" || !Array.isArray(value.content)) return "";
  return value.content.flatMap((block: unknown) => {
    if (!block || typeof block !== "object") return [];
    const part = block as Record<string, unknown>;
    return part.type === "text" && typeof part.text === "string" ? [part.text] : [];
  }).join(" ").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
}

/**
 * Pure run-local classifier. Admission is not a run; only agent_start opens one.
 * Retry/compaction/continuation starts share it until settled. A directly-owned
 * candidate waits for its prompt promise, so rejection can veto before delivery.
 * Deferred runs after settled are independent, even inside that outer promise.
 * SDK special deferred/post-run exceptions have no precise public run attribution;
 * only the first started run is bound to the direct prompt ticket (accepted limit).
 */
export class AgentRunTracker {
  private sequence = 0;
  private ticketSequence = 0;
  private active: TrackedRun | null = null;
  private tickets = new Map<number, PromptTicket>();
  private settlements = new Map<number, { ready: boolean; candidate: NotificationCompletionInput | null }>();
  private disposed = false;

  constructor(private readonly sessionId: string, private readonly generation: string) {}

  beginPrompt(): number {
    const id = ++this.ticketSequence;
    if (!this.disposed) this.tickets.set(id, { started: false, stopped: false, run: null });
    return id;
  }

  acceptPrompt(id: number, disposition: "started" | "queued" | "handled"): void {
    const ticket = this.tickets.get(id);
    if (ticket) ticket.started = disposition === "started";
  }

  agentStart(): void {
    if (this.disposed || this.active) return;
    const owner = [...this.tickets].find(([, ticket]) => ticket.started && !ticket.run);
    const sequence = ++this.sequence;
    this.active = {
      sequence, identity: `${this.generation}:${sequence}`,
      promptTicket: owner?.[0] ?? null,
      turn: null, beforeSettle: null, stopped: owner?.[1].stopped ?? false, askPaused: false, failed: false,
    };
    this.settlements.set(sequence, { ready: false, candidate: null });
    if (owner) owner[1].run = this.active;
  }

  turnEnd(turn: RunTurnWitness): void {
    if (!this.active) return;
    this.active.turn = { ...turn };
    // An earlier before-settle request may have continued into this new turn.
    this.active.beforeSettle = null;
  }

  beforeSettle(outcome: RunOutcome): void {
    if (this.active) this.active.beforeSettle = outcome;
  }

  markStopped(): void {
    if (this.active) this.active.stopped = true;
    for (const ticket of this.tickets.values()) if (!ticket.run) ticket.stopped = true;
  }
  markAskPaused(): void { if (this.active) this.active.askPaused = true; }

  settle(completionLeafId: string | null, completedAt: string): NotificationCompletionInput[] {
    const run = this.active;
    this.active = null;
    if (!run) return [];
    const turn = run.turn;
    const candidate: NotificationCompletionInput | null = !run.stopped && !run.askPaused && !run.failed
      && turn?.outcome === "completed" && run.beforeSettle === "completed"
      && (turn.stopReason === "stop" || turn.stopReason === "toolUse") && turn.resultEntryId
      ? Object.freeze({ sessionId: this.sessionId, runIdentity: run.identity,
          resultEntryId: turn.resultEntryId, completionLeafId, completedAt, summary: turn.summary })
      : null;
    const ticket = run.promptTicket === null ? undefined : this.tickets.get(run.promptTicket);
    this.settlements.set(run.sequence, { ready: !ticket, candidate });
    return this.drainCompletions();
  }

  finishPrompt(id: number, failed = false): NotificationCompletionInput[] {
    const ticket = this.tickets.get(id);
    this.tickets.delete(id);
    if (!ticket) return [];
    if (failed && ticket.run) ticket.run.failed = true;
    // If a rejection preceded settled, the active run still carries the veto.
    const settlement = ticket.run && this.settlements.get(ticket.run.sequence);
    if (settlement && ticket.run !== this.active) {
      settlement.ready = true;
      if (failed) settlement.candidate = null;
    }
    return this.drainCompletions();
  }

  private drainCompletions(): NotificationCompletionInput[] {
    const candidates: NotificationCompletionInput[] = [];
    // Deferred runs can settle before the outer direct promise resolves. Release
    // in run order so an older result can never overwrite a newer completion.
    for (const [sequence, settlement] of this.settlements) {
      if (!settlement.ready) break;
      this.settlements.delete(sequence);
      if (settlement.candidate) candidates.push(settlement.candidate);
    }
    return candidates;
  }

  dispose(): void {
    this.disposed = true;
    this.active = null;
    this.tickets.clear();
    this.settlements.clear();
  }
}
