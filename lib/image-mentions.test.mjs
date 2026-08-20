import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  buildImageMentionText,
  extractImageMentions,
  imagePreviewSrc,
  isImagePath,
  removeImageMentionFromText,
  resolveMentionPath,
} = await jiti.import("./image-mentions.ts");

test("extracts plain absolute-path image mentions", () => {
  const mentions = extractImageMentions("look at @/home/u/pi-web-attachments/a.png thanks");
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].path, "/home/u/pi-web-attachments/a.png");
  assert.equal(mentions[0].start, 8);
  assert.ok(mentions[0].end > mentions[0].start);
});

test("extracts quoted image mentions with spaces", () => {
  const mentions = extractImageMentions('check @"my dir/shot.png" please');
  assert.equal(mentions.length, 1);
  assert.equal(mentions[0].path, "my dir/shot.png");
});

test("ignores non-image mentions and plain @ tokens", () => {
  assert.equal(extractImageMentions("@/a.ts @/b.txt @/c.md").length, 0);
  assert.equal(extractImageMentions("email foo@bar.com here").length, 0);
  assert.equal(extractImageMentions("@/no-extension").length, 0);
});

test("deduplicates repeated mentions by path", () => {
  const mentions = extractImageMentions("@/a.png and again @/a.png and @/b.png");
  assert.deepEqual(
    mentions.map((m) => m.path),
    ["/a.png", "/b.png"],
  );
});

test("keeps only the image from a mixed list", () => {
  const mentions = extractImageMentions("@/a.png @/b.ts @/c.webp");
  assert.deepEqual(
    mentions.map((m) => m.path),
    ["/a.png", "/c.webp"],
  );
});

test("builds quoted mentions for space-containing paths", () => {
  assert.equal(buildImageMentionText("/a/b.png"), "@/a/b.png ");
  assert.equal(buildImageMentionText("/my dir/shot.png"), '@"/my dir/shot.png" ');
});

test("removes a plain mention including its leading whitespace", () => {
  assert.equal(
    removeImageMentionFromText("see @/a.png and", "/a.png"),
    "see and",
  );
  assert.equal(
    removeImageMentionFromText("@/a.png", "/a.png"),
    "",
  );
});

test("removes a quoted mention", () => {
  assert.equal(
    removeImageMentionFromText('see @"my dir/a.png" and', "my dir/a.png"),
    "see and",
  );
});

test("removes every occurrence of a repeated mention", () => {
  assert.equal(
    removeImageMentionFromText("@/a.png @/b.png @/a.png", "/a.png"),
    "@/b.png",
  );
});

test("leaves text unchanged when the path is not mentioned", () => {
  const text = "nothing here @/other.png";
  assert.equal(removeImageMentionFromText(text, "/missing.png"), text);
});

test("resolves relative mentions against the cwd and passes absolute paths through", () => {
  assert.equal(resolveMentionPath("/abs/a.png", "/cwd"), "/abs/a.png");
  assert.equal(resolveMentionPath("src/a.png", "/cwd"), "/cwd/src/a.png");
  assert.equal(resolveMentionPath("src/a.png"), "src/a.png");
});

test("builds an API preview URL with the path encoded", () => {
  assert.equal(
    imagePreviewSrc("/Users/xupeng/pi-web-attachments/a b.png"),
    "/api/files/Users/xupeng/pi-web-attachments/a%20b.png?type=read",
  );
});

test("classifies image paths by extension", () => {
  assert.equal(isImagePath("/a.PNG"), true);
  assert.equal(isImagePath("/a.avif"), true);
  assert.equal(isImagePath("/a.ts"), false);
  assert.equal(isImagePath("/a"), false);
});
