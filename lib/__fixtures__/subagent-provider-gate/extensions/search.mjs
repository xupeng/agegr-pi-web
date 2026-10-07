export default function searchGateExtension(pi) {
  pi.registerTool({
    name: "gate_search_entry",
    label: "gate_search_entry",
    description: "gate search entry tool",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [{ type: "text", text: "gate_search_entry" }] }),
  });
  pi.on("session_start", () => {
    pi.registerTool({
      name: "web_search",
      label: "web_search",
      description: "delayed search tool",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ content: [{ type: "text", text: "web_search" }] }),
    });
  });
}
