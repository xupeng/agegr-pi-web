// Red/green harness for this task's claims (see research/verification.md).
//
// It runs ONLY e2e/status-tail.mjs's check, so the fix can be toggled without
// paying for the whole e2e suite. It reuses the committed assertions instead of
// duplicating them.
//
// Requirements (the isolated-copy setup is described in research/verification.md;
// this checkout's own dev server holds .next/dev/lock, which e2e/run.mjs asserts
// against). Run it from the repository root — it only *drives* the browser, so
// the code under test is whatever REPRO_BASE serves:
//
//   REPRO_AGENT_DIR=<isolated copy>/test-results/agent \
//   REPRO_BASE=http://127.0.0.1:30161 \
//   node .trellis/tasks/09-28-mobile-status-line-clip/research/repro-status-tail.mjs
//
// It writes the fixture session into REPRO_AGENT_DIR, so point it at the agent
// dir the dev server under REPRO_BASE was started with.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { STATUS_TAIL_SESSION, checkStatusTailFollow, statusTailEntries } from "../../../../e2e/status-tail.mjs";

const agentDir = process.env.REPRO_AGENT_DIR;
const base = process.env.REPRO_BASE;
if (!agentDir || !base) {
  console.error("REPRO_AGENT_DIR and REPRO_BASE must be set");
  process.exit(2);
}

const project = join(agentDir, "project");
mkdirSync(project, { recursive: true });
mkdirSync(join(agentDir, "sessions", "e2e"), { recursive: true });
writeFileSync(
  join(agentDir, "sessions", "e2e", `2026-08-23T00-00-00-000Z_${STATUS_TAIL_SESSION}.jsonl`),
  [
    JSON.stringify({ type: "session", version: 3, id: STATUS_TAIL_SESSION, timestamp: "2026-08-23T00:00:00.000Z", cwd: project }),
    ...statusTailEntries().map((entry) => JSON.stringify(entry)),
  ].join("\n") + "\n",
);

const browser = await chromium.launch();
for (const width of [390, 1280]) {
  const context = await browser.newContext({
    viewport: { width, height: width <= 600 ? 844 : 800 },
    hasTouch: width <= 600,
    isMobile: width <= 600,
    locale: "en-US",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await checkStatusTailFollow(page, { base, sessionId: STATUS_TAIL_SESSION, expectWrap: width <= 600 });
    console.log(`GREEN ${width}px: the status line is followed and a detached reader keeps their place`);
  } catch (error) {
    console.log(`RED ${width}px: ${String(error.message).split("\n")[0]}`);
    process.exitCode = 1;
  }
  if (errors.length) {
    console.log(`browser errors at ${width}px: ${errors.join(" | ")}`);
    process.exitCode = 1;
  }
  await context.close();
}
await browser.close();
