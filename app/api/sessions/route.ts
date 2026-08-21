import { NextResponse } from "next/server";
import {
  attachSessionProjectInfo,
  listAllSessions,
  mergeSessionLists,
} from "@/lib/session-reader";
import { getRpcSessionInfos, getRunningRpcSessionIds } from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const force = params.get("force") === "1";
    const projectKey = params.get("projectKey");
    const sessionId = params.get("sessionId");
    const [persistedSessions, runtimeSessions] = await Promise.all([
      listAllSessions({ force }),
      attachSessionProjectInfo(getRpcSessionInfos()),
    ]);
    const all = mergeSessionLists(persistedSessions, runtimeSessions);
    // On-demand scoping: the sidebar loads per-project summaries first and
    // fetches session summaries only for the active project. sessionId is a
    // lightweight single-session lookup for URL/workspace restore and
    // transient-session hydration.
    let sessions = all;
    if (projectKey) {
      sessions = all.filter((s) => (s.projectKey ?? s.projectRoot ?? s.cwd) === projectKey);
    } else if (sessionId) {
      const target = all.find((s) => s.id === sessionId);
      sessions = target ? [target] : [];
    }
    return NextResponse.json(
      { sessions, runningSessionIds: getRunningRpcSessionIds() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
