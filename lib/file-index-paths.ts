/**
 * Pure path-set helpers for `/api/file-index`.
 *
 * `git ls-files --cached` lists files that are still in the index, which
 * includes tracked files deleted from the working tree. The index must only
 * offer paths that really exist, otherwise clickable file links resolve to a
 * viewer error (dead link). `subtractDeletedPaths` removes those entries before
 * the listing is cached or served.
 *
 * Kept free of git/fs so it can be unit-tested without spawning a process.
 */

/**
 * Return `listed` without any path present in `deleted`, preserving the
 * original order. A missing/empty `deleted` list is a no-op.
 */
export function subtractDeletedPaths(
  listed: readonly string[],
  deleted: readonly string[],
): string[] {
  if (deleted.length === 0) return [...listed];
  const deletedSet = new Set(deleted);
  return listed.filter((file) => !deletedSet.has(file));
}
