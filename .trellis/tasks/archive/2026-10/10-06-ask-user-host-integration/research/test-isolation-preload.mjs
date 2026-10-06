// Validation-only preload. Never imported by Pi Web or shipped as a tool.
// All runtime tests remain PI_OFFLINE=1. This one unchanged unit-test file
// injects runCommand mocks for every update check, but assumes PI_OFFLINE is
// unset. Restore that assumption only in its isolated test worker, while the
// outer bwrap --unshare-net namespace physically denies external networking.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";

const entry = process.argv[1];
if (process.env.PI_TEST_MOCK_UPDATE_CHECKS === "1"
  && entry
  && basename(entry) === "plugin-updates.test.mjs"
  && basename(dirname(entry)) === "lib") {
  assert.equal(process.env.PI_OFFLINE, "1", "the test suite must start offline");
  const hash = createHash("sha256").update(readFileSync(entry)).digest("hex");
  assert.equal(hash, "99043c5dc642b3e70af10c72e6432c90379d562ff090be5a027e66e4ed170d11",
    "re-review mocked-only update checks before granting this test exception");
  process.env.PI_OFFLINE = "0";
}
