import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  collectViewText,
  selectViewFontFaces,
  fontFamiliesInStack,
  filterViewFontFacesByStack,
} = await jiti.import("./view-fonts.ts");
// Fixtures only: the parser itself is the server module's business, and the
// guard below keeps it out of the browser bundle.
const { buildViewFontManifest } = await jiti.import("./view-font-manifest.ts");

const OREGANO = `
/*
 * comments must not survive into the manifest
 */
@font-face {
  font-family: "Oxanium";
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url("/fonts/oxanium/oxanium-latin-wght-normal.woff2") format("woff2-variations");
  unicode-range: U+0000-00FF, U+0131;
}
`;

const WENKAI = `@font-face {
  font-family: 'LXGW WenKai Screen';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url(/fonts/lxgw-wenkai-screen/lxgwwenkaiscreen-subset-4.woff2) format("woff2");
  unicode-range: U+4E00-9FFF;
}`;

test("the corpus covers every string in the projection plus the view's own glyphs", () => {
  const text = collectViewText({
    sessionId: "s1",
    questions: [{ id: "q1", question: "提交？", options: [{ value: "yes", label: "提交" }] }],
  }, { submit: "Submit" });
  assert.ok(text.includes("提交？"));
  assert.ok(text.includes("yes"));
  assert.ok(text.includes("Submit"));
  assert.ok(text.includes("✓"), "the locked-state summary glyph is painted by the view itself");
  assert.ok(text.includes("9"));

  const nested = collectViewText({ a: { b: { c: { d: "deep" } } } });
  assert.ok(nested.includes("deep"));
  // A cyclic or absurdly deep projection cannot hang the walk.
  const cyclic = { name: "x" };
  cyclic.self = cyclic;
  assert.equal(typeof collectViewText(cyclic), "string");
  const long = collectViewText({ value: "a".repeat(50000) });
  assert.ok(long.length < 21000);
});

test("only the faces whose subset covers the text are selected", () => {
  const faces = buildViewFontManifest([
    OREGANO,
    WENKAI,
    '@font-face { font-family: "LXGW WenKai Screen"; src: url(/fonts/lxgw-wenkai-screen/lxgwwenkaiscreen-subset-9.woff2); unicode-range: U+3400-4DBF; }',
  ]);
  const cjk = selectViewFontFaces(faces, "提交", 32);
  assert.deepEqual(cjk.map((face) => face.url), [
    "/fonts/lxgw-wenkai-screen/lxgwwenkaiscreen-subset-4.woff2",
  ], "latin is not needed for CJK-only text");

  const latin = selectViewFontFaces(faces, "Submit", 32);
  assert.deepEqual(latin.map((face) => face.url), ["/fonts/oxanium/oxanium-latin-wght-normal.woff2"]);

  const both = selectViewFontFaces(faces, "提交 Submit", 32);
  assert.equal(both.length, 2);

  // The cap keeps the manifest order, so the primary family always survives.
  assert.equal(selectViewFontFaces(faces, "提交 Submit", 1).length, 1);
  assert.equal(selectViewFontFaces(faces, "提交 Submit", 1)[0].family, "Oxanium");

  // An unparseable range must load rather than silently drop the face.
  const wildcard = buildViewFontManifest(['@font-face { font-family: "Oxanium"; src: url("/fonts/oxanium/x.woff2"); unicode-range: U+4??; }']);
  assert.equal(selectViewFontFaces(wildcard, "ab", 32).length, 1);
  assert.equal(selectViewFontFaces(wildcard, "", 32).length, 1, "an unreadable range is loaded, never skipped");
});

test("a font stack is parsed into families, and unreferenced families are not shipped", () => {
  const faces = buildViewFontManifest([
    OREGANO,
    WENKAI,
    '@font-face { font-family: "LXGW WenKai Screen"; src: url(/fonts/lxgw-wenkai-screen/lxgwwenkaiscreen-subset-9.woff2); unicode-range: U+3400-4DBF; }',
  ]);

  // Pi Web's UI stack (what `body` resolves to): quoted and bare names, generic
  // families and platform-only names must all survive parsing.
  const uiStack = '"Oxanium", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  assert.deepEqual(fontFamiliesInStack(uiStack), [
    "Oxanium", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif",
  ]);
  assert.deepEqual(fontFamiliesInStack("'LXGW WenKai Screen'"), ["LXGW WenKai Screen"]);
  assert.deepEqual(fontFamiliesInStack(""), []);
  assert.deepEqual(fontFamiliesInStack("Oxanium, Oxanium"), ["Oxanium"], "duplicates collapse");

  // The UI stack names no vendored CJK family, so only Oxanium bytes travel; the
  // CJK glyphs are the device's own sans, exactly like the native card.
  assert.deepEqual(filterViewFontFacesByStack(faces, uiStack).map((face) => face.family), ["Oxanium"]);
  // Quoting and surrounding whitespace are not identity.
  assert.equal(filterViewFontFacesByStack(faces, ' " OREGANO " ').length, 0);
  assert.equal(filterViewFontFacesByStack(faces, 'Oxanium, "LXGW WenKai Screen"').length, faces.length);
  assert.deepEqual(filterViewFontFacesByStack(faces, "sans-serif"), []);
});


/**
 * `components/AskUserAppHost.tsx` imports this module from the browser bundle.
 * A `node:` specifier anywhere in it (even behind a dynamic import) makes
 * `next build --webpack` fail with `UnhandledSchemeError`, which is how CI's e2e
 * job caught the manifest reader living here.
 */
test("the client-safe module names no Node-only specifier", async () => {
  const source = await readFile(new URL("./view-fonts.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /["']node:/, "view-fonts.ts is bundled for the browser");
  assert.doesNotMatch(source, /\bfrom\s+["'](fs|path|os|crypto)["']/);
});

test("the file-reading half lives in its own server-only module", async () => {
  const source = await readFile(new URL("./view-font-manifest.ts", import.meta.url), "utf8");
  assert.match(source, /await import\("node:fs\/promises"\)/);
  assert.match(source, /await import\("node:path"\)/);
  // Nothing outside the server may import it: the route is its only consumer.
  const host = await readFile(new URL("../../components/AskUserAppHost.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(host, /view-font-manifest/);
});
