/**
 * Styles for {@link AskUserView}, exported as one text blob.
 *
 * The package is a `private: true`, TS-direct-load Pi extension, so a host is
 * not guaranteed to have a CSS loader or Tailwind. The component therefore
 * renders its own `<style>` element (the same route the retired iframe view
 * took) and scopes every selector under `.pi-ask`.
 *
 * Contract: only the `--pi-ask-*` namespace is read, each read carries a
 * `light-dark()` / system-font fallback, and a host maps its own tokens onto
 * the namespace on any ancestor element. Nothing here reads a host's internal names
 * (`--bg`, `--text`, …) — a CSS variable in the same document is not untrusted input. Metrics are carried
 * over verbatim from the deleted native card.
 */

/** The component's stylesheet, rendered verbatim inside one `<style>` element. */
export const ASK_USER_VIEW_CSS = `
.pi-ask {
  color-scheme: light dark;
  font-family: var(--pi-ask-font-family, -apple-system, system-ui, "Segoe UI", Roboto, sans-serif);
  width: 100%;
  max-width: var(--pi-ask-max-width, 820px);
  margin: 0 auto;
  border: 1px solid var(--pi-ask-border, light-dark(#d9d9de, #3a3a40));
  border-radius: 10px;
  background: var(--pi-ask-surface, light-dark(#ffffff, #1b1b1d));
  color: var(--pi-ask-text, light-dark(#111114, #ececef));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.pi-ask *, .pi-ask *::before, .pi-ask *::after { box-sizing: border-box; }
.pi-ask button, .pi-ask input, .pi-ask textarea { font-family: inherit; }
.pi-ask :focus-visible {
  outline: 2px solid var(--pi-ask-accent, light-dark(#2f6fed, #a4c2f4));
  outline-offset: 2px;
}

.pi-ask-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--pi-ask-border, light-dark(#d9d9de, #3a3a40));
  background: var(--pi-ask-field, light-dark(#f6f6f7, #232326));
}
.pi-ask-title {
  color: var(--pi-ask-text, light-dark(#111114, #ececef));
  font-size: calc(13px + var(--pi-ask-font-size-offset, 0px));
  font-weight: 650;
}
.pi-ask-counter {
  color: var(--pi-ask-text-muted, light-dark(#5c5c66, #a5a5b0));
  font-size: calc(12px + var(--pi-ask-font-size-offset, 0px));
}

.pi-ask-questions { padding: 12px 14px; display: grid; gap: 14px; }
.pi-ask-question {
  width: 100%;
  min-width: 0;
  font-size: calc(12.5px + var(--pi-ask-font-size-offset, 0px));
  overflow-wrap: anywhere;
}
.pi-ask-question-head { display: grid; grid-template-columns: 20px minmax(0, 1fr); align-items: baseline; }
.pi-ask-index {
  color: var(--pi-ask-accent, light-dark(#2f6fed, #a4c2f4));
  font-size: calc(12px + var(--pi-ask-font-size-offset, 0px));
  font-weight: 700;
  flex-shrink: 0;
}
.pi-ask-question-text {
  color: var(--pi-ask-text, light-dark(#111114, #ececef));
  font-size: calc(13.5px + var(--pi-ask-font-size-offset, 0px));
  line-height: 1.5;
  white-space: pre-wrap;
}
.pi-ask-detail {
  margin-top: 8px;
  margin-bottom: 6px;
  padding: 10px 12px;
  border-left: 3px solid var(--pi-ask-border, light-dark(#d9d9de, #3a3a40));
  border-radius: 4px;
  background: var(--pi-ask-field, light-dark(#f6f6f7, #232326));
  color: var(--pi-ask-text-muted, light-dark(#5c5c66, #a5a5b0));
  font-size: calc(12.5px + var(--pi-ask-font-size-offset, 0px));
  line-height: 1.9;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.pi-ask-detail p { margin: 0; }
.pi-ask-detail p + p { margin-top: 6px; }

.pi-ask-options { margin-top: 8px; display: grid; gap: 6px; padding-left: 20px; }
.pi-ask-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
  width: 100%;
  padding: 7px 10px;
  border-radius: 7px;
  border: 1px solid var(--pi-ask-border, light-dark(#d9d9de, #3a3a40));
  background: var(--pi-ask-field, light-dark(#f6f6f7, #232326));
  color: var(--pi-ask-text, light-dark(#111114, #ececef));
  font-size: calc(13px + var(--pi-ask-font-size-offset, 0px));
  line-height: 1.4;
  cursor: pointer;
}
.pi-ask-option:not([aria-checked="true"]):hover:not(:disabled) {
  background: var(--pi-ask-field-hover, light-dark(#ececee, #2b2b2f));
}
.pi-ask-option[aria-checked="true"] {
  background: var(--pi-ask-accent, light-dark(#2f6fed, #a4c2f4));
  color: var(--pi-ask-accent-contrast, light-dark(#ffffff, #14161a));
  border-color: var(--pi-ask-accent, light-dark(#2f6fed, #a4c2f4));
}
.pi-ask-option:disabled { cursor: default; opacity: 0.75; }
.pi-ask-option-glyph {
  flex-shrink: 0;
  font-size: calc(12px + var(--pi-ask-font-size-offset, 0px));
  opacity: 0.85;
}
.pi-ask-option-detail {
  display: block;
  font-size: calc(11.5px + var(--pi-ask-font-size-offset, 0px));
  opacity: 0.8;
}

.pi-ask-other { margin-top: 8px; padding-left: 20px; }
.pi-ask-other-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 7px;
  border: 1px dashed var(--pi-ask-border, light-dark(#d9d9de, #3a3a40));
  background: var(--pi-ask-field, light-dark(#f6f6f7, #232326));
}
.pi-ask-other-icon {
  flex-shrink: 0;
  width: 13px;
  text-align: center;
  color: var(--pi-ask-text-dim, light-dark(#8a8a94, #7d7d88));
  font-size: calc(12px + var(--pi-ask-font-size-offset, 0px));
}
.pi-ask-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--pi-ask-text, light-dark(#111114, #ececef));
  font-size: calc(13px + var(--pi-ask-font-size-offset, 0px));
}

.pi-ask-summary {
  margin-top: 6px;
  padding-left: 20px;
  color: var(--pi-ask-text-muted, light-dark(#5c5c66, #a5a5b0));
  font-size: calc(11.5px + var(--pi-ask-font-size-offset, 0px));
  line-height: 1.4;
}
.pi-ask-summary-check { color: var(--pi-ask-success, #16a34a); }

.pi-ask-supplement {
  padding: 0 14px 12px;
  border-top: 1px solid var(--pi-ask-border, light-dark(#d9d9de, #3a3a40));
}
.pi-ask-supplement-title {
  margin: 10px 0 6px;
  color: var(--pi-ask-text, light-dark(#111114, #ececef));
  font-size: calc(12px + var(--pi-ask-font-size-offset, 0px));
  font-weight: 600;
}
.pi-ask-textarea {
  width: 100%;
  min-width: 0;
  resize: none;
  padding: 8px 10px;
  border-radius: 7px;
  border: 1px dashed var(--pi-ask-border, light-dark(#d9d9de, #3a3a40));
  background: var(--pi-ask-field, light-dark(#f6f6f7, #232326));
  color: var(--pi-ask-text, light-dark(#111114, #ececef));
  font-size: calc(13px + var(--pi-ask-font-size-offset, 0px));
  line-height: 1.5;
}

.pi-ask-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--pi-ask-border, light-dark(#d9d9de, #3a3a40));
  background: var(--pi-ask-field, light-dark(#f6f6f7, #232326));
}
.pi-ask-hint {
  color: var(--pi-ask-text-dim, light-dark(#8a8a94, #7d7d88));
  font-size: calc(11.5px + var(--pi-ask-font-size-offset, 0px));
  line-height: 1.45;
  min-width: 0;
}
.pi-ask-actions { display: flex; gap: 8px; flex-shrink: 0; }
.pi-ask-cancel {
  padding: 7px 14px;
  border-radius: 7px;
  border: 1px solid var(--pi-ask-border, light-dark(#d9d9de, #3a3a40));
  background: var(--pi-ask-surface, light-dark(#ffffff, #1b1b1d));
  color: var(--pi-ask-text-muted, light-dark(#5c5c66, #a5a5b0));
  cursor: pointer;
  font-size: calc(13px + var(--pi-ask-font-size-offset, 0px));
}
.pi-ask-submit {
  padding: 7px 16px;
  border-radius: 7px;
  border: 1px solid var(--pi-ask-accent, light-dark(#2f6fed, #a4c2f4));
  background: var(--pi-ask-accent, light-dark(#2f6fed, #a4c2f4));
  color: var(--pi-ask-accent-contrast, light-dark(#ffffff, #14161a));
  cursor: pointer;
  font-size: calc(13px + var(--pi-ask-font-size-offset, 0px));
  font-weight: 600;
}
.pi-ask-cancel:disabled, .pi-ask-submit:disabled { cursor: default; opacity: 0.75; }
.pi-ask-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--pi-ask-text-muted, light-dark(#5c5c66, #a5a5b0));
  font-size: calc(12.5px + var(--pi-ask-font-size-offset, 0px));
}
.pi-ask-status-check { color: var(--pi-ask-success, #16a34a); font-weight: 700; }
.pi-ask-error {
  flex-basis: 100%;
  color: var(--pi-ask-danger, #ef4444);
  font-size: calc(12px + var(--pi-ask-font-size-offset, 0px));
  line-height: 1.4;
}
`.trim();
