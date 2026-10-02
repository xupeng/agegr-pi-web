import type { Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { markdownPreviewRemarkPlugins, normalizeDisplayMath } from "@/lib/markdown";

/**
 * The outline of one assistant answer, as the chat minimap describes it.
 *
 * It mirrors what the minimap preview renders (`remarkPreviewOutline` in
 * `components/ChatMinimap.tsx`): the answer's root-level headings up to
 * `MAX_OUTLINE_DEPTH`, or its first paragraph when it has no heading at all. Both readers filter
 * through `isOutlineHeading()`, so a rail tick can never point at a row the panel does not render.
 */
export const MAX_OUTLINE_DEPTH = 3;

export interface OutlineHeadingNode {
  type?: string;
  depth?: number;
}

export function isOutlineHeading(node: OutlineHeadingNode): boolean {
  return node.type === "heading"
    && typeof node.depth === "number"
    && node.depth <= MAX_OUTLINE_DEPTH;
}

export interface OutlineRow {
  kind: "heading" | "paragraph";
  /** 1-3 for a heading; 0 for the paragraph a heading-less answer falls back to. */
  level: 1 | 2 | 3 | 0;
  /** Position among this answer's headings, for the rendered `h1, h2, h3` lookup. */
  headingIndex: number;
  /** Plain text of the row, for the rail's tooltip. */
  text: string;
}

interface OutlineTextNode extends OutlineHeadingNode {
  value?: string;
  alt?: string;
  children?: OutlineTextNode[];
}

const outlineProcessor = unified()
  .use(remarkParse)
  .use(markdownPreviewRemarkPlugins ?? []);

// Outline rows are recomputed whenever the minimap re-measures (a 150ms-throttled pass over every
// loaded answer), while the markdown behind them only changes on a new message. Keep the parse
// behind a small cache keyed by the markdown itself.
const OUTLINE_CACHE_LIMIT = 200;
const outlineCache = new Map<string, OutlineRow[]>();

export function extractOutlineRows(markdown: string): OutlineRow[] {
  if (!markdown) return [];
  const cached = outlineCache.get(markdown);
  if (cached) return cached;

  const rows = readOutlineRows(markdown);
  if (outlineCache.size >= OUTLINE_CACHE_LIMIT) {
    const oldest = outlineCache.keys().next().value;
    if (oldest !== undefined) outlineCache.delete(oldest);
  }
  outlineCache.set(markdown, rows);
  return rows;
}

function readOutlineRows(markdown: string): OutlineRow[] {
  let children: OutlineTextNode[];
  try {
    const normalized = normalizeDisplayMath(markdown);
    children = (outlineProcessor.runSync(
      outlineProcessor.parse(normalized),
      normalized,
    ) as Root).children as unknown as OutlineTextNode[];
  } catch {
    // A message that fails to parse still belongs to the conversation; it simply
    // contributes no outline rows instead of taking the whole minimap down.
    return [];
  }

  const headings = children.filter((child) => isOutlineHeading(child));
  if (headings.length > 0) {
    return headings.map((heading, headingIndex) => ({
      kind: "heading" as const,
      level: Math.min(MAX_OUTLINE_DEPTH, Math.max(1, heading.depth ?? 1)) as 1 | 2 | 3,
      headingIndex,
      text: rowText(heading),
    }));
  }

  const paragraph = children.find((child) => child.type === "paragraph");
  return paragraph
    ? [{ kind: "paragraph", level: 0, headingIndex: -1, text: rowText(paragraph) }]
    : [];
}

/** A rail tooltip is one line, so the row's text is collapsed to one. */
function rowText(node: OutlineTextNode): string {
  return nodeText(node).replace(/\s+/g, " ").trim();
}

/** Every string an inline node contributes, so a heading of `**bold** \`code\`` reads as text. */
function nodeText(node: OutlineTextNode): string {
  if (typeof node.value === "string") return node.value;
  if (typeof node.alt === "string") return node.alt;
  return (node.children ?? []).map(nodeText).join("");
}
