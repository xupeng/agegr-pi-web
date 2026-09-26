"use client";

import type { PendingAskUser } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";

export interface AskUserAppFailureProps {
  ask: PendingAskUser;
  onRetry: () => void;
}

/**
 * Degraded `ask_user` presentation, shown only when the app-delivered MCP Apps
 * view cannot load or finish its handshake.
 *
 * It exists so a failed view never reads as "the question was lost": it renders
 * the open questions from client state (`props.ask.questions`, never the failed
 * projection) as plain text, explains that the ask is still open, and offers
 * retry as its single control. It is deliberately read-only — no input, no
 * submit, no cancel — so it cannot answer the ask. The ask stays open, and the
 * client-side 3s state poll removes or replaces this state if it is closed or
 * superseded elsewhere.
 */
export function AskUserAppFailure({ ask, onRetry }: AskUserAppFailureProps) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      style={{
        width: "100%",
        maxWidth: 820,
        margin: "0 auto",
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg-panel)",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ color: "var(--text)", fontSize: "calc(13px + var(--chat-font-size-offset, 0px))", fontWeight: 650 }}>
        {t("chat.askUserAppFailed")}
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: "calc(12.5px + var(--chat-font-size-offset, 0px))", lineHeight: 1.5 }}>
        {t("chat.askUserAppFailedHint")}
      </div>

      <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 12 }}>
        {ask.questions.map((question) => (
          <li
            key={question.id}
            style={{
              minWidth: 0,
              color: "var(--text)",
              fontSize: "calc(13px + var(--chat-font-size-offset, 0px))",
              lineHeight: 1.5,
              overflowWrap: "anywhere",
            }}
          >
            <div style={{ whiteSpace: "pre-wrap" }}>{question.question}</div>
            {question.detail !== undefined && (
              <div
                style={{
                  marginTop: 6,
                  color: "var(--text-muted)",
                  fontSize: "calc(12.5px + var(--chat-font-size-offset, 0px))",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {question.detail}
              </div>
            )}
            {question.multiple === true && (
              <div style={{ marginTop: 4, color: "var(--text-dim)", fontSize: "calc(12px + var(--chat-font-size-offset, 0px))" }}>
                {t("chat.askUserAppFailedMultiple")}
              </div>
            )}
            {question.options.length > 0 && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 20, display: "grid", gap: 4 }}>
                {question.options.map((option) => (
                  <li
                    key={option.value}
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "calc(12.5px + var(--chat-font-size-offset, 0px))",
                      lineHeight: 1.5,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {option.label}
                    {option.detail !== undefined && (
                      <span style={{ color: "var(--text-dim)" }}> — {option.detail}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <div>
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: "7px 16px",
            borderRadius: 7,
            border: "1px solid var(--accent)",
            background: "var(--bg)",
            color: "var(--text)",
            cursor: "pointer",
            fontSize: "calc(13px + var(--chat-font-size-offset, 0px))",
          }}
        >
          {t("chat.askUserAppFailedRetry")}
        </button>
      </div>
    </div>
  );
}
