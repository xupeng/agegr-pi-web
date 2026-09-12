"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import {
  type TrellisHistoryCoverage,
  type TrellisRunMode,
  type TrellisRunStatus,
  type TrellisSubagentRecord,
  type TrellisToolTrace,
} from "@/lib/trellis-subagent-records";

interface Props {
  records: TrellisSubagentRecord[];
  truncated: boolean;
  historyCoverage: TrellisHistoryCoverage;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

const MODE_KEYS: Record<TrellisRunMode, string> = {
  single: "trellisSubagent.mode.single",
  parallel: "trellisSubagent.mode.parallel",
  chain: "trellisSubagent.mode.chain",
  unknown: "trellisSubagent.mode.unknown",
};

const EVIDENCE_KEYS: Record<TrellisSubagentRecord["evidence"], string> = {
  partial: "trellisSubagent.evidence.partial",
  "tool-end": "trellisSubagent.evidence.toolEnd",
  message: "trellisSubagent.evidence.message",
  history: "trellisSubagent.evidence.history",
};

const STATUS_KEYS: Record<TrellisRunStatus, string> = {
  pending: "trellisSubagent.status.pending",
  running: "trellisSubagent.status.running",
  succeeded: "trellisSubagent.status.succeeded",
  failed: "trellisSubagent.status.failed",
  cancelled: "trellisSubagent.status.cancelled",
  unknown: "trellisSubagent.status.unknown",
};

function formatTimestamp(value: number | undefined, locale: string): string | null {
  if (value === undefined) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(locale);
}

function Bounded({ text }: { text: string }) {
  return (
    <pre
      style={{
        margin: 0,
        maxHeight: 220,
        overflow: "auto",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: 1.5,
        color: "var(--text)",
      }}
    >
      {text}
    </pre>
  );
}

function Field({
  label,
  children,
  unavailable,
}: {
  label: string;
  children?: React.ReactNode;
  unavailable?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <span style={{ color: "var(--text-dim)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      {children ?? <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{unavailable}</span>}
    </div>
  );
}

function ToolTraceList({ tools, omitted, t }: { tools: TrellisToolTrace[]; omitted: number; t: Translate }) {
  if (tools.length === 0 && omitted === 0) return null;
  return (
    <Field label={t("trellisSubagent.tools")}>
      <div style={{ display: "grid", gap: 2 }}>
        {tools.map((tool, index) => (
          <div key={`${tool.id}-${index}`} style={{ fontSize: 11, overflowWrap: "anywhere" }}>
            <span style={{ color: "var(--text-dim)" }}>{tool.status}</span>{" "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{tool.name || tool.id}</span>
            {tool.argsExcerpt && <span style={{ color: "var(--text-muted)" }}> · {tool.argsExcerpt}</span>}
          </div>
        ))}
        {omitted > 0 && (
          <div style={{ color: "var(--text-dim)", fontSize: 10 }}>
            {t("trellisSubagent.omittedTools", { count: omitted })}
          </div>
        )}
      </div>
    </Field>
  );
}

function UsageRow({ record, t }: { record: TrellisSubagentRecord; t: Translate }) {
  const usage = record.usage;
  if (!usage) return null;
  const cache = usage.cacheRead !== undefined || usage.cacheWrite !== undefined
    ? (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0)
    : undefined;
  return (
    <Field label={t("trellisSubagent.usage")}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
        {usage.input !== undefined && <span>in {usage.input}</span>}
        {usage.output !== undefined && <span>out {usage.output}</span>}
        {cache !== undefined && <span>cache {cache}</span>}
        {usage.cost !== undefined && <span>cost {usage.cost}</span>}
        {usage.ctxTokens !== undefined && <span>ctx {usage.ctxTokens}</span>}
        {usage.turns !== undefined && <span>turns {usage.turns}</span>}
      </div>
    </Field>
  );
}

export function RecordDetails({ record, locale, t }: { record: TrellisSubagentRecord; locale: string; t: Translate }) {
  const updated = formatTimestamp(record.updatedAt ?? record.finishedAt ?? record.startedAt, locale);
  const displayTruncated = record.labelsTruncated
    || record.promptTruncated
    || record.finalTextTruncated
    || record.tailsTruncated
    || record.errorTruncated
    || record.toolsOmitted > 0
    || record.tools.some((tool) => tool.nameTruncated || tool.argsTruncated)
    || record.omittedByBudget;
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: "10px 12px 12px 42px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
        <span>{t(MODE_KEYS[record.mode])}</span>
        {record.step !== undefined && <span>{t("trellisSubagent.step", { step: record.step })}</span>}
        {record.model && <span>{record.model}</span>}
        {record.thinking && <span>{record.thinking}</span>}
        {updated && <span>{t("trellisSubagent.updated", { time: updated })}</span>}
      </div>
      <div style={{ color: "var(--text-dim)", fontSize: 10 }}>{t("trellisSubagent.snapshotNotice")}</div>
      <div style={{ color: "var(--text-dim)", fontSize: 10 }}>{t("trellisSubagent.upstreamNotice")}</div>
      <Field label={t("trellisSubagent.provenance")}>
        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{t(EVIDENCE_KEYS[record.evidence])}</span>
      </Field>
      {record.stale && <div style={{ color: "#d97706", fontSize: 10 }}>{t("trellisSubagent.stale")}</div>}
      {record.incomplete && <div style={{ color: "var(--text-dim)", fontSize: 10 }}>{t("trellisSubagent.incomplete")}</div>}
      {record.omittedByBudget && (
        <div style={{ color: "var(--text-dim)", fontSize: 10 }}>{t("trellisSubagent.omittedBudget")}</div>
      )}
      <Field label={t("trellisSubagent.prompt")} unavailable={t("trellisSubagent.unavailable")}>
        {record.promptExcerpt ? <Bounded text={record.promptExcerpt} /> : undefined}
      </Field>
      <Field label={t("trellisSubagent.finalResult")} unavailable={t("trellisSubagent.unavailable")}>
        {record.finalText ? <Bounded text={record.finalText} /> : undefined}
      </Field>
      {record.textTail && (
        <Field label={t("trellisSubagent.textTail")}>
          <Bounded text={record.textTail} />
        </Field>
      )}
      {record.thinkingTail && (
        <Field label={t("trellisSubagent.thinkingTail")}>
          <Bounded text={record.thinkingTail} />
        </Field>
      )}
      {record.stderrTail && (
        <Field label={t("trellisSubagent.stderrTail")}>
          <Bounded text={record.stderrTail} />
        </Field>
      )}
      {record.errorExcerpt && (
        <Field label={t("trellisSubagent.error")}>
          <span style={{ fontSize: 11, color: "#dc2626", overflowWrap: "anywhere" }}>{record.errorExcerpt}</span>
        </Field>
      )}
      <ToolTraceList tools={record.tools} omitted={record.toolsOmitted} t={t} />
      <UsageRow record={record} t={t} />
      {displayTruncated && (
        <div style={{ color: "var(--text-dim)", fontSize: 10 }}>{t("trellisSubagent.displayTruncated")}</div>
      )}
    </div>
  );
}

/**
 * Read-only Trellis execution snapshot section. Rows only expand local details;
 * they never select a session, create a fake child or issue session commands.
 */
export function TrellisSubagentRecords({ records, truncated, historyCoverage }: Props) {
  const { t, locale } = useI18n();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (expandedId && !records.some((record) => record.id === expandedId)) {
      setExpandedId(null);
    }
  }, [records, expandedId]);

  if (records.length === 0) return null;

  return (
    <section
      aria-label={t("trellisSubagent.title")}
      data-trellis-subagent-records="true"
      style={{
        background: "var(--bg-panel)",
        borderLeft: "1px solid var(--border)",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderRadius: "0 0 6px 6px",
        boxShadow: "0 10px 28px rgba(0,0,0,0.10)",
        overflow: "hidden",
      }}
    >
      <div style={{ minHeight: 40, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "7px 12px", borderBottom: "1px solid var(--border)" }}>
        <strong style={{ fontSize: 12, fontWeight: 600 }}>{t("trellisSubagent.title")}</strong>
        <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
          {t("trellisSubagent.count", { count: records.length })}
        </span>
        {truncated && <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{t("trellisSubagent.truncated")}</span>}
      </div>
      <div style={{ padding: "6px 12px", color: "var(--text-dim)", fontSize: 10, borderBottom: "1px solid var(--border)" }}>
        {t("trellisSubagent.snapshotNotice")}
        {" · "}
        {historyCoverage === "complete"
          ? t("trellisSubagent.coverage.complete")
          : t("trellisSubagent.coverage.incomplete")}
        {" · "}
        {t("trellisSubagent.notRunning")}
      </div>
      <div style={{ maxHeight: "min(58dvh, 480px)", overflowY: "auto" }}>
        {records.map((record) => {
          const expanded = expandedId === record.id;
          const statusLabel = t(STATUS_KEYS[record.status]);
          return (
            <div key={record.id}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={`${record.agent || record.runId} · ${statusLabel}`}
                onClick={() => setExpandedId(expanded ? null : record.id)}
                style={{
                  width: "100%",
                  minHeight: 52,
                  display: "grid",
                  gridTemplateColumns: "26px minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 9,
                  padding: "7px 12px",
                  border: "none",
                  borderBottom: expanded ? "none" : "1px solid var(--border)",
                  borderLeft: expanded ? "2px solid var(--accent)" : "2px solid transparent",
                  background: expanded ? "var(--bg-selected)" : "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span aria-hidden="true" style={{ width: 26, height: 26, display: "grid", placeItems: "center", color: "var(--accent)" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="7" width="14" height="11" rx="2" /><path d="M9 11h.01M15 11h.01M9 15h6M12 7V4M10 4h4" />
                  </svg>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, fontWeight: expanded ? 600 : 500 }} title={record.agent}>
                    {record.agent || t("trellisSubagent.unavailable")}
                  </span>
                  <span style={{ display: "block", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-dim)", fontSize: 11 }} title={record.promptExcerpt}>
                    {record.promptExcerpt || t("trellisSubagent.unavailable")}
                  </span>
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: 11, whiteSpace: "nowrap" }}>
                  {t("trellisSubagent.lastReported", { status: statusLabel })}
                </span>
              </button>
              {expanded && <RecordDetails record={record} locale={locale} t={t} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
