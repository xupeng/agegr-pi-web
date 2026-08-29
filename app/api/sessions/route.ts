import { NextResponse } from "next/server";
import {
  attachSessionProjectInfo,
  listAllSessions,
  mergeSessionLists,
  readSessionById,
} from "@/lib/session-reader";
import {
  getCompletionNotificationSuppressedRpcSessionIds,
  getRpcSessionInfos,
  getRunningRpcSessionIds,
} from "@/lib/rpc-manager";
import type { SessionInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const force = params.get("force") === "1";
    const projectKey = params.get("projectKey");
    const sessionId = params.get("sessionId");
    const runtimeSessions = await attachSessionProjectInfo(getRpcSessionInfos());
    let sessions: SessionInfo[];
    if (sessionId) {
      // Transient sessions exist only in the RPC registry (the first JSONL
      // flush is deferred until an assistant message) — answer from runtime
      // info directly so the disk lookup never degrades into a full scan.
      const runtimeTarget = runtimeSessions.find((s) => s.id === sessionId);
      if (runtimeTarget?.transient) {
        sessions = [runtimeTarget];
      } else {
        // Lightweight single-session lookup: read just that .jsonl file
        // (millisecond-level) — never a full directory scan.
        const persistedTarget = await readSessionById(sessionId);
        sessions = persistedTarget ? [persistedTarget] : runtimeTarget ? [runtimeTarget] : [];
      }
    } else {
      const persistedSessions = await listAllSessions({ force });
      sessions = mergeSessionLists(persistedSessions, runtimeSessions);
      // On-demand scoping: the sidebar loads per-project summaries first and
      // fetches session summaries only for the active project.
      if (projectKey) {
        sessions = sessions.filter((s) => (s.projectKey ?? s.projectRoot ?? s.cwd) === projectKey);
      }
    }
    return NextResponse.json(
      {
        sessions,
        runningSessionIds: getRunningRpcSessionIds(),
        completionNotificationSuppressedSessionIds: getCompletionNotificationSuppressedRpcSessionIds(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
