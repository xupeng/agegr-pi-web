import test from "node:test";
import assert from "node:assert/strict";

async function loadSubject() {
  return import("./session-restore.ts");
}

test("reads the session param from a URL search string", async () => {
  const { urlSessionParam } = await loadSubject();
  assert.equal(urlSessionParam("?session=e2e-rich-session"), "e2e-rich-session");
  assert.equal(urlSessionParam("?cwd=%2Ftmp%2Fproject&session=abc"), "abc");
  assert.equal(urlSessionParam("?session=abc%20d"), "abc d");
});

test("treats a missing or empty session param as absent", async () => {
  const { urlSessionParam } = await loadSubject();
  assert.equal(urlSessionParam(""), null);
  assert.equal(urlSessionParam("?"), null);
  assert.equal(urlSessionParam("?cwd=%2Ftmp%2Fproject"), null);
  assert.equal(urlSessionParam("?session="), null);
});

test("an unresolved ?session= blocks the remembered-session restore", async () => {
  const { canRestoreRememberedSession } = await loadSubject();
  assert.equal(
    canRestoreRememberedSession({ initialSessionRestored: false, hasUrlSession: true }),
    false,
    "the URL session must win until the sidebar has adopted it",
  );
});

test("a plain load still restores the remembered session", async () => {
  const { canRestoreRememberedSession } = await loadSubject();
  assert.equal(
    canRestoreRememberedSession({ initialSessionRestored: false, hasUrlSession: false }),
    true,
  );
});

test("a resolved ?session= no longer blocks a later project switch", async () => {
  const { canRestoreRememberedSession } = await loadSubject();
  assert.equal(
    canRestoreRememberedSession({ initialSessionRestored: true, hasUrlSession: true }),
    true,
    "switching projects after the URL session was restored is a normal switch",
  );
  assert.equal(
    canRestoreRememberedSession({ initialSessionRestored: true, hasUrlSession: false }),
    true,
  );
});
