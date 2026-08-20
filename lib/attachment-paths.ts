import os from "os";
import path from "path";

// Attachment images are saved per-project (the chat input sends the session
// cwd with the upload) under `<projectRoot>/.pi-web/attachments/`, so each
// project keeps its own images next to the code they describe. Sessions that
// have no cwd yet (brand-new sessions) fall back to a shared home directory.

export const ATTACHMENTS_SUBDIR = path.join(".pi-web", "attachments");

const ALLOWED_IMAGE_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/avif": ".avif",
};

export function attachmentDirForProjectRoot(projectRoot: string): string {
  return path.join(projectRoot, ATTACHMENTS_SUBDIR);
}

export function fallbackAttachmentDir(): string {
  return path.join(os.homedir(), "pi-web-attachments");
}

/**
 * Short-TTL trust cache for attachment upload cwds. Verifying a cwd against
 * the full allowed-roots set triggers a scan of every session plus a git
 * process per project — multi-second on large session stores. Once a cwd has
 * passed that check it is trusted for `ttlMs`, so repeated pastes in the same
 * project never re-pay the scan. The cache is held on globalThis by the route
 * and passed in here to keep these helpers pure and testable.
 */
export function isTrustedAttachmentCwd(
  cache: Map<string, number> | undefined,
  cwd: string,
  now: number = Date.now(),
): boolean {
  const expiresAt = cache?.get(cwd);
  if (expiresAt !== undefined && expiresAt > now) return true;
  if (cache) {
    for (const [key, expiration] of cache) {
      if (expiration <= now) cache.delete(key);
    }
  }
  return false;
}

export function trustAttachmentCwd(
  cache: Map<string, number>,
  cwd: string,
  ttlMs: number,
  now: number = Date.now(),
): void {
  cache.set(cwd, now + ttlMs);
}

/**
 * Normalize the original file name into a safe single-file base name: no
 * spaces (ASCII or full-width), no separators, no leading/trailing dashes or
 * underscores (so it can never look like a hidden file or a CLI flag), no
 * repeated separators. CJK characters are kept.
 */
export function normalizeAttachmentBaseName(originalName: string): string {
  return path
    .basename(originalName, path.extname(originalName))
    .normalize("NFKC")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 40) || "image";
}

/**
 * Resolve the extension from the original name when it is a known image
 * extension, otherwise from the MIME type. The original extension is compared
 * before any basename normalization because a trailing space (e.g. "img.png ")
 * would make path.extname() return ".png " — the MIME fallback covers that.
 */
export function attachmentFileExtension(originalName: string, mimeType: string): string {
  const originalExt = path.extname(originalName).toLowerCase();
  if (ALLOWED_IMAGE_EXTS.has(originalExt)) return originalExt;
  return EXT_BY_MIME[mimeType] ?? ".png";
}

/**
 * Saved file name: `<UTC-timestamp>-<ordinal>-<normalized-base><ext>`. The
 * timestamp prefix keeps names unique and sortable; the sanitized base never
 * contains spaces, so the @mention in the message text never needs quoting on
 * its account (directory paths may still contain spaces, which the mention
 * builder quotes separately).
 */
export function attachmentFileName(index: number, originalName: string, mimeType: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = normalizeAttachmentBaseName(originalName);
  return `${stamp}-${index + 1}-${base}${attachmentFileExtension(originalName, mimeType)}`;
}
