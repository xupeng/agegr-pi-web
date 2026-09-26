/**
 * The server side of Pi Web's webfont contract: it rebuilds the faces the ask
 * view may use from the app's own font stylesheets.
 *
 * Every face is rebuilt from an allow-list of descriptors and the app's own
 * `/fonts/**` paths, and a rule that loses its `src`, `font-family` or
 * `unicode-range` is dropped rather than emitted half-declared, because an
 * unranged face would claim every codepoint.
 *
 * This module reads the filesystem, so it stays server-side: the client
 * component that selects the faces imports `lib/ask-user/view-fonts.ts`, and a
 * `node:` specifier reaching that module breaks `next build --webpack` with
 * `UnhandledSchemeError` in the browser bundle.
 */

import {
  ASK_USER_VIEW_FONT_FAMILIES,
  normalizeFamily,
  type AskUserViewFontFace,
} from "./view-fonts";

/** App-relative sources of the declarations, read at request time. */
export const ASK_USER_VIEW_FONT_CSS_FILES = [
  "app/fonts.css",
  "app/fonts-lxgw-wenkai-screen.css",
] as const;

const ALLOWED_DESCRIPTORS = new Set([
  "font-family",
  "font-style",
  "font-weight",
  "font-display",
  "src",
  "unicode-range",
]);

const FONT_URL_PATTERN = /^\/fonts\/[A-Za-z0-9._/-]+\.(?:woff2|woff|ttf|otf)$/;
const SRC_PATTERN = /^url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]+))\s*\)\s*(?:format\(\s*["']?([A-Za-z0-9-]+)["']?\s*\))?$/;
const UNICODE_RANGE_PATTERN = /^U\+[0-9A-Fa-f?]+(?:-[0-9A-Fa-f]+)?(?:\s*,\s*U\+[0-9A-Fa-f?]+(?:-[0-9A-Fa-f]+)?)*$/;
const FONT_WEIGHT_PATTERN = /^(?:normal|bold|[0-9]{3}(?:\s+[0-9]{3})?)$/;
const FONT_STYLE_PATTERN = /^(?:normal|italic|oblique(?: -?[0-9]{1,3}deg)?)$/;
const FONT_DISPLAY_PATTERN = /^(?:auto|block|swap|fallback|optional)$/;

function readDescriptor(name: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !ALLOWED_DESCRIPTORS.has(name)) return "";
  switch (name) {
    case "font-family":
      return normalizeFamily(trimmed);
    case "font-style":
      return FONT_STYLE_PATTERN.test(trimmed) ? trimmed : "";
    case "font-weight":
      return FONT_WEIGHT_PATTERN.test(trimmed) ? trimmed : "";
    case "font-display":
      return FONT_DISPLAY_PATTERN.test(trimmed) ? trimmed : "";
    case "unicode-range":
      return UNICODE_RANGE_PATTERN.test(trimmed) ? trimmed.replace(/\s*,\s*/g, ",") : "";
    case "src": {
      const match = SRC_PATTERN.exec(trimmed);
      if (!match) return "";
      const url = (match[1] ?? match[2] ?? match[3] ?? "").trim();
      if (!FONT_URL_PATTERN.test(url) || url.includes("..")) return "";
      return url;
    }
    default:
      return "";
  }
}

/**
 * Parses the app's font stylesheets into the faces the view may use. A rule that
 * loses its `src`, `font-family` or `unicode-range` is dropped rather than
 * emitted half-declared, because an unranged face would claim every codepoint.
 */
export function buildViewFontManifest(cssTexts: readonly string[]): AskUserViewFontFace[] {
  const faces: AskUserViewFontFace[] = [];
  for (const cssText of cssTexts) {
    if (typeof cssText !== "string" || cssText.length === 0) continue;
    const withoutComments = cssText.replace(/\/\*[\s\S]*?\*\//g, " ");
    const blocks = withoutComments.match(/@font-face\s*\{[^{}]*\}/gi) ?? [];
    for (const block of blocks) {
      const body = block.slice(block.indexOf("{") + 1, block.lastIndexOf("}"));
      const descriptors: Record<string, string> = {};
      for (const part of body.split(";")) {
        const separator = part.indexOf(":");
        if (separator === -1) continue;
        const name = part.slice(0, separator).trim().toLowerCase();
        if (descriptors[name] !== undefined) continue;
        const value = readDescriptor(name, part.slice(separator + 1));
        if (value !== "") descriptors[name] = value;
      }
      const family = descriptors["font-family"];
      const url = descriptors.src;
      const unicodeRange = descriptors["unicode-range"];
      if (!family || !url || !unicodeRange) continue;
      if (!(ASK_USER_VIEW_FONT_FAMILIES as readonly string[]).includes(family)) continue;
      faces.push({
        family,
        style: descriptors["font-style"] ?? "normal",
        weight: descriptors["font-weight"] ?? "400",
        display: descriptors["font-display"] ?? "swap",
        unicodeRange,
        url,
      });
    }
  }
  return faces;
}

/** Reads the manifest from the app's source CSS; missing files are not an error. */
export async function readViewFontManifest(root: string = process.cwd()): Promise<AskUserViewFontFace[]> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const cssTexts: string[] = [];
  for (const relativePath of ASK_USER_VIEW_FONT_CSS_FILES) {
    try {
      cssTexts.push(await readFile(join(root, relativePath), "utf8"));
    } catch {
      // A deployment that drops the sources simply loses the webfonts.
    }
  }
  return buildViewFontManifest(cssTexts);
}

