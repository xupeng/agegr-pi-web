import { scratch, copyProtocolPackage } from "./test-support.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
const { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } = await import("@earendil-works/pi-coding-agent");
const { fauxProvider } = await import("@earendil-works/pi-ai");
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { createAskUserExtension } = await jiti.import("./extension.ts");
const { projectAskUserTools } = await jiti.import("./extension-policy.ts");
const { PendingAskStore } = await jiti.import("./store.ts");
const { ASK_USER_BRIDGE_CHANNEL } = await jiti.import("./protocol.ts");
const questions = [{ id: "q", question: "Which scope?", options: [] }];
let nextFixture = 0;
async function fixture({ packages = [copyProtocolPackage()], main = true, options = {}, hosts, defaultTools, sessionTools } = {}) {
  const dir = join(scratch, `discovery-${++nextFixture}`);
  mkdirSync(dir);
  const manager = SessionManager.inMemory(dir);
  const store = new PendingAskStore();
  let alive = true;
  const handle = { sessionId: manager.getSessionId(), isAlive: () => alive, openAsk: async (input) => store.open(input) };
  const settings = SettingsManager.inMemory({ packages, extensions: [], ...(defaultTools ? { defaultTools } : {}) });
  const loader = new DefaultResourceLoader({ cwd: dir, agentDir: dir, settingsManager: settings,
    noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true,
    extensionsOverride: (base) => projectAskUserTools(base, main),
    extensionFactories: hosts ?? (main ? [createAskUserExtension(() => handle, () => manager.getSessionId())] : []),
    ...options,
  });
  await loader.reload();
  const faux = fauxProvider({ models: [{ id: "discovery" }] });
  const runtime = await ModelRuntime.create({ authPath: join(dir, "auth.json"), modelsPath: null, refreshOnCreate: false });
  runtime.registerNativeProvider(faux.provider);
  const { session } = await createAgentSession({ cwd: dir, agentDir: dir, settingsManager: settings,
    resourceLoader: loader, modelRuntime: runtime, model: faux.getModel(), sessionManager: manager,
    ...(sessionTools ? { tools: sessionTools } : {}) });
  const definition = () => loader.getExtensions().extensions.flatMap((ext) => [...ext.tools.values()]).find((t) => t.definition.name === "ask_user")?.definition;
  return { session, loader, store, settings, manager, definition,
    execute: () => definition().execute("call", { questions }, undefined, undefined, {
      mode: "rpc", hasUI: true, sessionManager: manager,
      ui: { custom() { assert.fail("Web must not open TUI"); } },
    }),
    dispose() { alive = false; session.dispose(); },
  };
}

test("SDK package discovery retains the installed source and every unrelated registration", async () => {
  const pkg = copyProtocolPackage();
  const f = await fixture({ packages: [pkg] });
  try {
    assert.deepEqual(f.loader.getExtensions().errors, []);
    const external = f.loader.getExtensions().extensions.find((e) => e.tools.has("ask_user"));
    assert.equal(external.path, join(pkg, "index.js"));
    assert.equal(external.tools.get("ask_user").sourceInfo.source, pkg);
    assert.equal(f.definition().exposure, "model-only");
    assert.ok(external.tools.has("peer_tool"));
    assert.ok(external.commands.has("peer_command"));
    assert.ok(external.flags.has("peer_flag"));
    assert.ok(external.handlers.has("session_start"));
    assert.equal((await f.execute()).terminate, true);
    assert.ok(f.store.pendingAsk(f.session.sessionId));
  } finally { f.dispose(); }
});

for (const [label, config] of [
  ["no package", { packages: [] }],
  ["SDK noExtensions", { options: { noExtensions: true } }],
  ["package resource exclusion", { packages: [{ source: copyProtocolPackage(), extensions: [] }] }],
  ["non-main session", { main: false }],
]) test(`${label} has no ask tool or Web fallback`, async () => {
  const f = await fixture(config);
  try { assert.equal(f.session.getAllTools().some((t) => t.name === "ask_user"), false); }
  finally { f.dispose(); }
});

test("broken discovered entry reports an SDK error without a fallback", async () => {
  const pkg = copyProtocolPackage();
  writeFileSync(join(pkg, "index.js"), "this is not javascript {{{");
  const f = await fixture({ packages: [pkg] });
  try { assert.equal(f.definition(), undefined); assert.ok(f.loader.getExtensions().errors.length); }
  finally { f.dispose(); }
});

for (const [label, config, exposure] of [
  ["defaultActive false", "defaultActive: false,", "model-only"],
  ["hidden", 'exposure: "hidden",', "hidden"],
  ["codemode inactive", 'exposure: "codemode",', "model-only"],
]) test(`${label} is not auto-activated by exposure projection`, async () => {
  const f = await fixture({ packages: [copyProtocolPackage(config)] });
  try {
    assert.equal(f.definition().exposure, exposure);
    assert.equal(f.session.getActiveToolNames().includes("ask_user"), false);
    await f.session.reload();
    assert.equal(f.session.getActiveToolNames().includes("ask_user"), false);
  } finally { f.dispose(); }
});

test("different discovered owners fail closed but keep their commands, flags, tools and handlers", async () => {
  const f = await fixture({ packages: [copyProtocolPackage(), copyProtocolPackage()] });
  try {
    assert.equal(f.definition(), undefined);
    assert.equal(f.session.getAllTools().some((t) => t.name === "ask_user"), false);
    assert.ok(f.loader.getExtensions().errors.some((e) => /ambiguous discovered sources/.test(e.error)));
    const peers = f.loader.getExtensions().extensions.filter((e) => e.tools.has("peer_tool"));
    assert.equal(peers.length, 2);
    for (const e of peers) { assert.ok(e.commands.has("peer_command")); assert.ok(e.flags.has("peer_flag")); assert.ok(e.handlers.has("session_start")); }
  } finally { f.dispose(); }
});

test("real AgentSession reload excludes/restores resources for three rounds without accumulating hosts", async () => {
  const pkg = copyProtocolPackage();
  const f = await fixture({ packages: [pkg] });
  try {
    await f.session.bindExtensions({});
    for (let round = 0; round < 3; round++) {
      assert.equal((await f.execute()).terminate, true, "exactly one bridge registration each time");
      const askId = f.store.pendingAsk(f.session.sessionId).askId;
      f.settings.setPackages([{ source: pkg, extensions: [] }]);
      await f.session.reload();
      assert.equal(f.definition(), undefined);
      assert.equal(f.session.getActiveToolNames().includes("ask_user"), false);
      assert.equal(f.store.pendingAsk(f.session.sessionId).askId, askId, "discovery does not clear pending asks");
      f.settings.setPackages([pkg]);
      await f.session.reload();
    }
    assert.equal((await f.execute()).terminate, true);
    f.session.setActiveToolsByName(f.session.getActiveToolNames().filter((n) => n !== "ask_user"));
    assert.equal(f.session.getActiveToolNames().includes("ask_user"), false, "projection does not re-add an inactive tool");
    // SDK 1.0.0 reload intentionally activates default-active extension tools;
    // Web must not reinterpret that SDK decision as its own activation policy.
    await f.session.reload();
    assert.equal(f.session.getActiveToolNames().includes("ask_user"), true);
  } finally { f.dispose(); }
});

test("a foreign loader cannot supply a bridge; duplicate and delayed hosts fail closed", async () => {
  const foreign = await fixture();
  try {
    const noHost = await fixture({ hosts: [] });
    try { await assert.rejects(noHost.execute, /got 0/); } finally { noHost.dispose(); }
    for (const hosts of [
      [1, 2].map((i) => ({ name: `duplicate-${i}`, factory: (pi) => pi.events.on(ASK_USER_BRIDGE_CHANNEL, (r) => r.register(async () => assert.fail("must not open"))) })),
      [{ name: "late", factory: (pi) => pi.events.on(ASK_USER_BRIDGE_CHANNEL, async (r) => { await Promise.resolve(); r.register(async () => assert.fail("must not open")); }) }],
    ]) {
      const f = await fixture({ hosts });
      try { await assert.rejects(f.execute, /exactly one synchronous/); assert.equal(f.store.pendingAsk(f.session.sessionId), undefined); }
      finally { f.dispose(); }
    }
  } finally { foreign.dispose(); }
});

for (const exposure of ["codemode", "deferred"]) test(`SDK evidence: ${exposure} with explicit defaultActive:true is still inactive before Web projection`, async () => {
  const f = await fixture({ packages: [copyProtocolPackage(`exposure: "${exposure}", defaultActive: true,`)],
    options: { extensionsOverride: (base) => base } });
  try {
    assert.equal(f.definition().exposure, exposure);
    assert.equal(f.definition().defaultActive, true);
    assert.equal(f.session.getActiveToolNames().includes("ask_user"), false,
      "SDK _isActivatedOnRegistration requires a declarable exposure regardless of explicit true");
    await f.session.reload();
    assert.equal(f.session.getActiveToolNames().includes("ask_user"), false);
  } finally { f.dispose(); }
});

// Compare native SDK discovery to the projection, not just the projected field.
// Explicit true on a nondeclarable tool does not express default activation in SDK 1.0.
for (const exposure of [undefined, "direct", "model-only", "hidden", "codemode", "deferred"]) {
  for (const defaultActive of [undefined, true, false]) {
    const label = `${exposure ?? "implicit direct"}/defaultActive:${defaultActive}`;
    const config = `${exposure ? `exposure: "${exposure}",` : ""}${defaultActive === undefined ? "" : `defaultActive: ${defaultActive},`}`;
    test(`native/projection activation parity: ${label}, explicit selection, transcript navigation and reload`, async () => {
      const native = await fixture({ packages: [copyProtocolPackage(config)], options: { extensionsOverride: (base) => base } });
      const projected = await fixture({ packages: [copyProtocolPackage(config)] });
      try {
        const active = (f) => f.session.getActiveToolNames().includes("ask_user");
        const defaultOn = !["hidden", "codemode", "deferred"].includes(exposure) && defaultActive !== false;
        assert.equal(active(native), defaultOn, "native activation is the authority");
        assert.equal(active(projected), active(native), "projection must not turn discovery into activation");
        assert.equal(projected.definition().defaultActive,
          ["codemode", "deferred"].includes(exposure) ? false : defaultActive);
        for (const f of [native, projected]) {
          f.session.setActiveToolsByName(["ask_user"]);
          assert.equal(active(f), exposure !== "hidden", "SDK explicit selection still activates non-hidden tools");
          await f.session.reload();
          assert.equal(active(f), exposure !== "hidden", "reload preserves explicit active selection");
          // Actual recorded system loadouts and public tree navigation, with no model request.
          for (const recordedActive of [false, true, false]) {
            f.manager.appendMessage({ role: "system", content: "Recorded tool loadout", timestamp: Date.now(),
              toolsAdded: recordedActive ? [{ name: "ask_user", description: "Recorded declaration", parameters: {} }] : [],
              toolsRemoved: recordedActive ? [] : [{ name: "ask_user" }] });
            const leaf = f.manager.appendCustomEntry("ask-host-loadout-test", {});
            f.manager.resetLeaf(); // A real navigation, not the SDK same-leaf no-op.
            await f.session.navigateTree(leaf);
            assert.equal(active(f), recordedActive && exposure !== "hidden", "recorded loadout controls navigation");
          }
          f.session.setActiveToolsByName([]);
          await f.session.reload();
          assert.equal(active(f), defaultOn, "native reload only re-adds registration-default tools");
        }
      } finally { native.dispose(); projected.dispose(); }
    });
    for (const [choice, options] of [
      ["empty defaultTools", { defaultTools: [] }],
      ["named defaultTools", { defaultTools: ["ask_user"] }],
      ["modifier defaultTools", { defaultTools: ["+ask_user"] }],
      ["removed defaultTools", { defaultTools: ["-ask_user"] }],
      ["explicit SDK tools", { sessionTools: ["ask_user"] }],
      ["excluded SDK tools", { sessionTools: ["read"] }],
    ]) test(`native/projection selection parity: ${label}, ${choice}`, async () => {
      const native = await fixture({ ...options, packages: [copyProtocolPackage(config)], options: { extensionsOverride: (base) => base } });
      const projected = await fixture({ ...options, packages: [copyProtocolPackage(config)] });
      try {
        assert.deepEqual(projected.session.getActiveToolNames(), native.session.getActiveToolNames());
        if (choice.includes("named") || choice.includes("modifier") || choice === "explicit SDK tools") {
          assert.equal(projected.session.getActiveToolNames().includes("ask_user"), exposure !== "hidden");
        }
        await native.session.reload(); await projected.session.reload();
        assert.deepEqual(projected.session.getActiveToolNames(), native.session.getActiveToolNames());
      } finally { native.dispose(); projected.dispose(); }
    });
  }
}
