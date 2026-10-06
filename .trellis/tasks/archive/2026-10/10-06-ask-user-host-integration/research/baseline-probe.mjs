// Evidence-only original-ref probe. Never import main-tree candidate product code.
// Run under pi-tmp-run + env -i; see baseline-validation.md for the invocation.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [baseline, external] = process.argv.slice(2);
const root = process.env.PI_TASK_TMPDIR;
assert.ok(root && !root.startsWith("/tmp/"));
assert.equal(process.env.HOME, join(root, "home"));
assert.equal(process.env.PI_CODING_AGENT_DIR, join(root, "agent"));
assert.equal(process.env.PI_OFFLINE, "1");
assert.equal(process.env.JITI_FS_CACHE, "false");
assert.equal(execFileSync("git", ["-C", baseline, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  "128fc3c7dd8cdf60aa4ebe12e7ec3c75c964f61f");
const externalHead = execFileSync("git", ["-C", external, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const externalStatus = execFileSync("git", ["-C", external, "status", "--short"], { encoding: "utf8" });
assert.equal(externalStatus, "", "actual external source must be clean for revision evidence");
const cwd = join(root, "cwd");
const packageDir = join(root, "actual-system-package-copy");
for (const dir of [cwd, packageDir, process.env.HOME, process.env.PI_CODING_AGENT_DIR]) mkdirSync(dir, { recursive: true });
const files = ["package.json", "index.ts", "bridge.ts", "tool.ts", "types.ts", "validation.ts", "format.ts",
  "tui-state.ts", "tui-form.ts", "tui-host.ts", "LICENSE"];
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const copiedHashes = {};
for (const file of files) {
  const source = join(external, file);
  assert.equal(lstatSync(source).isSymbolicLink(), false);
  copyFileSync(source, join(packageDir, file));
  assert.equal(hash(source), hash(join(packageDir, file)));
  copiedHashes[file] = hash(source);
}
assert.equal(existsSync(join(packageDir, "node_modules")), false);
assert.equal(existsSync(join(packageDir, ".git")), false);
assert.equal(realpathSync(packageDir), packageDir);
const resolveHost = (name) => fileURLToPath(import.meta.resolve(name, pathToFileURL(join(baseline, "package.json")).href));
const packagePath = (name) => {
  let dir = dirname(resolveHost(name));
  while (true) {
    const path = join(dir, "package.json");
    if (existsSync(path) && JSON.parse(readFileSync(path, "utf8")).name === name) return path;
    const parent = dirname(dir);
    assert.notEqual(parent, dir);
    dir = parent;
  }
};
const lock = JSON.parse(readFileSync(join(baseline, "package-lock.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(baseline, "package.json"), "utf8"));
const sdkIdentity = {};
for (const suffix of ["pi-agent-core", "pi-ai", "pi-coding-agent", "pi-tui"]) {
  const name = `@earendil-works/${suffix}`;
  const path = packagePath(name);
  const version = JSON.parse(readFileSync(path, "utf8")).version;
  assert.equal(version, manifest.dependencies[name]);
  assert.equal(version, lock.packages[`node_modules/${name}`].version);
  assert.equal(version, lock.packages[""].dependencies[name]);
  sdkIdentity[name] = { version, manifest: path, entry: resolveHost(name), manifestSha256: hash(path),
    integrity: lock.packages[`node_modules/${name}`].integrity };
}
// Isolation is established before either SDK or Web imports; do not use external dev SDK.
const sdk = await import(pathToFileURL(resolveHost("@earendil-works/pi-coding-agent")).href);
const { createJiti } = await import(pathToFileURL(resolveHost("jiti")).href);
const jiti = createJiti(join(baseline, "package.json"), { interopDefault: true, moduleCache: false, fsCache: false });
const { createAskUserExtension } = await jiti.import(join(baseline, "lib/ask-user/extension.ts"));
const runtime = await sdk.ModelRuntime.create({ authPath: join(root, "agent", "auth.json"),
  modelsPath: null, modelsStorePath: join(root, "agent", "models-store.json"),
  refreshOnCreate: false, allowModelNetwork: false });
const copiedRequire = createRequire(join(packageDir, "index.ts"));
for (const name of Object.keys(sdkIdentity)) assert.throws(() => copiedRequire.resolve(name), { code: "MODULE_NOT_FOUND" });
const output = { baseline, baselineRef: "128fc3c7dd8cdf60aa4ebe12e7ec3c75c964f61f",
  environmentKeys: Object.keys(process.env).sort(), scratch: root,
  external: { source: resolve(external), gitHead: externalHead, gitStatus: externalStatus,
    copiedPackage: packageDir, copiedHashes,
    packageManifest: JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) },
  sdkIdentity, lockSha256: hash(join(baseline, "package-lock.json")), cases: [] };
for (const gate of ["1", "0"]) {
  process.env.PI_WEB_ASK_USER = gate;
  let opens = 0;
  let uiCustom = 0;
  let lookups = 0;
  let pending = undefined;
  let posted = 0;
  const sessionManager = sdk.SessionManager.inMemory(cwd);
  const loader = new sdk.DefaultResourceLoader({ cwd, agentDir: process.env.PI_CODING_AGENT_DIR,
    noSkills: true, noThemes: true, noContextFiles: true, noPromptTemplates: true,
    settingsManager: sdk.SettingsManager.inMemory({ packages: [packageDir], extensions: [] }),
    extensionFactories: [createAskUserExtension(() => {
      lookups++;
      return { openAsk: async (input) => {
        opens++;
        pending = { askId: "unexpected-open", askedAt: "2026-10-06T00:00:00Z", questions: input.questions };
        return { ask: pending };
      } };
    })],
  });
  await loader.reload();
  const result = loader.getExtensions();
  assert.equal(result.extensions.length, 2);
  assert.equal(result.extensions[0].path, join(packageDir, "index.ts"));
  assert.equal(result.extensions[1].path, "<inline:pi-web-ask-user>");
  const registrations = result.extensions.map((ext) => ({ path: ext.path, sourceInfo: ext.sourceInfo,
    askUserRegistered: ext.tools.has("ask_user"),
    exposure: ext.tools.get("ask_user")?.definition.exposure ?? null }));
  assert.equal(registrations[0].askUserRegistered, true);
  assert.equal(registrations[1].askUserRegistered, gate === "1");
  if (gate === "1") {
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].error, /ask_user/);
  } else assert.deepEqual(result.errors, []);
  const runner = new sdk.ExtensionRunner(result.extensions, result.runtime, cwd, sessionManager, runtime);
  const tools = runner.getAllRegisteredTools().filter((tool) => tool.definition.name === "ask_user");
  assert.equal(tools.length, 1);
  const effective = tools[0];
  assert.equal(effective, result.extensions[0].tools.get("ask_user"));
  assert.equal(effective.sourceInfo.path, join(packageDir, "index.ts"));
  assert.equal(effective.definition.exposure, undefined);
  assert.deepEqual(effective.sourceInfo, result.extensions[0].sourceInfo);
  let error = "";
  let executeResult;
  try {
    executeResult = await effective.definition.execute("baseline-call", {
      questions: [{ id: "q", question: "Which scope?", options: [] }],
    }, undefined, undefined, { sessionManager, mode: "rpc", hasUI: true, cwd,
      ui: { custom: () => { uiCustom++; throw new Error("TUI custom must not open in RPC"); } } });
    if (executeResult?.terminate === true || executeResult?.content?.some((part) => /Posted/.test(part.text ?? ""))) posted++;
  } catch (caught) { error = caught.message; }
  assert.match(error, /expected exactly one synchronous host bridge on "pi\.ask-user\.bridge:resolve-open:v1" \(got 0\)/);
  assert.equal(executeResult, undefined);
  assert.equal(opens, 0);
  assert.equal(lookups, 0);
  assert.equal(uiCustom, 0);
  assert.equal(posted, 0);
  assert.equal(pending, undefined);
  output.cases.push({ gate, registrations, diagnostics: result.errors,
    effective: { extensionPath: effective.sourceInfo.path, sourceInfo: effective.sourceInfo,
      rawExposure: effective.definition.exposure ?? null, normalizedExposure: "direct" },
    mode: "rpc", hasUI: true, error, opens, lookups, uiCustom, posted, pending: null });
  // Resource loader clears tracked listeners on reload; no session/model was started.
}
assert.equal(externalHead, execFileSync("git", ["-C", external, "rev-parse", "HEAD"], { encoding: "utf8" }).trim());
for (const file of files) assert.equal(hash(join(external, file)), copiedHashes[file]);
console.log(JSON.stringify(output, null, 2));
