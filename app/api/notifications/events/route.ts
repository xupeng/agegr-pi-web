import { isApiRequestAllowed } from "@/lib/request-security";
import { getNotificationVersion, subscribeNotifications } from "@/lib/notifications/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isApiRequestAllowed(req)) return Response.json({ error: "Untrusted API request" }, { status: 403 });
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let initializing = true;
      let buffered = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe = () => {};
      const send = (event: string) => {
        if (closed) return;
        try {
          // Slow clients reconnect rather than accumulate an unbounded queue.
          if ((controller.desiredSize ?? 1) < -8) { cleanup(); return; }
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(getNotificationVersion())}\n\n`));
        } catch { cleanup(); }
      };
      const invalidate = () => {
        if (initializing) { buffered = true; return; }
        if (!timer && !closed) timer = setTimeout(() => { timer = undefined; send("invalidation"); }, 25);
      };
      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (timer) clearTimeout(timer);
        clearInterval(heartbeat);
        req.signal.removeEventListener("abort", cleanup);
        try { controller.close(); } catch { /* Stream already cancelled. */ }
      };
      const heartbeat = setInterval(() => { send("invalidation"); }, 15_000);
      heartbeat.unref?.();
      // Subscribe -> buffer -> initial version -> release, without a session lease.
      unsubscribe = subscribeNotifications(invalidate);
      req.signal.addEventListener("abort", cleanup, { once: true });
      if (req.signal.aborted) { cleanup(); return; }
      send("connected");
      initializing = false;
      if (buffered) invalidate();
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive", "X-Accel-Buffering": "no",
  } });
}
