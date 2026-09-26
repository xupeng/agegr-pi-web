/**
 * Server-only MCP Apps adapter for the built-in Pi Web `ask_user` view.
 *
 * This module is imported only by the authenticated ask-view route
 * (`app/api/agent/[id]/ask-view/route.ts`). It builds a real, in-process MCP
 * server/client pair over `InMemoryTransport`, registers exactly one app-only
 * projection tool plus the `ui://pi-web/ask-user.html` resource, and reads the
 * projection back for the browser host.
 *
 * It deliberately does not open an ask, expose a generic MCP HTTP endpoint, or
 * make the Apps view the authority for ask state. The Pi tool in
 * `./portable/tool.ts` and the `PendingAskStore` keep owning identity,
 * validation and closing; this adapter is a read-only projection of an ask the
 * host already persisted.
 */
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer, type Tool } from "@modelcontextprotocol/server";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import {
  getToolUiResourceUri,
  isToolVisibilityAppOnly,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { z } from "zod";
import {
  ASK_USER_ID_MAX_LENGTH,
  ASK_USER_OPTION_LIMIT,
  ASK_USER_QUESTION_LIMIT,
  ASK_USER_TEXT_MAX_LENGTH,
  type AskUserQuestion,
  type PendingAskUser,
} from "./portable/types";
import { ASK_USER_VIEW_HTML } from "./mcp-view-html";

/** Exact `ui://` URI of the built-in ask view. Never proxy another resource. */
export const ASK_USER_VIEW_URI = "ui://pi-web/ask-user.html";
/** App-only projection tool; never visible to the model. */
export const ASK_USER_VIEW_TOOL_NAME = "project_ask_user";
/** MIME type required by the MCP Apps 2026-01-26 spec. */
export const ASK_USER_VIEW_MIME_TYPE = RESOURCE_MIME_TYPE;
/** Apps handshake version used by the browser view/host (separate from core MCP). */
export const ASK_USER_APPS_PROTOCOL_VERSION = "2026-01-26";
/** Core MCP version the pinned 2.0.0 SDK negotiates over InMemoryTransport. */
export const ASK_USER_VIEW_CORE_PROTOCOL_VERSION = "2025-11-25";

export interface AskUserViewOption {
  value: string;
  label: string;
  detail?: string;
}

export interface AskUserViewQuestion {
  id: string;
  question: string;
  detail?: string;
  multiple: boolean;
  options: AskUserViewOption[];
}

/** Bounded projection handed to the sandboxed view in `structuredContent`. */
export interface AskUserViewStructuredContent {
  schemaVersion: 1;
  sessionId: string;
  askId: string;
  askedAt: string;
  questions: AskUserViewQuestion[];
}

export interface AskUserViewPayload {
  uri: string;
  mimeType: string;
  appsProtocolVersion: string;
  coreProtocolVersion: string;
  toolName: string;
  toolInput: { sessionId: string; askId: string };
  structuredContent: AskUserViewStructuredContent;
  content: Array<{ type: "text"; text: string }>;
  html: string;
}

function bound(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function projectQuestion(question: AskUserQuestion): AskUserViewQuestion {
  return {
    id: bound(question.id, ASK_USER_ID_MAX_LENGTH),
    question: bound(question.question, ASK_USER_TEXT_MAX_LENGTH),
    ...(question.detail === undefined ? {} : { detail: bound(question.detail, ASK_USER_TEXT_MAX_LENGTH) }),
    multiple: question.multiple === true,
    options: question.options.slice(0, ASK_USER_OPTION_LIMIT).map((option) => ({
      value: bound(option.value, ASK_USER_ID_MAX_LENGTH),
      label: bound(option.label, ASK_USER_TEXT_MAX_LENGTH),
      ...(option.detail === undefined ? {} : { detail: bound(option.detail, ASK_USER_TEXT_MAX_LENGTH) }),
    })),
  };
}

/**
 * Clamp an already-validated open ask into the bounded DTO the view receives.
 * The ask was bounded when it opened, but re-bounding here keeps the projection
 * safe for rehydrated records and makes the limit explicit to callers/tests.
 */
export function projectAskUserView(sessionId: string, ask: PendingAskUser): AskUserViewStructuredContent {
  return {
    schemaVersion: 1,
    sessionId: bound(sessionId, ASK_USER_ID_MAX_LENGTH),
    askId: bound(ask.askId, ASK_USER_ID_MAX_LENGTH),
    askedAt: bound(ask.askedAt, ASK_USER_TEXT_MAX_LENGTH),
    questions: ask.questions.slice(0, ASK_USER_QUESTION_LIMIT).map(projectQuestion),
  };
}

/** Reject a tool list that would make any tool visible to the model. */
export function assertNoModelVisibleTools(tools: readonly Pick<Tool, "name" | "_meta">[]): void {
  const visible = tools.filter((tool) => !isToolVisibilityAppOnly(tool));
  if (visible.length > 0) {
    throw new Error(`Ask user view refuses model-visible tools: ${visible.map((tool) => tool.name).join(", ")}`);
  }
}

/** Assert the projection tool is the exact built-in app-only tool/URI. */
export function assertAskUserViewTool(tool: Pick<Tool, "name" | "_meta"> | undefined): void {
  if (tool === undefined) throw new Error("Ask user view projection tool is missing");
  if (tool.name !== ASK_USER_VIEW_TOOL_NAME) throw new Error(`Ask user view rejects tool ${tool.name}`);
  if (!isToolVisibilityAppOnly(tool)) throw new Error("Ask user view projection tool must be app-only");
  const uri = getToolUiResourceUri(tool);
  if (uri !== ASK_USER_VIEW_URI) throw new Error(`Ask user view rejects tool resource ${uri ?? "(none)"}`);
}

/** Assert a requested resource URI is the one built-in ask view. */
export function assertAskUserViewUri(uri: string): void {
  if (uri !== ASK_USER_VIEW_URI) throw new Error(`Ask user view rejects resource ${uri}`);
}

/**
 * Register the one app-only projection tool and its matching `ui://` resource.
 * The tool closes over the given already-persisted ask, so it can only project
 * that ask and can never open a second one.
 */
export function registerAskUserView(server: McpServer, input: { sessionId: string; ask: PendingAskUser }): void {
  const projection = projectAskUserView(input.sessionId, input.ask);
  registerAppTool(
    server,
    ASK_USER_VIEW_TOOL_NAME,
    {
      title: "Pi Web ask_user view",
      description: "Read-only projection of the current open ask_user question set for the sandboxed Pi Web view.",
      inputSchema: z.object({
        sessionId: z.string().min(1).max(ASK_USER_ID_MAX_LENGTH),
        askId: z.string().min(1).max(ASK_USER_ID_MAX_LENGTH),
      }),
      _meta: { ui: { resourceUri: ASK_USER_VIEW_URI, visibility: ["app"] } },
    },
    ({ sessionId, askId }) => {
      if (sessionId !== projection.sessionId || askId !== projection.askId) {
        throw new Error("ask view projection is stale or unauthorized");
      }
      return {
        content: [{ type: "text", text: `Open ask_user question set ${projection.askId}` }],
        structuredContent: projection,
      };
    },
  );
  registerAppResource(
    server,
    "Pi Web ask_user view",
    ASK_USER_VIEW_URI,
    { mimeType: ASK_USER_VIEW_MIME_TYPE },
    () => ({
      contents: [{ uri: ASK_USER_VIEW_URI, mimeType: ASK_USER_VIEW_MIME_TYPE, text: ASK_USER_VIEW_HTML }],
    }),
  );
}

function assertMatch(value: unknown, key: string, expected: string): void {
  if (value !== expected) throw new Error(`Ask user view projection ${key} does not match the open ask`);
}

/**
 * Validate the wire projection the in-process client read back. It is produced
 * by our own server, but `callTool` widens the type at the boundary, so the
 * shape and identity are re-checked before the browser sees it.
 */
function parseStructuredContent(
  value: unknown,
  expected: { sessionId: string; askId: string },
): AskUserViewStructuredContent {
  if (typeof value !== "object" || value === null) throw new Error("Ask user view projection is missing");
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) throw new Error("Unsupported ask user view projection version");
  assertMatch(record.sessionId, "sessionId", expected.sessionId);
  assertMatch(record.askId, "askId", expected.askId);
  if (!Array.isArray(record.questions) || record.questions.length > ASK_USER_QUESTION_LIMIT) {
    throw new Error("Ask user view projection questions are out of bounds");
  }
  // Runtime-checked above, so the cast documents the validated boundary only.
  return value as AskUserViewStructuredContent;
}

/**
 * Run a genuine in-process MCP Apps tool/resource exchange for one open ask and
 * return the fixed resource plus the bounded tool-result projection.
 */
export async function createAskUserView(input: {
  sessionId: string;
  ask: PendingAskUser;
}): Promise<AskUserViewPayload> {
  const server = new McpServer({ name: "pi-web-ask-user-view", version: "1.0.0" });
  registerAskUserView(server, input);

  const client = new Client({ name: "pi-web-ask-user-host", version: "1.0.0" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    const { tools } = await client.listTools();
    assertNoModelVisibleTools(tools);
    assertAskUserViewTool(tools.find((candidate) => candidate.name === ASK_USER_VIEW_TOOL_NAME));

    const resource = await client.readResource({ uri: ASK_USER_VIEW_URI });
    const first = resource.contents[0];
    assertAskUserViewUri(first?.uri ?? "");
    if (first?.mimeType !== ASK_USER_VIEW_MIME_TYPE || !("text" in first) || typeof first.text !== "string") {
      throw new Error("Ask user view resource is not the expected MCP Apps HTML");
    }

    const result = await client.callTool({
      name: ASK_USER_VIEW_TOOL_NAME,
      arguments: { sessionId: input.sessionId, askId: input.ask.askId },
    });
    const structuredContent = parseStructuredContent(result.structuredContent, {
      sessionId: input.sessionId,
      askId: input.ask.askId,
    });
    const textBlock = result.content.find((block) => block.type === "text");
    const content = [{ type: "text" as const, text: textBlock?.type === "text" ? textBlock.text : "" }];

    return {
      uri: ASK_USER_VIEW_URI,
      mimeType: ASK_USER_VIEW_MIME_TYPE,
      appsProtocolVersion: ASK_USER_APPS_PROTOCOL_VERSION,
      coreProtocolVersion: client.getNegotiatedProtocolVersion() ?? ASK_USER_VIEW_CORE_PROTOCOL_VERSION,
      toolName: ASK_USER_VIEW_TOOL_NAME,
      toolInput: { sessionId: input.sessionId, askId: input.ask.askId },
      structuredContent,
      content,
      html: first.text,
    };
  } finally {
    await client.close();
    await server.close();
  }
}
