import { NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import {
  isAskUserEnabled,
  readAskUserSetting,
  writeAskUserSetting,
} from "@/lib/ask-user-settings";

export const dynamic = "force-dynamic";

/**
 * ask_user tool preference.
 *
 * GET returns both the effective state (env `PI_WEB_ASK_USER` wins) and the
 * persisted preference, so the UI can show which knob is actually in control.
 */
export async function GET() {
  try {
    return NextResponse.json({
      askUser: isAskUserEnabled(),
      persisted: readAskUserSetting() ?? true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  if (!isApiRequestAllowed(req)) {
    return NextResponse.json({ error: "Untrusted API request" }, { status: 403 });
  }
  if (!hasJsonContentType(req)) {
    return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  try {
    const body = await req.json() as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    const settings = writeAskUserSetting(body.enabled);
    return NextResponse.json({ askUser: settings.askUser, persisted: settings.askUser });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
