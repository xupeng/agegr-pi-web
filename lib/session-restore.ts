/**
 * Policy for restoring a workspace's remembered last-open session.
 *
 * A URL with an explicit `?session=<id>` is restored by the sidebar, which needs
 * a round trip before that session is adopted. The workspace restore in
 * `AppShell`'s cwd handler runs in the same window and reads the remembered
 * session synchronously — still the previous document's value, because the
 * persistence effect only writes after adoption. Restoring it there replaces the
 * selection *and* rewrites the URL, so the next reload lands on the wrong
 * session.
 *
 * While an explicit `?session=` is still unresolved, the URL owns the selection.
 * Once it has been adopted (or confirmed missing) a later project switch is an
 * ordinary workspace switch again.
 */

/** The `?session=` value of a URL search string, or null when it is absent. */
export function urlSessionParam(search: string): string | null {
  if (!search) return null;
  const value = new URLSearchParams(search).get("session");
  return value && value.length > 0 ? value : null;
}

/**
 * Whether the cwd-change path may replace the current selection with the
 * project's remembered last-open session.
 */
export function canRestoreRememberedSession(input: {
  /** True once an initial `?session=` was adopted, or confirmed missing. */
  initialSessionRestored: boolean;
  /** True when the current URL still carries an explicit `?session=`. */
  hasUrlSession: boolean;
}): boolean {
  if (!input.initialSessionRestored && input.hasUrlSession) return false;
  return true;
}
