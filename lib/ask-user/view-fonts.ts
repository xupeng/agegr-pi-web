/**
 * The view-side half of Pi Web's webfont contract.
 *
 * The sandboxed ask view runs in an opaque-origin `srcdoc` frame: `default-src
 * 'none'` blocks `font-src`, and Chromium refuses the frame's own request to
 * `/fonts/**` as local-network access, because an opaque origin cannot be
 * granted that permission. So the bytes travel with the projection instead of
 * over the wire: the server builds a manifest from the app's font CSS
 * (`lib/ask-user/view-font-manifest.ts`, which reads files and therefore must
 * never be imported from the browser), `GET /api/ask-user/font-faces` serves it,
 * the host keeps the faces this ask needs with the helpers below, and the frame
 * installs the bytes as `FontFace` objects, which need neither a URL nor
 * `font-src`.
 *
 * This module is imported by the client component `components/AskUserAppHost.tsx`,
 * so it must not name a `node:` specifier or anything else the browser bundle
 * cannot resolve - webpack fails the production build with
 * `UnhandledSchemeError` when it does.
 */

/** Families Pi Web renders its chat text in. */
export const ASK_USER_VIEW_FONT_FAMILIES = ["Oxanium", "LXGW WenKai Screen"] as const;

/** Bump when the manifest shape changes; the host rejects other versions. */
export const ASK_USER_VIEW_FONT_MANIFEST_VERSION = 1;

export interface AskUserViewFontFace {
  family: string;
  style: string;
  weight: string;
  display: string;
  unicodeRange: string;
  url: string;
}

/** Glyphs the view draws itself, which no projection text mentions. */
export const ASK_USER_VIEW_DECORATION_TEXT = "0123456789○◉☐☑✓·—…()/:*+-.,";

/**
 * Rebounds for the corpus: the projection is bounded, but the walk is recursive
 * and must not depend on that.
 */
const MAX_CORPUS_LENGTH = 20_000;
const MAX_CORPUS_DEPTH = 8;

/** Quotes and whitespace are not part of a family name; the manifest parser shares this. */
export function normalizeFamily(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

/**
 * Every string the frame can paint, so subset selection cannot miss text the
 * projection happens to carry in a field this module does not know about.
 */
export function collectViewText(structuredContent: unknown, labels: Record<string, string> = {}): string {
  const parts: string[] = [ASK_USER_VIEW_DECORATION_TEXT];
  let length = parts[0].length;
  const visit = (value: unknown, depth: number) => {
    if (typeof value === "string") {
      const remaining = MAX_CORPUS_LENGTH - length;
      if (remaining <= 0) return;
      const slice = value.length > remaining ? value.slice(0, remaining) : value;
      parts.push(slice);
      length += slice.length;
      return;
    }
    if (length >= MAX_CORPUS_LENGTH) return;
    if (typeof value !== "object" || value === null || depth >= MAX_CORPUS_DEPTH) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    for (const item of Object.values(value as Record<string, unknown>)) visit(item, depth + 1);
  };
  visit(structuredContent, 0);
  visit(labels, 0);
  return parts.join("");
}

/** Parses `U+4E00-9FFF, U+0131` into inclusive codepoint ranges. */
function parseUnicodeRanges(value: string): Array<[number, number]> | null {
  const ranges: Array<[number, number]> = [];
  for (const part of value.split(",")) {
    const raw = part.trim().replace(/^U\+/i, "");
    // A wildcard range cannot be reasoned about; treat the face as unbounded.
    if (raw === "" || raw.includes("?")) return null;
    const [start, end] = raw.split("-");
    const from = Number.parseInt(start, 16);
    const to = end === undefined ? from : Number.parseInt(end, 16);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return null;
    ranges.push([from, to]);
  }
  return ranges.length > 0 ? ranges : null;
}

/**
 * The families a CSS font stack names, in order, quotes stripped.
 *
 * Used to skip faces for families the forwarded stack never references: bytes
 * for an unreferenced family are dead weight in the frame (and posting them
 * would also mean shipping the whole vendored CJK set whenever the UI stack,
 * which relies on the device's own sans, asks for no CJK face at all).
 */
export function fontFamiliesInStack(stack: string): string[] {
  const families: string[] = [];
  // Quoted names first, then a bare run that stops at a comma or a quote, so a
  // family that follows a comma cannot swallow the delimiter's quotes.
  const pattern = /"([^"]*)"|'([^']*)'|([^,"']+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stack)) !== null) {
    const name = normalizeFamily(match[1] ?? match[2] ?? match[3] ?? "");
    if (name.length > 0 && !families.includes(name)) families.push(name);
  }
  return families;
}

/** The manifest entries whose family the stack can actually reach. */
export function filterViewFontFacesByStack(
  faces: readonly AskUserViewFontFace[],
  stack: string,
): AskUserViewFontFace[] {
  const wanted = fontFamiliesInStack(stack);
  return faces.filter((face) => wanted.some((family) => normalizeFamily(family) === normalizeFamily(face.family)));
}

/**
 * The faces whose subset actually covers `text`. Faces the range parser cannot
 * understand are kept, so an unexpected manifest degrades to "load it anyway"
 * rather than to a silently unstyled frame.
 */
export function selectViewFontFaces(
  faces: readonly AskUserViewFontFace[],
  text: string,
  maxFaces: number,
): AskUserViewFontFace[] {
  const codepoints = new Set<number>();
  for (const character of text) {
    const point = character.codePointAt(0);
    if (point !== undefined) codepoints.add(point);
  }
  const selected: AskUserViewFontFace[] = [];
  for (const face of faces) {
    if (selected.length >= maxFaces) break;
    const ranges = parseUnicodeRanges(face.unicodeRange);
    if (ranges === null) {
      selected.push(face);
      continue;
    }
    const needed = ranges.some(([from, to]) => {
      for (const point of codepoints) {
        if (point >= from && point <= to) return true;
      }
      return false;
    });
    if (needed) selected.push(face);
  }
  return selected;
}
