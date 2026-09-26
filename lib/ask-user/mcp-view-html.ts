/**
 * Fixed HTML document served as the `ui://pi-web/ask-user.html` MCP Apps resource.
 *
 * Pi Web mounts this document directly as the ask view via `srcdoc` with
 * `sandbox="allow-scripts"` (no `allow-same-origin`), so the document runs in an
 * opaque origin. An opaque origin never matches CSP `'self'`, so the view script
 * is inlined here and allowed by its SHA-256 hash; `style-src 'unsafe-inline'` is
 * required because the view sets `style` attributes. The document has no network,
 * frames, images or form action, and `srcdoc` inherits the parent CSP.
 *
 * Because the origin is opaque, host messages arrive with `event.origin === "null"`
 * and are accepted only when `event.source` is the exact mounted iframe. This makes
 * the view work from any page origin (loopback, LAN IP, Tailscale, hostname, HTTPS).
 */

/**
 * Exact inline view script. Kept as a separate constant so tests can recompute the
 * SHA-256 below and the meta CSP hash cannot silently drift from the embedded script.
 */
export const ASK_USER_VIEW_SCRIPT = String.raw`/**
 * Pi Web ask_user MCP Apps view.
 *
 * Inlined into the fixed ui://pi-web/ask-user.html document, which the host
 * mounts as an opaque-origin srcdoc iframe (sandbox="allow-scripts"). It speaks
 * the MCP Apps 2026-01-26 handshake by hand (the host wrapper does the same on
 * the other side), renders the bounded projection the host sends, and requests
 * only the two host-authorized actions: ask_submit and ask_cancel.
 *
 * It has no access to the host session, cookies or Pi tools. Display labels are
 * supplied by the host in structuredContent.labels so the view needs no i18n
 * runtime of its own.
 */
(function () {
  "use strict";

  var APPS_PROTOCOL_VERSION = "2026-01-26";
  var VIEW_ORIGIN = window.location.origin;
  var root = document.getElementById("pi-web-ask-root");

  var sessionId = "";
  var askId = "";
  var questions = [];
  // Null-prototype map: a question id like "__proto__" or "constructor" would
  // otherwise resolve to an Object.prototype member and crash the render.
  var drafts = Object.create(null);
  var supplement = "";
  var locked = false;
  var status = "idle";
  var refs = [];
  var answeredEl = null;
  var footerEl = null;
  var textareaEl = null;
  var nextRequestId = 1;
  var pending = Object.create(null);
  var lastReportedHeight = -1;
  var footerError = "";

  var labels = {
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

  function post(message) {
    // With sandbox="allow-scripts" (no allow-same-origin) this srcdoc document
    // has an opaque origin: location.origin is the string "null" and the parent
    // origin is unreadable. Target "*"; the host still verifies event.source.
    var target = VIEW_ORIGIN;
    if (!target || target === "null") {
      try { target = window.parent.location.origin; } catch { target = "*"; }
    }
    window.parent.postMessage(message, target);
  }

  function notify(method, params) {
    post({ jsonrpc: "2.0", method: method, params: params });
  }

  // Ask the host to grow the sandbox to the rendered content height so long
  // question sets do not get an inner scrollbar.
  function reportSize() {
    var height = Math.ceil(document.documentElement.scrollHeight);
    if (height === lastReportedHeight) return;
    lastReportedHeight = height;
    notify("ui/notifications/size-changed", {
      width: Math.ceil(document.documentElement.clientWidth),
      height: height,
    });
  }

  function text(value) {
    return String(value === undefined || value === null ? "" : value);
  }

  function formatAnswered(template, count, total) {
    return text(template).split("{count}").join(String(count)).split("{total}").join(String(total));
  }

  // The sandbox denies external fonts (CSP default-src 'none'), so the view
  // could only ever use the browser default. The host sends its own stack; keep
  // only font-stack characters so the value cannot break out of the inline
  // style it is applied to.
  function sanitizeFontStack(value) {
    if (typeof value !== "string") return "";
    var cleaned = value.replace(/[^A-Za-z0-9 ,'"_-]/g, " ").trim();
    if (cleaned.length === 0 || cleaned.length > 300) return "";
    return cleaned;
  }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === undefined || value === null) return;
        if (key === "style") node.setAttribute("style", String(value).replace(/font-size:([0-9.]+)px/g, "font-size:calc($1px + var(--chat-font-size-offset, 0px))"));
        else if (key === "text") node.textContent = value;
        else if (key === "onclick") node.addEventListener("click", value);
        else if (key === "oninput") node.addEventListener("input", value);
        else node.setAttribute(key, value);
      });
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function baseTextColor() {
    return "light-dark(#1f2328, #e6e6e6)";
  }

  function mutedTextColor() {
    return "light-dark(#57606a, #9aa4b2)";
  }

  function borderColor() {
    return "light-dark(#d0d7de, #3a3f46)";
  }

  function panelColor() {
    return "light-dark(#ffffff, #1f2328)";
  }

  function bgColor() {
    return "light-dark(#f6f8fa, #16191d)";
  }

  function accentColor() {
    return "light-dark(#0969da, #4493f8)";
  }

  function draftFor(id) {
    if (!drafts[id]) drafts[id] = { values: [], otherText: "" };
    return drafts[id];
  }

  function answered() {
    var count = 0;
    questions.forEach(function (question) {
      var draft = draftFor(question.id);
      if (draft.values.length > 0 || draft.otherText.trim() !== "") count += 1;
    });
    return count;
  }

  function refresh() {
    if (answeredEl) answeredEl.textContent = formatAnswered(labels.answered, answered(), questions.length);
    refs.forEach(function (ref) {
      ref.buttons.forEach(function (entry) {
        var selected = draftFor(ref.question.id).values.indexOf(entry.option.value) !== -1;
        entry.button.setAttribute("aria-pressed", selected ? "true" : "false");
        entry.button.style.background = selected ? accentColor() : panelColor();
        entry.button.style.color = selected ? "#ffffff" : baseTextColor();
        entry.button.style.borderColor = selected ? accentColor() : borderColor();
        if (entry.check) entry.check.textContent = selected ? (ref.question.multiple ? "☑" : "◉") : (ref.question.multiple ? "☐" : "○");
      });
      if (ref.summary) {
        var draft = draftFor(ref.question.id);
        var parts = draft.values.slice();
        if (draft.otherText.trim() !== "") parts.push(draft.otherText.trim());
        ref.summary.textContent = parts.length === 0 ? "" : "✓ " + parts.join(" · ");
        ref.summary.style.display = locked && parts.length > 0 ? "block" : "none";
      }
    });
  }

  function refreshControls() {
    refs.forEach(function (ref) {
      ref.buttons.forEach(function (entry) {
        entry.button.disabled = locked;
        entry.button.style.opacity = locked ? "0.7" : "1";
        entry.button.style.cursor = locked ? "default" : "pointer";
      });
      ref.otherInput.disabled = locked;
    });
    if (textareaEl) textareaEl.disabled = locked;
    if (!footerEl) {
      reportSize();
      return;
    }
    footerEl.textContent = "";
    if (locked) {
      footerEl.appendChild(el("div", {
        style: "display:flex;align-items:center;gap:8px;color:" + mutedTextColor() + ";font-size:12.5px;",
      }, [
        el("span", { text: "✓", style: "color:#1a7f37;font-weight:700;" }),
        el("span", { text: status === "submitting" ? labels.submitted : labels.cancelling }),
      ]));
      reportSize();
      return;
    }
    footerEl.appendChild(el("div", { text: labels.hint, style: "color:" + mutedTextColor() + ";font-size:11.5px;line-height:1.45;min-width:0;" }));
    var actions = el("div", { style: "display:flex;gap:8px;flex-shrink:0;" }, [
      el("button", {
        type: "button",
        text: labels.cancel,
        onclick: cancel,
        style: buttonStyle(false),
      }),
      el("button", {
        type: "button",
        text: labels.submit,
        onclick: submit,
        style: buttonStyle(true),
      }),
    ]);
    footerEl.appendChild(actions);
    if (footerError !== "") {
      footerEl.appendChild(el("div", {
        text: footerError,
        style: "flex-basis:100%;color:#cf222e;font-size:12px;line-height:1.4;",
      }));
    }
    reportSize();
  }

  function buttonStyle(primary) {
    return "padding:7px 14px;border-radius:7px;font-size:13px;cursor:pointer;"
      + (primary
        ? "border:1px solid " + accentColor() + ";background:" + accentColor() + ";color:#fff;font-weight:600;"
        : "border:1px solid " + borderColor() + ";background:" + panelColor() + ";color:" + mutedTextColor() + ";");
  }

  function optionButton(ref, option) {
    var check = el("span", { text: ref.question.multiple ? "☐" : "○", style: "flex-shrink:0;font-size:12px;opacity:0.9;" });
    var label = el("span", { style: "min-width:0;" }, [document.createTextNode(text(option.label))]);
    if (option.detail !== undefined && option.detail !== null && text(option.detail) !== "") {
      label.appendChild(el("span", { text: text(option.detail), style: "display:block;font-size:11.5px;opacity:0.8;" }));
    }
    var button = el("button", {
      type: "button",
      "aria-pressed": "false",
      onclick: function () { toggleOption(ref, option); },
      style: "display:flex;align-items:flex-start;gap:8px;text-align:left;width:100%;box-sizing:border-box;padding:7px 10px;border-radius:7px;border:1px solid "
        + borderColor() + ";background:" + panelColor() + ";color:" + baseTextColor() + ";font-size:13px;line-height:1.4;cursor:pointer;",
    }, [check, label]);
    return { button: button, check: check, option: option };
  }

  function detailBlock(detail) {
    var box = el("div", {
      style: "margin-top:8px;margin-bottom:6px;padding:10px 12px;border-left:3px solid " + borderColor()
        + ";border-radius:4px;background:" + bgColor() + ";color:" + mutedTextColor()
        + ";font-size:12.5px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;",
    });
    text(detail).split(/\r?\n(?:[\t ]*\r?\n)+/).forEach(function (paragraph, index) {
      box.appendChild(el("p", { text: paragraph, style: "margin:" + (index === 0 ? "0" : "6px 0 0 0") + ";" }));
    });
    return box;
  }

  function buildQuestion(question, index) {
    var ref = { question: question, buttons: [], otherInput: null, summary: null };
    var options = Array.isArray(question.options) ? question.options : [];
    var optionsBox = el("div", { style: "margin-top:8px;display:grid;gap:6px;padding-left:20px;" });
    options.forEach(function (option) {
      var entry = optionButton(ref, option);
      ref.buttons.push(entry);
      optionsBox.appendChild(entry.button);
    });
    var otherInput = el("input", {
      type: "text",
      value: draftFor(question.id).otherText,
      placeholder: question.multiple ? labels.multipleOtherPlaceholder : labels.otherPlaceholder,
      oninput: function () { setOtherText(ref, otherInput.value); },
      style: "flex:1;min-width:0;border:none;background:transparent;outline:none;color:" + baseTextColor() + ";font-size:13px;",
    });
    ref.otherInput = otherInput;
    var otherBox = el("div", {
      style: "margin-top:8px;padding-left:20px;",
    }, [
      el("div", {
        style: "display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;border:1px dashed "
          + borderColor() + ";background:" + bgColor() + ";",
      }, [
        el("span", { text: "✎", "aria-hidden": "true", style: "flex-shrink:0;width:13px;text-align:center;color:" + mutedTextColor() + ";font-size:12px;" }),
        otherInput,
      ]),
    ]);
    ref.summary = el("div", {
      text: "",
      style: "display:none;margin-top:6px;padding-left:20px;color:" + mutedTextColor() + ";font-size:11.5px;line-height:1.4;",
    });
    var header = el("div", { style: "display:grid;grid-template-columns:20px minmax(0,1fr);align-items:baseline;" }, [
      el("span", { text: String(index + 1) + ".", style: "color:" + accentColor() + ";font-size:12px;font-weight:700;flex-shrink:0;" }),
      el("div", { style: "min-width:0;" }, [
        el("div", { text: text(question.question), style: "color:" + baseTextColor() + ";font-size:13.5px;line-height:1.5;white-space:pre-wrap;" }),
        question.detail !== undefined && question.detail !== null && text(question.detail) !== "" ? detailBlock(question.detail) : null,
      ]),
    ]);
    refs.push(ref);
    return el("div", { style: "width:100%;min-width:0;font-size:12.5px;overflow-wrap:anywhere;" }, [header, optionsBox, otherBox, ref.summary]);
  }

  function toggleOption(ref, option) {
    if (locked) return;
    var draft = draftFor(ref.question.id);
    if (ref.question.multiple === true) {
      var at = draft.values.indexOf(option.value);
      draft.values = at === -1 ? draft.values.concat([option.value]) : draft.values.filter(function (value) { return value !== option.value; });
    } else {
      draft.values = [option.value];
      draft.otherText = "";
      ref.otherInput.value = "";
    }
    refresh();
  }

  function setOtherText(ref, value) {
    if (locked) return;
    var draft = draftFor(ref.question.id);
    if (ref.question.multiple === true) {
      draft.otherText = value;
    } else {
      draft.values = [];
      draft.otherText = value;
    }
    refresh();
  }

  function buildAnswers() {
    var answers = [];
    questions.forEach(function (question) {
      var draft = draftFor(question.id);
      var otherText = draft.otherText.trim();
      if (draft.values.length === 0 && otherText === "") return;
      var answer = { id: question.id, values: draft.values.slice() };
      if (otherText !== "") answer.otherText = otherText;
      answers.push(answer);
    });
    return answers;
  }

  function callTool(name, args) {
    var id = nextRequestId;
    nextRequestId += 1;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: "tools/call", params: { name: name, arguments: args } });
    });
  }

  function fail(error) {
    if (!footerEl) return;
    // Keep the controls: the action was rejected, so the user must still be able
    // to retry or cancel instead of being left with a dead, buttonless footer.
    footerError = error && error.message ? error.message : labels.actionFailed;
    refreshControls();
  }

  function submit() {
    if (locked) return;
    footerError = "";
    locked = true;
    status = "submitting";
    refresh();
    refreshControls();
    var args = { sessionId: sessionId, askId: askId, answers: buildAnswers() };
    var trimmed = supplement.trim();
    if (trimmed !== "") args.supplement = trimmed;
    callTool("ask_submit", args).catch(function (error) {
      locked = false;
      status = "idle";
      refresh();
      refreshControls();
      fail(error);
    });
  }

  function cancel() {
    if (locked) return;
    footerError = "";
    locked = true;
    status = "cancelling";
    refresh();
    refreshControls();
    callTool("ask_cancel", { sessionId: sessionId, askId: askId }).catch(function (error) {
      locked = false;
      status = "idle";
      refresh();
      refreshControls();
      fail(error);
    });
  }

  function render(projection) {
    if (!root) return;
    questions = Array.isArray(projection.questions) ? projection.questions : [];
    drafts = Object.create(null);
    refs = [];
    locked = false;
    status = "idle";
    supplement = "";
    footerError = "";
    document.documentElement.style.colorScheme = projection.theme === "dark" ? "dark" : "light";
    var offset = Number(projection.fontSizeOffsetPx);
    if (!isFinite(offset) || offset < -32 || offset > 48) offset = 0;
    document.documentElement.style.setProperty("--chat-font-size-offset", offset + "px");
    document.documentElement.style.fontFamily = sanitizeFontStack(projection.fontFamily);
    root.textContent = "";

    var header = el("div", {
      style: "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid "
        + borderColor() + ";background:" + bgColor() + ";",
    }, [
      el("div", { text: labels.title, style: "color:" + baseTextColor() + ";font-size:13px;font-weight:650;" }),
      answeredEl = el("div", { text: formatAnswered(labels.answered, 0, questions.length), style: "color:" + mutedTextColor() + ";font-size:12px;" }),
    ]);

    var body = el("div", { style: "padding:12px 14px;" });
    questions.forEach(function (question, index) {
      body.appendChild(buildQuestion(question, index));
    });

    textareaEl = el("textarea", {
      rows: "2",
      maxlength: "4000",
      placeholder: labels.supplementPlaceholder,
      oninput: function () { supplement = textareaEl.value; },
      style: "width:100%;min-width:0;box-sizing:border-box;resize:none;padding:8px 10px;border-radius:7px;border:1px dashed "
        + borderColor() + ";background:" + bgColor() + ";outline:none;color:" + baseTextColor() + ";font-size:13px;line-height:1.5;font-family:inherit;",
    });
    var supplementBox = el("div", { style: "padding:0 14px 12px;border-top:1px solid " + borderColor() + ";" }, [
      el("div", { text: labels.supplementTitle, style: "margin:10px 0 6px;color:" + baseTextColor() + ";font-size:12px;font-weight:600;" }),
      textareaEl,
    ]);

    footerEl = el("div", {
      style: "display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;row-gap:6px;padding:10px 14px;border-top:1px solid "
        + borderColor() + ";background:" + bgColor() + ";",
    });

    root.appendChild(el("div", {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": labels.title,
      style: "width:100%;max-width:820px;margin:0 auto;border:1px solid " + borderColor()
        + ";border-radius:10px;background:" + panelColor() + ";box-shadow:0 12px 40px rgba(0,0,0,0.18);overflow:hidden;"
        + "display:flex;flex-direction:column;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;",
    }, [header, body, supplementBox, footerEl]));

    refresh();
    refreshControls();
  }

  function mergeLabels(value) {
    if (typeof value !== "object" || value === null) return;
    Object.keys(labels).forEach(function (key) {
      if (typeof value[key] === "string" && value[key] !== "") labels[key] = value[key];
    });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    // An opaque-origin frame cannot read window.parent.location, so fall back
    // to an unknown parent origin. event.source === window.parent above is the
    // mandatory check; only compare origins when one is actually known.
    var parentOrigin = VIEW_ORIGIN;
    if (!parentOrigin || parentOrigin === "null") {
      try { parentOrigin = window.parent.location.origin; } catch { parentOrigin = "*"; }
    }
    if (parentOrigin !== "*" && event.origin !== parentOrigin) return;
    var data = event.data;
    if (typeof data !== "object" || data === null || data.jsonrpc !== "2.0") return;

    if (data.id !== undefined && pending[data.id] !== undefined) {
      var waiter = pending[data.id];
      delete pending[data.id];
      if (data.error !== undefined && data.error !== null) waiter.reject(new Error(text(data.error.message) || "tool call failed"));
      else waiter.resolve(data.result);
      return;
    }
    if (data.id === 0 && data.result !== undefined) {
      notify("ui/notifications/initialized");
      return;
    }
    if (data.method === "ui/notifications/tool-input") {
      var args = data.params && data.params.arguments ? data.params.arguments : {};
      if (typeof args.sessionId === "string") sessionId = args.sessionId;
      if (typeof args.askId === "string") askId = args.askId;
      return;
    }
    if (data.method === "ui/notifications/tool-result") {
      var params = data.params && typeof data.params === "object" ? data.params : {};
      var projection = params.structuredContent && typeof params.structuredContent === "object" ? params.structuredContent : null;
      if (!projection) return;
      mergeLabels(projection.labels);
      render(projection);
      return;
    }
    if (data.method === "ui/resource-teardown") {
      post({ jsonrpc: "2.0", id: data.id, result: {} });
    }
  });

  window.addEventListener("resize", reportSize);

  post({
    jsonrpc: "2.0",
    id: 0,
    method: "ui/initialize",
    params: {
      appCapabilities: {},
      appInfo: { name: "pi-web-ask-user-view", version: "1.0.0" },
      protocolVersion: APPS_PROTOCOL_VERSION,
    },
  });
})();
`;

/**
 * base64 SHA-256 of {@link ASK_USER_VIEW_SCRIPT}, as used by the meta CSP.
 * Recompute after any edit to the script:
 *   node --input-type=module -e "import('jiti').then(async ({createJiti}) => {
 *     const {createHash} = await import('node:crypto');
 *     const m = await createJiti('file://' + process.cwd() + '/x.mjs')(…)}"
 * Practically: load the module with jiti, then
 *   "sha256-" + createHash("sha256").update(ASK_USER_VIEW_SCRIPT, "utf8").digest("base64")
 * and paste the result into both this constant and the CSP meta tag below — the
 * test in components/AskUserAppHost.test.mjs fails if the three ever disagree.
 */
export const ASK_USER_VIEW_SCRIPT_HASH = "sha256-EloPp3UqP8tNk0CrG66KQct2N5q/++zefT8I+tJbPvU=";

/**
 * The fixed view document. `isBuiltinAskUserViewHtml` trusts exactly this string.
 */
export const ASK_USER_VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-EloPp3UqP8tNk0CrG66KQct2N5q/++zefT8I+tJbPvU='; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>Pi Web ask_user</title>
</head>
<body>
<div id="pi-web-ask-root"></div>
<script>${ASK_USER_VIEW_SCRIPT}</script>
</body>
</html>
`;

/**
 * Accept only the fixed built-in view document. The host must refuse to mount any
 * other HTML as the ask view, even though the document now lives in the bundle.
 */
export function isBuiltinAskUserViewHtml(html: string): boolean {
  return html === ASK_USER_VIEW_HTML;
}
