import { NextResponse } from "next/server";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { resolveSessionPath, buildSessionContext } from "@/lib/session-reader";
import { getRpcSession } from "@/lib/rpc-manager";
import { projectTrellisSubagentHistory } from "@/lib/trellis-subagent-history";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const leafId = url.searchParams.get("leafId") ?? undefined;
  // `root=1` selects the explicit empty root (null leaf) instead of falling
  // back to the file's default leaf. Trellis records must never leak from a
  // branch the user did not ask for.
  const rootOnly = url.searchParams.get("root") === "1";
  const deferThinking = url.searchParams.has("deferThinking");
  const deferToolResultImages = url.searchParams.has("deferMedia");
  // `tail` caps the ancestor chain returned (default 50); `before` rewinds the
  // walk start to an older entry so the client can page upward without
  // re-fetching the whole active branch.
  const rawTail = Number(url.searchParams.get("tail"));
  const tail = Number.isFinite(rawTail) && rawTail > 0 ? Math.min(rawTail, 1000) : 50;
  const before = url.searchParams.get("before") ?? undefined;

  try {
    const rpc = getRpcSession(id);
    const liveRpc = rpc?.isAlive() ? rpc : undefined;
    const filePath = liveRpc ? null : await resolveSessionPath(id);
    if (!liveRpc && !filePath) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sm = liveRpc?.inner.sessionManager ?? SessionManager.open(filePath!);
    const entries = sm.getEntries() as never;
    // `before` is the oldest entry already on the client; fetch its ancestors
    // only (excludeLeaf) so prepending the page does not duplicate `before`.
    // An explicit root (or `root=1`) is an empty branch, never the default leaf.
    const contextLeaf = rootOnly ? null : (before ?? leafId);
    const context = buildSessionContext(entries, contextLeaf, {
      deferThinking,
      deferToolResultImages,
      tail,
      excludeLeaf: Boolean(before),
      sessionId: id,
    });

    // Only the non-pagination request carries the bounded Trellis record
    // scope; paging upward must not recompute or replace the record snapshot.
    if (before) {
      return NextResponse.json({ context, tail, before: before ?? null });
    }

    const effectiveLeafId = rootOnly ? null : (leafId ?? sm.getLeafId());
    const trellisProjection = projectTrellisSubagentHistory(entries, effectiveLeafId, id);

    return NextResponse.json({
      context,
      tail,
      before: before ?? null,
      trellisSubagentRecords: {
        parentSessionId: id,
        leafId: trellisProjection.leafId,
        leafValid: trellisProjection.leafValid,
        truncated: trellisProjection.truncated,
        hasRecords: trellisProjection.records.length > 0,
        branchToolCallIds: trellisProjection.branchToolCallIds,
        records: trellisProjection.records,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
