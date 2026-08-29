import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

// Isolate the default agent dir so the module-level default path never
// touches the real ~/.pi/agent.
const testAgentDir = mkdtempSync(join(tmpdir(), "pi-web-open-asks-"));
process.env.PI_CODING_AGENT_DIR = testAgentDir;
test.after(() => rmSync(testAgentDir, { recursive: true, force: true }));

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  moduleCache: false,
});
const {
  loadOpenAsks,
  writeOpenAsks,
  readPersistedAsk,
  persistOpenAsk,
  forgetPersistedAsk,
} = await jiti.import("./persist.ts");

function ask(overrides = {}) {
  return {
    askId: "ask-1",
    askedAt: "2026-08-28T00:00:00.000Z",
    questions: [
      {
        id: "q1",
        question: "Which database?",
        options: [
          { value: "pg", label: "Postgres" },
          { value: "sqlite", label: "SQLite" },
        ],
      },
    ],
    ...overrides,
  };
}

function tempFile() {
  return join(testAgentDir, `open-asks-${Math.random().toString(36).slice(2)}.json`);
}

test("loadOpenAsks on a missing file degrades to an empty map", () => {
  assert.deepEqual(Array.from(loadOpenAsks(tempFile())), []);
});

test("persistOpenAsk writes the ask and readPersistedAsk round-trips it", () => {
  const file = tempFile();
  persistOpenAsk("s1", ask(), file);
  assert.deepEqual(readPersistedAsk("s1", file), ask());
  assert.equal(readPersistedAsk("s2", file), undefined);

  const parsed = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(parsed.version, 1);
  assert.equal(parsed.asks.s1.askId, "ask-1");
});

test("persistOpenAsk replaces an earlier ask of the same session", () => {
  const file = tempFile();
  persistOpenAsk("s1", ask({ askId: "ask-1" }), file);
  persistOpenAsk("s1", ask({ askId: "ask-2" }), file);
  assert.equal(readPersistedAsk("s1", file).askId, "ask-2");
});

test("persistOpenAsk keeps other sessions' asks intact", () => {
  const file = tempFile();
  persistOpenAsk("s1", ask(), file);
  persistOpenAsk("s2", ask({ askId: "ask-2" }), file);
  assert.equal(readPersistedAsk("s1", file).askId, "ask-1");
  assert.equal(readPersistedAsk("s2", file).askId, "ask-2");
});

test("forgetPersistedAsk deletes only the named session", () => {
  const file = tempFile();
  persistOpenAsk("s1", ask(), file);
  persistOpenAsk("s2", ask({ askId: "ask-2" }), file);
  forgetPersistedAsk("s1", file);
  assert.equal(readPersistedAsk("s1", file), undefined);
  assert.equal(readPersistedAsk("s2", file).askId, "ask-2");
});

test("forgetPersistedAsk on an absent session is a no-op", () => {
  const file = tempFile();
  persistOpenAsk("s1", ask(), file);
  forgetPersistedAsk("s2", file);
  assert.equal(readPersistedAsk("s1", file).askId, "ask-1");
});

test("corrupt JSON degrades to an empty map without throwing", () => {
  const file = tempFile();
  writeFileSync(file, "{not json", "utf8");
  assert.deepEqual(Array.from(loadOpenAsks(file)), []);
  assert.equal(readPersistedAsk("s1", file), undefined);
});

test("a version mismatch degrades to an empty map", () => {
  const file = tempFile();
  writeFileSync(file, JSON.stringify({ version: 99, asks: { s1: ask() } }), "utf8");
  assert.deepEqual(Array.from(loadOpenAsks(file)), []);
});

test("malformed single entries are skipped while valid ones survive", () => {
  const file = tempFile();
  writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      asks: {
        good: ask(),
        bad: { askId: "", askedAt: "x", questions: [] },
        worse: { askId: "y", askedAt: "x", questions: [{ id: 1 }] },
        worst: "nope",
      },
    }),
    "utf8",
  );
  const asks = loadOpenAsks(file);
  assert.deepEqual(Array.from(asks.keys()), ["good"]);
});

test("writeOpenAsks persists the map and is atomic (no temp leftovers)", () => {
  const file = tempFile();
  const asks = new Map([["s1", ask()]]);
  writeOpenAsks(asks, file);
  assert.equal(readPersistedAsk("s1", file).askId, "ask-1");
  const leftovers = readdirSync(testAgentDir).filter((name) => name.includes(".tmp"));
  assert.deepEqual(leftovers, []);
});

test("writes to an unwritable directory fail silently", () => {
  assert.doesNotThrow(() => persistOpenAsk("s1", ask(), join(testAgentDir, "missing-dir", "asks.json")));
});
