/** Offline notification acceptance fixture. Only public SDK 1.0.0 APIs. */
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  Type, fauxProvider, fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall,
  type FauxResponseFactory,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function notificationFauxProvider(pi: ExtensionAPI) {
  const gateDir = process.env.NOTIFICATION_FIXTURE_GATE_DIR;
  const callLog = process.env.NOTIFICATION_FIXTURE_CALL_LOG;
  if (!gateDir || !callLog || process.env.PI_OFFLINE !== "1") {
    throw new Error("Notification fixture requires its isolated offline runner");
  }
  const faux = fauxProvider({ provider: "notification-faux", models: [{ id: "notification-test", contextWindow: 200_000 }],
    tokenSize: { min: 256, max: 256 } });
  const respond: FauxResponseFactory = async (context, options) => {
    const last = [...context.messages].reverse().find((message) => message.role !== "system");
    const user = [...context.messages].reverse().find((message) => message.role === "user");
    const prompt = typeof user?.content === "string" ? user.content
      : user?.content.filter((block) => block.type === "text").map((block) => block.text).join("\n") ?? "";
    appendFileSync(callLog, JSON.stringify({ at: new Date().toISOString(), sessionId: options?.sessionId,
      prompt, lastRole: last?.role }) + "\n");
    if (last?.role === "toolResult") {
      if (last.toolName === "ask_user") throw new Error("ask_user must terminate without a second provider call");
      return fauxAssistantMessage("NC extension answered; final response");
    }
    if (prompt.startsWith("NC ASK")) {
      return fauxAssistantMessage(fauxToolCall("ask_user", { questions: [{ id: "choice",
        question: "NC question waiting for input", options: [{ value: "yes", label: "NC Yes" }] }] }));
    }
    if (prompt.startsWith("NC EXTENSION")) {
      return fauxAssistantMessage(fauxToolCall("notification_wait", {}));
    }
    const gate = /^NC HOLD ([a-zA-Z0-9_-]+)/.exec(prompt)?.[1];
    if (gate) {
      const deadline = Date.now() + 120_000;
      while (!existsSync(join(gateDir, gate))) {
        if (options?.signal?.aborted) throw new Error("Fixture gate aborted");
        if (Date.now() > deadline) throw new Error(`Fixture gate ${gate} timed out`);
        await delay(25);
      }
    }
    if (prompt.startsWith("NC ERROR")) return fauxAssistantMessage([], { stopReason: "error", errorMessage: "NC controlled error" });
    if (prompt.startsWith("NC LENGTH")) return fauxAssistantMessage("NC incomplete answer", { stopReason: "length" });
    const answer = prompt.includes("CODE_ONLY")
      ? "```javascript\nconst NC_FIRST_CODE_LINE = 'actual result, not Copy or language label';\n"
        + Array.from({ length: 90 }, (_, i) => `console.log('NC code line ${i + 2}');`).join("\n") + "\n```"
      : prompt.includes("MERMAID_ERROR") ? "```mermaid\nNC_INVALID_DIAGRAM definitely not valid mermaid\n```"
      : prompt.includes("LONG")
      ? "# NC LONG final answer\n\n" + Array.from({ length: 100 }, (_, i) => `NC paragraph ${i + 1}: a genuine **markdown** final result with enough text to extend beyond the viewport.`).join("\n\n")
      : `# NC FINAL ${prompt}\n\nThis is the genuine **final result body**, not a notification summary.`;
    return fauxAssistantMessage(prompt.includes("PROCESS")
      ? [fauxText("NC PROCESS PRELUDE: this is not the final answer\n\n"
        + Array.from({ length: 90 }, (_, i) => `NC process paragraph ${i + 1}: intermediate visible text, not the final result.`).join("\n\n")),
      fauxThinking("NC private reasoning"), fauxText(answer)]
      : [fauxText(answer)]);
  };
  faux.setResponses(Array.from({ length: 512 }, () => respond));
  pi.registerProvider(faux.provider);
  pi.registerTool({ name: "notification_wait", label: "NC wait", description: "Offline blocking UI acceptance fixture",
    parameters: Type.Object({}),
    async execute(_id, _params, signal, _update, ctx) {
      const answer = await ctx.ui.input("NC extension waiting for input", "NC fixture input", { signal });
      return { content: [{ type: "text", text: `NC answered ${answer ?? "cancelled"}` }], details: undefined };
    },
  });
  pi.registerCommand("nc-name", { description: "Name this isolated test session", handler: async (name) => { pi.setSessionName(name); } });
  pi.registerCommand("nc-padding", { description: "Append public SDK display messages without starting a model run",
    handler: async (arg) => {
      const count = Number(arg);
      if (!Number.isInteger(count) || count < 1 || count > 450) throw new Error("Invalid fixture padding count");
      for (let i = 0; i < count; i++) await pi.sendMessage({ customType: "notification-fixture-padding",
        content: `NC history padding ${i + 1}: later display-only context; not a successful agent run.`, display: true, details: { index: i } },
      { triggerTurn: false });
    },
  });
}
