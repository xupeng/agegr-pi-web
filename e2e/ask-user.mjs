// Browser regression for the shared `ask_user` React view.
//
// The retired MCP Apps iframe path had no browser coverage at all: its
// behaviour was only asserted against a DOM shim, not a real browser. This
// module drives the real component
// in Chromium: form state, keyboard interaction, locking, summaries, payload
// assembly and the reject/retry path.
//
// The fixture needs no model and no wrapper. `run.mjs` writes a normal session
// plus a persisted open ask (`pi-web-open-asks.json`); `GET
// /api/sessions/[id]/state` falls back to the persisted ask when the wrapper is
// gone, and `useAgentSession` rehydrates `pendingAsk` on mount. The ask
// commands themselves are stubbed with `page.route`, so no agent session is
// ever created for this fixture.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/** Fixture session id; kept in sync with the session `run.mjs` writes. */
export const ASK_USER_SESSION = "e2e-ask-user-session";

/** The open ask's id used by the fixture. */
export const ASK_USER_ASK_ID = "e2e-ask-1";

/** Two questions: one single-choice, one multiple-choice, both free-textable. */
export const askUserQuestions = [
  {
    id: "env",
    question: "E2E which environment?",
    detail: "E2E pick exactly one.",
    options: [
      { value: "dev", label: "E2E Development" },
      { value: "prod", label: "E2E Production", detail: "E2E live" },
      { value: "staging", label: "E2E Staging" },
    ],
  },
  {
    id: "regions",
    question: "E2E which regions?",
    multiple: true,
    options: [
      { value: "eu", label: "E2E Europe" },
      { value: "us", label: "E2E United States" },
    ],
  },
];

/**
 * Write the persisted open ask the state route falls back to. The shape is
 * `lib/ask-user/persist.ts`'s `OpenAsksFile`.
 */
export function writeAskUserFixture(agentDir, sessionId = ASK_USER_SESSION) {
  writeFileSync(join(agentDir, "pi-web-open-asks.json"), JSON.stringify({
    version: 1,
    asks: {
      [sessionId]: {
        askId: ASK_USER_ASK_ID,
        askedAt: "2026-08-23T00:00:00.000Z",
        questions: askUserQuestions,
      },
    },
  }));
}

/**
 * Install the ask-command stub. Every `ask_submit` / `ask_cancel` POST is
 * answered locally and held until the test releases it, so the test can observe
 * the locked ("submitting"/"cancelling") state before the card unmounts.
 *
 * `release("close")` answers with a normal closed result; `release("reject")`
 * answers with `{ error }`, which makes `submitAsk` throw and drives the view's
 * reject/retry path. The stub is limited to the ask fixture session and to
 * POST, so a stray GET (state/projection) still reaches the real route.
 */
async function installAskCommandStub(page, sessionId) {
  const submits = [];
  const cancels = [];
  let holds = [];

  const pattern = `**/api/agent/${sessionId}`;
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    let body;
    try {
      body = request.postDataJSON();
    } catch {
      return route.fallback();
    }
    if (body?.type === "ask_submit") {
      submits.push(body);
      const kind = await new Promise((resolve) => holds.push(resolve));
      await route.fulfill({
        json: kind === "reject"
          ? { error: "E2E synthetic ask_submit failure" }
          : { success: true, data: { result: "closed" } },
      });
      return;
    }
    if (body?.type === "ask_cancel") {
      cancels.push(body);
      await new Promise((resolve) => holds.push(resolve));
      await route.fulfill({ json: { success: true, data: { result: "closed" } } });
      return;
    }
    return route.fallback();
  };

  await page.route(pattern, handler);

  return {
    submits,
    cancels,
    async release(kind = "close") {
      const deadline = Date.now() + 5000;
      while (holds.length === 0 && Date.now() < deadline) await delay(20);
      const pending = holds;
      holds = [];
      for (const resolve of pending) resolve(kind);
    },
    async remove() {
      await page.unroute(pattern);
    },
  };
}

/** Suppress the expected `console.error` the app logs on a rejected close. */
async function silenceExpectedConsoleError(page) {
  await page.evaluate(() => {
    window.__e2eAskOriginalConsoleError = window.console.error;
    window.console.error = () => {};
  });
}

/** Restore whatever `silenceExpectedConsoleError` captured. */
async function restoreConsoleError(page) {
  await page.evaluate(() => {
    if (window.__e2eAskOriginalConsoleError) {
      window.console.error = window.__e2eAskOriginalConsoleError;
      delete window.__e2eAskOriginalConsoleError;
    }
  });
}

async function openCard(page, base, sessionId) {
  await page.goto(`${base}/?session=${sessionId}`, { waitUntil: "domcontentloaded" });
  const card = page.locator('[data-ask-user-view="shared"]');
  await card.getByRole("dialog").waitFor();
  return card;
}

/**
 * Pi Web maps its own tokens onto `--pi-ask-*`; the view must therefore follow
 * whatever theme is live. Comparing against a probe element that resolves the
 * same Pi Web variable keeps this format-agnostic - `--bg-panel` may be a hex,
 * a `light-dark()` pair or a nested `var()`, and only the resolved value is
 * comparable.
 */
async function assertThemeMapping(card) {
  const samples = await card.evaluate((el) => {
    const root = document.documentElement;
    const original = root.dataset.theme;
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const resolve = (variable) => {
      probe.style.backgroundColor = "";
      probe.style.backgroundColor = `var(${variable})`;
      return getComputedStyle(probe).backgroundColor;
    };
    const out = [];
    for (const theme of ["light", "dark", "mist", "rose", "pine"]) {
      root.dataset.theme = theme;
      const cardStyle = getComputedStyle(el);
      out.push({
        theme,
        surface: cardStyle.backgroundColor,
        expectedSurface: resolve("--bg-panel"),
        text: cardStyle.color,
        expectedText: resolve("--text"),
        border: cardStyle.borderTopColor,
        expectedBorder: resolve("--border"),
        fontFamily: cardStyle.fontFamily,
      });
    }
    probe.remove();
    root.dataset.theme = original;
    return out;
  });

  const bodyStack = await card.evaluate(() => getComputedStyle(document.body).fontFamily);
  for (const sample of samples) {
    assert.equal(sample.surface, sample.expectedSurface, `--pi-ask-surface follows --bg-panel in ${sample.theme}`);
    assert.equal(sample.text, sample.expectedText, `--pi-ask-text follows --text in ${sample.theme}`);
    assert.equal(sample.border, sample.expectedBorder, `--pi-ask-border follows --border in ${sample.theme}`);
  }
  assert.equal(samples[0].fontFamily, bodyStack, "the view inherits the UI font stack, not the chat prose stack");
  assert.ok(new Set(samples.map((sample) => sample.surface)).size >= 3, "the surface actually tracks the theme");
}

/** Read `aria-checked` as a boolean from an option button. */
async function isChecked(locator) {
  return (await locator.getAttribute("aria-checked")) === "true";
}

/** The fixed set of `tabindex` values of a group's option buttons. */
async function tabIndexes(options) {
  return Promise.all((await options.all()).map((option) => option.getAttribute("tabindex")));
}

/**
 * Drive the shared `ask_user` view in the browser.
 *
 * @param {import("playwright").Page} page
 * @param {{ base: string, sessionId?: string }} ctx
 */
export async function checkAskUserView(page, ctx) {
  const base = ctx.base;
  const sessionId = ctx.sessionId ?? ASK_USER_SESSION;
  const stub = await installAskCommandStub(page, sessionId);
  const cards = () => page.locator('[data-ask-user-view="shared"]');

  try {
    // --- Rendering ---------------------------------------------------------
    let card = await openCard(page, base, sessionId);
    assert.equal(await card.count(), 1, "exactly one shared-view host");
    assert.match(await card.getAttribute("data-ask-user-view"), /^shared$/);
    await card.getByRole("dialog").waitFor();
    await card.locator(".pi-ask-title", { hasText: "Questions from the agent" }).waitFor();
    const envGroup = card.getByRole("radiogroup");
    await envGroup.waitFor();
    const envOptions = envGroup.getByRole("radio");
    assert.equal(await envOptions.count(), 3, "single-choice options render");
    const regionGroup = card.getByRole("group");
    await regionGroup.waitFor();
    const regionOptions = regionGroup.getByRole("checkbox");
    assert.equal(await regionOptions.count(), 2, "multiple-choice options render");
    // The host container carries the variable mapping; the surface itself is
    // painted by the view's own `.pi-ask` root.
    const surface = card.locator(".pi-ask");
    await surface.waitFor();
    const singleOther = card.getByLabel("Type your own answer…");
    const multipleOther = card.getByLabel("Add details (kept alongside the selected options)…");
    const supplement = card.getByLabel("Additional info (optional)");
    const submit = card.getByRole("button", { name: "Submit" });
    const cancel = card.getByRole("button", { name: "Cancel" });
    await singleOther.waitFor();
    await multipleOther.waitFor();
    await supplement.waitFor();
    await submit.waitFor();
    await cancel.waitFor();
    await assertThemeMapping(surface);

    // --- Roving tabindex + arrow keys (single choice) ----------------------
    const dev = envGroup.getByRole("radio", { name: /E2E Development/ });
    const prod = envGroup.getByRole("radio", { name: /E2E Production/ });
    const staging = envGroup.getByRole("radio", { name: /E2E Staging/ });
    assert.deepEqual(await tabIndexes(envOptions), ["0", "-1", "-1"], "an unselected radiogroup is one tab stop (the first option)");

    await dev.click();
    assert.equal(await isChecked(dev), true);
    assert.deepEqual(await tabIndexes(envOptions), ["0", "-1", "-1"], "the selected option owns the group's single tab stop");

    await dev.focus();
    await page.keyboard.press("ArrowDown");
    assert.equal(await isChecked(prod), true, "ArrowDown moves and selects");
    assert.equal(await isChecked(dev), false);
    assert.equal(await prod.evaluate((el) => el === document.activeElement), true, "ArrowDown moves focus");
    assert.deepEqual(await tabIndexes(envOptions), ["-1", "0", "-1"]);
    await page.keyboard.press("ArrowUp");
    assert.equal(await isChecked(dev), true, "ArrowUp moves back and selects");
    assert.equal(await isChecked(staging), false);

    // --- Option / custom-text mutual exclusion (single choice) -------------
    await singleOther.fill("E2E custom only");
    assert.equal(await isChecked(dev), false, "typing custom text clears the picked option");
    await dev.click();
    assert.equal(await singleOther.inputValue(), "", "picking an option clears that question's custom text");
    assert.equal(await isChecked(dev), true);

    // --- Multiple choice: Space toggles, arrows do nothing -----------------
    const europe = regionGroup.getByRole("checkbox", { name: /E2E Europe/ });
    await europe.focus();
    await page.keyboard.press("ArrowDown");
    assert.equal(await isChecked(europe), false, "arrow keys do not toggle a multiple-choice option");
    assert.equal(await europe.evaluate((el) => el === document.activeElement), true, "arrow keys do not move inside a multiple-choice group");
    await page.keyboard.press("Space");
    assert.equal(await isChecked(europe), true, "Space toggles a multiple-choice option");
    await multipleOther.fill("E2E other");
    assert.equal(await isChecked(europe), true, "custom text coexists with a checked option");

    await supplement.fill("E2E supplement");

    // --- Submitting: lock, summaries, status focus -------------------------
    await silenceExpectedConsoleError(page);
    await submit.click();
    const status = card.locator(".pi-ask-status");
    await status.waitFor();
    assert.equal(await status.evaluate((el) => el === document.activeElement), true, "the locked status row receives focus");
    assert.match(await status.innerText(), /Submitted/, "the locked footer reports the in-flight close");
    // The locked footer *replaces* the hint and the action buttons rather than
    // disabling them, so a second submit is not merely disabled - it is gone.
    assert.equal(await card.getByRole("button", { name: "Submit" }).count(), 0, "the lock removes the submit button");
    assert.equal(await card.getByRole("button", { name: "Cancel" }).count(), 0, "the lock removes the cancel button");
    assert.equal(await dev.isDisabled(), true, "options are disabled while the response is in flight");
    assert.deepEqual(await card.locator(".pi-ask-summary").allInnerTexts(), ["✓ dev", "✓ eu · E2E other"]);

    await stub.release("reject");
    const error = card.locator('[role="alert"]');
    await error.waitFor();
    assert.match(await error.innerText(), /ask action failed/);
    await card.getByRole("button", { name: "Submit" }).waitFor();
    assert.equal(await card.getByRole("button", { name: "Submit" }).isDisabled(), false, "a rejected submit unlocks the form");
    assert.equal(await dev.isDisabled(), false, "a rejected submit re-enables the controls");
    await restoreConsoleError(page);

    assert.equal(stub.submits.length, 1, "one ask_submit reached the server");
    assert.equal(stub.submits[0].askId, ASK_USER_ASK_ID);
    assert.deepEqual(stub.submits[0].answers, [
      { id: "env", values: ["dev"] },
      { id: "regions", values: ["eu"], otherText: "E2E other" },
    ]);
    assert.equal(stub.submits[0].supplement, "E2E supplement", "the supplement reaches the ask_submit payload");

    // --- Retry: clears the stale error, then closes the card ---------------
    await submit.click();
    await status.waitFor();
    assert.equal(await error.count(), 0, "retrying clears the stale error");
    await stub.release("close");
    await card.waitFor({ state: "detached" });
    assert.equal(stub.submits.length, 2, "the retry sent a second ask_submit");
    assert.equal(await cards().count(), 0, "a closed ask removes the shared-view host");

    // --- Cancel path -------------------------------------------------------
    card = await openCard(page, base, sessionId);
    await card.getByRole("button", { name: "Cancel" }).click();
    const cancelStatus = card.locator(".pi-ask-status");
    await cancelStatus.waitFor();
    assert.match(await cancelStatus.innerText(), /Cancelling/);
    assert.equal(await card.getByRole("button", { name: "Submit" }).count(), 0, "cancelling removes the action buttons too");
    await stub.release("close");
    await card.waitFor({ state: "detached" });
    assert.equal(stub.cancels.length, 1, "ask_cancel reached the server");

    console.log(`PASS: shared ask_user view render, keyboard, submit lock/reject/retry, and cancel at ${page.viewportSize().width}px`);
  } finally {
    await restoreConsoleError(page).catch(() => {});
    await stub.remove();
  }
}
