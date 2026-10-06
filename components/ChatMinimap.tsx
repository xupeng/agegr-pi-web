"use client";

import { memo, useEffect, useRef, useState, useCallback, useMemo, type RefObject } from "react";
import ReactMarkdown, { type Options as ReactMarkdownOptions } from "react-markdown";
import rehypeKatex from "rehype-katex";
import { extractOutlineRows, isOutlineHeading, type OutlineRow } from "@/lib/markdown-outline";
import {
  markdownPreviewRemarkPlugins,
  normalizeDisplayMath,
} from "@/lib/markdown";
import { isMessageGroupAnchor, splitFinalAssistantBlocks } from "@/lib/message-display";
import type { AgentMessage, AssistantMessage, CustomMessage, TextContent, UserMessage } from "@/lib/types";
import { useI18n } from "@/hooks/useI18n";
import { useHoverCapable } from "@/hooks/useIsMobile";
import { CHAT_MINIMAP_WIDTH } from "@/lib/chat-layout";
import styles from "./ChatMinimap.module.css";

interface Props {
  messages: AgentMessage[];
  streamingMessage: Partial<AgentMessage> | null;
  scrollContainer: RefObject<HTMLDivElement | null>;
  messageRefs: RefObject<(HTMLDivElement | null)[]>;
  onRevealHistory: () => void;
}

/**
 * The rail follows Notion's outline rail: one 2px rounded line per outline row, a step shorter and
 * further right per level, so a whole conversation's structure fits in a strip this narrow. The row
 * titles live in the preview panel: a hover opens it on a mouse, a tap on a touch screen.
 */
/** Tick pitch: Notion's 2px line plus a 12px gap. A longer outline compresses, never overflows. */
const TICK_GAP_MAX = 14;
/** Notion anchors its outline this far below the top of the view instead of centring it. */
const RAIL_TOP_ANCHOR = 130;
const MINIMAP_MARGIN = 8;
/** A pointer that rests on the rail opens the panel; crossing it must not flash the panel open. */
const HOVER_OPEN_DELAY_MS = 120;
const NAVIGATION_ACTIVE_LOCK_MS = 1600;
/** A jump puts its target this far down the viewport, matching the outline's focus line. */
const NAVIGATION_FOCUS_RATIO = 0.3;

/**
 * Read `ref.current` through a module-level helper so the `useCallback` dep arrays below can keep
 * listing the ref object itself.
 *
 * eslint-plugin-react-hooks 7.1.1 refuses to preserve a manual memoization whose body reads
 * `ref.current` while the deps list the ref object ("Differences in ref.current access"), and the
 * compiler-approved alternative — listing `ref.current` in the deps — makes `exhaustive-deps`
 * report a mutable dependency. Routing the read through this helper satisfies both rules while
 * keeping the dependency semantics (refs are stable) exactly as they were.
 */
function readRefCurrent<T>(ref: RefObject<T | null>): T | null {
  return ref.current;
}

interface AssistantPreview {
  markdown: string;
  element: HTMLDivElement | null;
  /** The answer's outline; empty when it renders neither a heading nor a paragraph. */
  rows: OutlineRow[];
}

interface TurnInfo {
  /** `null` when the loaded window starts mid-turn and its prompt is above the first entry. */
  userMessage: UserMessage | CustomMessage | null;
  userPreview: string;
  assistantPreviews: AssistantPreview[];
  /** Element a click on the turn's own row scrolls to: its prompt, or its first loaded answer. */
  element: HTMLDivElement | null;
  scrollTop: number | null;
  /** Tool calls issued anywhere in this turn's assistant replies. */
  toolCount: number;
}

/** One rail tick and one preview row describe the same piece of the conversation. */
interface NodeInfo {
  topRatio: number;
  index: number;
  turn: TurnInfo;
  turnIndex: number;
  /** `null` on the turn's header row, the user prompt. */
  assistantIndex: number | null;
  /** Whether this row draws a tick. A turn header does only when its answers have no outline. */
  tick: boolean;
  /** 1-3 for a heading; 0 for prose, and for the turn header standing in for a whole turn. */
  level: 1 | 2 | 3 | 0;
  /** Tooltip text for the tick. */
  text: string;
  /** Index among the answer's `h1, h2, h3`, or `null` for the turn row and prose rows. */
  headingIndex: number | null;
  scrollTop: number | null;
}

function getUserPreview(message: UserMessage | CustomMessage): string {
  if (typeof message.content === "string") return message.content.trim();
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Tool calls in one assistant message. A reply can both answer and call
 *  tools, so this counts blocks rather than text-less messages. */
export function countToolCalls(message: AgentMessage | Partial<AgentMessage>): number {
  if (message.role !== "assistant" || !Array.isArray(message.content)) return 0;
  return message.content.reduce(
    (total, block) => total + (block.type === "toolCall" ? 1 : 0),
    0,
  );
}

function getAssistantAnswerMarkdown(message: AgentMessage | Partial<AgentMessage>): string {
  if (message.role !== "assistant") return "";
  const { answerBlocks } = splitFinalAssistantBlocks(message as AssistantMessage);
  return answerBlocks
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

function PreviewHeading({
  level,
  children,
  headingIndex,
  onClick,
}: {
  level: 1 | 2 | 3;
  children: React.ReactNode;
  headingIndex: number | null;
  onClick?: (headingIndex: number) => void;
}) {
  return (
    <button
      type="button"
      className={styles.heading}
      data-level={level}
      data-preview-heading-index={headingIndex ?? undefined}
      disabled={headingIndex === null || !onClick}
      onClick={(event) => {
        event.stopPropagation();
        if (headingIndex !== null) onClick?.(headingIndex);
      }}
    >
      {children}
    </button>
  );
}

interface PreviewAstNode {
  type?: string;
  depth?: number;
  data?: {
    hProperties?: Record<string, unknown>;
  };
}

function remarkPreviewOutline() {
  return (tree: { children?: PreviewAstNode[] }) => {
    if (!Array.isArray(tree.children)) return;
    const headings = tree.children.filter((node) => isOutlineHeading(node));
    if (headings.length > 0) {
      headings.forEach((node, headingIndex) => {
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            "data-preview-heading-index": headingIndex,
          },
        };
      });
      tree.children = headings;
      return;
    }
    const firstParagraph = tree.children.find((node) => node.type === "paragraph");
    tree.children = firstParagraph ? [firstParagraph] : [];
  };
}

const previewRemarkPlugins = [
  ...(markdownPreviewRemarkPlugins ?? []),
  remarkPreviewOutline,
];
const previewRehypePlugins: ReactMarkdownOptions["rehypePlugins"] = [
  [rehypeKatex, { throwOnError: false, strict: false }],
];

function getPreviewHeadingIndex(node: unknown): number | null {
  const properties = (node as { properties?: Record<string, unknown> } | undefined)?.properties;
  const value = properties?.dataPreviewHeadingIndex ?? properties?.["data-preview-heading-index"];
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

export const AssistantOutline = memo(function AssistantOutline({
  markdown,
  onHeadingClick,
  onAnswerClick,
}: {
  markdown: string;
  onHeadingClick?: (headingIndex: number) => void;
  onAnswerClick?: () => void;
}) {
  const normalizedMarkdown = useMemo(() => normalizeDisplayMath(markdown), [markdown]);
  if (!markdown) return null;
  return (
    <div className={styles.outline}>
      <ReactMarkdown
        remarkPlugins={previewRemarkPlugins}
        rehypePlugins={previewRehypePlugins}
        components={{
          h1: ({ children, node }) => <PreviewHeading level={1} headingIndex={getPreviewHeadingIndex(node)} onClick={onHeadingClick}>{children}</PreviewHeading>,
          h2: ({ children, node }) => <PreviewHeading level={2} headingIndex={getPreviewHeadingIndex(node)} onClick={onHeadingClick}>{children}</PreviewHeading>,
          h3: ({ children, node }) => <PreviewHeading level={3} headingIndex={getPreviewHeadingIndex(node)} onClick={onHeadingClick}>{children}</PreviewHeading>,
          h4: () => null,
          h5: () => null,
          h6: () => null,
          p: ({ children }) => (
            <button
              type="button"
              className={styles.paragraph}
              onClick={onAnswerClick}
            >
              {children}
            </button>
          ),
          blockquote: () => null,
          ul: () => null,
          ol: () => null,
          pre: () => null,
          table: () => null,
          hr: () => null,
          a: ({ children }) => <>{children}</>,
          code: ({ children }) => <>{children}</>,
        }}
      >
        {normalizedMarkdown}
      </ReactMarkdown>
    </div>
  );
});

/**
 * Flatten the loaded turns into the rows the rail and the panel both read: a turn contributes its
 * header row plus one row per answer, and `measureTop` turns a row's rendered element into the
 * content offset that places the current section's tick.
 */
function createOutlineNodes(
  turns: TurnInfo[],
  measureTop: (element: HTMLElement | null) => number | null,
): NodeInfo[] {
  const nodes: NodeInfo[] = [];
  turns.forEach((turn, turnIndex) => {
    // A turn with no outline of its own still has to be reachable: it shows as one tick at the
    // top level, and the panel lists it as a header row like any other turn.
    const hasOutline = turn.assistantPreviews.some((answer) => answer.rows.length > 0);
    nodes.push({
      topRatio: 0,
      index: nodes.length,
      turn,
      turnIndex,
      assistantIndex: null,
      tick: !hasOutline,
      level: 0,
      text: turn.userPreview,
      headingIndex: null,
      scrollTop: turn.scrollTop,
    });

    turn.assistantPreviews.forEach((answer, assistantIndex) => {
      if (answer.rows.length === 0) return;
      // One query per answer: `headingIndex` numbers exactly the headings
      // `remarkPreviewOutline` rendered, which is how the panel numbers them too.
      const headings = answer.element?.querySelectorAll<HTMLElement>("h1, h2, h3") ?? null;
      for (const row of answer.rows) {
        const heading = row.kind === "heading" ? headings?.item(row.headingIndex) ?? null : null;
        nodes.push({
          topRatio: 0,
          index: nodes.length,
          turn,
          turnIndex,
          assistantIndex,
          tick: true,
          level: row.level,
          text: row.text,
          headingIndex: row.kind === "heading" ? row.headingIndex : null,
          scrollTop: measureTop(heading ?? answer.element),
        });
      }
    });
  });
  return nodes;
}

/**
 * The element a click on `node` scrolls to, read from the live DOM rather than from the last
 * measurement: a heading can move (lazy media, process details opening) between the throttled
 * measure pass and the click, and the jump has to land where the row points.
 */
function resolveNodeElement(node: NodeInfo): HTMLElement | null {
  if (node.assistantIndex === null) return node.turn.element;
  const answer = node.turn.assistantPreviews[node.assistantIndex];
  if (!answer?.element) return null;
  if (node.headingIndex === null) return answer.element;
  return answer.element.querySelectorAll<HTMLElement>("h1, h2, h3").item(node.headingIndex) || null;
}

interface NodeLayout {
  nodes: NodeInfo[];
  gap: number;
  fillsHeight: boolean;
}

export interface TickSpacing {
  /** Vertical distance between two ticks. */
  gap: number;
  /** Offset of the first tick from the rail's top. */
  start: number;
  /** Whether the pitch was compressed below `TICK_GAP_MAX` to make every tick fit. */
  fillsHeight: boolean;
}

/**
 * The outline starts `RAIL_TOP_ANCHOR` below the rail's top, as Notion's does, and keeps its fixed
 * pitch while it fits; an outline too long for the rest of the rail is compressed until every tick
 * fits, which turns the column below the anchor into a scroll position map. Ticks are never
 * clipped: a tick the reader cannot reach is a heading the rail cannot point at. The anchor itself
 * gives way only for a rail shorter than the anchor, so the group never starts off-screen.
 */
export function tickSpacing(count: number, minimapHeight: number): TickSpacing {
  const height = Math.max(1, minimapHeight);
  const anchor = Math.min(RAIL_TOP_ANCHOR, Math.max(MINIMAP_MARGIN, height - MINIMAP_MARGIN));
  const usableHeight = Math.max(0, height - anchor - MINIMAP_MARGIN);
  const spread = Math.max(0, count - 1);
  const gap = Math.min(TICK_GAP_MAX, spread > 0 ? usableHeight / spread : TICK_GAP_MAX);
  const span = spread * gap;
  return {
    gap,
    start: anchor,
    fillsHeight: spread > 0 && usableHeight > 0 && span >= usableHeight - 0.5,
  };
}

function layoutNodes(allNodes: NodeInfo[], minimapHeight: number): NodeLayout {
  const height = Math.max(1, minimapHeight);
  const { gap, start, fillsHeight } = tickSpacing(allNodes.length, height);
  return {
    nodes: allNodes.map((node, index) => ({
      ...node,
      topRatio: (start + index * gap) / height,
    })),
    gap,
    fillsHeight,
  };
}

export function ChatMinimap({
  messages,
  streamingMessage,
  scrollContainer,
  messageRefs,
  onRevealHistory,
}: Props) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [allNodes, setAllNodes] = useState<NodeInfo[]>([]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [minimapHeight, setMinimapHeight] = useState(600);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mouseYRatio, setMouseYRatio] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const allNodesRef = useRef<NodeInfo[]>([]);
  const nodeLayoutRef = useRef<NodeLayout>({
    nodes: [],
    gap: TICK_GAP_MAX,
    fillsHeight: false,
  });
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const previewItemRefs = useRef(new Map<number, HTMLDivElement>());
  /** Pending hover-open, so a pointer crossing the rail does not flash the panel. */
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canHover = useHoverCapable();
  const activeNodeLockRef = useRef<{ index: number; until: number } | null>(null);
  /** Row to scroll to once `onRevealHistory()` has mounted the message that owns it. */
  const pendingNavigationRef = useRef<number | null>(null);

  const allMessages = useMemo(
    () => (streamingMessage ? [...messages, streamingMessage] : messages) as (AgentMessage | Partial<AgentMessage>)[],
    [messages, streamingMessage],
  );
  const allMessagesRef = useRef(allMessages);
  allMessagesRef.current = allMessages;

  // A turn's own header is a preview row only unless its answers had no outline to show, so the
  // rail stays an outline of the answers' structure, like Notion's, and still covers every turn.
  const tickNodes = useMemo(
    () => allNodes.filter((node) => node.tick),
    [allNodes],
  );
  const nodeLayout = useMemo(
    () => layoutNodes(tickNodes, minimapHeight),
    [tickNodes, minimapHeight],
  );
  const { nodes: positionedNodes, gap: nodeGap } = nodeLayout;
  nodeLayoutRef.current = nodeLayout;

  const lockActiveNode = useCallback((index: number) => {
    activeNodeLockRef.current = {
      index,
      until: Date.now() + NAVIGATION_ACTIVE_LOCK_MS,
    };
    setActiveIndex(index);
  }, []);

  const syncActiveNode = useCallback((scrollEl: HTMLDivElement, nextNodes: NodeInfo[]) => {
    const activeLock = activeNodeLockRef.current;
    if (activeLock && Date.now() < activeLock.until) {
      setActiveIndex(activeLock.index);
      return;
    }
    activeNodeLockRef.current = null;

    const measuredNodes = nextNodes.filter((node) => node.scrollTop !== null);
    if (measuredNodes.length === 0) {
      setActiveIndex(null);
      return;
    }
    const focusTop = scrollEl.scrollTop + scrollEl.clientHeight * NAVIGATION_FOCUS_RATIO;
    const nextActiveNode = measuredNodes.reduce((bestNode, node) => (
      Math.abs((node.scrollTop ?? 0) - focusTop)
        < Math.abs((bestNode.scrollTop ?? 0) - focusTop)
        ? node
        : bestNode
    ), measuredNodes[0]);
    setActiveIndex(nextActiveNode.index);
  }, []);

  const updateScroll = useCallback(() => {
    const scrollEl = readRefCurrent(scrollContainer);
    if (!scrollEl) return;
    const scrollable = scrollEl.scrollHeight - scrollEl.clientHeight;
    const currentNodes = allNodesRef.current;
    setVisible(scrollable > 20);
    syncActiveNode(scrollEl, currentNodes);
  }, [scrollContainer, syncActiveNode]);

  const measureThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jumpToElement = useCallback((element: HTMLElement, nodeIndex: number) => {
    const scrollEl = readRefCurrent(scrollContainer);
    if (!scrollEl) return;
    const containerRect = scrollEl.getBoundingClientRect();
    const targetTop = element.getBoundingClientRect().top - containerRect.top + scrollEl.scrollTop;
    lockActiveNode(nodeIndex);
    scrollEl.scrollTo({
      top: Math.max(0, targetTop - scrollEl.clientHeight * NAVIGATION_FOCUS_RATIO),
      behavior: "smooth",
    });
  }, [lockActiveNode, scrollContainer]);

  const measureNodes = useCallback(() => {
    if (measureThrottleRef.current) return;
    measureThrottleRef.current = setTimeout(() => {
      measureThrottleRef.current = null;
      const scrollEl = readRefCurrent(scrollContainer);
      const minimapEl = containerRef.current;
      if (!scrollEl || !minimapEl) return;

      const refs = messageRefs.current;
      const containerRect = scrollEl.getBoundingClientRect();
      const turns: TurnInfo[] = [];
      let refIndex = 0;
      let currentTurn: TurnInfo | null = null;

      for (const message of allMessagesRef.current) {
        const isAnchor = isMessageGroupAnchor(message);
        if (!isAnchor && message.role !== "assistant") continue;
        const element = refs?.[refIndex];
        refIndex++;

        if (isAnchor) {
          const userMessage = message as UserMessage | CustomMessage;
          currentTurn = {
            userMessage,
            userPreview: getUserPreview(userMessage),
            assistantPreviews: [],
            element,
            scrollTop: element
              ? element.getBoundingClientRect().top - containerRect.top + scrollEl.scrollTop
              : null,
            toolCount: 0,
          };
          turns.push(currentTurn);
          continue;
        }

        if (!currentTurn) {
          // The loaded window starts mid-turn: the prompt is above the first entry, so this
          // assistant message opens the turn it belongs to instead of being dropped.
          currentTurn = {
            userMessage: null,
            userPreview: "",
            assistantPreviews: [],
            element,
            scrollTop: element
              ? element.getBoundingClientRect().top - containerRect.top + scrollEl.scrollTop
              : null,
            toolCount: 0,
          };
          turns.push(currentTurn);
        }
        currentTurn.toolCount += countToolCalls(message);
        const answerMarkdown = getAssistantAnswerMarkdown(message);
        if (answerMarkdown) {
          currentTurn.assistantPreviews.push({
            markdown: answerMarkdown,
            element,
            rows: extractOutlineRows(answerMarkdown),
          });
        }
      }

      const measureTop = (element: HTMLElement | null): number | null => (
        element
          ? element.getBoundingClientRect().top - containerRect.top + scrollEl.scrollTop
          : null
      );
      const nextNodes = createOutlineNodes(turns, measureTop);
      const nextTicks = nextNodes.filter((node) => node.tick);
      setMinimapHeight(minimapEl.clientHeight);
      allNodesRef.current = nextTicks;
      setAllNodes(nextNodes);
      setVisible(scrollEl.scrollHeight - scrollEl.clientHeight > 20);
      syncActiveNode(scrollEl, nextTicks);

      const pendingNodeIndex = pendingNavigationRef.current;
      const pendingNode = pendingNodeIndex === null ? null : nextNodes[pendingNodeIndex];
      const pendingElement = pendingNode ? resolveNodeElement(pendingNode) : null;
      if (pendingNode && pendingElement) {
        pendingNavigationRef.current = null;
        jumpToElement(pendingElement, pendingNode.index);
      }
    }, 150);
  }, [jumpToElement, messageRefs, scrollContainer, syncActiveNode]);

  useEffect(() => {
    const el = scrollContainer.current;
    if (!el) return;
    el.addEventListener("scroll", updateScroll, { passive: true });
    return () => el.removeEventListener("scroll", updateScroll);
  }, [scrollContainer, updateScroll]);

  useEffect(() => {
    const el = scrollContainer.current;
    if (!el) return;
    const syncLayout = () => {
      measureNodes();
      updateScroll();
    };
    const ro = new ResizeObserver(syncLayout);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    syncLayout();
    return () => {
      ro.disconnect();
      if (measureThrottleRef.current) {
        clearTimeout(measureThrottleRef.current);
        measureThrottleRef.current = null;
      }
    };
  }, [measureNodes, scrollContainer, updateScroll]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      measureNodes();
      updateScroll();
    }, 50);
    return () => clearTimeout(timeout);
  }, [messages.length, measureNodes, updateScroll]);

  const scrollToNode = useCallback((node: NodeInfo) => {
    const element = resolveNodeElement(node);
    if (!element) {
      pendingNavigationRef.current = node.index;
      onRevealHistory();
      return;
    }
    jumpToElement(element, node.index);
  }, [jumpToElement, onRevealHistory]);

  const findNearestNode = useCallback((ratio: number): NodeInfo | null => {
    const { nodes, gap, fillsHeight } = nodeLayoutRef.current;
    const height = containerRef.current?.clientHeight ?? 0;
    if (nodes.length === 0 || height <= 0) return null;

    const pointerY = Math.max(0, Math.min(height, ratio * height));
    const firstNodeY = nodes[0].topRatio * height;
    const rawIndex = gap > 0 ? Math.round((pointerY - firstNodeY) / gap) : 0;
    const nodeIndex = Math.max(0, Math.min(nodes.length - 1, rawIndex));
    const nearestNode = nodes[nodeIndex];

    if (!fillsHeight) {
      const nodeY = nearestNode.topRatio * height;
      const hitRadius = Math.max(10, gap / 2);
      if (Math.abs(pointerY - nodeY) > hitRadius) return null;
    }
    return nearestNode;
  }, []);

  // A mouse opens the panel by resting on the rail, after a short delay so crossing the edge on the
  // way elsewhere does not flash a 240px panel; a touch screen keeps the tap, since a tap is the
  // only thing it can do. Either way the panel is only the switch — every jump starts inside it.
  const togglePreview = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (canHover) return;
    if (previewBoxRef.current?.contains(event.target as Node)) return;
    setPreviewOpen((open) => !open);
  }, [canHover]);

  const cancelHoverOpen = useCallback(() => {
    if (hoverTimerRef.current === null) return;
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  const handleRailEnter = useCallback(() => {
    if (!canHover) return;
    cancelHoverOpen();
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      setPreviewOpen(true);
    }, HOVER_OPEN_DELAY_MS);
  }, [canHover, cancelHoverOpen]);

  // Leaving the rail also leaves the panel (it is a child, so moving into the panel is not a leave).
  // Only for a hover-capable pointer: a touch screen synthesises a `mouseleave` right after a tap,
  // which would close the panel the tap just opened.
  const handleRailLeave = useCallback(() => {
    cancelHoverOpen();
    setMouseYRatio(null);
    if (canHover) setPreviewOpen(false);
  }, [canHover, cancelHoverOpen]);

  useEffect(() => cancelHoverOpen, [cancelHoverOpen]);

  useEffect(() => {
    if (!visible) {
      setPreviewOpen(false);
      return;
    }
    if (!previewOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setPreviewOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      // Escape is also the global "stop agent" shortcut (`hooks/useKeyboardShortcuts.ts`), and a
      // rail click leaves the focus outside a textarea/input, so closing the panel must consume
      // the key in the capture phase instead of dismissing the panel and aborting the run at once.
      event.stopPropagation();
      setPreviewOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [previewOpen, visible]);

  const nearestNode = mouseYRatio === null ? null : findNearestNode(mouseYRatio);
  const nearestTurnIndex = nearestNode?.turnIndex ?? null;

  // The panel lists turns: a header row for the user prompt, then the outline of every answer
  // below it — the same rows, in the same order and levels, the rail's ticks are drawn from.
  const previewTurns = useMemo(() => {
    const groups: { turnIndex: number; header: NodeInfo; nodes: NodeInfo[] }[] = [];
    for (const node of allNodes) {
      if (node.assistantIndex === null) {
        groups.push({ turnIndex: node.turnIndex, header: node, nodes: [] });
        continue;
      }
      groups[groups.length - 1]?.nodes.push(node);
    }
    return groups;
  }, [allNodes]);

  useEffect(() => {
    if (!previewOpen || nearestTurnIndex === null) return;
    const previewBox = previewBoxRef.current;
    const previewItem = previewItemRefs.current.get(nearestTurnIndex);
    if (!previewBox || !previewItem) return;
    const targetTop = previewItem.offsetTop
      - (previewBox.clientHeight - previewItem.offsetHeight) / 2;
    previewBox.scrollTop = Math.max(0, targetTop);
  }, [allNodes, previewOpen, nearestTurnIndex]);

  return (
    <div
      ref={containerRef}
      onClick={togglePreview}
      onMouseEnter={handleRailEnter}
      onMouseLeave={handleRailLeave}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setMouseYRatio((event.clientY - rect.top) / rect.height);
      }}
      // A tick has no room for a label, so the row under the pointer names itself.
      title={!previewOpen && nearestNode ? nearestNode.text : undefined}
      style={{
        width: CHAT_MINIMAP_WIDTH,
        flexShrink: 0,
        visibility: visible ? "visible" : "hidden",
        position: "relative",
        cursor: "pointer",
        userSelect: "none",
        // Keep the full-height layout slot and shared handlers, but let blank space pass through.
        // Only tick rows and the preview opt back in; their events still reach this parent.
        pointerEvents: "none",
        // No rail, no background: Notion's outline is a floating column of ticks. A bordered,
        // filled strip down the whole chat reads as a second column of UI with nothing in it.
        overflow: "visible",
      }}
    >
      {positionedNodes.map((node) => {
        const isNearest = previewOpen && nearestNode?.index === node.index;
        const isActive = activeIndex === node.index;

        return (
          <div
            key={node.index}
            data-minimap-node-index={node.index}
            data-minimap-node-active={isActive ? "" : undefined}
            style={{
              position: "absolute",
              top: `${node.topRatio * 100}%`,
              transform: "translateY(-50%)",
              left: 0,
              right: 0,
              height: Math.max(1, nodeGap),
              display: "flex",
              alignItems: "center",
              // The 24px-wide row and its tick pitch are the hit area, not just the 2px line.
              pointerEvents: "auto",
              zIndex: 2,
            }}
          >
            <span
              className={styles.tick}
              data-level={node.level}
              data-active={isActive ? "" : undefined}
              data-nearest={isNearest ? "" : undefined}
            />
          </div>
        );
      })}

      {previewOpen && previewTurns.length > 0 && (
        <div
          ref={previewBoxRef}
          className={styles.preview}
          data-minimap-preview-box=""
          onMouseDown={(event) => event.stopPropagation()}
          onMouseMove={(event) => event.stopPropagation()}
        >
          {previewTurns.map((group) => {
            const isLocated = nearestTurnIndex === group.turnIndex;
            return (
              <div
                key={group.turnIndex}
                ref={(element) => {
                  if (element) previewItemRefs.current.set(group.turnIndex, element);
                  else previewItemRefs.current.delete(group.turnIndex);
                }}
                className={styles.turn}
                data-minimap-preview-index={group.turnIndex}
                data-located={isLocated ? "true" : undefined}
              >
                <div className={styles.turnHead}>
                  <span className={styles.number} data-minimap-turn-number="">
                    <span aria-hidden="true">
                      {String(group.turnIndex + 1).padStart(2, "0")}
                    </span>
                    {group.header.turn.toolCount > 0 && (
                      <span
                        className={styles.toolBadge}
                        role="img"
                        title={t("chatMinimap.toolCalls", { count: group.header.turn.toolCount })}
                        aria-label={t("chatMinimap.toolCalls", { count: group.header.turn.toolCount })}
                      >
                        {group.header.turn.toolCount > 99 ? "99+" : group.header.turn.toolCount}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className={styles.turnText}
                    data-minimap-preview-user={group.turnIndex}
                    title={group.header.turn.userPreview || undefined}
                    onClick={() => scrollToNode(group.header)}
                  >
                    {/* No prompt to name the turn: the window starts above the loaded entries. */}
                    {group.header.turn.userPreview || "…"}
                  </button>
                </div>

                {group.header.turn.assistantPreviews.map((answer, assistantIndex) => {
                  const answerNodes = group.nodes.filter(
                    (node) => node.assistantIndex === assistantIndex,
                  );
                  const proseNode = answerNodes.find((node) => node.headingIndex === null);
                  return (
                    <AssistantOutline
                      key={assistantIndex}
                      markdown={answer.markdown}
                      onAnswerClick={proseNode ? () => scrollToNode(proseNode) : undefined}
                      onHeadingClick={(headingIndex) => {
                        const headingNode = answerNodes.find(
                          (node) => node.headingIndex === headingIndex,
                        );
                        if (headingNode) scrollToNode(headingNode);
                      }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Hook to create a stable array of refs for messages
export function useMessageRefs(count: number): RefObject<(HTMLDivElement | null)[]> {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  refs.current = Array(count).fill(null).map((_, i) => refs.current[i] ?? null);
  return refs;
}
