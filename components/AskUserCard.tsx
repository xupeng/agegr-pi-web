"use client";

import { useState } from "react";
import type { AskUserAnswer, AskUserQuestion, PendingAskUser } from "@/lib/types";
import { ASK_USER_OTHER_TEXT_MAX_LENGTH } from "@/lib/ask-user/types";
import { useI18n } from "@/hooks/useI18n";

interface QuestionDraft {
  values: string[];
  otherText: string;
}

export function AskUserCard({
  ask,
  onSubmit,
  onCancel,
}: {
  ask: PendingAskUser;
  onSubmit: (askId: string, answers: AskUserAnswer[], supplement?: string) => void;
  onCancel: (askId: string) => void;
}) {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({});
  const [supplement, setSupplement] = useState("");
  // Locks the card once the user submits/cancels so a card that survives a
  // slow close cannot be edited again; the answers were already delivered.
  const [status, setStatus] = useState<"idle" | "submitting" | "cancelling">("idle");
  const locked = status !== "idle";

  const draftFor = (id: string): QuestionDraft => drafts[id] ?? { values: [], otherText: "" };

  const setDraft = (id: string, patch: Partial<QuestionDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...draftFor(id), ...patch },
    }));
  };

  const toggleOption = (question: AskUserQuestion, value: string) => {
    const draft = draftFor(question.id);
    if (question.multiple === true) {
      const values = draft.values.includes(value)
        ? draft.values.filter((v) => v !== value)
        : [...draft.values, value];
      setDraft(question.id, { values });
      return;
    }
    // Single-answer question: picking an option clears custom text.
    setDraft(question.id, { values: [value], otherText: "" });
  };

  const setOtherText = (question: AskUserQuestion, otherText: string) => {
    // Single-answer question: typing custom text clears the picked option.
    const patch: Partial<QuestionDraft> = question.multiple === true
      ? { otherText }
      : { values: [], otherText };
    setDraft(question.id, patch);
  };

  const answeredCount = ask.questions.filter((q) => {
    const draft = draftFor(q.id);
    return draft.values.length > 0 || draft.otherText.trim() !== "";
  }).length;

  const handleSubmit = () => {
    if (locked) return;
    const answers: AskUserAnswer[] = [];
    for (const question of ask.questions) {
      const draft = draftFor(question.id);
      const values = draft.values;
      const otherText = draft.otherText.trim();
      if (values.length === 0 && otherText === "") continue;
      answers.push({ id: question.id, values, ...(otherText !== "" ? { otherText } : {}) });
    }
    const trimmedSupplement = supplement.trim();
    setStatus("submitting");
    onSubmit(ask.askId, answers, trimmedSupplement === "" ? undefined : trimmedSupplement);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("chat.askUserTitle")}
      style={{
        width: "100%",
        maxWidth: 820,
        margin: "0 auto",
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--bg-panel)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 650 }}>
          {t("chat.askUserTitle")}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
          {t("chat.askUserAnswered", { count: answeredCount, total: ask.questions.length })}
        </div>
      </div>

      <div style={{ padding: "12px 14px", display: "grid", gap: 14 }}>
        {ask.questions.map((question, index) => {
          const draft = draftFor(question.id);
          return (
            <div key={question.id}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: "var(--accent)", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {index + 1}.
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "var(--text)", fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {question.question}
                  </div>
                  {question.detail !== undefined && (
                    <div style={{ marginTop: 2, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                      {question.detail}
                    </div>
                  )}
                </div>
              </div>

              {question.options.length > 0 && (
                <div style={{ marginTop: 8, display: "grid", gap: 6, paddingLeft: 20 }}>
                  {question.options.map((option) => {
                    const selected = draft.values.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleOption(question, option.value)}
                        disabled={locked}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          textAlign: "left",
                          padding: "7px 10px",
                          borderRadius: 7,
                          border: "1px solid var(--border)",
                          background: selected ? "var(--accent)" : "var(--bg)",
                          color: selected ? "#fff" : "var(--text)",
                          cursor: locked ? "default" : "pointer",
                          opacity: locked ? 0.75 : 1,
                          fontSize: 13,
                          lineHeight: 1.4,
                        }}
                      >
                        <span style={{ flexShrink: 0, fontSize: 12, opacity: 0.85 }}>
                          {question.multiple === true
                            ? (selected ? "☑" : "☐")
                            : (selected ? "◉" : "○")}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          {option.label}
                          {option.detail !== undefined && (
                            <span style={{ display: "block", fontSize: 11.5, opacity: 0.8 }}>
                              {option.detail}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ marginTop: 8, paddingLeft: 20 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 7,
                    border: "1px dashed var(--border)",
                    background: "var(--bg)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: 13,
                      textAlign: "center",
                      color: "var(--text-dim)",
                      fontSize: 12,
                    }}
                  >
                    ✎
                  </span>
                  <input
                    type="text"
                    value={draft.otherText}
                    onChange={(event) => setOtherText(question, event.target.value)}
                    disabled={locked}
                    placeholder={
                      question.multiple === true
                        ? t("chat.askUserMultipleOtherPlaceholder")
                        : t("chat.askUserOtherPlaceholder")
                    }
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: "none",
                      background: "transparent",
                      outline: "none",
                      color: "var(--text)",
                      fontSize: 13,
                    }}
                  />
                </div>
              </div>
              {locked && (draft.values.length > 0 || draft.otherText.trim() !== "") && (
                <div style={{ marginTop: 6, paddingLeft: 20, color: "var(--text-muted)", fontSize: 11.5, lineHeight: 1.4 }}>
                  <span style={{ color: "#10b981" }}>✓</span>{" "}
                  {[
                    ...draft.values,
                    ...(draft.otherText.trim() !== "" ? [draft.otherText.trim()] : []),
                  ].join(" · ")}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ padding: "0 14px 12px", borderTop: "1px solid var(--border)" }}>
        <div style={{ margin: "10px 0 6px", color: "var(--text)", fontSize: 12, fontWeight: 600 }}>
          {t("chat.askUserSupplementTitle")}
        </div>
        <textarea
          value={supplement}
          onChange={(event) => setSupplement(event.target.value)}
          disabled={locked}
          placeholder={t("chat.askUserSupplementPlaceholder")}
          rows={2}
          maxLength={ASK_USER_OTHER_TEXT_MAX_LENGTH}
          style={{
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
            resize: "none",
            padding: "8px 10px",
            borderRadius: 7,
            border: "1px dashed var(--border)",
            background: "var(--bg)",
            outline: "none",
            color: "var(--text)",
            fontSize: 13,
            lineHeight: 1.5,
            fontFamily: "inherit",
          }}
        />
      </div>

      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 14px",
          borderTop: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        {locked ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-muted)", fontSize: 12.5 }}>
            <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span>
            {status === "submitting" ? t("chat.askUserSubmitted") : t("chat.askUserCancelling")}
          </div>
        ) : (
          <>
            <div style={{ color: "var(--text-dim)", fontSize: 11.5, lineHeight: 1.45 }}>
              {t("chat.askUserHint")}
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => {
                  if (locked) return;
                  setStatus("cancelling");
                  onCancel(ask.askId);
                }}
                style={{
                  padding: "7px 14px",
                  borderRadius: 7,
                  border: "1px solid var(--border)",
                  background: "var(--bg-panel)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {t("chat.cancel")}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                style={{
                  padding: "7px 16px",
                  borderRadius: 7,
                  border: "1px solid var(--accent)",
                  background: "var(--accent)",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {t("chat.submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
