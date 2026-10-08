/** Shared, path-free refusal for a cold restore that no longer owns a saved session. */
export const SESSION_UNAVAILABLE_CODE = "session_unavailable";

export class SessionUnavailableError extends Error {
  readonly code = SESSION_UNAVAILABLE_CODE;

  constructor() {
    super("Session is no longer available. Please try again.");
    this.name = "SessionUnavailableError";
  }
}

/** Keep prompt admission's existing negative acknowledgement; reason is additive. */
export function sessionUnavailableFailure(commandType?: string) {
  return {
    error: new SessionUnavailableError().message,
    code: commandType === "prompt" ? "prompt_rejected" : SESSION_UNAVAILABLE_CODE,
    accepted: false,
    reason: SESSION_UNAVAILABLE_CODE,
  };
}
