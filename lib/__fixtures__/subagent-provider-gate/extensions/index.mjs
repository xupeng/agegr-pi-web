import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";

export default function providerGateExtension(pi) {
  const faux = fauxProvider({ provider: "gate-host-native", models: [{ id: "gate-host-model" }] });
  pi.registerProvider(faux.provider);
  pi.registerTool({
    name: "gate_host_tool",
    label: "gate_host_tool",
    description: "gate host tool",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ content: [{ type: "text", text: "gate_host_tool" }] }),
  });
  pi.on("session_start", () => {
    globalThis.__gateProviderHostSessionStart = (globalThis.__gateProviderHostSessionStart ?? 0) + 1;
  });
}
