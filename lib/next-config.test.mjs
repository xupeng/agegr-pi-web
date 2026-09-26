import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("scopes Next.js output file tracing to the pi-web package", async () => {
  const config = await createJiti(import.meta.url).import("../next.config.ts", { default: true });

  assert.equal(config.outputFileTracingRoot, projectRoot);
});

test("no font route needs CORS: the ask view receives font bytes over postMessage", async () => {
  const config = await createJiti(import.meta.url).import("../next.config.ts", { default: true });
  const headers = await config.headers();

  // An opaque-origin frame cannot load /fonts/** at all (Chromium blocks the
  // request as local-network access, and its origin cannot be granted the
  // permission), so the view must never depend on a CORS header here.
  assert.equal(headers.some((entry) => entry.source.startsWith("/fonts")), false);
});
