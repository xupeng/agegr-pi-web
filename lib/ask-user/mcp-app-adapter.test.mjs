import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { isToolVisibilityAppOnly } from "@modelcontextprotocol/ext-apps/app-bridge";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const adapter = await jiti.import("./mcp-app-adapter.ts");
const {
  ASK_USER_VIEW_MIME_TYPE,
  ASK_USER_VIEW_TOOL_NAME,
  ASK_USER_VIEW_URI,
  assertAskUserViewTool,
  assertAskUserViewUri,
  assertNoModelVisibleTools,
  createAskUserView,
  projectAskUserView,
  registerAskUserView,
} = adapter;
const {
  ASK_USER_ID_MAX_LENGTH,
  ASK_USER_OPTION_LIMIT,
  ASK_USER_QUESTION_LIMIT,
  ASK_USER_TEXT_MAX_LENGTH,
} = await jiti.import("./portable/types.ts");
const { ASK_USER_VIEW_HTML } = await jiti.import("./mcp-view-html.ts");

const APP_TOOL = {
  name: ASK_USER_VIEW_TOOL_NAME,
  _meta: { ui: { resourceUri: ASK_USER_VIEW_URI, visibility: ["app"] } },
};

function makeAsk() {
  return {
    askId: "ask-1",
    askedAt: "2026-09-26T00:00:00.000Z",
    questions: [
      {
        id: "q1",
        question: "Which database?",
        detail: "Pick one.",
        options: [{ value: "pg", label: "Postgres" }, { value: "sqlite", label: "SQLite" }],
      },
      {
        id: "q2",
        question: "Anything else?",
        options: [],
        multiple: true,
      },
    ],
  };
}

test("projection clamps questions, options, ids and text to the shared bounds", () => {
  const longText = "x".repeat(ASK_USER_TEXT_MAX_LENGTH + 500);
  const longId = "i".repeat(ASK_USER_ID_MAX_LENGTH + 10);
  const ask = {
    askId: longId,
    askedAt: "2026-09-26T00:00:00.000Z",
    questions: Array.from({ length: ASK_USER_QUESTION_LIMIT + 5 }, (_unused, questionIndex) => ({
      id: longId,
      question: longText,
      detail: longText,
      options: Array.from({ length: ASK_USER_OPTION_LIMIT + 4 }, (_option, optionIndex) => ({
        value: longId,
        label: longText,
        detail: longText,
        index: optionIndex,
      })),
      multiple: true,
      questionIndex,
    })),
  };

  const projection = projectAskUserView(longId, ask);
  assert.equal(projection.schemaVersion, 1);
  assert.equal(projection.sessionId.length, ASK_USER_ID_MAX_LENGTH);
  assert.equal(projection.askId.length, ASK_USER_ID_MAX_LENGTH);
  assert.equal(projection.questions.length, ASK_USER_QUESTION_LIMIT);
  for (const question of projection.questions) {
    assert.equal(question.id.length, ASK_USER_ID_MAX_LENGTH);
    assert.equal(question.question.length, ASK_USER_TEXT_MAX_LENGTH);
    assert.equal(question.detail.length, ASK_USER_TEXT_MAX_LENGTH);
    assert.equal(question.options.length, ASK_USER_OPTION_LIMIT);
    for (const option of question.options) {
      assert.equal(option.value.length, ASK_USER_ID_MAX_LENGTH);
      assert.equal(option.label.length, ASK_USER_TEXT_MAX_LENGTH);
      assert.equal(option.detail.length, ASK_USER_TEXT_MAX_LENGTH);
    }
  }
});

test("adapter round trip serves the Apps MIME, app-only tool and bounded projection", async () => {
  const payload = await createAskUserView({ sessionId: "session-1", ask: makeAsk() });
  assert.equal(payload.uri, ASK_USER_VIEW_URI);
  assert.equal(payload.mimeType, ASK_USER_VIEW_MIME_TYPE);
  assert.equal(payload.mimeType, "text/html;profile=mcp-app");
  assert.equal(payload.appsProtocolVersion, "2026-01-26");
  assert.equal(payload.coreProtocolVersion, "2025-11-25");
  assert.equal(payload.toolName, ASK_USER_VIEW_TOOL_NAME);
  assert.equal(payload.html, ASK_USER_VIEW_HTML);
  assert.match(payload.html, /<div id="pi-web-ask-root">/);
  assert.doesNotMatch(payload.html, /<script[^>]*\bsrc=/);
  assert.equal(payload.structuredContent.sessionId, "session-1");
  assert.equal(payload.structuredContent.askId, "ask-1");
  assert.equal(payload.structuredContent.questions.length, 2);
  assert.equal(payload.structuredContent.questions[1].multiple, true);
  assert.equal(payload.toolInput.askId, "ask-1");
});

test("registered tool list is app-only with the exact resource URI", async () => {
  const server = new McpServer({ name: "test-ask-view", version: "1.0.0" });
  registerAskUserView(server, { sessionId: "session-1", ask: makeAsk() });
  const client = new Client({ name: "test-host", version: "1.0.0" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, ASK_USER_VIEW_TOOL_NAME);
    assert.equal(isToolVisibilityAppOnly(tools[0]), true);
    assert.doesNotThrow(() => assertNoModelVisibleTools(tools));
  } finally {
    await client.close();
    await server.close();
  }
});

test("wrong tool name and wrong resource URI are rejected by the live MCP pair", async () => {
  const server = new McpServer({ name: "test-ask-view", version: "1.0.0" });
  registerAskUserView(server, { sessionId: "session-1", ask: makeAsk() });
  const client = new Client({ name: "test-host", version: "1.0.0" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await assert.rejects(client.callTool({ name: "ask_user", arguments: {} }));
    await assert.rejects(client.readResource({ uri: "ui://pi-web/not-ask-user.html" }));
  } finally {
    await client.close();
    await server.close();
  }
});

test("pure admission helpers reject model-visible, wrong-name and wrong-URI input", () => {
  assert.doesNotThrow(() => assertAskUserViewTool(APP_TOOL));
  assert.throws(() => assertAskUserViewTool(undefined), /missing/);
  assert.throws(() => assertAskUserViewTool({ ...APP_TOOL, name: "ask_user" }), /rejects tool ask_user/);
  assert.throws(
    () => assertAskUserViewTool({ name: APP_TOOL.name, _meta: { ui: { resourceUri: "ui://x/view.html", visibility: ["app"] } } }),
    /rejects tool resource/,
  );
  assert.throws(
    () => assertNoModelVisibleTools([{ name: "ask_user", _meta: { ui: { resourceUri: ASK_USER_VIEW_URI, visibility: ["model"] } } }]),
    /model-visible/,
  );
  assert.doesNotThrow(() => assertNoModelVisibleTools([APP_TOOL]));
  assert.doesNotThrow(() => assertAskUserViewUri(ASK_USER_VIEW_URI));
  assert.throws(() => assertAskUserViewUri("ui://evil"), /rejects resource/);
});
