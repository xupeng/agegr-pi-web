// Client-side helper for POST /api/agent/[id].
//
// Every /api/agent/[id] route returns one of:
//   { success: true, data: <result> }
//   { error: string }              (non-2xx)
//
// Call sites previously repeated the same 5-line fetch block 13× in
// hooks/useAgentSession.ts. This helper collapses that down to one line.

import { isModelSelectionFailureDTO, type ModelSelectionFailureDTO } from "./api-types";
import { SESSION_UNAVAILABLE_CODE } from "./session-unavailable";

export class AgentCommandError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly accepted?: boolean,
    /** Present when the server refused a subagent model selection; safe, never carries auth. */
    public readonly modelSelection?: ModelSelectionFailureDTO,
    /** Also true for an undecodable selection DTO; raw diagnostic text must stay hidden. */
    public readonly modelSelectionFailed = modelSelection !== undefined,
    public readonly sessionUnavailable = code === SESSION_UNAVAILABLE_CODE,
  ) {
    super(message);
    this.name = "AgentCommandError";
  }
}

/** Only an explicit refusal may invalidate an unsent composer's runtime identity. */
export function isUnavailableAgentSessionError(error: unknown): error is AgentCommandError {
  return error instanceof AgentCommandError
    && error.sessionUnavailable
    && error.accepted === false;
}

export function isPromptRejectedError(error: unknown): error is AgentCommandError {
  return error instanceof AgentCommandError
    && error.code === "prompt_rejected"
    && error.accepted === false;
}

export function isModelSelectionFailureError(error: unknown): error is AgentCommandError & { modelSelection: ModelSelectionFailureDTO } {
  return error instanceof AgentCommandError && error.modelSelection !== undefined;
}

/** Decode failures from both new-session and existing-session endpoints. */
export function readAgentCommandError(value: unknown, status: number): AgentCommandError {
  const body = typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
  const selectionFailure = "modelSelection" in body || body.code === "model_selection_failed";
  const modelSelection = readModelSelectionFailureDTO(body.modelSelection);
  return new AgentCommandError(
    // Neither a typed DTO's message nor an undecodable selection failure may expose loader/auth text.
    selectionFailure ? "Model selection failed" : typeof body.error === "string" ? body.error : `HTTP ${status}`,
    status,
    typeof body.code === "string" ? body.code : selectionFailure ? "model_selection_failed" : undefined,
    typeof body.accepted === "boolean" ? body.accepted : undefined,
    modelSelection,
    selectionFailure,
    body.code === SESSION_UNAVAILABLE_CODE
      || (body.code === "prompt_rejected" && body.accepted === false && body.reason === SESSION_UNAVAILABLE_CODE),
  );
}

/** Project only recognized, display-safe fields; even logs must not carry raw diagnostic text. */
export function readModelSelectionFailureDTO(value: unknown): ModelSelectionFailureDTO | undefined {
  if (!isModelSelectionFailureDTO(value)) return undefined;
  // IDs, not diagnostic text/URLs. Nested model ids remain displayable.
  const safeId = (id: string | undefined, model = false) => id === undefined
    || (id.length > 0 && id.length <= 256 && !id.includes("://")
      && (model ? /^[\p{L}\p{N}._/+:@-]+$/u : /^[\p{L}\p{N}._/+-]+$/u).test(id));
  // OpenRouter suffixes (`:free`) and versioned Vertex IDs (`@001`) are IDs, not URLs.
  if (!safeId(value.provider) || !safeId(value.modelId, true)) return undefined;
  return {
    code: "model_selection_failed",
    reason: value.reason,
    message: "Model selection failed",
    ...(value.provider !== undefined ? { provider: value.provider } : {}),
    ...(value.modelId !== undefined ? { modelId: value.modelId } : {}),
  };
}

export async function sendAgentCommand<T = unknown>(
  sessionId: string,
  command: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`/api/agent/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const value: unknown = await res.json().catch(() => ({}));
  const body = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  if (!res.ok || body.error) {
    throw readAgentCommandError(body, res.status);
  }
  return body.data as T;
}
