import { translateMessage } from "./i18n/format";
import { enLocale } from "./i18n/messages/en";
import type { AgentMessage, AssistantContentBlock, AssistantMessage, ThinkingContent, ToolCallContent } from "./types";

/**
 * `customType` of the persisted stall-watchdog notice. The watchdog stores one
 * of these in the session `.jsonl` so the reason survives a reload, instead of
 * living only in the transient toast.
 */
export const STALL_ABORT_CUSTOM_TYPE = "pi-web.stall.abort";

/** Structured reason carried as the `details` of a {@link STALL_ABORT_CUSTOM_TYPE} message. */
export interface StallAbortNoticeDetails {
  toolName: string | null;
  timeoutMs: number;
  timeoutSource: "env" | "config" | "default";
  toolOverride: boolean;
  silentMs: number;
  elapsedMs: number;
  toolElapsedMs: number | null;
}

interface DisplayOptions {
  isStreaming?: boolean;
}

export function getThinkingPreview(thinking: string): string {
  return thinking.trimStart().match(/^[^\r\n]{0,240}/u)?.[0].trimEnd() ?? "";
}

export const THINKING_PIECE_CHARS = 8_000;

/** A piece of a thinking text; `lineBreak`: a "\n" follows it there, left out of the pieces. */
export interface ThinkingPiece {
  text: string;
  lineBreak: boolean;
}

/**
 * Cuts a long thinking text at the first line break past each
 * THINKING_PIECE_CHARS characters, so the expanded block lays it out piece
 * by piece (#1196). The line break at a cut is left out: the block boundary
 * stands in for it. One that ends an empty line is never a cut. A piece with
 * no line break by twice THINKING_PIECE_CHARS is cut there, losing nothing
 * and never splitting a surrogate pair. A cut depends only on the text
 * before it, so while thinking streams only the last piece changes. Text that
 * fits one piece stays one.
 */
export function splitThinkingPieces(thinking: string): ThinkingPiece[] {
  const pieces: ThinkingPiece[] = [];
  let start = 0;
  while (thinking.length - start > THINKING_PIECE_CHARS) {
    const from = start + THINKING_PIECE_CHARS;
    const hardCut = from + THINKING_PIECE_CHARS;
    // Searched up to the hard cut only: an unbroken line is not scanned to
    // its end again for every piece.
    const window = thinking.slice(from, hardCut + 1);
    let found = window.indexOf("\n");
    // Never at a "\n" that ends an empty line: the piece would end in a line
    // break, and a block draws no line for a trailing one, so that empty line
    // would be lost.
    while (found >= 0 && /\n\r?$/.test(thinking.slice(from + found - 2, from + found))) {
      found = window.indexOf("\n", found + 1);
    }
    if (found >= 0) {
      const lineBreak = from + found;
      if (lineBreak === thinking.length - 1) break;
      pieces.push({ text: thinking.slice(start, lineBreak), lineBreak: true });
      start = lineBreak + 1;
    } else if (thinking.length > hardCut) {
      const last = thinking.charCodeAt(hardCut - 1);
      const cut = last >= 0xd800 && last <= 0xdbff ? hardCut - 1 : hardCut;
      pieces.push({ text: thinking.slice(start, cut), lineBreak: false });
      start = cut;
    } else {
      break;
    }
  }
  pieces.push({ text: thinking.slice(start), lineBreak: false });
  return pieces;
}

/**
 * pi's TUI renders a custom message only when `display` is set; `display: false`
 * is how an extension keeps a message for the model alone. The chat skips it too.
 */
export function isHiddenCustomMessage(message: { role?: AgentMessage["role"]; display?: boolean }): boolean {
  return message.role === "custom" && !message.display;
}

export function isMessageGroupAnchor(message: { role?: AgentMessage["role"]; customType?: string; display?: boolean }): boolean {
  // A background subagent completion starts a new displayed turn, same as a
  // user message or compaction summary: pi-web's own, and @tintinweb/pi-subagents'
  // (a follow-up that triggers a turn). Other custom messages stay inside the turn.
  return message.role === "user"
    || (message.role === "custom" && !isHiddenCustomMessage(message) && (
      message.customType === "compaction"
      || message.customType === "pi-web:subagent-notification"
      || message.customType === "subagent-notification"
    ));
}

export function isEmptyThinkingBlock(block: AssistantContentBlock, options: DisplayOptions = {}): block is ThinkingContent {
  return block.type === "thinking" && !block.deferred && !options.isStreaming && block.thinking.trim() === "";
}

export function getDisplayableAssistantBlocks(
  message: AssistantMessage,
  options: DisplayOptions = {},
): AssistantContentBlock[] {
  return (message.content ?? []).filter((block) => !isEmptyThinkingBlock(block, options));
}

export function getAssistantErrorMessage(
  message: AssistantMessage,
  options: DisplayOptions = {},
): string | null {
  if (options.isStreaming || message.stopReason !== "error") return null;
  return message.errorMessage?.trim() || "Unknown provider error";
}

/**
 * A turn that ended on `stopReason: "length"` spent its whole output budget
 * (often on reasoning alone) and produced no final answer; without a notice it
 * looks like a hung session. The copy lives in i18n (`chat.truncatedByOutputLimit`).
 */
export function isAssistantTruncated(
  message: AssistantMessage,
  options: DisplayOptions = {},
): boolean {
  return !options.isStreaming && message.stopReason === "length";
}

/** Render a millisecond duration as a compact `1h 2m` / `3m 4s` / `5s` label. */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export interface StallAbortNoticeFields {
  toolName?: unknown;
  silentMs?: unknown;
  elapsedMs?: unknown;
  toolElapsedMs?: unknown;
}

function asFiniteDuration(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function readStallAbortFields(value: unknown): StallAbortNoticeFields {
  if (value === null || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    toolName: record.toolName,
    silentMs: record.silentMs,
    elapsedMs: record.elapsedMs,
    toolElapsedMs: record.toolElapsedMs,
  };
}

/**
 * Human-readable reason for the stall watchdog's `stall_aborted` event. The
 * watchdog aborts a turn that produced no agent event for too long; this turns
 * its structured payload into the notice text (copy lives in i18n).
 */
export function formatStallAbortNotice(
  value: unknown,
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  const fields = readStallAbortFields(value);
  const silentMs = asFiniteDuration(fields.silentMs) ?? 0;
  const silentMinutes = Math.max(1, Math.round(silentMs / 60_000));
  const elapsedMs = asFiniteDuration(fields.toolElapsedMs) ?? asFiniteDuration(fields.elapsedMs) ?? 0;
  const elapsed = formatDurationMs(elapsedMs);
  const toolName = typeof fields.toolName === "string" && fields.toolName.trim() !== ""
    ? fields.toolName.trim()
    : null;
  return toolName
    ? translate("chat.stalledTurnAborted", { tool: toolName, minutes: silentMinutes, elapsed })
    : translate("chat.stalledTurnAbortedNoTool", { minutes: silentMinutes, elapsed });
}

/**
 * English one-liner persisted as the `content` of a stall-abort custom message.
 * The server does not know the browser locale, so the client re-renders the
 * localized form from `details`; the wording comes from the same i18n copy as
 * the toast (via {@link formatStallAbortNotice}) so both stay in step.
 */
export function renderStallAbortText(details: unknown): string {
  return formatStallAbortNotice(details, (key, params) =>
    translateMessage("en", key, { en: enLocale.messages }, params));
}

/** Text, an image, or a tool call is an answer. Thinking alone is not. */
export function hasAssistantAnswer(message: AssistantMessage): boolean {
  return (message.content ?? []).some((block) => {
    if (block.type === "text") return block.text.trim().length > 0;
    return block.type === "image" || block.type === "toolCall";
  });
}

function isFinalAnswerBlock(block: AssistantContentBlock): boolean {
  return block.type === "text" || block.type === "image";
}

export function splitFinalAssistantBlocks(
  message: AssistantMessage,
  options: DisplayOptions = {},
): { answerBlocks: AssistantContentBlock[]; processBlocks: AssistantContentBlock[] } {
  const blocks = getDisplayableAssistantBlocks(message, options);
  const lastProcessIndex = blocks.findLastIndex((block) => !isFinalAnswerBlock(block));
  if (lastProcessIndex === -1) {
    return { answerBlocks: blocks, processBlocks: [] };
  }
  return {
    answerBlocks: blocks.slice(lastProcessIndex + 1),
    processBlocks: blocks.slice(0, lastProcessIndex + 1),
  };
}

export function countToolCallBlocks(blocks: AssistantContentBlock[]): number {
  return blocks.filter((block): block is ToolCallContent => block.type === "toolCall").length;
}

/**
 * Process details start collapsed only above a real answer: text or an image in
 * the answer the turn shows (null when it shows none). Under an error or
 * truncation notice alone they stay open, since text the turn wrote before its
 * last tool call sits in them and would be hidden (#906).
 */
export function collapsesProcessDetails(answer: AssistantMessage | null): boolean {
  return (answer?.content ?? []).some((block) => (
    block.type === "image" || (block.type === "text" && block.text.trim().length > 0)
  ));
}
