import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after } from "node:test";
import { createJiti } from "jiti";

// Isolate before importing any SDK/application module: the fixture loader must
// never read or write the real agent HOME. os.tmpdir() follows the configured
// TMPDIR; the validation harness must place it outside the real HOME so SDK
// ancestor .agents/skills discovery cannot mistake user skills for project ones.
const root = mkdtempSync(join(tmpdir(), "pi-web-append-retirement-"));
const environmentKeys = ["HOME", "PI_CODING_AGENT_DIR", "PI_OFFLINE", "JITI_FS_CACHE"];
const originalEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
process.env.HOME = join(root, "home");
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
process.env.PI_OFFLINE = "1";
process.env.JITI_FS_CACHE = "false";
mkdirSync(process.env.HOME, { recursive: true });
mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
after(() => {
  for (const key of environmentKeys) {
    if (originalEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnvironment[key];
  }
  rmSync(root, { recursive: true, force: true });
});

const { DefaultResourceLoader } = await import("@earendil-works/pi-coding-agent");
const jiti = createJiti(import.meta.url);
const { projectTrustReloadOptions, trustProject } = await jiti.import("./project-trust.ts");

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function makeFixture(t) {
  const fixtureRoot = mkdtempSync(join(root, "case-"));
  const agentDir = join(fixtureRoot, "agent");
  const cwd = join(fixtureRoot, "project");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  // Only native append discovery is under test. Do not load unrelated ancestor
  // context/skills or extensions; no appendSystemPrompt override is supplied.
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  return { agentDir, cwd, loader };
}

const globalFileName = "APPEND_SYSTEM.md";
const projectFileName = join(".pi", "APPEND_SYSTEM.md");

// The editor, API and helper are gone, but pi still owns APPEND_SYSTEM.md. These
// cases ask pi's own loader, so a future relocation of the native file fails here
// rather than leaving the retirement test asserting a rule nobody follows.

test("a missing append-system file loads no append prompt", async (t) => {
  const { agentDir, loader } = makeFixture(t);
  await loader.reload();
  assert.deepEqual(loader.getAppendSystemPrompt(), []);
  assert.deepEqual(loader.getAppendSystemPromptSources(), []);
  assert.equal(existsSync(join(agentDir, globalFileName)), false);
});

test("the global file under agentDir is what pi loads, written by hand", async (t) => {
  const { agentDir, loader } = makeFixture(t);
  const content = "产出文档后，在回复中用 markdown 链接给出它的路径\n";
  // Direct fixture write: the retired lib/append-system.ts writer is not revived.
  writeFileSync(join(agentDir, globalFileName), content);

  await loader.reload();
  assert.deepEqual(loader.getAppendSystemPrompt(), [content]);
  assert.deepEqual(loader.getAppendSystemPromptSources(), [{ path: join(agentDir, globalFileName) }]);
});

test("an untrusted project file is ignored and the global file still wins", async (t) => {
  const { agentDir, cwd, loader } = makeFixture(t);
  writeFileSync(join(agentDir, globalFileName), "global only");
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(join(cwd, projectFileName), "project only");

  // The gate is projectTrustReloadOptions(), the same option lib/rpc-manager.ts passes.
  const options = projectTrustReloadOptions(cwd, agentDir);
  assert.ok(options, "the project append file must require trust");
  assert.equal(await options.resolveProjectTrust(), false);
  await loader.reload(options);
  assert.deepEqual(loader.getAppendSystemPrompt(), ["global only"]);
  assert.deepEqual(loader.getAppendSystemPromptSources(), [{ path: join(agentDir, globalFileName) }]);
  assert.equal(readFileSync(join(cwd, projectFileName), "utf8"), "project only");
});

test("a trusted project file replaces the global file instead of stacking", async (t) => {
  const { agentDir, cwd, loader } = makeFixture(t);
  writeFileSync(join(agentDir, globalFileName), "global only");
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  writeFileSync(join(cwd, projectFileName), "project only");

  assert.equal(trustProject(cwd, agentDir).trusted, true);
  const options = projectTrustReloadOptions(cwd, agentDir);
  assert.ok(options, "the project append file must require trust");
  assert.equal(await options.resolveProjectTrust(), true);
  await loader.reload(options);
  assert.deepEqual(loader.getAppendSystemPrompt(), ["project only"]);
  assert.deepEqual(loader.getAppendSystemPromptSources(), [{ path: join(cwd, projectFileName) }]);
  assert.equal(readFileSync(join(agentDir, globalFileName), "utf8"), "global only");
});

test("the fork's editor, API, helper and their tests stay removed", () => {
  for (const path of [
    "../components/AppendSystemConfig.tsx",
    "../components/AppendSystemConfig.test.mjs",
    "../app/api/append-system/route.ts",
    "../app/api/append-system/route.test.mjs",
    "../lib/append-system.ts",
    "../lib/append-system.test.mjs",
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), false, `${path} must be removed`);
  }
});

test("no production source still references the retired editor chain", () => {
  const forbidden = /AppendSystemConfig|AppendSystemProjectOverride|AppendSystemPromptResponse|\/api\/append-system|settings\.appendSystem|\.append-system-|["'](?:[^"']*\/)?append-system(?:\.ts)?["']/;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (path.endsWith(".test.mjs") || !/\.(ts|tsx|css|mjs)$/.test(path)) continue;
      if (forbidden.test(readFileSync(path, "utf8"))) offenders.push(relative(repoRoot, path));
    }
  };
  for (const dir of ["app", "components", "hooks", "lib", "public"]) {
    walk(join(repoRoot, dir));
  }
  assert.deepEqual(offenders, []);
});
