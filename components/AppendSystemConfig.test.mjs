import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";

// The repository has no DOM test environment, so these assertions read the
// component source the same way SettingsPanel.test.mjs does.
const source = await readFile(new URL("./AppendSystemConfig.tsx", import.meta.url), "utf8");

// Execute the real effect callback with state setters, as ChatInput's callback
// tests do. This verifies request ownership and draft updates, not browser UI.
const parsed = ts.createSourceFile("AppendSystemConfig.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findLoadEffect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(parsed) === "useEffect"
    && node.arguments[0]?.getText(parsed).includes("refreshOnly")) return node.arguments[0];
  return ts.forEachChild(node, findLoadEffect);
}
const loadEffect = ts.transpileModule(findLoadEffect(parsed).getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const originalState = {
  content: "saved global instructions", path: "/global/instructions", exists: true, maxBytes: 65536,
  projectOverride: { path: "/project/override", trusted: false },
};
const refreshedState = { ...originalState, content: "external global edit", projectOverride: { ...originalState.projectOverride, trusted: true } };
const responseFor = (body) => ({ ok: true, json: async () => body });

function runProbe({ fetcher, cwd = "/project", loadedCwdRef = { current: cwd } }) {
  let state = originalState;
  let draft = "unsaved editor draft";
  let error = null;
  const draftUpdates = [];
  const effect = new Script(loadEffect).runInNewContext({
    cwd, loadedCwdRef, AbortController, Error,
    appendSystemUrl: (cwd) => `/api/append-system?cwd=${encodeURIComponent(cwd)}`,
    fetch: fetcher,
    setState: (value) => { state = typeof value === "function" ? value(state) : value; },
    setDraft: (value) => { draft = value; draftUpdates.push(value); },
    setError: (value) => { error = value; },
    setLoading() {},
  });
  return {
    cleanup: effect(),
    settle: () => new Promise((resolve) => setImmediate(resolve)),
    get state() { return state; }, get draft() { return draft; }, get error() { return error; },
    draftUpdates,
  };
}

test("trust refresh changes the override hint but preserves the global baseline and unsaved draft", async () => {
  const probe = runProbe({ fetcher: async () => responseFor(refreshedState) });
  await probe.settle();
  assert.equal(probe.state.projectOverride.trusted, true);
  assert.equal(probe.state.projectOverride, refreshedState.projectOverride);
  assert.equal(probe.state.content, originalState.content);
  assert.equal(probe.state.path, originalState.path);
  assert.equal(probe.draft, "unsaved editor draft");
  assert.deepEqual(probe.draftUpdates, []);
  assert.match(source, /const trustReloadKey = projectTrustReloadKey\(trust\);/);
  assert.match(source, /\}, \[cwd, trustReloadKey\]\);/);
  probe.cleanup();
});

test("the initial cwd load still initializes the global editor", async () => {
  const owner = { current: undefined };
  const probe = runProbe({ loadedCwdRef: owner, fetcher: async () => responseFor(originalState) });
  await probe.settle();
  assert.equal(probe.state, originalState);
  assert.equal(probe.draft, originalState.content);
  assert.equal(owner.current, "/project");
  probe.cleanup();
});

test("a cancelled cwd or trust probe ignores a late response even if fetch ignores abort", async () => {
  let resolve;
  let signal;
  const probe = runProbe({ fetcher: (_url, options) => {
    signal = options.signal;
    return new Promise((done) => { resolve = done; });
  } });
  probe.cleanup();
  assert.equal(signal.aborted, true);
  resolve(responseFor(refreshedState));
  await probe.settle();
  assert.equal(probe.state, originalState);
  assert.equal(probe.draft, "unsaved editor draft");
  assert.deepEqual(probe.draftUpdates, []);
  assert.equal(probe.error, null);
});

test("a failed refresh reports its error without changing the baseline or draft", async () => {
  const probe = runProbe({ fetcher: async () => { throw new Error("probe failed"); } });
  await probe.settle();
  assert.equal(probe.error, "probe failed");
  assert.equal(probe.state, originalState);
  assert.equal(probe.draft, "unsaved editor draft");
  assert.deepEqual(probe.draftUpdates, []);
  probe.cleanup();
});

test("states the effective scope of the append instructions", () => {
  // R3/AC5: the three exclusions are exactly what users get wrong, so they are
  // a hard requirement of this surface rather than a footnote.
  assert.match(source, /settings\.appendSystemScopeNormal/);
  assert.match(source, /settings\.appendSystemScopeChatOnly/);
  assert.match(source, /settings\.appendSystemScopeSubagent/);
  // ...and changing the file must not silently imply a running session changed.
  assert.match(source, /settings\.appendSystemReloadHint/);
});

test("reports both project-override states, and only when a file was found", () => {
  assert.match(source, /\{state\?\.projectOverride && \(/);
  assert.match(source, /settings\.appendSystemProjectOverrideActive/);
  assert.match(source, /settings\.appendSystemProjectOverrideUntrusted/);
  // The heading must not claim an override for a project that has no file.
  assert.doesNotMatch(source, /settings\.appendSystemProjectOverrideTitle[\s\S]{0,400}?\n\s*\{?state\?\.projectOverride/);
});

test("takes the file path from the server instead of rebuilding it", () => {
  assert.match(source, /\{state && <code[^>]*>\{state\.path\}/);
  // A hand-built path would drift from getAgentDir() (and would be wrong on
  // Windows); the writable target is the server's answer.
  assert.doesNotMatch(source, /APPEND_SYSTEM\.md/);
  assert.doesNotMatch(source, /homedir\(\)/);
});

test("measures UTF-8 bytes and blocks over-limit saves", () => {
  // content.length counts UTF-16 units, so a CJK draft could pass the UI check
  // and then be rejected by the server at the 65536-byte boundary.
  assert.match(source, /new TextEncoder\(\)\.encode\(draft\)\.length/);
  assert.match(source, /const overLimit = byteLength > maxBytes;/);
  assert.match(source, /const canSave = state !== null && dirty && !overLimit && !saving;/);
  assert.match(source, /method: "PUT"/);
});
