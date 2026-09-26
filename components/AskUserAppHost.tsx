"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AskUserAnswer, PendingAskUser } from "@/lib/types";
import { getLocalePlugin } from "@/lib/i18n/registry";
import { isBuiltinAskUserViewHtml } from "@/lib/ask-user/mcp-view-html";
import { readThemeTokens, type AskUserThemeTokens } from "@/lib/ask-user/theme-tokens";
import {
  collectViewText,
  filterViewFontFacesByStack,
  selectViewFontFaces,
  type AskUserViewFontFace,
} from "@/lib/ask-user/view-fonts";
import {
  ASK_USER_ID_MAX_LENGTH,
  ASK_USER_OPTION_LIMIT,
  ASK_USER_OTHER_TEXT_MAX_LENGTH,
  ASK_USER_QUESTION_LIMIT,
} from "@/lib/ask-user/types";
import { useI18n } from "@/hooks/useI18n";
import { AskUserAppFailure } from "./AskUserAppFailure";

/** Peer protocol version of the MCP Apps 2026-01-26 handshake. */
const APPS_PROTOCOL_VERSION = "2026-01-26";
/** How long the fetch + handshake may take before the degraded state takes over. */
const APPS_HANDSHAKE_TIMEOUT_MS = 6000;
/** Budget for mirroring the webfonts before the view renders without them. */
const ASK_VIEW_FONTS_TIMEOUT_MS = 2500;
/**
 * Most faces one ask may carry. The whole vendored set is 99 faces / 5.1 MiB, so
 * these bounds only stop a pathological manifest: a long ask (13 questions, ~60
 * distinct CJK characters) already needs 20 subsets, and truncating a selection
 * mid-way is visible, because the dropped glyphs fall back to a system font and
 * the question then renders in two different faces.
 */
const ASK_VIEW_FONT_FACE_LIMIT = 128;
const ASK_VIEW_FONT_BYTE_LIMIT = 8 * 1024 * 1024;
const MAX_VIEW_HEIGHT = 4000;
const ASK_USER_VIEW_URI = "ui://pi-web/ask-user.html";
const ASK_VIEW_FONT_FACES_URL = "/api/ask-user/font-faces";
const ASK_USER_VIEW_FONT_MANIFEST_VERSION = 1;
/** woff2 files always start with these four bytes. */
const WOFF2_SIGNATURE = [0x77, 0x4f, 0x46, 0x32];

/** One font the frame installs as a `FontFace`, bytes already in memory. */
interface AskUserViewFont {
  family: string;
  style: string;
  weight: string;
  unicodeRange: string;
  data: ArrayBuffer;
}

type AskUserAppViewState = "loading" | "apps" | "failed";

interface AppViewPayload {
  uri: string;
  mimeType: string;
  appsProtocolVersion: string;
  toolName: string;
  toolInput: { sessionId: string; askId: string };
  structuredContent: Record<string, unknown>;
  content: Array<{ type: "text"; text: string }>;
  html: string;
  /** Pi Web webfonts for the frame; empty means system fallbacks. */
  fonts: AskUserViewFont[];
}

export interface AskUserAppHostProps {
  ask: PendingAskUser;
  sessionId: string | undefined;
  onSubmit: (askId: string, answers: AskUserAnswer[], supplement?: string) => void | Promise<void>;
  onCancel: (askId: string) => void | Promise<void>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function parseAnswers(value: unknown): AskUserAnswer[] | null {
  if (!Array.isArray(value) || value.length > ASK_USER_QUESTION_LIMIT) return null;
  const answers: AskUserAnswer[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record || typeof record.id !== "string" || record.id.length > ASK_USER_ID_MAX_LENGTH || !Array.isArray(record.values)) return null;
    if (record.values.length > ASK_USER_OPTION_LIMIT) return null;
    const values: string[] = [];
    for (const candidate of record.values) {
      if (typeof candidate !== "string" || candidate.length > ASK_USER_ID_MAX_LENGTH) return null;
      values.push(candidate);
    }
    const answer: AskUserAnswer = { id: record.id, values };
    if (typeof record.otherText === "string") {
      if (record.otherText.length > ASK_USER_OTHER_TEXT_MAX_LENGTH) return null;
      answer.otherText = record.otherText;
    }
    answers.push(answer);
  }
  return answers;
}

function parsePayload(value: unknown, expected: { sessionId: string; askId: string }): Omit<AppViewPayload, "fonts"> | null {
  const record = asRecord(value);
  if (!record) return null;
  const toolInput = asRecord(record.toolInput);
  const structuredContent = asRecord(record.structuredContent);
  if (typeof record.html !== "string" || !isBuiltinAskUserViewHtml(record.html) || !toolInput || !structuredContent) return null;
  if (toolInput.sessionId !== expected.sessionId || toolInput.askId !== expected.askId) return null;
  if (structuredContent.sessionId !== expected.sessionId || structuredContent.askId !== expected.askId) return null;
  if (structuredContent.schemaVersion !== 1) return null;
  if (record.uri !== ASK_USER_VIEW_URI) return null;
  if (record.appsProtocolVersion !== APPS_PROTOCOL_VERSION) return null;
  if (record.mimeType !== "text/html;profile=mcp-app") return null;
  if (record.toolName !== "project_ask_user") return null;
  const content = Array.isArray(record.content)
    ? record.content.flatMap((block) => {
        const item = asRecord(block);
        return item?.type === "text" && typeof item.text === "string" ? [{ type: "text" as const, text: item.text }] : [];
      })
    : [];
  return {
    uri: typeof record.uri === "string" ? record.uri : "",
    mimeType: typeof record.mimeType === "string" ? record.mimeType : "",
    appsProtocolVersion: typeof record.appsProtocolVersion === "string" ? record.appsProtocolVersion : "",
    toolName: typeof record.toolName === "string" ? record.toolName : "",
    toolInput: { sessionId: expected.sessionId, askId: expected.askId },
    structuredContent,
    content,
    html: record.html,
  };
}

function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Pi Web's design tokens, read from the live document. The view cannot inherit
 * them (opaque origin, `var()` does not cross the sandbox), and Pi Web ships
 * five palettes, so the values are forwarded instead of a light/dark hint.
 */
function readDocumentThemeTokens(): AskUserThemeTokens {
  if (typeof document === "undefined") return {};
  const styles = getComputedStyle(document.documentElement);
  return readThemeTokens((name) => styles.getPropertyValue(name));
}

/** Pixel offset the chat font slider applies on top of the 14px base. */
function readFontSizeOffsetPx(): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--chat-content-font-size").trim();
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(raw);
  if (!match) return 0;
  const size = Number(match[1]);
  if (!Number.isFinite(size)) return 0;
  const offset = Math.round((size - 14) * 100) / 100;
  return offset < -32 || offset > 48 ? 0 : offset;
}

/**
 * Host font stack forwarded to the sandboxed view.
 *
 * The view runs in its own document, so it cannot inherit this stack and an
 * unset font would render the card in the browser default (Times New Roman).
 * This is deliberately the `body` stack - the UI stack the native card
 * inherited from the message column - and not `--font-content`, the chat prose
 * stack: `--font-content` lists LXGW WenKai Screen, whose kai glyphs are
 * visibly larger and heavier than the sans the card used, which read as "wrong
 * font / font too large" on a phone. Asking for the UI stack keeps Latin in
 * Oxanium and CJK in the device's own sans (PingFang SC on iOS, Noto Sans CJK
 * elsewhere), exactly like the card did. The value must not be able to break
 * out of the inline style, so only font-stack characters survive; the view
 * sanitizes again before applying it.
 */
function readFontFamilyStack(): string {
  if (typeof document === "undefined") return "";
  const raw = getComputedStyle(document.body).fontFamily;
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(/[^A-Za-z0-9 ,'"_-]/g, " ").trim();
  return cleaned.length === 0 || cleaned.length > 300 ? "" : cleaned;
}

let askViewFontManifestPromise: Promise<AskUserViewFontFace[]> | null = null;
const askViewFontBytes = new Map<string, Promise<ArrayBuffer>>();

/**
 * Fetch the face manifest once per page session.
 *
 * The frame cannot fetch anything itself (opaque origin, `default-src 'none'`,
 * and Chromium blocks its requests to `/fonts/**` as local-network access), so
 * the host reads the manifest, picks the subsets the ask text needs and posts
 * the bytes with the projection. Failures are cached as "no webfonts" so every
 * ask does not re-pay for them.
 */
function loadAskViewFontManifest(): Promise<AskUserViewFontFace[]> {
  if (!askViewFontManifestPromise) {
    askViewFontManifestPromise = fetch(ASK_VIEW_FONT_FACES_URL, { headers: { accept: "application/json" } })
      .then((response) => (response.ok ? response.json() as Promise<unknown> : null))
      .then((value): AskUserViewFontFace[] => {
        const record = asRecord(value);
        if (!record || record.version !== ASK_USER_VIEW_FONT_MANIFEST_VERSION || !Array.isArray(record.faces)) return [];
        return record.faces.flatMap((entry) => {
          const face = asRecord(entry);
          if (!face || typeof face.url !== "string" || typeof face.unicodeRange !== "string") return [];
          if (typeof face.family !== "string" || typeof face.style !== "string" || typeof face.weight !== "string") return [];
          if (typeof face.display !== "string") return [];
          return [{
            family: face.family,
            style: face.style,
            weight: face.weight,
            display: face.display,
            unicodeRange: face.unicodeRange,
            url: face.url,
          }];
        });
      })
      .catch(() => [] as AskUserViewFontFace[]);
  }
  return askViewFontManifestPromise;
}

/** Fetches one woff2 on the host's own origin; the bytes never travel over the wire in the frame. */
function loadAskViewFontBytes(url: string): Promise<ArrayBuffer | null> {
  const cached = askViewFontBytes.get(url);
  if (cached) return cached.then((buffer) => buffer);
  const request = fetch(url, { headers: { accept: "font/woff2" } })
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => null);
  askViewFontBytes.set(url, request as Promise<ArrayBuffer>);
  return request;
}

/**
 * The faces this ask should carry: only the unicode-range subsets the projected
 * text touches, capped by count and by total bytes. A failure or a slow
 * manifest degrades to "no webfonts" rather than delaying the handshake.
 */
function loadAskViewFonts(
  structuredContent: unknown,
  labels: Record<string, string>,
  stack: string,
): Promise<AskUserViewFont[]> {
  const work = (async () => {
    const manifest = await loadAskViewFontManifest();
    if (manifest.length === 0) return [];
    // Only families the forwarded stack asks for: a face for a family nothing
    // references is inert bytes (the UI stack names Oxanium and system
    // families, so the vendored CJK subsets are not shipped at all).
    const usable = filterViewFontFacesByStack(manifest, stack);
    if (usable.length === 0) return [];
    const text = collectViewText(structuredContent, labels);
    const selected = selectViewFontFaces(usable, text, ASK_VIEW_FONT_FACE_LIMIT);
    const buffers = await Promise.all(selected.map((face) => loadAskViewFontBytes(face.url)));
    const fonts: AskUserViewFont[] = [];
    let bytes = 0;
    for (const [index, face] of selected.entries()) {
      const buffer = buffers[index];
      if (!buffer || buffer.byteLength === 0) continue;
      if (bytes + buffer.byteLength > ASK_VIEW_FONT_BYTE_LIMIT) break;
      const signature = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
      if (signature.length < 4 || WOFF2_SIGNATURE.some((byte, position) => signature[position] !== byte)) continue;
      bytes += buffer.byteLength;
      fonts.push({ family: face.family, style: face.style, weight: face.weight, unicodeRange: face.unicodeRange, data: buffer });
    }
    return fonts;
  })();
  return Promise.race([
    work.catch(() => [] as AskUserViewFont[]),
    new Promise<AskUserViewFont[]>((resolve) => window.setTimeout(() => resolve([]), ASK_VIEW_FONTS_TIMEOUT_MS)),
  ]).then((fonts) => fonts);
}

/**
 * Client host wrapper for the ask_user MCP Apps view.
 *
 * It is the only renderer for `ask_user`: it fetches the authenticated
 * projection, mounts the fixed built-in document as an opaque-origin `srcdoc`
 * iframe (`sandbox="allow-scripts"`, no `allow-same-origin`) and performs the
 * probed Apps handshake. Because the frame has an opaque origin, host messages
 * arrive with `event.origin === "null"` and are accepted only when
 * `event.source` is the exact mounted iframe; outbound messages target `"*"`.
 * This works from any page origin (loopback, LAN IP, Tailscale, hostname,
 * HTTPS).
 *
 * The DOM marker `data-ask-user-view` is exactly one of three states:
 * `loading` while the projection or handshake is pending, `apps` once the view
 * reports a size after tool-result, and `failed` for the read-only degraded
 * state. The iframe is mounted off-screen while pending and only revealed on
 * that size notification, so it never flashes at zero height.
 *
 * Only `ask_submit` / `ask_cancel` for this session and askId are forwarded
 * into the existing `submitAsk` / `cancelAsk` callbacks. Any fetch, projection
 * or handshake failure keeps the ask open and shows the degraded state, whose
 * single control (retry) re-runs the projection fetch without a page reload.
 */
export function AskUserAppHost({ ask, sessionId, onSubmit, onCancel }: AskUserAppHostProps) {
  const { t, locale } = useI18n();
  const [apps, setApps] = useState<AppViewPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const [handshakeReady, setHandshakeReady] = useState(false);
  // Bumped by the degraded state's retry control; the projection effect depends
  // on it, so retrying re-runs the fetch and handshake without a full reload.
  const [reloadKey, setReloadKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const labelsRef = useRef<Record<string, string>>({});
  const onSubmitRef = useRef(onSubmit);
  const onCancelRef = useRef(onCancel);
  // The message listener is attached once per mount, before the iframe's srcdoc
  // document can exist, so it reads the live projection/identity through refs.
  const payloadRef = useRef<AppViewPayload | null>(null);
  const sessionIdRef = useRef(sessionId);
  const askIdRef = useRef(ask.askId);
  const sentResultRef = useRef(false);
  const completedRef = useRef(false);
  const readyTimerRef = useRef(0);

  const labels = useMemo(() => {
    const answeredTemplate = getLocalePlugin(locale)?.messages["chat.askUserAnswered"] ?? "{count} of {total} answered";
    return {
      title: t("chat.askUserTitle"),
      answered: answeredTemplate,
      otherPlaceholder: t("chat.askUserOtherPlaceholder"),
      multipleOtherPlaceholder: t("chat.askUserMultipleOtherPlaceholder"),
      supplementTitle: t("chat.askUserSupplementTitle"),
      supplementPlaceholder: t("chat.askUserSupplementPlaceholder"),
      submitted: t("chat.askUserSubmitted"),
      cancelling: t("chat.askUserCancelling"),
      hint: t("chat.askUserHint"),
      cancel: t("chat.cancel"),
      submit: t("chat.submit"),
      actionFailed: t("chat.askUserActionFailed"),
    };
  }, [locale, t]);

  // Keep the latest callbacks/labels/identity in refs so the once-attached
  // message listener does not restart when ChatWindow re-renders with new
  // inline callback identities.
  useEffect(() => {
    labelsRef.current = labels;
    onSubmitRef.current = onSubmit;
    onCancelRef.current = onCancel;
    sessionIdRef.current = sessionId;
    askIdRef.current = ask.askId;
  });

  // Fetch the MCP Apps projection. Any failure here shows the degraded state
  // with the ask still open. Origin-independent: no loopback decision.
  useEffect(() => {
    if (!sessionId) {
      setFailed(true);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (!cancelled) setFailed(true);
    }, APPS_HANDSHAKE_TIMEOUT_MS);
    payloadRef.current = null;
    sentResultRef.current = false;
    completedRef.current = false;
    setApps(null);
    setFailed(false);
    setHandshakeReady(false);
    fetch(`/api/agent/${encodeURIComponent(sessionId)}/ask-view`, { signal: controller.signal, headers: { accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`ask view request failed: ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .then(async (value) => {
        const parsed = parsePayload(value, { sessionId, askId: ask.askId });
        if (!parsed) throw new Error("ask view projection was invalid");
        // The webfonts depend on the projected text and on the stack the frame
        // will use, so they follow the projection; their own budget keeps the 6s
        // handshake intact, and the frame's very first tool-result already
        // carries the faces it renders in.
        const fonts = await loadAskViewFonts(parsed.structuredContent, labelsRef.current, readFontFamilyStack());
        if (cancelled) return;
        const payload: AppViewPayload = { ...parsed, fonts };
        payloadRef.current = payload;
        setApps(payload);
      })
      .catch(() => {
        if (!cancelled && !timedOut) setFailed(true);
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [ask.askId, reloadKey, sessionId]);

  // Speak the Apps handshake. The listener is attached on mount, before the
  // srcdoc document is rendered, so the view's first `ui/initialize` cannot be
  // lost to a mount race. Only the mounted iframe window and its opaque
  // `"null"` origin are accepted.
  useEffect(() => {
    const send = (message: unknown) => {
      const contentWindow = iframeRef.current?.contentWindow;
      if (contentWindow) contentWindow.postMessage(message, "*");
    };
    const revealApps = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      window.clearTimeout(readyTimerRef.current);
      setHandshakeReady(true);
    };
    const sendError = (id: unknown, message: string) => {
      send({ jsonrpc: "2.0", id, error: { code: -32603, message } });
    };
    const sendToolInputAndResult = (payload: AppViewPayload) => {
      sentResultRef.current = true;
      send({ jsonrpc: "2.0", method: "ui/notifications/tool-input", params: { arguments: payload.toolInput } });
      send({
        jsonrpc: "2.0",
        method: "ui/notifications/tool-result",
        params: {
          content: payload.content,
          structuredContent: {
            ...payload.structuredContent,
            labels: labelsRef.current,
            theme: currentTheme(),
            colorScheme: currentTheme(),
            tokens: readDocumentThemeTokens(),
            fontSizeOffsetPx: readFontSizeOffsetPx(),
            fontFamily: readFontFamilyStack(),
            fonts: payload.fonts,
          },
        },
      });
    };
    const settle = (id: unknown, pending: void | Promise<void>, failure: string) => {
      if (pending === undefined) {
        sendError(id, "ask action was not confirmed");
        return;
      }
      void Promise.resolve(pending)
        .then(() => send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "accepted" }] } }))
        .catch((error: unknown) => sendError(id, error instanceof Error ? error.message : failure));
    };
    const handleToolCall = (id: unknown, params: unknown) => {
      const call = asRecord(params);
      const name = typeof call?.name === "string" ? call.name : "";
      const args = asRecord(call?.arguments) ?? {};
      const currentAskId = askIdRef.current;
      if (args.sessionId !== sessionIdRef.current || args.askId !== currentAskId) {
        sendError(id, "stale or unauthorized ask");
        return;
      }
      if (name === "ask_submit") {
        const answers = parseAnswers(args.answers);
        if (answers === null) {
          sendError(id, "invalid ask answers");
          return;
        }
        const supplement = typeof args.supplement === "string" ? args.supplement : undefined;
        if (supplement !== undefined && supplement.length > ASK_USER_OTHER_TEXT_MAX_LENGTH) {
          sendError(id, "invalid ask answers");
          return;
        }
        settle(id, onSubmitRef.current(currentAskId, answers, supplement), "submit failed");
        return;
      }
      if (name === "ask_cancel") {
        settle(id, onCancelRef.current(currentAskId), "cancel failed");
        return;
      }
      sendError(id, "tool not allowlisted");
    };
    const onMessage = (event: MessageEvent) => {
      const payload = payloadRef.current;
      const contentWindow = iframeRef.current?.contentWindow;
      if (!payload || !contentWindow) return;
      if (event.source !== contentWindow) return;
      // A sandbox without allow-same-origin gives the frame an opaque origin,
      // so the only trustworthy identity is the exact iframe contentWindow.
      if (event.origin !== "null") return;
      const data = asRecord(event.data);
      if (!data) return;
      if (data.method === "ui/notifications/size-changed") {
        const height = asRecord(data.params)?.height;
        const iframe = iframeRef.current;
        if (iframe && typeof height === "number" && Number.isFinite(height) && height > 0) {
          iframe.style.height = `${Math.min(MAX_VIEW_HEIGHT, Math.ceil(height))}px`;
          if (sentResultRef.current) revealApps();
        }
        return;
      }
      if (typeof data.id === "undefined") {
        if (data.method === "ui/notifications/initialized") sendToolInputAndResult(payload);
        return;
      }
      if (data.method === "ui/initialize") {
        send({
          jsonrpc: "2.0",
          id: data.id,
          result: {
            protocolVersion: APPS_PROTOCOL_VERSION,
            hostCapabilities: { serverTools: {} },
            hostInfo: { name: "pi-web", version: "1.0.0" },
            hostContext: { platform: "web", theme: currentTheme() },
          },
        });
        return;
      }
      if (data.method === "tools/call") {
        handleToolCall(data.id, data.params);
        return;
      }
      if (data.method === "ui/resource-teardown") {
        send({ jsonrpc: "2.0", id: data.id, result: {} });
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Arm the handshake timeout whenever a projection is mounted; clear it if the
  // view reveals itself or the projection changes.
  useEffect(() => {
    if (!apps) return;
    completedRef.current = false;
    readyTimerRef.current = window.setTimeout(() => {
      if (!completedRef.current) setFailed(true);
    }, APPS_HANDSHAKE_TIMEOUT_MS);
    return () => window.clearTimeout(readyTimerRef.current);
  }, [apps]);

  const fallback = useCallback(() => {
    setFailed(true);
  }, []);

  const retry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const showApps = Boolean(apps) && !failed && handshakeReady;
  const viewState: AskUserAppViewState = failed ? "failed" : showApps ? "apps" : "loading";

  return (
    <div data-ask-user-view={viewState} style={{ width: "100%", maxWidth: 820, margin: "0 auto" }}>
      {viewState === "failed" ? <AskUserAppFailure ask={ask} onRetry={retry} /> : null}
      {viewState === "loading" ? (
        <div
          role="status"
          aria-busy="true"
          aria-label={t("chat.askUserTitle")}
          style={{
            width: "100%",
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--bg-panel)",
            padding: "14px",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ height: 12, width: "45%", borderRadius: 6, background: "var(--bg)", opacity: 0.7 }} />
          <div style={{ height: 34, width: "100%", borderRadius: 7, background: "var(--bg)", opacity: 0.5 }} />
        </div>
      ) : null}
      {apps && !failed ? (
        <div
          aria-hidden={showApps ? undefined : true}
          style={showApps ? undefined : {
            position: "fixed",
            left: -10000,
            top: 0,
            width: 820,
            height: 800,
            overflow: "hidden",
            opacity: 0,
            pointerEvents: "none",
          }}
        >
          <iframe
            key={reloadKey}
            ref={iframeRef}
            title={t("chat.askUserTitle")}
            srcDoc={apps.html}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            tabIndex={showApps ? undefined : -1}
            onError={fallback}
            style={{
              width: "100%",
              maxWidth: 820,
              minHeight: 220,
              border: "none",
              display: "block",
              margin: "0 auto",
              background: "transparent",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
