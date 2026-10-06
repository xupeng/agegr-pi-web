import assert from "node:assert/strict";

export async function checkChatColumnAlignment(page, label) {
  const geometry = await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const scroll = document.querySelector(".chat-content .scrollbar-subtle");
    const fieldset = document.querySelector(".chat-content > .relative.shrink-0 > fieldset");
    const message = scroll?.firstElementChild?.firstElementChild;
    const composer = fieldset?.querySelector(":scope > div");
    if (!scroll || !fieldset || !message || !composer) return null;
    const bounds = (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    };
    return {
      message: bounds(message), composer: bounds(composer),
      scrollWidth: scroll.getBoundingClientRect().width,
      availableWidth: scroll.parentElement.getBoundingClientRect().width,
      gutter: scroll.offsetWidth - scroll.clientWidth,
      scrollable: scroll.scrollHeight > scroll.clientHeight,
      documentOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  assert.ok(geometry, `${label}: chat column and composer must be mounted`);
  console.log(`ALIGN ${label}: ${JSON.stringify(geometry)}`);
  assert.ok(Math.abs(geometry.message.left - geometry.composer.left) <= 1, `${label}: left edges differ`);
  assert.ok(Math.abs(geometry.message.right - geometry.composer.right) <= 1, `${label}: right edges differ`);
  assert.equal(geometry.documentOverflow, false, `${label}: no horizontal document overflow`);
  return geometry;
}

/**
 * AC1/AC3/AC4 for the minimap click preview: the preview panel is an outline of the
 * conversation (12px turn title / 12px h1 and prose / 11px h2 and h3 / 10px number and
 * tool badge), keeps the Oxanium and Cascadia families, and preserves the row geometry the
 * indent-by-level rows were tuned around.
 *
 * Only run this on a scrollable conversation: a short session hides the rail
 * (`visibility: hidden`), so the pointer cannot click it. `sidebarTitle` is the
 * session title whose sidebar row should be compared against the preview sizes.
 */
export async function checkMinimapTypography(page, label, sidebarTitle) {
  // The rail flips to `visible` only after the message list is measured as
  // scrollable, which lags the first paint of a freshly navigated session.
  await page.waitForFunction(() => {
    const rail = document.querySelector(".chat-content .scrollbar-subtle")?.nextElementSibling;
    return !!rail && getComputedStyle(rail).visibility === "visible"
      && !!rail.querySelector("[data-minimap-node-index]");
  });
  const rail = await page.evaluate(() => {
    const scroll = document.querySelector(".chat-content .scrollbar-subtle");
    const element = scroll?.nextElementSibling;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const rows = [...element.querySelectorAll("[data-minimap-node-index]")];
    if (rows.length === 0) return null;
    const tick = rows[Math.floor(rows.length / 2)].getBoundingClientRect();
    const first = rows[0].getBoundingClientRect();
    const last = rows[rows.length - 1].getBoundingClientRect();
    return {
      x: tick.left + tick.width / 2,
      y: tick.top + tick.height / 2,
      blankTopY: (rect.top + first.top) / 2,
      blankBottomY: (last.bottom + rect.bottom) / 2,
      blankTopHeight: first.top - rect.top,
      blankBottomHeight: rect.bottom - last.bottom,
      width: rect.width,
      visibility: getComputedStyle(element).visibility,
    };
  });
  assert.ok(rail, `${label}: minimap rail must sit beside the scroll container`);
  assert.equal(rail.visibility, "visible", `${label}: minimap rail must be visible on a scrollable session`);
  assert.ok(rail.width >= 24, `${label}: minimap rail must keep its 24px tick column`);
  assert.ok(rail.blankTopHeight > 2 && rail.blankBottomHeight > 2,
    `${label}: this fixture must leave blank space above and below the outline ticks`);
  const preview = page.locator("[data-minimap-preview-box]");
  // Blank space in the full-height layout slot must never start the 120ms hover timer.
  for (const [name, y] of [["top", rail.blankTopY], ["bottom", rail.blankBottomY]]) {
    await page.mouse.move(rail.x, y);
    await page.waitForTimeout(240);
    assert.equal(await preview.count(), 0, `${label}: ${name} blank space must not open the preview`);
  }
  // Cross a real tick and leave immediately, without inserting an assertion or sleep between
  // the two moves. Wait well beyond the open delay to detect an uncancelled timer.
  await page.mouse.move(rail.x, rail.y);
  await page.mouse.move(rail.x, rail.blankTopY);
  await page.waitForTimeout(240);
  assert.equal(await preview.count(), 0, `${label}: leaving a tick promptly must cancel hover-open`);

  // A mouse opens the panel by resting on an actual tick row, with no click (`HOVER_OPEN_DELAY_MS`
  // delays it; asserting the delay itself would race the assertion against the timer).
  await page.mouse.move(rail.x, rail.y);
  await preview.waitFor();
  // Clicking the rail while it is open must not toggle the panel shut under the pointer.
  await page.mouse.click(rail.x, rail.y);
  await page.waitForTimeout(240);
  assert.equal(await preview.count(), 1,
    `${label}: clicking the open minimap rail must keep the preview open`);

  const panel = await preview.boundingBox();
  assert.ok(panel, `${label}: minimap preview must have a pointer target`);
  // Stay just inside the right edge: moving over its content must not change the visible
  // typography targets or let rail mousemove reposition the preview's scroll offset.
  await page.mouse.move(panel.x + panel.width - 2, panel.y + panel.height / 2);
  await page.waitForTimeout(240);
  assert.equal(await preview.count(), 1, `${label}: moving from a tick into the panel must keep it open`);

  // Read every target in one frame so a repaint cannot land between reads.
  const observed = await page.evaluate(() => {
    const box = document.querySelector("[data-minimap-preview-box]");
    if (!box) return null;
    const read = (element) => {
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        fontSize: computed.fontSize,
        fontFamily: computed.fontFamily,
        height: element.getBoundingClientRect().height,
      };
    };
    const one = (selector) => box.querySelector(selector);
    return {
      bodyFont: getComputedStyle(document.body).fontFamily,
      user: read(one("[data-minimap-preview-user]")),
      // `.paragraph` is the only preview button without its own data-* hook.
      paragraph: read(one("button:not([data-level]):not([data-minimap-preview-user])")),
      heading1: read(one('[data-level="1"]')),
      heading2: read(one('[data-level="2"]')),
      heading3: read(one('[data-level="3"]')),
      number: read(one("[data-minimap-turn-number]")),
      toolBadge: read(one('[data-minimap-preview-index] [role="img"]')),
    };
  });
  assert.ok(observed, `${label}: minimap preview must be open`);
  console.log(`TYPO ${label}: ${JSON.stringify(observed)}`);

  const expectFontSize = (name, entry, px) => {
    assert.ok(entry, `${label}: minimap preview must render ${name}`);
    assert.equal(entry.fontSize, `${px}px`, `${label}: ${name} must be ${px}px`);
  };
  expectFontSize("user preview", observed.user, 12);
  expectFontSize("paragraph preview", observed.paragraph, 12);
  expectFontSize("h1 preview", observed.heading1, 12);
  expectFontSize("h2 preview", observed.heading2, 11);
  expectFontSize("h3 preview", observed.heading3, 11);
  expectFontSize("turn number", observed.number, 10);
  if (observed.toolBadge) {
    expectFontSize("tool badge", observed.toolBadge, 10);
  } else {
    console.log(`NOTE ${label}: no tool call in this fixture, skipping the .toolBadge size check`);
  }

  // AC3: only font sizes moved; every family is unchanged.
  for (const [name, entry] of [
    ["user preview", observed.user],
    ["paragraph preview", observed.paragraph],
    ["h1 preview", observed.heading1],
  ]) {
    assert.ok(entry.fontFamily.includes("Oxanium"), `${label}: ${name} must keep the root Oxanium stack (${entry.fontFamily})`);
  }
  assert.equal(observed.user.fontFamily, observed.bodyFont, `${label}: preview body font must stay the document root font`);
  for (const [name, entry] of [
    ["turn number", observed.number],
    ["tool badge", observed.toolBadge],
  ]) {
    if (!entry) continue;
    assert.ok(entry.fontFamily.includes("Cascadia"), `${label}: ${name} must keep the mono stack (${entry.fontFamily})`);
  }

  // AC4: every outline row keeps the fixed shell height it was tuned to, so the rail's tick
  // spacing and the panel's scroll position stay stable.
  const expectHeight = (name, entry, px) => {
    assert.ok(entry, `${label}: minimap preview must render ${name}`);
    assert.ok(Math.abs(entry.height - px) < 0.5, `${label}: ${name} must stay ${px}px tall (measured ${entry.height})`);
  };
  expectHeight("h1 preview", observed.heading1, 26);
  expectHeight("h2 preview", observed.heading2, 24);
  expectHeight("h3 preview", observed.heading3, 22);
  expectHeight("user preview", observed.user, 24);

  if (sidebarTitle) {
    await page.locator(`[title="${sidebarTitle}"]`).first().waitFor({ state: "attached" });
    const sidebar = await page.evaluate((title) => {
      const titleNode = document.querySelector(`[title="${title}"]`);
      if (!titleNode) return null;
      return {
        title: getComputedStyle(titleNode).fontSize,
        meta: titleNode.nextElementSibling ? getComputedStyle(titleNode.nextElementSibling).fontSize : null,
      };
    }, sidebarTitle);
    assert.ok(sidebar?.title, `${label}: sidebar row for "${sidebarTitle}" must be mounted`);
    assert.equal(observed.user.fontSize, sidebar.title, `${label}: preview body must match the sidebar session title size`);
    assert.equal(observed.heading2.fontSize, sidebar.meta, `${label}: preview secondary must match the sidebar meta size`);
    console.log(`TYPO ${label} sidebar: ${JSON.stringify(sidebar)}`);
  }

  await page.mouse.move(rail.x, rail.blankBottomY);
  await page.waitForTimeout(240);
  assert.equal(await preview.count(), 0, `${label}: leaving the panel for blank rail space must close it`);

  return observed;
}

export async function checkChatAppearanceReset(page) {
  const width = page.getByRole("slider", { name: "Chat content width", exact: true });
  const fontSize = page.getByRole("slider", { name: "Chat font size", exact: true });
  const resetWidth = page.getByRole("button", { name: "Reset chat content width", exact: true });
  const resetFontSize = page.getByRole("button", { name: "Reset chat font size", exact: true });
  await width.press("End");
  await fontSize.press("End");
  await resetWidth.click();
  assert.equal(await width.inputValue(), "820");
  assert.equal(await fontSize.inputValue(), "24", "Resetting width must preserve font size");
  await width.press("End");
  await resetFontSize.click();
  assert.equal(await fontSize.inputValue(), "14");
  assert.equal(await width.inputValue(), "2000", "Resetting font size must preserve width");
  await resetWidth.click();
  assert.deepEqual(await page.evaluate(() => ({
    width: localStorage.getItem("pi-chat-content-width"),
    fontSize: localStorage.getItem("pi-chat-content-font-size"),
    appliedWidth: document.documentElement.style.getPropertyValue("--chat-content-max-width"),
    appliedFontSize: document.documentElement.style.getPropertyValue("--chat-content-font-size"),
  })), { width: "820", fontSize: "14", appliedWidth: "820px", appliedFontSize: "14px" });
  await page.reload({ waitUntil: "networkidle" });
  const showSidebar = page.getByRole("button", { name: "Show sidebar", exact: true });
  if (await showSidebar.isVisible()) await showSidebar.click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(await width.inputValue(), "820");
  assert.equal(await fontSize.inputValue(), "14");
  assert.equal(await resetWidth.isDisabled(), true);
  assert.equal(await resetFontSize.isDisabled(), true);
}

export async function checkChatAppearance(page) {
  await page.setViewportSize({ width: 2560, height: 1100 });
  const textarea = page.locator(".chat-input-textarea");
  const openSettings = () => page.getByRole("button", { name: "Settings", exact: true }).click();
  const closeSettings = () => page.keyboard.press("Escape");
  const width = page.getByRole("slider", { name: "Chat content width", exact: true });
  const fontSize = page.getByRole("slider", { name: "Chat font size", exact: true });
  const font = (locator) => locator.evaluate((el) => getComputedStyle(el).fontSize);
  const fittedHeight = async () => {
    await page.waitForFunction(() => {
      const input = document.querySelector(".chat-input-textarea");
      return input && (input.scrollHeight <= input.clientHeight + 1 || input.clientHeight >= 199);
    });
    return textarea.evaluate((el) => el.clientHeight);
  };

  await openSettings();
  assert.equal(await width.inputValue(), "820");
  assert.equal(await fontSize.inputValue(), "14");
  await width.press("End");
  await closeSettings();
  const draft = "Existing drafts resize when the available width or the reading font changes. ".repeat(6);
  await textarea.fill(draft);
  const wideHeight = await fittedHeight();
  await openSettings();
  await width.press("Home");
  await closeSettings();
  const narrowHeight = await fittedHeight();
  assert.ok(narrowHeight > wideHeight, "Narrowing must grow the draft without another keystroke");

  await openSettings();
  await fontSize.press("End");
  await closeSettings();
  assert.ok(await fittedHeight() > narrowHeight, "Increasing the font must grow the draft");
  await openSettings();
  await width.press("End");
  await fontSize.press("Home");
  for (let i = 12; i < 18; i++) await fontSize.press("ArrowRight");
  await closeSettings();
  assert.equal(await textarea.inputValue(), draft);
  assert.ok(await fittedHeight() < narrowHeight, "Widening must shrink the existing draft");
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".markdown-code-block pre").waitFor();
  assert.equal(await font(textarea), "18px");
  assert.equal(await font(page.locator(".markdown-user-message")), "18px");
  assert.equal(await font(page.locator(".markdown-code-block pre")), "16.5px");

  await openSettings();
  assert.equal(await width.inputValue(), "2000");
  assert.equal(await fontSize.inputValue(), "18");

  const shortcutHint = page.getByText(
    "Shortcut: Ctrl/⌘ + Shift + - / = / 0 (0 restores the default)",
    { exact: true },
  );
  assert.equal(await shortcutHint.isVisible(), true, "Settings must name the font size shortcut");
  assert.equal(
    await fontSize.getAttribute("aria-keyshortcuts"),
    "Control+Shift+- Meta+Shift+- Control+Shift+= Meta+Shift+= Control+Shift+0 Meta+Shift+0",
  );

  // Ctrl/Cmd+Shift+- and Ctrl/Cmd+Shift+= step the chat font size by one pixel,
  // exactly like one notch of the slider. `code`-based matching is what keeps
  // them working under Shift and on non-US layouts, and preventDefault is what
  // keeps Chromium's own Ctrl+Shift+= page zoom out of the way. Ctrl/Cmd+Shift+0
  // puts the shared default back through the same setter.
  //
  // NOTE: written but never executed for 09-28-chat-font-size-shortcut (the
  // user chose manual acceptance). See the task's research/verification.md.
  await fontSize.press("Home");
  await page.keyboard.press("Control+Shift+Minus");
  assert.equal(await fontSize.inputValue(), "12", "The lower bound must clamp, not reset");
  await page.keyboard.press("Control+Shift+Equal");
  assert.equal(await fontSize.inputValue(), "13");
  await page.keyboard.press("Meta+Shift+Equal");
  assert.equal(await fontSize.inputValue(), "14");
  await page.keyboard.press("Meta+Shift+Minus");
  assert.equal(await fontSize.inputValue(), "13");
  await fontSize.press("End");
  await page.keyboard.press("Control+Shift+Equal");
  assert.equal(await fontSize.inputValue(), "24", "The upper bound must clamp too");
  await page.keyboard.press("Control+Shift+0");
  assert.equal(await fontSize.inputValue(), "14", "The reset key must restore the default");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("pi-chat-content-font-size")),
    "14",
  );
  await fontSize.press("Home");
  for (let i = 12; i < 18; i++) await page.keyboard.press("Control+Shift+Equal");
  await closeSettings();
  // Registered on window, so it must keep working with the composer focused
  // rather than the slider.
  await textarea.focus();
  await page.keyboard.press("Control+Shift+Equal");
  assert.equal(await font(textarea), "19px");
  assert.equal(
    await page.evaluate(() => localStorage.getItem("pi-chat-content-font-size")),
    "19",
  );
  await openSettings();
  assert.equal(await fontSize.inputValue(), "19");

  await checkChatAppearanceReset(page);
  for (const viewport of [{ width: 1280, height: 600 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    const languageOptions = page.locator(".settings-language-options button");
    for (let index = 0; index < await languageOptions.count(); index += 1) {
      const option = languageOptions.nth(index);
      // Language is no longer the final General section. Scroll the control
      // itself into view; forcing the whole pane to its bottom can move this
      // otherwise reachable section above the viewport and produces a false
      // hit-test failure.
      await option.scrollIntoViewIfNeeded();
      assert.equal(await option.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        return centerX >= 0
          && centerX <= innerWidth
          && centerY >= 0
          && centerY <= innerHeight
          && el.contains(document.elementFromPoint(centerX, centerY));
      }), true, "Every language option must remain reachable in a short settings panel");
    }
  }
  await fontSize.press("Home");
  await closeSettings();
  assert.equal(await font(textarea), "16px", "Mobile inputs retain the focus-zoom minimum");
  await textarea.fill("A mobile draft wraps and resizes within the available space.");
  await fittedHeight();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log("PASS: chat appearance persistence, typography, draft resizing, and short settings panels");
}
