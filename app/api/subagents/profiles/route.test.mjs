import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const testAgentDir = await mkdtemp(join(tmpdir(), "pi-web-subagent-route-global-"));
process.env.PI_CODING_AGENT_DIR = testAgentDir;

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET, PUT, PATCH, DELETE } = await jiti.import("./route.ts");
const { allowFileRoot } = await jiti.import("../../../../lib/file-access.ts");

after(async () => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  await rm(testAgentDir, { recursive: true, force: true });
});

function profile(overrides = {}) {
  return {
    name: "api-test-agent",
    displayName: "API test agent",
    description: "Used by route tests",
    systemPrompt: "Return a concise result.",
    tools: [],
    loadSkills: true,
    loadExtensions: true,
    inheritContext: false,
    runInBackground: true,
    enabled: true,
    ...overrides,
  };
}

function jsonRequest(method, body) {
  return new Request("http://localhost/api/subagents/profiles", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("profiles route creates, lists, and deletes a project profile", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-web-subagent-route-"));
  allowFileRoot(cwd);
  t.after(() => rm(cwd, { recursive: true, force: true }));

  const putResponse = await PUT(jsonRequest("PUT", { cwd, scope: "project", profile: profile() }));
  const putBody = await putResponse.json();
  assert.equal(putResponse.status, 200);
  assert.equal(putBody.profile.scope, "project");
  assert.deepEqual(putBody.profile.tools, []);
  assert.equal(putBody.profile.loadSkills, true);
  assert.equal(putBody.profile.loadExtensions, true);
  const source = await readFile(join(cwd, ".pi", "agents", "api-test-agent.md"), "utf8");
  assert.match(source, /tools: none/);
  assert.match(source, /load_skills: true/);
  assert.match(source, /load_extensions: true/);

  const getResponse = await GET(new Request(`http://localhost/api/subagents/profiles?cwd=${encodeURIComponent(cwd)}`));
  const getBody = await getResponse.json();
  assert.equal(getResponse.status, 200);
  const listedProfile = getBody.profiles.find((item) => item.name === "api-test-agent");
  assert.deepEqual(listedProfile.tools, []);
  assert.equal(listedProfile.loadSkills, true);
  assert.equal(listedProfile.loadExtensions, true);

  const deleteResponse = await DELETE(jsonRequest("DELETE", { cwd, scope: "project", name: "api-test-agent" }));
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { ok: true });

  const afterDelete = await GET(new Request(`http://localhost/api/subagents/profiles?cwd=${encodeURIComponent(cwd)}`));
  const afterDeleteBody = await afterDelete.json();
  assert.equal(afterDeleteBody.profiles.some((item) => item.name === "api-test-agent"), false);
});

test("profiles route keeps same-name global and project profiles independently editable", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-web-subagent-route-"));
  allowFileRoot(cwd);
  t.after(() => rm(cwd, { recursive: true, force: true }));

  let response = await PUT(jsonRequest("PUT", {
    cwd,
    scope: "global",
    profile: profile({
      description: "Global profile",
      extensionTools: ["ext:review/search"],
      color: "cyan",
      isolation: "worktree",
      persistSession: true,
    }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).profile.scope, "global");
  assert.match(await readFile(join(testAgentDir, "agents", "api-test-agent.md"), "utf8"), /Global profile/);

  response = await PUT(jsonRequest("PUT", {
    cwd,
    scope: "project",
    profile: profile({ description: "Project profile" }),
  }));
  assert.equal(response.status, 200);

  response = await GET(new Request(`http://localhost/api/subagents/profiles?cwd=${encodeURIComponent(cwd)}`));
  const sources = (await response.json()).profiles
    .filter((item) => item.name === "api-test-agent")
    .sort((a, b) => a.scope.localeCompare(b.scope));
  assert.deepEqual(sources.map((item) => item.scope), ["global", "project"]);
  assert.deepEqual(sources.map((item) => item.description), ["Global profile", "Project profile"]);

  response = await PATCH(jsonRequest("PATCH", {
    cwd,
    scope: "global",
    name: "api-test-agent",
    enabled: false,
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).profile.enabled, false);
  response = await GET(new Request(`http://localhost/api/subagents/profiles?cwd=${encodeURIComponent(cwd)}`));
  const toggledSources = (await response.json()).profiles.filter((item) => item.name === "api-test-agent");
  assert.equal(toggledSources.find((item) => item.scope === "global").enabled, false);
  assert.equal(toggledSources.find((item) => item.scope === "global").description, "Global profile");
  assert.equal(toggledSources.find((item) => item.scope === "global").loadSkills, true);
  assert.equal(toggledSources.find((item) => item.scope === "global").loadExtensions, true);
  assert.deepEqual(toggledSources.find((item) => item.scope === "global").extensionTools, ["ext:review/search"]);
  assert.equal(toggledSources.find((item) => item.scope === "global").color, "cyan");
  assert.equal(toggledSources.find((item) => item.scope === "global").isolation, "worktree");
  assert.equal(toggledSources.find((item) => item.scope === "global").persistSession, true);
  assert.equal(toggledSources.find((item) => item.scope === "project").enabled, true);
  const toggledSource = await readFile(join(testAgentDir, "agents", "api-test-agent.md"), "utf8");
  assert.match(toggledSource, /tools: ext:review\/search/);
  assert.match(toggledSource, /color: cyan/);
  assert.match(toggledSource, /isolation: worktree/);
  assert.match(toggledSource, /persist_session: true/);

  response = await DELETE(jsonRequest("DELETE", { cwd, scope: "project", name: "api-test-agent" }));
  assert.equal(response.status, 200);
  response = await GET(new Request(`http://localhost/api/subagents/profiles?cwd=${encodeURIComponent(cwd)}`));
  assert.deepEqual(
    (await response.json()).profiles.filter((item) => item.name === "api-test-agent").map((item) => item.scope),
    ["global"],
  );

  response = await DELETE(jsonRequest("DELETE", { cwd, scope: "global", name: "api-test-agent" }));
  assert.equal(response.status, 200);
});

test("profiles route toggles a built-in through settings.json without writing a profile file", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-web-subagent-route-"));
  allowFileRoot(cwd);
  t.after(async () => {
    await PATCH(jsonRequest("PATCH", { cwd, scope: "builtin", name: "explore", enabled: true }));
    await rm(cwd, { recursive: true, force: true });
  });

  let response = await PATCH(jsonRequest("PATCH", { cwd, scope: "builtin", name: "Explore", enabled: false }));
  assert.equal(response.status, 200);
  let body = await response.json();
  assert.equal(body.profile.scope, "builtin");
  assert.equal(body.profile.enabled, false);
  assert.equal(body.profile.filePath, undefined);
  assert.deepEqual(
    JSON.parse(await readFile(join(testAgentDir, "agents", "settings.json"), "utf8")).disabledBuiltIns,
    ["explore"],
  );
  assert.equal(existsSync(join(testAgentDir, "agents", "explore.md")), false);

  response = await GET(new Request(`http://localhost/api/subagents/profiles?cwd=${encodeURIComponent(cwd)}`));
  const builtIns = (await response.json()).profiles.filter((item) => item.scope === "builtin");
  assert.equal(builtIns.find((item) => item.name === "explore").enabled, false);
  assert.equal(builtIns.filter((item) => item.enabled).length, builtIns.length - 1);

  response = await PATCH(jsonRequest("PATCH", { cwd, scope: "builtin", name: "explore", enabled: true }));
  assert.equal(response.status, 200);
  body = await response.json();
  assert.equal(body.profile.enabled, true);
  assert.deepEqual(
    JSON.parse(await readFile(join(testAgentDir, "agents", "settings.json"), "utf8")).disabledBuiltIns,
    [],
  );

  response = await PATCH(jsonRequest("PATCH", { cwd, scope: "builtin", name: "not-a-built-in", enabled: false }));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Agent profile not found" });
});

test("profiles route rejects missing paths, malformed profiles, and unsafe names", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-web-subagent-route-"));
  allowFileRoot(cwd);
  t.after(() => rm(cwd, { recursive: true, force: true }));

  let response = await GET(new Request("http://localhost/api/subagents/profiles"));
  assert.equal(response.status, 400);

  response = await PUT(jsonRequest("PUT", { cwd, scope: "project" }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "profile required" });

  response = await PUT(jsonRequest("PUT", { cwd, scope: "project", profile: profile({ name: "../escape" }) }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Agent name may contain only/);

  response = await PUT(jsonRequest("PUT", { cwd, scope: "project", profile: profile({ thinking: "extreme" }) }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Invalid thinking level/);

  response = await DELETE(jsonRequest("DELETE", { cwd, scope: "project" }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "name required" });

  response = await PUT(jsonRequest("PUT", { cwd, scope: "workspace", profile: profile() }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "scope must be global or project" });

  response = await PUT(jsonRequest("PUT", { cwd, scope: "builtin", profile: profile() }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "scope must be global or project" });

  response = await PATCH(jsonRequest("PATCH", { cwd, scope: "workspace", name: "explore", enabled: false }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "scope must be global, project, or builtin" });

  response = await DELETE(jsonRequest("DELETE", { cwd, scope: "builtin", name: "Explore" }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "scope must be global or project" });

  response = await PATCH(jsonRequest("PATCH", { cwd, scope: "project", name: "missing", enabled: false }));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Agent profile not found" });

  response = await PATCH(jsonRequest("PATCH", { cwd, scope: "project", name: "api-test-agent" }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "enabled required" });
});


test("actual PUT missing new fields defaults to inheritance, preserving authored existing false/aliases", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-web-subagent-route-review-"));
  allowFileRoot(cwd);
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const missing = profile();
  delete missing.loadExtensions;
  delete missing.loadSkills;
  let response = await PUT(jsonRequest("PUT", { cwd, scope: "project", profile: missing }));
  assert.equal(response.status, 200);
  const saved = (await response.json()).profile;
  assert.equal(saved.loadExtensions, true);
  assert.equal(saved.loadSkills, false);
  assert.match(await readFile(join(cwd, ".pi", "agents", "api-test-agent.md"), "utf8"), /load_extensions: true/);
  for (const flags of ["load_extensions: false\nextensions: pi-authored-package", "extensions: none", "extensions: false"]) {
    await mkdir(join(cwd, ".pi", "agents"), { recursive: true });
    await writeFile(join(cwd, ".pi", "agents", "api-test-agent.md"), `---\n${flags}\n---\n\nauthored prompt\n`);
    response = await PUT(jsonRequest("PUT", { cwd, scope: "project", profile: missing }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).profile.loadExtensions, false);
    const source = await readFile(join(cwd, ".pi", "agents", "api-test-agent.md"), "utf8");
    assert.ok(source.includes(flags.split("\n").at(-1)), "route did not coerce or overwrite authored alias");
    const listed = await GET(new Request(`http://localhost/api/subagents/profiles?cwd=${encodeURIComponent(cwd)}`));
    assert.equal((await listed.json()).profiles.find((p) => p.name === missing.name).loadExtensions, false);
  }
});

test("actual PUT rejects invalid resource booleans without creating or overwriting a profile", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pi-web-subagent-route-review-invalid-"));
  allowFileRoot(cwd);
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const file = join(cwd, ".pi", "agents", "api-test-agent.md");
  for (const flag of ["loadSkills", "loadExtensions"]) {
    for (const value of ["false", "true", null, 0, [], {}]) {
      const response = await PUT(jsonRequest("PUT", { cwd, scope: "project", profile: profile({ [flag]: value }) }));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, `${flag} must be a boolean`);
      assert.equal(existsSync(file), false);
    }
  }
  const good = await PUT(jsonRequest("PUT", { cwd, scope: "project", profile: profile({ loadExtensions: false }) }));
  assert.equal(good.status, 200);
  const before = await readFile(file, "utf8");
  const invalid = await PUT(jsonRequest("PUT", { cwd, scope: "project", profile: profile({ loadExtensions: "true" }) }));
  assert.equal(invalid.status, 400);
  assert.equal(await readFile(file, "utf8"), before);
});
