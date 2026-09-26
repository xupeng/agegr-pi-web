import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const {
  buildViewFontManifest,
  readViewFontManifest,
  ASK_USER_VIEW_FONT_CSS_FILES,
} = await jiti.import("./view-font-manifest.ts");
const { ASK_USER_VIEW_FONT_FAMILIES } = await jiti.import("./view-fonts.ts");

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

test("only the app's own families survive, rebuilt from whitelisted descriptors", () => {
  const faces = buildViewFontManifest([OREGANO, WENKAI]);
  assert.equal(faces.length, 2);
  assert.deepEqual(faces[0], {
    family: "Oxanium",
    style: "normal",
    weight: "300 700",
    display: "swap",
    unicodeRange: "U+0000-00FF,U+0131",
    url: "/fonts/oxanium/oxanium-latin-wght-normal.woff2",
  });
  assert.equal(faces[1].family, "LXGW WenKai Screen");
  assert.equal(faces[1].unicodeRange, "U+4E00-9FFF");
  assert.equal(JSON.stringify(faces).includes("comments must not survive"), false);
});

test("other families and unknown descriptors are dropped", () => {
  const faces = buildViewFontManifest([`
    @font-face { font-family: "Cascadia Code"; src: url("/fonts/cascadia-code-latin-400-normal.woff2"); unicode-range: U+0000-00FF; }
    @font-face { font-family: "Oxanium"; src: url("/fonts/oxanium/oxanium-latin-wght-normal.woff2"); unicode-range: U+0000-00FF;
      unknown-descriptor: url("/fonts/x.woff2"); font-variation-settings: "wght" 700; }
  `]);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].family, "Oxanium");
  assert.equal("unknownDescriptor" in faces[0], false);
  assert.equal("fontVariationSettings" in faces[0], false);
});

test("off-origin, traversing and non-font sources are rejected", () => {
  const cases = [
    'url("https://evil.example/x.woff2")',
    'url("//evil.example/x.woff2")',
    'url("/fonts/../../secret.woff2")',
    'url("/api/fonts/x.woff2")',
    'url("javascript:alert(1)")',
    'url("/fonts/x.svg#f")',
    'url("/fonts/x.woff2")\n}\nbody{background:red}',
  ];
  for (const src of cases) {
    const faces = buildViewFontManifest([
      '@font-face { font-family: "Oxanium"; src: ' + src + '; unicode-range: U+0000-00FF; }',
      OREGANO,
    ]);
    assert.equal(faces.length, 1, src);
    assert.match(faces[0].url, /oxanium-latin-wght-normal/, src);
  }
});

test("a face without a unicode-range is dropped, and at-rules other than font-face never pass", () => {
  const faces = buildViewFontManifest([
    '@import url("https://evil.example/x.css");',
    '@font-face { font-family: "Oxanium"; src: url("/fonts/oxanium/x.woff2"); }',
    '@font-face { font-family: "Oxanium"; src: url("/fonts/oxanium/y.woff2"); unicode-range: U+0000-00FF; }',
  ]);
  assert.equal(faces.length, 1);
  assert.match(faces[0].url, /y\.woff2/);
});

test("reading the real sources lists both families, and a missing root is not an error", async () => {
  const faces = await readViewFontManifest();
  assert.ok(faces.length > 90, "every unicode-range subset is kept");
  assert.deepEqual([...new Set(faces.map((face) => face.family))].sort(), ["LXGW WenKai Screen", "Oxanium"]);
  assert.deepEqual(await readViewFontManifest(join(tmpdir(), "pi-web-definitely-missing")), []);
});

test("the reader only ever reads the two app stylesheets", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-fonts-"));
  await mkdir(join(root, "app"), { recursive: true });
  await writeFile(join(root, "app", "fonts.css"), OREGANO, "utf8");
  await writeFile(join(root, "app", "secrets.css"), '@font-face { font-family: "Oxanium"; src: url("/fonts/leak.woff2"); unicode-range: U+0000-00FF; }', "utf8");
  const faces = await readViewFontManifest(root);
  assert.equal(faces.length, 1);
  assert.equal(JSON.stringify(faces).includes("leak.woff2"), false);
  assert.deepEqual([...ASK_USER_VIEW_FONT_CSS_FILES], ["app/fonts.css", "app/fonts-lxgw-wenkai-screen.css"]);
  assert.deepEqual([...ASK_USER_VIEW_FONT_FAMILIES], ["Oxanium", "LXGW WenKai Screen"]);
});

