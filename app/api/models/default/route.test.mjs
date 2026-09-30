import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const agentDir = await mkdtemp(join(tmpdir(), "pi-web-default-route-"));
process.env.PI_CODING_AGENT_DIR = agentDir;

const { PUT } = await createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
}).import("./route.ts");

after(async () => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  await rm(agentDir, { recursive: true, force: true });
});

function request(body) {
  return new Request("http://localhost/api/models/default", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

test("default preferences reject JSON values that are not request objects", async () => {
  for (const value of [null, [], "high", 42, true]) {
    const response = await PUT(request(JSON.stringify(value)));
    assert.equal(response.status, 400, JSON.stringify(value));
    assert.deepEqual(await response.json(), {
      error: "Expected provider and modelId, or a valid thinkingLevel",
    });
  }
  assert.deepEqual(await readdir(agentDir), [], "invalid requests must not create settings or SDK services");
});

test("default preferences reject malformed JSON and invalid edit fields", async () => {
  const malformed = await PUT(request("{"));
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "Invalid JSON body" });
  for (const value of [{}, { provider: "p" }, { modelId: "m" }, { thinkingLevel: "auto" }]) {
    const response = await PUT(request(JSON.stringify(value)));
    assert.equal(response.status, 400);
  }
  assert.deepEqual(await readdir(agentDir), []);
});
