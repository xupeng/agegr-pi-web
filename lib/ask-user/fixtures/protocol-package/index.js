// Test-only minimal v1 peer, NOT an AskUser implementation or product fallback.
import { Type } from "@earendil-works/pi-ai";
export default function askUserProtocolFixture(pi) {
  pi.registerTool({
    name: "ask_user", label: "Protocol fixture", description: "Test the host wire contract",
    parameters: Type.Object({ questions: Type.Array(Type.Any()) }),
    /* TOOL_OPTIONS */
    async execute(_id, input, _signal, _update, ctx) {
      const opens = [];
      pi.events.emit("pi.ask-user.bridge:resolve-open:v1", { register: (open) => opens.push(open) });
      if (opens.length !== 1 || typeof opens[0] !== "function") {
        throw new Error(`expected exactly one synchronous host bridge (got ${opens.length})`);
      }
      const questions = input.questions.map((q) => ({
        id: q.id, question: q.question,
        ...(q.detail === undefined ? {} : { detail: q.detail }),
        options: (q.options ?? []).map((option) => ({ value: option.value, label: option.label,
          ...(option.detail === undefined ? {} : { detail: option.detail }) })),
        ...(q.multiple === true ? { multiple: true } : {}),
      }));
      const result = await opens[0]({ version: 1, conversationId: ctx.sessionManager.getSessionId(), questions });
      if (!result?.ask?.askId || !result.ask.askedAt || JSON.stringify(result.ask.questions) !== JSON.stringify(questions)) {
        throw new Error("invalid host acknowledgement");
      }
      return { content: [{ type: "text", text: `Posted ${questions.length} questions` }], details: result, terminate: true };
    },
  });
  pi.registerTool({ name: "peer_tool", label: "Peer", description: "Unrelated fixture tool",
    parameters: Type.Object({}), async execute() { return { content: [], details: undefined }; } });
  pi.registerCommand("peer_command", { description: "Unrelated command", handler: async () => {} });
  pi.registerFlag("peer_flag", { description: "Unrelated flag", type: "boolean", default: false });
  pi.on("session_start", () => {});
}
