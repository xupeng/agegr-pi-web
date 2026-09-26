import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { ASK_USER_THEME_TOKENS, readThemeTokens, sanitizeThemeTokenValue } =
  await jiti.import("./theme-tokens.ts");

test("mirrored tokens are a fixed whitelist with the app's own css variable names", () => {
  const byKey = Object.fromEntries(ASK_USER_THEME_TOKENS.map((token) => [token.key, token.cssVar]));
  assert.equal(byKey.bg, "--bg");
  assert.equal(byKey.bgPanel, "--bg-panel");
  assert.equal(byKey.accent, "--accent");
  assert.equal(byKey.accentContrast, "--accent-contrast");
  assert.equal(byKey.maxWidth, "--chat-content-max-width");
  // The view cannot resolve var(), so nothing may be forwarded by reference.
  assert.equal(sanitizeThemeTokenValue("bg", "var(--bg-panel)"), undefined);
});

test("real palette values from every Pi Web theme are accepted", () => {
  const accepted = [
    "#ffffff",
    "#1a1a1a",
    "#e8e8e8",
    "#a4c2f4",
    "rgba(0,0,0,0.03)",
    "rgb(36, 91, 206)",
    "oklch(0.7 0.1 200 / 50%)",
    "transparent",
  ];
  for (const value of accepted) {
    assert.equal(sanitizeThemeTokenValue("bg", value), value, value);
  }
  assert.equal(sanitizeThemeTokenValue("maxWidth", "820px"), "820px");
  assert.equal(sanitizeThemeTokenValue("maxWidth", "52rem"), "52rem");
});

test("values that could escape the declaration or load something are rejected", () => {
  const rejected = [
    "#fff; background: url(https://evil.example/x.png)",
    "url(https://evil.example/x.png)",
    "&#125;",
    'red" onload="x',
    "expression(alert(1))",
    "var(--some-host-token)",
    "#fff !important",
    "@import 'https://evil.example/x.css'",
    "#".repeat(80),
    "",
    "   ",
  ];
  for (const value of rejected) {
    assert.equal(sanitizeThemeTokenValue("bg", value), undefined, value);
  }
  assert.equal(sanitizeThemeTokenValue("maxWidth", "820px; position: fixed"), undefined);
  assert.equal(sanitizeThemeTokenValue("maxWidth", "100%"), undefined);
  assert.equal(sanitizeThemeTokenValue("unknownKey", "#ffffff"), undefined);
  assert.equal(sanitizeThemeTokenValue("bg", 123), undefined);
});

test("reading computed values keeps what is valid and drops the rest", () => {
  const styles = {
    "--bg": "#ffffff",
    "--bg-panel": " #f5f5f5 ",
    "--accent": "not-a-color",
    "--text": "",
    "--chat-content-max-width": "820px",
  };
  const tokens = readThemeTokens((name) => styles[name]);
  assert.deepEqual(tokens, { bg: "#ffffff", bgPanel: "#f5f5f5", maxWidth: "820px" });
  assert.deepEqual(readThemeTokens(() => undefined), {});
});
