"use client";

import { useState, type ReactNode } from "react";
import { useI18n } from "@/hooks/useI18n";
import { copyText } from "@/lib/clipboard";
import { getFileCategory, getFileExt } from "@/lib/file-types";
import { getFileName } from "@/lib/file-paths";
import type { WrittenFile } from "@/lib/turn-written-files";
import { getFileIcon } from "./FileIcons";

/**
 * Opens a file in the right-hand viewer. The optional second argument is the
 * minimal extension of the existing `onOpenFile` channel: `modeHint: "diff"`
 * reuses the tab machinery the file explorer already drives, and
 * `sourceSessionId` lets `/api/files` authorize a subagent-written path through
 * the child session that references it.
 */
export type OpenWrittenFileHandler = (
  filePath: string,
  options?: { modeHint?: "diff"; sourceSessionId?: string },
) => void;

const ADDED_COLOR = "#4ade80";
const REMOVED_COLOR = "#f87171";

function ActionButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "3px 8px",
        border: "1px solid var(--border)",
        borderRadius: 6,
        background: "var(--bg)",
        color: "var(--text-muted)",
        cursor: "pointer",
        fontSize: "calc(11px + var(--chat-font-size-offset, 0px))",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Lists the files a turn actually wrote, as cards that open in the preview pane.
 * Entries come from the turn's successful write/edit/apply_patch/subagent tool
 * calls — the reply text is never scanned for paths.
 *
 * `+N/-M` is shown only when the source proves a per-turn count (apply_patch
 * previews and edit patches). A file whose count is unknown shows no number at
 * all, never a differently-scoped git working-tree value (decision D5).
 */
export function TurnWrittenFiles({ files, onOpenFile }: {
  files: WrittenFile[];
  onOpenFile?: OpenWrittenFileHandler;
}) {
  const { t } = useI18n();
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  if (files.length === 0) return null;

  // A group total only makes sense when every entry contributes a number.
  const allCounted = files.every((file) => file.added !== undefined && file.removed !== undefined);
  const totalAdded = allCounted ? files.reduce((sum, file) => sum + (file.added ?? 0), 0) : 0;
  const totalRemoved = allCounted ? files.reduce((sum, file) => sum + (file.removed ?? 0), 0) : 0;

  const copyPath = (filePath: string) => {
    copyText(filePath).then(() => {
      setCopiedPath(filePath);
      setTimeout(() => {
        setCopiedPath((current) => (current === filePath ? null : current));
      }, 1500);
    }).catch(() => {});
  };

  return (
    <section
      aria-label={t("chat.filesWritten")}
      style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: "calc(11px + var(--chat-font-size-offset, 0px))",
          color: "var(--text-dim)",
        }}
      >
        <span>{t("chat.writtenFilesCount", { count: files.length })}</span>
        {allCounted && (
          <span style={{ display: "inline-flex", gap: 6, fontFamily: "var(--font-mono)" }}>
            <span style={{ color: ADDED_COLOR }}>+{totalAdded}</span>
            <span style={{ color: REMOVED_COLOR }}>-{totalRemoved}</span>
          </span>
        )}
      </div>

      {files.map(({ filePath, added, removed, sourceSessionId }) => {
        const name = getFileName(filePath);
        const typeLabel = t(`chat.fileType.${getFileCategory(filePath)}`);
        const ext = getFileExt(filePath).toUpperCase();
        const hasCounts = added !== undefined || removed !== undefined;
        const actionsOpen = actionsFor === filePath;
        const openOptions = sourceSessionId ? { sourceSessionId } : undefined;

        return (
          <div
            key={filePath}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-subtle)",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                type="button"
                title={filePath}
                aria-label={t("chat.openWrittenFile", { name })}
                onClick={() => onOpenFile?.(filePath, openOptions)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flex: 1,
                  minWidth: 0,
                  padding: "7px 10px",
                  border: "none",
                  background: "none",
                  color: "var(--text)",
                  cursor: onOpenFile ? "pointer" : "default",
                  textAlign: "left",
                  fontSize: "calc(12px + var(--chat-font-size-offset, 0px))",
                }}
              >
                <span style={{ flexShrink: 0, display: "flex" }}>{getFileIcon(name, 16)}</span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 1 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                  <span style={{ color: "var(--text-dim)", fontSize: "calc(10px + var(--chat-font-size-offset, 0px))" }}>
                    {ext ? `${typeLabel} · ${ext}` : typeLabel}
                  </span>
                </span>
              </button>

              {hasCounts && (
                <span
                  style={{
                    display: "inline-flex",
                    gap: 6,
                    flexShrink: 0,
                    fontFamily: "var(--font-mono)",
                    fontSize: "calc(11px + var(--chat-font-size-offset, 0px))",
                  }}
                >
                  {added !== undefined && <span style={{ color: ADDED_COLOR }}>+{added}</span>}
                  {removed !== undefined && <span style={{ color: REMOVED_COLOR }}>-{removed}</span>}
                </span>
              )}

              <button
                type="button"
                aria-label={t("chat.writtenFileActions")}
                aria-expanded={actionsOpen}
                onClick={() => setActionsFor(actionsOpen ? null : filePath)}
                style={{
                  flexShrink: 0,
                  alignSelf: "stretch",
                  padding: "0 10px",
                  border: "none",
                  background: "none",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  fontSize: "calc(15px + var(--chat-font-size-offset, 0px))",
                  lineHeight: 1,
                }}
              >
                ⋯
              </button>
            </div>

            {actionsOpen && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  padding: "8px 10px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                {onOpenFile && (
                  <>
                    <ActionButton onClick={() => onOpenFile(filePath, openOptions)}>{t("chat.openFilePreview")}</ActionButton>
                    <ActionButton onClick={() => onOpenFile(filePath, { modeHint: "diff", ...openOptions })}>{t("chat.openFileDiff")}</ActionButton>
                  </>
                )}
                <ActionButton onClick={() => copyPath(filePath)}>
                  {copiedPath === filePath ? t("chat.copyFilePathDone") : t("chat.copyFilePath")}
                </ActionButton>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
