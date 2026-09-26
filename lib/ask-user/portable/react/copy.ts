/**
 * Bundled display copy for {@link AskUserView}.
 *
 * These are the three locales the view ships with. A host either takes a
 * bundled table as-is (`locale` prop) or overlays individual keys
 * (`labels` prop). Pi Web overlays every key with its own `lib/i18n`
 * translations and therefore never reads the bundled table; Personal
 * Assistant uses the bundled table untouched.
 *
 * The bundled text is a one-time transcription of
 * `lib/i18n/messages/{en,zh-CN,zh-TW}.ts:394-403` (plus `chat.cancel` /
 * `chat.submit`). It is deliberately **not** a synced source of truth: each
 * side's text has exactly one owner, so the two may drift in wording without
 * either side being wrong. See `README.md` for why.
 */

/** Locales the bundled copy provides. */
export const ASK_USER_VIEW_LOCALES = ["en", "zh-CN", "zh-TW"] as const;

/** One of {@link ASK_USER_VIEW_LOCALES}. */
export type AskUserViewLocale = (typeof ASK_USER_VIEW_LOCALES)[number];

/** Every string the view renders; a host may override any subset. */
export interface AskUserViewLabels {
  /** Dialog title and `aria-label`. */
  title: string;
  /** Counter template; contains the `{count}` and `{total}` placeholders. */
  answered: string;
  /** Placeholder + `aria-label` of a single-choice question's custom input. */
  otherPlaceholder: string;
  /** Placeholder + `aria-label` of a multiple-choice question's custom input. */
  multipleOtherPlaceholder: string;
  /** Label of the free-text supplement block and its `aria-label`. */
  supplementTitle: string;
  /** Placeholder of the supplement textarea. */
  supplementPlaceholder: string;
  /** Locked status after a submit. */
  submitted: string;
  /** Locked status after a cancel. */
  cancelling: string;
  /** Footer hint shown while the form is editable. */
  hint: string;
  /** Cancel button. */
  cancel: string;
  /** Submit button. */
  submit: string;
  /** Error shown when a submit/cancel callback rejected; the form unlocks. */
  actionFailed: string;
}

/** Locale used when the `locale` prop is omitted. */
export const DEFAULT_ASK_USER_VIEW_LOCALE: AskUserViewLocale = "en";

const EN: AskUserViewLabels = {
  title: "Questions from the agent",
  answered: "{count} of {total} answered",
  otherPlaceholder: "Type your own answer…",
  multipleOtherPlaceholder: "Add details (kept alongside the selected options)…",
  supplementTitle: "Additional info (optional)",
  supplementPlaceholder: "Anything else the agent should know…",
  submitted: "Submitted — delivering your answers…",
  cancelling: "Cancelling…",
  hint: "Answers are delivered to the agent as a follow-up message; questions you leave blank are reported as unanswered.",
  cancel: "Cancel",
  submit: "Submit",
  actionFailed: "The ask action failed. You can try again.",
};

const ZH_CN: AskUserViewLabels = {
  title: "来自 agent 的问题",
  answered: "已答 {count}/{total}",
  otherPlaceholder: "输入你自己的答案…",
  multipleOtherPlaceholder: "补充说明（可与所选选项同时提交）…",
  supplementTitle: "补充信息（可选）",
  supplementPlaceholder: "补充问题之外的信息…",
  submitted: "已提交，正在发送你的答案…",
  cancelling: "取消中…",
  hint: "答案会作为后续消息发给 agent；留空的问题会被标记为未回答。",
  cancel: "取消",
  submit: "提交",
  actionFailed: "提问操作失败，可以重试。",
};

const ZH_TW: AskUserViewLabels = {
  title: "來自 agent 的問題",
  answered: "已回答 {count}/{total}",
  otherPlaceholder: "輸入你自己的答案…",
  multipleOtherPlaceholder: "補充說明（可與所選選項同時提交）…",
  supplementTitle: "補充資訊（可選）",
  supplementPlaceholder: "補充問題之外的其他資訊…",
  submitted: "已提交，正在發送你的答案…",
  cancelling: "取消中…",
  hint: "答案會以後續訊息送給 agent；留空的問題會被標記為未回答。",
  cancel: "取消",
  submit: "送出",
  actionFailed: "提問操作失敗，可以再試一次。",
};

const TABLES: Record<AskUserViewLocale, AskUserViewLabels> = {
  en: EN,
  "zh-CN": ZH_CN,
  "zh-TW": ZH_TW,
};

/**
 * The full label set for one locale. Returns a copy so a caller cannot mutate
 * the bundled table for every later render.
 */
export function askUserViewLabels(locale: AskUserViewLocale): AskUserViewLabels {
  return { ...TABLES[locale] };
}
