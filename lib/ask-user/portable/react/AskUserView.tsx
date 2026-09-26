/**
 * Host-neutral React view for the `ask_user` questions.
 *
 * The view owns only presentation and the event wiring; every form
 * transition lives in the pure `../view-controller` reducer, and every string
 * comes from `./copy` (bundled default plus per-key host override). A host
 * supplies two command callbacks — `onSubmit` / `onCancel` — and maps its own
 * palette onto the `--pi-ask-*` variables on any ancestor element.
 *
 * Deliberately free of host coupling: no `@/` alias, no `lib/i18n`, no Next,
 * no `node:` import, and no host palette module. React (and `react-dom`) are
 * host-provided peer dependencies.
 */

import { useEffect, useReducer, useRef } from "react";
import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";

import { ASK_USER_OTHER_TEXT_MAX_LENGTH, type AskUserAnswer, type AskUserQuestion } from "../types";
import {
  askUserViewReducer,
  buildAskUserSubmission,
  createAskUserViewState,
  draftFor,
  answeredCount,
  isLocked,
  questionSummary,
  type AskUserViewAction,
  type AskUserViewState,
} from "../view-controller";
import {
  DEFAULT_ASK_USER_VIEW_LOCALE,
  askUserViewLabels,
  type AskUserViewLabels,
  type AskUserViewLocale,
} from "./copy";
import { radioNavigationTarget, radioTabIndex } from "./keyboard";
import { ASK_USER_VIEW_CSS } from "./view-css";

/** The open ask the view renders; the subset of `PendingAskUser` a view needs. */
export interface AskUserViewAsk {
  askId: string;
  questions: AskUserQuestion[];
}

export type AskUserViewSubmitHandler = (
  askId: string,
  answers: AskUserAnswer[],
  supplement?: string,
) => void | Promise<void>;

export type AskUserViewCancelHandler = (askId: string) => void | Promise<void>;

export interface AskUserViewProps {
  /** The open ask. A host should remount with `key={ask.askId}` when it changes. */
  ask: AskUserViewAsk;
  /** Send the assembled `ask_submit` payload. Rejecting unlocks the form for a retry. */
  onSubmit: AskUserViewSubmitHandler;
  /** Send `ask_cancel`. Rejecting unlocks the form for a retry. */
  onCancel: AskUserViewCancelHandler;
  /** Bundled copy to start from; defaults to {@link DEFAULT_ASK_USER_VIEW_LOCALE}. */
  locale?: AskUserViewLocale;
  /** Per-key overrides merged over the bundled table. */
  labels?: Partial<AskUserViewLabels>;
  /** Host-controlled read-only state, independent of the submit/cancel lock. */
  disabled?: boolean;
}

/** Props of the pure render surface, exported so structural tests can seed a state. */
export interface AskUserViewContentProps {
  ask: AskUserViewAsk;
  state: AskUserViewState;
  labels: AskUserViewLabels;
  statusRef: RefObject<HTMLDivElement | null>;
  dispatch: Dispatch<AskUserViewAction>;
  onSubmit: AskUserViewSubmitHandler;
  onCancel: AskUserViewCancelHandler;
  disabled?: boolean;
}

/**
 * Render the form for one ask.
 *
 * `<style>` is inserted by the view itself because the package cannot assume a
 * CSS loader; all selectors are scoped under `.pi-ask`.
 */
export function AskUserView({ ask, onSubmit, onCancel, locale, labels, disabled }: AskUserViewProps) {
  const resolvedLabels = mergeAskUserViewLabels(askUserViewLabels(locale ?? DEFAULT_ASK_USER_VIEW_LOCALE), labels);
  const [state, dispatch] = useReducer(askUserViewReducer, undefined, createAskUserViewState);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const locked = isLocked(state);

  // Disabling every control drops focus onto <body>; move it to the live status
  // row so a keyboard user is not stranded. The row is a programmatic focus
  // target (`tabIndex={-1}`), not a tab stop.
  useEffect(() => {
    if (locked) statusRef.current?.focus();
  }, [locked]);

  return (
    <AskUserViewContent
      ask={ask}
      state={state}
      labels={resolvedLabels}
      statusRef={statusRef}
      dispatch={dispatch}
      onSubmit={onSubmit}
      onCancel={onCancel}
      disabled={disabled === true}
    />
  );
}

/**
 * The hook-free body of {@link AskUserView}. Exported so tests can render a
 * seeded state (a locked form with drafts) with `renderToStaticMarkup`, which
 * cannot drive interactions.
 */
export function AskUserViewContent({
  ask,
  state,
  labels,
  statusRef,
  dispatch,
  onSubmit,
  onCancel,
  disabled,
}: AskUserViewContentProps) {
  const locked = isLocked(state);
  const controlsDisabled = locked || disabled === true;
  const answered = answeredCount(state, ask.questions);

  const handleSubmit = () => {
    if (locked) return;
    dispatch({ type: "submit-requested" });
    const submission = buildAskUserSubmission(state, ask.questions);
    void Promise.resolve(onSubmit(ask.askId, submission.answers, submission.supplement)).catch(() => {
      dispatch({ type: "action-failed", error: labels.actionFailed });
    });
  };

  const handleCancel = () => {
    if (locked) return;
    dispatch({ type: "cancel-requested" });
    void Promise.resolve(onCancel(ask.askId)).catch(() => {
      dispatch({ type: "action-failed", error: labels.actionFailed });
    });
  };

  const moveRadioSelection = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    question: AskUserQuestion,
    selectedIndex: number,
  ) => {
    if (question.multiple === true) return;
    const target = radioNavigationTarget(selectedIndex, event.key, question.options.length);
    if (target === null) return;
    event.preventDefault();
    dispatch({ type: "toggle-option", questionId: question.id, value: question.options[target].value, multiple: false });
    const sibling = event.currentTarget.parentElement?.children[target];
    if (sibling instanceof HTMLElement) sibling.focus();
  };

  return (
    <div
      className="pi-ask"
      role="dialog"
      aria-label={labels.title}
    >
      <style>{ASK_USER_VIEW_CSS}</style>
      <div className="pi-ask-header">
        <div className="pi-ask-title">{labels.title}</div>
        <div className="pi-ask-counter" role="status" aria-live="polite">
          {formatAnswered(labels.answered, answered, ask.questions.length)}
        </div>
      </div>

      <div className="pi-ask-questions">
        {ask.questions.map((question, index) => {
          const questionTextId = `pi-ask-${ask.askId}-q-${index}`;
          const draft = draftFor(state, question.id);
          const multiple = question.multiple === true;
          const selectedIndex = question.options.findIndex((option) => draft.values.includes(option.value));
          const anySelected = selectedIndex >= 0;
          const summary = questionSummary(state, question.id);
          const otherPlaceholder = multiple ? labels.multipleOtherPlaceholder : labels.otherPlaceholder;

          return (
            <div key={question.id} className="pi-ask-question">
              <div className="pi-ask-question-head">
                <span className="pi-ask-index">{index + 1}.</span>
                <div style={{ minWidth: 0 }}>
                  <div className="pi-ask-question-text" id={questionTextId}>
                    {question.question}
                  </div>
                  {question.detail !== undefined && question.detail !== "" && (
                    <div className="pi-ask-detail">
                      {question.detail.split(/\r?\n(?:[\t ]*\r?\n)+/).map((paragraph, paragraphIndex) => (
                        <p key={paragraphIndex}>{paragraph}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div
                className="pi-ask-options"
                role={multiple ? "group" : "radiogroup"}
                aria-labelledby={questionTextId}
              >
                {question.options.map((option, optionIndex) => {
                  const selected = draft.values.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className="pi-ask-option"
                      role={multiple ? "checkbox" : "radio"}
                      aria-checked={selected}
                      tabIndex={multiple ? undefined : radioTabIndex(selected, anySelected, optionIndex)}
                      disabled={controlsDisabled}
                      onClick={() =>
                        dispatch({
                          type: "toggle-option",
                          questionId: question.id,
                          value: option.value,
                          multiple,
                        })
                      }
                      onKeyDown={
                        multiple ? undefined : (event) => moveRadioSelection(event, question, selectedIndex)
                      }
                    >
                      <span className="pi-ask-option-glyph" aria-hidden="true">
                        {multiple ? (selected ? "☑" : "☐") : selected ? "◉" : "○"}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        {option.label}
                        {option.detail !== undefined && option.detail !== "" && (
                          <span className="pi-ask-option-detail">{option.detail}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="pi-ask-other">
                <div className="pi-ask-other-box">
                  <span className="pi-ask-other-icon" aria-hidden="true">
                    ✎
                  </span>
                  <input
                    type="text"
                    className="pi-ask-input"
                    value={draft.otherText}
                    placeholder={otherPlaceholder}
                    aria-label={otherPlaceholder}
                    maxLength={ASK_USER_OTHER_TEXT_MAX_LENGTH}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      dispatch({
                        type: "set-other-text",
                        questionId: question.id,
                        text: event.target.value,
                        multiple,
                      })
                    }
                  />
                </div>
              </div>

              {locked && summary !== "" && (
                <div className="pi-ask-summary">
                  <span className="pi-ask-summary-check" aria-hidden="true">
                    ✓
                  </span>{" "}
                  {summary.startsWith("✓ ") ? summary.slice(2) : summary}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pi-ask-supplement">
        <div className="pi-ask-supplement-title">{labels.supplementTitle}</div>
        <textarea
          className="pi-ask-textarea"
          value={state.supplement}
          placeholder={labels.supplementPlaceholder}
          aria-label={labels.supplementTitle}
          rows={2}
          maxLength={ASK_USER_OTHER_TEXT_MAX_LENGTH}
          disabled={controlsDisabled}
          onChange={(event) => dispatch({ type: "set-supplement", text: event.target.value })}
        />
      </div>

      <div className="pi-ask-footer">
        {locked ? (
          <div
            className="pi-ask-status"
            role="status"
            aria-live="polite"
            tabIndex={-1}
            ref={statusRef}
          >
            <span className="pi-ask-status-check" aria-hidden="true">
              ✓
            </span>
            <span>{state.status === "submitting" ? labels.submitted : labels.cancelling}</span>
          </div>
        ) : (
          <>
            <div className="pi-ask-hint">{labels.hint}</div>
            <div className="pi-ask-actions">
              <button type="button" className="pi-ask-cancel" disabled={controlsDisabled} onClick={handleCancel}>
                {labels.cancel}
              </button>
              <button type="button" className="pi-ask-submit" disabled={controlsDisabled} onClick={handleSubmit}>
                {labels.submit}
              </button>
            </div>
          </>
        )}
        {state.error !== "" && (
          <div className="pi-ask-error" role="alert">
            {state.error}
          </div>
        )}
      </div>
    </div>
  );
}

/** Per-key `labels` overlay; `undefined` keys keep the bundled value. */
function mergeAskUserViewLabels(
  base: AskUserViewLabels,
  overrides: Partial<AskUserViewLabels> | undefined,
): AskUserViewLabels {
  if (overrides === undefined) return base;
  const merged = { ...base };
  for (const key of Object.keys(overrides) as (keyof AskUserViewLabels)[]) {
    const value = overrides[key];
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/** `{count}` / `{total}` interpolation; the placeholders belong to the copy format. */
function formatAnswered(template: string, count: number, total: number): string {
  return template.replace("{count}", String(count)).replace("{total}", String(total));
}
