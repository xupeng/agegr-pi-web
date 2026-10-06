import { scratch } from "./subagent-gate-support.mjs";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

const jiti = createJiti(import.meta.url, { moduleCache: false });
const { projectRegistrationAwareExtensionTools } = await jiti.import("./subagent-tool-policy.ts");
const { createAskUserToolProjection } = await jiti.import("./ask-user/extension-policy.ts");
const { createSubagentExtensionToolFilter } = await jiti.import("./subagents.ts");
const { createNoInstallResourceLoader } = await jiti.import("./subagent-resource-loader.ts");

const agentDir = process.env.PI_CODING_AGENT_DIR;
const cwd = join(scratch, "policy-project");
mkdirSync(cwd, { recursive: true });

function simpleTool(name, extra = {}) {
  return {
    name,
    label: name,
    description: name,
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [{ type: "text", text: name }] }),
    ...extra,
  };
}

function gateFactory(pi) {
  pi.registerTool(simpleTool("gate_allowed"));
  pi.registerTool(simpleTool("gate_denied"));
  pi.registerTool(simpleTool("gate_hidden", { exposure: "hidden" }));
  pi.registerTool(simpleTool("gate_inactive", { defaultActive: false }));
  pi.registerTool(simpleTool("gate_codemode_denied", { exposure: "codemode" }));
  pi.registerTool(simpleTool("ask_user"));
  pi.on("session_start", () => {
    pi.registerTool(simpleTool("gate_late"));
    pi.registerTool(simpleTool("gate_denied_late"));
    pi.registerTool(simpleTool("ask_user"));
  });
  pi.on("turn_start", () => {
    pi.registerTool(simpleTool("gate_turn"));
    pi.registerTool(simpleTool("gate_denied_late"));
  });
}

async function startSession({ allow = ["ext:*"], deny = [], withdrawAskUser = true } = {}) {
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  const faux = fauxProvider({ models: [{ id: "gate-faux" }] });
  modelRuntime.registerNativeProvider(faux.provider);
  const settingsManager = SettingsManager.inMemory({});
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    extensionFactories: [{ name: "gate-fixture", factory: gateFactory }],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  const base = loader.getExtensions();
  const extension = base.extensions[0];
  assert.ok(extension, "fixture extension loaded");
  const projection = withdrawAskUser ? createAskUserToolProjection(base, false) : undefined;
  projectRegistrationAwareExtensionTools(base, {
    policy: { extensionAllow: allow, extensionDeny: deny },
    ...(projection ? { transform: projection.transform } : {}),
  });
  assert.equal(loader.getExtensions().extensions[0], extension, "projection keeps the same Extension object");
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    settingsManager,
    resourceLoader: loader,
    model: faux.getModel("gate-faux"),
    sessionManager: SessionManager.inMemory(cwd),
  });
  return { session, extension };
}

const start = { type: "session_start", reason: "startup" };

test("projection filters load-time and session_start tools without copying the Extension", async () => {
  const { session, extension } = await startSession({
    deny: [
      "ext:<inline:gate-fixture>/gate_denied",
      "ext:<inline:gate-fixture>/gate_denied_late",
      "ext:<inline:gate-fixture>/gate_codemode_denied",
    ],
  });
  await session.extensionRunner.emit(start);
  const active = session.getActiveToolNames();
  assert.ok(active.includes("gate_allowed"));
  assert.ok(active.includes("gate_late"), "a session_start registration from an allowed factory is activated");
  assert.ok(!active.includes("gate_denied"));
  assert.ok(!active.includes("gate_denied_late"));
  assert.ok(!active.includes("gate_inactive"));
  assert.ok(!active.includes("gate_hidden"));
  assert.equal(session.getToolDefinition("gate_denied"), undefined);
  assert.equal(session.getToolDefinition("gate_denied_late"), undefined);
  assert.equal(session.getToolDefinition("gate_codemode_denied"), undefined);
  assert.equal(extension.tools.has("gate_denied"), false, "runner-visible Map dropped the denied tool");
  assert.equal(extension.tools.has("gate_denied_late"), false, "a late denied registration never entered the Map");
  assert.equal(extension.tools.has("gate_codemode_denied"), false);
  assert.ok(!session.getCallableToolNames().includes("gate_codemode_denied"), "codemode/deferred nested calls cannot reach a denied tool");
  assert.equal(extension.tools.get("gate_hidden").definition.exposure, "hidden", "hidden stays withdrawn");
  assert.equal(extension.tools.get("gate_inactive").definition.defaultActive, false, "defaultActive:false is preserved");
  assert.ok(extension.tools.has("gate_late"), "the late allowed tool stays in the runner-visible Map");
});

test("ask_user withdrawal composes with the same live Map", async () => {
  const { session, extension } = await startSession();
  assert.equal(extension.tools.has("ask_user"), false, "ask_user is withdrawn at projection time");
  await session.extensionRunner.emit(start);
  assert.equal(extension.tools.has("ask_user"), false, "a late ask_user registration is withdrawn too");
  assert.equal(session.getToolDefinition("ask_user"), undefined);
  assert.ok(session.getActiveToolNames().includes("gate_allowed"));
});

test("a specific allow selector also governs late registrations", async () => {
  const { session, extension } = await startSession({
    allow: ["ext:<inline:gate-fixture>/gate_allowed"],
    deny: [],
  });
  await session.extensionRunner.emit(start);
  assert.ok(session.getActiveToolNames().includes("gate_allowed"));
  assert.ok(!session.getActiveToolNames().includes("gate_late"));
  assert.equal(extension.tools.has("gate_late"), false, "a tool outside the allow selector never enters the Map");
  assert.equal(extension.tools.has("gate_denied"), false);
});

test("the same tool name from two owners is not addressable by name", () => {
  const extensionA = {
    path: "/packages/a/index.ts",
    sourceInfo: { source: "local", origin: "top-level" },
    tools: new Map([["tool_a", {}]]),
  };
  const extensionB = {
    path: "/packages/b/index.ts",
    sourceInfo: { source: "local", origin: "top-level" },
    tools: new Map([["tool_b", {}]]),
  };
  const everyExtension = createSubagentExtensionToolFilter([extensionA, extensionB], ["ext:*"]);
  assert.ok(everyExtension(extensionA, "tool_a") && everyExtension(extensionB, "tool_b"));
  const ambiguous = createSubagentExtensionToolFilter([extensionA, extensionB], ["ext:index"]);
  assert.equal(ambiguous(extensionA, "tool_a"), false, "index collides across owners and grants nothing");
  assert.equal(ambiguous(extensionB, "tool_b"), false);
  const deniedAmbiguous = createSubagentExtensionToolFilter([extensionA, extensionB], ["ext:*"], ["ext:index"]);
  // Dropping the ambiguous deny while `ext:*` allows would silently turn the deny into a grant.
  assert.equal(deniedAmbiguous(extensionA, "tool_a"), false, "an ambiguous deny fails closed for every owner");
  assert.equal(deniedAmbiguous(extensionB, "tool_b"), false);
});

test("a deny on a shared package short name withdraws every owner and stays live", () => {
  const scoped = {
    path: "/tmp/pkg-a/main.ts",
    sourceInfo: { source: "npm:@scope/pi-search", origin: "package" },
    tools: new Map([["scoped_search", {}]]),
  };
  const unscoped = {
    path: "/tmp/pkg-b/runner.ts",
    sourceInfo: { source: "npm:pi-search", origin: "package" },
    tools: new Map([["plain_search", {}]]),
  };
  const extensions = [scoped, unscoped];

  // `pi-search` is the unscoped spelling of both packages, so it is not addressable.
  const allowAmbiguous = createSubagentExtensionToolFilter(extensions, ["ext:pi-search"]);
  assert.equal(allowAmbiguous(scoped, "scoped_search"), false, "an ambiguous allow grants nothing");
  assert.equal(allowAmbiguous(unscoped, "plain_search"), false);

  const denyAmbiguous = createSubagentExtensionToolFilter(extensions, ["ext:*"], ["ext:pi-search"]);
  assert.equal(denyAmbiguous(scoped, "scoped_search"), false, "the ambiguous deny covers the @scope owner");
  assert.equal(denyAmbiguous(unscoped, "plain_search"), false, "the ambiguous deny covers the plain owner");

  // The unambiguous scoped spelling still denies only that package. The plain owner is untouched.
  const denyScoped = createSubagentExtensionToolFilter(extensions, ["ext:*"], ["ext:@scope/pi-search"]);
  assert.equal(denyScoped(scoped, "scoped_search"), false);
  assert.equal(denyScoped(unscoped, "plain_search"), true);

  // An unmatched deny (no loaded source claims it) is a no-op; it never widens the allow.
  const denyMissing = createSubagentExtensionToolFilter(extensions, ["ext:*"], ["ext:not-installed"]);
  assert.equal(denyMissing(scoped, "scoped_search"), true);
  assert.equal(denyMissing(unscoped, "plain_search"), true);

  // The same live Map wrapper drops a late registration from every ambiguous owner.
  projectRegistrationAwareExtensionTools({ extensions }, {
    policy: { extensionAllow: ["ext:*"], extensionDeny: ["ext:pi-search"] },
  });
  assert.equal(scoped.tools.has("scoped_search"), false, "the initial scoped tool is withdrawn");
  assert.equal(unscoped.tools.has("plain_search"), false, "the initial plain tool is withdrawn");
  scoped.tools.set("late_scoped", { definition: { name: "late_scoped" } });
  unscoped.tools.set("late_plain", { definition: { name: "late_plain" } });
  assert.equal(scoped.tools.has("late_scoped"), false, "a late registration from the @scope owner never enters the Map");
  assert.equal(unscoped.tools.has("late_plain"), false, "a late registration from the plain owner never enters the Map");
});

test("a turn_start registration and a re-registration both pass the live filter", async () => {
  const { session, extension } = await startSession({
    deny: [
      "ext:<inline:gate-fixture>/gate_denied",
      "ext:<inline:gate-fixture>/gate_denied_late",
    ],
  });
  await session.extensionRunner.emit(start);
  assert.equal(extension.tools.has("gate_denied_late"), false);
  await session.extensionRunner.emit({ type: "turn_start", turnIndex: 0, timestamp: Date.now() });
  assert.ok(extension.tools.has("gate_turn"), "an allowed turn_start registration enters the Map");
  assert.equal(extension.tools.has("gate_denied_late"), false, "a denied turn_start registration never enters the Map");
  assert.ok(session.getActiveToolNames().includes("gate_turn"));
  assert.equal(session.getToolDefinition("gate_denied_late"), undefined);
});

test("reserved control tools stay withdrawn even when a tool is registered late", async () => {
  const { session, extension } = await startSession();
  await session.extensionRunner.emit(start);
  assert.equal(extension.tools.has("ask_user"), false);
  assert.equal(session.getToolDefinition("ask_user"), undefined);
  assert.ok(!session.getCallableToolNames().includes("ask_user"), "nested/codemode cannot reach a withdrawn reserved tool");
  assert.ok(!session.getActiveToolNames().includes("ask_user"));
  assert.ok(session.getActiveToolNames().includes("gate_allowed"), "unrelated allowed tools still activate");
  assert.equal(extension.tools.get("gate_inactive").definition.defaultActive, false, "an allowed but default-inactive tool is not re-activated");
});

test("reload re-projects the newly loaded extensions with the live policy", async () => {
  const policy = { extensionAllow: ["ext:*"], extensionDeny: ["ext:<inline:gate-fixture>/gate_denied"] };
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  const faux = fauxProvider({ models: [{ id: "gate-faux" }] });
  modelRuntime.registerNativeProvider(faux.provider);
  const settingsManager = SettingsManager.inMemory({});
  const adapter = createNoInstallResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    explicitExtensions: [],
    extensionFactories: [{ name: "gate-fixture", factory: gateFactory }],
    projectExtensions: (base) => projectRegistrationAwareExtensionTools(base, { policy }),
  });
  await adapter.resourceLoader.reload();
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    settingsManager,
    resourceLoader: adapter.resourceLoader,
    model: faux.getModel("gate-faux"),
    sessionManager: SessionManager.inMemory(cwd),
  });
  assert.equal(session.getToolDefinition("gate_denied"), undefined, "denied before reload");
  policy.extensionDeny = [];
  await session.reload();
  assert.ok(session.getToolDefinition("gate_denied"), "after reload the tool is projected back in");
  assert.ok(session.getActiveToolNames().includes("gate_denied"));
  assert.ok(session.getActiveToolNames().includes("gate_allowed"));
});

test("a tool the extension actively deactivated is not revived by turn or host activation", async () => {
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  const faux = fauxProvider({ models: [{ id: "gate-faux" }] });
  modelRuntime.registerNativeProvider(faux.provider);
  const settingsManager = SettingsManager.inMemory({});
  const factory = (pi) => {
    pi.registerTool(simpleTool("manual_keep"));
    pi.registerTool(simpleTool("manual_off"));
    pi.on("session_start", () => {
      pi.registerTool(simpleTool("manual_late"));
      // The extension actively closes manual_off for this session.
      pi.setActiveTools(["manual_keep"]);
    });
    pi.on("turn_start", () => {
      // Re-registering the same definition must not silently re-activate it.
      pi.registerTool(simpleTool("manual_off"));
    });
  };
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    extensionFactories: [{ name: "manual-fixture", factory }],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  projectRegistrationAwareExtensionTools(loader.getExtensions(), {
    policy: { extensionAllow: ["ext:*"], extensionDeny: [] },
  });
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    settingsManager,
    resourceLoader: loader,
    model: faux.getModel("gate-faux"),
    sessionManager: SessionManager.inMemory(cwd),
  });
  await session.extensionRunner.emit(start);
  assert.ok(session.getActiveToolNames().includes("manual_keep"), "the kept tool stays active");
  assert.ok(!session.getActiveToolNames().includes("manual_off"), "the extension deactivated manual_off");
  await session.extensionRunner.emit({ type: "turn_start", turnIndex: 0, timestamp: Date.now() });
  assert.ok(!session.getActiveToolNames().includes("manual_off"), "a turn_start re-registration does not revive it");
  // The host must not call `setActiveToolsByName` on a subagent at all; that is the only way it
  // could re-activate a tool the extension closed on purpose.
  const hostSource = await readFile(new URL("./subagent-runtime.ts", import.meta.url), "utf8");
  assert.doesNotMatch(hostSource, /setActiveToolsByName|setActiveTools\(/);
  // Known SDK limitation (reproduced with the raw loader, not our projection): `session.reload()`
  // re-activates a `defaultActive` tool the extension closed, because the SDK re-runs registration
  // after the extension's session_start. It is disclosed in research/implementation.md rather than
  // asserted as a guarantee here.
});
