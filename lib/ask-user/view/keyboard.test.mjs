import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, moduleCache: false });
const { radioNavigationTarget, radioTabIndex } = await jiti.import("./keyboard.ts");

const source = await readFile(new URL("./keyboard.ts", import.meta.url), "utf8");

test("radioTabIndex keeps one tab stop: the selected option, else the first", () => {
  // Nothing selected: the first option owns the group's single tab stop.
  assert.equal(radioTabIndex(false, false, 0), 0);
  assert.equal(radioTabIndex(false, false, 1), -1);
  assert.equal(radioTabIndex(false, false, 2), -1);

  // A selection moves the tab stop to the selected option.
  assert.equal(radioTabIndex(true, true, 2), 0);
  assert.equal(radioTabIndex(false, true, 0), -1);
  assert.equal(radioTabIndex(false, true, 1), -1);
});

test("a forward arrow on an unselected group selects the first option", () => {
  assert.equal(radioNavigationTarget(-1, "ArrowDown", 3), 0);
  assert.equal(radioNavigationTarget(-1, "ArrowRight", 3), 0);
});

test("a backward arrow on an unselected group selects the last option", () => {
  assert.equal(radioNavigationTarget(-1, "ArrowUp", 3), 2);
  assert.equal(radioNavigationTarget(-1, "ArrowLeft", 3), 2);
});

test("Home and End jump to the ends, selected or not", () => {
  assert.equal(radioNavigationTarget(-1, "Home", 4), 0);
  assert.equal(radioNavigationTarget(-1, "End", 4), 3);
  assert.equal(radioNavigationTarget(2, "Home", 4), 0);
  assert.equal(radioNavigationTarget(1, "End", 4), 3);
});

test("arrows move and wrap inside a selected group", () => {
  assert.equal(radioNavigationTarget(1, "ArrowDown", 3), 2);
  assert.equal(radioNavigationTarget(1, "ArrowRight", 3), 2);
  assert.equal(radioNavigationTarget(1, "ArrowUp", 3), 0);
  assert.equal(radioNavigationTarget(1, "ArrowLeft", 3), 0);
  assert.equal(radioNavigationTarget(2, "ArrowDown", 3), 0, "forward wraps");
  assert.equal(radioNavigationTarget(0, "ArrowUp", 3), 2, "backward wraps");
});

test("an empty option list is not navigable", () => {
  for (const key of ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"]) {
    assert.equal(radioNavigationTarget(-1, key, 0), null, `${key} on an empty group`);
    assert.equal(radioNavigationTarget(0, key, 0), null, `${key} with a stale index`);
  }
});

test("keys the view does not own return null and change nothing", () => {
  for (const key of ["Enter", "Escape", "Tab", " ", "a", "PageDown"]) {
    assert.equal(radioNavigationTarget(1, key, 3), null, `${key} must not navigate`);
  }
});

test("an out-of-range current index is treated as no selection", () => {
  assert.equal(radioNavigationTarget(9, "ArrowDown", 3), 0);
  assert.equal(radioNavigationTarget(9, "ArrowUp", 3), 2);
});

test("the keyboard module is pure: no DOM, React, or host imports", () => {
  const specifiers = [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(specifiers, [], "the keyboard maths must not import anything");
  assert.doesNotMatch(source, /\bdocument\b|\bwindow\b|require\s*\(/);
});
