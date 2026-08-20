import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { allowFileRoot } from "@/lib/allowed-roots";
import { isApiRequestAllowed } from "@/lib/request-security";
import { parseFormDataWithinLimit, RequestBodyTooLargeError } from "@/lib/bounded-form-data";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB per image
const MAX_ATTACHMENTS = 10;
const ATTACHMENT_DIR = path.join(os.homedir(), "pi-web-attachments");

const ALLOWED_IMAGE_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif",
]);

function safeFileName(index: number, originalName: string, mimeType: string): string {
  const originalExt = path.extname(originalName).toLowerCase();
  const ext = ALLOWED_IMAGE_EXTS.has(originalExt)
    ? originalExt
    : (mimeType === "image/png" ? ".png"
      : mimeType === "image/jpeg" ? ".jpg"
      : mimeType === "image/webp" ? ".webp"
      : mimeType === "image/gif" ? ".gif"
      : mimeType === "image/bmp" ? ".bmp"
      : mimeType === "image/avif" ? ".avif"
      : ".png");
  const base = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
    .slice(0, 40) || "image";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${stamp}-${index + 1}-${base}${ext}`;
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

    fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });
    // Make the attachment directory browsable/readable by /api/files so the
    // @-mentioned path can be previewed in the file viewer.
    allowFileRoot(ATTACHMENT_DIR);

    const paths: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const target = path.join(ATTACHMENT_DIR, safeFileName(index, file.name, file.type));
      await fs.promises.writeFile(target, Buffer.from(await file.arrayBuffer()));
      paths.push(target);
    }
    return NextResponse.json({ paths });
  } catch (error) {
    console.error("attachment save failed", error);
    return NextResponse.json({ error: "Failed to save attachment images" }, { status: 500 });
  }
}
