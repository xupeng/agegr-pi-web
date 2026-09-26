import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { getToolUiResourceUri } from '@modelcontextprotocol/ext-apps/app-bridge';
import { z } from 'zod';

const uri = 'ui://pi-web/ask-user.html';
const html = '<!doctype html><html><head><title>Ask</title></head><body>Ask</body></html>';
const server = new McpServer({ name: 'ask-user-fixture', version: '1.0.0' });
registerAppTool(server, 'show_ask', {
  description: 'Display an already persisted question',
  inputSchema: z.object({ askId: z.string() }),
  _meta: { ui: { resourceUri: uri, visibility: ['app'] } },
}, async ({ askId }) => ({
  content: [{ type: 'text', text: `Question ${askId} is pending` }],
  structuredContent: { version: 1, askId, questions: [{ id: 'q', question: 'Proceed?', options: [] }] },
}));
registerAppResource(server, 'Ask user view', uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
  contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html }],
}));

const client = new Client({ name: 'ask-user-host-fixture', version: '1.0.0' });
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const listed = await client.listTools();
  const tool = listed.tools.find((candidate) => candidate.name === 'show_ask');
  assert.ok(tool, 'show_ask was discovered');
  assert.equal(getToolUiResourceUri(tool), uri);
  const result = await client.callTool({ name: 'show_ask', arguments: { askId: 'ask-1' } });
  assert.equal(result.structuredContent?.askId, 'ask-1');
  assert.equal(result.content[0]?.type, 'text');
  const resource = await client.readResource({ uri });
  assert.equal(resource.contents[0]?.mimeType, RESOURCE_MIME_TYPE);
  assert.equal(resource.contents[0]?.text, html);
  console.log(JSON.stringify({
    discovered: { name: tool.name, ui: tool._meta?.ui },
    result,
    resource,
    negotiatedVersion: client.getNegotiatedProtocolVersion?.() ?? null,
  }, null, 2));
} finally {
  await client.close();
  await server.close();
}
