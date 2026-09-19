import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The regression this guards: `public/fonts/` ships four OFL-licensed Cascadia Code
// webfonts, but the license text and the provenance notice once lived only inside an
// isolated release directory, so they were missing from the repository (and from the
// published 0.9.4 tarball) while the font files themselves were present. Keep both
// files next to the fonts, and keep NOTICE.txt honest about the bytes it describes.

const WEIGHTS = [400, 500, 600, 700];
const FONT_FILES = WEIGHTS.map((weight) => `cascadia-code-latin-${weight}-normal.woff2`);

const readFontsFile = (name) => readFile(new URL(`./fonts/${name}`, import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("public/fonts ships the license text and provenance notice next to the webfonts", async () => {
  const license = (await readFontsFile("LICENSE-cascadia-code.txt")).toString("utf8");
  const notice = (await readFontsFile("NOTICE.txt")).toString("utf8");

  assert.match(license, /SIL Open Font License, Version 1\.1/);
  assert.match(license, /Reserved Font Name Cascadia Code/);
  for (const file of FONT_FILES) {
    assert.ok(notice.includes(file), `NOTICE.txt must mention ${file}`);
  }
  assert.match(notice, /@fontsource\/cascadia-code@5\.3\.0/);
});

test("NOTICE.txt declares the SHA-256 of every bundled webfont", async () => {
  const notice = (await readFontsFile("NOTICE.txt")).toString("utf8");

  for (const file of FONT_FILES) {
    const declared = new RegExp(`([0-9a-f]{64})\\s+${file.replaceAll(".", "\\.")}`).exec(notice);
    assert.ok(declared, `NOTICE.txt must declare a SHA-256 for ${file}`);
    const actual = sha256(await readFontsFile(file));
    assert.equal(
      declared[1],
      actual,
      `${file} no longer matches the hash NOTICE.txt publishes`
    );
  }
});
