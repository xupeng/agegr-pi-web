import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// `app/fonts-content-cjk.css` is generated, and these are the rules that make
// the generated shape load-bearing: one role family carries both CJK weight
// bands, so the chat body's 500 stays on WenKai while headings, `strong` and
// list markers (600/700) switch to ZhenKai. Splitting the bands into two
// families, or letting the bold band cover 500, silently breaks the mapping
// without any visible error.

const css = await readFile(new URL("./fonts-content-cjk.css", import.meta.url), "utf8");
const globalsCss = await readFile(new URL("./globals.css", import.meta.url), "utf8");

const FAMILY = "PiWebBodyCJK";
const WENKAI_DIR = "/fonts/lxgw-wenkai-screen/";
const ZHENKAI_DIR = "/fonts/lxgw-zhenkai/";

function faces() {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => match[1]).map((body) => ({
    family: /font-family:\s*'([^']+)'/.exec(body)?.[1],
    weight: /font-weight:\s*([^;]+);/.exec(body)?.[1].trim(),
    url: /url\(([^)]+)\)/.exec(body)?.[1],
    subset: /subset-(\d+)\.woff2/.exec(body)?.[1],
    range: /unicode-range:\s*([^;]+)/.exec(body)?.[1].trim(),
    sources: /src:\s*([^;]+);/.exec(body)?.[1],
  }));
}

test("one role family carries both bands of the generated slices", () => {
  const all = faces();
  assert.equal(all.length, 194);
  assert.deepEqual([...new Set(all.map((face) => face.family))], [FAMILY]);
  assert.deepEqual([...new Set(all.map((face) => face.weight))], ["400", "501 900"]);
  for (const face of all) {
    assert.ok(face.subset, `every face names its slice: ${face.url}`);
    assert.ok(face.range, `every face declares a unicode-range: ${face.url}`);
  }
});

test("the bold band mirrors the body band slice for slice", () => {
  const body = faces().filter((face) => face.url.startsWith(WENKAI_DIR));
  const bold = faces().filter((face) => face.url.startsWith(ZHENKAI_DIR));

  assert.equal(body.length, 97);
  assert.equal(bold.length, 97);
  assert.deepEqual(body.map((face) => face.weight), Array(97).fill("400"));
  assert.deepEqual(bold.map((face) => face.weight), Array(97).fill("501 900"));
  assert.deepEqual(
    body.map((face) => face.subset),
    bold.map((face) => face.subset),
    "the two bands must cover the same subset numbers",
  );
  assert.deepEqual(
    body.map((face) => face.range),
    bold.map((face) => face.range),
    "a character that resolves to WenKai at 400 must resolve to the matching ZhenKai slice",
  );
});

test("each band prefers a locally installed face and falls back to the subset", () => {
  for (const face of faces()) {
    const zhenkai = face.url.startsWith(ZHENKAI_DIR);
    const locals = [...face.sources.matchAll(/local\('([^']+)'\)/g)].map((match) => match[1]);

    assert.ok(locals.length > 0, `${face.url} must keep a local() source`);
    assert.ok(
      face.sources.indexOf("local(") < face.sources.indexOf("url("),
      `${face.url} must try the installed font before its own bytes`,
    );
    if (zhenkai) {
      assert.deepEqual(locals, ["LXGW ZhenKai GB", "LXGWZhenKaiGB", "LXGW Zhen Kai", "LXGWZhenKai-Regular"]);
    } else {
      assert.deepEqual(locals, ["LXGW WenKai GB Screen", "LXGWWenKaiGBScreen"]);
    }
  }
});

test("the chat prose stack resolves CJK through the role family", () => {
  const stack = /--font-content:\s*([^;]+);/.exec(globalsCss)?.[1];

  assert.ok(stack, "--font-content must exist");
  assert.match(stack, new RegExp(`"${FAMILY}"`));
  assert.doesNotMatch(stack, /LXGW/, "a single-weight local family in the stack would win every weight");
  // The role family must come before the system CJK fallbacks.
  assert.ok(stack.indexOf(FAMILY) < stack.indexOf("PingFang SC"));
});

test("the markdown body opts out of Chromium's synthetic bold", () => {
  const block = /\.markdown-body\s*\{([^}]*)\}/.exec(globalsCss)?.[1];

  assert.ok(block, "the .markdown-body base rule must exist");
  assert.match(block, /font-family:\s*var\(--font-content\);/);
  assert.match(block, /font-synthesis-weight:\s*none;/);
});
