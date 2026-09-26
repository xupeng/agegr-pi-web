/**
 * Fixed HTML document served as the `ui://pi-web/ask-user.html` MCP Apps resource.
 *
 * Pi Web mounts this document directly as the ask view via `srcdoc` with
 * `sandbox="allow-scripts"` (no `allow-same-origin`), so the document runs in an
 * opaque origin. An opaque origin never matches CSP `'self'`, so the view script
 * is inlined here and allowed by its SHA-256 hash; `style-src 'unsafe-inline'` is
 * required because the view sets `style` attributes. The document has no network,
 * frames, images or form action, and `srcdoc` inherits the parent CSP — which is
 * why Pi Web's webfonts arrive as woff2 bytes with the projection and are
 * installed as `FontFace` objects (`lib/ask-user/view-fonts.ts` and its
 * server-only half `lib/ask-user/view-font-manifest.ts`) instead of being
 * fetched from `/fonts/**`.
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

  // Pi Web design tokens mirrored by the host. The frame is an opaque origin,
  // so it cannot inherit the host's CSS variables and cannot resolve var()
  // against the host document: the host sends the values it computed, which is
  // what makes every palette (light, dark, mist, rose, pine) follow. The
  // fallbacks are Pi Web's light palette, so a missing token still renders.
  // This table mirrors lib/ask-user/theme-tokens.ts; an inlined script cannot
  // import it, so the two are kept in step by hand.
  var TOKENS = [
    ["bg", "--pi-bg", "color", "#ffffff"],
    ["bgPanel", "--pi-bg-panel", "color", "#f5f5f5"],
    ["bgHover", "--pi-bg-hover", "color", "#eeeeee"],
    ["bgSelected", "--pi-bg-selected", "color", "#e8e8e8"],
    ["border", "--pi-border", "color", "#e0e0e0"],
    ["text", "--pi-text", "color", "#1a1a1a"],
    ["textMuted", "--pi-text-muted", "color", "#515c6b"],
    ["textDim", "--pi-text-dim", "color", "#5e6673"],
    ["accent", "--pi-accent", "color", "#245bce"],
    ["accentContrast", "--pi-accent-contrast", "color", "#ffffff"],
    ["maxWidth", "--pi-max-width", "length", "820px"]
  ];
  // Pi Web defines no success/danger tokens; these are the values its own
  // components use (SkillsConfig, FileExplorer), so the view matches the host.
  var SUCCESS_COLOR = "#16a34a";
  var DANGER_COLOR = "#ef4444";
  var baseStylesInstalled = false;

  function sanitizeToken(kind, value) {
    if (typeof value !== "string") return "";
    var trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 64) return "";
    if (/[;{}"'<>\\]/.test(trimmed)) return "";
    if (/url\s*\(|expression\s*\(|var\s*\(|!important|@/i.test(trimmed)) return "";
    if (kind === "length") {
      return /^[0-9]+(\.[0-9]+)?(px|rem|em)$/.test(trimmed) ? trimmed : "";
    }
    return /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color|light-dark)\([0-9a-zA-Z.,%\/\s+-]*\)|transparent|currentcolor)$/.test(trimmed)
      ? trimmed
      : "";
  }

  function applyTokens(tokens) {
    var provided = tokens && typeof tokens === "object" ? tokens : {};
    TOKENS.forEach(function (token) {
      var value = sanitizeToken(token[2], provided[token[0]]);
      document.documentElement.style.setProperty(token[1], value === "" ? token[3] : value);
    });
  }

  // Rules an inline style cannot express: the focus ring, placeholder colour,
  // form controls inheriting the frame's font, and mobile text autosizing.
  // style-src 'unsafe-inline' covers the element.
  function installBaseStyles() {
    if (baseStylesInstalled) return;
    baseStylesInstalled = true;
    var style = document.createElement("style");
    style.textContent = "button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--pi-accent,#245bce);outline-offset:2px;}"
      // UA stylesheets give button/input/textarea their own font, so without
      // this the option rows render in the platform UI font (Arial on Linux,
      // San Francisco on iOS) while the question right above them renders in
      // the host stack - the exact "wrong font" seen on a phone.
      + "button,input,textarea{font-family:inherit;}"
      + "input::placeholder,textarea::placeholder{color:var(--pi-text-dim,#5e6673);}"
      // Mobile browsers apply text autosizing inside a document that is not
      // marked mobile-optimized, which inflated the question text ~1.7x on a
      // phone while the form controls around it stayed put. The parent page
      // has a viewport meta; this frame needs its own, plus the opt-out.
      + "html{-webkit-text-size-adjust:100%;text-size-adjust:100%;}";
    document.head.appendChild(style);
  }

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

  // The host sends its own stack; keep only font-stack characters so the value
  // cannot break out of the inline style it is applied to.
  function sanitizeFontStack(value) {
    if (typeof value !== "string") return "";
    var cleaned = value.replace(/[^A-Za-z0-9 ,'"_-]/g, " ").trim();
    if (cleaned.length === 0 || cleaned.length > 300) return "";
    return cleaned;
  }

  // The host cannot hand the frame a URL: an opaque origin never matches CSP
  // 'self', and a request to the app's own /fonts/ files is refused as local
  // network access. So Pi Web's faces arrive as woff2 bytes with the projection
  // and are installed as FontFace objects, which need no URL and no font-src.
  // Validate everything: this script is inlined and cannot import the module
  // that built the payload, and the frame must never parse arbitrary font data.
  var FONT_FAMILIES = ["Oxanium", "LXGW WenKai Screen"];
  // Mirrors the host cap; the vendored set is 99 faces, so a longer ask than
  // the frame expects is still accepted instead of losing all fonts.
  var FONT_FACE_LIMIT = 128;
  var FONT_BYTE_LIMIT = 2 * 1024 * 1024;
  var fontsInstalled = "";

  function sanitizeFontEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (FONT_FAMILIES.indexOf(entry.family) === -1) return null;
    if (typeof entry.style !== "string" || !/^(normal|italic|oblique( -?[0-9]{1,3}deg)?)$/.test(entry.style)) return null;
    if (typeof entry.weight !== "string" || !/^(normal|bold|[0-9]{3}( [0-9]{3})?)$/.test(entry.weight)) return null;
    if (typeof entry.unicodeRange !== "string") return null;
    if (!/^U\+[0-9A-Fa-f?]+(-[0-9A-Fa-f]+)?(,U\+[0-9A-Fa-f?]+(-[0-9A-Fa-f]+)?)*$/.test(entry.unicodeRange)) return null;
    var data = entry.data;
    if (Object.prototype.toString.call(data) !== "[object ArrayBuffer]") return null;
    if (data.byteLength < 4 || data.byteLength > FONT_BYTE_LIMIT) return null;
    var signature = new Uint8Array(data, 0, 4);
    // "wOF2": a woff2 file, and nothing else, may become a face here.
    if (signature[0] !== 0x77 || signature[1] !== 0x4f || signature[2] !== 0x46 || signature[3] !== 0x32) return null;
    return {
      family: entry.family,
      style: entry.style,
      weight: entry.weight,
      unicodeRange: entry.unicodeRange,
      data: data,
    };
  }

  // Installed once per payload: re-adding faces on every re-render would restart
  // their loads. document.fonts.ready then re-reports the height, because
  // swapping a fallback for a webfont can change the measured content height
  // after the host already sized the frame.
  function installFonts(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > FONT_FACE_LIMIT) return;
    var accepted = [];
    for (var index = 0; index < value.length; index += 1) {
      var face = sanitizeFontEntry(value[index]);
      if (face) accepted.push(face);
    }
    if (accepted.length === 0) return;
    var key = accepted.length + ":";
    for (var item = 0; item < accepted.length; item += 1) {
      key += accepted[item].family + accepted[item].unicodeRange + accepted[item].data.byteLength + ";";
    }
    if (key === fontsInstalled) return;
    if (!window.FontFace || !document.fonts || !document.fonts.add) return;
    for (var next = 0; next < accepted.length; next += 1) {
      var entry = accepted[next];
      try {
        var fontFace = new window.FontFace(entry.family, entry.data, {
          style: entry.style,
          weight: entry.weight,
          unicodeRange: entry.unicodeRange,
          display: "swap",
        });
        document.fonts.add(fontFace);
      } catch (error) {
        // A face that cannot be parsed simply leaves the fallback in place.
      }
    }
    fontsInstalled = key;
    if (document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(function () {
        lastReportedHeight = -1;
        reportSize();
      });
    }
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
        else if (key === "onkeydown") node.addEventListener("keydown", value);
        else node.setAttribute(key, value);
      });
    }
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function baseTextColor() {
    return "var(--pi-text, #1a1a1a)";
  }

  function mutedTextColor() {
    return "var(--pi-text-muted, #515c6b)";
  }

  function dimTextColor() {
    return "var(--pi-text-dim, #5e6673)";
  }

  function borderColor() {
    return "var(--pi-border, #e0e0e0)";
  }

  function panelColor() {
    return "var(--pi-bg-panel, #f5f5f5)";
  }

  function bgColor() {
    return "var(--pi-bg, #ffffff)";
  }

  function accentColor() {
    return "var(--pi-accent, #245bce)";
  }

  function accentContrastColor() {
    return "var(--pi-accent-contrast, #ffffff)";
  }

  function cardMaxWidth() {
    return "var(--pi-max-width, 820px)";
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
      var values = draftFor(ref.question.id).values;
      var anySelected = ref.buttons.some(function (entry) { return values.indexOf(entry.option.value) !== -1; });
      ref.buttons.forEach(function (entry, index) {
        var selected = values.indexOf(entry.option.value) !== -1;
        entry.button.setAttribute("aria-checked", selected ? "true" : "false");
        entry.button.style.background = selected ? accentColor() : bgColor();
        entry.button.style.color = selected ? accentContrastColor() : baseTextColor();
        entry.button.style.borderColor = selected ? accentColor() : borderColor();
        if (ref.question.multiple !== true) {
          // Roving tabindex: the group is one tab stop and the arrows move
          // inside it, the way a native radiogroup behaves.
          entry.button.setAttribute("tabindex", selected || (!anySelected && index === 0) ? "0" : "-1");
        }
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
        entry.button.style.opacity = locked ? "0.75" : "1";
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
      // role=status announces the lock; focusing it keeps a keyboard user from
      // being dropped onto the document body when the controls get disabled.
      var lockedStatus = el("div", {
        role: "status",
        "aria-live": "polite",
        tabindex: "-1",
        style: "display:flex;align-items:center;gap:8px;color:" + mutedTextColor() + ";font-size:12.5px;",
      }, [
        el("span", { text: "✓", "aria-hidden": "true", style: "color:" + SUCCESS_COLOR + ";font-weight:700;" }),
        el("span", { text: status === "submitting" ? labels.submitted : labels.cancelling }),
      ]);
      footerEl.appendChild(lockedStatus);
      if (lockedStatus.focus) {
        try { lockedStatus.focus(); } catch (error) { /* focus is best effort */ }
      }
      reportSize();
      return;
    }
    // --text-dim, like the card's hint; --text-muted is the answered counter's colour.
    footerEl.appendChild(el("div", { text: labels.hint, style: "color:" + dimTextColor() + ";font-size:11.5px;line-height:1.45;min-width:0;" }));
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
        role: "alert",
        text: footerError,
        style: "flex-basis:100%;color:" + DANGER_COLOR + ";font-size:12px;line-height:1.4;",
      }));
    }
    reportSize();
  }

  function buttonStyle(primary) {
    // The native card gave submit two more horizontal pixels than cancel.
    return "padding:7px " + (primary ? "16px" : "14px") + ";border-radius:7px;font-size:13px;cursor:pointer;"
      + (primary
        ? "border:1px solid " + accentColor() + ";background:" + accentColor() + ";color:#fff;font-weight:600;"
        : "border:1px solid " + borderColor() + ";background:" + panelColor() + ";color:" + mutedTextColor() + ";");
  }

  function optionButton(ref, option) {
    var multiple = ref.question.multiple === true;
    // The glyph is decoration: the state lives in aria-checked.
    var check = el("span", { text: multiple ? "☐" : "○", "aria-hidden": "true", style: "flex-shrink:0;font-size:12px;opacity:0.85;" });
    var label = el("span", { style: "min-width:0;" }, [document.createTextNode(text(option.label))]);
    if (option.detail !== undefined && option.detail !== null && text(option.detail) !== "") {
      label.appendChild(el("span", { text: text(option.detail), style: "display:block;font-size:11.5px;opacity:0.8;" }));
    }
    var button = el("button", {
      type: "button",
      role: multiple ? "checkbox" : "radio",
      "aria-checked": "false",
      onclick: function () { toggleOption(ref, option); },
      onkeydown: function (event) { onOptionKeyDown(ref, event); },
      style: "display:flex;align-items:flex-start;gap:8px;text-align:left;width:100%;box-sizing:border-box;padding:7px 10px;border-radius:7px;border:1px solid "
        + borderColor() + ";background:" + bgColor() + ";color:" + baseTextColor() + ";font-size:13px;line-height:1.4;cursor:pointer;",
    }, [check, label]);
    return { button: button, check: check, option: option };
  }

  /**
   * Radio semantics: arrows move and select inside the group, Home/End jump to
   * the ends. Checkbox groups need no handler — Tab reaches every option and
   * Space toggles the focused one.
   */
  function onOptionKeyDown(ref, event) {
    if (!event || ref.question.multiple === true) return;
    var key = event.key;
    if (key !== "ArrowDown" && key !== "ArrowRight" && key !== "ArrowUp" && key !== "ArrowLeft" && key !== "Home" && key !== "End") return;
    var entries = ref.buttons;
    if (entries.length === 0) return;
    if (typeof event.preventDefault === "function") event.preventDefault();
    var current = draftFor(ref.question.id).values[0];
    var selectedIndex = -1;
    entries.forEach(function (entry, index) {
      if (entry.option.value === current) selectedIndex = index;
    });
    var next;
    if (selectedIndex === -1) {
      next = key === "ArrowUp" || key === "ArrowLeft" || key === "End" ? entries.length - 1 : 0;
    } else if (key === "Home") {
      next = 0;
    } else if (key === "End") {
      next = entries.length - 1;
    } else if (key === "ArrowDown" || key === "ArrowRight") {
      next = (selectedIndex + 1) % entries.length;
    } else {
      next = (selectedIndex - 1 + entries.length) % entries.length;
    }
    toggleOption(ref, entries[next].option);
    if (typeof entries[next].button.focus === "function") entries[next].button.focus();
  }

  function detailBlock(detail) {
    var box = el("div", {
      style: "margin-top:8px;margin-bottom:6px;padding:10px 12px;border-left:3px solid " + borderColor()
        + ";border-radius:4px;background:" + bgColor() + ";color:" + mutedTextColor()
        + ";font-size:12.5px;line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere;",
    });
    text(detail).split(/\r?\n(?:[\t ]*\r?\n)+/).forEach(function (paragraph, index) {
      box.appendChild(el("p", { text: paragraph, style: "margin:" + (index === 0 ? "0" : "6px 0 0 0") + ";" }));
    });
    return box;
  }

  function buildQuestion(question, index) {
    var ref = { question: question, buttons: [], otherInput: null, summary: null };
    var options = Array.isArray(question.options) ? question.options : [];
    var questionId = "pi-web-ask-q-" + String(index);
    var optionsBox = el("div", {
      role: question.multiple === true ? "group" : "radiogroup",
      "aria-labelledby": questionId,
      style: "margin-top:8px;display:grid;gap:6px;padding-left:20px;",
    });
    options.forEach(function (option) {
      var entry = optionButton(ref, option);
      ref.buttons.push(entry);
      optionsBox.appendChild(entry.button);
    });
    var otherInput = el("input", {
      type: "text",
      value: draftFor(question.id).otherText,
      placeholder: question.multiple ? labels.multipleOtherPlaceholder : labels.otherPlaceholder,
      "aria-label": question.multiple ? labels.multipleOtherPlaceholder : labels.otherPlaceholder,
      oninput: function () { setOtherText(ref, otherInput.value); },
      // No inline outline:none — it would beat the injected :focus-visible rule.
      style: "flex:1;min-width:0;border:none;background:transparent;color:" + baseTextColor() + ";font-size:13px;",
    });
    ref.otherInput = otherInput;
    var otherBox = el("div", {
      style: "margin-top:8px;padding-left:20px;",
    }, [
      el("div", {
        style: "display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;border:1px dashed "
          + borderColor() + ";background:" + bgColor() + ";",
      }, [
        el("span", { text: "✎", "aria-hidden": "true", style: "flex-shrink:0;width:13px;text-align:center;color:" + dimTextColor() + ";font-size:12px;" }),
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
        el("div", { id: questionId, text: text(question.question), style: "color:" + baseTextColor() + ";font-size:13.5px;line-height:1.5;white-space:pre-wrap;" }),
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
    installBaseStyles();
    installFonts(projection.fonts);
    applyTokens(projection.tokens);
    questions = Array.isArray(projection.questions) ? projection.questions : [];
    drafts = Object.create(null);
    refs = [];
    locked = false;
    status = "idle";
    supplement = "";
    footerError = "";
    // color-scheme drives the UA controls and scrollbars; the host sends it
    // because it knows the resolved palette, while theme names (pine, rose,
    // mist) only look like light/dark variants.
    document.documentElement.style.colorScheme =
      projection.colorScheme === "dark" || (projection.colorScheme !== "light" && projection.theme === "dark")
        ? "dark"
        : "light";
    var offset = Number(projection.fontSizeOffsetPx);
    if (!isFinite(offset) || offset < -32 || offset > 48) offset = 0;
    document.documentElement.style.setProperty("--chat-font-size-offset", offset + "px");
    // The host stack only resolves once installFonts() above has added the faces;
    // keep a sans default so a frame that never receives them still avoids the
    // UA serif.
    document.documentElement.style.fontFamily =
      sanitizeFontStack(projection.fontFamily) || "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif";
    root.textContent = "";

    var header = el("div", {
      style: "display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid "
        + borderColor() + ";background:" + bgColor() + ";",
    }, [
      el("div", { text: labels.title, style: "color:" + baseTextColor() + ";font-size:13px;font-weight:650;" }),
      answeredEl = el("div", {
        text: formatAnswered(labels.answered, 0, questions.length),
        "aria-live": "polite",
        style: "color:" + mutedTextColor() + ";font-size:12px;",
      }),
    ]);

    // Same grid + 14px row gap as the native card: without the gap consecutive
    // questions sit flush against each other and a long ask reads as one wall of
    // text (measured 0px between blocks before this).
    var body = el("div", { style: "display:grid;gap:14px;padding:12px 14px;" });
    questions.forEach(function (question, index) {
      body.appendChild(buildQuestion(question, index));
    });

    textareaEl = el("textarea", {
      rows: "2",
      maxlength: "4000",
      placeholder: labels.supplementPlaceholder,
      "aria-label": labels.supplementTitle,
      oninput: function () { supplement = textareaEl.value; },
      style: "width:100%;min-width:0;box-sizing:border-box;resize:none;padding:8px 10px;border-radius:7px;border:1px dashed "
        + borderColor() + ";background:" + bgColor() + ";color:" + baseTextColor() + ";font-size:13px;line-height:1.5;font-family:inherit;",
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
      "aria-label": labels.title,
      style: "width:100%;max-width:" + cardMaxWidth() + ";margin:0 auto;border:1px solid " + borderColor()
        + ";border-radius:10px;background:" + panelColor() + ";box-shadow:0 12px 40px rgba(0,0,0,0.18);overflow:hidden;"
        + "display:flex;flex-direction:column;",
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
 * Recompute after any edit to the script with:
 *   node --input-type=module -e "import {createHash} from 'node:crypto'; import
 *   {createJiti} from 'jiti'; const jiti = createJiti(process.cwd()+'/x.mjs');
 *   const {ASK_USER_VIEW_SCRIPT} = await jiti.import('./lib/ask-user/mcp-view-html.ts');
 *   console.log('sha256-' + createHash('sha256').update(ASK_USER_VIEW_SCRIPT,
 *   'utf8').digest('base64'))"
 * and paste the result into both this constant and the CSP meta tag below — the
 * test in components/AskUserAppHost.test.mjs fails if the two ever disagree. The
 * script must keep containing no backtick, no "${" and no "</script" so it can
 * stay inside this module's template literals.
 */
export const ASK_USER_VIEW_SCRIPT_HASH = "sha256-q0tU0IKatN7idjOAF/+VWxZO9AYyZWa8Rm5hZtSMIrI=";

/**
 * The fixed view document. `isBuiltinAskUserViewHtml` trusts exactly this string.
 */
export const ASK_USER_VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-q0tU0IKatN7idjOAF/+VWxZO9AYyZWa8Rm5hZtSMIrI='; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
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
