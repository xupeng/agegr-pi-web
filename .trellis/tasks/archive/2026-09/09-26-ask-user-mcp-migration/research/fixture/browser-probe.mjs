import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { getToolUiResourceUri, isToolVisibilityAppOnly } from '@modelcontextprotocol/ext-apps/app-bridge';
import { z } from 'zod';

const rootRequire = createRequire(new URL('../../../../../package.json', import.meta.url));
const { chromium } = rootRequire('playwright');
const { build } = rootRequire('esbuild');
const bundle = async (name) => (await build({ entryPoints: [fileURLToPath(new URL(name, import.meta.url))], bundle: true, platform: 'browser', format: 'esm', write: false })).outputFiles[0].text;
const [hostJs, viewJs] = await Promise.all([bundle('host-entry.js'), bundle('view-entry.js')]);
const uri = 'ui://pi-web/ask-user.html';
const html = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; style-src \'unsafe-inline\'; connect-src \'none\'; frame-src \'none\'"><title>Ask</title></head><body><h1>Pending ask</h1><script type="module" src="/view.js"></script></body></html>';
let open = true;
const server = new McpServer({ name: 'ask-server-probe', version: '1.0.0' });
registerAppTool(server, 'submit_ask', { inputSchema: z.object({ sessionId: z.string(), askId: z.string(), answer: z.literal('yes') }), _meta: { ui: { resourceUri: uri, visibility: ['app'] } } }, async ({ sessionId, askId, answer }) => {
  if (sessionId !== 'session-1' || askId !== 'ask-1' || !open) throw new Error('stale or unauthorized ask');
  open = false;
  return { content: [{ type: 'text', text: 'accepted' }], structuredContent: { askId, answer } };
});
registerAppResource(server, 'Ask view', uri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: html }] }));
const client = new Client({ name: 'ask-host-probe', version: '1.0.0' });
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);
const listed = await client.listTools();
const tool = listed.tools.find((t) => t.name === 'submit_ask');
assert.ok(tool && isToolVisibilityAppOnly(tool) && getToolUiResourceUri(tool) === uri);
const resource = await client.readResource({ uri });
assert.equal(resource.contents[0].mimeType, RESOURCE_MIME_TYPE);
const toolResult = { content: [{ type: 'text', text: 'Question ask-1 pending' }], structuredContent: { askId: 'ask-1', question: 'Proceed?' } };
const respond = (res, status, type, body, headers = {}) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers }); res.end(body); };
const hostServer = http.createServer(async (req, res) => {
  if (req.url === '/host.js') return respond(res, 200, 'text/javascript', hostJs);
  if (req.url === '/call' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const params = JSON.parse(body);
      if (params.name !== 'submit_ask') throw new Error('tool not allowlisted');
      if (params.arguments?.sessionId !== 'session-1' || params.arguments?.askId !== 'ask-1' || !open) throw new Error('stale or unauthorized ask');
      return respond(res, 200, 'application/json', JSON.stringify(await client.callTool(params)));
    } catch (error) { return respond(res, 403, 'application/json', JSON.stringify({ error: error.message })); }
  }
  if (req.url !== '/') return respond(res, 404, 'text/plain', 'not found');
  const sandboxOrigin = `http://localhost:${sandboxServer.address().port}`;
  return respond(res, 200, 'text/html', `<!doctype html><html><body><iframe sandbox="allow-scripts allow-same-origin" src="${sandboxOrigin}/" style="width:600px;height:350px"></iframe><script>window.__sandboxOrigin=${JSON.stringify(sandboxOrigin)};window.__resourceHtml=${JSON.stringify(resource.contents[0].text).replaceAll('<', '\\x3c')};window.__toolResult=${JSON.stringify(toolResult)};</script><script type="module" src="/host.js"></script></body></html>`, { 'set-cookie': 'host_auth=fixture-only; SameSite=Lax; Path=/' });
});
const proxy = `<!doctype html><html><body><script>
const hostOrigin = '__HOST_ORIGIN__';
let view;
window.addEventListener('message', event => {
  if (event.source === window.parent && event.origin === hostOrigin) {
    if (event.data?.method === 'ui/notifications/sandbox-resource-ready') {
      view = document.createElement('iframe');
      view.sandbox = 'allow-scripts allow-same-origin';
      view.style = 'width:100%;height:300px';
      view.srcdoc = event.data.params.html;
      document.body.append(view);
    } else if (view) view.contentWindow.postMessage(event.data, location.origin);
  } else if (view && event.source === view.contentWindow && event.origin === location.origin) {
    window.parent.postMessage(event.data, hostOrigin);
  }
});
const announce = () => window.parent.postMessage({ready:true}, hostOrigin);
const readyTimer = setInterval(announce, 100);
announce();
window.addEventListener('message', event => {
  if (event.source === window.parent && event.origin === hostOrigin && event.data?.method === 'ui/notifications/sandbox-resource-ready') clearInterval(readyTimer);
});
</script></body></html>`;
const sandboxServer = http.createServer((req, res) => {
  if (req.url === '/view.js') return respond(res, 200, 'text/javascript', viewJs);
  if (req.url !== '/') return respond(res, 404, 'text/plain', 'not found');
  return respond(res, 200, 'text/html', proxy.replace('__HOST_ORIGIN__', `http://127.0.0.1:${hostServer.address().port}`), { 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline' 'self'; frame-src 'self'; style-src 'unsafe-inline'; connect-src 'none'" });
});
const listen = (server, host) => new Promise((resolve) => server.listen(0, host, resolve));
let browser;
try {
  await listen(hostServer, '127.0.0.1');
  await listen(sandboxServer, '127.0.0.1');
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.stack));
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() !== 'error' || text.includes('favicon') || text.includes('404') || text.includes('403')) return;
    errors.push(text);
  });
  page.on('requestfailed', req => { if (!req.url().endsWith('/favicon.ico')) errors.push(`${req.url()}: ${req.failure()?.errorText}`); });
  await page.goto(`http://127.0.0.1:${hostServer.address().port}/`);
  try { await page.waitForFunction(() => window.__trace?.some((item) => item.kind === 'closed'), null, { timeout: 12000 }); }
  catch (error) {
    console.error(JSON.stringify({ failure: error.message, errors, trace: await page.evaluate(() => window.__trace ?? []), frames: page.frames().map(f => f.url()) }, null, 2));
    throw error;
  }
  const trace = await page.evaluate(() => window.__trace);
  const by = (name) => trace.find((item) => item.kind === name)?.data;
  assert.equal(by('connected').version, '2026-01-26');
  assert.equal(by('connected').cookie, '');
  assert.equal(by('connected').topBlocked, true);
  for (const name of ['unknown-tool', 'duplicate', 'wrong-session']) assert.equal(by(name).rejected, true, name);
  assert.equal(by('submit').result.structuredContent.answer, 'yes');
  assert.ok(by('tool-input') && by('tool-result') && by('teardown-handler') && by('teardown-result'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', mcpNegotiatedVersion: client.getNegotiatedProtocolVersion(), modelVisibleTools: listed.tools.filter((t) => !isToolVisibilityAppOnly(t)).map((t) => t.name), resource: { uri, mimeType: resource.contents[0].mimeType }, errors, trace }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => hostServer.close(resolve));
  await new Promise(resolve => sandboxServer.close(resolve));
  await client.close();
  await server.close();
}
