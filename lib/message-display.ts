import type { AgentMessage, AssistantContentBlock, AssistantMessage, ThinkingContent, ToolCallContent } from "./types";

interface DisplayOptions {
  isStreaming?: boolean;
}

export function getThinkingPreview(thinking: string): string {
  return thinking.trimStart().match(/^[^\r\n]{0,240}/u)?.[0].trimEnd() ?? "";
}

export function isMessageGroupAnchor(message: { role?: AgentMessage["role"]; customType?: string }): boolean {
  return message.role === "user"
    || (message.role === "custom" && message.customType === "compaction");
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
