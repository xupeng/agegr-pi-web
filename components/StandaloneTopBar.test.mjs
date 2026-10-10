import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createJiti } from "jiti";

const source = await readFile(new URL("./StandaloneTopBar.tsx", import.meta.url), "utf8");
const shell = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("./StandaloneTopBar.css", import.meta.url), "utf8");
const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" }, tsconfigPaths: true,
});
const React = await jiti.import("react");
const { renderToStaticMarkup } = await jiti.import("react-dom/server");
const { StandaloneTopBar } = await jiti.import("./StandaloneTopBar.tsx");

test("server renders one visible surface and one empty-space-preserving slot without browser APIs", () => {
  for (const sidebarWidth of [0, 260, 320]) {
    const html = renderToStaticMarkup(React.createElement(StandaloneTopBar, { sidebarWidth }, React.createElement("button", null, "fixture")));
    assert.equal(html, `<div class="app-topbar-slot" style="--topbar-sidebar-width:${sidebarWidth}px"><div class="app-topbar-surface" data-app-topbar="chat"><button>fixture</button></div></div>`);
  }
});

test("WebKit standalone is fixed before measurement, without changing measured bounds", () => {
  assert.match(css, /@supports \(-webkit-touch-callout: none\) \{\s*@media \(display-mode: standalone\) \{\s*\.app-topbar-surface \{\s*position: fixed;\s*top: 0;\s*left: var\(--topbar-left, var\(--topbar-initial-left\)\);\s*right: env\(safe-area-inset-right\);\s*width: var\(--topbar-width, auto\);\s*z-index: 30;/);
  assert.match(css, /\.app-topbar-surface\[data-measured="true"\] \{\s*right: auto;\s*\}/);
  for (const name of ["slot", "surface"]) {
    const rule = css.match(new RegExp(`\\.app-topbar-${name} \\{([^}]+)\\}`))?.[1];
    assert.match(rule, /height: calc\(36px \+ env\(safe-area-inset-top\)\);/);
  }
  const surface = css.match(/\.app-topbar-surface \{([^}]+)\}/)?.[1];
  assert.match(surface, /background: var\(--bg-panel\);/);
  assert.doesNotMatch(surface, /transform|filter|opacity/);
});

test("critical styles load from the root layout and bootstrap bounds share the layout owner", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /import "\.\.\/components\/StandaloneTopBar\.css";/);
  assert.doesNotMatch(source, /import .*StandaloneTopBar\.css/);
  assert.match(shell, /<StandaloneTopBar sidebarWidth=\{sidebarOpen \? sidebarResizer\.width : 0\}>/);
  assert.match(shell, /const \[rightPanelOpen, setRightPanelOpen\] = useState\(false\)/);
  assert.match(css, /@media \(min-width: 641px\)[\s\S]*?--topbar-initial-left: calc\(env\(safe-area-inset-left\) \+ var\(--topbar-sidebar-width\)\)/);
  assert.doesNotMatch(css, /visibility:|opacity:|display: none|animation:|transition:/);
});

test("measures the actual column on layout, resize and visual viewport changes with cleanup", () => {
  assert.match(source, /slot\.getBoundingClientRect\(\)/);
  assert.match(source, /--topbar-left", `\$\{rect\.left\}px`/);
  assert.match(source, /--topbar-width", `\$\{rect\.width\}px`/);
  assert.match(source, /useLayoutEffect\(measure\)/);
  assert.match(source, /observer\.observe\(slot\)/);
  assert.match(source, /observer\.disconnect\(\)/);
  for (const event of ["resize", "scroll"]) {
    assert.ok(source.includes(`viewport?.addEventListener("${event}", measure)`));
    assert.ok(source.includes(`viewport?.removeEventListener("${event}", measure)`));
  }
  assert.match(source, /window\.removeEventListener\("resize", measure\)/);
});

test("shared dropdowns, mobile branch panel and notification anchor stay outside the fixed surface", () => {
  const start = shell.indexOf("<StandaloneTopBar ");
  const end = shell.indexOf("</StandaloneTopBar>", start);
  assert.ok(start > 0 && end > start);
  assert.ok(shell.indexOf('className="notification-bell"', start) < end);
  assert.ok(shell.indexOf("{isMobile && sessionHasBranches && (", start) > end);
  assert.ok(shell.indexOf("{/* Top panel dropdown", start) > end);
  assert.ok(shell.indexOf('data-notification-anchor="chat-column"', start) > end);
  assert.match(shell, /ref=\{topBarRef\}[\s\S]*?<StandaloneTopBar /);
});
