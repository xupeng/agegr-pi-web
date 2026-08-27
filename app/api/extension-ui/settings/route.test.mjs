import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { createJiti } from "jiti";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;
const testAgentDir = await mkdtemp(join(tmpdir(), "pi-web-extension-ui-route-"));
process.env.PI_CODING_AGENT_DIR = testAgentDir;

const jiti = createJiti(import.meta.url, {
  alias: { "@": process.cwd() },
  interopDefault: true,
  moduleCache: false,
});
const { GET, PUT } = await jiti.import("./route.ts");

after(async () => {
  if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
  await rm(testAgentDir, { recursive: true, force: true });
});

function request(body, contentType = "application/json") {
  return new Request("http://localhost/api/extension-ui/settings", {
    method: "PUT",
    headers: { "Content-Type": contentType, Host: "localhost" },
    body: JSON.stringify(body),
  });
}

test("extension UI settings route returns defaults and persists rules", async () => {
  let response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    hiddenWidgetKeys: ["powerline-*"],
    hiddenStatusKeys: [],
  });

  response = await PUT(request({
    hiddenWidgetKeys: ["powerline-*", "todo"],
    hiddenStatusKeys: ["stash"],
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    hiddenWidgetKeys: ["powerline-*", "todo"],
    hiddenStatusKeys: ["stash"],
  });
  assert.deepEqual(
    JSON.parse(await readFile(join(testAgentDir, "pi-web-extension-ui.json"), "utf8")),
    {
      version: 1,
      hiddenWidgetKeys: ["powerline-*", "todo"],
      hiddenStatusKeys: ["stash"],
    },
  );
});

test("extension UI settings route validates mutations", async () => {
  let response = await PUT(request({ hiddenWidgetKeys: ["*"], hiddenStatusKeys: [] }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /exact keys or prefixes/);

  response = await PUT(request({ hiddenWidgetKeys: [], hiddenStatusKeys: [] }, "text/plain"));
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { error: "Content-Type must be application/json" });
});
