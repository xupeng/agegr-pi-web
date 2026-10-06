/** Offline host-chain provider. Loaded only by the isolated e2e runner. */
import { appendFileSync } from "node:fs";
import { fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText, type TranscriptContext } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function askUserFauxProviderExtension(pi: ExtensionAPI) {
  const faux = fauxProvider({ provider: "ask-host-faux", models: [{ id: "ask-host" }] });
  const respond = (context: TranscriptContext) => {
    const last = [...context.messages].reverse().find((message) => message.role !== "system");
    const text = JSON.stringify(last);
    if (process.env.ASK_USER_HOST_CALL_LOG) appendFileSync(process.env.ASK_USER_HOST_CALL_LOG, JSON.stringify({ text }) + "\n");
    if (last?.role === "toolResult") throw new Error("ask_user failed to terminate the model turn");
    if (/The user submitted answers|The question set was closed/.test(text)) {
      return fauxAssistantMessage([fauxText(`HOST CONTINUED: ${text}`)]);
    }
    return fauxAssistantMessage([fauxToolCall("ask_user", { questions: [
      { id: "scope", question: "HOST choose scope?", options: [{ value: "small", label: "HOST Small" }, { value: "large", label: "HOST Large" }] },
      { id: "regions", question: "HOST choose regions?", multiple: true, options: [{ value: "eu", label: "HOST Europe" }, { value: "us", label: "HOST US" }] },
      { id: "custom", question: "HOST custom input?", options: [] },
      { id: "skipped", question: "HOST leave unanswered?", options: [] },
    ] })]);
  };
  faux.setResponses(Array.from({ length: 32 }, () => respond));
  pi.registerProvider(faux.provider);
}
