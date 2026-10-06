import { NextResponse } from "next/server";
import { hasJsonContentType, isApiRequestAllowed } from "@/lib/request-security";
import { decodeNotificationCommand } from "@/lib/notifications/types";
import { getNotificationStore, NotificationStorageError } from "@/lib/notifications/store";
import { getNotificationRuntime, getNotificationSnapshot } from "@/lib/notifications/runtime";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 128 * 1024;
const headers = { "Cache-Control": "no-store" };
function failure(status: number, error: string) { return NextResponse.json({ error }, { status, headers }); }

export async function GET(req: Request) {
  if (!isApiRequestAllowed(req)) return failure(403, "Untrusted API request");
  try { return NextResponse.json(await getNotificationSnapshot(), { headers }); }
  catch { return failure(503, "Notifications unavailable"); }
}
async function readBody(req: Request): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new RangeError();
  const reader = req.body?.getReader();
  if (!reader) throw new SyntaxError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function POST(req: Request) {
  if (!isApiRequestAllowed(req)) return failure(403, "Untrusted API request");
  if (!hasJsonContentType(req)) return failure(415, "Content-Type must be application/json");
  let body: unknown;
  try { body = await readBody(req); }
  catch (error) { return failure(error instanceof RangeError ? 413 : 400, "Invalid notification request body"); }
  const command = decodeNotificationCommand(body);
  if (!command) return failure(400, "Invalid notification command");
  try {
    switch (command.type) {
      case "ack": getNotificationStore().acknowledge([{ id: command.id, revision: command.revision }]); break;
      case "ack_many": getNotificationStore().acknowledge(command.items); break;
      case "import_legacy":
        if (command.instanceId !== getNotificationStore().version().instanceId) return failure(409, "Notification instance mismatch");
        await getNotificationRuntime().importLegacy(command.instanceId, command.sessionIds);
        break;
    }
    return NextResponse.json({ snapshot: await getNotificationSnapshot() }, { headers });
  } catch (error) {
    return failure(error instanceof NotificationStorageError ? 503 : 500, "Notification operation failed; retry is safe");
  }
}
