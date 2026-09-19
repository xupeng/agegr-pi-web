import type { AssistantContentBlock, ToolResultMessage } from "./types";
import { isApplyPatchToolName, isEditToolName, isWriteToolName } from "./tool-names";
import {
  AGENT_TOOL_NAME,
  extractRawWrittenFiles,
  resolveAndMergeWrittenFiles,
  textFromToolResultContent,
  TRELLIS_SUBAGENT_TOOL_NAME,
  type RawWrittenFile,
  type WrittenFile,
} from "./written-file-sources";

export type {
  WrittenFile,
  WrittenFileOperation,
  WrittenFileOrigin,
} from "./written-file-sources";

function isFileWritingToolName(toolName: string): boolean {
  return isWriteToolName(toolName)
    || isEditToolName(toolName)
    || isApplyPatchToolName(toolName)
    || toolName === TRELLIS_SUBAGENT_TOOL_NAME
    || toolName === AGENT_TOOL_NAME;
}

/**
 * Collect the distinct files a single assistant turn actually wrote.
 *
 * Every entry is derived from a tool call whose result arrived and did not
 * error — never from the reply text. A path the assistant merely mentions in
 * prose is not evidence that any file was touched, so it is not a source here;
 * the tool call is the record of what happened.
 *
 * A single `apply_patch` call can write several files, and a subagent call can
 * write many more, so each call contributes a list. Paths are resolved against
 * `cwd`, deduped across the whole turn, and kept in first-seen order.
 */
export function extractTurnWrittenFiles(
  content: AssistantContentBlock[],
  toolResults: Map<string, ToolResultMessage> | undefined,
  cwd?: string,
): WrittenFile[] {
  const raw: RawWrittenFile[] = [];

  for (const block of content) {
    if (block.type !== "toolCall") continue;
    if (!isFileWritingToolName(block.toolName)) continue;

    // No result yet (still streaming) or the call failed — nothing was written.
    const result = toolResults?.get(block.toolCallId);
    if (!result) continue;

    raw.push(...extractRawWrittenFiles(block.toolName, block.input, {
      isError: result.isError === true,
      details: result.details,
      text: textFromToolResultContent(result.content),
    }));
  }

  return resolveAndMergeWrittenFiles(raw, cwd);
}
