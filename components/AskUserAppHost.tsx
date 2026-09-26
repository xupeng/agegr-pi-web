"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import { AskUserView } from "@/lib/ask-user/portable/react/AskUserView";
import type { AskUserViewLabels } from "@/lib/ask-user/portable/react/copy";
import { getLocalePlugin } from "@/lib/i18n/registry";
import { useI18n } from "@/hooks/useI18n";
import type { AskUserAnswer, PendingAskUser } from "@/lib/types";

export interface AskUserAppHostProps {
  ask: PendingAskUser;
  onSubmit: (askId: string, answers: AskUserAnswer[], supplement?: string) => void | Promise<void>;
  onCancel: (askId: string) => void | Promise<void>;
}

/**
 * Host font stack forwarded to the shared view.
 *
 * This is deliberately the `body` stack - the UI stack the native card
 * inherited from the message column - and not `--font-content`, the chat prose
 * stack: `--font-content` lists LXGW WenKai Screen, whose kai glyphs are
 * visibly larger and heavier than the sans the card used, which read as "wrong
 * font / font too large" on a phone. Asking for the UI stack keeps Latin in
 * Oxanium and CJK in the device's own sans (PingFang SC on iOS, Noto Sans CJK
 * elsewhere), exactly like the card did. The value must not be able to break
 * out of the inline style, so only font-stack characters survive.
 */
function readFontFamilyStack(): string {
  if (typeof document === "undefined") return "";
  const raw = getComputedStyle(document.body).fontFamily;
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(/[^A-Za-z0-9 ,'"_-]/g, " ").trim();
  return cleaned.length === 0 || cleaned.length > 300 ? "" : cleaned;
}

/**
 * Pi Web's token mapping for the shared `AskUserView`.
 *
 * The view reads only its own `--pi-ask-*` namespace; this layer maps Pi Web's
 * palette onto it. A variable in the same document resolves against the live
 * theme, so light/dark/mist/rose/pine switch without recomputing anything.
 *
 * `--pi-ask-success` / `--pi-ask-danger` are intentionally not mapped: the
 * component's defaults (`#16a34a` / `#ef4444`) are the values the rest of Pi
 * Web uses for add/remove semantics. `readFontFamilyStack()` is resolved once
 * into `--pi-ask-font-family`; there is no manifest, no unicode-range selection
 * and no font-byte delivery any more.
 */
const PI_ASK_VARIABLE_MAP = {
  "--pi-ask-surface": "var(--bg-panel)",
  "--pi-ask-field": "var(--bg)",
  "--pi-ask-field-hover": "var(--bg-hover)",
  "--pi-ask-border": "var(--border)",
  "--pi-ask-text": "var(--text)",
  "--pi-ask-text-muted": "var(--text-muted)",
  "--pi-ask-text-dim": "var(--text-dim)",
  "--pi-ask-accent": "var(--accent)",
  "--pi-ask-accent-contrast": "var(--accent-contrast)",
  "--pi-ask-max-width": "var(--chat-content-max-width)",
  "--pi-ask-font-size-offset": "var(--chat-font-size-offset, 0px)",
} as const;

/**
 * Pi Web's host adapter for the shared `ask_user` view.
 *
 * It does exactly three things: resolve the 12 display labels from Pi Web's
 * i18n, map Pi Web's tokens onto the `--pi-ask-*` namespace, and forward
 * `onSubmit` / `onCancel` to the existing `submitAsk` / `cancelAsk`. All form
 * behaviour, accessibility and keyboard handling live in `AskUserView`; the
 * mount position and the `key={pendingAsk.askId}` remount contract belong to
 * `ChatWindow`.
 *
 * `data-ask-user-view="shared"` is the single observable marker for "this ask
 * is rendered by the shared React view". The retired `loading` / `apps` /
 * `failed` tri-state described the iframe lifecycle and has no meaning now that
 * there is one synchronous renderer.
 */
export function AskUserAppHost({ ask, onSubmit, onCancel }: AskUserAppHostProps) {
  const { t, locale } = useI18n();

  const labels = useMemo<AskUserViewLabels>(() => {
    const answeredTemplate = getLocalePlugin(locale)?.messages["chat.askUserAnswered"] ?? "{count} of {total} answered";
    return {
      title: t("chat.askUserTitle"),
      answered: answeredTemplate,
      otherPlaceholder: t("chat.askUserOtherPlaceholder"),
      multipleOtherPlaceholder: t("chat.askUserMultipleOtherPlaceholder"),
      supplementTitle: t("chat.askUserSupplementTitle"),
      supplementPlaceholder: t("chat.askUserSupplementPlaceholder"),
      submitted: t("chat.askUserSubmitted"),
      cancelling: t("chat.askUserCancelling"),
      hint: t("chat.askUserHint"),
      cancel: t("chat.cancel"),
      submit: t("chat.submit"),
      actionFailed: t("chat.askUserActionFailed"),
    };
  }, [locale, t]);

  const style = useMemo<CSSProperties>(() => {
    const fontFamily = readFontFamilyStack();
    return {
      width: "100%",
      maxWidth: 820,
      minHeight: 220,
      margin: "0 auto",
      ...PI_ASK_VARIABLE_MAP,
      ...(fontFamily ? { "--pi-ask-font-family": fontFamily } : {}),
    } as CSSProperties;
  }, []);

  return (
    <div data-ask-user-view="shared" style={style}>
      <AskUserView ask={ask} labels={labels} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  );
}
