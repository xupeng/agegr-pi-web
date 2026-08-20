// Image @-mention helpers shared by the chat input preview and the message
// bubble renderer.
//
// Pasted/dropped images are saved to disk (POST /api/attachments) and embedded
// in the message text as "@<absolute-path>" mentions so the agent can read
// them through its file tools even without vision support. That text is the
// single source of truth — the UI previews are derived from it, which is why
// they survive reloads and edits without extra state. We never send an inline
// base64 copy alongside the mention, so the agent receives each image once.

import {
  encodeFilePathForApi,
  joinFilePath,
  normalizeFilePathSlashes,
} from "./file-paths";

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif",
]);

export interface ImageMention {
  /** Path as written in the token (quotes stripped, relative or absolute). */
  path: string;
  /** Index of the "@" character in the text. */
  start: number;
  /** Index one past the end of the token (quotes included). */
  end: number;
}

// Mirrors the @ token grammar from file-fuzzy.ts: "@path" for paths without
// spaces, @"path with spaces" for quoted ones. The @ must sit at the start of
// the text or right after whitespace so emails like foo@bar never match.
const MENTION_RE = /(?:^|\s)@("([^"\n]*)"|([^\s"]*))/g;

export function isImagePath(filePath: string): boolean {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0 || dot === filePath.length - 1) return false;
  return IMAGE_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

function extractAllMentions(text: string): ImageMention[] {
  const mentions: ImageMention[] = [];
  const re = new RegExp(MENTION_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const quoted = match[2];
    const plain = match[3];
    if (quoted == null && plain == null) continue;
    mentions.push({
      path: quoted ?? plain,
      start: match.index + (match[0].startsWith(" ") ? 1 : 0),
      end: match.index + match[0].length,
    });
  }
  return mentions;
}

/**
 * Extract image @-mentions from a message or composer text. Mentions are
 * deduplicated by path (first occurrence wins) so a repeated @ stays a single
 * preview. Only image extensions are returned.
 */
export function extractImageMentions(text: string): ImageMention[] {
  const seen = new Set<string>();
  const images: ImageMention[] = [];
  for (const mention of extractAllMentions(text)) {
    if (!isImagePath(mention.path)) continue;
    if (seen.has(mention.path)) continue;
    seen.add(mention.path);
    images.push(mention);
  }
  return images;
}

/** Closed "@path " mention for one-shot inserts (quoted when it has spaces). */
export function buildImageMentionText(filePath: string): string {
  return filePath.includes(" ") ? `@"${filePath}" ` : `@${filePath} `;
}

/**
 * Remove every mention of `path` from the text (both quoted and plain forms),
 * including the whitespace that precedes the token, so a removed image never
 * leaves a doubled space behind. Returns the text unchanged when the path is
 * not mentioned.
 */
export function removeImageMentionFromText(text: string, path: string): string {
  const toRemove = extractAllMentions(text).filter((mention) => mention.path === path);
  if (toRemove.length === 0) return text;
  let out = text;
  for (let index = toRemove.length - 1; index >= 0; index -= 1) {
    const mention = toRemove[index];
    // Expand to the leading whitespace matched by the token grammar (or the
    // start of the line). Removing only the @ token would leave a stray space,
    // e.g. "see @/a.png and" -> "see  and".
    const lead = mention.start > 0 && /\s/.test(text[mention.start - 1])
      ? mention.start - 1
      : mention.start;
    out = out.slice(0, lead) + out.slice(mention.end);
  }
  // A leading mention removed at the line start exposes the next token's
  // leading whitespace (e.g. "@/a.png @/b.png" minus /a.png).
  return out.replace(/^ +/, "");
}

function isAbsolutePath(filePath: string): boolean {
  return filePath.startsWith("/")
    || /^[a-zA-Z]:[\\/]/.test(filePath)
    || filePath.startsWith("\\\\");
}

/** Resolve a mention path against the session cwd (absolute paths pass through). */
export function resolveMentionPath(mentionPath: string, cwd?: string | null): string {
  const normalized = normalizeFilePathSlashes(mentionPath);
  if (isAbsolutePath(normalized) || !cwd) return normalized;
  return joinFilePath(cwd, normalized);
}

/** Browser-loadable URL for a saved image, served by the /api/files allow-list. */
export function imagePreviewSrc(absolutePath: string): string {
  return `/api/files/${encodeFilePathForApi(absolutePath)}?type=read`;
}
