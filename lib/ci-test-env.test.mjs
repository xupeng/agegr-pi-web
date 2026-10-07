import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nodeTest from "node:test";
import * as yaml from "js-yaml";
import { assertOwnedCiRoot, assertNoDotenv, ciEnvironment, ciSummary, cleanupCiRoot, createCiRoot, runCiCommand } from "./ci-test-env.mjs";

// The helper belongs to hosted Ubuntu CI, not the Windows product runtime.
const test = (name, fn) => nodeTest(name, { skip: process.platform === "win32" }, fn);

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), "pi-web-ci-unit-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const cwd = join(temp, "workspace");
  mkdirSync(cwd);
  return { temp, cwd, root: createCiRoot(temp) };
}

test("environment uses a minimal allowlist, private paths and a stable browser cache", () => {
  const hostile = { PATH: process.env.PATH, HOME: "/real/home", XDG_CONFIG_HOME: "/real/config", TMPDIR: "/tmp", PI_TASK_TMPDIR: "/real/tmp",
    PI_CODING_AGENT_DIR: "/real/agent", NODE_OPTIONS: "--require /real/inject.js", NODE_EXTRA_CA_CERTS: "/real/ca", OPENAI_API_KEY: "secret",
    ANTHROPIC_API_KEY: "secret", PI_WEB_PASSWORD: "secret", PI_PROVIDER: "live", PI_OFFLINE: "1", MCP_CONFIG: "/real/mcp", GITHUB_TOKEN: "secret",
    ACTIONS_RUNTIME_TOKEN: "secret", NPM_CONFIG_USERCONFIG: "/real/.npmrc", HTTPS_PROXY: "https://user:secret@proxy",
    PLAYWRIGHT_EXECUTABLE_PATH: "/real/browser", PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: "/real/browser", E2E_CHECK_GROUP: "touch", E2E_VIEWPORT_WIDTH: "390" };
  const env = ciEnvironment(hostile, "/owned/private", "/owned/job", "run");
  assert.deepEqual(Object.keys(env).sort(), ["PATH", "HOME", "PI_CODING_AGENT_DIR", "TMPDIR", "PI_TASK_TMPDIR", "PLAYWRIGHT_BROWSERS_PATH",
    "NPM_CONFIG_CACHE", "NPM_CONFIG_USERCONFIG", "NPM_CONFIG_GLOBALCONFIG", "CI", "LANG", "NEXT_TELEMETRY_DISABLED", "E2E_SERVER_MODE"].sort());
  assert.equal(env.HOME, "/owned/private/home");
  assert.equal(env.PI_CODING_AGENT_DIR, "/owned/private/agent");
  assert.equal(env.TMPDIR, "/owned/private/tmp");
  assert.equal(env.PI_TASK_TMPDIR, env.TMPDIR);
  assert.equal(env.PLAYWRIGHT_BROWSERS_PATH, "/owned/job/browsers");
  assert.equal(ciEnvironment(hostile, "/owned/other", "/owned/job", "browser").PLAYWRIGHT_BROWSERS_PATH, env.PLAYWRIGHT_BROWSERS_PATH);
  assert.equal(env.E2E_SERVER_MODE, "start");
  assert.equal(env.PI_OFFLINE, undefined);
  assert.equal(ciEnvironment(hostile, "/owned/other", "/owned/job", "subagents").E2E_SERVER_MODE, undefined);
  assert.doesNotMatch(JSON.stringify(env), /secret|\/real\//);
  assert.notEqual(env.TMPDIR, "/tmp");
  assert.throws(() => ciEnvironment({}, "/owned/private", "/owned/job", "tests"), /PATH/);
});

test("cleanup rejects unmarked, outside and symlink roots without touching them", (t) => {
  const f = fixture(t);
  const foreign = join(f.temp, "pi-web-ci-foreign");
  mkdirSync(foreign);
  writeFileSync(join(foreign, "keep"), "untouched");
  assert.throws(() => cleanupCiRoot(foreign, f.temp), /ENOENT|unmarked/);
  assert.throws(() => cleanupCiRoot(f.temp, f.temp), /direct/);
  const link = join(f.temp, "pi-web-ci-link");
  symlinkSync(f.root, link);
  assert.throws(() => cleanupCiRoot(link, f.temp), /non-symlink/);
  rmSync(join(f.root, "browsers"), { recursive: true });
  symlinkSync(foreign, join(f.root, "browsers"));
  assert.throws(() => assertOwnedCiRoot(f.root, f.temp), /non-symlink/);
  assert.equal(readFileSync(join(foreign, "keep"), "utf8"), "untouched");
});

test("dotenv files and symlinks fail closed before a child can run", async (t) => {
  const f = fixture(t);
  for (const name of [".env", ".env.local", ".env.production", ".env.development.local", ".env.test"]) {
    writeFileSync(join(f.cwd, name), "PRIVATE_TOKEN=secret");
    assert.throws(() => assertNoDotenv(f.cwd), /refuses/);
    rmSync(join(f.cwd, name));
  }
  const sensitive = join(f.temp, "keep-dotenv");
  writeFileSync(sensitive, "PRIVATE_TOKEN=secret");
  symlinkSync(sensitive, join(f.cwd, ".env.local"));
  const report = await runCiCommand("fixture", [process.execPath, "-e", "require('fs').writeFileSync('spawned','bad')"], { ...f, output: null });
  assert.equal(report.status, "failure");
  assert.ok(report.seconds >= 0);
  assert.equal(existsSync(join(f.cwd, "spawned")), false);
  assert.equal(readFileSync(sensitive, "utf8"), "PRIVATE_TOKEN=secret");
  assert.doesNotMatch(readFileSync(join(f.cwd, "test-results/ci/fixture.log"), "utf8"), /PRIVATE_TOKEN|secret/);
});

test("real fixture child receives no secrets, uses private directories, records output and cleans up", async (t) => {
  const f = fixture(t);
  const script = "console.log(JSON.stringify({env:process.env,private:require('fs').statSync(process.env.HOME).mode & 511})); console.error('fixture stderr')";
  const report = await runCiCommand("fixture", [process.execPath, "-e", script], { ...f, env: { PATH: process.env.PATH, OPENAI_API_KEY: "secret", NODE_OPTIONS: "--require /bad" }, output: null });
  assert.equal(report.status, "success");
  assert.equal(report.exitCode, 0);
  const log = readFileSync(join(f.cwd, "test-results/ci/fixture.log"), "utf8");
  const received = JSON.parse(log.split("\n").find(line => line.startsWith("{")));
  assert.equal(received.private, 0o700);
  assert.equal(received.env.OPENAI_API_KEY, undefined);
  assert.equal(received.env.NODE_OPTIONS, undefined);
  assert.equal(received.env.PI_TASK_TMPDIR, received.env.TMPDIR);
  assert.equal(existsSync(received.env.HOME), false);
  assert.match(log, /fixture stderr/);
  assert.deepEqual(JSON.parse(readFileSync(join(f.cwd, "test-results/ci/fixture.json"), "utf8")), report);
  assert.deepEqual(readdirSync(f.root).sort(), [".ci-owner", "browsers", "npm-cache"]);
  cleanupCiRoot(f.root, f.temp);
  assert.equal(existsSync(f.root), false);
});

test("nonzero exit and spawn failure retain faithful status and failure timings", async (t) => {
  const f = fixture(t);
  const failed = await runCiCommand("fixture", [process.execPath, "-e", "console.error('fixture failure');process.exit(7)"], { ...f, output: null });
  assert.equal(failed.exitCode, 7);
  assert.equal(failed.status, "failure");
  assert.ok(failed.seconds >= 0);
  const missing = await runCiCommand("missing", [join(f.temp, "no-executable")], { ...f, output: null });
  assert.equal(missing.status, "failure");
  assert.equal(missing.exitCode, 1);
  assert.match(readFileSync(join(f.cwd, "test-results/ci/missing.log"), "utf8"), /ENOENT/);
  assert.deepEqual(readdirSync(f.root).sort(), [".ci-owner", "browsers", "npm-cache"]);
});

test("timeout escalates an owned child and cleans its private tree", async (t) => {
  const f = fixture(t);
  const report = await runCiCommand("fixture", [process.execPath, "-e", "process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)"], { ...f, timeoutMs: 300, output: null });
  assert.equal(report.status, "timed_out");
  assert.equal(report.exitCode, 124);
  const pid = Number(readFileSync(join(f.cwd, "test-results/ci/fixture.log"), "utf8").trim());
  // Under full-suite CPU contention cancellation can precede Node startup.
  // The separate cancellation test waits for readiness and proves escalation.
  if (pid > 0) assert.throws(() => process.kill(pid, 0), /ESRCH/);
  assert.deepEqual(readdirSync(f.root).sort(), [".ci-owner", "browsers", "npm-cache"]);
});

test("SIGTERM cancellation of the wrapper stops only its fixture process group", async (t) => {
  const f = fixture(t);
  const helper = join(dirname(fileURLToPath(import.meta.url)), "ci-test-env.mjs");
  const code = `import { runCiCommand } from ${JSON.stringify(helper)}; await runCiCommand('fixture',[process.execPath,'-e',"process.on('SIGTERM',()=>{});console.log(process.pid);setInterval(()=>{},1000)"],${JSON.stringify(f)});`;
  const wrapper = spawn(process.execPath, ["--input-type=module", "-e", code], { env: { PATH: process.env.PATH }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => { if (wrapper.exitCode === null && wrapper.signalCode === null) wrapper.kill("SIGKILL"); });
  const exit = once(wrapper, "close");
  await once(wrapper.stdout, "data");
  wrapper.kill("SIGTERM");
  await exit;
  const report = JSON.parse(readFileSync(join(f.cwd, "test-results/ci/fixture.json"), "utf8"));
  assert.equal(report.status, "cancelled");
  assert.equal(report.exitCode, 130);
  const pid = Number(readFileSync(join(f.cwd, "test-results/ci/fixture.log"), "utf8").trim());
  assert.ok(pid > 0);
  assert.throws(() => process.kill(pid, 0), /ESRCH/);
  assert.deepEqual(readdirSync(f.root).sort(), [".ci-owner", "browsers", "npm-cache"]);
});

test("workflow boundaries start with env -i, no checkout credentials or shell interpolation", () => {
  const repo = dirname(dirname(fileURLToPath(import.meta.url)));
  for (const [filename, job] of [["ci.yml", "checks"], ["slow-tests.yml", "e2e"]]) {
    const workflow = yaml.load(readFileSync(join(repo, ".github/workflows", filename), "utf8"));
    assert.deepEqual(workflow.permissions, { contents: "read" });
    assert.match(workflow.concurrency.group, /github.event_name/);
    assert.match(workflow.concurrency.group, /pull_request.number.*github.ref/);
    const steps = workflow.jobs[job].steps;
    assert.equal(steps.find(step => step.uses === "actions/checkout@v4").with["persist-credentials"], false);
    for (const step of steps.filter(step => step.run)) {
      assert.doesNotMatch(step.run, /\$\{\{/);
      if (step.run.includes("node lib/ci-test-env.mjs")) assert.match(step.run, /\/usr\/bin\/env -i PATH="\$PATH"/);
    }
    const summary = steps.find(step => step.name === "Summary");
    assert.equal(summary.if, "always()");
    assert.ok(summary.env.CI_BASE_SHA);
    assert.ok(summary.env.CI_PR_HEAD_SHA);
    assert.ok(summary.env.CI_PR_MERGE_SHA);
    const upload = steps.find(step => step.uses === "actions/upload-artifact@v4");
    assert.equal(upload.with["retention-days"], 7);
    assert.match(upload.if, /cancelled/);
    assert.match(upload.with.path, /test-results\/ci\//);
    if (job === "e2e") {
      assert.match(upload.with.path, /test-results\/e2e\//);
      assert.match(upload.with.path, /test-results\/e2e-subagents\//);
      assert.match(steps.find(step => step.id === "subagents").if, /!cancelled\(\).*build.outcome == 'success'/);
    }
  }
});

test("summary keeps SHA roles and each stage outcome distinct and renders branch data safely", () => {
  const env = { HEAD_SHA: "actual", GITHUB_SHA: "event", CI_PR_HEAD_SHA: "head", CI_PR_MERGE_SHA: "merge", CI_BASE_SHA: "base",
    CI_BASE_REF: 'branch-$(touch /not-executed)`|\n<script>', CI_BUILD_OUTCOME: "failure", CI_RUN_OUTCOME: "skipped", CI_SUBAGENTS_OUTCOME: "skipped" };
  const summary = ciSummary("slow", env, { build: { status: "failure", seconds: 1.25, exitCode: 7 }, run: { status: "running", seconds: null, exitCode: null } });
  assert.match(summary, /Checked-out SHA \(git HEAD\).*actual/);
  assert.match(summary, /PR head SHA.*head/);
  assert.match(summary, /PR merge SHA.*merge/);
  assert.match(summary, /PR base SHA.*base/);
  assert.match(summary, /build \| failure \| failure \| 1.25 \| 7/);
  assert.match(summary, /run \(start\) \| skipped \| incomplete \| not recorded/);
  assert.match(summary, /subagents \(dev\) \| skipped \| not recorded/);
  assert.doesNotMatch(summary, /\n<script>|`\|\n/);
});
