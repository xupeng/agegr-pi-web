import { NextResponse } from "next/server";
import { createAskUserView } from "@/lib/ask-user/mcp-app-adapter";
import { readPersistedAsk } from "@/lib/ask-user/persist";
import { getRpcSession } from "@/lib/rpc-manager";

/**
 * GET /api/agent/[id]/ask-view - MCP Apps projection of the session's open ask.
 *
 * Authenticated by `proxy.ts` exactly like every other `/api` route. Returns
 * only the fixed Apps resource and the bounded tool-result projection; there is
 * deliberately no generic MCP endpoint and no way to open or close an ask here.
 * Submit/cancel still go through `POST /api/agent/[id]` via the browser host.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const session = getRpcSession(id);
    const ask = session?.isAlive() ? session.pendingAsk : readPersistedAsk(id);
    if (ask === undefined) {
      return NextResponse.json({ error: "No open ask for this session" }, { status: 404 });
    }

    const view = await createAskUserView({ sessionId: id, ask });
    // Return only the fixed resource and the bounded tool-result projection.
    // `coreProtocolVersion` exists on the adapter payload for tests/evidence and
    // is intentionally not sent to the browser.
    return NextResponse.json({
      uri: view.uri,
      mimeType: view.mimeType,
      appsProtocolVersion: view.appsProtocolVersion,
      toolName: view.toolName,
      toolInput: view.toolInput,
      structuredContent: view.structuredContent,
      content: view.content,
      html: view.html,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
