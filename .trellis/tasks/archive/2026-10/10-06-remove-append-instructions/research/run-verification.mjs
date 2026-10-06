import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [stage, worktreeArg] = process.argv.slice(2);
if (!["baseline", "candidate"].includes(stage) || !worktreeArg) {
  throw new Error("Usage: node run-verification.mjs baseline|candidate <worktree>");
}
const worktree = resolve(worktreeArg);
const outputDir = join(dirname(fileURLToPath(import.meta.url)), "verification");
mkdirSync(outputDir, { recursive: true });
// A HOME-scoped cache still has the real user's .agents/skills as an ancestor.
// The SDK scans all ancestors, so this explicit disk-backed override separates
// fixtures from those resources without changing or hiding any user files.
const scope = mkdtempSync(join(process.env.PI_VALIDATION_TMP_BASE ?? tmpdir(), `append-retirement-${stage}-`));
const home = join(scope, "home");
const agentDir = join(home, ".pi", "agent");
mkdirSync(agentDir, { recursive: true });
const env = {
  ...process.env,
  HOME: home,
  PI_CODING_AGENT_DIR: agentDir,
  TMPDIR: scope,
  TMP: scope,
  TEMP: scope,
  JITI_FS_CACHE: "false",
};
delete env.PI_WEB_PASSWORD;
// Plugin-update tests inject a mock command runner but intentionally exercise
// online control flow; the ambient offline gate would bypass their mocks.
delete env.PI_OFFLINE;
const gates = [
  ["tsc", "node_modules/.bin/tsc", ["--noEmit", "--incremental", "false"]],
  ["lint", "npm", ["run", "lint", "--", "--format=json"]],
  ["test", "npm", ["test"]],
];
const results = [];
for (const [name, command, args] of gates) {
  console.log(`[${stage}] ${command} ${args.join(" ")}`);
  const started = performance.now();
  const run = spawnSync(command, args, {
    cwd: worktree,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const result = {
    name,
    command: `${command} ${args.join(" ")}`,
    exitCode: run.status,
    durationSeconds: Math.round((performance.now() - started) / 1000),
    ...(run.error ? { error: run.error.message } : {}),
  };
  let log = `${result.command}\nexit=${run.status}\n${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  if (name === "lint" && run.stdout?.includes('[{"filePath"')) {
    const reports = JSON.parse(run.stdout.slice(run.stdout.indexOf('[{"filePath"')));
    result.files = reports.length;
    result.errors = reports.reduce((sum, file) => sum + file.errorCount, 0);
    result.warnings = reports.reduce((sum, file) => sum + file.warningCount, 0);
    const diagnostics = reports.filter((file) => file.messages.length > 0);
    log = `${JSON.stringify({ ...result, diagnostics }, null, 2)}\n${run.stderr ?? ""}`;
  }
  if (name === "test") {
    const text = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
    for (const counter of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
      const match = text.match(new RegExp(`(?:ℹ|#) ${counter} (\\d+)`));
      if (match) result[counter] = Number(match[1]);
    }
  }
  writeFileSync(join(outputDir, `${stage}-${name}.log`), log);
  results.push(result);
  console.log(JSON.stringify(result));
}
const sdkVersion = JSON.parse(readFileSync(join(worktree, "node_modules/@earendil-works/pi-coding-agent/package.json"), "utf8")).version;
const lockHash = createHash("sha256").update(readFileSync(join(worktree, "package-lock.json"))).digest("hex");
const summary = { stage, worktree, node: process.version, sdkVersion, lockHash, results };
writeFileSync(join(outputDir, `${stage}.json`), `${JSON.stringify(summary, null, 2)}\n`);
process.exitCode = results.some((result) => result.exitCode !== 0) ? 1 : 0;
if (process.exitCode === 0) rmSync(scope, { recursive: true, force: true });
else console.error(`Retained owned fixture directory: ${scope}`);
