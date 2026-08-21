import { NextResponse } from "next/server";
import { listAllSessions } from "@/lib/session-reader";
import { getRunningRpcSessionIds } from "@/lib/rpc-manager";
import type { ProjectSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Stable project identity used both here and by the client's workspaceKeyOf. */
function projectKeyOf(session: { projectKey?: string; projectRoot?: string; cwd: string }): string {
  return session.projectKey ?? session.projectRoot ?? session.cwd;
}

/**
 * Lightweight project list for the sidebar's first load. Only per-project
 * summaries plus the full session id set are sent — session summaries
 * (firstMessage etc.) are fetched per project on demand via
 * `/api/sessions?projectKey=`.
 */
export async function GET(req: Request) {
  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    const sessions = await listAllSessions({ force });

    const byKey = new Map<string, { root: string; modified: string; ids: string[] }>();
    for (const session of sessions) {
      const key = projectKeyOf(session);
      if (!key) continue;
      let entry = byKey.get(key);
      if (!entry) {
        entry = { root: session.projectRoot ?? session.cwd, modified: session.modified, ids: [] };
        byKey.set(key, entry);
      }
      entry.ids.push(session.id);
      if (session.modified > entry.modified) {
        entry.modified = session.modified;
        entry.root = session.projectRoot ?? session.cwd;
      }
    }

    const running = new Set(getRunningRpcSessionIds());
    const projects: ProjectSummary[] = [...byKey.entries()]
      .map(([key, entry]) => ({
        key,
        root: entry.root,
        modified: entry.modified,
        sessionCount: entry.ids.length,
        sessionIds: entry.ids,
        runningCount: entry.ids.filter((id) => running.has(id)).length,
      }))
      .sort((a, b) => b.modified.localeCompare(a.modified));

    return NextResponse.json(
      { projects, runningSessionIds: [...running] },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
