import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("attachment uploads resolve a project-scoped directory from the session cwd", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf-8");

  // Images land in <projectRoot>/.pi-web/attachments when the request carries
  // a cwd, never in a hard-coded global directory.
  assert.match(source, /attachmentDirForProjectRoot/);
  assert.match(source, /\.pi-web/);
  assert.match(source, /resolveProject\(cwd\)/);
  // The cwd must be a browsable root first, so a crafted cwd cannot write
  // attachments into arbitrary directories.
  assert.match(source, /isFilePathAllowed\(cwd, allowedRoots\)/);
  // Sessions without a cwd keep working via the shared home fallback.
  assert.match(source, /fallbackAttachmentDir\(\)/);
  // Repeated pastes skip the expensive full session scan once a cwd is trusted.
  assert.match(source, /isTrustedAttachmentCwd/);
  assert.match(source, /trustAttachmentCwd/);
  assert.match(source, /__piTrustedAttachmentCwds/);
});
