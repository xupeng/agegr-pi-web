import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const testAgentDir = await mkdtemp(join(tmpdir(), "pi-web-append-system-route-"));
process.env.PI_CODING_AGENT_DIR = testAgentDir;

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET, PUT } = await jiti.import("./route.ts");
const { allowFileRoot } = await jiti.import("@/lib/file-access");

after(async () => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  await rm(testAgentDir, { recursive: true, force: true });
});

function getRequest(host = "localhost") {
  return new Request("http://localhost/api/append-system", { headers: { Host: host } });
}

function putRequest(body, { contentType = "application/json", host = "localhost" } = {}) {
  return new Request("http://localhost/api/append-system", {
    method: "PUT",
    headers: { "Content-Type": contentType, Host: host },
    body: JSON.stringify(body),
  });
}

test("GET returns an empty document when the global file does not exist", async () => {
  const response = await GET(getRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.path, join(testAgentDir, "APPEND_SYSTEM.md"));
  assert.equal(body.content, "");
  assert.equal(body.exists, false);
  assert.equal(body.maxBytes, 65536);
  assert.equal(body.projectOverride, null);
});

test("PUT round-trips content byte-for-byte at 0600", async () => {
  const content = "产出文档后在回复中用 markdown 链接给出路径 🚀\n";
  const response = await PUT(putRequest({ content }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.content, content);
  assert.equal(body.exists, true);
  assert.equal(body.projectOverride, null);

  const filePath = join(testAgentDir, "APPEND_SYSTEM.md");
  assert.equal(await readFile(filePath, "utf8"), content);
  assert.equal((await stat(filePath)).mode & 0o777, 0o600);
});

test("PUT rejects non-string content", async () => {
  let response = await PUT(putRequest({ content: 42 }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "content must be a string" });

  response = await PUT(putRequest({}));
  assert.equal(response.status, 400);
});

test("PUT rejects content above the limit and leaves the file unchanged", async () => {
  await PUT(putRequest({ content: "keep me" }));

  const response = await PUT(putRequest({ content: "a".repeat(65537) }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "content must not exceed 65536 bytes" });

  assert.equal(await readFile(join(testAgentDir, "APPEND_SYSTEM.md"), "utf8"), "keep me");
});

test("PUT enforces content type and request origin", async () => {
  let response = await PUT(putRequest({ content: "x" }, { contentType: "text/plain" }));
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { error: "Content-Type must be application/json" });

  response = await PUT(putRequest({ content: "x" }, { host: "evil.example.com" }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Untrusted API request" });
});

test("probes the project override only for an authorized cwd", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "pi-web-append-override-"));
  const projectDir = join(root, "project");
  const overridePath = join(projectDir, ".pi", "APPEND_SYSTEM.md");
  await mkdir(join(projectDir, ".pi"), { recursive: true });
  await writeFile(overridePath, "project override");
  t.after(() => rm(root, { recursive: true, force: true }));
  const url = `http://localhost/api/append-system?cwd=${encodeURIComponent(projectDir)}`;
  const headers = { Host: "localhost" };

  // The override file exists right there, but an unauthorized cwd must not be
  // probed — that is what keeps this endpoint from being a path-existence
  // oracle for arbitrary directories.
  const unauthorized = await GET(new Request(url, { headers }));
  assert.equal(unauthorized.status, 200);
  assert.equal((await unauthorized.json()).projectOverride, null);

  // Inside the file-access allow-list the override is reported, still read-only:
  // pi ignores the project file until the project is trusted (R4).
  allowFileRoot(projectDir);
  const authorized = await GET(new Request(url, { headers }));
  assert.deepEqual((await authorized.json()).projectOverride, { path: overridePath, trusted: false });

  // PUT reports the same shape, so a save can refresh the hint in one round trip.
  const putResponse = await PUT(new Request(url, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "global" }),
  }));
  assert.equal(putResponse.status, 200);
  const putBody = await putResponse.json();
  assert.equal(putBody.content, "global");
  assert.deepEqual(putBody.projectOverride, { path: overridePath, trusted: false });
});
