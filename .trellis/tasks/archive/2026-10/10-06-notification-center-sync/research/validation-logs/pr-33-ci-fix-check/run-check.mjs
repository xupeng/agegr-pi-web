import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

// Finite review harness: only small fixtures; cwd/source/dependencies stay put.
const logs = join(dirname(fileURLToPath(import.meta.url)), "safe-final");
mkdirSync(logs, { recursive: true });
const files = ["lib/agent-run-observer.integration.test.mjs", "lib/rpc-manager.notifications.test.mjs"];
const hash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const owned = mkdtempSync("/var/tmp/pr-33-ci-fix-check-");
const outcomes = [];
function command(label, executable, args, env) {
  const result = spawnSync(executable, args, { env, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(join(logs, `${label}.log`), `$ ${[executable, ...args].map(JSON.stringify).join(" ")}\n${result.stdout ?? ""}${result.stderr ?? ""}\nexit=${result.status}; signal=${result.signal}; error=${result.error ?? "none"}\n`);
  outcomes.push({ label, executable, args, exit: result.status, signal: result.signal });
  console.log(label, result.status, (result.stdout ?? "").slice(-400));
  assert.equal(result.status, 0, `${label}: see durable log`);
  return result;
}
const sourceFiles = spawnSync("git", ["ls-files", "app", "components", "hooks", "lib", "public", "e2e", "package.json", "package-lock.json", "tsconfig.json", "eslint.config.mjs"], { encoding: "utf8" }).stdout.trim().split("\n");
const before = Object.fromEntries(sourceFiles.map((file) => [file, hash(file)]));
writeFileSync(join(logs, "source-hashes-before.json"), JSON.stringify(before, null, 2) + "\n");
let cleanup;
try {
  // Prevent HOME isolation from turning real ancestor skills into project resources.
  const ancestry = ["/", "/var", "/var/tmp", owned];
  const ancestorProbe = ancestry.flatMap((root) => [".agents/skills", ".pi"].map((name) => ({ path: join(root, name), exists: existsSync(join(root, name)) })));
  assert.ok(ancestorProbe.every((probe) => !probe.exists), "fixture ancestors contain project resources");
  for (const name of ["home", "agent", "tmp", "tmp with spaces", "priority", "config", "cache"]) mkdirSync(join(owned, name));
  const env = { PATH: process.env.PATH, LANG: "C.UTF-8", HOME: join(owned, "home"), PI_CODING_AGENT_DIR: join(owned, "agent"), TMPDIR: join(owned, "tmp with spaces"), XDG_CONFIG_HOME: join(owned, "config"), XDG_CACHE_HOME: join(owned, "cache") };
  // Explicit whitelist excludes all provider secrets, global offline/MCP flags,
  // wrapper task root, NODE_OPTIONS and shared compile-cache configuration.
  writeFileSync(join(logs, "environment.json"), JSON.stringify({ cwd: process.cwd(), head: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(), node: process.version, originalTMPDIR: process.env.TMPDIR, wrapperTaskRoot: process.env.PI_TASK_TMPDIR, owned, env, ancestorProbe }, null, 2) + "\n");
  command("dependency-tree", "npm", ["ls", "--include=dev"], env);
  command("targeted-fallback", "env", ["-u", "PI_TASK_TMPDIR", "node", "--experimental-strip-types", "--test", ...files], env);
  const checkFallbackCleanup = () => {
    const entries = readdirSync(env.TMPDIR);
    // SDK/Node 24 may enable its own compile cache. It is not test scratch;
    // here it is also owned and removed with the exclusive fixture root.
    assert.deepEqual(entries.filter((entry) => entry !== "node-compile-cache"), [], "test scratch leaked");
    return entries;
  };
  const fallbackContents = checkFallbackCleanup();
  command("targeted-priority", "node", ["--experimental-strip-types", "--test", ...files], { ...env, PI_TASK_TMPDIR: join(owned, "priority") });
  assert.deepEqual(readdirSync(join(owned, "priority")), [], "priority scratch leaked");
  const priorityFallbackContents = checkFallbackCleanup();
  writeFileSync(join(logs, "temporary-contents.json"), JSON.stringify({ fallbackContents, priorityFallbackContents }, null, 2) + "\n");
  const platformEnv = { ...env }; delete platformEnv.TMPDIR;
  command("targeted-platform", "env", ["-u", "TMPDIR", "-u", "PI_TASK_TMPDIR", "node", "--experimental-strip-types", "--test", ...files], platformEnv);

  // Execute the unchanged setup text in a restricted VM to observe actual
  // allocation/cleanup roots and env ordering, without importing the SDK.
  const probes = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const setup = source.slice(source.indexOf("const scratch ="), source.indexOf("const scratch =") + source.slice(source.indexOf("const scratch =")).indexOf("\n", source.slice(source.indexOf("const scratch =")).indexOf("after(() =>")));
    assert.ok(setup.endsWith("after(() => rmSync(scratch, { recursive: true, force: true }));"));
    assert.ok(!source.includes("assert.ok(process.env.PI_TASK_TMPDIR"));
    assert.ok(source.indexOf(setup) < source.indexOf('await import("@earendil-works/') || source.indexOf(setup) < source.indexOf("await jiti.import("));
    for (const priority of [false, true]) {
      const localEnv = priority ? { PI_TASK_TMPDIR: join(owned, "priority") } : {};
      let allocated; let cleanupCallback;
      vm.runInNewContext(setup, { process: { env: localEnv }, join, tmpdir: () => env.TMPDIR, mkdtempSync: (prefix) => { allocated = mkdtempSync(prefix); return allocated; }, mkdirSync, rmSync, after: (callback) => { cleanupCallback = callback; } });
      try {
        assert.equal(dirname(allocated), priority ? join(owned, "priority") : env.TMPDIR);
        assert.equal(localEnv.HOME, join(allocated, "home"));
        assert.equal(localEnv.PI_CODING_AGENT_DIR, join(allocated, "agent"));
        assert.equal(localEnv.PI_OFFLINE, "1"); assert.equal(localEnv.PI_WEB_DISABLE_MCP, "1");
        cleanupCallback(); assert.equal(existsSync(allocated), false);
        probes.push({ file, priority, allocated, HOME: localEnv.HOME, agent: localEnv.PI_CODING_AGENT_DIR, removed: !existsSync(allocated) });
      } finally { rmSync(allocated, { recursive: true, force: true }); }
    }
  }
  writeFileSync(join(logs, "setup-probes.json"), JSON.stringify(probes, null, 2) + "\n");
  // Existing unrelated MCP tests interpolate !touch paths without shell quoting;
  // keep the spaces probe targeted, and use baseline-compatible full-suite TMPDIR.
  const fullEnv = { ...env, TMPDIR: join(owned, "tmp") };
  writeFileSync(join(logs, "full-environment.json"), JSON.stringify(fullEnv, null, 2) + "\n");
  command("full-tests", "env", ["-u", "PI_TASK_TMPDIR", "npm", "test"], fullEnv);
  command("full-lint", "npm", ["run", "lint", "--", "--format", "json", "--output-file", join(logs, "eslint.json")], fullEnv);
  const lint = JSON.parse(readFileSync(join(logs, "eslint.json"), "utf8"));
  const lintCounts = { files: lint.length, errors: lint.reduce((n, f) => n + f.errorCount, 0), warnings: lint.reduce((n, f) => n + f.warningCount, 0), fatal: lint.reduce((n, f) => n + f.fatalErrorCount, 0) };
  assert.equal(lintCounts.errors + lintCounts.warnings + lintCounts.fatal, 0);
  command("full-tsc", "node_modules/.bin/tsc", ["--noEmit", "--incremental", "false"], fullEnv);
  writeFileSync(join(logs, "lint-counts.json"), JSON.stringify(lintCounts, null, 2) + "\n");
} finally {
  rmSync(owned, { recursive: true, force: true });
  cleanup = { owned, removed: !existsSync(owned) };
  const after = Object.fromEntries(sourceFiles.map((file) => [file, hash(file)]));
  writeFileSync(join(logs, "source-hashes-after.json"), JSON.stringify(after, null, 2) + "\n");
  writeFileSync(join(logs, "results.json"), JSON.stringify({ outcomes, cleanup, sourceHashesUnchanged: JSON.stringify(before) === JSON.stringify(after), wrapperCleanupOwner: "outer pi-tmp-run" }, null, 2) + "\n");
  assert.deepEqual(before, after, "concurrent source changes invalidate checks");
  assert.ok(cleanup.removed);
}
console.log("Review gates passed; exact owned fixture root removed.");
