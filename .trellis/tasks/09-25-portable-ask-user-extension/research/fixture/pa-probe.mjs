import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// PA admission probe for an independently copied portable package. PA's
// fixed-directory loader reads a real directory entry, not a symlink whose
// realpath walks back into Pi Web or its node_modules. The PA repository is
// imported read-only; cwd and agentDir stay in the temp dir so nothing is
// written under the PA checkout or this task tree. No operator switch is toggled.
const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../../../../..');
const sourceDir = resolve(repoRoot, 'lib/ask-user/portable');
const pa = resolve(repoRoot, '../../personal-assistant');

const tmp = mkdtempSync(join(tmpdir(), 'pa-ask-user-'));
const extensionsDir = join(tmp, 'extensions');
const packageDir = join(extensionsDir, 'ask-user');
mkdirSync(extensionsDir, { recursive: true });
cpSync(sourceDir, packageDir, {
  recursive: true,
  filter: (src) => !src.includes(`${sep}node_modules`) && !src.endsWith('.test.mjs'),
});

const { readExtensionEntries, resolveRuntimeExtensions } = await import(`${pa}/src/assistant/extensions.ts`);
const entries = readExtensionEntries(extensionsDir);
assert.deepEqual(entries.map(({ id, kind }) => [id, kind]), [['ask-user', 'dir']]);
let registered = 0;
const host = (pi) => pi.events.on('pi.ask-user.bridge:resolve-open:v1', (request) => {
  request.register(async (input) => {
    assert.equal(input.conversationId, 'pa-fixture');
    registered++;
    return { ask: { askId: 'pa-ask-1', askedAt: '2026-09-25T00:00:00.000Z', questions: input.questions } };
  });
});
const options = {
  dir: extensionsDir, enabled: true,
  settings: { disabled: new Set(), disabledTools: new Map() },
  disabledTools: new Map(), appToolNames: new Set(), cwd: tmp,
  agentDir: join(tmp, 'agent'), extension: host,
  systemPrompt: 'Isolated fixture',
};
try {
  const out = await resolveRuntimeExtensions(options);
  assert.deepEqual(out.toolNames, ['ask_user']);
  assert.equal(out.entries[0].status, 'loaded');
  assert.equal(out.resourceLoader.getExtensions().errors.length, 0);
  const loaded = out.resourceLoader.getExtensions().extensions
    .find((ext) => !ext.path.startsWith('<inline:'));
  assert.equal(realpathSync(loaded.path), join(packageDir, 'index.ts'));
  assert.equal(loaded.path.startsWith(repoRoot), false);
  const tool = loaded.tools.get('ask_user').definition;
  const result = await tool.execute('call', { questions: [{ id: 'q', question: 'Valid?' }] },
    undefined, undefined, { sessionManager: { getSessionId: () => 'pa-fixture' } });
  assert.equal(result.terminate, true);
  assert.equal(registered, 1);
  const forged = await resolveRuntimeExtensions({
    ...options,
    extension: (pi) => pi.events.on('pi.ask-user.bridge:resolve-open:v1', (request) => {
      request.register(async () => ({
        ask: {
          askId: 'forged',
          askedAt: '2026-09-25T00:00:00.000Z',
          questions: [{ id: 'other', question: 'forged', options: [] }],
        },
      }));
    }),
  });
  const forgedTool = forged.resourceLoader.getExtensions().extensions
    .find((ext) => !ext.path.startsWith('<inline:')).tools.get('ask_user').definition;
  await assert.rejects(() => forgedTool.execute('call', { questions: [{ id: 'q', question: 'Valid?' }] },
    undefined, undefined, { sessionManager: { getSessionId: () => 'pa-fixture' } }),
  /questions do not match the validated ask/);
  const off = await resolveRuntimeExtensions({ ...options, enabled: false });
  assert.deepEqual(off.toolNames, []);
  const disabled = await resolveRuntimeExtensions({ ...options,
    settings: { disabled: new Set(['ask-user']), disabledTools: new Map() } });
  assert.deepEqual(disabled.toolNames, []);
  const disabledTool = await resolveRuntimeExtensions({ ...options,
    disabledTools: new Map([['ask-user', new Set(['ask_user'])]]) });
  assert.deepEqual(disabledTool.toolNames, []);
  console.log('PA Stage A: copied directory resolves the real package entry; inline host open called; forged ack fails; global/entry/tool off deny it');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
