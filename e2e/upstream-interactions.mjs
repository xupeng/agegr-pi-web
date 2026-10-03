import assert from "node:assert/strict";
import { join } from "node:path";

export const CODEMODE_SESSION = "e2e-mcp-codemode";
export const QUEUE_SESSION = "e2e-extension-queues";
const registered = "mcp__docs_v2__search_pages";
const script = 'const found = await tools.mcp__docs_v2__search_pages({ query: "fixture" });\nreturn found;';
const jsonResult = { hits: [{ title: "Fixture page", score: 7 }], next: null };

// Disk fixtures represent completed SDK-style messages, not an MCP connection.
// Deliberately use original names different from the lossy registered name.
export function codemodeEntries(message) {
  const result = (id, parent, callId, name, content, details) => {
    const entry = message(id, parent, "toolResult", content);
    Object.assign(entry.message, { toolCallId: callId, toolName: name, isError: false, details });
    return entry;
  };
  return [
    message("ac-root", null, "user", "AC6 original history prompt"),
    message("ac-mcp", "ac-root", "assistant", [{ type: "toolCall", id: "ac-mcp-call", name: registered, arguments: { query: "fixture" } }]),
    result("ac-mcp-result", "ac-mcp", "ac-mcp-call", registered,
      [{ type: "text", text: JSON.stringify(jsonResult) }], { server: "docs.v2", tool: "search.pages" }),
    message("ac-code", "ac-mcp-result", "assistant", [{ type: "toolCall", id: "ac-code-call", name: "codemode", arguments: { code: script } }]),
    result("ac-code-result", "ac-code", "ac-code-call", "codemode", [
      { type: "text", text: "Script completed\nWall time 0.3 seconds\nOutput:\n" },
      { type: "text", text: "AC6 script output" },
    ], { calls: [
      { id: "ac-code-call/1", name: registered, args: '{"query":"fixture"}', status: "ok", durationMs: 12 },
      { id: "ac-code-call/2", name: "read", args: '{"path":"fixture.txt"}', status: "error", error: "AC6 nested error", durationMs: 25 },
    ] }),
    message("ac-answer", "ac-code-result", "assistant", "AC6 completed answer"),
  ];
}

async function settleLayout(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export async function checkMcpCodemode(page, { base, artifacts, width }) {
  await page.goto(`${base}/?session=${CODEMODE_SESSION}`, { waitUntil: "domcontentloaded" });
  await page.getByText("AC6 completed answer", { exact: true }).waitFor();
  const process = page.getByRole("button", { name: /^Process details/ });
  if (await process.count()) await process.click();
  const mcp = page.getByRole("button", { name: /docs\.v2\/search\.pages/ });
  await mcp.click();
  assert.equal(await mcp.locator(`[title="${registered}"]`).innerText(), "docs.v2/search.pages");
  const mcpCard = mcp.locator("../..");
  assert.equal(await mcpCard.locator("pre").last().innerText(), JSON.stringify(jsonResult, null, 2), "MCP result must be formatted as JSON in the rendered card");
  const code = page.getByRole("button", { name: /codemode.*const found/ });
  await code.click();
  const codeCard = code.locator("../..");
  // Upstream now renders the script in the ordinary tool-input box, not a
  // separately highlighted CodeBlock. Keep checking every script byte.
  const renderedScript = await codeCard.locator("pre").first().textContent();
  assert.equal(renderedScript, script);
  assert.equal(await codeCard.locator("li").count(), 2, "Nested calls stay inside the Code mode card");
  const firstCall = codeCard.locator("li").first();
  assert.equal(await firstCall.getByText(registered, { exact: true }).innerText(), registered);
  assert.equal(await firstCall.getByText('{"query":"fixture"}', { exact: true }).innerText(), '{"query":"fixture"}');
  assert.equal(await firstCall.getByText("12ms", { exact: true }).innerText(), "12ms");
  await codeCard.getByRole("img", { name: "Failed", exact: true }).waitFor();
  await codeCard.getByText("AC6 nested error", { exact: true }).waitFor();
  assert.equal(await codeCard.locator("pre").last().innerText(), "AC6 script output", "Script transport header must not appear in output");
  const readSizes = async () => {
    const codeSizes = await codeCard.evaluate(card => {
      const script = card.querySelector("pre");
      const row = card.querySelector("li");
      const label = row?.parentElement?.previousElementSibling;
      const count = card.querySelector("button")?.querySelectorAll(":scope > span")[2];
      return [script, row, label, count].map(node => node ? parseFloat(getComputedStyle(node).fontSize) : null);
    });
    return codeSizes;
  };
  const mcpSizes = () => mcp.evaluate(button => [...button.querySelectorAll(":scope > span")].map(node => parseFloat(getComputedStyle(node).fontSize)));
  const mcpBefore = await mcpSizes();
  const before = await readSizes();
  assert.ok(before.every(size => size > 0), "Script, nested row and label typography must exist");
  // Drive the real shared ChatAppearance setter, not an overridden CSS variable.
  for (let step = 0; step < 3; step++) await page.keyboard.press("Control+Shift+Equal");
  await settleLayout(page);
  const after = await readSizes();
  console.log(`FONT AC6 ${width}px: ${JSON.stringify({ codeBefore: before, codeAfter: after, mcpBefore, mcpAfter: await mcpSizes() })}`);
  assert.deepEqual(after, before.map(size => size + 3), "All Code mode typography must honor chat offset");
  await page.screenshot({ path: join(artifacts, `ac6-codemode-${width}.png`) });
  for (let step = 0; step < 3; step++) await page.keyboard.press("Control+Shift+Minus");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "Cards must not overflow the viewport horizontally");
  console.log(`PASS: ${width}px AC6 MCP original labels/JSON and Code mode script/nested calls/offset typography`);
}

export async function checkHistoryEdit(page, { base, artifacts, width }) {
  await page.goto(`${base}/?session=${CODEMODE_SESSION}`, { waitUntil: "domcontentloaded" });
  const root = page.locator('[data-entry-id="ac-root"]:not([data-message-role])');
  await root.waitFor();
  const composer = page.locator("textarea").last();
  const commands = [];
  const onRequest = request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === `/api/agent/${CODEMODE_SESSION}`) commands.push(request.postDataJSON());
  };
  page.on("request", onRequest);
  // Navigation reaches the real isolated SDK wrapper; only prompt is replaced,
  // so this check never asks a provider for a completion.
  const agentRoute = `**/api/agent/${CODEMODE_SESSION}`;
  await page.route(agentRoute, route => {
    const command = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    return command?.type === "prompt" ? route.fulfill({ json: { disposition: "started" } }) : route.continue();
  });
  try {
    const initial = await (await page.request.get(`${base}/api/sessions/${CODEMODE_SESSION}`)).json();
    await root.hover();
    await root.getByRole("button", { name: "Edit from here", exact: true }).click();
    assert.equal(await composer.inputValue(), "AC6 original history prompt");
    await page.getByText("AC6 completed answer", { exact: true }).waitFor();
    assert.equal(commands.some(command => command.type === "navigate_tree"), false, "Clicking edit must not navigate");
    await composer.fill("AC6 retained edited draft");
    await root.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await composer.inputValue(), "AC6 retained edited draft", "Cancelling edit retains the composer draft");
    const cancelled = await (await page.request.get(`${base}/api/sessions/${CODEMODE_SESSION}`)).json();
    assert.deepEqual(cancelled.context.entryIds, initial.context.entryIds, "Cancel leaves the real branch unchanged");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("AC6 completed answer", { exact: true }).waitFor();
    const reloaded = await (await page.request.get(`${base}/api/sessions/${CODEMODE_SESSION}`)).json();
    assert.deepEqual(reloaded.context.entryIds, initial.context.entryIds, "Reload after cancel leaves the branch unchanged");
    // Draft store is intentionally page-local; no new reload-persistence demand.
    // The cancel-preserves-draft assertion above is the approved interaction.
    await root.hover();
    await root.getByRole("button", { name: "Edit from here", exact: true }).click();
    await composer.fill("AC6 send edited prompt");
    await page.screenshot({ path: join(artifacts, `ac6-history-edit-${width}.png`) });
    const promptRequest = page.waitForRequest(request => request.method() === "POST" && new URL(request.url()).pathname === `/api/agent/${CODEMODE_SESSION}` && request.postDataJSON().type === "prompt");
    // Attach the request rejection before awaiting navigation/layout work.
    await Promise.all([page.getByRole("button", { name: "Send", exact: true }).click(), promptRequest]);
    await page.waitForFunction(() => !document.querySelector('[data-entry-id="ac-answer"]'));
    const sent = commands.filter(command => ["navigate_tree", "prompt"].includes(command.type));
    assert.deepEqual(sent.map(command => command.type), ["navigate_tree", "prompt"], "Send navigates exactly once before prompt admission");
    assert.equal(sent[0].targetId, "ac-root");
    assert.equal(sent[1].message, "AC6 send edited prompt");
    const navigated = await (await page.request.get(`${base}/api/sessions/${CODEMODE_SESSION}`)).json();
    assert.equal(navigated.context.entryIds.includes("ac-answer"), false, "Send changed the real isolated SDK branch");
    console.log(`PASS: ${width}px AC6 edit prefill/cancel draft/reload branch; send-only real SDK branch navigation`);
  } finally {
    page.off("request", onRequest);
    await page.unroute(agentRoute);
    const restored = await page.request.post(`${base}/api/agent/${CODEMODE_SESSION}`, { data: { type: "navigate_tree", targetId: "ac-answer" } });
    assert.equal(restored.status(), 200, "Restore the fixture branch for the next viewport");
  }
}

export async function checkExtensionQueues(page, { base, artifacts, width }) {
  await page.addInitScript(target => {
    const Original = window.EventSource;
    class FixtureSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = 1;
      onmessage = null;
      onerror = null;
      constructor(url) {
        if (!String(url).includes(`/api/agent/${target}/events`)) return new Original(url);
        window.__ac6Sources ??= [];
        window.__ac6Sources.push(this);
      }
      close() { this.readyState = 2; }
    }
    window.EventSource = FixtureSource;
    window.__ac6Emit = event => {
      const source = (window.__ac6Sources ?? []).filter(source => source.readyState === 1).at(-1);
      if (!source?.onmessage) throw new Error("AC6 fixture stream not connected");
      source.onmessage({ data: JSON.stringify(event) });
    };
  }, QUEUE_SESSION);
  const commands = [];
  const idle = { running: false, state: { isStreaming: false, isPromptRunning: false, isCompacting: false } };
  const agentRoute = `**/api/agent/${QUEUE_SESSION}`;
  const stateRoute = `**/api/sessions/${QUEUE_SESSION}/state`;
  const leaseRoute = `**/api/agent/${QUEUE_SESSION}/lease`;
  await page.route(agentRoute, route => {
    if (route.request().method() === "POST") commands.push(route.request().postDataJSON());
    return route.fulfill({ json: idle });
  });
  await page.route(stateRoute, route => route.fulfill({ json: idle }));
  await page.route(leaseRoute, route => route.fulfill({ json: { success: true, renewed: 1 } }));
  const emit = event => page.evaluate(event => window.__ac6Emit(event), event);
  const reconnect = async pendingIds => {
    const previousCount = await page.evaluate(() => {
      const sources = window.__ac6Sources;
      const current = sources.filter(source => source.readyState === 1).at(-1);
      window.__ac6DiscardedSource = current;
      current.onerror(new Event("error"));
      return sources.length;
    });
    await page.waitForFunction(count => {
      const sources = window.__ac6Sources ?? [];
      return sources.length > count && sources.at(-1).readyState === 1 && sources.at(-1).onmessage;
    }, previousCount);
    await emit({ type: "connected", isStreaming: true, pendingExtensionUiIds: pendingIds });
    // Discarded callbacks must not reintroduce a stale request into either queue.
    await page.evaluate(() => window.__ac6DiscardedSource.onmessage({ data: JSON.stringify({
      type: "extension_ui_request", id: "discarded-request", method: "input", title: "AC6 stale dialog",
    }) }));
  };
  const dialog = id => ({ type: "extension_ui_request", id, method: "input", title: `AC6 dialog ${id}` });
  const custom = (id, lines = [`AC6 panel ${id}`]) => ({ type: "extension_ui_request", id, method: "custom", lines });
  const panel = page.getByRole("dialog").filter({ has: page.getByText(/^AC6 panel/) });
  try {
    await page.goto(`${base}/?session=${QUEUE_SESSION}`, { waitUntil: "domcontentloaded" });
    await page.getByText("AC6 queue fixture answer", { exact: true }).waitFor();
    await page.waitForFunction(() => (window.__ac6Sources ?? []).some(source => source.readyState === 1 && source.onmessage));
    await emit({ type: "connected", isStreaming: true, pendingExtensionUiIds: [] });
    for (const id of ["d1", "d2", "d3"]) await emit(dialog(id));
    const first = page.getByRole("dialog", { name: "AC6 dialog d1", exact: true });
    const waiting = first.getByText("+2 more", { exact: true });
    await waiting.waitFor();
    const waitingBefore = await waiting.evaluate(node => parseFloat(getComputedStyle(node).fontSize));
    await page.keyboard.press("Control+Shift+Equal");
    await settleLayout(page);
    assert.equal(await waiting.evaluate(node => parseFloat(getComputedStyle(node).fontSize)), waitingBefore + 1, "Waiting-count label honors the actual chat font setter");
    await page.keyboard.press("Control+Shift+Minus");
    await emit({ type: "extension_ui_closed", id: "d3" });
    await first.getByText("+1 more", { exact: true }).waitFor();
    await first.getByRole("textbox").fill("FIFO first");
    await first.getByRole("button", { name: "Submit", exact: true }).click();
    await page.getByRole("dialog", { name: "AC6 dialog d2", exact: true }).waitFor();
    assert.deepEqual(commands.filter(command => command.type === "extension_ui_response"), [{ type: "extension_ui_response", id: "d1", value: "FIFO first" }]);
    await reconnect(["d4", "d5"]);
    for (const id of ["d4", "d5", "d4"]) await emit(dialog(id));
    const fourth = page.getByRole("dialog", { name: "AC6 dialog d4", exact: true });
    await fourth.getByText("+1 more", { exact: true }).waitFor();
    await reconnect(["d5"]);
    await emit(dialog("d5"));
    const fifth = page.getByRole("dialog", { name: "AC6 dialog d5", exact: true });
    await fifth.waitFor();
    assert.equal(await fifth.getByText(/more$/).count(), 0, "Reconnect replay must not duplicate dialog ids");
    await fifth.getByRole("button", { name: "Cancel", exact: true }).click();
    await fifth.waitFor({ state: "hidden" });
    assert.deepEqual(commands.filter(command => command.type === "extension_ui_response").at(-1), { type: "extension_ui_response", id: "d5", cancelled: true });

    for (const id of ["c1", "c2", "c3"]) await emit(custom(id));
    await panel.getByText("AC6 panel c1", { exact: true }).waitFor();
    await panel.getByText("+2 more", { exact: true }).waitFor();
    await emit({ ...custom("c3"), closed: true });
    await panel.getByText("+1 more", { exact: true }).waitFor();
    await emit(custom("c1", ["AC6 panel c1 updated"]));
    await panel.getByText("AC6 panel c1 updated", { exact: true }).waitFor();
    const inputResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/agent/${QUEUE_SESSION}` && response.request().method() === "POST" && response.request().postDataJSON()?.type === "extension_ui_input");
    await page.keyboard.press("Enter");
    await inputResponse;
    assert.deepEqual(commands.filter(command => command.type === "extension_ui_input").at(-1), { type: "extension_ui_input", id: "c1", data: "\r" });
    await panel.getByRole("button", { name: "Close", exact: true }).click();
    await settleLayout(page);
    assert.equal(await panel.getByText("AC6 panel c1 updated", { exact: true }).count(), 1, "Custom close waits for the server's closed event");
    await emit({ ...custom("c1"), closed: true });
    await panel.getByText("AC6 panel c2", { exact: true }).waitFor();
    await reconnect(["c4", "c5"]);
    await emit(custom("c4"));
    await emit(custom("c5"));
    await panel.getByText("AC6 panel c4", { exact: true }).waitFor();
    await panel.getByText("+1 more", { exact: true }).waitFor();
    await reconnect(["c5"]);
    await emit(custom("c5"));
    await panel.getByText("AC6 panel c5", { exact: true }).waitFor();
    assert.equal(await panel.getByText(/more$/).count(), 0, "Custom replay updates by id without duplicate queue entries");
    await page.screenshot({ path: join(artifacts, `ac6-extension-queues-${width}.png`) });
    await emit({ ...custom("c5"), closed: true });
    await panel.waitFor({ state: "hidden" });
    assert.deepEqual(commands.filter(command => command.type === "extension_ui_input").map(command => [command.id, command.data]), [["c1", "\r"], ["c1", "\x03"]]);
    assert.equal(commands.some(command => command.type === "abort"), false, "Request close is not agent abort");
    assert.equal(await page.getByRole("dialog", { name: "AC6 stale dialog", exact: true }).count(), 0, "Discarded EventSource callbacks stay rejected");
    console.log(`PASS: ${width}px AC6 independent dialog/custom FIFO, id-specific close, replay dedupe and reconnect reconciliation`);
  } finally {
    await page.unroute(agentRoute);
    await page.unroute(stateRoute);
    await page.unroute(leaseRoute);
  }
}

export async function checkTouchEnter(page, { sessionId, artifacts }) {
  const commands = [];
  const agentRoute = `**/api/agent/${sessionId}`;
  // A regression must fail offline rather than accidentally invoking a model.
  await page.route(agentRoute, route => {
    if (route.request().method() === "POST") commands.push(route.request().postDataJSON());
    return route.fulfill({ json: { running: false, state: {} } });
  });
  try {
    for (const width of [390, 744]) {
      await page.setViewportSize({ width, height: 844 });
      const composer = page.locator("textarea").last();
      assert.equal(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), true);
      assert.equal(await composer.getAttribute("enterkeyhint"), "enter");
      await composer.fill("AC6 touch newline");
      await composer.press("Enter");
      assert.equal(await composer.inputValue(), "AC6 touch newline\n", "Touch Enter inserts newline even above the mobile breakpoint");
      assert.equal(commands.some(command => command.type === "prompt"), false, "Touch Enter must not send");
      await page.screenshot({ path: join(artifacts, `ac6-touch-enter-${width}.png`) });
      await composer.fill("");
      console.log(`PASS: ${width}px coarse-pointer Enter inserts newline without prompt`);
    }
  } finally {
    await page.unroute(agentRoute);
  }
}
