import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "./atomic-file";

/** Absolute path of the shared `~/.pi/agent/pi-web-settings.json` file. */
export function getPiWebSettingsPath(agentDir = getAgentDir()): string {
  return join(agentDir, "pi-web-settings.json");
}

/**
 * Read the shared pi-web settings object. A missing file reads as `{}`; a file
 * that is not a JSON object throws so callers can decide whether to fall back.
 */
export function readPiWebSettings(settingsPath = getPiWebSettingsPath()): Record<string, unknown> {
  if (!existsSync(settingsPath)) return {};
  const parsed: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid pi-web settings: expected an object");
  }
  return parsed as Record<string, unknown>;
}

/**
 * Merge `patch` into the shared pi-web settings file with an atomic
 * private-mode write, preserving every unknown field already on disk.
 */
export function writePiWebSettings(
  patch: Record<string, unknown>,
  settingsPath = getPiWebSettingsPath(),
): Record<string, unknown> {
  const stored = readPiWebSettings(settingsPath);
  mkdirSync(dirname(settingsPath), { recursive: true });
  const next = { ...stored, version: 1, ...patch };
  writePrivateFileAtomicSync(settingsPath, JSON.stringify(next, null, 2));
  return next;
}
