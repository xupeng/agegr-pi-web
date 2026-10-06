import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after } from "node:test";

// Import this BEFORE any SDK/Web module. Every test worker has a private home.
export const scratch = mkdtempSync(join(tmpdir(), "ask-user-host-"));
process.env.HOME = join(scratch, "home");
process.env.PI_CODING_AGENT_DIR = join(scratch, "agent");
process.env.PI_OFFLINE = "1";
process.env.JITI_FS_CACHE = "false";
mkdirSync(process.env.HOME, { recursive: true });
mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
after(() => rmSync(scratch, { recursive: true, force: true }));
const protocolSource = fileURLToPath(new URL("./fixtures/protocol-package/", import.meta.url));
let nextCopy = 0;
export function copyProtocolPackage(toolOptions = "") {
  const dir = join(scratch, `package-${++nextCopy}`);
  mkdirSync(dir);
  for (const file of ["package.json", "index.js"]) cpSync(join(protocolSource, file), join(dir, file));
  const entry = join(dir, "index.js");
  writeFileSync(entry, readFileSync(entry, "utf8").replace("/* TOOL_OPTIONS */", toolOptions));
  return dir;
}
