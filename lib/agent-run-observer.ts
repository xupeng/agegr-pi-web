import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { AgentRunTracker, completionResultText } from "./agent-run-tracker";

export const AGENT_RUN_OBSERVER_NAME = "pi-web-agent-run-observer";

/** Read-only public SDK boundaries; no tools, resources, prompt or continuation output. */
export function createAgentRunObserver(tracker: AgentRunTracker): InlineExtension {
  return {
    name: AGENT_RUN_OBSERVER_NAME,
    hidden: true,
    factory: (pi) => {
      pi.on("turn_end", (event) => {
        if (event.message.role !== "assistant") return;
        tracker.turnEnd({ outcome: event.outcome, resultEntryId: event.messageEntryId,
          stopReason: event.message.stopReason, summary: completionResultText(event.message) });
      });
      pi.on("agent_before_settle", (event) => {
        tracker.beforeSettle(event.outcome);
      });
    },
  };
}
