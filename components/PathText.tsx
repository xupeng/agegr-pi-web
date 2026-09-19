"use client";

import { useMemo, type MouseEvent } from "react";
import { shouldOpenLocalFileInApp } from "@/lib/file-links";
import { linkifyPlainText } from "@/lib/path-linkify";
import { useFileIndexContext } from "./FileIndexContext";

export interface PathTextProps {
  text: string;
  /** Opens a verified path in the preview pane. Without it nothing is linked. */
  onOpenFile?: (filePath: string) => void;
}

/**
 * Render plain text, turning tokens the file index confirms into in-app links.
 *
 * Returns a fragment with no wrapper element, so callers inside `<pre>` keep
 * their exact whitespace, alignment and wrapping. When no index is available (or
 * no handler was supplied) every token is emitted verbatim and the output is
 * identical to plain text.
 */
export function PathText({ text, onOpenFile }: PathTextProps) {
  const lookup = useFileIndexContext();
  const segments = useMemo(
    () => (lookup && onOpenFile ? linkifyPlainText(text, { lookup }) : [{ text }]),
    [text, lookup, onOpenFile],
  );

  if (segments.length === 1 && !segments[0].match) return <>{segments[0].text}</>;

  return (
    <>
      {segments.map((segment, index) => {
        const match = segment.match;
        if (!match || !onOpenFile) return segment.text;
        const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
          if (!shouldOpenLocalFileInApp(event)) return;
          event.preventDefault();
          onOpenFile(match.filePath);
        };
        return (
          <a key={`${match.filePath}-${index}`} href={match.relativePath} className="path-text-link" onClick={handleClick}>
            {segment.text}
          </a>
        );
      })}
    </>
  );
}
