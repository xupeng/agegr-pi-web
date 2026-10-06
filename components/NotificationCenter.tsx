"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatRelativeTime } from "@/lib/i18n/format";
import { openStackedDialog } from "@/lib/stacked-dialog";
import type { NotificationItem } from "@/lib/notifications/types";
import type { NotificationClientState } from "@/lib/notifications/client";

interface Props {
  state: NotificationClientState;
  onClose: () => void;
  onNavigate: (item: NotificationItem) => Promise<void>;
  onAcknowledgeAll: () => Promise<void>;
  onRefresh: () => Promise<void>;
  top?: number;
  anchorRef?: RefObject<HTMLElement | null>;
}

export function sortNotificationItems(items: readonly NotificationItem[]): NotificationItem[] {
  return [...items].sort((a, b) => {
    const priority = Number(a.kind === "completion") - Number(b.kind === "completion");
    return priority || Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id);
  });
}

export interface NotificationAnchorRect {
  left: number;
  width: number;
  top: number;
}

export interface NotificationCenterBox {
  left: number;
  top: number;
  width: number;
}

export const NOTIFICATION_CENTER_MAX_WIDTH = 460;
export const NOTIFICATION_CENTER_GAP = 12;

/**
 * Desktop geometry for the summary overlay. The anchor is the real chat column
 * (measured in AppShell), so centering never guesses sidebar/file-panel widths.
 * A visible positive-width column always wins over a preferred reading width:
 * never expand across a sidebar to meet a minimum. Intersect its padded bounds
 * with the viewport's padded bounds. Only an unavailable/nonvisible column
 * falls back to a viewport-centered panel.
 */
export function computeNotificationCenterBox(
  anchor: NotificationAnchorRect | null,
  viewport: { width: number },
  fallbackTop: number,
): NotificationCenterBox {
  const viewportWidth = Math.max(0, viewport.width);
  const available = Math.max(0, viewportWidth - NOTIFICATION_CENTER_GAP * 2);
  const usable = anchor && Number.isFinite(anchor.left) && Number.isFinite(anchor.width)
    && Number.isFinite(anchor.top) && anchor.width > 0
    && anchor.left < viewportWidth && anchor.left + anchor.width > 0 ? anchor : null;
  const minLeft = usable ? Math.max(NOTIFICATION_CENTER_GAP, usable.left + NOTIFICATION_CENTER_GAP) : NOTIFICATION_CENTER_GAP;
  const right = usable ? Math.min(viewportWidth - NOTIFICATION_CENTER_GAP, usable.left + usable.width - NOTIFICATION_CENTER_GAP) : viewportWidth - NOTIFICATION_CENTER_GAP;
  const width = Math.min(NOTIFICATION_CENTER_MAX_WIDTH, usable ? Math.max(0, right - minLeft) : available);
  const center = usable ? usable.left + usable.width / 2 : viewportWidth / 2;
  const maxLeft = Math.max(right - width, minLeft);
  // If padding itself cannot fit, keep a zero-width box in the visible column
  // rather than expanding it or putting its origin outside the viewport.
  const left = usable && right < minLeft
    ? Math.min(Math.max(center, Math.max(0, usable.left)), Math.min(viewportWidth, usable.left + usable.width))
    : Math.min(Math.max(center - width / 2, minLeft), maxLeft);
  return { left, top: usable ? usable.top : fallbackTop, width };
}

/** Summary-only surface: no permissions, agent commands, or pending interaction controls. */
export function NotificationCenter({ state, onClose, onNavigate, onAcknowledgeAll, onRefresh, top = 48, anchorRef }: Props) {
  const { t, locale } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [limit, setLimit] = useState(100);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [box, setBox] = useState<NotificationCenterBox | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const anchor = anchorRef?.current ?? null;
    const update = () => {
      const rect = anchor?.getBoundingClientRect();
      setBox(computeNotificationCenterBox(
        rect && rect.width > 0 ? { left: rect.left, top: rect.top, width: rect.width } : null,
        { width: window.innerWidth },
        top,
      ));
    };
    update();
    let observer: ResizeObserver | null = null;
    if (anchor && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(anchor);
    }
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [anchorRef, top]);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Capture the bell BEFORE showModal() moves focus into the native dialog.
    const cleanup = openStackedDialog(document, dialog, () => closeRef.current());
    dialog.showModal();
    dialog.focus({ preventScroll: true });
    return () => { dialog.close(); cleanup(); };
  }, []);
  const ordered = sortNotificationItems(state.snapshot.items);
  const completions = ordered.filter((item) => item.kind === "completion").length;
  const perform = async (operation: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try { await operation(); } catch { setActionError(fallback); }
    finally { setBusy(false); }
  };
  const loading = state.loading || !state.snapshot.instanceId;
  return (
    <dialog
      ref={dialogRef}
      className="notification-center"
      aria-labelledby="notification-center-title"
      aria-describedby="notification-center-batch-hint"
      tabIndex={-1}
      style={{
        "--notification-center-top": `${box?.top ?? top}px`,
        "--notification-center-left": box ? `${box.left}px` : "50%",
        "--notification-center-width": box ? `${box.width}px` : "min(460px, calc(100vw - 24px))",
        "--notification-center-shift": box ? "none" : "translateX(-50%)",
      } as CSSProperties}
      onCancel={(event) => { event.preventDefault(); closeRef.current(); }}
      onClick={(event) => { if (event.target === event.currentTarget) closeRef.current(); }}
    >
      <header className="notification-center-header">
        <h2 id="notification-center-title">{t("notifications.title", { count: ordered.length })}</h2>
        <button type="button" className="notification-center-close" onClick={onClose} aria-label={t("notifications.close")}>
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <div className="notification-center-actions">
        <button type="button" disabled={busy || !completions} onClick={() => void perform(onAcknowledgeAll, "notifications.ackFailed")}>
          {t("notifications.ackAll")}
        </button>
        <button type="button" disabled={busy} onClick={() => void perform(onRefresh, "notifications.syncFailed")}>
          {t("notifications.refresh")}
        </button>
        <p id="notification-center-batch-hint">{t("notifications.batchHint")}</p>
      </div>
      <div className="notification-center-list" aria-busy={busy || state.loading}>
        {(state.error || actionError) && <p role="alert">{t(actionError ?? (state.error === "legacy-import-failed" ? "notifications.importFailed" : state.error === "ack-failed" ? "notifications.ackFailed" : "notifications.syncFailed"))}</p>}
        {!state.connected && state.snapshot.instanceId && <p role="status">{t("notifications.disconnected")}</p>}
        {state.snapshot.storageHealth === "degraded" && <p role="status">{t("notifications.storageDegraded")}</p>}
        {loading && <p role="status">{t("notifications.loading")}</p>}
        {!loading && ordered.length === 0 && <p className="notification-center-empty" role="status">{t("notifications.empty")}</p>}
        <ul>
          {ordered.slice(0, limit).map((item, index) => (
            <li key={item.id}>
              {(index === 0 || (ordered[index - 1].kind === "completion") !== (item.kind === "completion")) && (
                <h3>{t(item.kind === "completion" ? "notifications.completions" : "notifications.waiting")}</h3>
              )}
              <button type="button" className="notification-center-item" disabled={busy}
                onClick={() => void perform(() => onNavigate(item), "notifications.navigationFailed")}>
                <span className="notification-center-item-heading">
                  <span>{item.sessionName}</span>
                  <span className="notification-center-kind">{t(`notifications.kind.${item.kind}`)}</span>
                </span>
                <span className="notification-center-item-meta">
                  <span>{item.projectName}</span>
                  <time dateTime={item.timestamp}>{formatRelativeTime(item.timestamp, locale)}</time>
                </span>
                <span className="notification-center-summary">{item.summary}</span>
                {item.kind === "completion" && !item.resultEntryId && <span className="notification-center-item-meta">{t("notifications.resultUnavailable")}</span>}
                {item.kind === "completion" && item.origin === "legacy-import" && <span className="notification-center-item-meta">{t("notifications.legacy")}</span>}
              </button>
            </li>
          ))}
        </ul>
        {ordered.length > limit && <button type="button" className="notification-center-more" onClick={() => setLimit((value) => value + 100)}>{t("notifications.showMore")}</button>}
      </div>
    </dialog>
  );
}
