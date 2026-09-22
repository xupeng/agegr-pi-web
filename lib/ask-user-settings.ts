import {
  getPiWebSettingsPath,
  readPiWebSettings,
  writePiWebSettings,
} from "./pi-web-settings";

export interface AskUserSettings {
  askUser: boolean;
}

/** Path of the shared pi-web settings file that stores the ask_user preference. */
export const getAskUserSettingsPath = getPiWebSettingsPath;

/**
 * The persisted ask_user preference, or `undefined` when the user has never
 * touched it (the default applies).
 */
export function readAskUserSetting(settingsPath = getPiWebSettingsPath()): boolean | undefined {
  const stored = readPiWebSettings(settingsPath);
  const value = stored.askUser;
  return value === true || value === false ? value : undefined;
}

export function writeAskUserSetting(
  enabled: boolean,
  settingsPath = getPiWebSettingsPath(),
): AskUserSettings {
  writePiWebSettings({ askUser: enabled }, settingsPath);
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
