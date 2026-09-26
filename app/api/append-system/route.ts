import { NextResponse } from "next/server";
import {
  AppendSystemContentTooLargeError,
  MAX_APPEND_SYSTEM_BYTES,
  appendSystemPromptByteLength,
  detectProjectAppendSystemOverride,
  readAppendSystemPrompt,
  writeAppendSystemPrompt,
  type ProjectAppendSystemOverride,
} from "@/lib/append-system";
import { getAllowedFileRoots, isFilePathAllowed } from "@/lib/file-access";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

/**
 * Probe the project-level override only for an authorized cwd. The allowed-root
 * check keeps the endpoint from becoming an arbitrary-path existence oracle.
 */
async function projectOverrideFor(cwd: string | null): Promise<ProjectAppendSystemOverride | null> {
  if (!cwd) return null;
  // The override is a read-only hint: a failed probe must not fail the read or
  // turn an otherwise-successful save into an error.
  try {
    const allowedRoots = await getAllowedFileRoots();
    if (!isFilePathAllowed(cwd, allowedRoots)) return null;
    return detectProjectAppendSystemOverride(cwd);
  } catch {
    return null;
  }
}

function cwdFromUrl(request: Request): string | null {
  const cwd = new URL(request.url).searchParams.get("cwd");
  return cwd ? cwd : null;
}

export async function GET(request: Request) {
  try {
    const state = readAppendSystemPrompt();
    return NextResponse.json({ ...state, projectOverride: await projectOverrideFor(cwdFromUrl(request)) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (!isApiRequestAllowed(request)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(request)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  try {
    const body: unknown = await request.json();
    const content = (body as { content?: unknown } | null | undefined)?.content;
    if (typeof content !== "string") {
      return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    }
    if (appendSystemPromptByteLength(content) > MAX_APPEND_SYSTEM_BYTES) {
      return NextResponse.json(
        { error: `content must not exceed ${MAX_APPEND_SYSTEM_BYTES} bytes` },
        { status: 400 },
      );
    }

    const state = writeAppendSystemPrompt(content);
    return NextResponse.json({ ...state, projectOverride: await projectOverrideFor(cwdFromUrl(request)) });
  } catch (error) {
    if (error instanceof AppendSystemContentTooLargeError) {
      return NextResponse.json(
        { error: `content must not exceed ${MAX_APPEND_SYSTEM_BYTES} bytes` },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
