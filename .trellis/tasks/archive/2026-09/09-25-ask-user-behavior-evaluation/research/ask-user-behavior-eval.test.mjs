import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";
import {
  ASK_USER_CURRENT_METADATA_PATH,
  assertIsolatedSessionDir,
  assertSessionFileIsolated,
  buildReport,
  buildTrialMatrix,
  classifyOutcome,
  collectSecretValues,
  createRunRoot,
  DEFAULT_OLD_REV,
  extractAskUserMetadata,
  finalizeRunRoot,
  gitMetadataLoader,
  MAX_MODEL_CALLS,
  MetadataExtractionError,
  REDACTED,
  redactText,
  redactValue,
  renderReportMarkdown,
  REPO_ROOT,
  runBoundedTrialLoop,
  runEvaluation,
  runPromptWithDeadline,
  SessionIsolationError,
  writeReport,
} from "./ask-user-behavior-eval.mjs";

const PREVIOUS = { promptSnippet: "ask_user: previous snippet", promptGuidelines: ["previous guideline"] };
const CURRENT = { promptSnippet: "ask_user: current snippet", promptGuidelines: ["current guideline"] };

function trial(overrides = {}) {
  return {
    scenarioId: "blocking-fact",
    guidanceVersion: "previous",
    trial: 1,
    outcome: {
      kind: "ask_user",
      containsQuestionMark: false,
      proseText: null,
      askUserCalls: [{ toolCallId: "c1", toolName: "ask_user", args: {}, isError: false }],
      toolCalls: [{ toolCallId: "c1", toolName: "ask_user", args: {}, isError: false }],
    },
    error: null,
    assistantErrorMessages: [],
    retryAttempts: 0,
    durationMs: 42,
    sessionFile: "/tmp/pi-ask-user-eval/sessions/s.jsonl",
    systemPromptSha256: "abc",
    activeToolNames: ["ask_user"],
    cleanup: "removed",
    ...overrides,
  };
}

function reportInput(trials, runRoot) {
  return {
    oldRev: DEFAULT_OLD_REV,
    trialsPerSide: 3,
    timeoutMs: 180_000,
    abortSettleMs: 15_000,
    thinkingLevel: "minimal",
    provider: "test-provider",
    modelId: "test-model",
    agentDir: "/home/user/.pi/agent",
    metadata: { previous: PREVIOUS, current: CURRENT },
    matrix: buildTrialMatrix(),
    trials,
    setupError: null,
    halted: null,
    cleanup: { runRoot, status: "removed", note: null },
  };
}

test("the matrix is capped at 24 planned turns", () => {
  assert.equal(MAX_MODEL_CALLS, 24);
  assert.equal(buildTrialMatrix().length, 24);
  assert.throws(() => buildTrialMatrix(4), /24/);
});

test("extraction reads ask_user metadata, matches the live tool, and rejects ambiguity", async () => {
  assert.deepEqual(extractAskUserMetadata('defineTool({ name: "ask_user", promptSnippet: "s", promptGuidelines: ["g1", "g2"] });'), {
    promptSnippet: "s",
    promptGuidelines: ["g1", "g2"],
  });
  assert.throws(() => extractAskUserMetadata("export const x = 1;"), MetadataExtractionError);
  assert.throws(
    () => extractAskUserMetadata('defineTool({ name: "ask_user", promptSnippet: SNIPPET, promptGuidelines: [] });'),
    MetadataExtractionError,
  );
  assert.throws(
    () => extractAskUserMetadata('defineTool({ name: "ask_user", promptSnippet: "a", promptSnippet: "b", promptGuidelines: [] });'),
    MetadataExtractionError,
  );
  assert.throws(
    () => extractAskUserMetadata('defineTool({ name: "ask_user", promptSnippet: "a", promptGuidelines: ["b" },'),
    MetadataExtractionError,
  );

  const { previous, current } = gitMetadataLoader(REPO_ROOT)(DEFAULT_OLD_REV);
  assert.equal(ASK_USER_CURRENT_METADATA_PATH, "lib/ask-user/portable/tool.ts");
  assert.notEqual(previous.promptSnippet, current.promptSnippet);
  const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
  const { createAskUserToolDefinition } = await jiti.import(join(REPO_ROOT, "lib/ask-user/tool.ts"));
  const live = createAskUserToolDefinition({ open: async () => ({ ask: null }) });
  const extracted = extractAskUserMetadata(readFileSync(join(REPO_ROOT, ASK_USER_CURRENT_METADATA_PATH), "utf8"));
  assert.equal(extracted.promptSnippet, live.promptSnippet);
  assert.deepEqual(extracted.promptGuidelines, [...live.promptGuidelines]);
});

test("session isolation rejects the user root and accepts a temp root", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-user-sessions-"));
  const run = createRunRoot();
  try {
    const userSessions = join(root, "sessions");
    mkdirSync(userSessions, { recursive: true });
    assert.throws(() => assertIsolatedSessionDir(userSessions, userSessions), SessionIsolationError);
    assert.throws(() => assertIsolatedSessionDir(join(userSessions, "cwd"), userSessions), SessionIsolationError);
    const sessionDir = join(run, "sessions");
    mkdirSync(sessionDir, { recursive: true });
    assert.doesNotThrow(() => assertIsolatedSessionDir(sessionDir, userSessions));
    assert.throws(() => assertSessionFileIsolated(null, sessionDir, userSessions), SessionIsolationError);
    assert.throws(
      () => assertSessionFileIsolated(join(userSessions, "leak.jsonl"), sessionDir, userSessions),
      SessionIsolationError,
    );
    assert.doesNotThrow(() => assertSessionFileIsolated(join(sessionDir, "trial.jsonl"), sessionDir, userSessions));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(run, { recursive: true, force: true });
  }
});

test("secrets are collected and redacted from report-shaped values", () => {
  assert.deepEqual(collectSecretValues({ OPENAI_API_KEY: "sk-env-secret-value", HARMLESS: "keep-me-please" }), [
    "sk-env-secret-value",
  ]);
  assert.equal(redactText("key sk-abcdefghijklmnop", []), `key ${REDACTED}`);
  const value = redactValue({ a: { token: "topsecretvalue" }, b: ["topsecretvalue"] }, ["topsecretvalue"]);
  assert.equal(value.a.token, REDACTED);
  assert.equal(value.b[0], REDACTED);
});

test("outcomes classify ask_user over prose over neither", () => {
  const ask = classifyOutcome({
    toolCalls: [{ toolCallId: "1", toolName: "ask_user", args: {}, isError: false }],
    assistantTexts: ["Which database?"],
  });
  assert.equal(ask.kind, "ask_user");
  assert.equal(ask.containsQuestionMark, true);
  assert.equal(classifyOutcome({ toolCalls: [], assistantTexts: ["later"] }).kind, "prose");
  assert.equal(classifyOutcome({ toolCalls: [], assistantTexts: ["", "  "] }).kind, "neither");
});

test("an abort that never settles is unresolved", async () => {
  const result = await runPromptWithDeadline({
    prompt: new Promise(() => undefined),
    abort: () => new Promise(() => undefined),
    timeoutMs: 1,
    abortSettleMs: 1,
    wait: async () => false,
  });
  assert.equal(result.status, "unresolved_abort");
});

test("an unresolved abort stops the loop and keeps the run root", async () => {
  const started = [];
  const loop = await runBoundedTrialLoop(buildTrialMatrix(1), async (plan) => {
    started.push(plan.trial);
    return { error: { kind: "unresolved_abort" } };
  });
  assert.equal(loop.halted, true);
  assert.equal(started.length, 1);
  const root = createRunRoot();
  try {
    const cleanup = finalizeRunRoot({ keepTemp: false, trials: loop.results, runRoot: root });
    assert.equal(cleanup.status, "kept");
    assert.equal(existsSync(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an over-budget run starts no trial and creates no run root", async () => {
  const outDir = createRunRoot();
  let started = 0;
  try {
    const result = await runEvaluation({
      repoRoot: REPO_ROOT,
      outDir,
      oldRev: "unused",
      trialsPerSide: 4,
      timeoutMs: 1,
      keepTemp: false,
      loadMetadata: () => ({ previous: PREVIOUS, current: CURRENT }),
      collectSecrets: () => [],
      executeTrial: async () => {
        started += 1;
        throw new Error("model trial must not start");
      },
    });
    assert.equal(started, 0);
    assert.equal(result.report.trials.length, 0);
    assert.equal(result.report.setupError?.kind, "harness_error");
    assert.equal(result.report.cleanup.runRoot, null);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("counts exclude errored trials and the written report is redacted", () => {
  const outDir = createRunRoot();
  try {
    const secret = "sk-secret-key-abcdefghijklmnop";
    const report = buildReport(
      reportInput(
        [trial(), trial({ trial: 2, outcome: null, error: { kind: "provider_error", message: `bad ${secret}` } })],
        outDir,
      ),
    );
    assert.deepEqual(report.counts.byOutcome, { ask_user: 1, prose: 0, neither: 0 });
    assert.deepEqual(report.counts.byErrorKind, { provider_error: 1 });
    assert.match(renderReportMarkdown(report), /not a significance test/);
    const paths = writeReport(outDir, redactValue(report, [secret]));
    assert.ok(!readFileSync(paths.json, "utf8").includes(secret));
    assert.match(readFileSync(paths.markdown, "utf8"), /\[REDACTED\]/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
