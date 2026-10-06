import type { PendingAskUser } from "../ask-user/types";
import type { BlockingExtensionUiRequest } from "../types";

export interface NotificationCompletionInput {
  sessionId: string;
  runIdentity: string;
  resultEntryId: string | null;
  completionLeafId: string | null;
  completedAt: string;
  summary: string;
}

export interface NotificationDisplayMetadata {
  projectKey: string;
  projectName: string;
  sessionName: string;
}

export interface NotificationCompletionItem extends NotificationDisplayMetadata {
  kind: "completion";
  id: string;
  sessionId: string;
  revision: string;
  runIdentity: string;
  resultEntryId: string | null;
  completionLeafId: string | null;
  timestamp: string;
  summary: string;
  origin: "live" | "legacy-import";
}

export interface NotificationAttentionItem extends NotificationDisplayMetadata {
  kind: "ask" | "extension";
  id: string;
  sessionId: string;
  timestamp: string;
  summary: string;
  requestId: string;
  method?: BlockingExtensionUiRequest["method"];
}

export type NotificationItem = NotificationCompletionItem | NotificationAttentionItem;
export interface NotificationVersion {
  instanceId: string;
  epoch: string;
  sequence: number;
  storageHealth: "ok" | "degraded";
}
export interface NotificationSnapshot extends NotificationVersion {
  items: NotificationItem[];
}
export interface NotificationRuntimeSession {
  sessionId: string;
  cwd: string;
  pendingAsk: PendingAskUser | null;
  extensionRequests: Array<{ request: BlockingExtensionUiRequest; requestedAt: string }>;
}
export interface NotificationAcknowledgement { id: string; revision: string }
export type NotificationCommand =
  | ({ type: "ack" } & NotificationAcknowledgement)
  | { type: "ack_many"; items: NotificationAcknowledgement[] }
  | { type: "import_legacy"; instanceId: string; sessionIds: string[] };

export const NOTIFICATION_BATCH_LIMIT = 200;
export const NOTIFICATION_SESSION_LIMIT = 10_000;
export const NOTIFICATION_WATERMARK_LIMIT = 100_000;
export const NOTIFICATION_SUMMARY_LIMIT = 500;
export function isNotificationToken(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    && !/[\u0000-\u001f\u007f]/.test(value);
}
export function isNotificationSessionId(value: unknown): value is string {
  return isNotificationToken(value) && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value);
}
export function notificationSummary(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NOTIFICATION_SUMMARY_LIMIT);
}
export function isNotificationCompletionInput(value: unknown): value is NotificationCompletionInput {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return isNotificationSessionId(v.sessionId) && isNotificationToken(v.runIdentity)
    && (v.resultEntryId === null || isNotificationToken(v.resultEntryId))
    && (v.completionLeafId === null || isNotificationToken(v.completionLeafId))
    && typeof v.completedAt === "string" && v.completedAt.length <= 64 && Number.isFinite(Date.parse(v.completedAt))
    && typeof v.summary === "string" && v.summary.length <= 100_000;
}
export function decodeNotificationCommand(value: unknown): NotificationCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const ack = (item: unknown): item is NotificationAcknowledgement => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const a = item as Record<string, unknown>;
    return isNotificationToken(a.id) && a.id.startsWith("completion:") && isNotificationToken(a.revision)
      && Object.keys(a).every((key) => key === "id" || key === "revision");
  };
  switch (v.type) {
    case "ack":
      return Object.keys(v).every((key) => ["type", "id", "revision"].includes(key)) && ack({ id: v.id, revision: v.revision })
        ? { type: "ack", id: v.id as string, revision: v.revision as string } : null;
    case "ack_many":
      return Object.keys(v).every((key) => ["type", "items"].includes(key)) && Array.isArray(v.items)
        && v.items.length <= NOTIFICATION_BATCH_LIMIT && v.items.every(ack)
        ? { type: "ack_many", items: v.items.map((item) => ({ ...item })) } : null;
    case "import_legacy":
      return Object.keys(v).every((key) => ["type", "instanceId", "sessionIds"].includes(key)) && isNotificationToken(v.instanceId)
        && Array.isArray(v.sessionIds) && v.sessionIds.length <= NOTIFICATION_BATCH_LIMIT && v.sessionIds.every(isNotificationSessionId)
        ? { type: "import_legacy", instanceId: v.instanceId, sessionIds: [...v.sessionIds] } : null;
    default: return null;
  }
}
