import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

const {
  AppendSystemContentTooLargeError,
  MAX_APPEND_SYSTEM_BYTES,
  appendSystemPromptByteLength,
  detectProjectAppendSystemOverride,
  getAppendSystemPromptPath,
  readAppendSystemPrompt,
  writeAppendSystemPrompt,
} = await jiti.import("./append-system.ts");
const { projectTrustReloadOptions, trustProject } = await jiti.import("./project-trust.ts");

async function makeAgentDir(t) {
  const root = await mkdtemp(join(tmpdir(), "pi-web-append-system-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, agentDir: join(root, "agent") };
}

test("reads a missing file as empty without creating it", async (t) => {
  const { agentDir } = await makeAgentDir(t);

  const state = readAppendSystemPrompt(agentDir);
  assert.equal(state.path, join(agentDir, "APPEND_SYSTEM.md"));
  assert.equal(state.content, "");
  assert.equal(state.exists, false);
  assert.equal(state.maxBytes, MAX_APPEND_SYSTEM_BYTES);
  await assert.rejects(stat(state.path));
});

test("writes content byte-for-byte and reads it back", async (t) => {
  const { agentDir } = await makeAgentDir(t);
  // Chinese, emoji, trailing spaces, and a missing final newline must survive.
  const content = "始终使用中文回答用户。\n\n- emoji 🚀🀄️\n- trailing spaces  \n- no final newline";

  const written = writeAppendSystemPrompt(content, agentDir);
  assert.equal(written.exists, true);
  assert.equal(written.content, content);

  const onDisk = await readFile(join(agentDir, "APPEND_SYSTEM.md"));
  assert.deepEqual(onDisk, Buffer.from(content, "utf8"));
  assert.equal(readAppendSystemPrompt(agentDir).content, content);
});

test("creates a missing agent directory and writes with 0600 permissions", async (t) => {
  const { root } = await makeAgentDir(t);
  const agentDir = join(root, "nested", "agent");

  writeAppendSystemPrompt("hello", agentDir);
  const info = await stat(join(agentDir, "APPEND_SYSTEM.md"));
  assert.equal(info.mode & 0o777, 0o600);
});

test("writing an empty string creates an empty file instead of deleting it", async (t) => {
  const { agentDir } = await makeAgentDir(t);

  writeAppendSystemPrompt("previous", agentDir);
  writeAppendSystemPrompt("", agentDir);

  const state = readAppendSystemPrompt(agentDir);
  assert.equal(state.exists, true);
  assert.equal(state.content, "");
  assert.deepEqual(await readFile(join(agentDir, "APPEND_SYSTEM.md")), Buffer.alloc(0));
});

test("rejects content above the byte limit without touching the existing file", async (t) => {
  const { agentDir } = await makeAgentDir(t);
  const path = join(agentDir, "APPEND_SYSTEM.md");
  writeAppendSystemPrompt("keep me", agentDir);

  // Multi-byte characters count by encoded length, not by UTF-16 code units.
  const oversized = "中".repeat(MAX_APPEND_SYSTEM_BYTES / 3 + 1);
  assert.ok(appendSystemPromptByteLength(oversized) > MAX_APPEND_SYSTEM_BYTES);
  assert.throws(
    () => writeAppendSystemPrompt(oversized, agentDir),
    (error) => error instanceof AppendSystemContentTooLargeError,
  );
  assert.throws(() => writeAppendSystemPrompt("a".repeat(MAX_APPEND_SYSTEM_BYTES + 1), agentDir));

  assert.equal(await readFile(path, "utf8"), "keep me");

  // Exactly at the limit is accepted.
  writeAppendSystemPrompt("a".repeat(MAX_APPEND_SYSTEM_BYTES), agentDir);
  assert.equal(appendSystemPromptByteLength(readAppendSystemPrompt(agentDir).content), MAX_APPEND_SYSTEM_BYTES);
});

test("only ever writes the fixed path inside the provided agent directory", async (t) => {
  const { agentDir } = await makeAgentDir(t);

  // Content that looks like a path must be written verbatim, never followed.
  const written = writeAppendSystemPrompt("../../outside.md", agentDir);
  assert.equal(written.path, getAppendSystemPromptPath(agentDir));
  assert.deepEqual(await readdir(agentDir), ["APPEND_SYSTEM.md"]);
  assert.equal(await readFile(join(agentDir, "APPEND_SYSTEM.md"), "utf8"), "../../outside.md");
});

test("detects the project override in all three states", async (t) => {
  const { root, agentDir } = await makeAgentDir(t);
  const projectDir = join(root, "project");

  // Absent file, and an empty cwd, both report no override.
  assert.equal(detectProjectAppendSystemOverride(projectDir, agentDir), null);
  assert.equal(detectProjectAppendSystemOverride("", agentDir), null);

  // Present but untrusted.
  const overridePath = join(projectDir, ".pi", "APPEND_SYSTEM.md");
  await mkdir(join(projectDir, ".pi"), { recursive: true });
  await writeFile(overridePath, "project override");
  assert.deepEqual(detectProjectAppendSystemOverride(projectDir, agentDir), {
    path: overridePath,
    trusted: false,
  });

  // Present and trusted.
  trustProject(projectDir, agentDir);
  assert.deepEqual(detectProjectAppendSystemOverride(projectDir, agentDir), {
    path: overridePath,
    trusted: true,
  });
});

// The endpoint is only useful if the file it writes is the file pi reads. These
// two cases ask pi's own loader instead of restating its rules, so a future
// rename or relocation of APPEND_SYSTEM.md fails here rather than silently
// turning the editor into decoration.
test("writes the file pi loads as the append system prompt", async (t) => {
  const { root, agentDir } = await makeAgentDir(t);
  const cwd = join(root, "project");
  await mkdir(cwd, { recursive: true });

  const before = new DefaultResourceLoader({ cwd, agentDir });
  await before.reload();
  assert.deepEqual(before.getAppendSystemPrompt(), []);

  const content = "产出文档后，在回复中用 markdown 链接给出它的路径\n";
  writeAppendSystemPrompt(content, agentDir);

  const after = new DefaultResourceLoader({ cwd, agentDir });
  await after.reload();
  assert.deepEqual(after.getAppendSystemPrompt(), [content]);
  assert.deepEqual(after.getAppendSystemPromptSources(), [
    { path: join(agentDir, "APPEND_SYSTEM.md") },
  ]);
});

test("a trusted project file replaces the global file instead of stacking", async (t) => {
  const { root, agentDir } = await makeAgentDir(t);
  const cwd = join(root, "project");
  await mkdir(join(cwd, ".pi"), { recursive: true });
  writeAppendSystemPrompt("global only", agentDir);
  await writeFile(join(cwd, ".pi", "APPEND_SYSTEM.md"), "project only");

  // This is why the panel must distinguish the two project-override states:
  // while the project is untrusted, pi still reads the global file. The gate is
  // projectTrustReloadOptions(), the same option lib/rpc-manager.ts passes.
  const untrustedOptions = projectTrustReloadOptions(cwd, agentDir);
  const untrusted = new DefaultResourceLoader({ cwd, agentDir });
  await untrusted.reload(untrustedOptions);
  assert.deepEqual(untrusted.getAppendSystemPrompt(), ["global only"]);

  trustProject(cwd, agentDir);
  const trusted = new DefaultResourceLoader({ cwd, agentDir });
  await trusted.reload(projectTrustReloadOptions(cwd, agentDir));
  assert.deepEqual(trusted.getAppendSystemPrompt(), ["project only"]);
});
