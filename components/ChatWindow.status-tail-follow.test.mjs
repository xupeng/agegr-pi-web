import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");
const hookSource = await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");

test("defers the tail follow to one shared primitive", () => {
  const helper = hookSource.slice(hookSource.indexOf("const followTailIfAttached = useCallback"));

  assert.match(
    helper.slice(0, helper.indexOf("}, [scrollToBottom]);")),
    /if \(pendingScrollToUserRef\.current \|\| !isNearBottomRef\.current\) return;[\s\S]*?if \(liveFollowFrameRef\.current !== null\) return;[\s\S]*?liveFollowFrameRef\.current = requestAnimationFrame\(\(\) => \{[\s\S]*?liveFollowFrameRef\.current = null;[\s\S]*?if \(isNearBottomRef\.current\) scrollToBottom\("auto"\);/,
    "the follow must keep the attached-to-tail gate, the per-frame coalescing, and the deferred scroll",
  );
  // One rAF for the tail follow: a second copy is how the streaming follow and
  // the ephemeral-tail follow drift apart.
  assert.equal(
    (hookSource.match(/requestAnimationFrame\(/g) ?? []).length,
    1,
    "the tail follow must have exactly one deferred-scroll implementation",
  );
  assert.match(hookSource, /followTailIfAttached,\n/, "the hook must export the follow for the view");
});

test("follows streaming content through that primitive", () => {
  const delta = hookSource.slice(
    hookSource.indexOf("// Live-follow the streaming output only when the user is already near"),
  );

  assert.match(
    delta.slice(0, delta.indexOf("break;")),
    /followTailIfAttached\(\);/,
    "the streaming path must not inline its own rAF follow",
  );
});

test("keys the status line on its rendered text, not on the phase object", () => {
  assert.match(
    source,
    /const statusText = agentRunning && !hasStreamingContent && \(agentPhase \|\| isCompacting\)\s*\n\s*\? phaseLabel\(agentPhase, t, isCompacting\)\s*\n\s*: null;/,
    "the run status must be one value shared by the render and the follow",
  );
  assert.match(
    source,
    /const tailStatusKey = statusText !== null \|\| bashRunning \|\| pendingBash\s*\n\s*\? `\$\{statusText \?\? ""\}\|\$\{bashRunning && !pendingBash \? "cmd" : ""\}\|\$\{pendingBash\?\.command \?\? ""\}`\s*\n\s*: "";/,
    "the trigger must cover the status line, the running-command line, and the pending bash card",
  );
});

test("re-pins the tail when the tail status block changes", () => {
  const effect = source.slice(source.indexOf("useLayoutEffect(() => {\n    if (!tailStatusKey) return;"));

  assert.match(
    effect.slice(0, effect.indexOf("}, [tailStatusKey, followTailIfAttached]);")),
    /followTailIfAttached\(\);/,
    "a wrapping status line must ask for the same follow streaming content gets",
  );
});

test("keeps the status line's own spacing so the wrapper is not hidden by styling", () => {
  const block = source.slice(source.indexOf('<div className="break-words py-2 text-[13px] text-text-muted">'));

  assert.ok(block.length > 0, "status line block not found");
  assert.match(
    block.slice(0, block.indexOf("</div>")),
    /^<div className="break-words py-2 text-\[13px\] text-text-muted">\s*<span className="animate-\[pulse_1\.5s_infinite\]">\{statusText\}<\/span>\s*$/,
    "the fix must not shrink the status line's padding or font to buy back, or hide, the clipped row",
  );
});
