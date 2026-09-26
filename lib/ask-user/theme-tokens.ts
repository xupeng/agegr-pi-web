/**
 * Design tokens the host mirrors into the sandboxed ask view.
 *
 * The view runs in an opaque-origin `srcdoc` frame, so it cannot inherit Pi
 * Web's CSS custom properties and cannot resolve `var()` against the host
 * document. Pi Web ships five palettes (light, dark, mist, rose, pine), so
 * telling the view "light" or "dark" and letting it guess a palette is not
 * enough: the host reads the values it actually computed and sends them.
 *
 * This module is the single place that decides which tokens may cross that
 * boundary and what a value is allowed to look like. `structuredContent.tokens`
 * is untrusted CSS text as far as the frame is concerned, so every value is
 * validated here *and* again in the view script before it reaches
 * `setProperty` — the view is an inlined script and cannot import this file,
 * so its `TOKENS` table and `sanitizeToken` must be kept in step by hand.
 */

export const ASK_USER_THEME_TOKENS = [
  { key: "bg", cssVar: "--bg", kind: "color" },
  { key: "bgPanel", cssVar: "--bg-panel", kind: "color" },
  { key: "bgHover", cssVar: "--bg-hover", kind: "color" },
  { key: "bgSelected", cssVar: "--bg-selected", kind: "color" },
  { key: "border", cssVar: "--border", kind: "color" },
  { key: "text", cssVar: "--text", kind: "color" },
  { key: "textMuted", cssVar: "--text-muted", kind: "color" },
  { key: "textDim", cssVar: "--text-dim", kind: "color" },
  { key: "accent", cssVar: "--accent", kind: "color" },
  { key: "accentContrast", cssVar: "--accent-contrast", kind: "color" },
  { key: "maxWidth", cssVar: "--chat-content-max-width", kind: "length" },
] as const;

export type AskUserThemeTokenKey = (typeof ASK_USER_THEME_TOKENS)[number]["key"];
export type AskUserThemeTokens = Partial<Record<AskUserThemeTokenKey, string>>;

const MAX_TOKEN_LENGTH = 64;
const COLOR_PATTERN =
  /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color|light-dark)\([0-9a-zA-Z.,%/\s+-]*\)|transparent|currentcolor)$/;
const LENGTH_PATTERN = /^[0-9]+(\.[0-9]+)?(px|rem|em)$/;
/** Characters that could end the declaration and start an attacker's own. */
const FORBIDDEN_PATTERN = /[;{}"'<>\\]/;
/** `var()` cannot resolve across the sandbox boundary; the rest are CSS escapes. */
const FORBIDDEN_KEYWORDS = /url\s*\(|expression\s*\(|var\s*\(|!important|@/i;

const KIND_BY_KEY: Record<string, "color" | "length"> = Object.fromEntries(
  ASK_USER_THEME_TOKENS.map((token) => [token.key, token.kind]),
);

/**
 * Returns the value to mirror, or `undefined` when the token is unknown or the
 * value is not something this app is willing to put into a style declaration.
 */
export function sanitizeThemeTokenValue(key: string, value: unknown): string | undefined {
  const kind = KIND_BY_KEY[key];
  if (kind === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TOKEN_LENGTH) return undefined;
  if (FORBIDDEN_PATTERN.test(trimmed) || FORBIDDEN_KEYWORDS.test(trimmed)) return undefined;
  const pattern = kind === "color" ? COLOR_PATTERN : LENGTH_PATTERN;
  return pattern.test(trimmed) ? trimmed : undefined;
}

/**
 * Reads the whitelisted tokens through `read` (a `getPropertyValue`-shaped
 * function) and drops everything that fails validation, so a missing or
 * unusable token simply keeps the view's built-in default.
 */
export function readThemeTokens(
  read: (cssVar: string) => string | null | undefined,
): AskUserThemeTokens {
  const tokens: AskUserThemeTokens = {};
  for (const token of ASK_USER_THEME_TOKENS) {
    const value = sanitizeThemeTokenValue(token.key, read(token.cssVar));
    if (value !== undefined) tokens[token.key] = value;
  }
  return tokens;
}
