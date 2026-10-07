// Small, Ubuntu-runner-only CI boundary. Not a product environment policy or an
// E2E harness: the existing commands, fixtures and browser options stay intact.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OWNER = "pi-web-ci-v1";
const COMMANDS = {
  install: ["npm", "ci", "--include=dev"],
  browser: ["node_modules/.bin/playwright", "install", "--with-deps", "chromium"],
  lint: ["npm", "run", "lint"],
  types: [process.execPath, "node_modules/typescript/bin/tsc", "--noEmit"],
  tests: ["npm", "test"],
  build: ["npm", "run", "build"],
  run: [process.execPath, "e2e/run.mjs"],
  subagents: [process.execPath, "e2e/subagents.mjs"],
};

function ownedDirectory(path) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()) {
    throw new Error("CI directory must be an owned, non-symlink directory");
  }
}

export function createCiRoot(temp) {
  ownedDirectory(temp);
  const root = mkdtempSync(join(realpathSync(temp), "pi-web-ci-"));
  writeFileSync(join(root, ".ci-owner"), `${OWNER}\n${root}\n`, { mode: 0o600 });
  for (const name of ["browsers", "npm-cache"]) mkdirSync(join(root, name), { mode: 0o700 });
  return root;
}

export function assertOwnedCiRoot(root, temp) {
  ownedDirectory(temp);
  root = resolve(root);
  if (dirname(root) !== realpathSync(temp) || !/^pi-web-ci-[A-Za-z0-9]+$/.test(root.slice(dirname(root).length + 1))) {
    throw new Error("CI root must be a direct, owned child of the supplied temporary directory");
  }
  ownedDirectory(root);
  const marker = join(root, ".ci-owner");
  if (!lstatSync(marker).isFile() || lstatSync(marker).isSymbolicLink()
    || readFileSync(marker, "utf8") !== `${OWNER}\n${root}\n`) {
    throw new Error("Refusing an unmarked CI root");
  }
  for (const name of ["browsers", "npm-cache"]) ownedDirectory(join(root, name));
  return root;
}

export function cleanupCiRoot(root, temp) {
  rmSync(assertOwnedCiRoot(root, temp), { recursive: true });
}

export function assertNoDotenv(cwd) {
  // Do not delete or read user dotenv. Next loads these independently of env -i.
  if (readdirSync(cwd).some(name => name === ".env" || name.startsWith(".env."))) {
    throw new Error("CI refuses workspace .env/.env.* files; use only the isolated fixtures");
  }
}

export function ciEnvironment(source, privateRoot, runtimeRoot, step) {
  if (!source.PATH) throw new Error("CI requires an explicit tool PATH");
  // Intentionally no spread, credential/proxy passthrough, NODE_OPTIONS, XDG,
  // npm user config, GitHub action tokens or caller PI_* / E2E selectors.
  return {
    PATH: source.PATH,
    HOME: join(privateRoot, "home"),
    PI_CODING_AGENT_DIR: join(privateRoot, "agent"),
    TMPDIR: join(privateRoot, "tmp"),
    PI_TASK_TMPDIR: join(privateRoot, "tmp"),
    PLAYWRIGHT_BROWSERS_PATH: join(runtimeRoot, "browsers"),
    NPM_CONFIG_CACHE: join(runtimeRoot, "npm-cache"),
    NPM_CONFIG_USERCONFIG: join(privateRoot, "home", ".npmrc"),
    NPM_CONFIG_GLOBALCONFIG: join(privateRoot, "home", "global-npmrc"),
    CI: "true",
    LANG: "C.UTF-8",
    NEXT_TELEMETRY_DISABLED: "1",
    // Do not force PI_OFFLINE: existing package/trust tests deliberately exercise
    // preflight callbacks that offline mode bypasses. No inherited PI_* survives.
    ...(step === "run" ? { E2E_SERVER_MODE: "start" } : {}),
  };
}

function signalGroup(child, signal) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

// Test seam permits only harmless Node fixture commands in unit tests. CLI uses
// the fixed command table above; no provider, browser or service is run in tests.
export async function runCiCommand(step, argv, { cwd, root, temp, env = process.env, timeoutMs = 0, output = process.stdout }) {
  if (!/^[a-z]+$/.test(step)) throw new Error("Invalid CI step name");
  root = assertOwnedCiRoot(root, temp);
  const artifacts = join(cwd, "test-results", "ci");
  mkdirSync(artifacts, { recursive: true });
  const log = join(artifacts, `${step}.log`);
  const metadata = join(artifacts, `${step}.json`);
  const started = performance.now();
  const report = { step, status: "running", exitCode: null, seconds: null };
  const save = () => writeFileSync(metadata, `${JSON.stringify(report)}\n`);
  writeFileSync(log, "", { mode: 0o600 });
  save();
  let privateRoot;
  let child;
  let killTimer;
  let timeout;
  let stopped;
  const stop = (reason) => {
    stopped ||= reason;
    signalGroup(child, "SIGTERM");
    killTimer ??= setTimeout(() => signalGroup(child, "SIGKILL"), 1000);
  };
  const interrupt = () => stop("cancelled");
  try {
    assertNoDotenv(cwd);
    privateRoot = mkdtempSync(join(root, `${step}-`));
    for (const name of ["home", "agent", "tmp"]) mkdirSync(join(privateRoot, name), { mode: 0o700 });
    const childEnv = ciEnvironment(env, privateRoot, root, step);
    child = spawn(argv[0], argv.slice(1), { cwd, env: childEnv, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    const capture = (data) => { appendFileSync(log, data); output?.write(data); };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const completion = new Promise((resolveExit, reject) => {
      child.once("error", reject);
      // Also stop descendants retaining stdout/stderr after their parent exits.
      child.once("exit", () => {
        signalGroup(child, "SIGTERM");
        killTimer ??= setTimeout(() => signalGroup(child, "SIGKILL"), 1000);
      });
      child.once("close", (code, signal) => resolveExit({ code, signal }));
    });
    if (timeoutMs) timeout = setTimeout(() => stop("timed_out"), timeoutMs);
    const { code, signal } = await completion;
    report.exitCode = stopped === "timed_out" ? 124 : stopped === "cancelled" ? 130 : code ?? (signal ? 128 : 1);
    report.status = stopped || (report.exitCode === 0 ? "success" : "failure");
  } catch (error) {
    report.status = "failure";
    report.exitCode = 1;
    appendFileSync(log, `${error.message}\n`);
    output?.write(`${error.message}\n`);
  } finally {
    clearTimeout(timeout);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    // SIGKILL only this command's process group, including silent descendants.
    if (child) signalGroup(child, "SIGKILL");
    clearTimeout(killTimer);
    if (privateRoot) rmSync(privateRoot, { recursive: true });
    report.seconds = Number(((performance.now() - started) / 1000).toFixed(3));
    save();
  }
  return report;
}

function cell(value) {
  return String(value || "n/a").replace(/[\r\n|`<>]/g, ch => ({ "\r": " ", "\n": " ", "|": "\\|", "`": "'", "<": "&lt;", ">": "&gt;" })[ch]);
}

export function ciSummary(suite, env, reports) {
  const steps = suite === "slow" ? ["install", "browser", "build", "run", "subagents"] : ["install", "lint", "types", "tests"];
  const fields = {
    Event: env.GITHUB_EVENT_NAME,
    "Checked-out SHA (git HEAD)": env.HEAD_SHA || "unknown",
    "Event SHA (not necessarily PR head)": env.GITHUB_SHA,
    "PR head SHA": env.CI_PR_HEAD_SHA,
    "PR merge SHA (event payload)": env.CI_PR_MERGE_SHA,
    "PR base SHA": env.CI_BASE_SHA,
    "PR base ref": env.CI_BASE_REF,
    "Event ref": env.GITHUB_REF,
    "Run URL": `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    Attempt: env.GITHUB_RUN_ATTEMPT,
    "Job status": env.CI_JOB_STATUS,
  };
  const lines = [`### ${suite === "slow" ? "Slow tests (e2e)" : "Fast checks"}`, "", "| Field | Value |", "| --- | --- |"];
  for (const [name, value] of Object.entries(fields)) lines.push(`| ${name} | \`${cell(value)}\` |`);
  lines.push("", "| Command stage | Actions outcome | Command status | Seconds | Exit code |", "| --- | --- | --- | --- | --- |");
  for (const step of steps) {
    const report = reports[step];
    const outcome = env[`CI_${step.toUpperCase()}_OUTCOME`] || "not executed";
    const status = report?.status === "running" ? "incomplete" : report?.status || "not recorded";
    lines.push(`| ${step}${step === "run" ? " (start)" : step === "subagents" ? " (dev)" : ""} | ${cell(outcome)} | ${cell(status)} | ${report?.seconds ?? "not recorded"} | ${report?.exitCode ?? "not recorded"} |`);
  }
  lines.push("", "Failure timings are retained. Hard termination may leave an incomplete record or prevent summary/artifact steps; skipped, cancelled, incomplete and absent evidence never mean success.",
    "A PR normally tests a synthetic merge: verify actual checkout, current head and current base identities before delivery. Old SHA greens do not apply to a new candidate.",
    suite === "slow" ? "Only run.mjs (start) and subagents.mjs (dev) are covered; other harnesses remain deferred." : "The full npm test collection is preserved. Browser evidence is in the independent Slow tests workflow.");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const [step, root, temp] = process.argv.slice(2);
  if (step === "prepare") { console.log(createCiRoot(root)); return; }
  if (step === "cleanup") { cleanupCiRoot(root, temp); return; }
  if (step === "summary") {
    const reports = {};
    for (const name of Object.keys(COMMANDS)) {
      const path = join(process.cwd(), "test-results", "ci", `${name}.json`);
      if (existsSync(path)) reports[name] = JSON.parse(readFileSync(path, "utf8"));
    }
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, ciSummary(root, process.env, reports));
    return;
  }
  if (!Object.hasOwn(COMMANDS, step)) throw new Error("Unknown CI command");
  const report = await runCiCommand(step, COMMANDS[step], { cwd: process.cwd(), root, temp });
  process.exitCode = report.exitCode;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
