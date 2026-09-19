"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { buildFileIndexLookup, type FileIndexLookup } from "@/lib/path-linkify";

/**
 * Shared, cwd-keyed file index for every message surface.
 *
 * A conversation mounts many `MarkdownBody` / `<pre>` renderers; they all need
 * the same `/api/file-index?cwd=` answer. A module-level cache plus
 * `useSyncExternalStore` dedupes the request and re-renders every consumer when
 * the index arrives (a plain prop would be blocked by `MessageView`'s memo).
 */

export type FileIndexStatus = "idle" | "loading" | "ready" | "error";

export interface FileIndexState {
  lookup: FileIndexLookup | null;
  status: FileIndexStatus;
}

/** Match the server-side `/api/file-index` cache TTL. */
export const FILE_INDEX_TTL_MS = 10_000;

interface CacheEntry {
  state: FileIndexState;
  fetchedAt: number;
  promise: Promise<void> | null;
}

const EMPTY_STATE: FileIndexState = { lookup: null, status: "idle" };
const cache = new Map<string, CacheEntry>();
const listeners = new Set<() => void>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getEntry(cwd: string): CacheEntry {
  let entry = cache.get(cwd);
  if (!entry) {
    entry = { state: EMPTY_STATE, fetchedAt: 0, promise: null };
    cache.set(cwd, entry);
  }
  return entry;
}

function getSnapshot(cwd: string): FileIndexState {
  return cache.get(cwd)?.state ?? EMPTY_STATE;
}

/** One in-flight request per cwd; retries are throttled by the same TTL. */
function ensureFetch(cwd: string): void {
  const entry = getEntry(cwd);
  if (entry.promise) return;
  const now = Date.now();
  if (entry.fetchedAt > 0 && now - entry.fetchedAt < FILE_INDEX_TTL_MS) return;

  if (entry.state.status !== "ready" && entry.state.status !== "loading") {
    entry.state = { lookup: entry.state.lookup, status: "loading" };
    emit();
  }

  entry.promise = (async () => {
    try {
      const response = await fetch(`/api/file-index?cwd=${encodeURIComponent(cwd)}`);
      if (!response.ok) throw new Error(`file-index ${response.status}`);
      const payload: unknown = await response.json();
      const files = isRecord(payload) && Array.isArray(payload.files)
        ? payload.files.filter((file): file is string => typeof file === "string")
        : [];
      const truncated = isRecord(payload) && payload.truncated === true;
      entry.state = { lookup: buildFileIndexLookup(files, cwd, truncated), status: "ready" };
    } catch {
      // Index unavailable → `lookup` stays null → renderers behave as before.
      entry.state = { lookup: null, status: "error" };
    } finally {
      entry.fetchedAt = Date.now();
      entry.promise = null;
      emit();
    }
  })();
}

export function useFileIndex(cwd?: string): FileIndexState {
  const key = cwd && cwd.length > 0 ? cwd : null;
  const readSnapshot = useCallback(
    () => (key ? getSnapshot(key) : EMPTY_STATE),
    [key],
  );
  const state = useSyncExternalStore(subscribe, readSnapshot, () => EMPTY_STATE);
  useEffect(() => {
    if (!key) return;
    ensureFetch(key);
    // A mounted conversation can create files after the initial index fetch.
    // Refresh while visible; the shared cache still deduplicates all consumers.
    const refresh = () => {
      if (document.visibilityState !== "hidden") ensureFetch(key);
    };
    const timer = window.setInterval(refresh, FILE_INDEX_TTL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [key]);
  return state;
}
