import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MASKABLE_FILE = join(here, "icon-512-maskable.png");
const SIZE = 512;
/** Chromium's maskable safe circle: radius 40% of the icon's width. */
const SAFE_RADIUS = 0.4 * SIZE;
/** The bubble's own colour, used as the maskable plate. */
const PLATE = { r: 0x23, g: 0x45, b: 0x4b };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Minimal 8-bit RGBA, non-interlaced PNG reader. The repo has no PNG decoder in
 * its dependency list (Next's `sharp` is transitive and the image optimizer is
 * deliberately off), and the alternative — trusting that a regenerated asset
 * keeps the maskable geometry — is exactly the mistake this test exists to stop.
 */
function decodePng(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "not a PNG");

  let offset = 8;
  let header = null;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  assert.ok(header, "PNG has no IHDR chunk");
  const bytesPerPixel = 4;
  const stride = header.width * bytesPerPixel;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(header.height * stride);

  let cursor = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const row = raw.subarray(cursor, cursor + stride);
    cursor += stride;
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? out[x - bytesPerPixel] : 0;
      const up = previous ? previous[x] : 0;
      const upLeft = previous && x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      switch (filter) {
        case 0: out[x] = row[x]; break;
        case 1: out[x] = row[x] + left; break;
        case 2: out[x] = row[x] + up; break;
        case 3: out[x] = row[x] + ((left + up) >> 1); break;
        case 4: out[x] = row[x] + paeth(left, up, upLeft); break;
        default: throw new Error(`unsupported PNG filter ${filter} on row ${y}`);
      }
      out[x] &= 0xff;
    }
  }

  return { header, pixels, stride };
}

function eachPixel({ header, pixels, stride }, visit) {
  for (let y = 0; y < header.height; y += 1) {
    for (let x = 0; x < header.width; x += 1) {
      const at = y * stride + x * 4;
      visit(pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3], x, y);
    }
  }
}

test("the maskable icon is a 512px non-interlaced RGBA PNG", () => {
  const { header } = decodePng(readFileSync(MASKABLE_FILE));
  assert.deepEqual(
    { width: header.width, height: header.height, bitDepth: header.bitDepth, colorType: header.colorType, interlace: header.interlace },
    { width: SIZE, height: SIZE, bitDepth: 8, colorType: 6, interlace: 0 },
  );
});

test("the maskable icon is fully opaque", () => {
  const image = decodePng(readFileSync(MASKABLE_FILE));
  let transparent = 0;
  eachPixel(image, (...[, , , alpha]) => {
    if (alpha !== 255) transparent += 1;
  });
  assert.equal(transparent, 0, "a maskable icon must not rely on transparency");
});

test("every mark pixel stays inside the maskable safe circle", () => {
  const image = decodePng(readFileSync(MASKABLE_FILE));
  const center = SIZE / 2;
  let outside = 0;
  let markPixels = 0;
  let furthest = 0;

  eachPixel(image, (r, g, b, _, x, y) => {
    if (r === PLATE.r && g === PLATE.g && b === PLATE.b) return;
    markPixels += 1;
    const radius = Math.hypot(x + 0.5 - center, y + 0.5 - center);
    furthest = Math.max(furthest, radius);
    if (radius > SAFE_RADIUS) outside += 1;
  });

  assert.equal(outside, 0, `${outside} mark pixel(s) fall outside the 40% safe circle`);
  assert.ok(markPixels > 1000, `expected the π glyph to be present, found ${markPixels} mark pixels`);
  // The 0.50 scale keeps the mark comfortably inside; anything close to the limit
  // means the source artwork or the scale changed without re-checking the mask.
  assert.ok(furthest <= SAFE_RADIUS * 0.8, `mark reaches ${furthest.toFixed(1)}px, expected < ${(SAFE_RADIUS * 0.8).toFixed(1)}px`);
});

test("the manifest declares the maskable icon alongside both `any` icons", async () => {
  const manifest = (await import("../../app/manifest.ts")).default;
  const icons = manifest().icons;
  const byPurpose = (purpose) => icons.filter((icon) => icon.purpose === purpose).map((icon) => `${icon.src} ${icon.sizes}`);

  assert.deepEqual(byPurpose("maskable"), ["/icons/icon-512-maskable.png 512x512"]);
  assert.deepEqual(
    byPurpose("any"),
    ["/icons/icon-192.png 192x192", "/icons/icon-512.png 512x512"],
  );
});
