import { AgentCommandError, readModelSelectionFailureDTO } from "./agent-client";
import type { ModelSelectionFailureReason } from "./api-types";
import type { TranslationParams } from "./i18n/types";

type Translate = (key: string, params?: TranslationParams) => string;

const REASON_KEYS: Record<ModelSelectionFailureReason, string> = {
  "missing-selection": "chat.modelSelectionMissing",
  "provider-context-unavailable": "chat.modelSelectionProviderContext",
  "provider-source-invalid": "chat.modelSelectionProviderSource",
  "provider-replay-unsupported": "chat.modelSelectionProviderReplay",
  "model-unavailable": "chat.modelSelectionUnavailable",
  "auth-unavailable": "chat.modelSelectionAuth",
  "outside-scope": "chat.modelSelectionOutsideScope",
  "scope-unresolved": "chat.modelSelectionScopeUnresolved",
  "selection-mismatch": "chat.modelSelectionMismatch",
  "resource-policy-invalid": "chat.modelSelectionPolicy",
};

/** Client-only local copy; never render server message/config/auth even if the DTO decodes. */
export function formatModelSelectionError(
  error: unknown,
  t: Translate,
  operation: "prompt" | "set-model" = "prompt",
): string | null {
  if (!(error instanceof AgentCommandError)) return null;
  if (!error.modelSelectionFailed && error.code !== "model_selection_failed") return null;
  const dto = readModelSelectionFailureDTO(error.modelSelection);
  const reason = t(dto ? REASON_KEYS[dto.reason] : "chat.modelSelectionUnknown");
  const target = dto ? [dto.provider, dto.modelId].filter(Boolean).join("/") : "";
  return t(operation === "set-model"
    ? target ? "chat.modelSelectionSwitchTarget" : "chat.modelSelectionSwitch"
    : target ? "chat.modelSelectionRejectedTarget" : "chat.modelSelectionRejected", { target, reason });
}
