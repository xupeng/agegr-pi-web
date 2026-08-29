/**
 * Resolve the next `pendingAsk` after a close command response lands.
 *
 * A close (submit/cancel) response can arrive after the agent already opened
 * the next ask. In that case the server reports `stale` for the older ask and
 * the response's `pendingAsk` carries the newer ask — but when the response
 * carries no `pendingAsk` at all (the old ask was closed with nothing to
 * replace it), clearing the current ask would wipe a newer card that opened in
 * the meantime. `submittedAskId` is the ask the close command targeted; when
 * the current ask differs from it, the current (newer) ask is kept unless the
 * server explicitly names a replacement.
 *
 * Dependency-free on purpose: this module stays importable from plain Node
 * tests (no path aliases, no framework imports).
 */
export function resolvePendingAskAfterClose<
  T extends { askId: string },
  R extends { pendingAsk?: T | null } | undefined,
>(
  current: T | null,
  submittedAskId: string | undefined,
  response: R,
): T | null {
  if (submittedAskId !== undefined && current !== null && current.askId !== submittedAskId) {
    return response?.pendingAsk ?? current;
  }
  return response?.pendingAsk ?? null;
}
