"use client";

import {
  Children,
  createContext,
  memo,
  useContext,
  useMemo,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import { parsePdfPageFragment, resolveLocalFileHref, shouldOpenLocalFileInApp } from "@/lib/file-links";
import { encodeFilePathForApi } from "@/lib/file-paths";
import { isAudioPath, isVideoPath } from "@/lib/file-types";
import { linkifyPlainText, linkifyToken, type FileIndexLookup } from "@/lib/path-linkify";
import { isExternalMarkdownHref, jumpToMarkdownFragment, markdownAppUrlTransform, markdownDocumentRehypePlugins, markdownRehypePlugins, markdownRemarkPlugins, markdownUrlTransform, markdownUserRemarkPlugins, normalizeDisplayMath } from "@/lib/markdown";
import { splitMarkdownBlocks } from "@/lib/markdown-blocks";
import { FileIndexProvider, useFileIndexContext } from "./FileIndexContext";
import { ImagePreview } from "./ImagePreview";
import { PathText } from "./PathText";
import type { OpenWrittenFileHandler } from "./TurnWrittenFiles";
import { MermaidBlock, CodeBlock } from "./MermaidBlock";

const MarkdownLinkContext = createContext(false);

interface MarkdownBodyProps {
  children: string;
  className?: string;
  isStreaming?: boolean;
  cwd?: string;
  onOpenFile?: OpenWrittenFileHandler;
  /** A document reader's own links: relative paths and `#headings` stay in the reader. */
  onNavigateLink?: (href: string) => void;
  /** Preserve user-typed line breaks. */
  keepLineBreaks?: boolean;
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
  const mediaSrc = filePath
    ? `/api/files/${encodeFilePathForApi(filePath)}?type=read`
    : href;
  // `![](take.wav)` is how a model shows a sound or clip it made, and an <img>
  // cannot play it. The file API already streams both with range requests.
  const mediaPath = filePath ?? href?.split(/[?#]/, 1)[0] ?? "";
  const label = alt?.trim() ? alt : undefined;
  if (isAudioPath(mediaPath)) {
    return <audio controls preload="metadata" src={mediaSrc} aria-label={label} />;
  }
  if (isVideoPath(mediaPath)) {
    return <video controls playsInline preload="metadata" src={mediaSrc} aria-label={label} />;
  }
  // Dynamic local paths are served directly by the file API.
  // eslint-disable-next-line @next/next/no-img-element
  const image = <img src={mediaSrc} alt={alt ?? ""} loading="lazy" {...props} />;
  if (!mediaSrc || insideLink) return image;
  return (
    <ImagePreview src={mediaSrc} alt={alt ?? ""} className="markdown-image">
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

function useLinkifiedChildren(children: ReactNode, onOpenFile?: OpenWrittenFileHandler): ReactNode {
  const lookup = useFileIndexContext();
  return lookup && onOpenFile ? linkifyChildren(children, lookup, onOpenFile) : children;
}

interface MarkdownBlockProps {
  markdown: string;
  remarkPlugins: typeof markdownRemarkPlugins;
  urlTransform: typeof markdownUrlTransform;
  rehypePlugins: typeof markdownRehypePlugins;
  components: Components;
}

/** One parse; skipped while its text and renderers stay the same. */
const MarkdownBlock = memo(function MarkdownBlock({ markdown, remarkPlugins, urlTransform, rehypePlugins, components }: MarkdownBlockProps) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      urlTransform={urlTransform}
      components={components}
    >
      {markdown}
    </ReactMarkdown>
  );
});

export const MarkdownBody = memo(function MarkdownBody({ children, className, isStreaming, cwd, onOpenFile, onNavigateLink, keepLineBreaks }: MarkdownBodyProps) {
  const normalizedMarkdown = useMemo(() => normalizeDisplayMath(children), [children]);
  // A streaming reply grows by a few characters per chunk; parsing all of it
  // each time made a long reply quadratic. Its finished blocks keep their
  // parse and only the last is parsed again. A finished message is one block.
  const blocks = useMemo(
    () => (isStreaming ? splitMarkdownBlocks(normalizedMarkdown) : [normalizedMarkdown]),
    [isStreaming, normalizedMarkdown],
  );
  // Read the changing index inside each renderer, not in the memo's closure.
  // TTL refreshes must update links without changing React element types and
  // remounting paragraphs/code blocks underneath stable message entry keys.
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
    p: function ParagraphRenderer({ children, ...props }) {
      delete props.node;
      return <p {...props}>{useLinkifiedChildren(children, onOpenFile)}</p>;
    },
    li: function ListItemRenderer({ children, ...props }) {
      delete props.node;
      return <li {...props}>{useLinkifiedChildren(children, onOpenFile)}</li>;
    },
    td: function TableCellRenderer({ children, ...props }) {
      delete props.node;
      return <td {...props}>{useLinkifiedChildren(children, onOpenFile)}</td>;
    },
    th: function TableHeaderRenderer({ children, ...props }) {
      delete props.node;
      return <th {...props}>{useLinkifiedChildren(children, onOpenFile)}</th>;
    },
    a({ href, children, ...props }) {
      // `node` is react-markdown metadata, not a DOM attribute.
      delete props.node;
      if (onNavigateLink && href && !isExternalMarkdownHref(href)) {
        // No href: a middle-click or "Open in new tab" would load the path on the app's own URL.
        const navigate = () => onNavigateLink(href);
        return (
          <MarkdownLinkContext.Provider value={true}>
            <a {...props} role="link" tabIndex={0} onClick={navigate} onKeyDown={(event) => { if (event.key === "Enter") navigate(); }}>
              <FileIndexProvider lookup={null}>{children}</FileIndexProvider>
            </a>
          </MarkdownLinkContext.Provider>
        );
      }
      if (href?.startsWith("#")) {
        // An in-page link: never a second tab of Pi Web.
        return (
          <MarkdownLinkContext.Provider value={true}>
            <a href={href} {...props} onClick={jumpToMarkdownFragment}>
              <FileIndexProvider lookup={null}>{children}</FileIndexProvider>
            </a>
          </MarkdownLinkContext.Provider>
        );
      }
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
    ol({ node, start, style, ...props }) {
      // An outside marker wider than the list's left padding is clipped by
      // .markdown-body's overflow-x, so the padding follows the largest number.
      const items = node?.children.filter((child) => child.type === "element" && child.tagName === "li").length ?? 0;
      const digits = String(Math.abs((start ?? 1) + Math.max(items, 1) - 1)).length;
      return <ol start={start} style={{ ...style, ["--ol-marker-digits" as string]: Math.max(digits, 2) }} {...props} />;
    },
    table({ children }) {
      // The frame draws the border; the scroller inside it fades its scrolled
      // edges, which on the bordered box would fade the border too.
      return (
        <div className="markdown-table-frame">
          <div className="markdown-table-wrap">
            <table>{children}</table>
          </div>
        </div>
      );
    },
  }), [cwd, isStreaming, onOpenFile, onNavigateLink]);

  return (
    <div className={["markdown-body", className].filter(Boolean).join(" ")}>
      {blocks.map((block, index) => (
        <MarkdownBlock
          key={index}
          markdown={block}
          remarkPlugins={keepLineBreaks ? markdownUserRemarkPlugins : markdownRemarkPlugins}
          urlTransform={onOpenFile ? markdownUrlTransform : markdownAppUrlTransform}
          rehypePlugins={onNavigateLink ? markdownDocumentRehypePlugins : markdownRehypePlugins}
          components={components}
        />
      ))}
    </div>
  );
});
