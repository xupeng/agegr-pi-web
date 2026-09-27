"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { sendAgentCommand } from "@/lib/agent-client";
import type { AppendSystemPromptResponse } from "@/lib/api-types";
import {
  ConfigButton,
  ConfigDetail,
  ConfigDetailActions,
  ConfigDetailHeader,
  ConfigDetailHeaderInfo,
  ConfigDetailStack,
  ConfigField,
  ConfigFooter,
  ConfigPanelShell,
  ConfigSectionTitle,
} from "./SettingsUi";

interface Props {
  cwd?: string | null;
  sessionId?: string | null;
  onClose: () => void;
  onSessionReloaded?: () => void;
  embedded?: boolean;
}

/** `cwd` is only used to probe the read-only project-level override. */
function appendSystemUrl(cwd: string | null): string {
  return cwd ? `/api/append-system?cwd=${encodeURIComponent(cwd)}` : "/api/append-system";
}

export function AppendSystemConfig({
  cwd = null,
  sessionId = null,
  onClose,
  onSessionReloaded,
  embedded = false,
}: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<AppendSystemPromptResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(appendSystemUrl(cwd), { cache: "no-store" });
      const data = await response.json() as AppendSystemPromptResponse & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setState(data);
      setDraft(data.content);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!savedOk) return;
    const timer = setTimeout(() => setSavedOk(false), 2000);
    return () => clearTimeout(timer);
  }, [savedOk]);

  // Match the server's UTF-8 byte limit; `content.length` counts UTF-16 units
  // and would let multi-byte content slip past the 65536-byte boundary.
  const byteLength = useMemo(() => new TextEncoder().encode(draft).length, [draft]);
  const maxBytes = state?.maxBytes ?? 65536;
  const overLimit = byteLength > maxBytes;
  const dirty = state !== null && draft !== state.content;
  const canSave = state !== null && dirty && !overLimit && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const response = await fetch(appendSystemUrl(cwd), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      const data = await response.json() as AppendSystemPromptResponse & { error?: string };
      if (!response.ok || data.error) throw new Error(data.error ?? `HTTP ${response.status}`);
      setState(data);
      setDraft(data.content);
      setSavedOk(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    if (state) setDraft(state.content);
    setError(null);
  };

  const insertExample = () => {
    const example = t("settings.appendSystemExample");
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.length;
    const end = textarea?.selectionEnd ?? draft.length;
    const before = draft.slice(0, start);
    const after = draft.slice(end);
    const leading = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const trailing = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
    const next = `${before}${leading}${example}${trailing}${after}`;
    setDraft(next);
    setSavedOk(false);
    if (textarea) {
      const caret = before.length + leading.length + example.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });
    }
  };

  const reloadSession = async () => {
    if (!sessionId) return;
    setReloading(true);
    setError(null);
    try {
      await sendAgentCommand(sessionId, { type: "reload" });
      onSessionReloaded?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReloading(false);
    }
  };

  return (
    <ConfigPanelShell
      embedded={embedded}
      title={t("settings.appendSystem")}
      subtitle={state?.path}
      closeLabel={t("i18n.close")}
      onClose={onClose}
    >
      <ConfigDetail>
        <ConfigDetailStack className="is-fill">
          <ConfigDetailHeader>
            <ConfigDetailHeaderInfo>
              <span className="config-detail-title">{t("settings.appendSystem")}</span>
              {state && <code className="config-detail-path" title={state.path}>{state.path}</code>}
            </ConfigDetailHeaderInfo>
            <ConfigDetailActions>
              <span className="append-system-counter" aria-live="polite">
                {t("settings.appendSystemBytes", { used: byteLength, limit: maxBytes })}
              </span>
            </ConfigDetailActions>
          </ConfigDetailHeader>

          <p className="settings-general-description">{t("settings.appendSystemDescription")}</p>

          <ConfigField label={t("settings.appendSystemEditorLabel")}>
            <textarea
              ref={textareaRef}
              className="append-system-editor"
              aria-label={t("settings.appendSystemEditorLabel")}
              value={draft}
              disabled={loading || saving}
              spellCheck={false}
              rows={14}
              onChange={(event) => {
                setDraft(event.target.value);
                setSavedOk(false);
              }}
            />
          </ConfigField>

          <div className="append-system-toolbar">
            <ConfigButton size="small" onClick={insertExample} disabled={loading || saving}>
              {t("settings.appendSystemExampleButton")}
            </ConfigButton>
            {overLimit && <span role="alert" className="settings-general-error">{t("settings.appendSystemOverLimit")}</span>}
            {loading && <span className="settings-general-description">{t("settings.appendSystemLoading")}</span>}
          </div>

          <section className="append-system-block">
            <ConfigSectionTitle>{t("settings.appendSystemScopeTitle")}</ConfigSectionTitle>
            <ul className="append-system-scope-list">
              <li>{t("settings.appendSystemScopeNormal")}</li>
              <li>{t("settings.appendSystemScopeChatOnly")}</li>
              <li>{t("settings.appendSystemScopeSubagent")}</li>
            </ul>
            <div className="append-system-reload">
              <span role="status">{t("settings.appendSystemReloadHint")}</span>
              {sessionId && (
                <ConfigButton
                  size="small"
                  onClick={() => void reloadSession()}
                  disabled={reloading || saving}
                >
                  {reloading ? t("agents.reloading") : t("agents.reloadSession")}
                </ConfigButton>
              )}
            </div>
          </section>

          {state?.projectOverride && (
            <section className="append-system-block">
              <ConfigSectionTitle>{t("settings.appendSystemProjectOverrideTitle")}</ConfigSectionTitle>
              <p className={`append-system-override${state.projectOverride.trusted ? " is-active" : ""}`}>
                {state.projectOverride.trusted
                  ? t("settings.appendSystemProjectOverrideActive", { path: state.projectOverride.path })
                  : t("settings.appendSystemProjectOverrideUntrusted", { path: state.projectOverride.path })}
              </p>
              <p className="settings-general-description">{t("settings.appendSystemProjectOverrideReadOnly")}</p>
            </section>
          )}

          {state && !state.exists && (
            <p className="settings-general-description">{t("settings.appendSystemMissing")}</p>
          )}
        </ConfigDetailStack>
      </ConfigDetail>
      <ConfigFooter status={error && <span role="alert">{error}</span>}>
        {dirty && (
          <ConfigButton size="small" onClick={discard} disabled={saving}>
            {t("settings.appendSystemDiscard")}
          </ConfigButton>
        )}
        <ConfigButton
          variant="primary"
          onClick={() => void save()}
          disabled={!canSave}
          className={savedOk ? "is-success" : undefined}
        >
          {savedOk && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="config-button-success-icon" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          <span>{savedOk ? t("i18n.saved") : saving ? t("settings.appendSystemSaving") : t("settings.appendSystemSave")}</span>
        </ConfigButton>
      </ConfigFooter>
    </ConfigPanelShell>
  );
}
