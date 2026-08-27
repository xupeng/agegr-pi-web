import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { writePrivateFileAtomicSync } from "./atomic-file";

export interface ExtensionUiVisibilitySettings {
  hiddenWidgetKeys: string[];
  hiddenStatusKeys: string[];
}

interface StoredExtensionUiVisibilitySettings extends Record<string, unknown> {
  version?: unknown;
  hiddenWidgetKeys?: unknown;
  hiddenStatusKeys?: unknown;
}

const DEFAULT_SETTINGS: ExtensionUiVisibilitySettings = {
  hiddenWidgetKeys: ["powerline-*"],
  hiddenStatusKeys: [],
};

const globalSettings = globalThis as typeof globalThis & {
  __piExtensionUiVisibilitySettingsCache?: {
    path: string;
    settings: ExtensionUiVisibilitySettings;
  };
};

export function getExtensionUiSettingsPath(agentDir = getAgentDir()): string {
  return join(agentDir, "pi-web-extension-ui.json");
}

function cloneSettings(settings: ExtensionUiVisibilitySettings): ExtensionUiVisibilitySettings {
  return {
    hiddenWidgetKeys: [...settings.hiddenWidgetKeys],
    hiddenStatusKeys: [...settings.hiddenStatusKeys],
  };
}

function readStoredSettings(settingsPath: string): StoredExtensionUiVisibilitySettings {
  if (!existsSync(settingsPath)) return {};
  const parsed: unknown = JSON.parse(readFileSync(settingsPath, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid extension UI settings: expected an object");
  }
  return parsed as StoredExtensionUiVisibilitySettings;
}

export function normalizeExtensionUiKeyRules(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((rule) => typeof rule !== "string")) {
    throw new Error(`${field} must be an array of strings`);
  }

  const normalized = value.map((rule) => rule.trim());
  const seen = new Set<string>();
  for (const rule of normalized) {
    if (!rule) throw new Error(`${field} cannot contain an empty rule`);
    const wildcard = rule.indexOf("*");
    if (
      rule === "*"
      || (wildcard !== -1 && (wildcard !== rule.length - 1 || rule.lastIndexOf("*") !== wildcard))
    ) {
      throw new Error(`${field} rules must be exact keys or prefixes ending in *`);
    }
    if (seen.has(rule)) throw new Error(`${field} cannot contain duplicate rules`);
    seen.add(rule);
  }
  return normalized;
}

function parseSettings(stored: StoredExtensionUiVisibilitySettings): ExtensionUiVisibilitySettings {
  if (stored.hiddenWidgetKeys === undefined && stored.hiddenStatusKeys === undefined) {
    return cloneSettings(DEFAULT_SETTINGS);
  }
  return {
    hiddenWidgetKeys: normalizeExtensionUiKeyRules(stored.hiddenWidgetKeys, "hiddenWidgetKeys"),
    hiddenStatusKeys: normalizeExtensionUiKeyRules(stored.hiddenStatusKeys, "hiddenStatusKeys"),
  };
}

export function readExtensionUiVisibilitySettings(
  settingsPath = getExtensionUiSettingsPath(),
): ExtensionUiVisibilitySettings {
  const cached = globalSettings.__piExtensionUiVisibilitySettingsCache;
  if (cached?.path === settingsPath) return cloneSettings(cached.settings);

  const settings = parseSettings(readStoredSettings(settingsPath));
  globalSettings.__piExtensionUiVisibilitySettingsCache = {
    path: settingsPath,
    settings,
  };
  return cloneSettings(settings);
}

export function writeExtensionUiVisibilitySettings(
  settings: ExtensionUiVisibilitySettings,
  settingsPath = getExtensionUiSettingsPath(),
): ExtensionUiVisibilitySettings {
  const normalized: ExtensionUiVisibilitySettings = {
    hiddenWidgetKeys: normalizeExtensionUiKeyRules(settings.hiddenWidgetKeys, "hiddenWidgetKeys"),
    hiddenStatusKeys: normalizeExtensionUiKeyRules(settings.hiddenStatusKeys, "hiddenStatusKeys"),
  };
  const stored = readStoredSettings(settingsPath);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writePrivateFileAtomicSync(settingsPath, JSON.stringify({
    ...stored,
    version: 1,
    ...normalized,
  }, null, 2));
  globalSettings.__piExtensionUiVisibilitySettingsCache = {
    path: settingsPath,
    settings: normalized,
  };
  return cloneSettings(normalized);
}

export function matchesExtensionUiKeyRule(key: string, rules: readonly string[]): boolean {
  return rules.some((rule) => (
    rule.endsWith("*") ? key.startsWith(rule.slice(0, -1)) : key === rule
  ));
}

export function isExtensionWidgetVisible(key: string): boolean {
  return !matchesExtensionUiKeyRule(
    key,
    readExtensionUiVisibilitySettings().hiddenWidgetKeys,
  );
}

export function isExtensionStatusVisible(key: string): boolean {
  return !matchesExtensionUiKeyRule(
    key,
    readExtensionUiVisibilitySettings().hiddenStatusKeys,
  );
}

export function clearExtensionUiVisibilitySettingsCache(): void {
  delete globalSettings.__piExtensionUiVisibilitySettingsCache;
}
