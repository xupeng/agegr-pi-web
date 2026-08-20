import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  ATTACHMENTS_SUBDIR,
  attachmentFileExtension,
  attachmentFileName,
  attachmentDirForProjectRoot,
  fallbackAttachmentDir,
  isTrustedAttachmentCwd,
  normalizeAttachmentBaseName,
  trustAttachmentCwd,
} = await jiti.import("./attachment-paths.ts");
const {
  buildImageMentionText,
  extractImageMentions,
  removeImageMentionFromText,
} = await jiti.import("./image-mentions.ts");

test("projects get a .pi-web attachments subdirectory", () => {
  assert.equal(
    attachmentDirForProjectRoot("/work/repo"),
    path.join("/work/repo", ".pi-web", "attachments"),
  );
  assert.equal(ATTACHMENTS_SUBDIR, path.join(".pi-web", "attachments"));
});

test("sessions without a cwd fall back to the shared home directory", () => {
  assert.equal(
    fallbackAttachmentDir(),
    path.join(os.homedir(), "pi-web-attachments"),
  );
});

test("normalizes spaces out of attachment base names", () => {
  assert.equal(normalizeAttachmentBaseName("screenshot 2024.png"), "screenshot_2024");
  assert.equal(normalizeAttachmentBaseName("我的\u3000图片.png"), "我的_图片");
  assert.equal(normalizeAttachmentBaseName("  spaced  .png"), "spaced");
  assert.equal(normalizeAttachmentBaseName("-dash-  tail.png"), "dash-_tail");
  assert.equal(normalizeAttachmentBaseName("a..b.png"), "a_b");
  assert.equal(normalizeAttachmentBaseName("...png"), "image");
});

test("keeps CJK characters and normalizes full-width forms", () => {
  assert.equal(normalizeAttachmentBaseName("我的图片.png"), "我的图片");
  // NFKC maps full-width Latin to ASCII before sanitizing.
  assert.equal(normalizeAttachmentBaseName("Ｓｃｒｅｅｎｓｈｏｔ.png"), "Screenshot");
});

test("resolves extensions from the name or falls back to the MIME type", () => {
  assert.equal(attachmentFileExtension("shot.png", "image/png"), ".png");
  assert.equal(attachmentFileExtension("shot.PNG", "image/png"), ".png");
  assert.equal(attachmentFileExtension("shot.webp", "image/png"), ".webp");
  // A trailing space makes path.extname() return ".png " — the MIME fallback
  // must kick in instead of emitting an extension with a space.
  assert.equal(attachmentFileExtension("shot.png ", "image/png"), ".png");
  assert.equal(attachmentFileExtension("no-extension", "image/jpeg"), ".jpg");
  assert.equal(attachmentFileExtension("unknown.bin", "application/octet-stream"), ".png");
});

test("builds unique, space-free file names with a timestamp prefix", () => {
  const name = attachmentFileName(0, "My Screenshot 2024.png", "image/png");
  assert.match(name, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-1-My_Screenshot_2024\.png$/);
  assert.doesNotMatch(name, /\s/);
});

test("trusts a cwd only within its TTL and prunes expired entries", () => {
  const cache = new Map();
  const now = 1_000_000;

  assert.equal(isTrustedAttachmentCwd(cache, "/work/repo", now), false);
  trustAttachmentCwd(cache, "/work/repo", 60_000, now);
  assert.equal(isTrustedAttachmentCwd(cache, "/work/repo", now + 59_999), true);
  assert.equal(isTrustedAttachmentCwd(cache, "/work/repo", now + 60_001), false);

  // A second expired entry is pruned when the map is touched.
  cache.set("/stale", now - 1);
  isTrustedAttachmentCwd(cache, "/work/repo", now + 120_000);
  assert.equal(cache.has("/stale"), false);
});

test("quotes mentions for space-containing directory paths end to end", () => {
  const dir = "/Users/my name/project";
  const mention = buildImageMentionText(`${dir}/.pi-web/attachments/2026-08-20T18-25-16-1-shot.png`);
  assert.equal(mention, `@"${dir}/.pi-web/attachments/2026-08-20T18-25-16-1-shot.png" `);
  const extracted = extractImageMentions(`please see ${mention}thanks`);
  assert.equal(extracted.length, 1);
  assert.equal(extracted[0].path, `${dir}/.pi-web/attachments/2026-08-20T18-25-16-1-shot.png`);
  assert.equal(removeImageMentionFromText(`please see ${mention}thanks`, extracted[0].path), "please see thanks");
});
