import { AppBridge, PostMessageTransport, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/ext-apps/app-bridge';
const iframe = document.querySelector('iframe');
const trace = window.__trace = [];
const record = (kind, data) => { trace.push({ kind, data }); };
window.addEventListener('message', async (event) => {
  if (event.source !== iframe.contentWindow || event.origin !== window.__sandboxOrigin) return;
  if (event.data?.probe) {
    record(event.data.probe, event.data.data);
    if (event.data.probe === 'done') {
      try { record('teardown-result', await bridge.teardownResource({})); }
      catch (error) { record('teardown-error', error.message); }
      await bridge.close();
      iframe.remove();
      record('closed', true);
    }
  }
  if (event.data?.ready === true) {
    record('sandbox-ready', event.origin);
    await bridge.sendSandboxResourceReady({ html: window.__resourceHtml });
    record('resource-ready', true);
  }
  if (event.data?.jsonrpc === '2.0') record('wire', { direction: 'sandbox-to-host', message: event.data });
});
const bridge = new AppBridge(null, { name: 'ask-host-probe', version: '1.0.0' },
  { serverTools: {} }, { hostContext: { platform: 'web' } });
bridge.oncalltool = async (params) => {
  record('gateway-call', params);
  const response = await fetch('/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error);
  return payload;
};
bridge.oninitialized = async () => {
  record('initialized', { appsVersion: LATEST_PROTOCOL_VERSION, app: bridge.getAppVersion() });
  await bridge.sendToolInput({ arguments: { sessionId: 'session-1', askId: 'ask-1' } });
  record('sent-tool-input', true);
  await bridge.sendToolResult(window.__toolResult);
  record('sent-tool-result', true);
};
const transport = new PostMessageTransport(iframe.contentWindow, iframe.contentWindow);
const send = transport.send.bind(transport);
transport.send = async (message, options) => {
  record('wire', { direction: 'host-to-sandbox', message });
  return send(message, options);
};
await bridge.connect(transport);
record('bridge-connected', true);
