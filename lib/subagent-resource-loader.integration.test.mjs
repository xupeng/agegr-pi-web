import { scratch } from "./subagent-gate-support.mjs";
import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { fauxProvider } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const jiti = createJiti(import.meta.url, { moduleCache: false });
const { createNoInstallResourceLoader } = await jiti.import("./subagent-resource-loader.ts");
const { createSubagentSessionServices, createProviderExtensionHost } = await jiti.import("./subagent-session-services.ts");
const { projectRegistrationAwareExtensionTools } = await jiti.import("./subagent-tool-policy.ts");
const { createAskUserToolProjection } = await jiti.import("./ask-user/extension-policy.ts");

const agentDir = process.env.PI_CODING_AGENT_DIR;
const cwd = join(scratch, "resource-project");
mkdirSync(cwd, { recursive: true });

const providerFixture = fileURLToPath(new URL("./__fixtures__/subagent-provider-gate/", import.meta.url));

function extensionSource(toolName) {
  return `export default function (pi) {
  pi.registerTool({
    name: ${JSON.stringify(toolName)},
    label: ${JSON.stringify(toolName)},
    description: ${JSON.stringify(toolName)},
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [{ type: "text", text: ${JSON.stringify(toolName)} }] }),
  });
}
`;
}

function writeExtensionPackage(root, files) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "pi-web-gate-pkg",
    private: true,
    pi: { extensions: files.map((file) => `extensions/${file.name}`) },
  }));
  mkdirSync(join(root, "extensions"), { recursive: true });
  for (const file of files) writeFileSync(join(root, "extensions", file.name), file.source);
}

async function fauxRuntime() {
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  const faux = fauxProvider({ models: [{ id: "gate-faux" }] });
  modelRuntime.registerNativeProvider(faux.provider);
  return { modelRuntime, faux };
}

test("no-install adapter matches the default loader for an installed local package", async () => {
  const root = join(scratch, "local-pkg");
  writeExtensionPackage(root, [
    { name: "one.mjs", source: extensionSource("gate_one") },
    { name: "two.mjs", source: extensionSource("gate_two") },
  ]);
  const settingsManager = SettingsManager.inMemory({ packages: [root] });
  const baseline = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await baseline.reload();
  const adapter = createNoInstallResourceLoader({ cwd, agentDir, settingsManager });
  await adapter.resourceLoader.reload();
  const summarize = (extensions) => extensions.map((extension) => ({
    path: extension.path,
    source: extension.sourceInfo.source,
    scope: extension.sourceInfo.scope,
    origin: extension.sourceInfo.origin,
    tools: [...extension.tools.keys()],
  }));
  assert.deepEqual(
    summarize(adapter.resourceLoader.getExtensions().extensions),
    summarize(baseline.getExtensions().extensions),
  );
  assert.equal(adapter.authorizedExtensions.length, 2);
  assert.ok(adapter.authorizedExtensions.every((resource) => resource.enabled));
});

test("a missing package is skipped with a diagnostic and no install", async () => {
  const settingsManager = SettingsManager.inMemory({ packages: ["https://github.com/pi-web-gate-missing/nonexistent.git"] });
  const adapter = createNoInstallResourceLoader({ cwd, agentDir, settingsManager, onMissingSource: () => "skip" });
  await adapter.resourceLoader.reload();
  assert.equal(adapter.resourceLoader.getExtensions().extensions.length, 0);
  assert.ok(adapter.diagnostics.some((diagnostic) => diagnostic.message.includes("pi-web-gate-missing")));
});

test("onMissingSource 'error' refuses the reload", async () => {
  const settingsManager = SettingsManager.inMemory({ packages: ["https://github.com/pi-web-gate-error/nonexistent.git"] });
  const adapter = createNoInstallResourceLoader({ cwd, agentDir, settingsManager, onMissingSource: () => "error" });
  await assert.rejects(() => adapter.resourceLoader.reload(), /Missing source/);
  assert.ok(adapter.diagnostics.some((diagnostic) => diagnostic.type === "error"));
});

test("an installed npm package with a mismatched version is skipped without installing", async () => {
  const installed = join(agentDir, "npm", "node_modules", "pi-web-gate-version");
  mkdirSync(installed, { recursive: true });
  writeFileSync(join(installed, "package.json"), JSON.stringify({ name: "pi-web-gate-version", version: "1.0.0" }));
  const settingsManager = SettingsManager.inMemory({ packages: ["npm:pi-web-gate-version@2.0.0"] });
  const adapter = createNoInstallResourceLoader({ cwd, agentDir, settingsManager, onMissingSource: () => "skip" });
  await adapter.resourceLoader.reload();
  assert.equal(adapter.resourceLoader.getExtensions().extensions.length, 0);
  assert.ok(adapter.diagnostics.some((diagnostic) => diagnostic.message.includes("pi-web-gate-version")));
});

test("provider-only host loads one concrete file, flushes its native provider, and binds no session", async () => {
  globalThis.__gateProviderHostSessionStart = undefined;
  const host = await createProviderExtensionHost({
    cwd,
    agentDir,
    settingsManager: SettingsManager.inMemory({}),
    files: [join(providerFixture, "extensions/index.mjs")],
    containmentRoots: [providerFixture],
  });
  assert.ok(host.modelRuntime.getRegisteredNativeProvider("gate-host-native"));
  assert.ok(host.modelRuntime.getModel("gate-host-native", "gate-host-model"));
  const tools = host.extensionsResult.extensions.flatMap((extension) => [...extension.tools.keys()]);
  assert.ok(tools.includes("gate_host_tool"));
  assert.ok(!tools.includes("gate_search_entry"), "the search entry next to index.mjs is not expanded");
  assert.equal(globalThis.__gateProviderHostSessionStart, undefined, "no session implies no session_start lifecycle");
  assert.ok(!("session" in host));
});

test("explicit provider files reject directories, globs, package specs, and outside roots", async () => {
  const settingsManager = SettingsManager.inMemory({});
  const reject = (path, roots = [providerFixture]) => createProviderExtensionHost({
    cwd,
    agentDir,
    settingsManager,
    files: [path],
    containmentRoots: roots,
  });
  await assert.rejects(() => reject(providerFixture), /regular file|concrete file/);
  await assert.rejects(() => reject(join(providerFixture, "extensions", "*.mjs")), /concrete file/);
  await assert.rejects(() => reject("npm:@some/package"), /absolute|concrete file/);
  await assert.rejects(() => reject(join(providerFixture, "extensions", "index.mjs"), [join(scratch, "unrelated-root")]), /outside its package root/);
});

test("a delayed web_search registration becomes active with an allow-all extension policy and zero model requests", async () => {
  globalThis.__gateProviderHostSessionStart = undefined;
  const settingsManager = SettingsManager.inMemory({ packages: [providerFixture] });
  const { modelRuntime, faux } = await fauxRuntime();
  let streamCalls = 0;
  const originalStreamSimple = modelRuntime.streamSimple.bind(modelRuntime);
  modelRuntime.streamSimple = (...args) => {
    streamCalls += 1;
    return originalStreamSimple(...args);
  };
  const adapter = createNoInstallResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    projectExtensions: (base) => {
      const askUser = createAskUserToolProjection(base, false);
      return projectRegistrationAwareExtensionTools(base, {
        policy: { extensionAllow: ["ext:*"], extensionDeny: [] },
        transform: askUser.transform,
      });
    },
  });
  await adapter.resourceLoader.reload();
  const loadedTools = adapter.resourceLoader.getExtensions().extensions.flatMap((extension) => [...extension.tools.keys()]);
  assert.ok(loadedTools.includes("gate_search_entry"), "the manifest's search entry file is authorized");
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    settingsManager,
    resourceLoader: adapter.resourceLoader,
    model: faux.getModel("gate-faux"),
    sessionManager: SessionManager.inMemory(cwd),
    excludeTools: ["Agent", "get_subagent_result", "steer_subagent", "ask_user"],
  });
  await session.extensionRunner.emit({ type: "session_start", reason: "startup" });
  const active = session.getActiveToolNames();
  assert.ok(active.includes("gate_host_tool"));
  assert.ok(active.includes("gate_search_entry"));
  assert.ok(active.includes("web_search"), "the session_start tool is active without a hard extension allowlist");
  assert.equal(globalThis.__gateProviderHostSessionStart, 1);
  assert.equal(streamCalls, 0, "no model request was made before or during ready");
});

test("child services flush native, legacy, and virtual registrations onto a fresh runtime without touching the parent", async () => {
  const parentRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  let parentRefreshes = 0;
  const originalRefresh = parentRuntime.refresh.bind(parentRuntime);
  parentRuntime.refresh = async (...args) => {
    parentRefreshes += 1;
    return originalRefresh(...args);
  };
  const factory = (pi) => {
    const faux = fauxProvider({ provider: "gate-inline-native", models: [{ id: "gate-inline-model" }] });
    pi.registerProvider(faux.provider);
    pi.registerProvider("gate-inline-legacy", {
      name: "Gate Inline Legacy",
      baseUrl: "https://example.invalid/v1",
      apiKey: "gate-inline-key",
      api: "openai-completions",
      models: [{
        id: "gate-legacy-model",
        name: "Gate Legacy Model",
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        reasoning: false,
        contextWindow: 4096,
        maxTokens: 1024,
      }],
    });
    pi.registerVirtualModel({
      provider: "gate-inline-virtual",
      id: "gate-inline-virtual-model",
      name: "Gate Virtual Model",
      route: () => ({ model: faux.getModel("gate-inline-model"), thinkingLevel: "off" }),
    });
  };
  const services = await createSubagentSessionServices({
    cwd,
    agentDir,
    settingsManager: SettingsManager.inMemory({}),
    resourceLoader: { extensionFactories: [{ name: "gate-inline-native", factory }] },
  });
  assert.notEqual(services.modelRuntime, parentRuntime);
  assert.ok(services.modelRuntime.getRegisteredNativeProvider("gate-inline-native"));
  assert.ok(services.modelRuntime.getModel("gate-inline-native", "gate-inline-model"));
  assert.ok(services.modelRuntime.getModel("gate-inline-legacy", "gate-legacy-model"));
  assert.ok(services.modelRuntime.getModel("gate-inline-virtual", "gate-inline-virtual-model"));
  assert.ok(services.modelRuntime.getRegisteredProviderIds().includes("gate-inline-legacy"));
  assert.ok(services.modelRuntime.hasConfiguredAuth("gate-inline-legacy"));
  assert.ok(await services.modelRuntime.getAuth("gate-inline-native"));
  assert.deepEqual(parentRuntime.getRegisteredProviderIds(), []);
  assert.equal(parentRefreshes, 0);
  assert.ok(!("session" in services));
});

// --- Stage 1: trust forwarding, skills, settings reload, and path authorization ---

function writeProjectExtension(projectRoot, fileName, toolName) {
  const dir = join(projectRoot, ".pi", "extensions");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), `export default function (pi) {
  pi.registerTool({
    name: ${JSON.stringify(toolName)},
    label: ${JSON.stringify(toolName)},
    description: ${JSON.stringify(toolName)},
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [{ type: "text", text: ${JSON.stringify(toolName)} }] }),
  });
}
`);
}

function toolNamesOf(adapter) {
  return adapter.resourceLoader.getExtensions().extensions.flatMap((extension) => [...extension.tools.keys()]).sort();
}

test("reload resolves project trust afresh through resolveProjectTrust instead of a construction snapshot", async () => {
  const projectRoot = join(scratch, "trust-project");
  const projectAgentDir = join(scratch, "trust-agent");
  mkdirSync(projectAgentDir, { recursive: true });
  writeProjectExtension(projectRoot, "project-gate.ts", "gate_project");
  let trusted = true;
  const settingsManager = SettingsManager.create(projectRoot, projectAgentDir);
  const adapter = createNoInstallResourceLoader({
    cwd: projectRoot,
    agentDir: projectAgentDir,
    settingsManager,
    reloadOptions: { resolveProjectTrust: async () => trusted },
  });
  const projectExtensions = () => adapter.resourceLoader.getExtensions().extensions.filter(
    (extension) => resolve(extension.resolvedPath).startsWith(`${join(resolve(projectRoot), ".pi")}${sep}`),
  );

  await adapter.resourceLoader.reload();
  assert.equal(projectExtensions().length, 1, "trusted: the project extension entry loads");
  assert.ok([...projectExtensions()[0].tools.keys()].includes("gate_project"));
  assert.equal(settingsManager.isProjectTrusted(), true, "the resolved trust reaches the real settings manager");

  trusted = false;
  await adapter.resourceLoader.reload();
  assert.equal(projectExtensions().length, 0, "revoked: no project extension factory entry loads");
  assert.equal(settingsManager.isProjectTrusted(), false, "the revoked trust reaches the real settings manager");
});

test("package settings and enablement changes take effect on reload", async () => {
  const settingsRoot = join(scratch, "settings-project");
  const settingsAgentDir = join(scratch, "settings-agent");
  const packageRoot = join(scratch, "settings-pkg");
  mkdirSync(settingsAgentDir, { recursive: true });
  writeExtensionPackage(packageRoot, [
    { name: "one.ts", source: extensionSource("gate_one") },
    { name: "two.ts", source: extensionSource("gate_two") },
  ]);
  writeFileSync(join(settingsAgentDir, "settings.json"), JSON.stringify({ packages: [packageRoot] }));
  const settingsManager = SettingsManager.create(settingsRoot, settingsAgentDir);
  const adapter = createNoInstallResourceLoader({ cwd: settingsRoot, agentDir: settingsAgentDir, settingsManager });

  await adapter.resourceLoader.reload();
  assert.deepEqual(toolNamesOf(adapter), ["gate_one", "gate_two"]);

  writeFileSync(join(settingsAgentDir, "settings.json"), JSON.stringify({ packages: [] }));
  await adapter.resourceLoader.reload();
  assert.deepEqual(toolNamesOf(adapter), [], "removing the package in settings takes effect without a restart");

  // An auto-discovered user extension, then a settings disable filter for it.
  mkdirSync(join(settingsAgentDir, "extensions"), { recursive: true });
  writeFileSync(join(settingsAgentDir, "extensions", "user-gate.ts"), extensionSource("gate_user"));
  writeFileSync(join(settingsAgentDir, "settings.json"), JSON.stringify({}));
  await adapter.resourceLoader.reload();
  assert.deepEqual(toolNamesOf(adapter), ["gate_user"]);

  writeFileSync(join(settingsAgentDir, "settings.json"), JSON.stringify({ extensions: ["-extensions/user-gate.ts"] }));
  await adapter.resourceLoader.reload();
  assert.deepEqual(toolNamesOf(adapter), [], "a settings disable filter excludes the matching extension");
});

test("loadSkills:true loads only preflight-authorized skills and restores their sourceInfo", async () => {
  const projectRoot = join(scratch, "skills-project");
  const skillsAgentDir = join(scratch, "skills-agent");
  mkdirSync(skillsAgentDir, { recursive: true });
  const skillDir = join(projectRoot, ".pi", "skills", "gate-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: gate-skill\ndescription: gate skill\n---\nBody\n");
  // The other resource kinds stay off in stage 1, even when the project offers them.
  mkdirSync(join(projectRoot, ".pi", "prompts"), { recursive: true });
  writeFileSync(join(projectRoot, ".pi", "prompts", "gate-prompt.md"), "---\ndescription: gate prompt\n---\nBody\n");
  mkdirSync(join(projectRoot, ".pi", "themes"), { recursive: true });
  writeFileSync(join(projectRoot, ".pi", "themes", "gate-theme.json"), JSON.stringify({ name: "gate-theme" }));
  writeFileSync(join(projectRoot, ".pi", "SYSTEM.md"), "gate system\n");

  const withSkills = createNoInstallResourceLoader({
    cwd: projectRoot,
    agentDir: skillsAgentDir,
    settingsManager: SettingsManager.create(projectRoot, skillsAgentDir),
    loadSkills: true,
    reloadOptions: { resolveProjectTrust: async () => true },
  });
  await withSkills.resourceLoader.reload();
  const skills = withSkills.resourceLoader.getSkills().skills;
  assert.deepEqual(skills.map((skill) => skill.name), ["gate-skill"]);
  assert.equal(skills[0].sourceInfo.scope, "project", "the authorized skill keeps its real source scope");
  assert.equal(withSkills.resourceLoader.getPrompts().prompts.length, 0, "prompts stay off");
  assert.equal(withSkills.resourceLoader.getThemes().themes.length, 0, "themes stay off");
  assert.equal(withSkills.resourceLoader.getAgentsFiles().agentsFiles.length, 0, "context files stay off");

  const withoutSkills = createNoInstallResourceLoader({
    cwd: projectRoot,
    agentDir: skillsAgentDir,
    settingsManager: SettingsManager.create(projectRoot, skillsAgentDir),
    reloadOptions: { resolveProjectTrust: async () => true },
  });
  await withoutSkills.resourceLoader.reload();
  assert.equal(withoutSkills.resourceLoader.getSkills().skills.length, 0, "loadSkills defaults to false");
});

test("explicit authorization rejects symlink escapes and accepts a canonicalized root", async () => {
  const packageRoot = join(scratch, "path-pkg-root");
  mkdirSync(join(packageRoot, "extensions"), { recursive: true });
  writeFileSync(join(packageRoot, "extensions", "real.ts"), extensionSource("gate_real"));
  const outside = join(scratch, "outside-extension.ts");
  writeFileSync(outside, extensionSource("gate_outside"));
  const escapeLink = join(packageRoot, "extensions", "escape.ts");
  symlinkSync(outside, escapeLink);

  await assert.rejects(
    () => createProviderExtensionHost({
      cwd,
      agentDir,
      settingsManager: SettingsManager.inMemory({}),
      files: [escapeLink],
      containmentRoots: [packageRoot],
    }),
    /outside its package root/,
    "a file symlink that leaves the package root is refused",
  );

  const rootLink = join(scratch, "path-pkg-root-link");
  symlinkSync(packageRoot, rootLink);
  const host = await createProviderExtensionHost({
    cwd,
    agentDir,
    settingsManager: SettingsManager.inMemory({}),
    files: [join(rootLink, "extensions", "real.ts")],
    containmentRoots: [rootLink],
  });
  const tools = host.extensionsResult.extensions.flatMap((extension) => [...extension.tools.keys()]);
  assert.ok(tools.includes("gate_real"), "a file inside a symlinked root is authorized by canonical path");
});
