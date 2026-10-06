import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { writePrivateFileAtomicSync } from "../atomic-file";
import {
  isNotificationCompletionInput, isNotificationSessionId, isNotificationToken,
  NOTIFICATION_SESSION_LIMIT, NOTIFICATION_SUMMARY_LIMIT, NOTIFICATION_WATERMARK_LIMIT,
  type NotificationCompletionItem,
} from "./types";

export type PersistedNotificationCompletion = Omit<NotificationCompletionItem, "projectKey" | "projectName" | "sessionName">;
export interface NotificationWatermark { sessionId: string; runIdentity: string }
export interface NotificationsFile {
  version: 1;
  instanceId: string;
  completions: PersistedNotificationCompletion[];
  watermarks: NotificationWatermark[];
}
const MAX_FILE_BYTES = 40 * 1024 * 1024;
export function notificationsPath(): string { return join(getAgentDir(), "pi-web-notifications.json"); }
export function decodeNotificationsFile(value: unknown): NotificationsFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !isNotificationToken(v.instanceId) || !Array.isArray(v.completions)
    || v.completions.length > NOTIFICATION_SESSION_LIMIT || !Array.isArray(v.watermarks)
    || v.watermarks.length > NOTIFICATION_WATERMARK_LIMIT) return null;
  const completions: PersistedNotificationCompletion[] = [];
  const watermarks: NotificationWatermark[] = [];
  const runBySession = new Map<string, string>();
  const seen = new Set<string>();
  for (const entry of v.completions) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const c = entry as Record<string, unknown>;
    if (!isNotificationCompletionInput({ ...c, completedAt: c.timestamp }) || c.kind !== "completion"
      || c.id !== `completion:${c.sessionId}` || !isNotificationToken(c.revision)
      || (c.origin !== "live" && c.origin !== "legacy-import") || typeof c.summary !== "string"
      || c.summary.length > NOTIFICATION_SUMMARY_LIMIT || seen.has(c.sessionId as string)) return null;
    seen.add(c.sessionId as string);
    // Project only the known fields; do not retain arbitrary persisted payloads.
    completions.push({ kind: "completion", id: c.id as string, sessionId: c.sessionId as string,
      revision: c.revision, runIdentity: c.runIdentity as string, resultEntryId: c.resultEntryId as string | null,
      completionLeafId: c.completionLeafId as string | null, timestamp: c.timestamp as string,
      summary: c.summary, origin: c.origin });
  }
  seen.clear();
  for (const entry of v.watermarks) {
    if (!entry || typeof entry !== "object") return null;
    const w = entry as Record<string, unknown>;
    if (!isNotificationSessionId(w.sessionId) || !isNotificationToken(w.runIdentity) || seen.has(w.sessionId)) return null;
    seen.add(w.sessionId);
    runBySession.set(w.sessionId, w.runIdentity);
    watermarks.push({ sessionId: w.sessionId, runIdentity: w.runIdentity });
  }
  if (completions.some((c) => runBySession.get(c.sessionId) !== c.runIdentity)) return null;
  return { version: 1, instanceId: v.instanceId, completions, watermarks };
}
export function loadNotifications(file = notificationsPath()): NotificationsFile | null {
  try {
    if (statSync(file).size > MAX_FILE_BYTES) throw new Error("Notification file exceeds limit");
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    const decoded = decodeNotificationsFile(parsed);
    if (!decoded) throw new Error("Invalid or unsupported notification file");
    return decoded;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    // Fail closed: the caller must not overwrite an unreadable/unknown original.
    throw error;
  }
}
export function saveNotifications(data: NotificationsFile, file = notificationsPath()): void {
  const contents = JSON.stringify(data);
  if (Buffer.byteLength(contents) > MAX_FILE_BYTES) throw new Error("Notification file exceeds limit");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writePrivateFileAtomicSync(file, contents);
}
