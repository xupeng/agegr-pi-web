import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  attachmentFileName,
  attachmentDirForProjectRoot,
  fallbackAttachmentDir,
  isTrustedAttachmentCwd,
  trustAttachmentCwd,
} from "@/lib/attachment-paths";
import { allowFileRoot, getAllowedFileRoots, isFilePathAllowed } from "@/lib/file-access";
import { isApiRequestAllowed } from "@/lib/request-security";
import { parseFormDataWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { resolveProject } from "@/lib/worktree";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB per image
const MAX_ATTACHMENTS = 10;
const TRUSTED_CWD_TTL_MS = 10 * 60 * 1000;

declare global {
  var __piTrustedAttachmentCwds: Map<string, number> | undefined;
}

/**
 * Resolve the project-scoped attachment directory for a session cwd, or null
 * when the cwd is not a browsable root. The full allowed-roots check scans
 * every session and runs git per project (multi-second on large session
 * stores), so passing cwds are cached for TRUSTED_CWD_TTL_MS — repeated pastes
 * in the same project skip the scan entirely.
 */
async function resolveAttachmentDirForCwd(cwd: string): Promise<string | null> {
  const trustedCache = globalThis.__piTrustedAttachmentCwds;
  if (isTrustedAttachmentCwd(trustedCache, cwd)) {
    const { projectRoot } = await resolveProject(cwd);
    return attachmentDirForProjectRoot(projectRoot);
  }

  const allowedRoots = await getAllowedFileRoots();
  if (!isFilePathAllowed(cwd, allowedRoots)) return null;
  const { projectRoot } = await resolveProject(cwd);

  const cache = globalThis.__piTrustedAttachmentCwds ??= new Map();
  trustAttachmentCwd(cache, cwd, TRUSTED_CWD_TTL_MS);
  return attachmentDirForProjectRoot(projectRoot);
}

export async function POST(request: NextRequest) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }

  try {
    let formData: FormData;
    try {
      formData = await parseFormDataWithinLimit(
        request,
        MAX_ATTACHMENT_BYTES * MAX_ATTACHMENTS + 1024 * 1024,
      );
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json({ error: "Images must total 100MB or less" }, { status: 413 });
      }
      throw error;
    }

    const files = formData.getAll("files").filter((entry): entry is File => typeof entry !== "string");
    if (files.length === 0) {
      return NextResponse.json({ error: "No image files provided" }, { status: 400 });
    }
    if (files.length > MAX_ATTACHMENTS) {
      return NextResponse.json({ error: `A message can include at most ${MAX_ATTACHMENTS} images` }, { status: 400 });
    }
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: `Not an image file: ${file.name || "(unnamed)"}` }, { status: 400 });
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({
          error: `Each image must be ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB or smaller`,
        }, { status: 413 });
      }
    }

    // Project-scoped attachments: the request carries the session cwd, which
    // resolves to the project root, so images land in
    // `<projectRoot>/.pi-web/attachments/` — each project keeps its own
    // images next to the code they describe. The cwd must already be a
    // browsable root (otherwise a crafted cwd could write anywhere); sessions
    // without a cwd yet fall back to the shared home directory.
    let attachmentDir = fallbackAttachmentDir();
    const cwd = request.nextUrl.searchParams.get("cwd");
    if (cwd) {
      attachmentDir = (await resolveAttachmentDirForCwd(cwd)) ?? attachmentDir;
    }

    fs.mkdirSync(attachmentDir, { recursive: true });
    // Make the attachment directory browsable/readable by /api/files so the
    // @-mentioned path can be previewed in the file viewer.
    allowFileRoot(attachmentDir);

    const paths: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const target = path.join(attachmentDir, attachmentFileName(index, file.name, file.type));
      await fs.promises.writeFile(target, Buffer.from(await file.arrayBuffer()));
      paths.push(target);
    }
    return NextResponse.json({ paths });
  } catch (error) {
    console.error("attachment save failed", error);
    return NextResponse.json({ error: "Failed to save attachment images" }, { status: 500 });
  }
}
