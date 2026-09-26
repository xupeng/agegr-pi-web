import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "./atomic-file";
import { getProjectTrustStatus } from "./project-trust";

/**
 * The append-system file is folded into the system prompt of *every* request in
 * a normal session, so an unbounded file is an accidental prompt-size and cost
 * trap. This is a hard write limit, not a display hint.
 */
export const MAX_APPEND_SYSTEM_BYTES = 65_536;

export interface AppendSystemPromptState {
  /** Absolute path of the global (writable) file. */
  path: string;
  /** Raw file contents; empty when the file does not exist. */
  content: string;
  exists: boolean;
  maxBytes: number;
}

export interface ProjectAppendSystemOverride {
  path: string;
  /** Whether pi will actually read the project file (project-trust decision). */
  trusted: boolean;
}

export class AppendSystemContentTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`Append system prompt is ${bytes} bytes, exceeding the ${MAX_APPEND_SYSTEM_BYTES}-byte limit`);
    this.name = "AppendSystemContentTooLargeError";
  }
}

export function appendSystemPromptByteLength(content: string): number {
  return Buffer.byteLength(content, "utf8");
}

/** Absolute path of the shared global `APPEND_SYSTEM.md` file. */
export function getAppendSystemPromptPath(agentDir: string = getAgentDir()): string {
  return join(agentDir, "APPEND_SYSTEM.md");
}

/** Absolute path of the project-level override pi prefers when the project is trusted. */
export function getProjectAppendSystemPromptPath(cwd: string): string {
  return join(cwd, CONFIG_DIR_NAME, "APPEND_SYSTEM.md");
}

/**
 * Read the global append-system file verbatim. A missing file reads as an empty
 * string so the editor can present a blank document without special-casing.
 */
export function readAppendSystemPrompt(agentDir: string = getAgentDir()): AppendSystemPromptState {
  const path = getAppendSystemPromptPath(agentDir);
  if (!existsSync(path)) {
    return { path, content: "", exists: false, maxBytes: MAX_APPEND_SYSTEM_BYTES };
  }
  return { path, content: readFileSync(path, "utf8"), exists: true, maxBytes: MAX_APPEND_SYSTEM_BYTES };
}

/**
 * Replace the global append-system file atomically (0600). The target path is
 * derived from `agentDir` alone — no caller-supplied path is accepted — and the
 * contents are written byte-for-byte with no newline normalization. Writing an
 * empty string creates an empty file rather than deleting it.
 */
export function writeAppendSystemPrompt(
  content: string,
  agentDir: string = getAgentDir(),
): AppendSystemPromptState {
  const bytes = appendSystemPromptByteLength(content);
  if (bytes > MAX_APPEND_SYSTEM_BYTES) {
    throw new AppendSystemContentTooLargeError(bytes);
  }
  const path = getAppendSystemPromptPath(agentDir);
  mkdirSync(dirname(path), { recursive: true });
  writePrivateFileAtomicSync(path, content);
  return { path, content, exists: true, maxBytes: MAX_APPEND_SYSTEM_BYTES };
}

/**
 * Read-only probe of the project-level override. Returns `null` when the file
 * does not exist; otherwise reports whether pi currently trusts the project
 * (an untrusted project file is ignored and the global file still wins).
 */
export function detectProjectAppendSystemOverride(
  cwd: string,
  agentDir: string = getAgentDir(),
): ProjectAppendSystemOverride | null {
  if (!cwd) return null;
  const path = getProjectAppendSystemPromptPath(cwd);
  if (!existsSync(path)) return null;
  const status = getProjectTrustStatus(cwd, agentDir);
  return { path, trusted: status.trusted };
}
