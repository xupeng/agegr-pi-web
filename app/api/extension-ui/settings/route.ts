import { NextResponse } from "next/server";
import {
  readExtensionUiVisibilitySettings,
  writeExtensionUiVisibilitySettings,
} from "@/lib/extension-ui-settings";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(readExtensionUiVisibilitySettings());
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
    const body = await req.json() as {
      hiddenWidgetKeys?: unknown;
      hiddenStatusKeys?: unknown;
    };
    return NextResponse.json(writeExtensionUiVisibilitySettings({
      hiddenWidgetKeys: body.hiddenWidgetKeys as string[],
      hiddenStatusKeys: body.hiddenStatusKeys as string[],
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const invalid = message.startsWith("hiddenWidgetKeys ") || message.startsWith("hiddenStatusKeys ");
    return NextResponse.json({ error: message }, { status: invalid ? 400 : 500 });
  }
}
