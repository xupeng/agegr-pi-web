import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "fs";
import { join } from "path";
import { writePrivateFileAtomicSync } from "../atomic-file";
import type { AskUserQuestion } from "./types";

// ============================================================================
// Persistent open-ask store.
//
// `PendingAskStore` is process-lifetime and in-memory, and the session wrapper
// that owns an open ask is torn down after ~10 idle minutes. Without a disk
// copy, a question the agent asked would silently vanish the moment the
// wrapper is destroyed — switching sessions, reopening the session later, or
// opening it from another device would show no card and the user could never
// answer.
//
// This module mirrors open asks to a small JSON file so a rebuilt wrapper (or
// a restarted server) can rehydrate them. It is best-effort by design: writes
// never propagate errors, and corrupt data degrades to "no persisted ask".
// The in-memory store stays the authoritative source while the runtime lives.
//
// Concurrency: every read-modify-write here is fully synchronous (no awaits),
// so within a single process — the only supported deployment — concurrent
// opens/closes from different sessions serialize on the event loop and can
// never clobber each other. The atomic replace keeps the file intact across
// restarts. Multiple pi-web processes writing this same file are NOT
// supported: a lost update could drop another process's entry, in which case
// that ask simply fails to rehydrate (the in-memory store stays authoritative
// while that runtime lives).
// ============================================================================

/** Shape persisted per session; a subset of {@link PendingAskUser}. */
export interface PersistedOpenAsk {
  askId: string;
  askedAt: string;
  questions: AskUserQuestion[];
}

export interface OpenAsksFile {
  version: 1;
  asks: Record<string, PersistedOpenAsk>;
}

const OPEN_ASKS_VERSION = 1;
const OPEN_ASKS_PATH = join(getAgentDir(), "pi-web-open-asks.json");

export function openAsksPath(): string {
  return OPEN_ASKS_PATH;
}

function isPersistedOpenAsk(value: unknown): value is PersistedOpenAsk {
  if (!value || typeof value !== "object") return false;
  const ask = value as Partial<PersistedOpenAsk>;
  if (typeof ask.askId !== "string" || ask.askId === "") return false;
  if (typeof ask.askedAt !== "string" || ask.askedAt === "") return false;
  if (!Array.isArray(ask.questions)) return false;
  return ask.questions.every((question) => {
    if (!question || typeof question !== "object") return false;
    const q = question as Partial<AskUserQuestion>;
    return typeof q.id === "string"
      && typeof q.question === "string"
      && Array.isArray(q.options);
  });
}

/**
 * Read every persisted open ask. Missing, corrupt, or version-mismatched data
 * degrades to an empty map; malformed single entries are skipped.
 */
export function loadOpenAsks(file: string = OPEN_ASKS_PATH): Map<string, PersistedOpenAsk> {
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as OpenAsksFile;
    if (parsed?.version !== OPEN_ASKS_VERSION) return new Map();
    if (!parsed.asks || typeof parsed.asks !== "object") return new Map();
    const result = new Map<string, PersistedOpenAsk>();
    for (const [sessionId, ask] of Object.entries(parsed.asks)) {
      if (sessionId === "") continue;
      if (isPersistedOpenAsk(ask)) result.set(sessionId, ask);
    }
    return result;
  } catch {
    return new Map();
  }
}

/** Best-effort atomic write; failures never propagate to the caller. */
export function writeOpenAsks(asks: Map<string, PersistedOpenAsk>, file: string = OPEN_ASKS_PATH): void {
  try {
    const payload: OpenAsksFile = {
      version: OPEN_ASKS_VERSION,
      asks: Object.fromEntries(asks),
    };
    writePrivateFileAtomicSync(file, JSON.stringify(payload));
  } catch {
    // Persistence is best-effort; the in-memory store stays authoritative.
  }
}

/** The persisted open ask of one session, if any. */
export function readPersistedAsk(sessionId: string, file: string = OPEN_ASKS_PATH): PersistedOpenAsk | undefined {
  return loadOpenAsks(file).get(sessionId);
}

/** Record (or replace) the open ask of one session on disk. */
export function persistOpenAsk(sessionId: string, ask: PersistedOpenAsk, file: string = OPEN_ASKS_PATH): void {
  const asks = loadOpenAsks(file);
  asks.set(sessionId, ask);
  writeOpenAsks(asks, file);
}

/** Drop the persisted open ask of one session; no-op when absent. */
export function forgetPersistedAsk(sessionId: string, file: string = OPEN_ASKS_PATH): void {
  const asks = loadOpenAsks(file);
  if (!asks.delete(sessionId)) return;
  writeOpenAsks(asks, file);
}
