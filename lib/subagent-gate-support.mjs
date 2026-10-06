import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";

// Import this BEFORE any SDK module. Every test worker gets a private home and agent
// directory inside the pi-tmp workspace, so no ancestor `.pi`/`.agents` resource is found.
export const scratch = mkdtempSync(join(tmpdir(), "pi-web-subagent-gate-"));
process.env.HOME = join(scratch, "home");
process.env.PI_CODING_AGENT_DIR = join(scratch, "agent");
// Deliberately not PI_OFFLINE: offline mode shorts the package-missing callback before the
// no-install preflight can observe/skip it. Model runtimes are created with networking off.
process.env.JITI_FS_CACHE = "false";
mkdirSync(process.env.HOME, { recursive: true });
mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
after(() => rmSync(scratch, { recursive: true, force: true }));
