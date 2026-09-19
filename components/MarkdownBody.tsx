"use client";

import {
  Children,
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import { parsePdfPageFragment, resolveLocalFileHref, shouldOpenLocalFileInApp } from "@/lib/file-links";
import { encodeFilePathForApi } from "@/lib/file-paths";
import { linkifyPlainText, linkifyToken, type FileIndexLookup } from "@/lib/path-linkify";
import { markdownRehypePlugins, markdownRemarkPlugins, markdownUrlTransform, normalizeDisplayMath } from "@/lib/markdown";
import { FileIndexProvider, useFileIndexContext } from "./FileIndexContext";
import { PathText } from "./PathText";
import { ImagePreview } from "./ImagePreview";
import type { OpenWrittenFileHandler } from "./TurnWrittenFiles";
import { MermaidBlock, CodeBlock } from "./MermaidBlock";

const MarkdownLinkContext = createContext(false);

interface MarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  onOpenFile?: OpenWrittenFileHandler;
}

function MarkdownImage({
  src,
  alt,
  cwd,
  ...props
}: ComponentProps<"img"> & ExtraProps & { cwd?: string }) {
  const insideLink = useContext(MarkdownLinkContext);
  delete props.node;
  const href = typeof src === "string" ? src : undefined;
  const filePath = href ? resolveLocalFileHref(href, cwd) : null;
  const imageSrc = filePath
    ? `/api/files/${encodeFilePathForApi(filePath)}?type=read`
    : href;
  // Dynamic local paths are served directly by the file API.
  // eslint-disable-next-line @next/next/no-img-element
  const image = <img src={imageSrc} alt={alt ?? ""} loading="lazy" {...props} />;
  if (!imageSrc || insideLink) return image;
  return (
    <ImagePreview src={imageSrc} alt={alt ?? ""} className="markdown-image">
      {image}
    </ImagePreview>
  );
}

/**
 * Linkify only the string children of a block element. Elements (`code`, `a`,
 * `strong` …) are left untouched so nested markup keeps its own renderer, and
 * text with no index hit is returned byte-identical to the default output.
 */
function linkifyChildren(
  children: ReactNode,
  lookup: FileIndexLookup,
  onOpenFile: (filePath: string) => void,
): ReactNode {
  let changed = false;
  const mapped = Children.map(children, (child) => {
    if (typeof child !== "string") return child;
    const segments = linkifyPlainText(child, { lookup });
    if (!segments.some((segment) => segment.match)) return child;
    changed = true;
    return <PathText text={child} onOpenFile={onOpenFile} />;
  });
  return changed ? mapped : children;
}

export function MarkdownBody({ children, className, isStreaming, cwd, onOpenFile }: MarkdownBodyProps) {
  const normalizedMarkdown = useMemo(() => normalizeDisplayMath(children), [children]);
  const lookup = useFileIndexContext();
  const linkifyBlockChildren = useCallback(
    (node: ReactNode) => (lookup && onOpenFile ? linkifyChildren(node, lookup, onOpenFile) : node),
    [lookup, onOpenFile],
  );
  // Stable renderer identities keep stateful blocks mounted across message hover updates.
  const components = useMemo<Components>(() => ({
    code: function CodeRenderer({ className, children, ...props }) {
      // An existing anchor disables automatic links for all its descendants.
      const codeLookup = useFileIndexContext();
      const lang = className?.replace("language-", "").toLowerCase() ?? "";
      const raw = String(children);
      const isBlock = className?.includes("language-") || raw.includes("\n");
      if (isBlock) {
        if (lang === "mermaid") {
          return (
            <MermaidBlock
              code={raw.replace(/\n$/, "")}
              isStreaming={isStreaming}
              defaultPreview
            />
          );
        }
        return <CodeBlock code={raw.replace(/\n$/, "")} lang={lang} isStreaming={isStreaming} />;
      }
      // `node` is react-markdown metadata, not a DOM attribute.
      delete props.node;
      const match = codeLookup && onOpenFile ? linkifyToken(raw, { lookup: codeLookup }) : null;
      if (match && onOpenFile) {
        const filePath = match.filePath;
        const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
          if (!shouldOpenLocalFileInApp(event)) return;
          event.preventDefault();
          onOpenFile(filePath);
        };
        return (
          <a
            href={match.relativePath}
            className="markdown-inline-code markdown-file-link"
            onClick={handleClick}
          >
            {children}
          </a>
        );
      }
      return (
        <code
          className="markdown-inline-code"
          {...props}
        >
          {children}
        </code>
      );
    },
    pre({ children }) {
      return <>{children}</>;
    },
    p({ children, ...props }) {
      delete props.node;
      return <p {...props}>{linkifyBlockChildren(children)}</p>;
    },
    li({ children, ...props }) {
      delete props.node;
      return <li {...props}>{linkifyBlockChildren(children)}</li>;
    },
    td({ children, ...props }) {
      delete props.node;
      return <td {...props}>{linkifyBlockChildren(children)}</td>;
    },
    th({ children, ...props }) {
      delete props.node;
      return <th {...props}>{linkifyBlockChildren(children)}</th>;
    },
    a({ href, children, ...props }) {
      // `node` is react-markdown metadata, not a DOM attribute.
      delete props.node;
      const filePath = onOpenFile ? resolveLocalFileHref(href, cwd) : null;
      const openFile = onOpenFile;
      if (!filePath || !openFile) {
        return (
          <MarkdownLinkContext.Provider value={true}>
            <a href={href} {...props} target="_blank" rel="noopener noreferrer">
              <FileIndexProvider lookup={null}>{children}</FileIndexProvider>
            </a>
          </MarkdownLinkContext.Provider>
        );
      }

      const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (!shouldOpenLocalFileInApp(event)) return;
        const target = event.currentTarget.getAttribute("target");
        if (target && target !== "_self") return;
        event.preventDefault();
        openFile(filePath, { page: parsePdfPageFragment(href) ?? undefined });
      };

      return (
        <MarkdownLinkContext.Provider value={true}>
          <a href={href} {...props} onClick={handleClick}>
            <FileIndexProvider lookup={null}>{children}</FileIndexProvider>
          </a>
        </MarkdownLinkContext.Provider>
      );
    },
    img(props) {
      return <MarkdownImage cwd={cwd} {...props} />;
    },
    table({ children }) {
      return (
        <div className="markdown-table-wrap">
          <table>{children}</table>
        </div>
      );
    },
  }), [cwd, isStreaming, onOpenFile, linkifyBlockChildren]);

  return (
    <div className={["markdown-body", className].filter(Boolean).join(" ")}>
      <ReactMarkdown
        remarkPlugins={markdownRemarkPlugins}
        rehypePlugins={markdownRehypePlugins}
        urlTransform={onOpenFile ? markdownUrlTransform : undefined}
        components={components}
      >
        {normalizedMarkdown}
      </ReactMarkdown>
    </div>
  );
}
