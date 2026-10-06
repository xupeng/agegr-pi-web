import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true, tsconfigPaths: true });
const { isNotificationAnswerContentVisible } = await jiti.import("./visible-content.ts");
const viewport = { left: 0, top: 0, right: 400, bottom: 400 };
const inside = { left: 20, top: 120, right: 100, bottom: 140 };
const below = { ...inside, top: 210, bottom: 230 };

// A small DOM API peer tests witness selection/Range offsets, not browser paint.
// Real paint, focus and scrolling remain the Chromium runner's responsibility.
function fixture(parts) {
  const ranges = [];
  let currentText;
  const root = { contains: () => true, parentElement: null, getBoundingClientRect: () => ({ left: 0, top: 100, right: 400, bottom: 200 }) };
  const body = { parentElement: root, closest: () => null, querySelectorAll: () => [] };
  const nodes = parts.map((part) => ({ textContent: part.text, rect: part.rect,
    parentElement: { parentElement: body,
      closest: (selector) => part.helper && selector.includes("data-notification-nonresult") ? {} : null,
      contains: (hit) => hit === part,
    }, part }));
  body.ownerDocument = {
    defaultView: { getComputedStyle: () => ({ visibility: "visible", display: "block", opacity: "1" }) },
    createTreeWalker: () => { let index = 0; return { nextNode: () => nodes[index++] ?? null }; },
    createRange: () => ({
      setStart: (node, offset) => { currentText = node; ranges.push({ start: offset }); },
      setEnd: (_, offset) => { ranges.at(-1).end = offset; },
      getClientRects: () => [currentText.rect],
    }),
    elementFromPoint: () => currentText.part.covered ? {} : currentText.part,
  };
  return { body, root, ranges };
}

test("a visible code heading with offscreen source does not supply a text witness", () => {
  const f = fixture([{ text: "typescript Copy", rect: inside, helper: true }, { text: "const actual = 1;", rect: below }]);
  assert.equal(isNotificationAnswerContentVisible(f.body, f.root, viewport), false);
  assert.equal(f.ranges.length, 1, "helper text must never create a payload Range");
});

test("first actual code line can count independently of the entire answer height", () => {
  const f = fixture([{ text: "typescript Copy", rect: inside, helper: true }, { text: "const actual = 1;", rect: inside }]);
  assert.equal(isNotificationAnswerContentVisible(f.body, f.root, viewport), true);
});

test("whitespace edges and Mermaid error metadata cannot masquerade as result text", () => {
  const f = fixture([{ text: "Rendering failed", rect: inside, helper: true }, { text: "   payload  ", rect: inside }]);
  assert.equal(isNotificationAnswerContentVisible(f.body, f.root, viewport), true);
  assert.deepEqual(f.ranges, [{ start: 3, end: 10 }]);
});

test("payload text covered by another surface does not count as seen", () => {
  const f = fixture([{ text: "payload", rect: inside, covered: true }]);
  assert.equal(isNotificationAnswerContentVisible(f.body, f.root, viewport), false);
});
