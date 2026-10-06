"use client";

import { useSyncExternalStore } from "react";
import {
  subscribeNotifications, getNotificationClientSnapshot, getNotificationServerSnapshot,
  type NotificationClientState,
} from "@/lib/notifications/client";

/** Read-only subscription. AppShell alone owns startNotificationClient()/cleanup. */
export function useNotifications(): NotificationClientState {
  return useSyncExternalStore(subscribeNotifications, getNotificationClientSnapshot, getNotificationServerSnapshot);
}
