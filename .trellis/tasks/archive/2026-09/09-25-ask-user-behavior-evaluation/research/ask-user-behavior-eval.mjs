#!/usr/bin/env node
/**
 * ask_user behavior evaluation runner (research-only).
 *
 * Compares one fixed scenario set against two versions of the ask_user prompt
 * metadata (a previous git revision vs the checked-out worktree) while holding
 * the model, thinking level, tool set and base system prompt identical. It never
 * touches the live pi-web server, writes every trial session under a throwaway
 * temp root, refuses more than 24 planned model turns, and redacts secrets
 * before writing a report.
 *
 *   node <this-file>              # plan only (no model calls)
 *   node <this-file> --self-check # offline proof that only metadata differs
 *   node <this-file> --execute    # run at most 24 turns and write the report
 *
 * The file lives under the task's research/ and finds the repository root by
 * walking up to package.json, so it keeps working after the task is archived.
 * It is a measurement harness, not product code: it does not assert model
 * behavior, only records which turns called ask_user, answered in prose, or did
 * neither.
 */

import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import ts from "typescript";
import {
  createAgentSessionFromServices,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
  SettingsManager,
  VERSION as SDK_VERSION,
} from "@earendil-works/pi-coding-agent";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export function findRepoRoot(start) {
  let directory = start;
  for (;;) {
    if (existsSync(join(directory, "package.json"))) return directory;
    const parent = dirname(directory);
    if (parent === directory) throw new Error("could not find the repository root (no package.json above this file)");
    directory = parent;
  }
}

export const REPO_ROOT = findRepoRoot(dirname(SCRIPT_PATH));
export const ASK_USER_TOOL_REPO_PATH = "lib/ask-user/tool.ts";
// The earlier revision defines the tool in tool.ts; the local package moves
// the live definition into portable/tool.ts and leaves tool.ts as a re-export.
export const ASK_USER_CURRENT_METADATA_PATH = existsSync(join(REPO_ROOT, "lib/ask-user/portable/tool.ts"))
  ? "lib/ask-user/portable/tool.ts"
  : ASK_USER_TOOL_REPO_PATH;
export const DEFAULT_OLD_REV = "922f7e1";
export const MAX_MODEL_CALLS = 24;
export const DEFAULT_ABORT_SETTLE_MS = 15_000;
export const GUIDANCE_VERSIONS = ["previous", "current"];

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
let toolModulePromise = null;
function loadToolModule() {
  toolModulePromise ??= jiti.import(join(REPO_ROOT, ASK_USER_TOOL_REPO_PATH));
  return toolModulePromise;
}

// ---------------------------------------------------------------------------
// Fixed scenario set (mirrors the recorded invocation-guidance validation)
// ---------------------------------------------------------------------------

export const SCENARIOS = [
  {
    id: "blocking-fact",
    askUserAvailable: true,
    prompt: "Update the migration for our production database, but I have not told you which database we use.",
    expected: "ask_user",
  },
  {
    id: "blocking-scope",
    askUserAvailable: true,
    prompt: "Export this report. I need to choose CSV or JSON before you implement it.",
    expected: "ask_user",
  },
  {
    id: "nonblocking",
    askUserAvailable: true,
    prompt: "The export works now. Anything else I could consider later?",
    expected: "prose",
  },
  {
    id: "unavailable",
    askUserAvailable: false,
    prompt: "Update the migration for our production database, but I have not told you which database we use.",
    expected: "prose",
  },
];

export function scenarioById(id) {
  const scenario = SCENARIOS.find((candidate) => candidate.id === id);
  if (scenario === undefined) throw new Error(`unknown evaluation scenario: ${id}`);
  return scenario;
}

export function buildTrialMatrix(trialsPerSide = 3) {
  assertModelCallBudget(SCENARIOS.length * GUIDANCE_VERSIONS.length * trialsPerSide);
  const matrix = [];
  for (const scenario of SCENARIOS) {
    for (const guidanceVersion of GUIDANCE_VERSIONS) {
      for (let trial = 1; trial <= trialsPerSide; trial += 1) {
        matrix.push({ scenarioId: scenario.id, guidanceVersion, trial });
      }
    }
  }
  return matrix;
}

function budgetError(plannedCalls) {
  const error = new Error(
    `refusing to plan ${plannedCalls} turns; the approved maximum is ${MAX_MODEL_CALLS} ` +
      "(4 scenarios × 2 versions × 3 trials; SDK retries may add requests)",
  );
  error.name = "ModelCallBudgetError";
  return error;
}

export function assertModelCallBudget(plannedCalls) {
  if (!Number.isInteger(plannedCalls) || plannedCalls < 1 || plannedCalls > MAX_MODEL_CALLS) {
    throw budgetError(plannedCalls);
  }
}

// ---------------------------------------------------------------------------
// Metadata extraction (only promptSnippet / promptGuidelines may differ)
// ---------------------------------------------------------------------------

export class MetadataExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = "MetadataExtractionError";
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return String(value);
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function propertyInitializer(object, name) {
  const matches = object.properties.filter(
    (property) =>
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
      property.name.text === name,
  );
  if (matches.length > 1) throw new MetadataExtractionError(`duplicate ${name} property`);
  return matches[0]?.initializer;
}

function readStringLiteral(node, label) {
  if (node !== undefined && ts.isStringLiteralLike(node)) return node.text;
  throw new MetadataExtractionError(`${label} must be a plain string literal`);
}

/** Extract the ask_user snippet and guidelines from one `tool.ts` source string. */
export function extractAskUserMetadata(source) {
  const sourceFile = ts.createSourceFile("tool.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new MetadataExtractionError("ask_user source has a TypeScript syntax error");
  }
  const objects = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && calleeName(node.expression) === "defineTool") {
      const argument = node.arguments[0];
      if (argument !== undefined && ts.isObjectLiteralExpression(argument)) {
        const name = propertyInitializer(argument, "name");
        if (name !== undefined && ts.isStringLiteralLike(name) && name.text === "ask_user") {
          objects.push(argument);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (objects.length === 0) throw new MetadataExtractionError("source does not define the ask_user tool");
  if (objects.length > 1) throw new MetadataExtractionError("source defines more than one ask_user tool");
  const object = objects[0];
  const guidelines = propertyInitializer(object, "promptGuidelines");
  if (guidelines === undefined || !ts.isArrayLiteralExpression(guidelines)) {
    throw new MetadataExtractionError("ask_user promptGuidelines must be an array literal");
  }
  return {
    promptSnippet: readStringLiteral(propertyInitializer(object, "promptSnippet"), "promptSnippet"),
    promptGuidelines: guidelines.elements.map((element, index) =>
      readStringLiteral(element, `promptGuidelines[${index.toString()}]`),
    ),
  };
}

/** Return `{ previous, current }` metadata for one old revision vs the worktree. */
export function gitMetadataLoader(repoRoot) {
  return (oldRev) => ({
    previous: extractAskUserMetadata(
      execFileSync("git", ["show", `${oldRev}:${ASK_USER_TOOL_REPO_PATH}`], {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      }),
    ),
    current: extractAskUserMetadata(readFileSync(join(repoRoot, ASK_USER_CURRENT_METADATA_PATH), "utf8")),
  });
}

// ---------------------------------------------------------------------------
// Filesystem isolation
// ---------------------------------------------------------------------------

export class SessionIsolationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SessionIsolationError";
  }
}

function canonicalize(path) {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

/** True when `child` is strictly below `parent`. */
export function isPathInside(child, parent) {
  const relativePath = relative(canonicalize(parent), canonicalize(child));
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

export function assertIsolatedSessionDir(sessionDir, userSessionsDir) {
  const directory = canonicalize(sessionDir);
  const root = canonicalize(userSessionsDir);
  if (directory === root || isPathInside(directory, root)) {
    throw new SessionIsolationError("refusing to write evaluation sessions inside the user session root");
  }
}

export function assertSessionFileIsolated(sessionFile, sessionDir, userSessionsDir) {
  if (typeof sessionFile !== "string" || sessionFile.length === 0) {
    throw new SessionIsolationError("evaluation session did not create a session file");
  }
  if (!isPathInside(sessionFile, sessionDir)) {
    throw new SessionIsolationError("evaluation session file is outside the temporary session directory");
  }
  const file = canonicalize(sessionFile);
  const root = canonicalize(userSessionsDir);
  if (file === root || isPathInside(file, root)) {
    throw new SessionIsolationError("evaluation session file resolved inside the user session root");
  }
}

export function createRunRoot(prefix = "pi-ask-user-eval-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeRunRoot(root) {
  try {
    rmSync(root, { recursive: true, force: true });
    return { removed: true };
  } catch (error) {
    return { removed: false, error: errorMessage(error) };
  }
}

export function writePrivateFileSync(path, contents) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `.${basename(path)}-${randomUUID()}.tmp`);
  writeFileSync(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // Best effort; rethrow the rename failure below.
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

export const REDACTED = "[REDACTED]";
const SECRET_ENV_NAME = /(API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTHORIZATION)/i;
const SECRET_FIELD = /^(key|access|refresh|token|secret|password|passwd|apiKey|api_key|authorization)$/i;
const TOKEN_PATTERNS = [
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{8,}/g,
  /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /(["']?(?:api[_-]?key|token|secret|password|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,
];

export function collectSecretValues(env, minLength = 8) {
  const values = [];
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string" || value.length < minLength || !SECRET_ENV_NAME.test(name)) continue;
    values.push(value);
  }
  return values.sort((left, right) => right.length - left.length);
}

export function collectCredentialSecretValues(value, minLength = 8) {
  const values = [];
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, entry] of Object.entries(node)) {
      if (typeof entry === "string" && entry.length >= minLength && SECRET_FIELD.test(key)) values.push(entry);
      else walk(entry);
    }
  };
  walk(value);
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

export function collectSecretsFromAuthFile(path) {
  try {
    return collectCredentialSecretValues(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return [];
  }
}

export function collectEvaluationSecrets(input) {
  const values = [
    ...collectSecretValues(input.env),
    ...(input.authFile ? collectSecretsFromAuthFile(input.authFile) : []),
  ];
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

export function redactText(text, secrets) {
  let output = text;
  for (const secret of secrets) {
    if (secret.length > 0) output = output.split(secret).join(REDACTED);
  }
  for (const pattern of TOKEN_PATTERNS) {
    output = output.replace(pattern, (match, group) => (typeof group === "string" ? `${group}${REDACTED}` : REDACTED));
  }
  return output;
}

export function redactValue(value, secrets) {
  if (typeof value === "string") return redactText(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (isRecord(value)) {
    const output = {};
    for (const [key, entry] of Object.entries(value)) output[key] = redactValue(entry, secrets);
    return output;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Outcome classification
// ---------------------------------------------------------------------------

export const PROSE_REPORT_MAX_LENGTH = 4000;

export function truncateProse(text) {
  return text.length <= PROSE_REPORT_MAX_LENGTH ? text : `${text.slice(0, PROSE_REPORT_MAX_LENGTH)}\n…[truncated]`;
}

function argsFromBlock(block) {
  if (isRecord(block.input)) return block.input;
  if (isRecord(block.arguments)) return block.arguments;
  if (isRecord(block.args)) return block.args;
  if (typeof block.arguments === "string") return { raw: block.arguments };
  if (typeof block.input === "string") return { raw: block.input };
  return {};
}

/** Tool calls embedded in an assistant message, including ones that never executed. */
export function toolCallsFromAssistantMessage(message) {
  if (!Array.isArray(message.content)) return [];
  const calls = [];
  for (const block of message.content) {
    if (!isRecord(block) || block.type !== "toolCall") continue;
    const toolName = typeof block.toolName === "string" ? block.toolName : typeof block.name === "string" ? block.name : "";
    if (toolName.length === 0) continue;
    const toolCallId =
      typeof block.toolCallId === "string" ? block.toolCallId : typeof block.id === "string" ? block.id : "";
    calls.push({ toolCallId, toolName, args: argsFromBlock(block), isError: block.isError === true });
  }
  return calls;
}

export function mergeObservedToolCall(calls, next) {
  const index = next.toolCallId.length > 0 ? calls.findIndex((call) => call.toolCallId === next.toolCallId) : -1;
  if (index === -1) {
    calls.push(next);
    return;
  }
  const current = calls[index];
  calls[index] = {
    toolCallId: current.toolCallId,
    toolName: current.toolName.length > 0 ? current.toolName : next.toolName,
    args: isRecord(current.args) && Object.keys(current.args).length > 0 ? current.args : next.args,
    isError: current.isError || next.isError,
  };
}

function lastNonEmpty(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== undefined && value.trim().length > 0) return value.trim();
  }
  return null;
}

export function classifyOutcome(input) {
  const askUserCalls = input.toolCalls.filter((call) => call.toolName === "ask_user");
  const proseText = lastNonEmpty(input.assistantTexts);
  const kind = askUserCalls.length > 0 ? "ask_user" : proseText === null ? "neither" : "prose";
  return {
    kind,
    containsQuestionMark: proseText !== null && proseText.includes("?"),
    proseText: proseText === null ? null : truncateProse(proseText),
    askUserCalls,
    toolCalls: input.toolCalls,
  };
}

// ---------------------------------------------------------------------------
// Trial error taxonomy and bounded prompt execution
// ---------------------------------------------------------------------------

export class HarnessTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`trial did not finish within ${timeoutMs}ms`);
    this.name = "HarnessTimeoutError";
  }
}

export class EnvironmentConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "EnvironmentConfigurationError";
  }
}

export class UnresolvedAbortError extends Error {
  constructor(timeoutMs) {
    super(`trial timed out after ${timeoutMs}ms and abort did not settle; no later trial will run`);
    this.name = "UnresolvedAbortError";
  }
}

const ENVIRONMENT_PATTERNS = [
  /no api key/i,
  /not authenticated/i,
  /unauthoriz/i,
  /authentication/i,
  /credential/i,
  /no models available/i,
  /model .*not found/i,
  /unknown model/i,
  /provider .*not (?:found|configured)/i,
  /\bENOENT\b/,
  /\bEACCES\b/,
];

export function classifyTrialError(caught, phase) {
  const message = errorMessage(caught);
  const name = caught instanceof Error ? caught.name : undefined;
  if (name === "HarnessTimeoutError") return { kind: "harness_timeout", message };
  if (name === "UnresolvedAbortError") return { kind: "unresolved_abort", message };
  if (caught instanceof EnvironmentConfigurationError) return { kind: "environment_error", message };
  if (name === "SessionIsolationError" || name === "MetadataExtractionError" || name === "ModelCallBudgetError") {
    return { kind: "harness_error", message };
  }
  if (phase === "setup") return { kind: "environment_error", message };
  if (ENVIRONMENT_PATTERNS.some((pattern) => pattern.test(message))) return { kind: "environment_error", message };
  return { kind: "provider_error", message };
}

function track(promise) {
  let state = "pending";
  let failure;
  const done = promise.then(
    () => {
      state = "fulfilled";
    },
    (error) => {
      state = "rejected";
      failure = error;
    },
  );
  return { done, state: () => state, failure: () => failure };
}

export function waitForDeadline(promise, timeoutMs) {
  return new Promise((resolveWait) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveWait(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    promise.then(() => finish(true), () => finish(true));
  });
}

/**
 * Run `prompt` until it settles or the deadline passes. On timeout, abort and
 * wait for both the abort and the prompt; a deadline that expires first is an
 * unresolved abort and the caller must not start another trial.
 */
export async function runPromptWithDeadline(input) {
  const wait = input.wait ?? waitForDeadline;
  const tracked = track(input.prompt);
  if (await wait(tracked.done, input.timeoutMs)) {
    if (tracked.state() === "rejected") return { status: "failed", error: tracked.failure() };
    if (tracked.state() === "fulfilled") return { status: "completed" };
    return { status: "unresolved_abort" };
  }
  const abortTracked = track(Promise.resolve().then(() => input.abort()));
  const settled = await wait(Promise.all([tracked.done, abortTracked.done]), input.abortSettleMs);
  if (!settled || tracked.state() === "pending" || abortTracked.state() === "pending") {
    return { status: "unresolved_abort" };
  }
  return { status: "timed_out" };
}

// ---------------------------------------------------------------------------
// Session runtime and one trial
// ---------------------------------------------------------------------------

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function buildVersionedAskUserTool(metadata) {
  const { createAskUserToolDefinition } = await loadToolModule();
  const base = createAskUserToolDefinition({
    open: async (input) => ({
      ask: { askId: `eval-${randomUUID()}`, askedAt: new Date().toISOString(), questions: input.questions },
    }),
  });
  return {
    ...base,
    promptSnippet: metadata.promptSnippet,
    promptGuidelines: [...metadata.promptGuidelines],
  };
}

/** With only ask_user metadata normalized away, two prompts should match. */
export function normalizeMetadataInPrompt(prompt, metadata) {
  let normalized = prompt.split(metadata.promptSnippet.trim()).join("<ASK_USER_SNIPPET>");
  metadata.promptGuidelines.forEach((guideline, index) => {
    normalized = normalized.split(guideline.trim()).join(`<ASK_USER_GUIDELINE_${index.toString()}>`);
  });
  return normalized;
}

export async function createEvaluationRuntime(runRoot, agentDir = getAgentDir()) {
  const cwd = join(runRoot, "cwd");
  const sessionDir = join(runRoot, "sessions");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  assertIsolatedSessionDir(sessionDir, join(agentDir, "sessions"));
  const settingsManager = SettingsManager.create(cwd, agentDir);
  const services = await createAgentSessionServices({
    cwd,
    agentDir,
    settingsManager,
    resourceLoaderOptions: {
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    },
  });
  return { services, agentDir, runRoot, sessionDir, cwd };
}

function resolveModel(runtime, provider, modelId) {
  const settings = runtime.services.settingsManager;
  const effectiveProvider = provider ?? settings.getDefaultProvider();
  const effectiveModelId = modelId ?? settings.getDefaultModel();
  if (effectiveProvider === undefined || effectiveModelId === undefined) {
    throw new EnvironmentConfigurationError("no provider/model given and no default configured in settings.json");
  }
  const model = runtime.services.modelRuntime.getModel(effectiveProvider, effectiveModelId);
  if (model === undefined) {
    throw new EnvironmentConfigurationError(`model ${effectiveProvider}/${effectiveModelId} is not available`);
  }
  if (!runtime.services.modelRuntime.hasConfiguredAuth(effectiveProvider)) {
    throw new EnvironmentConfigurationError(`no configured credentials for provider ${effectiveProvider}`);
  }
  return model;
}

function activeToolNames(session) {
  return [...session.getActiveToolNames()].sort();
}

function toolsMatch(actual, expected) {
  return [...actual].sort().join("\n") === [...expected].sort().join("\n");
}

function openIsolatedSession(runtime) {
  const sessionManager = SessionManager.create(runtime.cwd, runtime.sessionDir);
  assertSessionFileIsolated(sessionManager.getSessionFile(), runtime.sessionDir, join(runtime.agentDir, "sessions"));
  return sessionManager;
}

const retainedSessions = new Set();
function retainUntilPromptSettles(session, prompt) {
  retainedSessions.add(session);
  prompt.then(
    () => undefined,
    () => undefined,
  ).finally(() => {
    retainedSessions.delete(session);
    try {
      session.dispose();
    } catch {
      // Late disposal is best-effort; the run already failed closed.
    }
  });
}

function assistantTextFromMessage(message) {
  if (!Array.isArray(message.content)) return null;
  const parts = [];
  for (const block of message.content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  const text = parts.join("\n").trim();
  return text.length > 0 ? text : null;
}

export async function runTrial(input) {
  const startedAt = Date.now();
  const { runtime, scenario, guidanceVersion, trial, metadata, model, thinkingLevel, timeoutMs, abortSettleMs } = input;
  const sessionManager = openIsolatedSession(runtime);
  const sessionFile = sessionManager.getSessionFile() ?? null;
  const toolCalls = [];
  const callsById = new Map();
  const assistantTexts = [];
  const assistantErrorMessages = [];
  let retryAttempts = 0;
  let session = null;
  let unsubscribe = null;
  let systemPromptSha256 = null;
  let observedTools = [];
  let error = null;
  let retainLiveSession = false;

  try {
    const customTools = scenario.askUserAvailable ? [await buildVersionedAskUserTool(metadata)] : [];
    const created = await createAgentSessionFromServices({
      services: runtime.services,
      sessionManager,
      model,
      thinkingLevel,
      noTools: "builtin",
      customTools,
    });
    const activeSession = created.session;
    session = activeSession;
    assertSessionFileIsolated(sessionManager.getSessionFile(), runtime.sessionDir, join(runtime.agentDir, "sessions"));
    systemPromptSha256 = sha256(activeSession.systemPrompt);
    observedTools = activeToolNames(activeSession);
    unsubscribe = activeSession.subscribe((event) => {
      if (event.type === "tool_execution_start") {
        const call = {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          isError: false,
        };
        callsById.set(event.toolCallId, call);
        mergeObservedToolCall(toolCalls, call);
        return;
      }
      if (event.type === "tool_execution_end") {
        const call = callsById.get(event.toolCallId);
        if (call !== undefined) call.isError = event.isError;
        mergeObservedToolCall(toolCalls, {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: call?.args ?? {},
          isError: event.isError,
        });
        return;
      }
      if (event.type === "message_end") {
        const message = event.message;
        if (isRecord(message) && message.role === "assistant") {
          const text = assistantTextFromMessage(message);
          if (text !== null) assistantTexts.push(text);
          for (const call of toolCallsFromAssistantMessage(message)) {
            mergeObservedToolCall(toolCalls, call);
            if (call.toolCallId.length > 0 && !callsById.has(call.toolCallId)) callsById.set(call.toolCallId, call);
          }
          if (message.stopReason === "error" && typeof message.errorMessage === "string") {
            assistantErrorMessages.push(message.errorMessage);
          }
        }
        return;
      }
      if (event.type === "auto_retry_start") retryAttempts += 1;
    });

    const promptPromise = activeSession.prompt(scenario.prompt);
    const guard = await runPromptWithDeadline({
      prompt: promptPromise,
      abort: () => activeSession.abort(),
      timeoutMs,
      abortSettleMs,
    });
    if (guard.status === "unresolved_abort") {
      retainLiveSession = true;
      error = classifyTrialError(new UnresolvedAbortError(timeoutMs), "prompt");
      retainUntilPromptSettles(activeSession, promptPromise);
    } else if (guard.status === "timed_out") {
      error = classifyTrialError(new HarnessTimeoutError(timeoutMs), "prompt");
    } else if (guard.status === "failed") {
      error = classifyTrialError(guard.error, "prompt");
    }
  } catch (caught) {
    error = classifyTrialError(caught, session === null ? "setup" : "prompt");
  } finally {
    unsubscribe?.();
    if (!retainLiveSession) {
      try {
        session?.dispose();
      } catch {
        // Disposal failures do not change the recorded observation.
      }
    }
  }

  const outcome = classifyOutcome({ toolCalls, assistantTexts });
  if (error === null && assistantErrorMessages.length > 0) {
    error = classifyTrialError(new Error(assistantErrorMessages[0]), "prompt");
  }

  return {
    scenarioId: scenario.id,
    guidanceVersion,
    trial,
    outcome,
    error,
    assistantErrorMessages,
    retryAttempts,
    durationMs: Date.now() - startedAt,
    sessionFile,
    systemPromptSha256,
    activeToolNames: observedTools,
    cleanup: "kept",
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const CAVEATS = [
  "Small samples: three trials per scenario per side describe only these observations, not an adoption rate and not a significance test.",
  "The comparator substitutes prompt metadata only. It is not a live before/after rollout of the shipped tool.",
  "The unavailable scenario removes ask_user without replicating the Chat-only system prompt, so it tests tool absence, not the full Chat-only session shape.",
  "Trials with an error are excluded from outcome counts. Provider, environment, timeout and harness failures stay in the error counts and are not evidence about model choice.",
  "The harness refuses more than 24 planned turns; SDK retries may add provider requests. An unresolved abort stops the run before any later trial and retains the temporary session files.",
  "The report contains synthetic prompts and model output only; environment credential values are redacted before writing.",
];

export function buildReport(input) {
  const byOutcome = { ask_user: 0, prose: 0, neither: 0 };
  const byErrorKind = {};
  for (const trial of input.trials) {
    if (trial.error !== null) {
      byErrorKind[trial.error.kind] = (byErrorKind[trial.error.kind] ?? 0) + 1;
      continue;
    }
    if (trial.outcome !== null) byOutcome[trial.outcome.kind] += 1;
  }
  if (input.setupError !== null) {
    byErrorKind[input.setupError.kind] = (byErrorKind[input.setupError.kind] ?? 0) + 1;
  }
  const caveats = input.halted === null
    ? [...CAVEATS]
    : [...CAVEATS, "This run stopped early. Trials that were not started are not observations and must not be read as ask_user, prose, or neither."];
  return {
    harnessVersion: 1,
    runId: randomUUID(),
    generatedAt: new Date().toISOString(),
    mode: "execute",
    config: {
      provider: input.provider,
      modelId: input.modelId,
      thinkingLevel: input.thinkingLevel,
      sdkVersion: SDK_VERSION,
      nodeVersion: process.version,
      oldRev: input.oldRev,
      trialsPerSide: input.trialsPerSide,
      timeoutMs: input.timeoutMs,
      abortSettleMs: input.abortSettleMs,
      agentDir: input.agentDir,
    },
    metadata: input.metadata,
    matrix: input.matrix,
    trials: input.trials,
    setupError: input.setupError,
    halted: input.halted,
    counts: {
      planned: input.matrix.length,
      completed: input.trials.length,
      notRun: Math.max(0, input.matrix.length - input.trials.length),
      byOutcome,
      byErrorKind,
    },
    caveats,
    cleanup: input.cleanup,
  };
}

function escapeCell(value) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function excerpt(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= 240 ? flat : `${flat.slice(0, 240)}…`;
}

function summarizeAsk(args) {
  if (!isRecord(args) || !Array.isArray(args.questions)) return "";
  const questions = [];
  for (const question of args.questions) {
    if (isRecord(question) && typeof question.question === "string") questions.push(excerpt(question.question));
  }
  return questions.join("; ");
}

function trialDetail(row) {
  if (row.outcome === null) return "";
  if (row.outcome.kind === "ask_user") {
    const questions = row.outcome.askUserCalls.map((call) => summarizeAsk(call.args)).filter((text) => text.length > 0);
    return questions.join(" | ") || "ask_user call";
  }
  if (row.outcome.kind === "prose") return excerpt(row.outcome.proseText ?? "");
  const names = row.outcome.toolCalls.map((call) => call.toolName).join(", ");
  return names.length > 0 ? `other tools: ${names}` : "";
}

export function renderReportMarkdown(report) {
  const lines = [];
  lines.push("# ask_user behavior evaluation");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Run: ${report.runId}`);
  lines.push(`SDK: ${report.config.sdkVersion} · Node: ${report.config.nodeVersion}`);
  lines.push(
    `Model: ${report.config.provider ?? "?"}/${report.config.modelId ?? "?"} · thinking: ${report.config.thinkingLevel ?? "?"}`,
  );
  lines.push(`Previous metadata revision: \`${report.config.oldRev}\``);
  lines.push("");
  lines.push("## Caveats");
  lines.push("");
  for (const caveat of report.caveats) lines.push(`- ${caveat}`);
  lines.push("");
  lines.push("## Metadata under comparison");
  lines.push("");
  lines.push("| Field | previous | current |");
  lines.push("| --- | --- | --- |");
  lines.push(
    `| promptSnippet | ${escapeCell(report.metadata.previous.promptSnippet)} | ${escapeCell(report.metadata.current.promptSnippet)} |`,
  );
  lines.push(
    `| promptGuidelines | ${escapeCell(report.metadata.previous.promptGuidelines.join(" / "))} | ${escapeCell(report.metadata.current.promptGuidelines.join(" / "))} |`,
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(
    `Planned turns: ${report.counts.planned} · completed: ${report.counts.completed} · not run: ${report.counts.notRun}`,
  );
  lines.push(
    `Clean outcomes: ask_user ${report.counts.byOutcome.ask_user}, prose ${report.counts.byOutcome.prose}, neither ${report.counts.byOutcome.neither}`,
  );
  const errorEntries = Object.entries(report.counts.byErrorKind);
  lines.push(
    errorEntries.length === 0
      ? "Errors: none"
      : `Errors: ${errorEntries.map(([kind, count]) => `${kind} ${count}`).join(", ")}`,
  );
  if (report.setupError !== null) {
    lines.push("");
    lines.push(`**Setup error (${report.setupError.kind}):** ${report.setupError.message}`);
  }
  if (report.halted !== null) {
    lines.push("");
    lines.push(`**Halted (${report.halted.reason}):** ${report.halted.message}`);
  }
  lines.push("");
  lines.push(`Cleanup: ${report.cleanup.status}${report.cleanup.runRoot === null ? "" : ` (${report.cleanup.runRoot})`}`);
  if (report.cleanup.note !== null) lines.push(`Cleanup note: ${report.cleanup.note}`);
  lines.push("");
  lines.push("## Trials");
  lines.push("");
  const seen = new Set();
  for (const plan of report.matrix) {
    const key = `${plan.scenarioId}\0${plan.guidanceVersion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rows = report.trials.filter(
      (trial) => trial.scenarioId === plan.scenarioId && trial.guidanceVersion === plan.guidanceVersion,
    );
    lines.push(`### ${plan.scenarioId} · ${plan.guidanceVersion}`);
    lines.push("");
    if (rows.length === 0) {
      lines.push("Not run.");
      lines.push("");
      continue;
    }
    lines.push("| trial | outcome | tools | asks | literal ? | error | retries | ms |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of rows) {
      const tools = (row.outcome?.toolCalls ?? []).map((call) => call.toolName).join(", ");
      lines.push(
        `| ${row.trial} | ${row.outcome?.kind ?? "n/a"} | ${escapeCell(tools)} | ${row.outcome?.askUserCalls.length ?? 0} | ${row.outcome?.containsQuestionMark === true ? "yes" : "no"} | ${row.error === null ? "" : `${row.error.kind}: ${escapeCell(row.error.message)}`} | ${row.retryAttempts} | ${row.durationMs} |`,
      );
      const detail = trialDetail(row);
      if (detail.length > 0) lines.push(`| | ${escapeCell(detail)} | | | | | | |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function writeReport(outDir, report) {
  const jsonPath = join(outDir, "ask-user-behavior-report.json");
  const markdownPath = join(outDir, "ask-user-behavior-report.md");
  writePrivateFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writePrivateFileSync(markdownPath, renderReportMarkdown(report));
  return { json: jsonPath, markdown: markdownPath };
}

// ---------------------------------------------------------------------------
// Run policy and orchestration
// ---------------------------------------------------------------------------

export async function runBoundedTrialLoop(matrix, runOne) {
  assertModelCallBudget(matrix.length);
  const results = [];
  for (const plan of matrix) {
    if (results.length >= MAX_MODEL_CALLS) throw budgetError(results.length + 1);
    const result = await runOne(plan);
    results.push(result);
    if (result.error?.kind === "unresolved_abort") return { results, halted: true };
  }
  return { results, halted: false };
}

export function finalizeRunRoot(input) {
  if (input.runRoot === null) return { runRoot: null, status: "removed", note: "no run root created" };
  if (input.trials.some((trial) => trial.error?.kind === "unresolved_abort")) {
    return {
      runRoot: input.runRoot,
      status: "kept",
      note: "abort did not settle; temporary files were retained and no later trial was started",
    };
  }
  if (input.keepTemp) return { runRoot: input.runRoot, status: "kept", note: "keep-temp requested" };
  const removal = removeRunRoot(input.runRoot);
  if (!removal.removed) {
    return { runRoot: input.runRoot, status: "failed", note: removal.error ?? "failed to remove the temporary run root" };
  }
  return { runRoot: null, status: "removed", note: null };
}

export async function runEvaluation(options) {
  const loadMetadata = options.loadMetadata ?? gitMetadataLoader(options.repoRoot);
  const abortSettleMs = options.abortSettleMs ?? DEFAULT_ABORT_SETTLE_MS;
  let metadata = { previous: null, current: null };
  let matrix = [];
  let setupError = null;
  try {
    metadata = loadMetadata(options.oldRev);
    matrix = buildTrialMatrix(options.trialsPerSide);
  } catch (caught) {
    setupError = classifyTrialError(caught, "setup");
  }

  const runRoot = setupError === null ? createRunRoot() : null;
  const trials = [];
  let halted = false;
  let agentDir = null;
  let provider = null;
  let modelId = null;

  if (setupError === null) {
    try {
      if (options.executeTrial !== undefined) {
        const loop = await runBoundedTrialLoop(matrix, options.executeTrial);
        trials.push(...loop.results);
        halted = loop.halted;
      } else {
        const runtime = await createEvaluationRuntime(runRoot);
        agentDir = runtime.agentDir;
        const model = resolveModel(runtime, options.provider, options.modelId);
        provider = model.provider;
        modelId = model.id;
        const loop = await runBoundedTrialLoop(matrix, (plan) => {
          const scenario = scenarioById(plan.scenarioId);
          options.onProgress?.(`[${plan.guidanceVersion}] ${scenario.id} trial ${plan.trial}/${options.trialsPerSide}`);
          return runTrial({
            runtime,
            scenario,
            guidanceVersion: plan.guidanceVersion,
            trial: plan.trial,
            metadata: plan.guidanceVersion === "previous" ? metadata.previous : metadata.current,
            model,
            thinkingLevel: options.thinkingLevel ?? "minimal",
            timeoutMs: options.timeoutMs,
            abortSettleMs,
          });
        });
        trials.push(...loop.results);
        halted = loop.halted;
      }
    } catch (caught) {
      setupError = classifyTrialError(caught, "setup");
    }
  }

  const halt = halted
    ? {
        reason: "unresolved_abort",
        message:
          [...trials].reverse().find((trial) => trial.error?.kind === "unresolved_abort")?.error?.message ??
          "abort did not settle",
        completedTrials: trials.length,
      }
    : null;
  const cleanup = finalizeRunRoot({ keepTemp: options.keepTemp, trials, runRoot });
  const report = buildReport({
    oldRev: options.oldRev,
    trialsPerSide: options.trialsPerSide,
    timeoutMs: options.timeoutMs,
    abortSettleMs,
    thinkingLevel: options.thinkingLevel ?? null,
    provider,
    modelId,
    agentDir,
    metadata,
    matrix,
    trials: trials.map((trial) => ({ ...trial, cleanup: cleanup.status })),
    setupError,
    halted: halt,
    cleanup,
  });
  const secrets = options.collectSecrets?.() ?? collectEvaluationSecrets({
    env: process.env,
    authFile: agentDir === null ? null : join(agentDir, "auth.json"),
  });
  const redacted = redactValue(report, secrets);
  const reportPaths = writeReport(options.outDir, redacted);
  return { report: redacted, reportPaths };
}

// ---------------------------------------------------------------------------
// Offline self-check
// ---------------------------------------------------------------------------

async function createProbeSession(runtime, scenario, metadata) {
  const sessionManager = openIsolatedSession(runtime);
  const customTools = scenario.askUserAvailable ? [await buildVersionedAskUserTool(metadata)] : [];
  const { session } = await createAgentSessionFromServices({
    services: runtime.services,
    sessionManager,
    noTools: "builtin",
    customTools,
  });
  assertSessionFileIsolated(sessionManager.getSessionFile(), runtime.sessionDir, join(runtime.agentDir, "sessions"));
  return session;
}

export async function runSelfCheck(options = {}) {
  const loadMetadata = options.loadMetadata ?? gitMetadataLoader(options.repoRoot ?? REPO_ROOT);
  const checks = [];
  const failures = [];
  let metadata;
  try {
    metadata = loadMetadata(options.oldRev ?? DEFAULT_OLD_REV);
  } catch (caught) {
    return { ok: false, checks, failures: [`metadata load failed: ${errorMessage(caught)}`] };
  }

  if (metadata.previous.promptSnippet === metadata.current.promptSnippet) {
    failures.push("previous and current promptSnippet are identical");
  } else {
    checks.push("previous and current promptSnippet differ");
  }
  if (JSON.stringify(metadata.previous.promptGuidelines) === JSON.stringify(metadata.current.promptGuidelines)) {
    failures.push("previous and current promptGuidelines are identical");
  } else {
    checks.push("previous and current promptGuidelines differ");
  }

  const runRoot = createRunRoot();
  try {
    const runtime = await createEvaluationRuntime(runRoot, options.agentDir ?? getAgentDir());
    checks.push(`services created with agentDir=${runtime.agentDir}`);
    for (const scenario of SCENARIOS) {
      const probes = {};
      for (const version of GUIDANCE_VERSIONS) {
        const session = await createProbeSession(runtime, scenario, metadata[version]);
        probes[version] = { prompt: session.systemPrompt, tools: activeToolNames(session) };
        session.dispose();
      }
      const expectedTools = scenario.askUserAvailable ? ["ask_user"] : [];
      if (toolsMatch(probes.previous.tools, expectedTools) && toolsMatch(probes.current.tools, expectedTools)) {
        checks.push(`${scenario.id}: active tools ${JSON.stringify(probes.previous.tools)}`);
      } else {
        failures.push(
          `${scenario.id}: active tools ${JSON.stringify(probes.previous.tools)} / ${JSON.stringify(probes.current.tools)} != ${JSON.stringify(expectedTools)}`,
        );
      }
      if (scenario.askUserAvailable) {
        const previous = normalizeMetadataInPrompt(probes.previous.prompt, metadata.previous);
        const current = normalizeMetadataInPrompt(probes.current.prompt, metadata.current);
        if (previous === current) checks.push(`${scenario.id}: system prompts differ only in ask_user metadata`);
        else failures.push(`${scenario.id}: system prompts differ beyond ask_user metadata`);
      } else if (probes.previous.prompt !== probes.current.prompt) {
        failures.push(`${scenario.id}: unavailable control prompts differ`);
      } else {
        checks.push(`${scenario.id}: unavailable control prompt identical`);
      }
    }
  } catch (caught) {
    failures.push(`self-check setup failed: ${errorMessage(caught)}`);
  } finally {
    if (!options.keepTemp) {
      removeRunRoot(runRoot);
    }
  }
  return { ok: failures.length === 0, checks, failures };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const OPTIONS_WITH_VALUE = new Set(["--old-rev", "--trials", "--timeout-ms", "--provider", "--model", "--thinking", "--out"]);

function parseArgs(argv) {
  const options = {
    mode: "plan",
    oldRev: DEFAULT_OLD_REV,
    trials: 3,
    timeoutMs: 180_000,
    provider: undefined,
    model: undefined,
    thinking: "minimal",
    out: join(REPO_ROOT, "test-results", "ask-user-behavior-eval"),
    keepTemp: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--plan") options.mode = "plan";
    else if (arg === "--self-check") options.mode = "self-check";
    else if (arg === "--execute") options.mode = "execute";
    else if (arg === "--keep-temp") options.keepTemp = true;
    else if (arg === "--help" || arg === "-h") options.mode = "help";
    else if (OPTIONS_WITH_VALUE.has(arg)) {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`missing value for ${arg}`);
      index += 1;
      if (arg === "--old-rev") options.oldRev = value;
      else if (arg === "--trials") options.trials = Number.parseInt(value, 10);
      else if (arg === "--timeout-ms") options.timeoutMs = Number.parseInt(value, 10);
      else if (arg === "--provider") options.provider = value;
      else if (arg === "--model") options.model = value;
      else if (arg === "--thinking") options.thinking = value;
      else if (arg === "--out") options.out = resolve(value);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.trials) || options.trials < 1) throw new Error("--trials must be a positive integer");
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) throw new Error("--timeout-ms must be a positive integer");
  return options;
}

function printHelp() {
  process.stdout.write(
    [
      "ask_user behavior evaluation harness (research-only)",
      "",
      "Modes:",
      "  --plan         print the scenario matrix and metadata diff (default, no model calls)",
      "  --self-check   build both sides offline and verify only metadata differs",
      "  --execute      run the planned turns against the model and write a report",
      "",
      "Options:",
      "  --old-rev <rev>     previous metadata revision (default 922f7e1)",
      "  --trials <n>        trials per scenario per side (default 3, total calls must be <= 24)",
      "  --timeout-ms <n>    per-trial timeout (default 180000)",
      "  --provider <id>     provider for --execute (default: settings default)",
      "  --model <id>        model id for --execute (default: settings default)",
      "  --thinking <level>  thinking level (default minimal)",
      "  --out <dir>         report directory (default test-results/ask-user-behavior-eval)",
      "  --keep-temp         keep the temporary run root for inspection",
      "",
    ].join("\n"),
  );
}

async function runPlan(options) {
  const metadata = gitMetadataLoader(REPO_ROOT)(options.oldRev);
  const matrix = buildTrialMatrix(options.trials);
  process.stdout.write("Scenarios:\n");
  for (const scenario of SCENARIOS) {
    process.stdout.write(
      `  ${scenario.id.padEnd(16)} ask_user=${scenario.askUserAvailable ? "on " : "off"} expected=${scenario.expected}\n`,
    );
    process.stdout.write(`    ${scenario.prompt}\n`);
  }
  process.stdout.write(
    `\nPlanned trials: ${matrix.length} (maximum ${MAX_MODEL_CALLS} turns; SDK retries may add requests)\n`,
  );
  process.stdout.write("\nMetadata:\n");
  process.stdout.write(`  previous (${options.oldRev}): ${metadata.previous.promptSnippet}\n`);
  process.stdout.write(`  current  (worktree): ${metadata.current.promptSnippet}\n`);
  const { createAskUserToolDefinition } = await loadToolModule();
  const live = createAskUserToolDefinition({ open: async () => ({ ask: null }) });
  if (
    live.promptSnippet !== metadata.current.promptSnippet ||
    JSON.stringify(live.promptGuidelines) !== JSON.stringify(metadata.current.promptGuidelines)
  ) {
    process.stderr.write("\nInvariant FAILED: extracted worktree metadata does not match the live ask_user tool.\n");
    return 1;
  }
  process.stdout.write("  extractor matches the live ask_user tool definition\n");
  return 0;
}

async function runExecute(options) {
  let result;
  try {
    result = await runEvaluation({
      repoRoot: REPO_ROOT,
      outDir: options.out,
      oldRev: options.oldRev,
      trialsPerSide: options.trials,
      timeoutMs: options.timeoutMs,
      thinkingLevel: options.thinking,
      provider: options.provider,
      modelId: options.model,
      keepTemp: options.keepTemp,
      onProgress: (message) => process.stdout.write(`${message}\n`),
    });
  } catch (caught) {
    process.stderr.write(`${errorMessage(caught)}\n`);
    return 1;
  }
  const { report, reportPaths } = result;
  process.stdout.write(`\nJSON:     ${reportPaths.json}\n`);
  process.stdout.write(`Markdown: ${reportPaths.markdown}\n`);
  process.stdout.write(
    `Completed ${report.counts.completed}/${report.counts.planned}; ` +
      `ask_user ${report.counts.byOutcome.ask_user}, prose ${report.counts.byOutcome.prose}, neither ${report.counts.byOutcome.neither}\n`,
  );
  if (report.halted !== null) {
    process.stderr.write(`halted (${report.halted.reason}): ${report.halted.message}\n`);
    return 1;
  }
  if (report.setupError !== null) {
    process.stderr.write(`setup error (${report.setupError.kind}): ${report.setupError.message}\n`);
    return 1;
  }
  return 0;
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    printHelp();
    return 2;
  }
  if (options.mode === "help") {
    printHelp();
    return 0;
  }
  try {
    buildTrialMatrix(options.trials);
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    return 2;
  }
  if (options.mode === "plan") return runPlan(options);
  if (options.mode === "self-check") {
    const result = await runSelfCheck({ repoRoot: REPO_ROOT, oldRev: options.oldRev, keepTemp: options.keepTemp });
    for (const check of result.checks) process.stdout.write(`  ok  ${check}\n`);
    for (const failure of result.failures) process.stderr.write(`  FAIL ${failure}\n`);
    process.stdout.write(result.ok ? "self-check passed\n" : "self-check failed\n");
    return result.ok ? 0 : 1;
  }
  return runExecute(options);
}

const isMain = (() => {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return resolve(entry) === SCRIPT_PATH;
  } catch {
    return false;
  }
})();

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
