import { getPiWebSettingsPath, readPiWebSettings } from "./pi-web-settings";

/**
 * Session stall watchdog.
 *
 * A turn can enter a state where it stops producing any agent event — a stuck
 * tool, a stalled subagent child process, or a provider stream that never
 * resumes. Pi emits no keepalive, so this module watches the gap between
 * events: while a turn is armed, every event re-arms a `setTimeout` for the
 * effective silence budget. When the timer fires without a newer event, the
 * turn is declared stalled and the host is told to abort it.
 *
 * It is deliberately independent from the session idle timer in
 * `rpc-manager.ts`: that one decides whether the wrapper can be reclaimed and
 * shuts the session down; this one only aborts the current turn.
 */

const MAX_TIMER_MS = 2_147_483_647;

/** Default silence budget for a running turn (15 minutes). */
export const DEFAULT_STALL_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Default per-tool silence budgets. A legitimate long-running command (a full
 * e2e run) can be silent for a long time, so those tools get a wider budget.
 */
export const DEFAULT_STALL_TOOL_TIMEOUTS: Readonly<Record<string, number>> = Object.freeze({
  bash: 30 * 60 * 1000,
});

/** Where the effective main threshold came from, for logging. */
export type StallTimeoutSource = "env" | "config" | "default";

export interface StallWatchdogSettings {
  stallTimeoutMs: number;
  stallToolTimeouts: Record<string, number>;
  timeoutSource: StallTimeoutSource;
}

/** The active tool at the moment a stall was declared. */
export interface StallWatchdogActiveTool {
  toolCallId: string;
  toolName: string;
}

/** One declared stall, handed to the host so it can abort and report. */
export interface StallWatchdogStall {
  toolName: string | null;
  toolCallId: string | null;
  /** Effective silence budget that was exceeded. */
  timeoutMs: number;
  /** Origin of the main threshold. */
  timeoutSource: StallTimeoutSource;
  /** Whether `timeoutMs` came from the per-tool budget rather than the main one. */
  toolOverride: boolean;
  /** Milliseconds since the last observed event. */
  silentMs: number;
  /** Milliseconds since the turn was armed. */
  elapsedMs: number;
  /** Milliseconds since the active tool started, when one is known. */
  toolElapsedMs: number | null;
}

export interface StallWatchdogEvent {
  type: string;
  toolCallId?: unknown;
  toolName?: unknown;
}

export interface StallWatchdogOptions {
  settings: StallWatchdogSettings;
  onStall: (stall: StallWatchdogStall) => void;
  /** Last in-flight tool, read from the host's existing in-flight map. */
  getActiveTool?: () => StallWatchdogActiveTool | null;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

export interface ResolveStallWatchdogOptions {
  /** Value to parse instead of `PI_WEB_STALL_TIMEOUT_MS`. */
  envValue?: string | undefined;
  /** Settings file to read instead of the shared pi-web settings file. */
  settingsPath?: string;
  /** Pre-parsed settings object; when set, no file is read. */
  stored?: Record<string, unknown>;
  /** Injectable warning sink for tests. */
  warn?: (message: string) => void;
}

function isFiniteTimeout(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= MAX_TIMER_MS;
}

function parseToolTimeouts(
  value: unknown,
  warn: (message: string) => void,
): Record<string, number> {
  const toolTimeouts: Record<string, number> = { ...DEFAULT_STALL_TOOL_TIMEOUTS };
  if (value === undefined) return toolTimeouts;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    warn("[pi-web] invalid stallToolTimeouts in pi-web-settings.json, falling back to the default tool budgets");
    return toolTimeouts;
  }
  for (const [toolName, rawTimeout] of Object.entries(value as Record<string, unknown>)) {
    if (rawTimeout === 0) {
      // Explicitly inherit the main threshold for this tool.
      delete toolTimeouts[toolName];
      continue;
    }
    if (!isFiniteTimeout(rawTimeout)) {
      warn(`[pi-web] invalid stallToolTimeouts["${toolName}"] in pi-web-settings.json, ignoring it`);
      continue;
    }
    toolTimeouts[toolName] = rawTimeout;
  }
  return toolTimeouts;
}

/**
 * Resolve the stall watchdog thresholds. Precedence for the main threshold is
 * the `PI_WEB_STALL_TIMEOUT_MS` environment variable, then `stallTimeoutMs` in
 * the shared pi-web settings file, then {@link DEFAULT_STALL_TIMEOUT_MS}.
 * Unset/blank values use the next source; `0` disables the watchdog; invalid or
 * out-of-range values warn and fall back to the default. Per-tool budgets come
 * from `stallToolTimeouts` and merge over the defaults.
 */
export function resolveStallWatchdogSettings(
  options: ResolveStallWatchdogOptions = {},
): StallWatchdogSettings {
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const envValue = options.envValue !== undefined
    ? options.envValue
    : process.env.PI_WEB_STALL_TIMEOUT_MS;

  let stored: Record<string, unknown> = {};
  if (options.stored !== undefined) {
    stored = options.stored;
  } else {
    try {
      stored = readPiWebSettings(options.settingsPath ?? getPiWebSettingsPath());
    } catch (error) {
      warn(
        `[pi-web] invalid pi-web-settings.json, using default stall watchdog thresholds: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  const toolTimeouts = parseToolTimeouts(stored.stallToolTimeouts, warn);

  if (envValue !== undefined && envValue.trim() !== "") {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_TIMER_MS) {
      return { stallTimeoutMs: parsed, stallToolTimeouts: toolTimeouts, timeoutSource: "env" };
    }
    warn(
      `[pi-web] invalid PI_WEB_STALL_TIMEOUT_MS "${envValue}", falling back to ${DEFAULT_STALL_TIMEOUT_MS} ms`,
    );
    return {
      stallTimeoutMs: DEFAULT_STALL_TIMEOUT_MS,
      stallToolTimeouts: toolTimeouts,
      timeoutSource: "default",
    };
  }

  const configured = stored.stallTimeoutMs;
  if (configured !== undefined) {
    if (typeof configured === "number" && Number.isFinite(configured) && configured >= 0 && configured <= MAX_TIMER_MS) {
      return { stallTimeoutMs: configured, stallToolTimeouts: toolTimeouts, timeoutSource: "config" };
    }
    warn(
      `[pi-web] invalid stallTimeoutMs in pi-web-settings.json, falling back to ${DEFAULT_STALL_TIMEOUT_MS} ms`,
    );
    return {
      stallTimeoutMs: DEFAULT_STALL_TIMEOUT_MS,
      stallToolTimeouts: toolTimeouts,
      timeoutSource: "default",
    };
  }

  return {
    stallTimeoutMs: DEFAULT_STALL_TIMEOUT_MS,
    stallToolTimeouts: toolTimeouts,
    timeoutSource: "default",
  };
}

/**
 * Watches a single agent turn for event silence. One instance per session;
 * `arm()` at turn start, `dispose()` at wrapper teardown.
 */
export class StallWatchdog {
  private readonly settings: StallWatchdogSettings;
  private readonly onStall: (stall: StallWatchdogStall) => void;
  private readonly getActiveTool: () => StallWatchdogActiveTool | null;
  private readonly now: () => number;
  private readonly toolStartedAt = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private armed = false;
  private triggered = false;
  private lastEventAt = 0;
  private turnStartedAt = 0;

  constructor(options: StallWatchdogOptions) {
    this.settings = options.settings;
    this.onStall = options.onStall;
    this.getActiveTool = options.getActiveTool ?? (() => null);
    this.now = options.now ?? (() => Date.now());
  }

  /** Whether a turn is currently being watched. */
  get isArmed(): boolean {
    return this.armed;
  }

  /** Whether a silence timer is currently scheduled. For tests and diagnostics. */
  get hasPendingTimer(): boolean {
    return this.timer !== null;
  }

  /** Whether the watchdog is enabled at all (`stallTimeoutMs: 0` disables it). */
  get isEnabled(): boolean {
    return this.settings.stallTimeoutMs > 0;
  }

  /** Timestamp of the last observed event, for tests and diagnostics. */
  get lastEventAtMs(): number {
    return this.lastEventAt;
  }

  /** Silence budget for a tool, falling back to the main threshold. */
  effectiveTimeoutMs(toolName?: string | null): number {
    if (toolName) {
      const override = this.settings.stallToolTimeouts[toolName];
      if (override !== undefined && override > 0) return override;
    }
    return this.settings.stallTimeoutMs;
  }

  /** Start watching a turn. Re-arming resets the clock and any prior trigger. */
  arm(): void {
    if (!this.isEnabled) return;
    const at = this.now();
    this.armed = true;
    this.triggered = false;
    this.turnStartedAt = at;
    this.lastEventAt = at;
    this.toolStartedAt.clear();
    this.reschedule();
  }

  /** Stop watching without discarding diagnostics. Idempotent. */
  disarm(): void {
    this.armed = false;
    this.clearTimer();
  }

  /** Permanently stop watching and release the timer. Idempotent. */
  dispose(): void {
    this.armed = false;
    this.triggered = false;
    this.toolStartedAt.clear();
    this.clearTimer();
  }

  /**
   * Record an agent event. Every event counts as progress; while armed it also
   * re-arms the silence timer.
   */
  observe(event: StallWatchdogEvent): void {
    const at = this.now();
    const toolCallId = typeof event.toolCallId === "string" && event.toolCallId !== ""
      ? event.toolCallId
      : null;
    if (toolCallId) {
      if (event.type === "tool_execution_start") {
        this.toolStartedAt.set(toolCallId, at);
      } else if (event.type === "tool_execution_update") {
        if (!this.toolStartedAt.has(toolCallId)) this.toolStartedAt.set(toolCallId, at);
      } else if (event.type === "tool_execution_end") {
        this.toolStartedAt.delete(toolCallId);
      }
    }
    if (!this.armed) return;
    this.lastEventAt = at;
    this.reschedule();
  }

  private reschedule(): void {
    this.clearTimer();
    if (!this.armed || this.triggered) return;
    const timeoutMs = this.effectiveTimeoutMs(this.getActiveTool()?.toolName ?? null);
    if (timeoutMs <= 0) return;
    this.timer = setTimeout(() => this.fire(), timeoutMs);
  }

  private fire(): void {
    this.timer = null;
    if (!this.armed || this.triggered) return;
    const at = this.now();
    const activeTool = this.getActiveTool();
    const toolName = activeTool?.toolName ?? null;
    const timeoutMs = this.effectiveTimeoutMs(toolName);
    const silentMs = Math.max(0, at - this.lastEventAt);
    if (timeoutMs <= 0 || silentMs < timeoutMs) {
      this.reschedule();
      return;
    }
    // Latch before notifying so a reentrant event or timer cannot fire twice.
    this.triggered = true;
    this.armed = false;
    const toolCallId = activeTool?.toolCallId ?? null;
    const toolStartedAt = toolCallId !== null ? this.toolStartedAt.get(toolCallId) : undefined;
    const toolOverride = toolName !== null
      && (this.settings.stallToolTimeouts[toolName] ?? 0) > 0;
    const stall: StallWatchdogStall = {
      toolName,
      toolCallId,
      timeoutMs,
      timeoutSource: this.settings.timeoutSource,
      toolOverride,
      silentMs,
      elapsedMs: Math.max(0, at - this.turnStartedAt),
      toolElapsedMs: toolStartedAt === undefined ? null : Math.max(0, at - toolStartedAt),
    };
    try {
      this.onStall(stall);
    } catch (error) {
      console.error(
        "[pi-web] stall watchdog callback failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
