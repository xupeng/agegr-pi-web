import { ASK_USER_VIEW_FONT_MANIFEST_VERSION } from "@/lib/ask-user/view-fonts";
import { readViewFontManifest } from "@/lib/ask-user/view-font-manifest";

/**
 * The `@font-face` manifest the host mirrors into the sandboxed ask view.
 *
 * The frame cannot load these files itself (opaque origin, `default-src 'none'`,
 * and Chromium blocks its requests to `/fonts/**` as local-network access), so
 * the host selects the subsets the ask text needs, fetches their bytes on its
 * own origin and posts them to the frame. See
 * `lib/ask-user/view-font-manifest.ts` (server) and `lib/ask-user/view-fonts.ts`
 * (the client-safe selection half).
 */
export async function GET(): Promise<Response> {
  const faces = await readViewFontManifest();
  return Response.json(
    { version: ASK_USER_VIEW_FONT_MANIFEST_VERSION, faces },
    // The payload only changes when the app's font CSS does.
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
