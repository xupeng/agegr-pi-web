import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";

// Must be evaluated before SDK imports. No real HOME, XDG or ancestor discovery.
assert.ok(process.env.TMPDIR, "run under the isolated pi-tmp-run wrapper");
assert.ok(!/^\/tmp(?:\/|$)/.test(tmpdir()), "do not allocate under /tmp");
export const scratch = mkdtempSync(join(tmpdir(), "subagent-native-search-hooks-"));
process.env.HOME = join(scratch, "home");
process.env.PI_CODING_AGENT_DIR = join(process.env.HOME, "agent");
process.env.JITI_FS_CACHE = "false";
for (const name of Object.keys(process.env)) {
  if (name.startsWith("XDG_")) delete process.env[name];
}
mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });

export const network = { blockedExternal: 0, loopbackRequests: 0, origins: new Set() };
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!network.origins.has(url.origin)) {
    network.blockedExternal += 1;
    throw new Error(`Unowned network destination forbidden: ${url.origin}`);
  }
  network.loopbackRequests += 1;
  return originalFetch(input, options);
};
after(() => { globalThis.fetch = originalFetch; rmSync(scratch, { recursive: true, force: true }); });
