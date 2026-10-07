import { appendFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Reproduces the public event path / eligibility checks, not the real plugin or its config.
export default function search(pi) {
  const root = process.env.PI_CODING_AGENT_DIR;
  const owner = resolve(fileURLToPath(import.meta.url));
  const record = (type, data = {}) => appendFileSync(join(root, "observed.jsonl"), JSON.stringify({ type, ...data }) + "\n");
  const config = () => JSON.parse(readFileSync(join(root, "native-hooks.json"), "utf8"));
  let pending, consent = false, removed = false, route = false;
  record("search_factory");
  function clear(reason) {
    record("clear", { reason, hadPending: !!pending });
    pending = undefined;
  }
  async function sync(ctx) {
    const cfg = config();
    const tool = pi.getAllTools().find((tool) => tool.name === "web_search");
    const active = pi.getActiveTools();
    const owned = tool && resolve(tool.sourceInfo.path) === owner && tool.exposure !== "hidden";
    if (!removed) consent = active.includes("web_search");
    const model = ctx.model;
    const effective = model && ctx.modelRegistry.find(model.provider, model.id);
    route = !!(cfg.enabled && owned && consent && model && effective &&
      model.provider === "hooks-target" && model.id === "gpt-hooks" &&
      model.api === "openai-responses" && effective.api === model.api &&
      effective.baseUrl === model.baseUrl && model.baseUrl === cfg.searchBaseUrl);
    if (route) {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(effective);
      route = auth.ok && !!auth.apiKey && (!auth.baseUrl || auth.baseUrl === cfg.searchBaseUrl);
    }
    if (owned && active.includes("web_search")) {
      pi.setActiveTools(active.filter((name) => name !== "web_search"));
      removed = true; // native route keeps consent but does not activate/call the direct tool
    }
    record("sync", { route, consent, active: pi.getActiveTools(), model: model?.id });
  }
  pi.on("session_start", async (_event, ctx) => {
    clear("session_start"); consent = false; removed = false;
    const cfg = config();
    pi.registerTool({
      name: "web_search", label: "controlled late search", description: "Permission marker; native route never executes this tool",
      exposure: cfg.hidden ? "hidden" : "direct", defaultActive: cfg.defaultActive !== false,
      parameters: { type: "object", properties: {} },
      execute: async () => { record("direct_execute"); throw new Error("No direct search in this fixture"); },
    });
    record("late_registered", { visible: pi.getAllTools().some((tool) => tool.name === "web_search") });
    await sync(ctx);
  });
  pi.on("model_select", async (_event, ctx) => { clear("model_select"); await sync(ctx); });
  pi.on("turn_start", async (_event, ctx) => { clear("turn_start"); await sync(ctx); });
  pi.on("session_shutdown", () => clear("session_shutdown"));
  pi.on("agent_end", () => clear("agent_end"));
  pi.on("before_provider_request", async (event, ctx) => {
    clear("before_provider_request"); await sync(ctx);
    record("search_request_hook", { route, payloadModel: event.payload?.model });
    if (!route || event.payload?.model !== ctx.model.id || event.payload.tool_choice) return;
    if (event.payload.tools?.some((tool) => tool.type === "web_search")) return;
    pending = { provider: ctx.model.provider, api: ctx.model.api, model: ctx.model.id, sources: [] };
    return { ...event.payload, nativeSearch: true, tools: [...(event.payload.tools ?? []), { type: "web_search" }] };
  });
  pi.on("provider_stream_event", (event) => {
    record("stream_hook", { provider: event.provider, api: event.api, model: event.model, eventType: event.data.type });
    if (!pending) return;
    if (event.provider !== pending.provider || event.api !== pending.api || event.model !== pending.model) {
      clear("stream_mismatch"); return;
    }
    if (event.data.type === "response.output_item.done" && event.data.item.type === "web_search_call") {
      pending.sources.push(...(event.data.item.action?.sources ?? []));
    }
  });
  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;
    const request = pending; clear("message_end");
    const message = event.message;
    record("assistant_hook", { model: message.model, before: message.content, pending: !!request });
    if (!request || ["error", "aborted"].includes(message.stopReason) ||
      message.provider !== request.provider || message.api !== request.api || message.model !== request.model) return;
    if (request.sources.length) return { message: { ...message, content: [...message.content, {
      type: "text", text: "\nSources (controlled hook):\n" + request.sources.map((s) => `${s.title}: ${s.url}`).join("\n"),
    }] } };
  });
  // Adversarial stale-state seed ONLY for reset assertions. It dispatches no event/request.
  // All lifecycle events below still come from prompt(), setModel(), reload() in the SDK.
  pi.registerCommand("fixture-stale", { description: "test-only stale collector sentinel", handler: () => {
    pending = { provider: "stale", api: "openai-responses", model: "stale", sources: [] };
    record("stale_seed");
  } });
}
