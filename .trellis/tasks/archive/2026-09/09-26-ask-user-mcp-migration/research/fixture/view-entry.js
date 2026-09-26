import { App, LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/ext-apps';
const app = new App({ name: 'ask-view-probe', version: '1.0.0' }, {}, { autoResize: false, strict: true });
const report = (kind, data) => window.parent.postMessage({ probe: kind, data }, window.parent.location.origin);
const input = new Promise((resolve) => { app.ontoolinput = (params) => { report('tool-input', params); resolve(params); }; });
app.ontoolresult = (params) => report('tool-result', params);
app.onteardown = async () => { report('teardown-handler', {}); return {}; };
await app.connect();
report('connected', { version: LATEST_PROTOCOL_VERSION, origin: window.parent.location.origin, cookie: document.cookie,
  topBlocked: (() => { try { window.top.document.body; return false; } catch { return true; } })() });
const received = await input;
for (const [kind, name, args] of [
  ['unknown-tool', 'unlisted_tool', { askId: 'ask-1' }],
  ['submit', 'submit_ask', { sessionId: received.arguments.sessionId, askId: received.arguments.askId, answer: 'yes' }],
  ['duplicate', 'submit_ask', { sessionId: received.arguments.sessionId, askId: received.arguments.askId, answer: 'yes' }],
  ['wrong-session', 'submit_ask', { sessionId: 'wrong', askId: 'ask-1', answer: 'yes' }],
]) {
  try { report(kind, { rejected: false, result: await app.callServerTool({ name, arguments: args }) }); }
  catch (error) { report(kind, { rejected: true, message: error.message }); }
}
report('done', {});
