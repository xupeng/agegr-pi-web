import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { useNotifications } = await jiti.import("./useNotifications.ts");
const { getNotificationServerSnapshot } = await jiti.import("@/lib/notifications/client");

test("hook returns stable SSR four-field state and does not start a connection", () => {
  function Probe() {
    const state = useNotifications();
    assert.equal(state, getNotificationServerSnapshot());
    assert.deepEqual(Object.keys(state).sort(), ["connected", "error", "loading", "snapshot"]);
    return React.createElement("span", null, state.snapshot.items.length);
  }
  assert.equal(renderToStaticMarkup(React.createElement(Probe)), "<span>0</span>");
});

test("read-only hook has no owner effect; AppShell is responsible for lifecycle", async () => {
  const source = await readFile(new URL("./useNotifications.ts", import.meta.url), "utf8");
  assert.match(source, /useSyncExternalStore\(subscribeNotifications, getNotificationClientSnapshot, getNotificationServerSnapshot\)/);
  assert.doesNotMatch(source.slice(source.indexOf("export function")), /useEffect|startNotificationClient\(/);
});
