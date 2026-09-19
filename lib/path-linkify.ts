/**
 * Decide whether a plain-text token points at a file the current project index
 * knows about, and if so produce the paths needed to open it.
 *
 * Pure and synchronous: the async index is fetched by `hooks/useFileIndex.ts`
 * and passed in as `lookup`. `lookup === null` means "no index yet" and nothing
 * is ever linked — a shape that merely looks like a path is not enough (D2).
 */

import { isPathInside, normalizeLocalPath, resolveLocalFilePath } from "./file-links";

/** Upper bound on a candidate token, to avoid scanning very long prose. */
export const MAX_LINK_TOKEN_LENGTH = 300;

export interface FileIndexLookup {
  /** Absolute cwd the index paths are relative to. */
  cwd: string;
  /** Normalized cwd-relative paths (case-folded on Windows). */
  relative: Set<string>;
  /** Lowercased basename → every relative path with that basename (R7). */
  byBaseName: Map<string, string[]>;
  /** True when `/api/file-index` hit MAX_FILES; disables unique-basename completion. */
  truncated: boolean;
}

export interface LinkifyContext {
  lookup: FileIndexLookup | null;
}

export interface LinkedFileMatch {
  /** Absolute path to open. */
  filePath: string;
  /** cwd-relative path as listed by the index. */
  relativePath: string;
}

export interface LinkifiedSegment {
  text: string;
  /** Present when this segment is a verified file reference. */
  match?: LinkedFileMatch;
}

const EXCLUDED_TOKENS = new Set([
  "import.meta",
  "e.g",
  "i.e",
  "etc",
  "vs",
  "a.m",
  "p.m",
]);

const LEAD_PUNCT_RE = /^[([{"'`]+/;
const TRAIL_PUNCT_RE = /[)\]}"'`.,;:!?]+$/;
const TOKEN_SPLIT_RE = /(\s+)/;

function isWindowsStylePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("//");
}

function basename(filePath: string): string {
  return filePath.split("/").pop() ?? "";
}

/** Build the lookup used by every linkify call for one cwd. */
export function buildFileIndexLookup(
  files: readonly string[],
  cwd: string,
  truncated = false,
): FileIndexLookup {
  const caseInsensitive = isWindowsStylePath(cwd);
  const relative = new Set<string>();
  const byBaseName = new Map<string, string[]>();

  for (const raw of files) {
    if (typeof raw !== "string" || raw.length === 0) continue;
    const rel = normalizeLocalPath(raw);
    if (!rel || rel === "." || rel === ".." || rel.startsWith("/") || rel.startsWith("../")) continue;

    relative.add(caseInsensitive ? rel.toLowerCase() : rel);
    const base = basename(rel).toLowerCase();
    if (!base) continue;
    const existing = byBaseName.get(base);
    if (existing) {
      if (!existing.includes(rel)) existing.push(rel);
    } else {
      byBaseName.set(base, [rel]);
    }
  }

  return { cwd, relative, byBaseName, truncated };
}

function isExcludedToken(token: string): boolean {
  if (token.startsWith("@") || token.startsWith("#") || token.startsWith("?")) return true;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(token)) return true;
  if (/^(mailto|tel|data|javascript|file):/i.test(token)) return true;
  // Any other scheme is not a file; a Windows drive is the exception.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(token) && !/^[a-zA-Z]:[\\/]/.test(token)) return true;
  if (EXCLUDED_TOKENS.has(token.toLowerCase())) return true;
  // Bare words without an extension are prose, not paths.
  if (!token.includes("/") && !token.includes("\\") && !/\.[A-Za-z0-9]/.test(token)) return true;
  return false;
}

function matchLookup(candidate: string, lookup: FileIndexLookup): LinkedFileMatch | null {
  const normalizedCandidate = normalizeLocalPath(candidate);
  const normalizedCwd = normalizeLocalPath(lookup.cwd);
  const caseInsensitive = isWindowsStylePath(lookup.cwd);
  if (!isPathInside(
    caseInsensitive ? normalizedCandidate.toLowerCase() : normalizedCandidate,
    caseInsensitive ? normalizedCwd.toLowerCase() : normalizedCwd,
  )) return null;
  const prefix = normalizedCwd.endsWith("/") ? normalizedCwd : `${normalizedCwd}/`;
  const relativePath = normalizedCandidate.slice(prefix.length);
  if (!relativePath) return null;
  const key = isWindowsStylePath(lookup.cwd) ? relativePath.toLowerCase() : relativePath;
  if (!lookup.relative.has(key)) return null;
  return { filePath: normalizedCandidate, relativePath };
}

/**
 * Resolve one candidate token to an indexed file.
 *
 * Exact index hits win. When the token is a bare basename (no directory) and
 * the index is complete, a unique basename match is completed to its full
 * relative path (R7); ambiguity stays plain text.
 */
export function linkifyToken(raw: string, context: LinkifyContext): LinkedFileMatch | null {
  const lookup = context.lookup;
  if (!lookup) return null;
  const token = raw.trim();
  if (!token || token.length > MAX_LINK_TOKEN_LENGTH) return null;
  const withoutLine = token.replace(/:\d+(?::\d+)?$/, "");
  if (!withoutLine || isExcludedToken(withoutLine)) return null;

  const candidate = resolveLocalFilePath(withoutLine, lookup.cwd);
  if (candidate) {
    const exact = matchLookup(candidate, lookup);
    if (exact) return exact;
  }

  const isBare = !withoutLine.includes("/") && !withoutLine.includes("\\");
  if (isBare && !lookup.truncated) {
    const matches = lookup.byBaseName.get(basename(withoutLine).toLowerCase());
    if (matches && matches.length === 1) {
      const relativePath = matches[0];
      const filePath = normalizeLocalPath(`${normalizeLocalPath(lookup.cwd)}/${relativePath}`);
      return { filePath, relativePath };
    }
  }

  return null;
}

function linkifyWord(word: string, context: LinkifyContext): LinkifiedSegment[] | null {
  const lead = LEAD_PUNCT_RE.exec(word)?.[0] ?? "";
  const rest = word.slice(lead.length);
  const trail = TRAIL_PUNCT_RE.exec(rest)?.[0] ?? "";
  const core = rest.slice(0, rest.length - trail.length);
  if (!core) return null;
  const match = linkifyToken(core, context);
  if (!match) return null;
  const segments: LinkifiedSegment[] = [];
  if (lead) segments.push({ text: lead });
  segments.push({ text: core, match });
  if (trail) segments.push({ text: trail });
  return segments;
}

/**
 * Split plain text into text/file segments. Whitespace is preserved verbatim so
 * `<pre>` callers keep their alignment and wrapping.
 */
export function linkifyPlainText(text: string, context: LinkifyContext): LinkifiedSegment[] {
  if (!context.lookup) return [{ text }];
  const segments: LinkifiedSegment[] = [];
  for (const part of text.split(TOKEN_SPLIT_RE)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      segments.push({ text: part });
      continue;
    }
    const linked = linkifyWord(part, context);
    if (linked) segments.push(...linked);
    else segments.push({ text: part });
  }
  return mergeAdjacentText(segments);
}

function mergeAdjacentText(segments: LinkifiedSegment[]): LinkifiedSegment[] {
  const merged: LinkifiedSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && !last.match && !segment.match) {
      last.text += segment.text;
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
}
