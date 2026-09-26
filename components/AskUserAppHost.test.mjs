import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const hostSource = await readFile(new URL("./AskUserAppHost.tsx", import.meta.url), "utf8");
const failureSource = await readFile(new URL("./AskUserAppFailure.tsx", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  ASK_USER_VIEW_HTML,
  ASK_USER_VIEW_SCRIPT,
  ASK_USER_VIEW_SCRIPT_HASH,
  isBuiltinAskUserViewHtml,
} = await jiti.import("../lib/ask-user/mcp-view-html.ts");
const viewSource = ASK_USER_VIEW_SCRIPT;

const renderJiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});
const React = await renderJiti.import("react");
const { renderToStaticMarkup } = await renderJiti.import("react-dom/server");
const { AskUserAppFailure } = await renderJiti.import("./AskUserAppFailure.tsx");
const { I18nProvider } = await renderJiti.import("@/hooks/useI18n");

const sampleAsk = {
  askId: "ask-1",
  askedAt: "2026-09-26T00:00:00.000Z",
  questions: [
    {
      id: "q1",
      question: "Which environment?",
      detail: "Pick one.",
      options: [
        { value: "dev", label: "Development" },
        { value: "prod", label: "Production", detail: "live" },
      ],
    },
    {
      id: "q2",
      question: "Which regions?",
      multiple: true,
      options: [{ value: "eu", label: "Europe" }],
    },
  ],
};

function renderFailure() {
  return renderToStaticMarkup(
    React.createElement(
      I18nProvider,
      null,
      React.createElement(AskUserAppFailure, { ask: sampleAsk, onRetry() {} }),
    ),
  );
}

test("chat window keys the Apps host by askId so drafts do not leak across asks", () => {
  assert.match(chatWindowSource, /<AskUserAppHost[\s\S]*?key=\{pendingAsk\.askId\}/);
  assert.match(chatWindowSource, /sessionId=\{session\?\.id \?\? sessionIdRef\.current \?\? undefined\}/);
});

test("host wrapper mounts the built-in document as an opaque-origin srcdoc frame", () => {
  // The host no longer renders any React ask form; the frame is the only renderer.
  assert.doesNotMatch(hostSource, /<AskUserCard/);
  assert.doesNotMatch(hostSource, /AskUserCard/);
  assert.match(hostSource, /srcDoc=\{apps\.html\}/);
  assert.match(hostSource, /sandbox="allow-scripts"/);
  assert.doesNotMatch(hostSource, /sandbox="[^"]*allow-same-origin/);
  assert.match(hostSource, /isBuiltinAskUserViewHtml\(/);
  assert.doesNotMatch(hostSource, /sandbox-resource-ready/);
  assert.doesNotMatch(hostSource, /sandbox-resource-rejected/);
  assert.doesNotMatch(hostSource, /@modelcontextprotocol/);
});

test("host marks exactly the three real view states", () => {
  assert.match(hostSource, /const viewState: AskUserAppViewState = failed \? "failed" : showApps \? "apps" : "loading"/);
  assert.match(hostSource, /data-ask-user-view=\{viewState\}/);
  assert.doesNotMatch(hostSource, /data-ask-user-view="native"/);
  assert.doesNotMatch(hostSource, /apps-pending/);
});

test("host shows a busy placeholder and keeps the frame off-screen until a post-result size arrives", () => {
  assert.match(hostSource, /role="status"/);
  assert.match(hostSource, /aria-busy="true"/);
  assert.match(hostSource, /if \(sentResultRef\.current\) revealApps\(\)/);
  assert.match(hostSource, /position: "fixed"/);
  assert.match(hostSource, /left: -10000/);
  assert.match(hostSource, /aria-hidden=\{showApps \? undefined : true\}/);
  // The reveal no longer inspects a host card's focus: there is no card.
  assert.doesNotMatch(hostSource, /cardSlotRef/);
  assert.doesNotMatch(hostSource, /document\.activeElement/);
});

test("degraded state renders the open questions read-only with retry as its only control", () => {
  const html = renderFailure();
  assert.match(html, /role="alert"/);
  assert.match(html, /Which environment\?/);
  assert.match(html, /Pick one\./);
  assert.match(html, /Which regions\?/);
  assert.match(html, /Development/);
  assert.match(html, /Production/);
  assert.match(html, /Europe/);
  assert.match(html, /Several options can be selected\./);
  assert.match(html, /Retry/);
  const buttons = html.match(/<button/g) ?? [];
  assert.equal(buttons.length, 1, "retry must be the only interactive control");
  assert.doesNotMatch(html, /<input|<textarea|<select|<form/);
});

test("degraded state renders questions from client props, not from a projection", () => {
  assert.match(failureSource, /ask\.questions\.map/);
  assert.doesNotMatch(failureSource, /structuredContent/);
  assert.doesNotMatch(failureSource, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(hostSource, /dangerouslySetInnerHTML/);
});

test("retry bumps reloadKey, which the projection fetch effect depends on", () => {
  assert.match(hostSource, /const \[reloadKey, setReloadKey\] = useState\(0\)/);
  assert.match(hostSource, /\}, \[ask\.askId, reloadKey, sessionId\]\)/);
  assert.match(hostSource, /setReloadKey\(\(key\) => key \+ 1\)/);
  assert.match(hostSource, /key=\{reloadKey\}/);
});

test("host wrapper accepts opaque origins only from the exact mounted iframe", () => {
  assert.match(hostSource, /event\.source !== contentWindow/);
  assert.match(hostSource, /event\.origin !== "null"/);
  assert.ok(
    hostSource.indexOf("event.source !== contentWindow") < hostSource.indexOf('event.origin !== "null"'),
    "source check must precede the opaque-origin check",
  );
  assert.match(hostSource, /contentWindow\.postMessage\(message, "\*"\)/);
});

test("host wrapper only authorizes ask_submit and ask_cancel for the current ask", () => {
  assert.match(hostSource, /name === "ask_submit"/);
  assert.match(hostSource, /name === "ask_cancel"/);
  assert.match(hostSource, /args\.sessionId !== sessionIdRef\.current \|\| args\.askId !== currentAskId/);
  assert.match(hostSource, /tool not allowlisted/);
  assert.doesNotMatch(hostSource, /onSubmit\(askId/);
});

test("view document inlines the script and pins it with the matching CSP hash", () => {
  const expectedHash = "sha256-" + createHash("sha256").update(ASK_USER_VIEW_SCRIPT, "utf8").digest("base64");
  assert.equal(ASK_USER_VIEW_SCRIPT_HASH, expectedHash);
  const cspMatch = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(ASK_USER_VIEW_HTML);
  assert.ok(cspMatch, "view document must declare a meta CSP");
  const csp = cspMatch[1];
  assert.ok(csp.includes(`script-src '${expectedHash}'`), `CSP must allow the pinned script hash: ${csp}`);
  assert.ok(csp.includes("default-src 'none'"));
  assert.ok(csp.includes("style-src 'unsafe-inline'"));
  assert.ok(csp.includes("connect-src 'none'"));
  assert.ok(csp.includes("form-action 'none'"));
  assert.match(ASK_USER_VIEW_HTML, /<div id="pi-web-ask-root">/);
  // The frame is its own document: without a viewport meta mobile browsers treat
  // it as a desktop page and boost the block-level question text (the parent
  // page's meta does not apply to srcdoc), which read as "the question's font
  // size is too large" on a phone while the flex rows around it stayed put.
  assert.match(ASK_USER_VIEW_HTML, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.ok(ASK_USER_VIEW_HTML.includes(`<script>${ASK_USER_VIEW_SCRIPT}</script>`));
  assert.doesNotMatch(ASK_USER_VIEW_HTML, /<script[^>]*\bsrc=/);
  assert.doesNotMatch(ASK_USER_VIEW_HTML, /ask-user-view\.js/);
  assert.equal(isBuiltinAskUserViewHtml(ASK_USER_VIEW_HTML), true);
  assert.equal(isBuiltinAskUserViewHtml(ASK_USER_VIEW_HTML.replace("allow-scripts", "allow-scripts allow-same-origin")), false);
});

test("view script keeps the source check when the parent origin is unreadable", () => {
  assert.match(viewSource, /if \(event\.source !== window\.parent\) return;/);
  assert.match(viewSource, /catch \{ parentOrigin = "\*"; \}/);
  assert.doesNotMatch(viewSource, /catch \{ return; \}/);
  assert.match(viewSource, /if \(parentOrigin !== "\*" && event\.origin !== parentOrigin\) return;/);
});

test("view script requests only the two host-authorized ask actions", () => {
  assert.match(viewSource, /"ask_submit"/);
  assert.match(viewSource, /"ask_cancel"/);
  assert.match(viewSource, /font-size:calc\(\$1px \+ var\(--chat-font-size-offset, 0px\)\)/);
  assert.doesNotMatch(viewSource, /\/api\//);
  assert.doesNotMatch(viewSource, /<\/script/);
});

test("host forwards a sanitized font stack so the isolated view is not browser-default", () => {
  assert.match(hostSource, /fontFamily: readFontFamilyStack\(\)/);
  // The stack must be the UI stack (`body`), which is what the deleted
  // AskUserCard inherited: Latin in Oxanium, CJK in the device's own sans. The
  // prose stack (--font-content) would put the question in LXGW WenKai Screen,
  // whose kai glyphs read bigger and heavier than the card's sans.
  assert.match(hostSource, /function readFontFamilyStack\(\): string \{[\s\S]*?getComputedStyle\(document\.body\)\.fontFamily/);
  assert.doesNotMatch(hostSource, /getPropertyValue\("--font-content"\)/);
  assert.match(viewSource, /function sanitizeFontStack\(value\)/);
  // The stack is what resolves when the mirrored webfonts below are missing; the
  // sans default keeps the frame away from the UA serif if the host sends
  // nothing usable either.
  assert.match(viewSource, /style\.fontFamily =\s*\n\s*sanitizeFontStack\(projection\.fontFamily\) \|\| "-apple-system, system-ui/);
  // Both sides strip anything that could break out of the inline style.
  const charClass = "[^A-Za-z0-9 ,'\"_-]";
  assert.ok(hostSource.includes(charClass));
  assert.ok(viewSource.includes(charClass));
  assert.match(cssSource, /--font-content: "Oxanium", "LXGW WenKai GB Screen", "LXGW WenKai Screen"/);
  assert.match(cssSource, /\.markdown-body \{[\s\S]*?font-family: var\(--font-content\)/);
});

test("host mirrors the app's webfonts as bytes so the ask view types like the chat", () => {
  assert.match(hostSource, /const ASK_VIEW_FONT_FACES_URL = "\/api\/ask-user\/font-faces"/);
  assert.match(hostSource, /fonts: payload\.fonts/);
  assert.match(hostSource, /const payload: AppViewPayload = \{ \.\.\.parsed, fonts \}/);
  // The bytes go with the projection, so the frame's first tool-result already
  // carries the faces it renders in.
  assert.match(hostSource, /const fonts = await loadAskViewFonts\(parsed\.structuredContent, labelsRef\.current, readFontFamilyStack\(\)\)/);
  // Only the subsets the projected text touches, bounded by count and bytes, and
  // only for families the forwarded stack can reach: the UI stack names no
  // self-hosted CJK face, so those vendored subsets are never posted.
  assert.match(hostSource, /filterViewFontFacesByStack\(manifest, stack\)/);
  assert.match(hostSource, /selectViewFontFaces\(usable, text, ASK_VIEW_FONT_FACE_LIMIT\)/);
  assert.match(hostSource, /bytes \+ buffer\.byteLength > ASK_VIEW_FONT_BYTE_LIMIT/);
  assert.match(hostSource, /WOFF2_SIGNATURE\.some\(\(byte, position\) => signature\[position\] !== byte\)/);
  // A slow or failed manifest degrades to system fallbacks instead of eating the
  // handshake budget, and both the manifest and the files are cached.
  assert.match(hostSource, /new Promise<AskUserViewFont\[\]>\(\(resolve\) => window\.setTimeout\(\(\) => resolve\(\[\]\), ASK_VIEW_FONTS_TIMEOUT_MS\)\)/);
  assert.match(hostSource, /if \(!askViewFontManifestPromise\) \{\n\s+askViewFontManifestPromise = fetch\(ASK_VIEW_FONT_FACES_URL/);
  assert.match(hostSource, /askViewFontBytes\.get\(url\)/);
  assert.match(hostSource, /record\.version !== ASK_USER_VIEW_FONT_MANIFEST_VERSION/);
  // An opaque origin cannot load a font URL at all: the frame must never be given
  // one, and the document must open no network source for fonts.
  assert.match(viewSource, /function installFonts\(value\)/);
  assert.match(viewSource, /new window\.FontFace\(entry\.family, entry\.data/);
  assert.match(viewSource, /signature\[0\] !== 0x77 \|\| signature\[1\] !== 0x4f \|\| signature\[2\] !== 0x46 \|\| signature\[3\] !== 0x32/);
  assert.doesNotMatch(viewSource, /@font-face/);
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(ASK_USER_VIEW_HTML)[1];
  assert.doesNotMatch(csp, /font-src/);
  assert.match(csp, /default-src 'none'/);
});

test("host forwards the live design tokens and the resolved color scheme", () => {
  assert.match(hostSource, /tokens: readDocumentThemeTokens\(\)/);
  assert.match(hostSource, /colorScheme: currentTheme\(\)/);
  assert.match(hostSource, /from "@\/lib\/ask-user\/theme-tokens"/);
  assert.match(hostSource, /function readDocumentThemeTokens\(\)[\s\S]*?readThemeTokens\(\(name\) => styles\.getPropertyValue\(name\)\)/);
  // The view mirrors the whitelist and sanitizes again before it reaches a
  // style declaration, because structuredContent is untrusted CSS as far as the
  // frame is concerned.
  assert.match(viewSource, /function sanitizeToken\(kind, value\)/);
  assert.match(viewSource, /style\.setProperty\(token\[1\], value === "" \? token\[3\] : value\)/);
  // No palette may be guessed in the frame any more: Pi Web has five themes.
  assert.doesNotMatch(viewSource, /light-dark\(#/);
  assert.doesNotMatch(viewSource, /font-family:system-ui/);
});

test("chat window returns the submit promise so a rejected ask can unlock the view", () => {
  assert.match(chatWindowSource, /onSubmit=\{\(askId, answers, supplement\) => submitAsk\(askId, answers, supplement\)\}/);
  assert.doesNotMatch(chatWindowSource, /void submitAsk\(askId, answers, supplement\)/);
});

test("host rejects malformed view actions and unsupported projections instead of forwarding them", () => {
  // Malicious/missing ask action input is answered with a tool error, never by
  // calling the submit/cancel callbacks.
  assert.match(hostSource, /sendError\(id, "invalid ask answers"\)/);
  assert.match(hostSource, /name === "ask_submit"[\s\S]*?sendError\(id, "invalid ask answers"\)/);
  assert.match(hostSource, /supplement\.length > ASK_USER_OTHER_TEXT_MAX_LENGTH/);
  // Unsupported Apps/core versions and non-builtin resources go to the degraded state.
  assert.match(hostSource, /record\.appsProtocolVersion !== APPS_PROTOCOL_VERSION/);
  assert.match(hostSource, /record\.mimeType !== "text\/html;profile=mcp-app"/);
  assert.match(hostSource, /record\.uri !== ASK_USER_VIEW_URI/);
  assert.match(hostSource, /structuredContent\.schemaVersion !== 1/);
  assert.match(hostSource, /toolInput\.sessionId !== expected\.sessionId \|\| toolInput\.askId !== expected\.askId/);
});

test("host shows the degraded state when the projection fails to load or the handshake stalls", () => {
  assert.match(hostSource, /const APPS_HANDSHAKE_TIMEOUT_MS = 6000/);
  assert.match(hostSource, /if \(!parsed\) throw new Error\("ask view projection was invalid"\)/);
  assert.match(hostSource, /if \(!cancelled && !timedOut\) setFailed\(true\)/);
  assert.match(hostSource, /if \(!completedRef\.current\) setFailed\(true\)/);
  assert.match(hostSource, /if \(!sessionId\) \{[\s\S]*?setFailed\(true\)/);
});
