import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET } = await jiti.import("./route.ts");

test("the ask view font route serves the app's own @font-face manifest", async () => {
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, max-age=300");

  const manifest = await response.json();
  assert.equal(manifest.version, 1);
  assert.ok(Array.isArray(manifest.faces) && manifest.faces.length > 90, "every unicode-range subset is listed");
  assert.deepEqual([...new Set(manifest.faces.map((face) => face.family))].sort(), ["LXGW WenKai Screen", "Oxanium"]);
  for (const face of manifest.faces) {
    assert.match(face.url, /^\/fonts\/[A-Za-z0-9._/-]+\.(woff2|woff|ttf|otf)$/, face.url);
    assert.match(face.unicodeRange, /^U\+/, face.unicodeRange);
    assert.match(face.weight, /^(normal|bold|[0-9]{3}( [0-9]{3})?)$/);
    assert.match(face.style, /^(normal|italic|oblique)/);
    assert.equal(typeof face.display, "string");
    assert.deepEqual(Object.keys(face).sort(), ["display", "family", "style", "unicodeRange", "url", "weight"]);
  }
});

test("the manifest does not depend on the request", async () => {
  const [first, second] = await Promise.all([GET(), GET()]);
  assert.deepEqual(await first.json(), await second.json());
});
