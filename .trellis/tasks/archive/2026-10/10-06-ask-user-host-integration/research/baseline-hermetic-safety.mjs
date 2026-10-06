// Research-only audit: no product changes, provider env, or external network calls.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readlinkSync } from "node:fs";
import net from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";

const [baseline] = process.argv.slice(2);
assert.equal(process.env.PI_OFFLINE, "1");
assert.deepEqual(Object.keys(networkInterfaces()), ["lo"]);
console.log(JSON.stringify({ stage: "namespace", offline: process.env.PI_OFFLINE,
  netns: readlinkSync("/proc/self/ns/net"), interfaces: Object.keys(networkInterfaces()),
  routes: readFileSync("/proc/net/route", "utf8") }));
const server = net.createServer(socket => socket.end("loopback-ok"));
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const value = await new Promise((resolve, reject) => {
  let text = "";
  const client = net.connect(server.address().port, "127.0.0.1");
  client.on("error", reject); client.on("data", x => text += x); client.on("end", () => resolve(text));
});
await new Promise(resolve => server.close(resolve));
assert.equal(value, "loopback-ok");
console.log("loopback-connect=ok");
const marker = "ISOLATION-AUDIT:";
const audit = "data:text/javascript," + encodeURIComponent(
  `console.log(${JSON.stringify(marker)}+JSON.stringify({argv:process.argv,offline:process.env.PI_OFFLINE,testContext:process.env.NODE_TEST_CONTEXT??null}));`);
const plugin = join(baseline, "lib/plugin-updates.test.mjs");
const bridge = join(baseline, "lib/ask-user/portable/bridge.test.mjs");
const output = execFileSync(process.execPath, ["--experimental-strip-types", `--import=${audit}`, "--test", plugin, bridge],
  { encoding: "utf8", timeout: 60000 });
process.stdout.write(output);
const observed = output.split("\n").filter(line => line.includes(marker))
  .map(line => JSON.parse(line.slice(line.indexOf(marker) + marker.length)));
assert.ok(observed.some(x => x.argv[1] === plugin && x.offline === "0" && x.testContext === "child-v8"));
assert.ok(observed.some(x => x.argv[1] === bridge && x.offline === "1" && x.testContext === "child-v8"));
assert.equal(process.env.PI_OFFLINE, "1", "coordinator environment must remain offline");
console.log("worker-argv-and-offline-boundaries=ok");
