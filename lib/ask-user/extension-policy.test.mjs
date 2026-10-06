import "./test-support.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { projectAskUserTools } = await jiti.import("./extension-policy.ts");
function extension(path, exposure = "direct", defaultActive) {
  return { path, resolvedPath: path, sourceInfo: { source: path },
    tools: new Map([["ask_user", { sourceInfo: { source: path }, definition: {
      name: "ask_user", exposure, defaultActive, execute: async () => {}, parameters: { marker: true },
      description: "Original description", promptSnippet: "Original snippet", promptGuidelines: ["Original guideline"],
    } }], ["other", { definition: { name: "other" } }]]),
    commands: new Map(), flags: new Map(), handlers: new Map(),
  };
}
test("projection preserves definition metadata/references, source and defaultActive without mutating the input", () => {
  for (const defaultActive of [undefined, true, false]) {
    const owner = extension("/installed/index.ts", "direct", defaultActive);
    const base = { extensions: [owner], errors: [], runtime: {} };
    const projected = projectAskUserTools(base);
    const before = owner.tools.get("ask_user"), after = projected.extensions[0].tools.get("ask_user");
    assert.equal(after.definition.exposure, "model-only");
    for (const key of ["execute", "parameters", "description", "promptSnippet", "promptGuidelines", "defaultActive"]) {
      assert.equal(after.definition[key], before.definition[key], key);
    }
    assert.equal(after.sourceInfo, before.sourceInfo);
    assert.equal(projected.runtime, base.runtime);
    for (const key of ["commands", "flags", "handlers"]) assert.equal(projected.extensions[0][key], owner[key]);
    assert.equal(owner.tools.get("ask_user").definition.exposure, "direct");
    assert.equal(projected.extensions[0].tools.get("other"), owner.tools.get("other"));
  }
});
test("hidden remains withdrawn; deny only removes AskUser from the Map", () => {
  const owner = extension("/installed/index.ts", "hidden", false);
  const base = { extensions: [owner], errors: [], runtime: {} };
  assert.equal(projectAskUserTools(base).extensions[0].tools.get("ask_user"), owner.tools.get("ask_user"));
  const denied = projectAskUserTools(base, false);
  assert.equal(denied.extensions[0].tools.has("ask_user"), false);
  assert.equal(denied.extensions[0].tools.get("other"), owner.tools.get("other"));
  assert.equal(owner.tools.has("ask_user"), true);
});

test("codemode/deferred projection preserves native inactivity, even explicit true, without mutating definition or source", () => {
  for (const exposure of ["codemode", "deferred"]) for (const defaultActive of [undefined, true, false]) {
    const owner = extension("/installed/index.ts", exposure, defaultActive);
    const before = owner.tools.get("ask_user");
    Object.freeze(before.definition);
    Object.freeze(before);
    const projected = projectAskUserTools({ extensions: [owner], errors: [], runtime: {} });
    const after = projected.extensions[0].tools.get("ask_user");
    assert.equal(after.definition.exposure, "model-only");
    assert.equal(after.definition.defaultActive, false);
    assert.equal(before.definition.exposure, exposure);
    assert.equal(before.definition.defaultActive, defaultActive);
    for (const key of ["execute", "parameters", "description", "promptSnippet", "promptGuidelines"]) {
      assert.equal(after.definition[key], before.definition[key], key);
    }
    assert.equal(after.sourceInfo, before.sourceInfo);
    assert.equal(owner.tools.get("ask_user"), before);
  }
});
