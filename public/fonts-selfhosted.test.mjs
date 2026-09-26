import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

// The regression this guards: `app/layout.tsx` linked Oxanium and LXGW WenKai
// Screen from fonts.googleapis.com and cdn.jsdelivr.net, so any browser that
// could not reach those CDNs silently fell back to a default font. The faces are
// now vendored under `public/fonts/`; keep them complete, licensed, and free of
// external font hosts.

const layoutSource = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const oxaniumCss = await readFile(new URL("../app/fonts.css", import.meta.url), "utf8");
const lxgwCss = await readFile(new URL("../app/fonts-lxgw-wenkai-screen.css", import.meta.url), "utf8");

const publicDir = new URL("./", import.meta.url);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function referencedFontPaths(css) {
  // The generated LXGW stylesheet keeps upstream's unquoted `url(...)` form.
  return [...css.matchAll(/url\(\s*["']?(\/fonts\/[^"')]+)["']?\s*\)/g)].map((match) => match[1]);
}

async function readPublicFile(pathname) {
  return readFile(new URL(`.${pathname}`, publicDir));
}

test("layout no longer links webfonts from an external CDN", () => {
  assert.match(layoutSource, /import "\.\/fonts\.css";/);
  assert.match(layoutSource, /import "\.\/fonts-lxgw-wenkai-screen\.css";/);
  assert.doesNotMatch(layoutSource, /fonts\.googleapis\.com/);
  assert.doesNotMatch(layoutSource, /fonts\.gstatic\.com/);
  assert.doesNotMatch(layoutSource, /cdn\.jsdelivr\.net/);
});

test("every self-hosted @font-face url resolves to a file in public/", async () => {
  const oxaniumPaths = referencedFontPaths(oxaniumCss);
  const lxgwPaths = referencedFontPaths(lxgwCss);

  assert.equal(oxaniumPaths.length, 2);
  assert.equal(new Set(oxaniumPaths).size, 2);
  assert.equal(lxgwPaths.length, 97);
  assert.equal(new Set(lxgwPaths).size, 97, "each unicode-range subset needs its own file");

  for (const pathname of [...oxaniumPaths, ...lxgwPaths]) {
    const bytes = await readPublicFile(pathname);
    assert.ok(bytes.byteLength > 0, `${pathname} must not be empty`);
  }
});

test("the vendored subsets are exactly the files the stylesheet declares", async () => {
  const declared = new Set(referencedFontPaths(lxgwCss).map((pathname) => pathname.split("/").pop()));
  const onDisk = new Set((await readdir(new URL("./fonts/lxgw-wenkai-screen/", publicDir))).filter((name) => name.endsWith(".woff2")));

  assert.deepEqual([...onDisk].sort(), [...declared].sort());
});

test("the lxgw subset manifest matches the shipped bytes", async () => {
  const manifest = (await readPublicFile("/fonts/lxgw-wenkai-screen/SHA256SUMS.txt")).toString("utf8");
  const entries = manifest
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, name] = line.split(/\s+/);
      return { hash, name };
    });

  assert.equal(entries.length, 97);
  for (const { hash, name } of entries) {
    const actual = sha256(await readPublicFile(`/fonts/lxgw-wenkai-screen/${name}`));
    assert.equal(actual, hash, `${name} no longer matches SHA256SUMS.txt`);
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

  const lxgwOfl = (await readPublicFile("/fonts/lxgw-wenkai-screen/OFL.txt")).toString("utf8");
  const lxgwNotice = (await readPublicFile("/fonts/lxgw-wenkai-screen/NOTICE.txt")).toString("utf8");
  assert.match(lxgwOfl, /SIL Open Font License, Version 1\.1/);
  assert.match(lxgwNotice, /lxgw-wenkai-screen-webfont@1\.7\.0/);
  await readPublicFile("/fonts/lxgw-wenkai-screen/LICENSE.txt");
});
