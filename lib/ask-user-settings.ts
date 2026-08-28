import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "./atomic-file";

export interface AskUserSettings {
  askUser: boolean;
}

type StoredAskUserSettings = Record<string, unknown> & {
  version?: unknown;
  askUser?: unknown;
};

export function getAskUserSettingsPath(agentDir = getAgentDir()): string {
  return join(agentDir, "pi-web-settings.json");
}

function readStoredSettings(settingsPath: string): StoredAskUserSettings {
  if (!existsSync(settingsPath)) return {};
  const parsed: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid pi-web settings: expected an object");
  }
  return parsed as StoredAskUserSettings;
}

/**
 * The persisted ask_user preference, or `undefined` when the user has never
 * touched it (the default applies).
 */
export function readAskUserSetting(settingsPath = getAskUserSettingsPath()): boolean | undefined {
  const stored = readStoredSettings(settingsPath);
  const value = stored.askUser;
  return value === true || value === false ? value : undefined;
}

export function writeAskUserSetting(
  enabled: boolean,
  settingsPath = getAskUserSettingsPath(),
): AskUserSettings {
  const stored = readStoredSettings(settingsPath);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writePrivateFileAtomicSync(settingsPath, JSON.stringify({
    ...stored,
    version: 1,
    askUser: enabled,
  }, null, 2));
  return { askUser: enabled };
}

/**
 * Effective on/off state of the ask_user tool: the `PI_WEB_ASK_USER`
 * environment variable wins, then the persisted preference, then the default
 * (on). Read at session creation / extension binding time, so changing the
 * setting takes effect when the session is reloaded.
 */
export function isAskUserEnabled(): boolean {
  const env = process.env.PI_WEB_ASK_USER;
  if (env !== undefined && env !== "") return env === "1" || env.toLowerCase() === "true";
  return readAskUserSetting() ?? true;
}
