import { NextResponse } from "next/server";
import { readPersistedAsk } from "@/lib/ask-user/persist";
import { getRpcSession } from "@/lib/rpc-manager";
import { resolveSessionPath } from "@/lib/session-reader";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const rpc = getRpcSession(id);
    if (rpc?.isAlive()) {
      const state = await rpc.send({ type: "get_state" });
      return NextResponse.json({ running: true, state });
    }

    if (!await resolveSessionPath(id)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    // The session exists but its wrapper is gone (idle shutdown, restart).
    // Serve the persisted open ask so a reloaded or remote browser can still
    // render the question card and answer it.
    const persisted = readPersistedAsk(id);
    if (persisted !== undefined) {
      return NextResponse.json({ running: false, state: { pendingAsk: persisted } });
    }
    return NextResponse.json({ running: false });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
