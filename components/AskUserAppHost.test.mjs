import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const hostSource = await readFile(new URL("./AskUserAppHost.tsx", import.meta.url), "utf8");
const chatWindowSource = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  ASK_USER_VIEW_HTML,
  ASK_USER_VIEW_SCRIPT,
  ASK_USER_VIEW_SCRIPT_HASH,
  isBuiltinAskUserViewHtml,
} = await jiti.import("../lib/ask-user/mcp-view-html.ts");
const viewSource = ASK_USER_VIEW_SCRIPT;

test("chat window keys the Apps host by askId so drafts do not leak across asks", () => {
  assert.match(chatWindowSource, /<AskUserAppHost[\s\S]*?key=\{pendingAsk\.askId\}/);
  assert.match(chatWindowSource, /sessionId=\{session\?\.id \?\? sessionIdRef\.current \?\? undefined\}/);
});

test("host wrapper mounts the built-in document as an opaque-origin srcdoc frame", () => {
  assert.match(hostSource, /showApps \? null : \([\s\S]*?<AskUserCard/);
  assert.match(hostSource, /srcDoc=\{apps\.html\}/);
  assert.match(hostSource, /sandbox="allow-scripts"/);
  assert.doesNotMatch(hostSource, /sandbox="[^"]*allow-same-origin/);
  assert.match(hostSource, /isBuiltinAskUserViewHtml\(/);
  assert.doesNotMatch(hostSource, /sandbox-resource-ready/);
  assert.doesNotMatch(hostSource, /sandbox-resource-rejected/);
  assert.doesNotMatch(hostSource, /@modelcontextprotocol/);
});

test("host labels which view is on screen so the two are distinguishable in a browser", () => {
  // Both views are styled to look alike on purpose; these markers are the only
  // reliable way for a person or a browser test to tell them apart.
  assert.match(hostSource, /data-ask-user-view="native"/);
  assert.match(hostSource, /data-ask-user-view=\{showApps \? "apps" : "apps-pending"\}/);
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
  assert.match(hostSource, /function readFontFamilyStack\(\): string \{[\s\S]*?getComputedStyle\(document\.body\)\.fontFamily/);
  assert.match(viewSource, /function sanitizeFontStack\(value\)/);
  assert.match(viewSource, /style\.fontFamily = sanitizeFontStack\(projection\.fontFamily\)/);
  // Both sides strip anything that could break out of the inline style.
  const charClass = "[^A-Za-z0-9 ,'\"_-]";
  assert.ok(hostSource.includes(charClass));
  assert.ok(viewSource.includes(charClass));
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
  // Unsupported Apps/core versions and non-builtin resources keep the native card.
  assert.match(hostSource, /record\.appsProtocolVersion !== APPS_PROTOCOL_VERSION/);
  assert.match(hostSource, /record\.mimeType !== "text\/html;profile=mcp-app"/);
  assert.match(hostSource, /record\.uri !== ASK_USER_VIEW_URI/);
  assert.match(hostSource, /structuredContent\.schemaVersion !== 1/);
  assert.match(hostSource, /toolInput\.sessionId !== expected\.sessionId \|\| toolInput\.askId !== expected\.askId/);
});

test("host keeps the native card when the projection fails to load or the handshake stalls", () => {
  assert.match(hostSource, /const APPS_HANDSHAKE_TIMEOUT_MS = 6000/);
  assert.match(hostSource, /if \(!payload\) throw new Error\("ask view projection was invalid"\)/);
  assert.match(hostSource, /if \(!cancelled && !timedOut\) setFailed\(true\)/);
  assert.match(hostSource, /if \(!completedRef\.current\) setFailed\(true\)/);
});
