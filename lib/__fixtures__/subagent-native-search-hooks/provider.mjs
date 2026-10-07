import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createProvider } from "@earendil-works/pi-ai";
import * as responses from "@earendil-works/pi-ai/api/openai-responses";

// Portable controlled provider, NOT the actual pi-sub2api entrypoint.
export default function provider(pi) {
  const root = process.env.PI_CODING_AGENT_DIR;
  const config = JSON.parse(readFileSync(join(root, "native-hooks.json"), "utf8"));
  const record = (type) => appendFileSync(join(root, "observed.jsonl"), JSON.stringify({ type }) + "\n");
  record("provider_factory");
  const model = (id) => ({
    id, name: id, provider: "hooks-target", api: "openai-responses", baseUrl: config.baseUrl,
    input: ["text"], reasoning: true, contextWindow: 32768, maxTokens: 1024,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  });
  if (config.kind === "legacy") {
    pi.registerProvider("hooks-target", {
      name: "controlled Responses", baseUrl: config.baseUrl, api: "openai-responses",
      apiKey: config.dummyKey, models: [model("gpt-hooks"), model("other-hooks")],
    });
  } else {
    pi.registerProvider(createProvider({
      id: "hooks-target", name: "controlled Responses", baseUrl: config.baseUrl,
      models: [model("gpt-hooks"), model("other-hooks")], api: responses,
      auth: { apiKey: { name: "owned dummy key", resolve: async () => ({
        auth: { apiKey: config.dummyKey, ...(config.authBaseUrl ? { baseUrl: config.authBaseUrl } : {}) },
      }) } },
    }));
  }
  // Deliberate co-located registrations must NOT transfer through the false provider host.
  pi.on("session_start", () => record("provider_session_start"));
  pi.on("before_provider_request", () => record("provider_request_hook"));
}
