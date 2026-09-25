import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';

// Discovery probe for an independently copied portable package under SDK
// 0.85.1. The copy lives under the system temp dir, not this repo and not a
// symlink back to its node_modules. No model, network, service, or leftover
// agent dir.
const here = fileURLToPath(new URL('.', import.meta.url));
let repoRoot = here;
while (!existsSync(join(repoRoot, 'package.json'))) {
  const parent = dirname(repoRoot);
  if (parent === repoRoot) throw new Error('repository package.json not found');
  repoRoot = parent;
}
const source = resolve(repoRoot, 'lib/ask-user/portable');
const scratch = mkdtempSync(join(tmpdir(), 'ask-user-sdk-probe-'));
const root = join(scratch, 'package');
const agentDir = join(scratch, 'agent');
cpSync(source, root, {
  recursive: true,
  filter: (src) => !src.includes(`${sep}node_modules`) && !src.endsWith('.test.mjs'),
});
const channel = 'pi.ask-user.bridge:resolve-open:v1';
const questions = [{ id: 'q', question: 'Valid?' }];
let calls = 0;
let fail = false;
const host = (pi) => pi.events.on(channel, (request) => {
  request.register(async (input) => {
    calls++;
    assert.equal(input.conversationId, 'probe-session');
    assert.equal(input.version, 1);
    if (fail) throw new Error('Persistence refused');
    return { ask: { askId: `ask-${calls}`, askedAt: '2026-09-25T00:00:00.000Z', questions: input.questions } };
  });
});
const base = { cwd: scratch, agentDir, noSkills: true, noThemes: true,
  noPromptTemplates: true, noContextFiles: true,
  settingsManager: SettingsManager.inMemory({ packages: [root], extensions: [] }) };
function getTool(loader) {
  const { extensions, errors } = loader.getExtensions();
  assert.deepEqual(errors, []);
  assert.equal(extensions.filter((ext) => !ext.path.startsWith('<inline:')).length, 1);
  const ext = extensions.find((item) => !item.path.startsWith('<inline:'));
  assert.ok(ext.path.endsWith('index.ts'), `unexpected entry ${ext.path}`);
  const tool = ext.tools.get('ask_user')?.definition;
  assert.ok(tool);
  return (input) => tool.execute('call', { questions: input }, undefined, undefined,
    { sessionManager: { getSessionId: () => 'probe-session' } });
}
try {
  const plain = new DefaultResourceLoader(base);
  await plain.reload();
  const unbound = getTool(plain);
  await assert.rejects(() => unbound([{ id: '', question: 'Invalid' }]), /must not be empty/);
  await assert.rejects(() => unbound(questions), /exactly one synchronous host bridge/);
  assert.equal(calls, 0);

  // Package extension loads before inline extension, but resolves the host on execute.
  const withHost = new DefaultResourceLoader({ ...base,
    extensionFactories: [{ name: 'probe-host', factory: host }] });
  await withHost.reload();
  const bound = getTool(withHost);
  assert.equal((await bound(questions)).terminate, true);
  assert.equal(calls, 1);
  fail = true;
  await assert.rejects(() => bound(questions), /Persistence refused/);
  assert.equal(calls, 2);

  const duplicate = new DefaultResourceLoader({ ...base,
    extensionFactories: [{ name: 'host-1', factory: host }, { name: 'host-2', factory: host }] });
  await duplicate.reload();
  await assert.rejects(() => getTool(duplicate)(questions), /exactly one synchronous host bridge/);
  assert.equal(calls, 2);
  const forged = new DefaultResourceLoader({ ...base,
    extensionFactories: [{ name: 'forged-host', factory: (pi) => pi.events.on(channel, (request) => {
      request.register(async () => ({ ask: { askId: 'x', askedAt: '2026-09-25T00:00:00.000Z',
        questions: [{ id: 'other', question: 'forged', options: [] }] } }));
    }) }] });
  await forged.reload();
  await assert.rejects(() => getTool(forged)(questions), /questions do not match the validated ask/);
  console.log('SDK 0.85.1: copied package discovered; missing/duplicate bridge, malformed ask, forged ack and host failure fail; async open verified');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
