import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("model selector data preserves image input capability metadata", async () => {
  const source = await readFile(new URL("./route.ts", import.meta.url), "utf-8");

  assert.match(source, /input:\s*\[\.\.\.m\.input\]/);
});
