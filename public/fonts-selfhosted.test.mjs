import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// The regression this guards: `app/layout.tsx` linked Oxanium and LXGW WenKai
// Screen from fonts.googleapis.com and cdn.jsdelivr.net, so any browser that
// could not reach those CDNs silently fell back to a default font. The faces are
// now vendored under `public/fonts/`; keep them complete, licensed, and free of
// external font hosts.
//
// `app/fonts-content-cjk.css` declares two weight bands of one role family: the
// WenKai Screen slices at 400 and the ZhenKai GB slices at 501-900. Each CJK
// family therefore keeps its own directory, subset count, manifest and notice
// next to the bytes.

const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const oxaniumCss = await readFile(new URL("../app/fonts.css", import.meta.url), "utf8");
const cjkCss = await readFile(new URL("../app/fonts-content-cjk.css", import.meta.url), "utf8");

const publicDir = new URL("./", import.meta.url);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Every vendored CJK family: its directory and the source its NOTICE.txt must
// name. Each ships one `unicode-range` slice per line of the other's list.
const CJK_FAMILIES = [
  { dir: "lxgw-wenkai-screen", notice: /lxgw-wenkai-screen-webfont@1\.7\.0/ },
  { dir: "lxgw-zhenkai", notice: /lxgw\/LxgwZhenKai v0\.825/ },
];
const CJK_SUBSETS_PER_FAMILY = 97;

function cjkPathsFor(dir, css = cjkCss) {
  return referencedFontPaths(css).filter((pathname) => pathname.startsWith(`/fonts/${dir}/`));
}

function referencedFontPaths(css) {
  // The generated CJK stylesheet keeps upstream's unquoted `url(...)` form.
  return [...css.matchAll(/url\(\s*["']?(\/fonts\/[^"')]+)["']?\s*\)/g)].map((match) => match[1]);
}

async function readPublicFile(pathname) {
  return readFile(new URL(`.${pathname}`, publicDir));
}

test("layout no longer links webfonts from an external CDN", () => {
  assert.match(layoutSource, /import "\.\/fonts\.css";/);
  assert.match(layoutSource, /import "\.\/fonts-content-cjk\.css";/);
  assert.doesNotMatch(layoutSource, /fonts-lxgw-wenkai-screen\.css/);
  assert.doesNotMatch(layoutSource, /fonts\.googleapis\.com/);
  assert.doesNotMatch(layoutSource, /fonts\.gstatic\.com/);
  assert.doesNotMatch(layoutSource, /cdn\.jsdelivr\.net/);
});

test("every self-hosted @font-face url resolves to a file in public/", async () => {
  const oxaniumPaths = referencedFontPaths(oxaniumCss);
  const cjkPaths = referencedFontPaths(cjkCss);

  assert.equal(oxaniumPaths.length, 2);
  assert.equal(new Set(oxaniumPaths).size, 2);
  assert.equal(cjkPaths.length, CJK_FAMILIES.length * CJK_SUBSETS_PER_FAMILY);
  assert.equal(new Set(cjkPaths).size, cjkPaths.length, "each unicode-range subset needs its own file");
  for (const { dir } of CJK_FAMILIES) {
    assert.equal(cjkPathsFor(dir).length, CJK_SUBSETS_PER_FAMILY, `${dir} must declare every slice`);
  }

  for (const pathname of [...oxaniumPaths, ...cjkPaths]) {
    const bytes = await readPublicFile(pathname);
    assert.ok(bytes.byteLength > 0, `${pathname} must not be empty`);
  }
});

test("the vendored subsets are exactly the files the stylesheets declare", async () => {
  for (const { dir } of CJK_FAMILIES) {
    const declared = new Set(cjkPathsFor(dir).map((pathname) => pathname.split("/").pop()));
    const onDisk = new Set(
      (await readdir(new URL(`./fonts/${dir}/`, publicDir))).filter((name) => name.endsWith(".woff2")),
    );

    assert.deepEqual([...onDisk].sort(), [...declared].sort(), `${dir} must ship exactly its declared slices`);
  }
});

test("each lxgw subset manifest matches the shipped bytes", async () => {
  for (const { dir } of CJK_FAMILIES) {
    const manifest = (await readPublicFile(`/fonts/${dir}/SHA256SUMS.txt`)).toString("utf8");
    const entries = manifest
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [hash, name] = line.split(/\s+/);
        return { hash, name };
      });

    assert.equal(entries.length, CJK_SUBSETS_PER_FAMILY, `${dir}/SHA256SUMS.txt`);
    for (const { hash, name } of entries) {
      const actual = sha256(await readPublicFile(`/fonts/${dir}/${name}`));
      assert.equal(actual, hash, `${dir}/${name} no longer matches SHA256SUMS.txt`);
    }
  }
});

test("each vendored family ships its license next to the fonts", async () => {
  const oxaniumLicense = (await readPublicFile("/fonts/oxanium/LICENSE-oxanium.txt")).toString("utf8");
  const oxaniumNotice = (await readPublicFile("/fonts/oxanium/NOTICE.txt")).toString("utf8");
  assert.match(oxaniumLicense, /SIL Open Font License, Version 1\.1/);
  assert.match(oxaniumNotice, /@fontsource-variable\/oxanium@5\.3\.0/);
  for (const name of ["oxanium-latin-wght-normal.woff2", "oxanium-latin-ext-wght-normal.woff2"]) {
    const declared = new RegExp(`([0-9a-f]{64})\\s+${name.replaceAll(".", "\\.")}`).exec(oxaniumNotice);
    assert.ok(declared, `NOTICE.txt must declare a SHA-256 for ${name}`);
    assert.equal(declared[1], sha256(await readPublicFile(`/fonts/oxanium/${name}`)));
  }

  for (const { dir, notice } of CJK_FAMILIES) {
    const ofl = (await readPublicFile(`/fonts/${dir}/OFL.txt`)).toString("utf8");
    assert.match(ofl, /SIL Open Font License, Version 1\.1/);
    assert.match((await readPublicFile(`/fonts/${dir}/NOTICE.txt`)).toString("utf8"), notice);
  }

  // The WenKai package license (MIT) covers the upstream packaging scripts.
  await readPublicFile("/fonts/lxgw-wenkai-screen/LICENSE.txt");
});
