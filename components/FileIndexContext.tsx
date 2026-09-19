"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FileIndexLookup } from "@/lib/path-linkify";

/**
 * Distributes the current conversation's file index to deep renderers without
 * prop drilling. `MarkdownBody` is also used outside the chat (the file viewer's
 * markdown preview); there the provider is simply absent and the default `null`
 * keeps today's rendering.
 */
const FileIndexContext = createContext<FileIndexLookup | null>(null);

export function FileIndexProvider({
  lookup,
  children,
}: {
  lookup: FileIndexLookup | null;
  children: ReactNode;
}) {
  return <FileIndexContext.Provider value={lookup}>{children}</FileIndexContext.Provider>;
}

export function useFileIndexContext(): FileIndexLookup | null {
  return useContext(FileIndexContext);
}
