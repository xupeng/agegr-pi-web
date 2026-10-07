import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const testAgentDir = await mkdtemp(join(tmpdir(), "pi-web-snapshot-global-"));
process.env.PI_CODING_AGENT_DIR = testAgentDir;

const {
  decodeSubagentSessionResources,
  listSubagentProfiles,
  readSubagentSessionResources,
  saveProjectSubagentProfile,
  SUBAGENT_META_TYPE,
} = await createJiti(import.meta.url).import("./subagents.ts");

after(async () => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  await rm(testAgentDir, { recursive: true, force: true });
});

function metaEntry(snapshot, overrides = {}) {
  return {
    type: "custom",
    customType: SUBAGENT_META_TYPE,
    id: "meta",
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    data: {
      version: 1,
      parentSessionId: "parent",
      parentSessionPath: "/tmp/parent.jsonl",
      resourceSnapshot: snapshot,
      ...overrides,
    },
  };
}

async function withProject(files, run) {
  const cwd = await mkdtemp(join(tmpdir(), "pi-web-snapshot-cwd-"));
  try {
    await mkdir(join(cwd, ".pi", "agents"), { recursive: true });
    for (const [name, contents] of Object.entries(files)) {
      await writeFile(join(cwd, ".pi", "agents", name), contents, "utf8");
    }
    return await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("built-in profiles inherit extensions by default and keep skills off", () => {
  const builtins = listSubagentProfiles(testAgentDir).filter((profile) => profile.scope === "builtin");
  assert.deepEqual(builtins.map((profile) => profile.name).sort(), ["explore", "general-purpose", "plan"]);
  for (const profile of builtins) {
    assert.equal(profile.loadExtensions, true, `${profile.name} inherits extensions`);
    assert.equal(profile.loadSkills, false, `${profile.name} keeps skills off`);
  }
});

test("a present non-boolean or unknown extension flag never widens permissions", async () => {
  await withProject({
    "string-false.md": "---\nname: string-false\nload_extensions: \"false\"\n---\n\nprompt\n",
    "string-true.md": "---\nname: string-true\nload_extensions: \"true\"\n---\n\nprompt\n",
    "unknown.md": "---\nname: unknown\nload_extensions: sometimes\n---\n\nprompt\n",
    "alias-whitelist.md": "---\nname: alias-whitelist\nextensions:\n  - pi-codegraph\n---\n\nprompt\n",
    "alias-bare-string.md": "---\nname: alias-bare-string\nextensions: pi-codegraph\n---\n\nprompt\n",
    "canonical-wins.md": "---\nname: canonical-wins\nload_extensions: false\nextensions: true\n---\n\nprompt\n",
  }, async (cwd) => {
    const byName = new Map(listSubagentProfiles(cwd).map((profile) => [profile.name, profile]));
    assert.equal(byName.get("string-false").loadExtensions, false, "the string \"false\" is not truthy");
    assert.equal(byName.get("string-true").loadExtensions, true);
    assert.equal(byName.get("unknown").loadExtensions, false, "an unrecognized canonical value denies instead of allowing all");
    assert.equal(byName.get("alias-whitelist").loadExtensions, true, "a whitelist alias still enables loading");
    assert.equal(byName.get("alias-bare-string").loadExtensions, true, "a bare package name is a whitelist alias");
    assert.equal(byName.get("canonical-wins").loadExtensions, false, "the canonical field wins over the alias");
  });
});

test("legacy v1 snapshots without a tool policy keep the exact tool list and stay disabled", () => {
  const entries = [metaEntry({
    version: 1,
    appendSystemPrompt: ["Stay focused."],
    tools: ["read", "grep"],
  })];
  assert.deepEqual(decodeSubagentSessionResources(entries), {
    kind: "valid",
    resources: {
      appendSystemPrompt: ["Stay focused."],
      tools: ["read", "grep"],
      loadSkills: false,
      loadExtensions: false,
    },
  });
});

test("a versioned tool policy round-trips and carries the ext allow/deny selectors", () => {
  const toolPolicy = {
    version: 1,
    builtinTools: ["read", "grep"],
    extensionAllow: ["ext:*"],
    extensionDeny: ["ext:pi-codegraph/web_search"],
  };
  const decoded = decodeSubagentSessionResources([metaEntry({
    version: 1,
    appendSystemPrompt: [],
    tools: ["read", "grep"],
    loadSkills: false,
    loadExtensions: true,
    toolPolicy,
  })]);
  assert.equal(decoded.kind, "valid");
  assert.deepEqual(decoded.resources.toolPolicy, toolPolicy);
});

test("a malformed child snapshot is rejected, not decoded as a normal session", () => {
  const cases = [
    ["missing snapshot", undefined],
    ["non-object snapshot", "nope"],
    ["unknown version", { version: 2, appendSystemPrompt: [], tools: [] }],
    ["non-array tools", { version: 1, appendSystemPrompt: [], tools: "read" }],
    ["control tool", { version: 1, appendSystemPrompt: [], tools: ["Agent"] }],
    ["non-boolean flag", { version: 1, appendSystemPrompt: [], tools: ["read"], loadExtensions: "true" }],
    ["malformed policy version", { version: 1, appendSystemPrompt: [], tools: ["read"], toolPolicy: { version: 2 } }],
    ["policy grants non-builtin via builtinTools", {
      version: 1,
      appendSystemPrompt: [],
      tools: ["read"],
      toolPolicy: { version: 1, builtinTools: ["web_search"], extensionAllow: [], extensionDeny: [] },
    }],
    ["policy selector is not ext:", {
      version: 1,
      appendSystemPrompt: [],
      tools: ["read"],
      toolPolicy: { version: 1, builtinTools: ["read"], extensionAllow: ["web_search"], extensionDeny: [] },
    }],
    ["malformed provider source", {
      version: 1,
      appendSystemPrompt: [],
      tools: ["read"],
      providerSources: [{ providerId: "sub2api" }],
    }],
    ["unversioned provider source array", {
      version: 1,
      appendSystemPrompt: [],
      tools: ["read"],
      providerSources: [{ providerId: "sub2api" }],
    }],
    ["unknown providerSources envelope version", {
      version: 1,
      appendSystemPrompt: [],
      tools: ["read"],
      providerSources: { version: 2, refs: [] },
    }],
  ];
  for (const [label, snapshot] of cases) {
    const decoded = decodeSubagentSessionResources([metaEntry(snapshot)]);
    assert.equal(decoded.kind, "invalid", label);
    assert.equal(readSubagentSessionResources([metaEntry(snapshot)]), null, `${label} reads as null but is not a normal session`);
  }
});

test("no subagent metadata decodes as none, but a broken marker is invalid", () => {
  assert.deepEqual(decodeSubagentSessionResources([{ type: "message", message: { role: "user", content: "hi" } }]), { kind: "none" });
  assert.equal(decodeSubagentSessionResources([{ type: "custom", customType: SUBAGENT_META_TYPE, data: "broken" }]).kind, "invalid");
  assert.equal(
    decodeSubagentSessionResources([metaEntry({ version: 1, appendSystemPrompt: [], tools: [] }, { version: 2 })]).kind,
    "invalid",
  );
});

test("a valid provider source reference decodes through its versioned envelope", () => {
  const refs = [{
    providerId: "sub2api",
    kind: "native",
    file: "/home/me/.pi/agent/npm/node_modules/pi-sub2api/extensions/index.ts",
    scope: "global",
    origin: "package",
    source: "npm:pi-sub2api",
    cwd: "/home/me/project",
  }];
  const decoded = decodeSubagentSessionResources([metaEntry({
    version: 1,
    appendSystemPrompt: [],
    tools: ["read"],
    providerSources: { version: 1, refs },
  })]);
  assert.equal(decoded.kind, "valid");
  assert.deepEqual(decoded.resources.providerSources, { version: 1, refs });
});

test("saving rejects a non-boolean resource flag and preserves an omitted one", async () => {
  await withProject({}, async (cwd) => {
    const base = {
      name: "flag-agent",
      displayName: "Flag agent",
      description: "",
      systemPrompt: "prompt",
      tools: ["read"],
      loadSkills: false,
      loadExtensions: false,
      inheritContext: false,
      runInBackground: false,
      enabled: true,
    };
    saveProjectSubagentProfile(cwd, base);
    assert.throws(
      () => saveProjectSubagentProfile(cwd, { ...base, loadExtensions: "true" }),
      /loadExtensions must be a boolean/,
    );
    // An omitted field must not overwrite the authored false.
    const saved = saveProjectSubagentProfile(cwd, { ...base, loadExtensions: undefined });
    assert.equal(saved.loadExtensions, false);
    const reloaded = listSubagentProfiles(cwd).find((profile) => profile.name === "flag-agent");
    assert.equal(reloaded.loadExtensions, false);
  });
});

test("provider source envelope limit counts UTF-8 bytes and never accepts raw credential-bearing URLs", () => {
  const ref = {providerId:"fixture",kind:"native",file:"/var/tmp/fixture.js",scope:"global",origin:"package",source:"sha256:"+"a".repeat(64),cwd:"/var/tmp/"+"漢".repeat(12000)};
  const envelope={version:1,refs:[ref]};
  assert.ok(JSON.stringify(envelope).length < 32768);
  assert.ok(Buffer.byteLength(JSON.stringify(envelope),"utf8") > 32768);
  const snapshot={version:1,appendSystemPrompt:[],tools:["read"],providerSources:envelope};
  assert.equal(decodeSubagentSessionResources([metaEntry(snapshot)]).kind,"invalid");
  assert.equal(decodeSubagentSessionResources([metaEntry({...snapshot,providerSources:{version:1,refs:[{...ref,cwd:"/var/tmp/fixture",source:"git:https://user:secret@host.invalid/repo"}]}})]).kind,"invalid");
});


test("parseMissing: file profiles without extension fields/selectors inherit by default", async () => {
  await withProject({ "missing.md": "---\nname: missing\ntools: read\n---\n\nprompt\n" }, async (cwd) => {
    const profile = listSubagentProfiles(cwd).find((item) => item.name === "missing");
    assert.equal(profile.loadExtensions, true);
    assert.equal(profile.loadSkills, false);
  });
});

function missingFlagProfile() {
  return { name: "missing", displayName: "missing", description: "missing", systemPrompt: "prompt", tools: ["read"], enabled: true, inheritContext: false, runInBackground: false };
}

test("saveNewMissing: omitted new profile fields inherit extensions, not skills", async () => {
  await withProject({}, async (cwd) => {
    const saved = saveProjectSubagentProfile(cwd, missingFlagProfile());
    assert.equal(saved.loadExtensions, true);
    assert.equal(saved.loadSkills, false);
    const parsed = listSubagentProfiles(cwd).find((item) => item.name === "missing");
    assert.equal(parsed.loadExtensions, true);
  });
});

test("saveExistingFalse: omitted fields preserve existing explicit false and authored aliases", async () => {
  for (const flags of ["load_extensions: false\nextensions: pi-authored-package", "extensions: false", "extensions: none"]) {
    await withProject({ "missing.md": `---\nname: missing\n${flags}\n---\n\nprompt\n` }, async (cwd) => {
      const saved = saveProjectSubagentProfile(cwd, missingFlagProfile());
      assert.equal(saved.loadExtensions, false);
      const source = await readFile(join(cwd, ".pi", "agents", "missing.md"), "utf8");
      assert.ok(source.includes(flags.split("\n").at(-1)), "omitted switch preserves the authored alias text");
      assert.equal(listSubagentProfiles(cwd).find((item) => item.name === "missing").loadExtensions, false);
    });
  }
});


test("profile editing maps powershell to canonical bash while snapshots retain mapped permission", async () => {
  await withProject({ "missing.md": "---\nname: missing\ntools: powershell, read\n---\n\nprompt\n" }, async (cwd) => {
    const parsed = listSubagentProfiles(cwd).find((item) => item.name === "missing");
    assert.deepEqual(parsed.tools, ["bash", "read"]);
    const saved = saveProjectSubagentProfile(cwd, { ...missingFlagProfile(), tools: ["powershell", "bash", "read"] });
    assert.deepEqual(saved.tools, ["bash", "read"]);
    const source = await readFile(join(cwd, ".pi", "agents", "missing.md"), "utf8");
    assert.match(source, /tools: bash, read/);
  });
  const legacy = decodeSubagentSessionResources([metaEntry({ version: 1, appendSystemPrompt: [], tools: ["powershell"] })]);
  assert.equal(legacy.kind, "valid");
  assert.deepEqual(legacy.resources.tools, ["powershell"]);
  assert.equal(legacy.resources.loadExtensions, false);
  assert.equal(legacy.resources.toolPolicy, undefined, "legacy exact tools never upgrade");
});
