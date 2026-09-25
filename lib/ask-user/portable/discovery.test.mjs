import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createRequire } from "node:module";
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";

/**
 * SDK-level proof that an independently copied package directory — not a
 * symlink back into this repo or its node_modules — is discoverable through
 * `package.json` `pi.extensions`, that its `ask_user` tool resolves one host
 * bridge through the loader-scoped event bus, and that every negotiation
 * failure is closed. No model call, no network, no real agent dir.
 */

const SOURCE_DIR = fileURLToPath(new URL(".", import.meta.url));
const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { ASK_USER_BRIDGE_CHANNEL } = await jiti.import("./bridge.ts");

const scratch = mkdtempSync(join(tmpdir(), "ask-user-discovery-"));
const packageDir = join(scratch, "package");
const agentDir = join(scratch, "agent");
cpSync(SOURCE_DIR, packageDir, {
  recursive: true,
  filter: (src) => !src.includes(`${sep}node_modules`) && !src.endsWith(".test.mjs"),
});
after(() => rmSync(scratch, { recursive: true, force: true }));

function makeLoader(hostFactories = []) {
  return new DefaultResourceLoader({
    cwd: scratch,
    agentDir,
    noSkills: true,
    noThemes: true,
    noPromptTemplates: true,
    noContextFiles: true,
    settingsManager: SettingsManager.inMemory({ packages: [packageDir], extensions: [] }),
    extensionFactories: hostFactories,
  });
}

function externalExtension(loader) {
  const { extensions, errors } = loader.getExtensions();
  assert.deepEqual(errors, []);
  const external = extensions.filter((extension) => !extension.path.startsWith("<inline:"));
  assert.equal(external.length, 1, "exactly the local package extension should load");
  assert.equal(external[0].path, join(packageDir, "index.ts"), "entry should be the copied package, not the repo source");
  assert.equal(realpathSync(external[0].path), external[0].path, "copied entry must not be a symlink back to the repo");
  assert.equal(existsSync(join(packageDir, "node_modules")), false);
  return external[0];
}

async function loadTool(hostFactories = []) {
  const loader = makeLoader(hostFactories);
  await loader.reload();
  const tool = externalExtension(loader).tools.get("ask_user")?.definition;
  assert.ok(tool, "ask_user tool should be registered");
  return (questions, sessionId = "discovery-session") => tool.execute(
    "call",
    { questions },
    undefined,
    undefined,
    { sessionManager: { getSessionId: () => sessionId } },
  );
}

function host(record) {
  return {
    name: "discovery-host",
    factory: (pi) => pi.events.on(ASK_USER_BRIDGE_CHANNEL, (request) => {
      request.register(async (ask) => {
        record.push(ask);
        return {
          ask: { askId: `ask-${record.length}`, askedAt: "2026-09-25T00:00:00.000Z", questions: ask.questions },
        };
      });
    }),
  };
}

const questions = [{
  id: "q1",
  question: "Which database?",
  options: [{ value: "pg", label: "Postgres" }],
}];

test("the bridge channel is namespaced and versioned", () => {
  assert.equal(ASK_USER_BRIDGE_CHANNEL, "pi.ask-user.bridge:resolve-open:v1");
});

function readInstalledPackage(specifier) {
  let dir = dirname(fileURLToPath(import.meta.resolve(specifier)));
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      const pkg = JSON.parse(readFileSync(candidate, "utf8"));
      if (pkg.name === specifier) return pkg;
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no installed package.json for ${specifier}`);
    dir = parent;
  }
}

test("the copied package declares the SDK entry and peers the host loader actually provides", () => {
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const codingAgent = readInstalledPackage("@earendil-works/pi-coding-agent");
  const piAi = readInstalledPackage("@earendil-works/pi-ai");
  assert.deepEqual(manifest.pi.extensions, ["./index.ts"]);
  assert.equal(manifest.private, true);
  assert.equal(manifest.peerDependencies["@earendil-works/pi-coding-agent"], "0.85.1");
  assert.equal(manifest.peerDependencies["@earendil-works/pi-ai"], "0.85.1");
  assert.equal(codingAgent.version, manifest.peerDependencies["@earendil-works/pi-coding-agent"]);
  assert.equal(piAi.version, manifest.peerDependencies["@earendil-works/pi-ai"]);
  // The copy is outside this repo, so Node walk-up cannot see Pi Web's
  // node_modules. Loading still works because the SDK loader aliases peers.
  const copiedRequire = createRequire(join(packageDir, "index.ts"));
  assert.throws(() => copiedRequire.resolve("@earendil-works/pi-coding-agent"), { code: "MODULE_NOT_FOUND" });
  assert.throws(() => copiedRequire.resolve("@earendil-works/pi-ai"), { code: "MODULE_NOT_FOUND" });
});

test("the local package directory is discovered and answers through a host bridge", async () => {
  const record = [];
  const tool = await loadTool([host(record)]);
  const result = await tool(questions, "sdk-session");
  assert.equal(result.terminate, true);
  assert.equal(record.length, 1);
  assert.equal(record[0].conversationId, "sdk-session");
  assert.equal(record[0].version, 1);
  assert.match(result.content[0].text, /Posted 1 question to the user as ask ask-1/);
});

test("a discovered package with no host bridge fails closed", async () => {
  const tool = await loadTool([]);
  await assert.rejects(() => tool(questions), /exactly one synchronous host bridge/);
});

test("two host bridges on the same loader fail closed", async () => {
  const tool = await loadTool([host([]), host([])]);
  await assert.rejects(() => tool(questions), /exactly one synchronous host bridge .*\(got 2\)/);
});

test("a malformed ask is rejected before any host sees it", async () => {
  const record = [];
  const tool = await loadTool([host(record)]);
  await assert.rejects(() => tool([]), /An ask must contain at least one question/);
  assert.equal(record.length, 0);
});

test("an invalid durable acknowledgement fails closed", async () => {
  const ackless = { name: "ackless-host", factory: (pi) => pi.events.on(ASK_USER_BRIDGE_CHANNEL, (request) => {
    request.register(async () => ({}));
  }) };
  const tool = await loadTool([ackless]);
  await assert.rejects(() => tool(questions), /acknowledgement/);
});

test("a mismatched question acknowledgement does not terminate", async () => {
  const mismatched = {
    name: "mismatched-host",
    factory: (pi) => pi.events.on(ASK_USER_BRIDGE_CHANNEL, (request) => {
      request.register(async () => ({
        ask: {
          askId: "ask-x",
          askedAt: "2026-09-25T00:00:00.000Z",
          questions: [{ id: "other", question: "Not what you asked", options: [] }],
        },
      }));
    }),
  };
  const tool = await loadTool([mismatched]);
  await assert.rejects(() => tool(questions), /questions do not match the validated ask/);
});
