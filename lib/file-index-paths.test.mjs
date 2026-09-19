import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const { subtractDeletedPaths } = await jiti.import("./file-index-paths.ts");

test("subtracts deleted paths while preserving listing order", () => {
  const listed = ["src/a.ts", "gone.md", "src/b.ts", "sub/gone space.md"];
  const deleted = ["gone.md", "sub/gone space.md"];
  assert.deepEqual(subtractDeletedPaths(listed, deleted), ["src/a.ts", "src/b.ts"]);
});

test("an empty deleted list returns the listing unchanged", () => {
  const listed = ["a.ts", "b.ts"];
  assert.deepEqual(subtractDeletedPaths(listed, []), ["a.ts", "b.ts"]);
});

test("an empty listing yields an empty result", () => {
  assert.deepEqual(subtractDeletedPaths([], ["gone.md"]), []);
});

test("handles paths containing spaces and non-ASCII characters", () => {
  const listed = ["keep me.md", "中文 gone.md", "emoji 🚀.txt", "nested/中文 空格.md"];
  const deleted = ["中文 gone.md", "nested/中文 空格.md"];
  assert.deepEqual(subtractDeletedPaths(listed, deleted), ["keep me.md", "emoji 🚀.txt"]);
});

test("ignores deleted paths that are not in the listing", () => {
  const listed = ["a.ts", "b.ts"];
  const deleted = ["ghost.md", "other/ghost.md"];
  assert.deepEqual(subtractDeletedPaths(listed, deleted), ["a.ts", "b.ts"]);
});

test("does not mutate the input arrays", () => {
  const listed = ["a.ts", "gone.md"];
  const deleted = ["gone.md"];
  const result = subtractDeletedPaths(listed, deleted);
  assert.deepEqual(listed, ["a.ts", "gone.md"]);
  assert.deepEqual(deleted, ["gone.md"]);
  assert.notEqual(result, listed);
});
