// Types mirrored from pi-mono coding-agent session-manager

export interface SessionHeader {
  type: "session";
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
}

export interface SessionEntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  source: {
    type: "base64" | "url";
    media_type?: string;
    data?: string;
    url?: string;
  };
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  /** Historical content omitted from the initial response and loaded on demand. */
  deferred?: boolean;
}

export interface ToolCallContent {
  type: "toolCall";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  /** Client-only buffer for streamed tool input. Never persisted to session files. */
  rawInput?: string;
}

export type AssistantContentBlock = TextContent | ImageContent | ThinkingContent | ToolCallContent;

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp?: number;
}

export interface AgentUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface AssistantMessage {
  role: "assistant";
  content: AssistantContentBlock[];
  model: string;
  provider: string;
  stopReason?: string;
  errorMessage?: string;
  timestamp?: number;
  usage?: AgentUsage;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName?: string;
  content: (TextContent | ImageContent)[];
  isError?: boolean;
  details?: unknown;
  timestamp?: number;
  usage?: AgentUsage;
}

export interface CustomMessage {
  role: "custom";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  display: boolean;
  details?: unknown;
  timestamp?: number;
}

export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  timestamp?: number;
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage | CustomMessage | BashExecutionMessage;

export type ExtensionUiRequest =
  | {
      type: "extension_ui_request";
      id: string;
      method: "select";
      title: string;
      options: string[];
      timeout?: number;
      expiresAt?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "confirm";
      title: string;
      message: string;
      timeout?: number;
      expiresAt?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "input";
      title: string;
      placeholder?: string;
      timeout?: number;
      expiresAt?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "editor";
      title: string;
      prefill?: string;
      timeout?: number;
      expiresAt?: number;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "notify";
      message: string;
      notifyType?: "info" | "warning" | "error";
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "setStatus";
      statusKey: string;
      statusText?: string;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "setWidget";
      widgetKey: string;
      widgetLines?: string[];
      widgetPlacement?: "aboveEditor" | "belowEditor";
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "setTitle";
      title: string;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "set_editor_text";
      text: string;
    }
  | {
      type: "extension_ui_request";
      id: string;
      method: "custom";
      lines: string[];
      closed?: boolean;
    };

export type BlockingExtensionUiRequest = Extract<
  ExtensionUiRequest,
  { method: "select" | "confirm" | "input" | "editor" | "custom" }
>;

export type ExtensionUiResponse =
  | { type: "extension_ui_response"; id: string; value: string }
  | { type: "extension_ui_response"; id: string; confirmed: boolean }
  | { type: "extension_ui_response"; id: string; cancelled: true };

export interface ExtensionStatusItem {
  key: string;
  text: string;
}

export interface ExtensionWidgetItem {
  key: string;
  lines: string[];
  placement: "aboveEditor" | "belowEditor";
}

// ---------------------------------------------------------------------------
// ask_user support
// Mirrors lib/ask-user/types.ts so the browser can import these without
// pulling in server-only modules.
// ---------------------------------------------------------------------------

export interface AskUserQuestionOption {
  value: string;
  label: string;
  detail?: string;
}

export interface AskUserQuestion {
  id: string;
  question: string;
  detail?: string;
  options: AskUserQuestionOption[];
  multiple?: boolean;
}

export interface PendingAskUser {
  askId: string;
  askedAt: string;
  questions: AskUserQuestion[];
}

export interface AskUserAnswer {
  id: string;
  values: string[];
  otherText?: string;
}

export interface AskUserSubmission {
  answers: AskUserAnswer[];
}

export type AskUserCloseReason = "submitted" | "superseded" | "cancelled";

export interface AskUserQuestionRecord {
  question: AskUserQuestion;
  answered: boolean;
  values: string[];
  otherText?: string;
}

export interface AskUserOutcome {
  askId: string;
  reason: AskUserCloseReason;
  askedAt: string;
  closedAt: string;
  questions: AskUserQuestionRecord[];
  answeredCount: number;
  unansweredIds: string[];
  summary: string;
}

export type AskUserCloseResponse =
  | { result: "closed"; outcome: AskUserOutcome; pendingAsk?: PendingAskUser }
  | { result: "stale"; pendingAsk?: PendingAskUser };

export type AskUserEvent =
  | { type: "ask.opened"; ask: PendingAskUser }
  | { type: "ask.closed"; askId: string; reason: AskUserCloseReason };

export interface SessionMessageEntry extends SessionEntryBase {
  type: "message";
  message: AgentMessage;
}

export interface ThinkingLevelChangeEntry extends SessionEntryBase {
  type: "thinking_level_change";
  thinkingLevel: string;
}

export interface ModelChangeEntry extends SessionEntryBase {
  type: "model_change";
  provider: string;
  modelId: string;
}

export interface CompactionEntry extends SessionEntryBase {
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
  fromHook?: boolean;
  usage?: AgentUsage;
}

export interface BranchSummaryEntry extends SessionEntryBase {
  type: "branch_summary";
  fromId: string;
  summary: string;
  details?: unknown;
  fromHook?: boolean;
  usage?: AgentUsage;
}

export interface CustomEntry extends SessionEntryBase {
  type: "custom";
  customType: string;
  data?: unknown;
}

export interface CustomMessageEntry extends SessionEntryBase {
  type: "custom_message";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  details?: unknown;
  display: boolean;
}

export interface LabelEntry extends SessionEntryBase {
  type: "label";
  targetId: string;
  label: string | undefined;
}

export interface SessionInfoEntry extends SessionEntryBase {
  type: "session_info";
  name?: string;
}

export type SessionEntry =
  | SessionMessageEntry
  | ThinkingLevelChangeEntry
  | ModelChangeEntry
  | CompactionEntry
  | BranchSummaryEntry
  | CustomEntry
  | CustomMessageEntry
  | LabelEntry
  | SessionInfoEntry;

export type FileEntry = SessionHeader | SessionEntry;

export interface BranchPreview {
  role?: "user" | "assistant";
  text: string;
}

export type SubagentSessionStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "aborted"
  | "interrupted";

export interface SessionTreeNode {
  entry: SessionEntry;
  children: SessionTreeNode[];
  label?: string;
  compressedEntryIds?: string[];
  branchPreview?: BranchPreview;
}

export interface SessionInfo {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId?: string; // source session for a fork, or parent session for a subagent
  /** How this session relates to another session. Forks remain top-level in the
   *  UI; only subagent relations form a visible parent/child tree. */
  relation?:
    | { kind: "fork"; originSessionId?: string }
    | {
        kind: "subagent";
        parentSessionId: string;
        profile: string;
        description: string;
        status: SubagentSessionStatus;
      };
  /** Main repo root shared by all worktrees of this cwd (cwd itself for non-git dirs).
   *  Always set by the server; optional because the client builds transient
   *  SessionInfo objects before the first refresh. Fall back to cwd. */
  projectRoot?: string;
  /** Stable server-computed project identity for grouping and comparison.
   *  Unlike projectRoot, Windows keys are case- and separator-insensitive.
   *  Internal only: use projectRoot/cwd for display and filesystem operations. */
  projectKey?: string;
  /** Current git branch for any git repo (undefined for non-git or detached HEAD) */
  branch?: string;
  /** True when cwd is a linked git worktree (not the main checkout) */
  isWorktree?: boolean;
  /** Branch name when cwd is a linked git worktree (not the main checkout) */
  worktreeBranch?: string;
  /** True while the runtime session exists only in memory and its JSONL file
   *  has not been created yet. Disk-backed actions must wait until this clears. */
  transient?: boolean;
}

export interface SessionContext {
  messages: AgentMessage[];
  entryIds: string[]; // parallel to messages — the session entry id for each message
  oldestEntryId: string | null;
  hasMore: boolean;
  thinkingLevel: string;
  model: { provider: string; modelId: string } | null;
}

/** Lightweight per-project summary for the sidebar's first-load request.
 *  Carries the full session id set (not the summaries) so the client can
 *  compute cross-project unread/running counts and prune stale unread marks
 *  without downloading every session's firstMessage etc. */
export interface ProjectSummary {
  /** Stable server-computed project identity (projectKey). */
  key: string;
  /** projectRoot of the most recently active session (display path). */
  root: string;
  /** Latest session modified timestamp in the project (sort key). */
  modified: string;
  sessionCount: number;
  sessionIds: string[];
  /** Count of running sessions in this project (server-computed). */
  runningCount: number;
}
